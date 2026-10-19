import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthSession, loadAuthProfile, normalizeAppRole } from '../resources/ts/app/lib/authSession.ts';
import { createTabAuthOptions } from '../resources/ts/app/lib/authStorage.ts';
import { createClient } from '@supabase/supabase-js';

const hr = { id: 'auth-hr', email: 'hr@company.com' };
const gm = { id: 'auth-gm', email: 'gm@company.com' };
const profile = (user, role) => ({ user_id: `profile-${role}`, auth_user_id: user.id, email: user.email, full_name: role, role, is_active: true });
const hrProfile = profile(hr, 'hr');
const gmProfile = profile(gm, 'gm');
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise((done) => setTimeout(done, 5));

function harness({ restored = null, rows = [hrProfile, gmProfile], getSession, queryResult, signIn, signOut } = {}) {
  let listener = () => {};
  const states = [];
  const queries = [];
  const authCalls = [];
  const emit = (event, user) => listener(event, user ? { user } : null);
  const client = {
    auth: {
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() { listener = () => {}; } } } };
      },
      getSession: getSession ?? (async () => ({ data: { session: restored ? { user: restored } : null }, error: null })),
      async signInWithPassword(credentials) {
        authCalls.push(['login', credentials.email]);
        if (signIn) await signIn();
        const user = credentials.email === hr.email ? hr : gm;
        emit('SIGNED_IN', user);
        return { data: { user }, error: null };
      },
      async signOut(options) {
        authCalls.push(['logout', options]);
        if (signOut) await signOut();
        emit('SIGNED_OUT');
        return { error: null };
      },
    },
    from(table) {
      assert.equal(table, 'user_accounts');
      const filters = {};
      return {
        select(columns) { assert.ok(!columns.includes('*')); return this; },
        eq(key, value) { filters[key] = value; return this; },
        is(key, value) { filters[key] = value; return this; },
        async maybeSingle() {
          queries.push({ ...filters });
          if (queryResult) return queryResult(filters);
          const matches = rows.filter((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          return matches.length > 1 ? { data: null, error: new Error('Ambiguous profiles') } : { data: matches[0] ?? null, error: null };
        },
      };
    },
  };
  const session = createAuthSession(client, (state) => states.push(state));
  const latest = () => states.at(-1);
  return { session, client, states, queries, authCalls, latest, emit };
}

test('login and its SIGNED_IN event perform one profile query; focus/refresh preserve the role', async () => {
  const h = harness();
  h.session.start();
  await tick();
  await h.session.login(' HR@company.com ', 'password');
  h.emit('SIGNED_IN', hr);
  h.emit('TOKEN_REFRESHED', hr);
  h.emit('USER_UPDATED', hr);
  await tick();
  assert.equal(h.latest().user.role, 'hr');
  assert.equal(h.latest().loading, false);
  assert.equal(h.queries.length, 1);
  assert.equal(h.authCalls[0][1], hr.email);
  h.session.stop();
});

test('a slow GM restore cannot overwrite a completed HR login', async () => {
  const slow = deferred();
  const h = harness({ restored: gm, queryResult: (filters) => filters.auth_user_id === gm.id ? slow.promise : { data: hrProfile, error: null } });
  h.session.start();
  await tick();
  await h.session.login(hr.email, 'password');
  slow.resolve({ data: gmProfile, error: null });
  await tick();
  assert.equal(h.latest().user.role, 'hr');
  assert.ok(!h.states.some((state) => state.user?.role === 'gm'));
  h.session.stop();
});

test('a slow getSession response cannot replace a new login', async () => {
  const slow = deferred();
  const h = harness({ getSession: () => slow.promise });
  h.session.start();
  await h.session.login(hr.email, 'password');
  slow.resolve({ data: { session: { user: gm } }, error: null });
  await tick();
  assert.equal(h.latest().user.role, 'hr');
  assert.equal(h.queries.length, 1);
  h.session.stop();
});

