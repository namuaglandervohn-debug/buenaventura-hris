import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { accountServiceUnavailable, createSupabaseFetch } from '../../lib/supabase-request.js';
import { getHrisEmailUrl } from '../../lib/emails/hris-url.js';

const roles = new Map([
  ['hr', 'hr_admin'],
  ['employee', 'employee'],
  ['supervisor', 'supervisor'],
  ['gm', 'general_manager'],
  ['accounting', 'accounting_finance'],
]);
const adminRoles = ['hr', 'hr_admin', 'admin', 'gm', 'general_manager'];
const publicAccountFields = 'user_id,full_name,email,role,employee_id,applicant_id,outlet,is_active,created_at';

const clean = (value) => typeof value === 'string' ? value.trim() : '';
const emailKey = (value) => clean(value).toLowerCase();
const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

async function approveAlreadyLinkedEmployeeRequest(admin, requestId, reviewerId, send) {
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    return send(422, { message: 'Select a valid employee registration request.' });
  }

  const requests = unwrap(await admin.from('employee_account_requests')
    .select('id,employee_id,email,auth_user_id,status')
    .eq('id', requestId).limit(2));
  const request = requests?.length === 1 ? requests[0] : null;
  if (!request) return send(404, { message: 'The employee registration request could not be found.' });
  if (request.status !== 'Pending') return send(409, { message: 'This registration request has already been reviewed.' });

  const accounts = unwrap(await admin.from('user_accounts')
    .select('user_id,employee_id,email,auth_user_id,is_active,role')
    .eq('employee_id', request.employee_id).limit(2));
  const account = accounts?.length === 1 ? accounts[0] : null;
  const sameLinkedLogin = account?.role === 'employee'
    && account.auth_user_id === request.auth_user_id
    && emailKey(account.email) === emailKey(request.email);
  if (!sameLinkedLogin) {
    return send(409, { message: 'This employee ID is linked to a different HRIS account. Verify the employee account before approving.' });
  }

  const verified = await admin.auth.admin.getUserById(request.auth_user_id);
  const authUser = verified.data?.user;
  if (verified.error || authUser?.id !== request.auth_user_id || !authUser.email
    || emailKey(authUser.email) !== emailKey(request.email)) {
    return send(409, { message: 'The registration login no longer matches this employee account.' });
  }
  if (!authUser.email_confirmed_at) {
    return send(409, { message: 'The employee must confirm the registration email before HR approval.' });
  }

  if (!account.is_active) {
    unwrap(await admin.from('user_accounts').update({ is_active: true })
      .eq('user_id', account.user_id).eq('auth_user_id', request.auth_user_id));
  }

  const reviewed = unwrap(await admin.from('employee_account_requests').update({
    status: 'Approved', reviewed_by: reviewerId, reviewed_at: new Date().toISOString(),
  }).eq('id', requestId).eq('status', 'Pending').select('id'));
  if (reviewed?.length !== 1) return send(409, { message: 'This registration request was reviewed by someone else. Refresh the list.' });

  return send(200, {
    approved: true,
    employee_created: false,
    already_linked: true,
    employee_id: request.employee_id,
    user_id: account.user_id,
  });
}


async function sendWelcomeEmail({ env, fetcher, name, email, password, authUserId }) {
  const key = clean(env.RESEND_API_KEY);
  const loginUrl = getHrisEmailUrl(env, '/login');
  if (!key || !loginUrl) return null;

  const template = await readFile(new URL('../../resources/views/emails/account-welcome.html', import.meta.url), 'utf8');
  const values = { name, email, password, loginUrl };
  const escapeHtml = (value) => value.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const html = template.replace(/\[\[(name|email|password|loginUrl)\]\]/g, (_, field) => escapeHtml(values[field]));
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `account-welcome/${authUserId}`,
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      from: `${clean(env.RESEND_FROM_NAME) || 'Buenaventura HRIS'} <${clean(env.RESEND_FROM_ADDRESS) || 'no-reply@buenaventura-hris.me'}>`,
      to: [email],
      subject: 'Welcome to Buenaventura Estate',
      html,
      text: `Hi ${name},\n\nYour HRIS account is ready.\nSign-in email: ${email}\nTemporary password: ${password}\n\nSign in: ${loginUrl}\nChange your temporary password after signing in. If you weren’t expecting this email, contact HR.`,
    }),
  });
  if (!response.ok) return null;
  const id = (await response.json())?.id;
  return typeof id === 'string' && id ? id : null;
}

