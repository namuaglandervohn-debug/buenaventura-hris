export function readableErrorMessage(value: unknown, fallback: string): string {
  const seen = new Set<unknown>();
  const read = (input: unknown, depth = 0): string => {
    if (depth > 5 || input == null || seen.has(input)) return '';
    if (typeof input === 'string') return input.trim() === '[object Object]' ? '' : input.trim();
    if (typeof input !== 'object') return '';
    seen.add(input);
    if (Array.isArray(input)) return input.map((entry) => read(entry, depth + 1)).filter(Boolean).join(' ');
    const record = input as Record<string, unknown>;
    for (const key of ['message', 'error', 'detail', 'errors']) {
      const text = read(record[key], depth + 1);
      if (text) return text;
    }
    return '';
  };
  return read(value) || fallback;
}

export function apiErrorMessage(body: any, status: number, fallback: string, unavailableMessage = 'Employee account creation is unavailable on this deployment. Deploy the account API endpoint and try again.'): string {
  const errors = body?.errors && typeof body.errors === 'object' ? Object.values(body.errors).flat().filter((value) => typeof value === 'string') : [];
  if (errors.length) return errors.join(' ');
  const detail = readableErrorMessage(body?.resend_message || body?.resend_error || body?.error || body?.message, '');
  if (detail) return detail;
  if (status === 404 || status === 405) return unavailableMessage;
  return fallback;
}
