export function apiErrorMessage(body: any, status: number, fallback: string): string {
  const errors = body?.errors && typeof body.errors === 'object' ? Object.values(body.errors).flat().filter((value) => typeof value === 'string') : [];
  if (errors.length) return errors.join(' ');
  if (typeof body?.message === 'string') return body.message;
  if (status === 404 || status === 405) return 'Employee account creation is unavailable on this deployment. Deploy the account API endpoint and try again.';
  return fallback;
}