test('logout cancels a pending profile lookup and blocks stale auth events', async () => {
  const slow = deferred();
  const h = harness({ restored: gm, queryResult: () => slow.promise });
  h.session.start();
  await tick();
  h.session.logout();
  h.emit('SIGNED_IN', gm);
  slow.resolve({ data: gmProfile, error: null });
  await tick();
  assert.deepEqual(h.latest(), { user: null, loading: false });
  assert.ok(!h.states.some((state) => state.user));
  h.session.stop();
});

test('double submission starts only one authentication request', async () => {
  const slow = deferred();
  const h = harness({ signIn: () => slow.promise });
  h.session.start();
  const first = h.session.login(hr.email, 'password');
  await assert.rejects(h.session.login(gm.email, 'password'), /already in progress/);
  slow.resolve();
  await first;
  assert.equal(h.authCalls.filter(([action]) => action === 'login').length, 1);
  assert.equal(h.latest().user.role, 'hr');
  h.session.stop();
});

test('a pending sign-out finishes before the next sign-in starts', async () => {
  const slow = deferred();
  const h = harness({ signOut: () => slow.promise });
  h.session.start();
  await tick();
  h.session.logout();
  const login = h.session.login(hr.email, 'password');
  await tick();
  assert.deepEqual(h.authCalls, [['logout', { scope: 'local' }]]);
  slow.resolve();
  await login;
  assert.equal(h.latest().user.role, 'hr');
  h.session.stop();
});

test('logout during sign-in cancels login and cannot resurrect the user', async () => {
  const slow = deferred();
  const h = harness({ signIn: () => slow.promise });
  h.session.start();
  const login = h.session.login(hr.email, 'password');
  const cancelled = assert.rejects(login, /cancelled/);
  await tick();
  h.session.logout();
  slow.resolve();
  await cancelled;
  await tick();
  assert.equal(h.latest().user, null);
  assert.deepEqual(h.authCalls.map(([action]) => action), ['login', 'logout']);
  h.session.stop();
});

test('a different identity event signs out instead of transferring roles', async () => {
  const h = harness();
  h.session.start();
  await h.session.login(hr.email, 'password');
  h.emit('SIGNED_IN', gm);
  await tick();
  assert.equal(h.latest().user, null);
  assert.ok(!h.states.some((state) => state.user?.role === 'gm'));
  h.session.stop();
});

test('failed profile lookup clears authentication without displaying an old role', async () => {
  const h = harness({ rows: [] });
  h.session.start();
  await assert.rejects(h.session.login(hr.email, 'password'), /active matching HRIS account/);
  assert.deepEqual(h.latest(), { user: null, loading: false });
  assert.equal(h.authCalls.at(-1)[0], 'logout');
  h.session.stop();
});

test('profile resolution prioritizes auth ID and never falls back to another linked identity', async () => {
  const h = harness({ rows: [{ ...hrProfile, auth_user_id: gm.id }] });
  await assert.rejects(loadAuthProfile(h.client, hr), /active matching HRIS account/);
  assert.deepEqual(h.queries, [
    { is_active: true, auth_user_id: hr.id },
    { is_active: true, email: hr.email, auth_user_id: null },
  ]);
});

test('legacy unlinked accounts work, while mismatched emails and ambiguous profiles fail closed', async () => {
  const legacy = harness({ rows: [{ ...hrProfile, auth_user_id: null }] });
  assert.equal((await loadAuthProfile(legacy.client, hr)).role, 'hr');
  const mismatch = harness({ rows: [{ ...hrProfile, email: gm.email }] });
  await assert.rejects(loadAuthProfile(mismatch.client, hr), /active matching/);
  const ambiguous = harness({ rows: [hrProfile, hrProfile] });
  await assert.rejects(loadAuthProfile(ambiguous.client, hr), /Ambiguous/);
});