async function updateAccountPassword(admin, body, send, env, fetcher) {
  const byAccountId = body.action === 'update_account_password';
  const targetId = clean(byAccountId ? body.user_id : body.employee_id);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!targetId || targetId.length > 40 || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72 || !password.trim()) {
    return send(422, { message: 'Select an account and enter a password between 8 and 72 characters.' });
  }

  const accounts = unwrap(await admin.from('user_accounts').select('auth_user_id,email,full_name,role,is_active,employee_id,applicant_id')
    .eq(byAccountId ? 'user_id' : 'employee_id', targetId).limit(2));
  const account = accounts?.length === 1 ? accounts[0] : null;
  const unavailable = () => send(409, { message: 'This account needs an active, linked staff login with a matching email.' });
  const validRole = byAccountId ? [...roles.values(), ...adminRoles].includes(account?.role) : account?.role === 'employee';
  if (!account?.auth_user_id || !account.is_active || !validRole) return unavailable();

  const employeeId = byAccountId ? account.employee_id : targetId;
  const employee = employeeId ? unwrap(await admin.from('employees').select('employee_id,applicant_id')
    .eq('employee_id', employeeId).maybeSingle()) : null;
  if (!byAccountId && !employee) return unavailable();
  const applicantIds = [...new Set([employee?.applicant_id, account.applicant_id].filter(Boolean))];

  const [verified, applicants] = await Promise.all([
    admin.auth.admin.getUserById(account.auth_user_id),
    Promise.all(applicantIds.map(id => admin.from('applicants').select('auth_user_id,email')
      .eq('applicant_id', id).maybeSingle().then(unwrap))),
  ]);
  if (verified.error && (!verified.error.status || verified.error.status >= 500 || verified.error.status === 429)) {
    return send(503, { message: accountServiceUnavailable });
  }
  const authUser = verified.data?.user;
  if (verified.error || authUser?.id !== account.auth_user_id || !authUser.email || emailKey(authUser.email) !== emailKey(account.email)
    || authUser.user_metadata?.registration_kind === 'applicant'
    || applicants.some(applicant => applicant && (applicant.auth_user_id === authUser.id || emailKey(applicant.email) === emailKey(authUser.email)))) return unavailable();

  const updated = await admin.auth.admin.updateUserById(authUser.id, {
    password,
    app_metadata: { hris_temporary_password: false },
  });
  if (updated.error) {
    if (!updated.error.status || updated.error.status >= 500 || updated.error.status === 429) {
      return send(503, { message: accountServiceUnavailable });
    }
    return send(422, { message: 'The password did not meet the account requirements. Choose a different password and try again.' });
  }
  const passwordEmailSent = await sendPasswordResetEmail({
    admin,
    env,
    fetcher,
    email: authUser.email,
    name: clean(account.full_name) || clean(authUser.user_metadata?.full_name) || 'Employee',
    authUserId: authUser.id,
  }).catch(() => false);
  const message = passwordEmailSent
    ? 'Password updated. A secure password setup link was emailed to the employee.'
    : 'Password updated, but the setup email could not be sent. The employee can use Forgot password on the sign-in page.';
  return send(200, { password_updated: true, password_email_sent: passwordEmailSent, message });
}

