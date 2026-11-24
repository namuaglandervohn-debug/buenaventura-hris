import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { accountServiceUnavailable, createSupabaseFetch } from '../../lib/supabase-request.js';
import { getHrisEmailUrl } from '../../lib/emails/hris-url.js';

class AccountError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
async function sendHiredWelcome({ env, fetcher, recipient, name, email, setupLink, deliveryKey }) {
  if (!env.RESEND_API_KEY?.trim()) return false;
  const template = await readFile(new URL('../../resources/views/emails/hired-welcome.html', import.meta.url), 'utf8');
  const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const instructions = setupLink ? 'Use this expiring link to set your employee password. Contact HR if you need a new link.' : 'Use your current employee password. If you need help signing in, contact HR.';
  const destination = setupLink || getHrisEmailUrl(env, '/login');
  if (!destination) return false;
  const values = {
    name: escape(name),
    email: escape(email),
    destination: escape(destination),
    buttonLabel: setupLink ? 'Set employee password' : 'Sign in to HRIS',
    signInInstructions: instructions,
  };
  const html = template.replace(/\[\[(name|email|destination|buttonLabel|signInInstructions)\]\]/g, (_, field) => values[field]);
  const request = {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY.trim(), 'Content-Type': 'application/json', 'Idempotency-Key': deliveryKey },
    body: JSON.stringify({
      from: (env.RESEND_FROM_NAME || 'Buenaventura HRIS') + ' <' + (env.RESEND_FROM_ADDRESS || 'no-reply@buenaventura-hris.me') + '>',
      to: [recipient], subject: 'You’re hired! Welcome to Buenaventura Estate', html,
      text: ['Hello ' + name + '!', 'You’re hired! Here’s your employee account.', 'Email: ' + email,
        instructions, destination].join('\n\n'),
    }),
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher('https://api.resend.com/emails', { ...request, signal: AbortSignal.timeout(4000) }).catch(() => null);
    if (response?.ok) {
      const delivery = await response.json().catch(() => null);
      return typeof delivery?.id === 'string' && Boolean(delivery.id.trim());
    }
    if (response && response.status < 500) return false;
  }
  return false;
}

const check = (result) => { if (result.error) throw result.error; return result.data; };

