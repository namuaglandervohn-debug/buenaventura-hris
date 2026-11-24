import { getApplicationDestination } from './applicationNavigation.ts';

export function applicantConfirmationRedirect(origin: string, next: string | null = null) {
  const url = new URL('/applicant', origin);
  const application = getApplicationDestination(next);
  if (application) url.searchParams.set('next', application);
  return url.href;
}

export function employeeConfirmationRedirect(origin: string) {
  return new URL('/login?employeeRegistration=1', origin).href;
}