async function sendPasswordResetEmail({ admin, env, fetcher, email, name, authUserId }) {
  const apiKey = clean(env.RESEND_API_KEY);
  const redirectTo = getHrisEmailUrl(env, '/applicant');
  if (!apiKey || !redirectTo) return false;

  const generated = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  });
  if (generated.error) throw generated.error;
  const resetLink = clean(generated.data?.properties?.action_link ?? generated.data?.action_link);
  if (!resetLink) throw new Error('Password setup link was not returned.');

  const template = await readFile(new URL('../../resources/views/emails/password-reset.html', import.meta.url), 'utf8');
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const values = { name: escapeHtml(name), resetLink: escapeHtml(resetLink) };
  const html = template.replace(/\[\[(name|resetLink)\]\]/g, (_, field) => values[field]);
  const fromName = clean(env.RESEND_FROM_NAME) || 'Buenaventura HRIS';
  const fromAddress = clean(env.RESEND_FROM_ADDRESS) || 'no-reply@buenaventura-hris.me';
  const response = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `password-reset/${authUserId}/${randomUUID()}`,
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      from: `${fromName} <${fromAddress}>`,
      to: [email],
      subject: 'Secure your Buenaventura HRIS account',
      html,
      text: `Hello ${name},\n\nAn authorized HR administrator changed the password for your employee account. For your security, passwords are never sent by email. Use this expiring, one-time link to choose a password only you know:\n\n${resetLink}\n\nIf you did not expect this change, contact HR. Do not forward this email or its password link.`,
    }),
  });
  const result = response.ok ? await response.json().catch(() => null) : null;
  return typeof result?.id === 'string' && result.id.length > 0;
}

