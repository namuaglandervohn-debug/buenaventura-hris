const json = (response, status, payload) => {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(payload));
};

const readBody = async (request) => {
  if (request.body && typeof request.body === 'object') return request.body;

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());

export async function handleApplicantEmail(request, response, { env = process.env, fetcher = fetch } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    return json(response, 405, { message: 'Method not allowed.' });
  }

  let data;
  try {
    data = await readBody(request);
  } catch {
    return json(response, 400, { message: 'Invalid request body.' });
  }

  const applicantId = String(data.applicant_id ?? '').trim();
  const email = String(data.email ?? '').trim().toLowerCase();
  const applicantName = String(data.name ?? '').trim() || 'Applicant';
  const position = String(data.position ?? '').trim();

  if (!applicantId || !isEmail(email)) {
    return json(response, 422, { message: 'Please enter a valid email address.' });
  }

  const unavailable = () => json(response, 503, { sent: false, code: 'EMAIL_SERVICE_UNAVAILABLE', message: 'Confirmation email is temporarily unavailable. Your application remains saved; please keep your Applicant ID.' });
  const apiKey = String(env.RESEND_API_KEY ?? '').trim();
  if (!apiKey) {
    console.warn('Applicant email unavailable: RESEND_API_KEY is not configured.');
    return unavailable();
  }

  const appName = env.APP_NAME || 'Buenaventura HRIS';
  const fromAddress = env.RESEND_FROM_ADDRESS || 'no-reply@buenaventura-hris.me';
  const fromName = env.RESEND_FROM_NAME || appName;
  const trackingNote = 'Please keep this Applicant ID. You can use it to track your application status in the applicant portal.';
  const safeName = escapeHtml(applicantName);
  const safePosition = escapeHtml(position);
  const safeApplicantId = escapeHtml(applicantId);
  const safeAppName = escapeHtml(appName);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${safeAppName} Applicant ID</title></head>
<body style="margin:0;padding:0;background:#f6fbf4;font-family:Arial,Helvetica,sans-serif;color:#1e2d24;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6fbf4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8ead8;border-radius:18px;overflow:hidden;">
        <tr><td style="background:#1f7a46;color:#ffffff;padding:22px 26px;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;">Application Submitted</h1>
          <p style="margin:6px 0 0;font-size:14px;opacity:.9;">${safeAppName}</p>
        </td></tr>
        <tr><td style="padding:26px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${safeName},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Thank you for submitting your application${safePosition ? ` for ${safePosition}` : ''}.</p>
          <p style="margin:0 0 8px;font-size:13px;color:#5f6e63;font-weight:bold;text-transform:uppercase;letter-spacing:.04em;">Applicant ID</p>
          <div style="padding:16px 18px;border:1px solid #a9dfb6;background:#e5f8e9;border-radius:12px;color:#14532d;font-size:24px;font-weight:bold;letter-spacing:.03em;">${safeApplicantId}</div>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#435348;">${escapeHtml(trackingNote)}</p>
        </td></tr>
        <tr><td style="padding:16px 26px;border-top:1px solid #e2efe2;color:#6c7d70;font-size:12px;">This is an automated message from ${safeAppName}.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const resendResponse = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [email],
        subject: `Your ${appName} Applicant ID`,
        html,
        text: `Hello ${applicantName},\n\nYour Applicant ID is ${applicantId}.`
          + (position ? `\nPosition Applied For: ${position}` : '')
          + `\n\n${trackingNote}\n\n${appName}`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const result = await resendResponse.json().catch(() => null);
    if (!resendResponse.ok || !result?.id) {
      console.warn('Applicant email rejected by provider:', { status: resendResponse.status, code: result?.name });
      return unavailable();
    }

    return json(response, 200, { sent: true, message: 'Applicant ID email sent.' });
  } catch {
    console.warn('Applicant email provider request failed or timed out.');
    return unavailable();
  }
}

export default function handler(request, response) { return handleApplicantEmail(request, response); }