test('role aliases resolve consistently and unknown roles cannot default to HR', () => {
  assert.equal(normalizeAppRole('hr_admin'), 'hr');
  assert.equal(normalizeAppRole('general_manager'), 'gm');
  assert.equal(normalizeAppRole('accounting_finance'), 'accounting');
  assert.throws(() => normalizeAppRole('unknown'), /supported HRIS role/);
  assert.throws(() => normalizeAppRole(null), /supported HRIS role/);
});

test('unmount invalidates a pending restore and unsubscribes from events', async () => {
  const slow = deferred();
  const h = harness({ getSession: () => slow.promise });
  h.session.start();
  h.session.stop();
  const count = h.states.length;
  slow.resolve({ data: { session: { user: gm } }, error: null });
  h.emit('SIGNED_IN', gm);
  await tick();
  assert.equal(h.states.length, count);
});

test('tabs isolate both token storage and broadcast channels; reload retains only that tab session', () => {
  const memoryStorage = () => {
    const data = new Map();
    return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
  };
  const tabA = memoryStorage();
  const a = createTabAuthOptions(tabA);
  const b = createTabAuthOptions(memoryStorage());
  a.storage.setItem(a.storageKey, 'HR tokens');
  b.storage.setItem(b.storageKey, 'GM tokens');
  assert.notEqual(a.storageKey, b.storageKey);
  assert.equal(a.storage.getItem(a.storageKey), 'HR tokens');
  assert.equal(b.storage.getItem(b.storageKey), 'GM tokens');
  const reloadedA = createTabAuthOptions(tabA);
  assert.notEqual(a.storageKey, reloadedA.storageKey);
  assert.equal(reloadedA.storage.getItem(reloadedA.storageKey), 'HR tokens');
  reloadedA.storage.removeItem(reloadedA.storageKey);
  assert.equal(b.storage.getItem(b.storageKey), 'GM tokens');
});

test('installed Supabase SDK completes HR/GM login with one profile request each and separate tokens', { timeout: 5000 }, async () => {
  const requests = [];
  const tokenFor = (user) => {
    const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  };
  const fetch = async (input, options = {}) => {
    const url = new URL(input);
    requests.push(url.pathname);
    if (url.pathname.endsWith('/token')) {
      const credentials = JSON.parse(options.body);
      const user = credentials.email === hr.email ? hr : gm;
      return Response.json({ access_token: tokenFor(user), refresh_token: `refresh-${user.id}`, expires_in: 3600, token_type: 'bearer', user });
    }
    if (url.pathname.endsWith('/user_accounts')) {
      const user = url.searchParams.get('auth_user_id') === `eq.${hr.id}` ? hr : gm;
      assert.equal(new Headers(options.headers).get('Authorization'), `Bearer ${tokenFor(user)}`);
      return Response.json([user === hr ? hrProfile : gmProfile]);
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  };
  const makeClient = () => {
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
    return createClient('https://auth-test.invalid', 'test-anon-key', { auth: { ...createTabAuthOptions(storage), autoRefreshToken: false }, global: { fetch } });
  };
  const hrClient = makeClient();
  const gmClient = makeClient();
  let hrState;
  let gmState;
  const hrSession = createAuthSession(hrClient, (state) => { hrState = state; });
  const gmSession = createAuthSession(gmClient, (state) => { gmState = state; });
  hrSession.start();
  gmSession.start();
  try {
    await Promise.all([hrSession.login(hr.email, 'password'), gmSession.login(gm.email, 'password')]);
    assert.equal(hrState.user.role, 'hr');
    assert.equal(gmState.user.role, 'gm');
    assert.equal((await hrClient.auth.getSession()).data.session.user.id, hr.id);
    assert.equal((await gmClient.auth.getSession()).data.session.user.id, gm.id);
    assert.equal(requests.filter((path) => path.endsWith('/token')).length, 2);
    assert.equal(requests.filter((path) => path.endsWith('/user_accounts')).length, 2);
  } finally {
    hrSession.stop();
    gmSession.stop();
    hrClient.auth.stopAutoRefresh();
    gmClient.auth.stopAutoRefresh();
  }
});
