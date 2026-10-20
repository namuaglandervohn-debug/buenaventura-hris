import { apiErrorMessage } from './apiError.ts';

export interface StatusEmailPayload {
  applicant_id: string;
  email: string;
  name: string;
  position: string;
  status: string;
  note: string;
  interview_date: string;
  interview_time: string;
  interview_location: string;
}

export async function sendApplicationStatusEmail(payload: StatusEmailPayload, fetcher: typeof fetch = fetch): Promise<void> {
  const response = await fetcher('/api/applications/send-status-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, response.status, 'Unable to send the application status email.', 'The application status email endpoint is unavailable. Deploy the updated API and try again.'));
  }
  if (body?.sent !== true && !body?.resend?.id) throw new Error('The email service did not confirm that the status email was sent.');
}