export function createUserAccountsHandler({ env = process.env, clientFactory = createClient, fetcher = fetch } = {}) {
  return async (request, response) => {
    const send = (status, payload) => {
      response.status(status).setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      return response.end(JSON.stringify(payload));
    };
    if (request.method !== 'POST') return send(405, { message: 'Method not allowed.' });

    const token = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) return send(401, { message: 'Your admin session has expired. Please sign in again.' });
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return send(503, { message: 'Account creation is not configured on this server.' });

    try {
      const admin = clientFactory(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: createSupabaseFetch() },
      });
      const verified = await admin.auth.getUser(token);
      const actor = verified.data?.user;
      if (verified.error || !actor?.id || !actor.email) {
        return send(401, { message: 'Your admin session has expired. Please sign in again.' });
      }

      const activeAccounts = () => admin.from('user_accounts').select('role,email').eq('is_active', true);
      const actorProfile = unwrap(await activeAccounts().eq('auth_user_id', actor.id).maybeSingle())
        ?? unwrap(await activeAccounts().eq('email', emailKey(actor.email)).is('auth_user_id', null).maybeSingle());
      if (emailKey(actorProfile?.email) !== emailKey(actor.email) || !adminRoles.includes(actorProfile?.role)) {
        return send(403, { message: 'Only active HR/Admin or General Manager accounts can manage employee logins.' });
      }

      let body;
      try {
        body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      } catch {
        return send(400, { message: 'Invalid request body.' });
      }
      if (body?.action === 'approve_employee_account_request') {
        if (actorProfile.role !== 'hr_admin') {
          return send(403, { message: 'Only HR administrators can approve employee registration requests.' });
        }
        return await approveAlreadyLinkedEmployeeRequest(admin, body.request_id, actor.id, send);
      }
      if (body?.action === 'update_account_password') {
        if (!['hr', 'hr_admin', 'admin'].includes(actorProfile.role)) {
          return send(403, { message: 'Only HR administrators can change passwords in User Accounts.' });
        }
        return await updateAccountPassword(admin, body, send, env, fetcher);
      }
      if (body?.action === 'update_employee_password') return await updateAccountPassword(admin, body, send, env, fetcher);
      const name = clean(body?.name);
      const email = emailKey(body?.email);
      const password = typeof body?.password === 'string' ? body.password : '';
      const role = roles.get(body?.role);
      const employeeId = role === 'employee' ? clean(body?.employee_id) : '';
      const position = role === 'employee' ? clean(body?.position) : '';
      const outlet = clean(body?.outlet);
      if (!name || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        || email.length > 160 || password.length < 8 || password.length > 120 || !role
        || outlet.length > 160 || (role === 'employee' && (!employeeId || employeeId.length > 40 || !position || position.length > 160))) {
        return send(422, { message: 'Enter a valid name, email, role, position, and password of at least 8 characters. Employee accounts require an employee ID and position.' });
      }

      const duplicate = unwrap(await admin.from('user_accounts').select('user_id').eq('email', email).maybeSingle());
      if (duplicate) return send(409, { message: 'An HRIS account profile with this email already exists.' });

      let employee = null;
      if (employeeId) {
        employee = unwrap(await admin.from('employees').select('employee_id,email,applicant_id,position').eq('employee_id', employeeId).maybeSingle());
        if (employee && (emailKey(employee.email) !== email || employee.applicant_id
          || unwrap(await admin.from('user_accounts').select('user_id').eq('employee_id', employeeId).limit(1).maybeSingle()))) {
          return send(409, { message: 'This employee ID is already in use. Reopen Create Account to get a new ID.' });
        }
      }

      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        ...(role === 'employee' && { app_metadata: { hris_temporary_password: true } }),
        user_metadata: { full_name: name, role, employee_id: employeeId || null },
      });
      if (created.error) {
        if (created.error.code === 'email_exists' || created.error.code === 'user_already_exists') {
          return send(409, { message: 'A login already exists for this email. Review the existing login before retrying.' });
        }
        return send(422, { message: created.error.message || 'The login could not be created.' });
      }
      const authUserId = created.data?.user?.id;
      if (!authUserId) return send(502, { message: 'The authentication service did not return an account ID.' });

      let profile;
      let employeePositionUpdated = false;
      try {
        if (employeeId && !employee) {
          const [firstName, ...lastName] = name.split(/\s+/);
          unwrap(await admin.from('employees').insert({
            employee_id: employeeId,
            first_name: firstName,
            last_name: lastName.join(' ') || firstName,
            email,
            outlet: outlet || null,
            position,
            status: 'Active',
            hire_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
          }));
        } else if (employeeId && employee && employee.position !== position) {
          unwrap(await admin.from('employees').update({ position }).eq('employee_id', employeeId));
          employeePositionUpdated = true;
        }
        profile = unwrap(await admin.from('user_accounts').insert({
          auth_user_id: authUserId,
          employee_id: employeeId || null,
          full_name: name,
          email,
          password: null,
          role,
          outlet: outlet || null,
          is_active: true,
        }).select(publicAccountFields).single());
        if (!profile?.user_id) throw new Error('Account profile was not returned after creation.');
      } catch (error) {
        // The insert can succeed even if its response is lost. Check before removing the new login.
        profile = unwrap(await admin.from('user_accounts').select(publicAccountFields).eq('auth_user_id', authUserId).maybeSingle());
        if (!profile) {
          if (employeePositionUpdated) {
            const restore = await admin.from('employees').update({ position: employee.position ?? null }).eq('employee_id', employeeId);
            if (restore.error) console.warn('Could not restore the employee position after an incomplete staff login.');
          }
          const cleanup = await admin.auth.admin.deleteUser(authUserId);
          if (cleanup.error) console.warn('Could not roll back an incomplete staff login.');
          if (error.code === '23505') return send(409, { message: 'The employee ID or email is already in use. Refresh User Accounts before retrying.' });
          throw error;
        }
      }

      const welcomeEmailId = await sendWelcomeEmail({ env, fetcher, name, email, password, authUserId })
        .catch(() => null);
      return send(201, {
        message: 'Account created.',
        user: profile,
        welcome_email_sent: welcomeEmailId !== null,
        welcome_email_id: welcomeEmailId,
      });
    } catch {
      return send(502, { message: 'The account could not be saved. Refresh User Accounts before retrying.' });
    }
  };
}

export default createUserAccountsHandler();
