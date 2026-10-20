import type { SupabaseClient } from '@supabase/supabase-js';
import { submitApplicant } from './submitApplicant.ts';

export const CONFIRMATION_EMAIL_NOTICE = 'Your application was saved, but the confirmation email could not be sent. Please copy your Applicant ID and use it to track your application. You do not need to submit again.';

export async function sendApplicantConfirmation(
  payload: { applicantId: string; email: string; name: string; position: string },
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher('/api/applications/send-applicant-id-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ applicant_id: payload.applicantId, email: payload.email, name: payload.name, position: payload.position }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.sent !== true) throw new Error('Confirmation email was not delivered.');
}

/** Email delivery is a separate step: its failure must never undo a saved application. */
export async function submitApplicantWithConfirmation(
  client: Pick<SupabaseClient, 'from'>,
  application: Record<string, unknown>,
  options: { onSaved: (id: string) => void; sendConfirmation: (id: string) => Promise<void> },
): Promise<{ applicantId: string; emailNotice: string }> {
  const applicantId = await submitApplicant(client, application);
  options.onSaved(applicantId);
  try {
    await options.sendConfirmation(applicantId);
    return { applicantId, emailNotice: '' };
  } catch {
    return { applicantId, emailNotice: CONFIRMATION_EMAIL_NOTICE };
  }
}
