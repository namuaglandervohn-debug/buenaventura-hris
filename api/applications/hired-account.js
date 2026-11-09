import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

class AccountError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const check = (result) => { if (result.error) throw result.error; return result.data; };

export function createHiredAccountHandler({ env = process.env, clientFactory = createClient } = {}) {
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
      const admin = clientFactory(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const verified = await admin.auth.getUser(token);
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
      const employeeId = String(body?.employee_id ?? '').trim();
      const name = String(body?.name ?? '').trim();
      const password = typeof body?.password === 'string' ? body.password : '';
      const requestedEmail = String(body?.email ?? '').trim().toLowerCase();
      if (!employeeId || employeeId.length > 40 || !name || name.length > 160 || password.length < 8 || password.length > 120 || requestedEmail.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requestedEmail)) {
        throw new AccountError(422, 'A valid employee ID, name, login email and password of at least 8 characters are required.');
      }
      const employee = check(await admin.from('employees').select('employee_id').eq('employee_id', employeeId).maybeSingle());
      if (!employee) throw new AccountError(422, 'Save the employee record before creating the login account.');
      const existing = check(await admin.from('user_accounts').select('user_id,auth_user_id,email,employee_id,role,outlet').eq('employee_id', employeeId).maybeSingle());
      if (existing && existing.role !== 'employee') throw new AccountError(409, 'This employee is linked to a different account role. Review it in User Accounts.');
      const email = existing?.email || requestedEmail;
      const emailProfile = check(await admin.from('user_accounts').select('user_id,employee_id,role').eq('email', email).maybeSingle());
      if (emailProfile && (emailProfile.employee_id !== employeeId || emailProfile.role !== 'employee')) {
        throw new AccountError(409, 'That login email belongs to another account. No account was reset.');
      }

      let authUser = null;
      if (existing?.auth_user_id) {
        const found = await admin.auth.admin.getUserById(existing.auth_user_id);
        if (found.error && found.error.status !== 404) throw found.error;
        authUser = found.data?.user ?? null;
        if (authUser && authUser.email?.toLowerCase() !== email.toLowerCase()) throw new AccountError(409, 'The employee account has a conflicting login identity. Review it in User Accounts.');
      }
      if (!authUser) {
        // Scan every page, including users created before an HRIS profile save failed.
        for (let page = 1; ; page++) {
          const data = check(await admin.auth.admin.listUsers({ page, perPage: 1000 }));
          authUser = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase()) ?? null;
          if (authUser || data.users.length < 1000) break;
        }
        if (authUser && authUser.user_metadata?.employee_id !== employeeId) {
          throw new AccountError(409, 'That login email already exists for another identity. No account was reset.');
        }
      }
      if (authUser) {
        const linked = check(await admin.from('user_accounts').select('employee_id,role').eq('auth_user_id', authUser.id).maybeSingle());
        if (linked && (linked.employee_id !== employeeId || linked.role !== 'employee')) throw new AccountError(409, 'That login is linked to another account. No account was reset.');
      }
      const authPayload = {
        email, password, email_confirm: true,
        user_metadata: { ...(authUser?.user_metadata ?? {}), full_name: name, role: 'employee', employee_id: employeeId },
      };
      const authResult = check(authUser
        ? await admin.auth.admin.updateUserById(authUser.id, authPayload)
        : await admin.auth.admin.createUser(authPayload));
      if (!authResult?.user?.id) throw new AccountError(502, 'The authentication service did not return an account ID. Please retry.');
      const profile = {
        auth_user_id: authResult.user.id, employee_id: employeeId, full_name: name,
        first_name: String(body.first_name ?? '').trim(), middle_name: String(body.middle_name ?? '').trim(), last_name: String(body.last_name ?? '').trim(), suffix: String(body.suffix ?? '').trim(),
        email, password: null, role: 'employee', outlet: existing?.outlet || String(body.outlet ?? '').trim() || null, is_active: true,
      };
      const saved = check(existing
        ? await admin.from('user_accounts').update(profile).eq('user_id', existing.user_id).select('user_id,email,employee_id,role,auth_user_id').single()
        : await admin.from('user_accounts').insert({ user_id: `USR-${new Date().getFullYear()}-${randomBytes(8).toString('hex').toUpperCase()}`, ...profile }).select('user_id,email,employee_id,role,auth_user_id').single());
      return send(200, { message: 'Employee login account is ready.', auth_user_id: authResult.user.id, user: saved });
    } catch (error) {
      const status = error instanceof AccountError ? error.status : 502;
      return send(status, { message: error.message || 'Employee account creation failed. Please retry.' });
    }
  };
}

export default createHiredAccountHandler();
