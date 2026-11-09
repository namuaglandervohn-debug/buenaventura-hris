import type { SupabaseClient, User } from '@supabase/supabase-js';

export type UserRole = 'hr' | 'hr_admin' | 'employee' | 'supervisor' | 'gm' | 'general_manager' | 'accounting' | 'accounting_finance' | string;
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  outlet?: string | null;
}

export function normalizeAppRole(role: unknown): UserRole {
  const normalized = String(role ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = { hr_admin: 'hr', admin: 'hr', general_manager: 'gm', accounting_finance: 'accounting', finance: 'accounting' };
  const result = aliases[normalized] ?? normalized;
  if (!['hr', 'employee', 'supervisor', 'gm', 'accounting'].includes(result)) {
    throw new Error('This account does not have a supported HRIS role. Please contact HR.');
  }
  return result;
}

type Client = Pick<SupabaseClient, 'auth' | 'from'>;
const PROFILE_COLUMNS = 'user_id, auth_user_id, full_name, email, role, employee_id, outlet';

export async function loadAuthProfile(client: Client, authUser: Pick<User, 'id' | 'email'>): Promise<AuthUser> {
  const email = String(authUser.email ?? '').trim().toLowerCase();
  if (!authUser.id || !email) throw new Error('The login session has no valid account identity.');
  const query = () => client.from('user_accounts').select(PROFILE_COLUMNS).eq('is_active', true);
  const linked = await query().eq('auth_user_id', authUser.id).maybeSingle();
  if (linked.error) throw linked.error;
  let account = linked.data;
  if (!account) {
    // Legacy profiles may be unlinked. Never use a profile linked to someone else,
    // and never change account links as a side effect of signing in.
    const legacy = await query().eq('email', email).is('auth_user_id', null).maybeSingle();
    if (legacy.error) throw legacy.error;
    account = legacy.data;
  }
  if (!account || String(account.email).trim().toLowerCase() !== email) {
    throw new Error('This login is not linked to an active matching HRIS account. Please contact HR.');
  }
  return {
    id: account.user_id,
    name: account.full_name,
    email: account.email,
    role: normalizeAppRole(account.role),
    employeeId: account.employee_id ?? null,
    outlet: account.outlet ?? null,
  };
}

type AuthState = { user: AuthUser | null; loading: boolean };

/** One owner for session state; obsolete asynchronous work cannot commit. */
export function createAuthSession(client: Client, publish: (state: AuthState) => void) {
  let revision = 0;
  let active = false;
  let signingIn = false;
  let acceptSessionEvents = true;
  let identity: string | null = null;
  let resolvingIdentity: string | null = null;
  let authQueue: Promise<unknown> = Promise.resolve();
  let unsubscribe = () => {};
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = authQueue.then(operation);
    authQueue = result.catch(() => {});
    return result;
  };
  const current = (ticket: number) => active && ticket === revision;
  const clear = (loading = false) => {
    identity = null;
    resolvingIdentity = null;
    publish({ user: null, loading });
  };
  const resolveProfile = async (authUser: Pick<User, 'id' | 'email'>, ticket: number) => {
    const profile = await loadAuthProfile(client, authUser);
    if (current(ticket)) {
      identity = authUser.id;
      resolvingIdentity = null;
      publish({ user: profile, loading: false });
    }
  };
  const logout = () => {
    revision++;
    acceptSessionEvents = false;
    clear();
    // Order sign-out before a following sign-in. Local scope preserves other tabs.
    void enqueue(() => client.auth.signOut({ scope: 'local' })).catch((error) => console.warn('Sign-out failed:', error));
  };
  return {
    start() {
      active = true;
      acceptSessionEvents = true;
      const ticket = ++revision;
      clear(true);
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!active || !acceptSessionEvents || signingIn || event === 'INITIAL_SESSION') return;
        if (!session?.user) {
          revision++;
          clear();
          return;
        }
        if (session.user.id === identity || session.user.id === resolvingIdentity) return;
        if (identity && session.user.id !== identity) {
          logout();
          return;
        }
        const eventTicket = ++revision;
        resolvingIdentity = session.user.id;
        publish({ user: null, loading: true });
        // Leave the Supabase auth callback before making another Supabase call.
        setTimeout(() => {
          if (!current(eventTicket)) return;
          void resolveProfile(session.user, eventTicket).catch((error) => {
            if (current(eventTicket)) { clear(); console.warn('Could not load login profile:', error); }
          });
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getSession().then(async ({ data, error }) => {
        if (!current(ticket)) return;
        if (error) throw error;
        if (!data.session?.user) { clear(); return; }
        resolvingIdentity = data.session.user.id;
        await resolveProfile(data.session.user, ticket);
      }).catch((error) => {
        if (current(ticket)) { clear(); console.warn('Could not restore login:', error); }
      });
    },
    stop() { active = false; revision++; unsubscribe(); },
    async login(email: string, password: string, role?: UserRole) {
      if (signingIn) throw new Error('A sign-in is already in progress.');
      signingIn = true;
      acceptSessionEvents = true;
      const ticket = ++revision;
      clear(true);
      try {
        const { data, error } = await enqueue(() => client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
        if (!current(ticket)) throw new Error('Sign-in was cancelled. Please try again.');
        if (error) throw error;
        if (!data.user) throw new Error('The login did not return a valid session.');
        const profile = await loadAuthProfile(client, data.user);
        if (!current(ticket)) throw new Error('Sign-in was cancelled. Please try again.');
        if (role && normalizeAppRole(profile.role) !== normalizeAppRole(role)) throw new Error('This account does not have the requested role.');
        identity = data.user.id;
        publish({ user: profile, loading: false });
      } catch (error) {
        if (current(ticket)) {
          clear(true);
          await enqueue(() => client.auth.signOut({ scope: 'local' })).catch(() => {});
          if (current(ticket)) clear();
        }
        throw error;
      } finally {
        signingIn = false;
      }
    },
    logout,
  };
}
