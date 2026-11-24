import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthApiError } from '@supabase/supabase-js';
import { getAuthEmailCallback, getAuthEmailLoginPath, getSignInErrorMessage } from '../resources/ts/app/lib/authEmail.ts';
import { applicantConfirmationRedirect, employeeConfirmationRedirect } from '../resources/ts/app/lib/applicantConfirmationRedirect.ts';
import { getHrisEmailUrl } from '../lib/emails/hris-url.js';

const authUrl = 'https://abcdefghijklmnopqrst.supabase.co';
const otherProject = 'https://zyxwvutsrqponmlkjihg.supabase.co';
const application = '/apply?position=Kitchen%20%26%20Service';

function callback(type, issuer = authUrl) {
  const claims = Buffer.from(JSON.stringify({ iss: `${issuer}/auth/v1` })).toString('base64url');
  return `#type=${type}&access_token=header.${claims}.signature&refresh_token=fixture`;
}

test('confirmation and recovery stay on the initiating site and preserve the job selection', () => {
  for (const origin of ['http://localhost:5173', 'https://hris.example.test', 'https://preview.example.test']) {
    const confirmation = new URL(applicantConfirmationRedirect(origin, application));
    assert.equal(confirmation.origin, origin);
    assert.equal(confirmation.pathname, '/applicant');
    assert.equal(confirmation.searchParams.get('next'), application);
    const login = new URL(getAuthEmailLoginPath(confirmation.search), origin);
    assert.equal(login.pathname, '/login');
    assert.equal(login.searchParams.get('next'), application);
    assert.equal(employeeConfirmationRedirect(origin), `${origin}/login?employeeRegistration=1`);
  }
  assert.equal(getAuthEmailLoginPath('?employeeRegistration=1&next=https://another.example/apply'), '/login?employeeRegistration=1');
});

test('email callbacks distinguish confirmation, recovery, provider errors and a different Auth project', () => {
  assert.equal(getAuthEmailCallback(callback('signup'), authUrl), 'signup');
  assert.equal(getAuthEmailCallback(callback('recovery'), authUrl), 'recovery');
  assert.equal(getAuthEmailCallback(callback('signup', otherProject), authUrl), 'wrong-project');
  assert.equal(getAuthEmailCallback(callback('recovery', otherProject), authUrl), 'wrong-project');
  assert.equal(getAuthEmailCallback('#error=access_denied&error_code=otp_expired', authUrl), 'invalid-link');
  assert.equal(getAuthEmailCallback('#type=signup&access_token=incomplete', authUrl), 'invalid-link');
  assert.equal(getAuthEmailCallback('#jobs', authUrl), null);
});

test('Auth error codes separate an unconfirmed address from a credential rejection', () => {
  assert.match(getSignInErrorMessage(new AuthApiError('Provider message', 400, 'email_not_confirmed')), /confirmation is still pending/);
  assert.match(getSignInErrorMessage(new AuthApiError('Provider message', 400, 'invalid_credentials')), /Forgot password/);
  assert.equal(getSignInErrorMessage(new Error('This account uses a different sign-in option.')), 'This account uses a different sign-in option.');
});

test('staff email links select the configured environment and reject unusable origins', () => {
  const env = { APP_URL: 'https://hris.example.test', VERCEL_URL: 'preview.example.test', VERCEL_PROJECT_PRODUCTION_URL: 'hris.example.test' };
  assert.equal(getHrisEmailUrl({ ...env, VERCEL_ENV: 'production' }, '/login'), 'https://hris.example.test/login');
  assert.equal(getHrisEmailUrl({ ...env, VERCEL_ENV: 'preview' }, '/applicant'), 'https://preview.example.test/applicant');
  assert.equal(getHrisEmailUrl({ ...env, HRIS_EMAIL_ORIGIN: 'https://staff.example.test' }, '/login'), 'https://staff.example.test/login');
  assert.equal(getHrisEmailUrl({ APP_URL: 'http://localhost:8080' }, '/applicant'), 'http://localhost:8080/applicant');
  assert.equal(getHrisEmailUrl({ APP_URL: 'javascript:invalid' }, '/login'), null);
  assert.equal(getHrisEmailUrl({}, '/login'), null);
});
