export function getJobApplicationEntryPath(position: string, role?: string) {
  const path = `/apply?position=${encodeURIComponent(position.trim())}`;
  return role === 'applicant' ? path : `/login?next=${encodeURIComponent(path)}`;
}

export function getApplicationDestination(next: string | null) {
  return next === '/apply' || next?.startsWith('/apply?') ? next : null;
}

export function getPostLoginPath(role: string | undefined, applicationDestination: string | null) {
  if (!role) return null;
  if (role === 'applicant') {
    return applicationDestination ? `/applicant?next=${encodeURIComponent(applicationDestination)}` : '/applicant';
  }
  return applicationDestination ? null : '/dashboard';
}
