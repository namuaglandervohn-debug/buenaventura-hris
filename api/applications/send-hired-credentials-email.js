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

export default async function handler(request, response) {
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
  const employeeId = String(data.employee_id ?? '').trim();
  const recipientEmail = String(data.recipient_email ?? '').trim().toLowerCase();
  const employeeName = String(data.name ?? '').trim() || 'Employee';
  const position = String(data.position ?? '').trim();
  const loginEmail = String(data.login_email ?? '').trim();
  const temporaryPassword = String(data.temporary_password ?? '').trim();

  if (!employeeId || !isEmail(recipientEmail) || !loginEmail || !temporaryPassword) {
    return json(response, 422, { message: 'Missing required email details.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return json(response, 500, { message: 'Resend is not configured.' });
  }

  const appName = process.env.APP_NAME || 'Buenaventura HRIS';
  const fromAddress = process.env.RESEND_FROM_ADDRESS || 'no-reply@buenaventura-hris.me';
  const fromName = process.env.RESEND_FROM_NAME || appName;
  const safeAppName = escapeHtml(appName);
  const safeEmployeeName = escapeHtml(employeeName);
  const safePosition = escapeHtml(position);
  const safeApplicantId = escapeHtml(applicantId);
  const safeEmployeeId = escapeHtml(employeeId);
  const safeLoginEmail = escapeHtml(loginEmail);
  const safeTemporaryPassword = escapeHtml(temporaryPassword);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${safeAppName} Employee Login Details</title></head>
<body style="margin:0;padding:0;background:#f6fbf4;font-family:Arial,Helvetica,sans-serif;color:#1e2d24;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6fbf4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d8ead8;border-radius:18px;overflow:hidden;">
        <tr><td style="background:#1f7a46;color:#ffffff;padding:22px 26px;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;">Congratulations, You Are Hired</h1>
          <p style="margin:6px 0 0;font-size:14px;opacity:.9;">${safeAppName}</p>
        </td></tr>
        <tr><td style="padding:26px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello ${safeEmployeeName},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Congratulations! You have been selected to join Buenaventura Estate${safePosition ? ` as ${safePosition}` : ''}.</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:16px 0;border:1px solid #d8ead8;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;width:38%;">Employee ID</td><td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#14532d;">${safeEmployeeId}</td></tr>
            ${safeApplicantId ? `<tr><td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;">Applicant ID</td><td style="padding:12px 14px;font-size:14px;color:#1e2d24;">${safeApplicantId}</td></tr>` : ''}
            <tr><td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;">Employee Login Email</td><td style="padding:12px 14px;font-size:14px;color:#1e2d24;">${safeLoginEmail}</td></tr>
            <tr><td style="padding:12px 14px;background:#f4fbf5;color:#5f6e63;font-size:13px;font-weight:bold;">Temporary Password</td><td style="padding:12px 14px;font-size:14px;font-weight:bold;color:#14532d;">${safeTemporaryPassword}</td></tr>
          </table>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#435348;">Please sign in using the login details above. For security, change your password after your first login.</p>
        </td></tr>
        <tr><td style="padding:16px 26px;border-top:1px solid #e2efe2;color:#6c7d70;font-size:12px;">This is an automated message from ${safeAppName}.</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: [recipientEmail],
      subject: `You are hired - ${appName} employee login details`,
      html,
      text: `Hello ${employeeName},\n\nCongratulations! You have been hired.`
        + (position ? `\nPosition: ${position}` : '')
        + `\nEmployee ID: ${employeeId}`
        + `\nEmployee Login Email: ${loginEmail}`
        + `\nTemporary Password: ${temporaryPassword}`
        + `\n\nPlease sign in and change your password after your first login.\n\n${appName}`,
    }),
  });

  const result = await resendResponse.json().catch(() => null);
  if (!resendResponse.ok) {
    return json(response, 502, {
      message: result?.message || 'Unable to send hired credentials email.',
      resend_status: resendResponse.status,
    });
  }

  return json(response, 200, { message: 'Hired credentials email sent.', resend: result });
}
