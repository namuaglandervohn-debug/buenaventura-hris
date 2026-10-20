import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApplicantEmail } from '../api/applications/send-applicant-id-email.js';
import { submitApplicantWithConfirmation, sendApplicantConfirmation, CONFIRMATION_EMAIL_NOTICE } from '../resources/ts/app/lib/submitApplicantWithConfirmation.ts';

const payload = { applicantId: 'APP-2026-ABC123', email: 'applicant@example.com', name: 'Applicant', position: 'Staff' };
const fakeDatabase = (error = null) => {
  const rows = [];
  return { rows, from(table) {
    assert.equal(table, 'applicants');
    return {
      async insert(row) { if (!error) rows.push(row); return { error }; },
      delete() { assert.fail('Email failure must never delete an application'); },
    };
  } };
};

test('saved application and ID survive an invalid mail key, with no database rollback', async () => {
  const db = fakeDatabase();
  let displayedId;
  const result = await submitApplicantWithConfirmation(db, { name: payload.name, resume_file_data: 'resume' }, {
    onSaved: (id) => { displayedId = id; },
    sendConfirmation: async () => { throw new Error('API key is invalid'); },
  });
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0].resume_file_data, 'resume');
  assert.equal(result.applicantId, displayedId);
  assert.equal(db.rows[0].applicant_id, displayedId);
  assert.equal(result.emailNotice, CONFIRMATION_EMAIL_NOTICE);
  assert.ok(!result.emailNotice.includes('API key'));
});

test('tracking ID is displayed before slow email delivery completes', async () => {
  const db = fakeDatabase();
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  let displayedId;
  let completed = false;
  const submission = submitApplicantWithConfirmation(db, {}, {
    onSaved: (id) => { displayedId = id; }, sendConfirmation: () => pending,
  }).then((result) => { completed = true; return result; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(displayedId, db.rows[0].applicant_id);
  assert.equal(completed, false);
  finish();
  assert.equal((await submission).emailNotice, '');
});

test('database failure is still a failed submission, with no email or success callback', async () => {
  const db = fakeDatabase({ message: 'Database unavailable' });
  await assert.rejects(submitApplicantWithConfirmation(db, {}, {
    onSaved: () => assert.fail('Must not show success'),
    sendConfirmation: () => assert.fail('Must not send email'),
  }), (error) => error.message === 'Database unavailable');
});

test('client requires an explicit sent acknowledgement, not an HTML fallback or skipped email', async () => {
  for (const response of [Response.json({ sent: false }), new Response('<html>fallback</html>'), Response.json({ message: 'API key is invalid' }, { status: 503 })]) {
    await assert.rejects(sendApplicantConfirmation(payload, async () => response), /not delivered/);
  }
  await sendApplicantConfirmation(payload, async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(JSON.parse(options.body).applicant_id, payload.applicantId);
    return Response.json({ sent: true });
  });
});

async function invokeEmail(fetcher, env = { RESEND_API_KEY: ' test-resend-key\n' }) {
  const response = {
    headers: {}, status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); },
  };
  await handleApplicantEmail({ method: 'POST', body: { applicant_id: payload.applicantId, email: payload.email, name: payload.name, position: payload.position } }, response, { env, fetcher });
  return response;
}

test('email endpoint trims server credentials and acknowledges accepted email', async () => {
  const response = await invokeEmail(async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer test-resend-key');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ id: 'mail-id' });
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.sent, true);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('invalid mail key is handled without exposing provider configuration errors to applicants', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const response = await invokeEmail(async () => Response.json({ message: 'API key is invalid', name: 'validation_error' }, { status: 401 }));
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.sent, false);
  assert.equal(response.body.code, 'EMAIL_SERVICE_UNAVAILABLE');
  assert.ok(!response.body.message.includes('API key'));
});

test('missing credentials, network failures and malformed provider responses are controlled failures', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const missing = await invokeEmail(() => assert.fail('Must not call provider'), {});
  assert.equal(missing.body.sent, false);
  for (const fetcher of [async () => { throw new Error('Request timed out'); }, async () => new Response('<html>Bad gateway</html>'), async () => Response.json({})]) {
    const response = await invokeEmail(fetcher);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.sent, false);
  }
});
