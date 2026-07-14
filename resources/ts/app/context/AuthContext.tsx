import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "../lib/supabaseClient";

export type UserRole = "hr" | "hr_admin" | "employee" | "supervisor" | "gm" | "general_manager" | "accounting" | "accounting_finance" | string;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string | null;
  outlet?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  changePassword: (userId: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_STORAGE_KEY = "buenaventura_hris_user";

const getStoredUser = (): AuthUser | null => {
  if (typeof window === "undefined") return null;

  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    const rawUser = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    return rawUser ? (JSON.parse(rawUser) as AuthUser) : null;
  } catch {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
};

const storeUser = (user: AuthUser | null) => {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(AUTH_STORAGE_KEY);

  if (user) {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }
};

function normalizeAppRole(role: unknown): UserRole {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (normalized === 'hr_admin' || normalized === 'admin') return 'hr';
  if (normalized === 'general_manager') return 'gm';
  if (normalized === 'accounting_finance' || normalized === 'finance') return 'accounting';
  return normalized || 'employee';
}

const buildAuthUser = (account: any, authId?: string | null): AuthUser => ({
  id: account.user_id || authId || account.id,
  name: account.full_name,
  email: account.email,
  role: normalizeAppRole(account.role),
  employeeId: account.employee_id ?? null,
  outlet: account.outlet ?? null,
});

const loadProfileForAuthUser = async (authUser: any, role?: UserRole): Promise<AuthUser | null> => {
  const authId = authUser?.id ? String(authUser.id) : "";
  const authEmail = String(authUser?.email ?? "").trim().toLowerCase();

  let query = supabase
    .from("user_accounts")
    .select("*")
    .eq("is_active", true);

  if (authId) {
    query = query.or(`auth_user_id.eq.${authId},email.eq.${authEmail}`);
  } else {
    query = query.eq("email", authEmail);
  }

  if (role) {
    query = query.eq("role", role);
  }

  const { data: account, error } = await query.maybeSingle();
  if (error) throw error;
  if (!account) return null;

  if (authId && !account.auth_user_id) {
    await supabase
      .from("user_accounts")
      .update({ auth_user_id: authId })
      .eq("user_id", account.user_id);
  }

  return buildAuthUser({ ...account, auth_user_id: account.auth_user_id || authId }, authId);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const restoreAuthSession = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active || !data.user) return;

        const profile = await loadProfileForAuthUser(data.user);
        if (!active || !profile) return;
        setUser(profile);
        storeUser(profile);
      } catch (error) {
        console.warn("Could not restore Supabase Auth profile:", error);
      } finally {
        if (active) setLoading(false);
      }
    };

    restoreAuthSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null);
        storeUser(null);
        setLoading(false);
        return;
      }

      setTimeout(() => {
        void (async () => {
          try {
            const profile = await loadProfileForAuthUser(session.user);
            if (profile) {
              setUser(profile);
              storeUser(profile);
            }
          } catch (error) {
            console.warn("Could not load Supabase Auth profile:", error);
          } finally {
            setLoading(false);
          }
        })();
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string, role?: UserRole) => {
    setLoading(true);
    const loginEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error("Supabase Auth did not return a user session.");

      const profile = await loadProfileForAuthUser(data.user, role);
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error("This Supabase Auth user is not linked to an active HRIS account.");
      }

      setUser(profile);
      storeUser(profile);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    storeUser(null);
    setLoading(false);
    void supabase.auth.signOut();
  };

  const changePassword = async (userId: string, newPassword: string) => {
    if (user?.id !== userId) {
      throw new Error("Only the currently signed-in user can change their Supabase Auth password from the browser.");
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
