import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { createTabAuthOptions } from './authStorage';
import { getAuthEmailCallback, getAuthEmailLoginPath } from './authEmail';

const url = import.meta.env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || publicAnonKey;
const inBrowser = typeof window !== 'undefined';
const callback = inBrowser ? getAuthEmailCallback(window.location.hash, url) : null;
const recoveryCallback = callback === 'recovery';
let emailLinkResult = recoveryCallback ? null : callback;

export function consumeAuthEmailLinkResult() {
  const result = emailLinkResult;
  emailLinkResult = null;
  return result;
}

if (inBrowser && callback && !recoveryCallback) {
  // A confirmation link must never replace a tab's existing HRIS session.
  window.history.replaceState(window.history.state, '', getAuthEmailLoginPath(window.location.search));
}

export const supabase = createClient(url, key, {
  auth: inBrowser
    ? { ...createTabAuthOptions(window.sessionStorage), detectSessionInUrl: callback === null }
    : { persistSession: false },
});

// A recovery link can update a password without signing in to the rest of HRIS.
export const passwordRecoveryClient = recoveryCallback ? createClient(url, key, {
  auth: { storageKey: 'buenaventura_hris_recovery', persistSession: false, autoRefreshToken: false },
}) : null;
