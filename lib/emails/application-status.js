const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]);

export function renderApplicationStatusEmail(data, appName = 'Buenaventura HRIS') {
  const terminal = ['Not Qualified', 'Archived'].includes(data.status);
  const flow = terminal
    ? ['Submitted', 'Under Review', 'Missing Requirements', data.status]
    : ['Submitted', 'Under Review', 'Missing Requirements', 'For Interview', 'Hired'];
  const current = flow.indexOf(data.status);
  const descriptions = {
    Submitted: 'Your application has been received by HR.',
    'Under Review': 'HR is reviewing your submitted requirements.',
    'Missing Requirements': 'Please check the pending requirements listed below.',
    'For Interview': 'You are scheduled or being prepared for interview.',
    Hired: '',
    'Not Qualified': 'Sorry, your application did not qualify for the current opening.',
    Archived: 'Your applicant requirements are currently on hold and archived for review.',
  };
  const steps = flow.map((step, index) => {
    const done = index <= current;
    const now = index === current;
    const last = index === flow.length - 1;
    const red = now && step === 'Not Qualified';
    const archived = now && step === 'Archived';
    const circle = red ? '#e84f4f' : archived ? '#f3b83f' : done ? '#36c26f' : '#e9ece9';
    const icon = red ? '&times;' : archived ? '&#128230;' : done ? '&#10003;' : '';
    const interview = now && data.interview_date
      ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:#435348;">Interview: ${escapeHtml(data.interview_date)}${data.interview_time ? ` at ${escapeHtml(data.interview_time)}` : ''}${data.interview_location ? ` - ${escapeHtml(data.interview_location)}` : ''}</p>` : '';
    return `<tr>
<td width="72" valign="top" style="text-align:right;"><span style="display:inline-block;margin-top:2px;font-size:12px;font-weight:bold;color:${done ? '#1f2d24' : '#9aa59d'};">${now ? 'Now' : done ? 'Done' : 'Next'}</span></td>
<td width="42" valign="top" align="center" style="padding:0 10px;">
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td align="center" style="width:28px;height:28px;border-radius:50%;background:${circle};color:${done ? '#ffffff' : '#b8c2ba'};font-size:16px;font-weight:bold;line-height:28px;">${icon}</td></tr>
${!last ? `<tr><td align="center" style="height:58px;"><span style="display:inline-block;width:2px;height:58px;background:${index < current ? '#36c26f' : '#d7ded8'};"></span></td></tr>` : ''}</table></td>
<td valign="top" style="padding:0 0 ${last ? '8px' : '0'};"><p style="margin:0;font-size:16px;font-weight:800;color:#111f17;">${escapeHtml(step)}</p>
<p style="margin:7px 0 0;font-size:13px;line-height:1.55;color:#7b8780;">${escapeHtml(descriptions[step])}</p>
${red ? '<p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:#b42323;">We are sorry. Based on the current screening, you did not qualify for this position.</p>' : ''}
${archived ? '<p style="margin:8px 0 0;font-size:13px;line-height:1.55;color:#8a5f00;">Your requirements are on hold for now. HR will keep your record in the archive and will update you if there is a next action.</p>' : ''}${interview}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(appName)} Application Status Update</title></head>
<body style="margin:0;padding:0;background:#f2fbf4;font-family:Arial,Helvetica,sans-serif;color:#1f2d24;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2fbf4;padding:24px 0;"><tr><td align="center" style="padding:0 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d6ebd8;border-radius:18px;overflow:hidden;">
<tr><td style="background:#21a957;color:#ffffff;padding:26px 28px 30px;border-radius:18px 18px 0 0;"><h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:800;">Application / Requirements Status Update</h1><p style="margin:8px 0 0;font-size:14px;opacity:.95;">${escapeHtml(appName)}</p></td></tr>
<tr><td style="padding:26px 28px 6px;"><p style="margin:0 0 10px;font-size:15px;line-height:1.6;">Hello ${escapeHtml(data.name || 'Applicant')},</p><p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your application${data.position ? ` for ${escapeHtml(data.position)}` : ''} has a new status update.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px;background:#f5fbf6;border:1px solid #dcefe0;border-radius:12px;"><tr><td style="padding:14px 16px;color:#6b7d70;font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:.03em;">Applicant ID</td><td style="padding:14px 16px;color:#12251a;font-size:15px;font-weight:bold;text-align:right;overflow-wrap:anywhere;">${escapeHtml(data.applicant_id)}</td></tr></table></td></tr>
<tr><td style="padding:0 28px 12px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${steps}</table></td></tr>
${data.note ? `<tr><td style="padding:0 28px 20px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fbf5;border:1px solid #dcefe0;border-radius:12px;"><tr><td style="padding:14px 16px;"><p style="margin:0 0 6px;font-size:13px;font-weight:bold;color:#14532d;">Requirements Note</p><p style="margin:0;font-size:13px;line-height:1.65;color:#435348;white-space:pre-line;">${escapeHtml(data.note).replace(/\n/g, '<br>')}</p></td></tr></table></td></tr>` : ''}
<tr><td style="padding:0 28px 26px;"><p style="margin:0;font-size:13px;line-height:1.6;color:#59675e;">Please keep your Applicant ID. You can track your requirements status in the portal and through these email updates.</p></td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2efe2;color:#6c7d70;font-size:12px;background:#fbfefb;border-radius:0 0 18px 18px;">This is an automated message from ${escapeHtml(appName)}.</td></tr></table></td></tr></table></body></html>`;
}
