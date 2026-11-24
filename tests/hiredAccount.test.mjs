import assert from 'node:assert/strict';
import test from 'node:test';
import { createHiredAccountHandler } from '../api/applications/hired-account.js';
import { apiErrorMessage } from '../resources/ts/app/lib/apiError.ts';

function fixture() {
  const actor = { id: 'admin-auth', email: 'hr@company.com' };
  const state = {
    profiles: [{ user_id: 'HR-1', auth_user_id: actor.id, email: actor.email, is_active: true, role: 'hr_admin' }],
    employees: [{ employee_id: 'EMP-2026-0001', applicant_id: 'APP-2026-0001' }],
    applicants: [{ applicant_id: 'APP-2026-0001', auth_user_id: 'applicant-auth', email: 'applicant@example.test', name: 'New <Employee>', first_name: 'New', last_name: 'Employee', status: 'Hired' }],
    mail: [], mailStatus: 200,
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
        async generateLink({ type, email, options }) {
          assert.equal(type, 'recovery');
          assert.ok(state.authUsers.some(user => user.email === email));
          assert.equal(options.redirectTo, 'https://hris.example.test/applicant');
          return ok({ properties: { action_link: 'https://example.invalid/verify?token=fixture&type=recovery' } });
        },
        async createUser(payload) {
          state.mutations.push('create');
          if (state.authUsers.some(user => user.email === payload.email)) return { error: { code: 'email_exists' } };
          const user = { ...payload, id: `auth-${state.authUsers.length + 1}` };
          state.authUsers.push(user);
          return ok({ user });
        },
        async deleteUser(id) { state.authUsers = state.authUsers.filter(user => user.id !== id); return ok({}); },
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
        const rows = table === 'employees' ? state.employees : table === 'applicants' ? state.applicants : state.profiles;
        const matches = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
        if (mutation) {
          if (state.failProfile) return { data: null, error: new Error('Profile save failed') };
          if (mutation === 'insert') {
            assert.equal(payload.user_id, undefined);
            const saved = { ...payload, user_id: 'USR-2026-0001' };
            rows.push(saved);
            return ok(saved);
          }
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
  const env = { APP_URL: 'https://hris.example.test', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'server-secret', RESEND_API_KEY: 'test-mail' };
  const handler = createHiredAccountHandler({ env, clientFactory: () => client, fetcher: async (_url, request) => {
    state.mail.push({ ...JSON.parse(request.body), key: request.headers['Idempotency-Key'] });
    return Response.json({ id: 'test-mail' }, { status: state.mailStatus });
  } });
  const body = { applicant_id: 'APP-2026-0001' };
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

test('creates a separate employee identity and emails the original applicant address', async () => {
  const f = fixture();
  const response = await f.invoke({ body: { ...f.body, email: 'ignored@example.test', password: 'ignored' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.user.email, 'employee.new@buenaventura.com');
  assert.equal(response.body.user.user_id, 'USR-2026-0001');
  assert.equal(f.state.applicants[0].auth_user_id, 'applicant-auth');
  assert.equal(f.state.authUsers[0].app_metadata.hris_temporary_password, true);
  assert.deepEqual(f.state.mail[0].to, ['applicant@example.test']);
  assert.match(f.state.mail[0].html, /Hello New &lt;Employee&gt;!/);
  assert.match(f.state.mail[0].html, /#1ea44e/);
  assert.match(f.state.mail[0].text, /token=fixture&type=recovery/);
  assert.doesNotMatch(f.state.mail[0].html, /Temporary password/);
  assert.ok(!f.state.mail[0].text.includes(f.state.authUsers[0].password));
  const status = await f.invoke({ body: { ...f.body, action: 'status' } });
  assert.equal(status.body.account_ready, true);
  assert.equal(status.body.password_set, false);
  assert.ok(status.body.setup_email_sent_at);
  assert.equal(f.state.mail.length, 1);
  assert.ok(!JSON.stringify(response.body).includes(f.state.authUsers[0].password));
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('repairs an earlier conversion without touching the original applicant login', async () => {
  const f = fixture();
  f.state.profiles.push({ user_id: 'existing', employee_id: 'EMP-2026-0001', applicant_id: f.body.applicant_id,
    auth_user_id: 'applicant-auth', email: 'applicant@example.test', role: 'employee', is_active: true });
  const response = await f.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(f.state.profiles.at(-1).user_id, 'existing');
  assert.notEqual(f.state.profiles.at(-1).auth_user_id, 'applicant-auth');
  assert.deepEqual(f.state.mutations, ['create']);
});

test('emails sign-in details to repeat hires without changing the existing login', async () => {
  const f = fixture();
  const email = 'employee.new@buenaventura.com';
  f.state.authUsers.push({ id: 'existing-auth', email, app_metadata: { hris_hired_application: 'APP-PRIOR' } });
  f.state.profiles.push({ user_id: 'existing', employee_id: 'EMP-2026-0001',
    auth_user_id: 'existing-auth', email, role: 'employee', is_active: true });
  const response = await f.invoke();
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.welcome_email_sent, true);
  assert.equal(response.body.user.auth_user_id, 'existing-auth');
  assert.deepEqual(f.state.mutations, []);
  assert.equal(f.state.mail.length, 1);
  assert.deepEqual(f.state.mail[0].to, ['applicant@example.test']);
  assert.match(f.state.mail[0].html, /employee\.new@buenaventura\.com/);
  assert.match(f.state.mail[0].html, /Use your current employee password/);
  assert.doesNotMatch(f.state.mail[0].html, /Temporary password/);
  assert.match(f.state.mail[0].key, /^hired-welcome\/APP-2026-0001\//);
});

test('provider retries share a delivery key and a later resend keeps the same account', async () => {
  const f = fixture();
  f.state.mailStatus = 502;
  assert.equal((await f.invoke()).body.welcome_email_sent, false);
  assert.equal(f.state.mail.length, 2);
  f.state.mailStatus = 200;
  assert.equal((await f.invoke()).body.welcome_email_sent, true);
  assert.deepEqual(f.state.mail[0], f.state.mail[1]);
  assert.notEqual(f.state.mail[1].key, f.state.mail[2].key);
  assert.deepEqual(f.state.mutations, ['create']);
  f.state.authUsers[0].app_metadata.hris_temporary_password = false;
  assert.equal((await f.invoke()).body.welcome_email_sent, true);
  assert.equal(f.state.mail.length, 4);
  assert.doesNotMatch(f.state.mail[3].text, /Temporary password:/);
});

test('email collisions receive a numbered company login', async () => {
  const f = fixture();
  f.state.authUsers.push({ id: 'other', email: 'employee.new@buenaventura.com' });
  assert.equal((await f.invoke()).body.user.email, 'employee.new.2@buenaventura.com');
  assert.equal(f.state.authUsers[0].id, 'other');
});

test('rejects unauthorized callers and applications without a final hire', async () => {
  const f = fixture();
  assert.equal((await f.invoke({ headers: {} })).statusCode, 401);
  f.state.profiles[0].role = 'employee';
  assert.equal((await f.invoke()).statusCode, 403);
  f.state.profiles[0].role = 'general_manager';
  f.state.applicants[0].status = 'For Interview';
  assert.equal((await f.invoke()).statusCode, 409);
  assert.deepEqual(f.state.mutations, []);
});

test('frontend surfaces Laravel validation and unavailable endpoint errors', () => {
  assert.equal(apiErrorMessage({ message: 'Validation failed', errors: { email: ['Email already exists.'] } }, 422, 'Fallback'), 'Email already exists.');
  assert.match(apiErrorMessage(null, 404, 'Fallback'), /Deploy the account API endpoint/);
  assert.equal(apiErrorMessage({ message: 'Password is too weak.' }, 422, 'Fallback'), 'Password is too weak.');
});
