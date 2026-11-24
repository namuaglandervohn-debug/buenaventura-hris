import type { SupabaseClient, User } from '@supabase/supabase-js';

export type UserRole = 'hr' | 'hr_admin' | 'employee' | 'supervisor' | 'gm' | 'general_manager' | 'accounting' | 'accounting_finance' | string;
export type SignInGroup = 'staff' | 'employee' | 'applicant';
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  outlet?: string | null;
  mustChangePassword?: boolean;
}

export function normalizeAppRole(role: unknown): UserRole {
  const normalized = String(role ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = { hr_admin: 'hr', admin: 'hr', general_manager: 'gm', accounting_finance: 'accounting', finance: 'accounting' };
  const result = aliases[normalized] ?? normalized;
  if (!['hr', 'employee', 'supervisor', 'gm', 'accounting', 'applicant'].includes(result)) {
    throw new Error('This account does not have a supported HRIS role. Please contact HR.');
  }
  return result;
}

type Client = Pick<SupabaseClient, 'auth' | 'from' | 'rpc'>;
type AuthIdentity = Pick<User, 'id' | 'email'> & Partial<Pick<User, 'user_metadata' | 'app_metadata'>>;
const PROFILE_COLUMNS = 'user_id, auth_user_id, full_name, email, role, employee_id, outlet';
const missingProfileMessage = 'This login is not linked to an active matching HRIS account. Please contact HR.';
const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, '\\$&');

class MissingAuthProfileError extends Error {}

export async function loadAuthProfile(client: Client, authUser: AuthIdentity): Promise<AuthUser> {
  const email = String(authUser.email ?? '').trim().toLowerCase();
  if (!authUser.id || !email) throw new Error('The login session has no valid account identity.');
  const query = () => client.from('user_accounts').select(PROFILE_COLUMNS).eq('is_active', true);
  const linked = await query().eq('auth_user_id', authUser.id).maybeSingle();
  if (linked.error) throw linked.error;
  let account = linked.data;
  if (!account) {
    // Legacy profiles may be unlinked. Never use a profile linked to someone else,
    // and never change account links as a side effect of signing in.
    const legacy = await query().ilike('email', escapeLikePattern(email)).is('auth_user_id', null).maybeSingle();
    if (legacy.error) throw legacy.error;
    account = legacy.data;
  }
  if (!account) {
    const inactive = await client.from('user_accounts').select('user_id').eq('auth_user_id', authUser.id).maybeSingle();
    if (inactive.error) throw inactive.error;
    if (inactive.data) throw new MissingAuthProfileError(missingProfileMessage);
    if (authUser.user_metadata?.registration_kind === 'employee') {
      const registration = await client.from('employee_account_requests').select('status').eq('auth_user_id', authUser.id).maybeSingle();
      if (registration.error) throw registration.error;
      if (registration.data?.status === 'Pending') {
        throw new MissingAuthProfileError('Your employee registration is awaiting HR approval. You can sign in after HR approves it.');
      }
      if (registration.data?.status === 'Rejected') {
        throw new MissingAuthProfileError('Your employee registration was not approved. Please contact HR for assistance.');
      }
    }
    const applicant = await client.from('applicant_profiles').select('auth_user_id,profile').eq('auth_user_id', authUser.id).maybeSingle();
    if (applicant.error) throw applicant.error;
    let profile = applicant.data?.profile;
    if (!applicant.data && authUser.user_metadata?.registration_kind === 'applicant') {
      const restored = await client.rpc('ensure_my_applicant_profile');
      if (restored.error) throw restored.error;
      profile = restored.data;
    }
    if (applicant.data || profile) {
      profile ??= {};
      return { id: authUser.id, name: [profile.firstName, profile.middleName, profile.lastName, profile.suffix].filter(Boolean).join(' '), email, role: 'applicant' };
    }
  }
  // auth_user_id is the verified identity for linked accounts. The HRIS email
  // can be edited separately from Supabase Auth, so it must not invalidate an
  // otherwise exact, active UUID link. Legacy unlinked accounts still require
  // an exact case-insensitive email match above.
  if (!account || (!linked.data && String(account.email).trim().toLowerCase() !== email)) {
    throw new MissingAuthProfileError(missingProfileMessage);
  }
  return {
    id: account.user_id,
    name: account.full_name,
    email: String(authUser.email).trim(),
    role: normalizeAppRole(account.role),
    employeeId: account.employee_id ?? null,
    outlet: account.outlet ?? null,
    ...(authUser.app_metadata?.hris_temporary_password === true && { mustChangePassword: true }),
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
  let failedIdentity: string | null = null;
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
    failedIdentity = null;
    publish({ user: null, loading });
  };
  const resolveProfile = async (authUser: AuthIdentity, ticket: number) => {
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
  const handleRestoreFailure = (ticket: number, error: unknown) => {
    if (!current(ticket)) return;
    if (error instanceof MissingAuthProfileError) {
      logout();
    } else {
      const attemptedIdentity = resolvingIdentity;
      clear();
      // Supabase can emit SIGNED_IN again when the tab becomes visible.
      failedIdentity = attemptedIdentity;
    }
    console.warn('Could not restore login:', error);
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
        if ([identity, resolvingIdentity, failedIdentity].includes(session.user.id)) return;
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
          void resolveProfile(session.user, eventTicket).catch((error) => handleRestoreFailure(eventTicket, error));
        }, 0);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getSession().then(async ({ data, error }) => {
        if (!current(ticket)) return;
        if (error) throw error;
        if (!data.session?.user) { clear(); return; }
        resolvingIdentity = data.session.user.id;
        await resolveProfile(data.session.user, ticket);
      }).catch((error) => handleRestoreFailure(ticket, error));
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
        const actualGroup: SignInGroup = profile.role === 'employee' || profile.role === 'applicant' ? profile.role : 'staff';
        const groupRequested = role === 'staff' || role === 'employee' || role === 'applicant';
        if (role && (groupRequested ? actualGroup !== role : profile.role !== normalizeAppRole(role))) {
          throw new Error('This account uses a different sign-in option. Choose the option for your account and try again.');
        }
        identity = data.user.id;
        publish({ user: profile, loading: false });
      } catch (error) {
        if (current(ticket)) {
          acceptSessionEvents = false;
          clear();
          await enqueue(() => client.auth.signOut({ scope: 'local' })).catch(() => {});
        }
        throw error;
      } finally {
        signingIn = false;
      }
    },
    async changePassword(newPassword: string, currentPassword: string, required: boolean) {
      const ticket = revision;
      const userId = identity;
      if (!userId || !current(ticket)) throw new Error('Sign in again to change your password.');
      await enqueue(async () => {
        if (!current(ticket)) throw new Error('Sign in again to change your password.');
        const { data, error } = await client.auth.updateUser({
          password: newPassword,
          ...(currentPassword && { current_password: currentPassword }),
        });
        if (error) throw error;
        if (!required) return;
        if (!current(ticket)) return;
        const refreshed = await client.auth.refreshSession();
        const user = refreshed.data.user;
        if (refreshed.error || !user || user.id !== userId || user.id !== data.user?.id) {
          throw new Error('Your password was saved. Sign out and sign in with your new password.');
        }
        if (user.app_metadata?.hris_temporary_password === true) {
          throw new Error('Your password was saved, but access could not be activated. Contact HR.');
        }
        await resolveProfile(user, ticket);
      });
    },
    logout,
  };
}