export function createHiredAccountHandler({ env = process.env, clientFactory = createClient, fetcher = fetch } = {}) {
  return async (request, response) => {
    const send = (status, payload) => {
      response.status(status).setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify(payload));
    };
    if (request.method !== 'POST') return send(405, { message: 'Method not allowed.' });
    try {
      const token = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
      if (!token) throw new AccountError(401, 'Your admin session has expired. Please sign in again.');
      const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
      const key = env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) throw new AccountError(503, 'Employee account creation is not configured on this server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the hosting environment, then redeploy.');
      // The service key stays on the server; never sign in or replace the HR session.
      const admin = clientFactory(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: createSupabaseFetch() },
      });
      const verified = await admin.auth.getUser(token);
      if (verified.error && (!verified.error.status || verified.error.status >= 500 || verified.error.status === 429)) {
        throw new AccountError(503, accountServiceUnavailable);
      }
      if (verified.error || !verified.data?.user) throw new AccountError(401, 'Your admin session has expired. Please sign in again.');
      const actor = verified.data.user;
      let actorProfile = check(await admin.from('user_accounts').select('user_id,role,email').eq('auth_user_id', actor.id).eq('is_active', true).maybeSingle());
      if (!actorProfile) actorProfile = check(await admin.from('user_accounts').select('user_id,role,email').eq('email', actor.email.toLowerCase()).is('auth_user_id', null).eq('is_active', true).maybeSingle());
      if (!actorProfile || actorProfile.email.toLowerCase() !== actor.email.toLowerCase() || !['hr', 'hr_admin', 'admin', 'gm', 'general_manager'].includes(actorProfile.role)) {
        throw new AccountError(403, 'Only active HR/Admin or General Manager accounts can create employee accounts.');
      }

      let body;
      try {
        if (request.body && typeof request.body === 'object') body = request.body;
        else if (typeof request.body === 'string') body = JSON.parse(request.body);
        else {
          const chunks = [];
          for await (const chunk of request) chunks.push(Buffer.from(chunk));
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        }
      } catch { throw new AccountError(400, 'Invalid request body.'); }
      const applicantId = String(body?.applicant_id ?? '').trim();
      if (!applicantId || applicantId.length > 40) throw new AccountError(422, 'Select a hired applicant.');
      const applicant = check(await admin.from('applicants')
        .select('applicant_id,auth_user_id,status,is_archived,email,name,first_name,middle_name,last_name,suffix,employee_setup_email_sent_at')
        .eq('applicant_id', applicantId).maybeSingle());
      if (applicant?.status !== 'Hired' || applicant.is_archived) throw new AccountError(409, 'Only an active hired application can receive an employee account.');
      const recipient = applicant.email?.trim().toLowerCase();
      if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new AccountError(422, 'The application needs a valid contact email.');
      const employee = check(await admin.from('employees').select('employee_id,outlet').eq('applicant_id', applicantId).maybeSingle());
      const statusOnly = body.action === 'status';
      if (!employee && statusOnly) return send(200, { account_ready: false, password_set: false, setup_email_sent_at: null });
      if (!employee) throw new AccountError(409, 'Save the employee record before preparing the login.');
      const existing = check(await admin.from('user_accounts').select('user_id,auth_user_id,email,employee_id,role,outlet,applicant_id,is_active')
        .eq('employee_id', employee.employee_id).maybeSingle());
      if (existing && (existing.role !== 'employee' || !existing.is_active || (existing.applicant_id && existing.applicant_id !== applicantId))) {
        throw new AccountError(409, 'Review the linked account in User Accounts before continuing.');
      }
      const name = applicant.name || [applicant.first_name, applicant.last_name].filter(Boolean).join(' ') || 'Employee';
      let authUser;
      let saved = existing;
      const separate = existing?.auth_user_id && existing.auth_user_id !== applicant.auth_user_id && existing.email?.toLowerCase() !== recipient;
      if (statusOnly && !separate) return send(200, { account_ready: false, password_set: false, setup_email_sent_at: null });
      if (separate) {
        authUser = check(await admin.auth.admin.getUserById(existing.auth_user_id)).user;
        if (authUser?.email?.toLowerCase() !== existing.email?.toLowerCase()) throw new AccountError(409, 'The employee login could not be verified. Review it in User Accounts.');
        if (statusOnly) return send(200, {
          account_ready: true,
          password_set: authUser.app_metadata?.hris_temporary_password !== true,
          setup_email_sent_at: applicant.employee_setup_email_sent_at ?? null,
        });
      } else {
        const normalize = value => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 25);
        const base = [normalize(applicant.last_name), normalize(applicant.first_name)].filter(Boolean).join('.') || normalize(applicantId);
        for (let suffix = 1; suffix <= 30; suffix++) {
          const email = base + (suffix === 1 ? '' : '.' + suffix) + '@buenaventura.com';
          if (email === recipient || check(await admin.from('user_accounts').select('user_id').eq('email', email).maybeSingle())) continue;
          const created = await admin.auth.admin.createUser({
            email, password: 'Bv!' + randomUUID(), email_confirm: true,
            app_metadata: { hris_temporary_password: true, hris_hired_application: applicantId },
            user_metadata: { full_name: name, role: 'employee', employee_id: employee.employee_id },
          });
          if (['email_exists', 'user_already_exists'].includes(created.error?.code)) continue;
          authUser = check(created)?.user;
          break;
        }
        if (!authUser?.id) throw new AccountError(409, 'Could not assign an unused employee email.');
        const profile = {
          auth_user_id: authUser.id, employee_id: employee.employee_id, applicant_id: applicantId, full_name: name,
          first_name: applicant.first_name, middle_name: applicant.middle_name, last_name: applicant.last_name, suffix: applicant.suffix,
          email: authUser.email, password: null, role: 'employee', outlet: existing?.outlet || employee.outlet || null, is_active: true,
        };
        const accounts = admin.from('user_accounts');
        const write = existing ? accounts.update(profile).eq('user_id', existing.user_id)
          : accounts.insert(profile);
        if (existing) {
          if (existing.auth_user_id) write.eq('auth_user_id', existing.auth_user_id);
          else write.is('auth_user_id', null);
        }
        const result = await write.select('user_id,auth_user_id,email,employee_id,role').maybeSingle();
        if (!result.data) {
          const linked = await admin.from('user_accounts').select('user_id,auth_user_id,email,employee_id,role').eq('auth_user_id', authUser.id).maybeSingle();
          if (linked.error) throw linked.error;
          if (!linked.data) {
            await admin.auth.admin.deleteUser(authUser.id);
            throw new AccountError(409, 'Employee setup could not finish. Refresh and try again.');
          }
          saved = linked.data;
        } else saved = result.data;
      }
      const needsSetup = authUser.app_metadata?.hris_hired_application === applicantId && authUser.app_metadata?.hris_temporary_password === true;
      const sent = await (async () => {
        if (!env.RESEND_API_KEY?.trim()) return false;
        let setupLink = '';
        if (needsSetup) {
          const redirectTo = getHrisEmailUrl(env, '/applicant');
          if (!redirectTo) return false;
          const link = check(await admin.auth.admin.generateLink({
            type: 'recovery', email: authUser.email, options: { redirectTo },
          }));
          setupLink = link?.properties?.action_link;
          if (!setupLink) return false;
        }
        const deliveryKey = 'hired-welcome/' + applicantId + '/' + randomUUID();
        return sendHiredWelcome({ env, fetcher, recipient, name, email: authUser.email, setupLink, deliveryKey });
      })().catch(() => false);
      if (sent) check(await admin.from('applicants').update({ employee_setup_email_sent_at: new Date().toISOString() })
        .eq('applicant_id', applicantId).select('applicant_id').single());
      return send(200, { user: saved, welcome_email_sent: sent, message: sent
        ? 'Employee account ready. The welcome email was accepted for delivery.'
        : 'Employee account ready. The welcome email could not be sent. Use Resend Setup Email to retry.' });
    } catch (error) {
      if (error instanceof AccountError) return send(error.status, { message: error.message });
      return send(503, { message: accountServiceUnavailable });
    }
  };
}

export default createHiredAccountHandler();
