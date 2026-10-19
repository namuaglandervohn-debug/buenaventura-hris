import assert from 'node:assert/strict';
import test from 'node:test';
import { createHiredAccountHandler } from '../api/applications/hired-account.js';
import { apiErrorMessage } from '../resources/ts/app/lib/apiError.ts';

function fixture() {
  const actor = { id: 'admin-auth', email: 'hr@company.com' };
  const state = {
    profiles: [{ user_id: 'HR-1', auth_user_id: actor.id, email: actor.email, is_active: true, role: 'hr_admin' }],
    employees: [{ employee_id: 'EMP-2026-0001' }],
    authUsers: [], mutations: [], pages: [], failProfile: false,
  };
  const ok = (data) => ({ data, error: null });
  const client = {
    auth: {
      getUser: async (token) => token === 'valid-token' ? ok({ user: actor }) : { data: {}, error: new Error('Invalid token') },
      admin: {
        async listUsers({ page, perPage }) {
          state.pages.push(page);
          return ok({ users: state.authUsers.slice((page - 1) * perPage, page * perPage) });
        },
        async getUserById(id) { return ok({ user: state.authUsers.find((user) => user.id === id) ?? null }); },
        async createUser(payload) {
          state.mutations.push('create');
          const user = { ...payload, id: `auth-${state.authUsers.length + 1}` };
          state.authUsers.push(user);
          return ok({ user });
        },
        async updateUserById(id, payload) {
          state.mutations.push('reset');
          const user = state.authUsers.find((user) => user.id === id);
          Object.assign(user, payload);
          return ok({ user });
        },
      },
    },
    from(table) {
      const filters = {};
      let mutation;
      let payload;
      const execute = () => {
        const rows = table === 'employees' ? state.employees : state.profiles;
        const matches = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (mutation) {
          if (state.failProfile) return { data: null, error: new Error('Profile save failed') };
          if (mutation === 'insert') { rows.push(payload); return ok(payload); }
          Object.assign(matches[0], payload);
          return ok(matches[0]);
        }
        return matches.length > 1 ? { data: null, error: new Error('Multiple profiles') } : ok(matches[0] ?? null);
      };
      return {
        select() { return this; }, eq(key, value) { filters[key] = value; return this; }, is(key, value) { filters[key] = value; return this; },
        insert(value) { mutation = 'insert'; payload = value; return this; },
        update(value) { mutation = 'update'; payload = value; return this; },
        async maybeSingle() { return execute(); }, async single() { return execute(); },
      };
    },
  };
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' };
  const handler = createHiredAccountHandler({ env, clientFactory: () => client });
  const body = { employee_id: 'EMP-2026-0001', name: 'New Employee', email: 'new.employee@company.com', password: 'TemporaryPass123', first_name: 'New', last_name: 'Employee' };
  const invoke = async (overrides = {}, useHandler = handler) => {
    const response = {
      headers: {}, status(code) { this.statusCode = code; return this; },
      setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); },
    };
    await useHandler({ method: 'POST', headers: { authorization: 'Bearer valid-token' }, body, ...overrides }, response);
    return response;
  };
  return { state, body, invoke, client };
}

test('creates an Auth user and linked employee profile; never returns the password or service key', async () => {
  const f = fixture();
  const response = await f.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.email, f.body.email);
  assert.equal(response.body.auth_user_id, 'auth-1');
  assert.equal(f.state.profiles.at(-1).password, null);
  assert.match(response.body.user.user_id, /^USR-\d{4}-[A-F0-9]{16}$/);
  assert.ok(!JSON.stringify(response.body).includes(f.body.password));
  assert.ok(!JSON.stringify(response.body).includes('server-secret'));
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('reset reuses the same Auth user, profile and original email', async () => {
  const f = fixture();
  const first = await f.invoke();
  f.body.email = 'different.request@company.com';
  const second = await f.invoke();
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.auth_user_id, first.body.auth_user_id);
  assert.equal(second.body.user.email, 'new.employee@company.com');
  assert.equal(f.state.authUsers.length, 1);
  assert.equal(f.state.profiles.length, 2);
  assert.deepEqual(f.state.mutations, ['create', 'reset']);
});

test('a retry recovers an Auth user after profile saving failed', async () => {
  const f = fixture();
  f.state.failProfile = true;
  assert.equal((await f.invoke()).statusCode, 502);
  assert.equal(f.state.authUsers.length, 1);
  f.state.failProfile = false;
  assert.equal((await f.invoke()).statusCode, 200);
  assert.equal(f.state.authUsers.length, 1);
  assert.deepEqual(f.state.mutations, ['create', 'reset']);
});

test('rejects missing/expired sessions and non-admin callers before modifying Auth', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ headers: {} })).statusCode, 401);
  assert.equal((await f.invoke({ headers: { authorization: 'Bearer expired' } })).statusCode, 401);
  f.state.profiles[0].role = 'employee';
  assert.equal((await f.invoke()).statusCode, 403);
  assert.deepEqual(f.state.mutations, []);
});

test('missing hosting configuration gives an actionable error', async () => {
  const f = fixture();
  const handler = createHiredAccountHandler({ env: {} });
  const response = await f.invoke({}, handler);
  assert.equal(response.statusCode, 503);
  assert.match(response.body.message, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('validates request method, body, password and saved employee', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ method: 'GET' })).statusCode, 405);
  assert.equal((await f.invoke({ body: '{invalid' })).statusCode, 400);
  assert.equal((await f.invoke({ body: { ...f.body, password: 'short' } })).statusCode, 422);
  f.state.employees = [];
  assert.equal((await f.invoke()).statusCode, 422);
  assert.deepEqual(f.state.mutations, []);
});

test('same-name/email conflicts never reset a different employee or admin account', async () => {
  const f = fixture();
  f.state.profiles.push({ user_id: 'OTHER', email: f.body.email, role: 'hr_admin', employee_id: 'OTHER-EMPLOYEE' });
  assert.equal((await f.invoke()).statusCode, 409);
  assert.deepEqual(f.state.mutations, []);
});

test('an Auth-only email belonging to someone else is not reset', async () => {
  const f = fixture();
  f.state.authUsers.push({ id: 'other-auth', email: f.body.email, user_metadata: { employee_id: 'OTHER' } });
  assert.equal((await f.invoke()).statusCode, 409);
  assert.deepEqual(f.state.mutations, []);
});

test('finds retryable Auth accounts beyond the first 1000 users', async () => {
  const f = fixture();
  f.state.authUsers = Array.from({ length: 1000 }, (_, index) => ({ id: `dummy-${index}`, email: `dummy${index}@company.com` }));
  f.state.authUsers.push({ id: 'existing-auth', email: f.body.email, user_metadata: { employee_id: f.body.employee_id } });
  const response = await f.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.auth_user_id, 'existing-auth');
  assert.deepEqual(f.state.pages, [1, 2]);
  assert.deepEqual(f.state.mutations, ['reset']);
});

test('frontend surfaces Laravel validation and unavailable endpoint errors', () => {
  assert.equal(apiErrorMessage({ message: 'Validation failed', errors: { email: ['Email already exists.'] } }, 422, 'Fallback'), 'Email already exists.');
  assert.match(apiErrorMessage(null, 404, 'Fallback'), /Deploy the account API endpoint/);
  assert.equal(apiErrorMessage({ message: 'Password is too weak.' }, 422, 'Fallback'), 'Password is too weak.');
});
