import { getApplicationDestination } from './applicationNavigation.ts';

function supabaseProject(url: string) {
  const host = new URL(url).hostname;
  return /^([a-z]{20})\.supabase\.co$/.exec(host)?.[1];
}

function tokenProject(token: string) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return supabaseProject(JSON.parse(atob(payload)).iss);
  } catch {
    return undefined;
  }
}

export function getAuthEmailCallback(hash: string, authUrl: string) {
  const callback = new URLSearchParams(hash.replace(/^#/, ''));
  if (callback.has('error_code') || callback.has('error')) return 'invalid-link';
  const type = callback.get('type');
  if (type !== 'signup' && type !== 'recovery') return null;

  const token = callback.get('access_token');
  if (!token || !callback.get('refresh_token')) return 'invalid-link';
  const expectedProject = supabaseProject(authUrl);
  const issuingProject = tokenProject(token);
  if (expectedProject && issuingProject && expectedProject !== issuingProject) return 'wrong-project';
  return type;
}

export function getAuthEmailLoginPath(search: string) {
  const original = new URLSearchParams(search);
  const params = new URLSearchParams();
  const application = getApplicationDestination(original.get('next'));
  if (application) params.set('next', application);
  if (original.get('employeeRegistration') === '1') params.set('employeeRegistration', '1');
  return params.size ? `/login?${params}` : '/login';
}

export function getSignInErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : '';
  if (code === 'email_not_confirmed') {
    return 'Email confirmation is still pending for this account. Use Resend confirmation email to get a new link.';
  }
  if (code === 'invalid_credentials' || message === 'Invalid login credentials') {
    return 'Email or password is incorrect. Sign in on the HRIS site where you registered. Use Forgot password? if you need to reset your password.';
  }
  return message || 'Could not sign in. Please try again.';
}
