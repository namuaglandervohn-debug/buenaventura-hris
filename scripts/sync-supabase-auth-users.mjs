import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envPath = path.join(root, '.env');

if (fs.existsSync(envPath)) {
  const envText = fs.readFileSync(envPath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  (process.env.SUPABASE_PROJECT_REF ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co` : '');

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Add them to .env or the shell environment, then rerun this script.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const { data: accounts, error: accountsError } = await supabase
  .from('user_accounts')
  .select('user_id, auth_user_id, email, password, full_name, role, employee_id, is_active')
  .eq('is_active', true)
  .not('email', 'is', null);

if (accountsError) {
  if (
    accountsError.code === '42703' &&
    String(accountsError.message ?? '').includes('auth_user_id')
  ) {
    console.error('The live Supabase database is missing user_accounts.auth_user_id.');
    console.error('Run this migration in Supabase SQL Editor first:');
    console.error('database/migrations/2026_06_15_000002_link_user_accounts_to_supabase_auth_and_secure_payslips.sql');
    process.exit(1);
  }

  throw accountsError;
}

let created = 0;
let linked = 0;
let skipped = 0;

for (const account of accounts ?? []) {
  const email = String(account.email ?? '').trim().toLowerCase();
  const password = String(account.password ?? '');

  if (!email.includes('@')) {
    console.log(`SKIP ${account.user_id}: invalid email`);
    skipped += 1;
    continue;
  }

  let authUserId = account.auth_user_id;

  if (!authUserId) {
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = existingUsers.users.find(user => user.email?.toLowerCase() === email);
    authUserId = existing?.id;
  }

  if (!authUserId) {
    if (!password) {
      console.log(`SKIP ${email}: no temporary password in user_accounts`);
      skipped += 1;
      continue;
    }

    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: account.full_name,
        role: account.role,
        employee_id: account.employee_id,
      },
    });

    if (createError) {
      console.log(`FAIL ${email}: ${createError.message}`);
      skipped += 1;
      continue;
    }

    authUserId = createdUser.user?.id;
    created += 1;
  }

  if (!authUserId) {
    console.log(`SKIP ${email}: no auth user id returned`);
    skipped += 1;
    continue;
  }

  const { error: updateError } = await supabase
    .from('user_accounts')
    .update({ auth_user_id: authUserId, password: null })
    .eq('user_id', account.user_id);

  if (updateError) {
    console.log(`LINK_FAIL ${email}: ${updateError.message}`);
    skipped += 1;
    continue;
  }

  console.log(`LINK_OK ${email}`);
  linked += 1;
}

console.log(`Done. Created: ${created}. Linked: ${linked}. Skipped: ${skipped}.`);
