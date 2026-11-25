import { createHash } from 'node:crypto';
import { renderApplicationStatusEmail } from '../../lib/emails/application-status.js';
import { createClient } from '@supabase/supabase-js';
import { accountServiceUnavailable, createSupabaseFetch } from '../../lib/supabase-request.js';

const sendJson = (response, status, body) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};
const STATUSES = ['Submitted', 'Under Review', 'Missing Requirements', 'For Interview', 'Hired', 'Not Qualified', 'Not Hired', 'Archived'];

async function authorizeStatusEmail(request, data, env) {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers?.authorization ?? '')?.[1];
  if (!token) return 401;
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return 503;
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createSupabaseFetch() },
  });
  const { data: identity, error: authError } = await admin.auth.getUser(token);
  if (authError && (!authError.status || authError.status >= 500 || authError.status === 429)) return 503;
  if (authError || !identity.user?.email) return 401;

  const email = identity.user.email.toLowerCase();
  const staffQuery = () => admin.from('user_accounts').select('email,role').eq('is_active', true);
  let staff = await staffQuery().eq('auth_user_id', identity.user.id).maybeSingle();
  if (!staff.error && !staff.data) {
    staff = await staffQuery().eq('email', email).is('auth_user_id', null).maybeSingle();
  }
  if (staff.error) return 503;
  if (staff.data?.email.toLowerCase() !== email
    || !['hr', 'hr_admin', 'gm', 'general_manager'].includes(staff.data.role)) return 403;

  const result = await admin.from('applicants').select('email,status').eq('applicant_id', data.applicant_id).maybeSingle();
  if (result.error) return 503;
  if (result.data?.email.toLowerCase() !== data.email || result.data?.status !== data.status) return 409;
  return 200;
}

export async function handleStatusEmail(request, response, { env = process.env, fetcher = fetch, authorize = authorizeStatusEmail } = {}) {
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
  if (!apiKey) return sendJson(response, 503, {
    sent: false,
    code: 'EMAIL_SERVICE_NOT_CONFIGURED',
    message: 'Email delivery is not configured. Ask the system administrator to set RESEND_API_KEY for this deployment.',
  });
  let permission;
  try {
    permission = await authorize(request, data, env);
  } catch {
    permission = 503;
  }
  if (permission !== 200) {
    const messages = {
      401: 'Sign in again to send an application status email.',
      403: 'Only HR and General Manager accounts can send application status emails.',
      409: 'This application changed. Refresh it before sending a status email.',
      503: accountServiceUnavailable,
    };
    return sendJson(response, permission, { sent: false, message: messages[permission] });
  }
  const appName = env.APP_NAME || 'Buenaventura HRIS';
  const fromAddress = env.RESEND_FROM_ADDRESS || 'no-reply@buenaventura-hris.me';
  const fromName = env.RESEND_FROM_NAME || appName;
  const name = data.name || 'Applicant';
  const interviewDate = data.interview_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$2/$3/$1');
  const details = [
    data.position && `Position: ${data.position}`,
    interviewDate && `Interview Date: ${interviewDate}`,
    data.interview_time && `Interview Time: ${data.interview_time}`,
    data.interview_location && `Location: ${data.interview_location}`,
    data.note && `Note: ${data.note}`,
  ].filter(Boolean);
  const html = renderApplicationStatusEmail({ ...data, interview_date: interviewDate }, appName);
  const emailBody = JSON.stringify({
    from: `${fromName} <${fromAddress}>`, to: [data.email],
    subject: `Application/requirements status update: ${data.status}`, html,
    text: `Hello ${name},\n\nApplicant ID: ${data.applicant_id}\nYour application/requirements status is now: ${data.status}.\n${details.join('\n')}\n\nPlease keep your Applicant ID for tracking.\n\n${appName}`,
  });
  const retryKey = `hired-status/${data.applicant_id}/${createHash('sha256').update(emailBody).digest('hex')}`;
  try {
    const result = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json',
        ...(data.status === 'Hired' && { 'Idempotency-Key': retryKey }),
      },
      signal: AbortSignal.timeout(10000),
      body: emailBody,
    });
    const provider = await result.json().catch(() => null);
    if (!result.ok || !provider?.id) {
      console.warn('Status email failed:', { status: result.status, code: provider?.name });
      if (result.status === 401 || result.status === 403) {
        return sendJson(response, 502, {
          sent: false,
          code: 'EMAIL_PROVIDER_AUTH_FAILED',
          message: 'The email provider rejected its API credential. Ask the system administrator to replace RESEND_API_KEY in Vercel, then retry the notification.',
        });
      }
      return sendJson(response, 502, {
        sent: false,
        code: 'EMAIL_PROVIDER_REJECTED',
        message: 'The email provider did not accept this notification. Your saved application changes are unchanged; try the notification again later.',
      });
    }
    return sendJson(response, 200, { sent: true, message: 'Application status email sent.' });
  } catch {
    return sendJson(response, 503, { sent: false, message: 'The status email service could not be reached. Your saved checklist is unchanged.' });
  }
}

export default function handler(request, response) { return handleStatusEmail(request, response); }
