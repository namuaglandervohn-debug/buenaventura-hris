import assert from 'node:assert/strict';
import test from 'node:test';
import { getApplicationDestination, getJobApplicationEntryPath, getPostLoginPath } from '../resources/ts/app/lib/applicationNavigation.ts';

const origin = 'https://hris.example.test';
const position = 'Kitchen & Service / Café';

test('an HR admin applying from careers sees applicant login and can resume the selected position', () => {
  const login = new URL(getJobApplicationEntryPath(position, 'hr'), origin);
  assert.equal(login.pathname, '/login');

  const application = getApplicationDestination(login.searchParams.get('next'));
  assert.ok(application);
  assert.equal(getPostLoginPath('hr', application), null);

  const portal = new URL(getPostLoginPath('applicant', application), origin);
  assert.equal(portal.pathname, '/applicant');
  const form = new URL(portal.searchParams.get('next'), origin);
  assert.equal(form.pathname, '/apply');
  assert.equal(form.searchParams.get('position'), position);
});

test('application login handles guests and employee sessions, and signed-in applicants open the form', () => {
  const login = new URL(getJobApplicationEntryPath(position), origin);
  assert.equal(login.pathname, '/login');
  const application = getApplicationDestination(login.searchParams.get('next'));
  assert.ok(application);
  assert.equal(getPostLoginPath(undefined, application), null);
  assert.equal(getPostLoginPath('employee', application), null);

  const direct = new URL(getJobApplicationEntryPath(position, 'applicant'), origin);
  assert.equal(direct.pathname, '/apply');
  assert.equal(direct.searchParams.get('position'), position);
});

test('ordinary login routes by account role and rejects destinations outside the application form', () => {
  assert.equal(getApplicationDestination('/apply'), '/apply');
  for (const value of [null, '/dashboard', '/apply/other', '//example.test/apply', 'https://example.test/apply']) {
    const application = getApplicationDestination(value);
    assert.equal(application, null);
    assert.equal(getPostLoginPath('hr', application), '/dashboard');
    assert.equal(getPostLoginPath('applicant', application), '/applicant');
  }
});
