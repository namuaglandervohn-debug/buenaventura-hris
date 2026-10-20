import { renderApplicationStatusEmail } from '../../lib/emails/application-status.js';

const sendJson = (response, status, body) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};
const STATUSES = ['Submitted', 'Under Review', 'Missing Requirements', 'For Interview', 'Hired', 'Not Qualified', 'Archived'];

export async function handleStatusEmail(request, response, { env = process.env, fetcher = fetch } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return sendJson(response, 405, { sent: false, message: 'Method not allowed.' });
  let body;
  try {
    if (request.body && typeof request.body === 'object') body = request.body;
    else if (typeof request.body === 'string') body = JSON.parse(request.body);
    else {
      const chunks = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch { return sendJson(response, 400, { sent: false, message: 'Invalid request body.' }); }
  const data = {};
  const limits = { applicant_id: 40, email: 120, name: 160, position: 160, status: 80, note: 10000, interview_date: 40, interview_time: 40, interview_location: 200 };
  for (const [field, maximum] of Object.entries(limits)) {
    const value = body?.[field];
    if (value != null && typeof value !== 'string') return sendJson(response, 422, { sent: false, message: `${field} must be text.` });
    data[field] = (value ?? '').trim();
    if (data[field].length > maximum) return sendJson(response, 422, { sent: false, message: `${field} exceeds the maximum length of ${maximum} characters.` });
  }
  data.email = data.email.toLowerCase();
  if (!data.applicant_id || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || !STATUSES.includes(data.status)) {
    return sendJson(response, 422, { sent: false, message: 'A valid applicant ID, email address and application status are required.' });
  }
  const apiKey = String(env.RESEND_API_KEY ?? '').trim();
  if (!apiKey) return sendJson(response, 503, { sent: false, message: 'Status email is not configured on this server. Set RESEND_API_KEY and redeploy.' });
  const appName = env.APP_NAME || 'Buenaventura HRIS';
  const fromAddress = env.RESEND_FROM_ADDRESS || 'no-reply@buenaventura-hris.me';
  const fromName = env.RESEND_FROM_NAME || appName;
  const name = data.name || 'Applicant';
  const details = [
    data.position && `Position: ${data.position}`,
    data.interview_date && `Interview Date: ${data.interview_date}`,
    data.interview_time && `Interview Time: ${data.interview_time}`,
    data.interview_location && `Location: ${data.interview_location}`,
    data.note && `Note: ${data.note}`,
  ].filter(Boolean);
  const html = renderApplicationStatusEmail(data, appName);
  try {
    const result = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`, to: [data.email],
        subject: `Application/requirements status update: ${data.status}`, html,
        text: `Hello ${name},\n\nApplicant ID: ${data.applicant_id}\nYour application/requirements status is now: ${data.status}.\n${details.join('\n')}\n\nPlease keep your Applicant ID for tracking.\n\n${appName}`,
      }),
    });
    const provider = await result.json().catch(() => null);
    if (!result.ok || !provider?.id) {
      const detail = typeof provider?.message === 'string' ? provider.message : typeof provider?.error?.message === 'string' ? provider.error.message : 'The email provider did not accept the status email.';
      console.warn('Status email failed:', { status: result.status, code: provider?.name });
      return sendJson(response, 502, { sent: false, message: detail, resend_status: result.status });
    }
    return sendJson(response, 200, { sent: true, message: 'Application status email sent.' });
  } catch {
    return sendJson(response, 503, { sent: false, message: 'The status email service could not be reached. Your saved checklist is unchanged.' });
  }
}

export default function handler(request, response) { return handleStatusEmail(request, response); }
