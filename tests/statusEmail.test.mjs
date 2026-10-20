import assert from 'node:assert/strict';
import test from 'node:test';
import { handleStatusEmail } from '../api/applications/send-status-email.js';
import { sendApplicationStatusEmail } from '../resources/ts/app/lib/sendApplicationStatusEmail.ts';
import { readableErrorMessage } from '../resources/ts/app/lib/apiError.ts';

const payload = { applicant_id: 'APP-2026-0016', email: 'applicant@example.com', name: 'Applicant', position: 'Staff', status: 'Under Review', note: 'Submitted: Resume, Birth Certificate\nHR note: ready for review', interview_date: '', interview_time: '', interview_location: '' };
async function invoke(fetcher, body = payload, env = { RESEND_API_KEY: ' test-key\n' }, method = 'POST') {
  const response = { status(code) { this.code = code; return this; }, setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
  await handleStatusEmail({ method, body }, response, { fetcher, env });
  return response;
}

test('Save Requirements email includes the checklist note, applicant ID, position and current status', async () => {
  const response = await invoke(async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const mail = JSON.parse(options.body);
    assert.deepEqual(mail.to, ['applicant@example.com']);
    assert.match(mail.html, /APP-2026-0016/);
    assert.match(mail.html, /Under Review/);
    assert.match(mail.text, /HR note: ready for review/);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ id: 'status-mail-id' });
  });
  assert.equal(response.code, 200);
  assert.equal(response.body.sent, true);
});

test('renders missing requirements, interview details and terminal statuses safely', async () => {
  for (const status of ['Missing Requirements', 'For Interview', 'Not Qualified', 'Archived']) {
    const response = await invoke(async (_url, options) => {
      const mail = JSON.parse(options.body);
      assert.ok(mail.text.includes(status));
      assert.match(mail.html, /&lt;script&gt;/);
      assert.ok(!mail.html.includes('<script>'));
      assert.match(mail.text, /2026-10-21/);
      assert.match(mail.text, /Main Office/);
      return Response.json({ id: 'mail-id' });
    }, { ...payload, status, note: '<script>Test & note</script>', interview_date: '2026-10-21', interview_time: '09:00', interview_location: 'Main Office' });
    assert.equal(response.body.sent, true);
  }
});

test('rejects invalid request bodies before contacting the provider', async () => {
  const neverFetch = () => assert.fail('Provider must not be called');
  assert.equal((await invoke(neverFetch, payload, {}, 'GET')).code, 405);
  assert.equal((await invoke(neverFetch, '{broken')).code, 400);
  for (const bad of [{ status: 'Unknown' }, { email: 'invalid' }, { note: {} }, { applicant_id: '' }]) {
    assert.equal((await invoke(neverFetch, { ...payload, ...bad })).code, 422);
  }
  assert.equal((await invoke(neverFetch, payload, {})).code, 503);
});

test('allows a generated checklist note longer than 1000 characters', async () => {
  const response = await invoke(async () => Response.json({ id: 'mail-id' }), { ...payload, note: 'Detailed checklist. '.repeat(100) });
  assert.equal(response.code, 200);
});

test('provider objects, malformed responses and connection failures return readable failures', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const rejected = await invoke(async () => Response.json({ error: { message: 'Sender domain is not verified.' } }, { status: 403 }));
  assert.equal(rejected.body.message, 'Sender domain is not verified.');
  assert.equal(rejected.body.sent, false);
  assert.equal((await invoke(async () => new Response('<html>Bad gateway</html>'))).body.sent, false);
  assert.equal((await invoke(async () => { throw new Error('Timeout'); })).code, 503);
});

test('client flattens object errors and identifies a missing hosted endpoint', async () => {
  await assert.rejects(sendApplicationStatusEmail(payload, async () => Response.json({ error: { message: 'Email rejected.' } }, { status: 502 })), /Email rejected\./);
  await assert.rejects(sendApplicationStatusEmail(payload, async () => new Response('NOT_FOUND', { status: 404 })), /status email endpoint is unavailable/);
  assert.equal(readableErrorMessage({ message: { error: { message: 'Actual error' } } }, 'Fallback'), 'Actual error');
  assert.equal(readableErrorMessage({}, 'Fallback'), 'Fallback');
});

test('client only reports success when sending was acknowledged', async () => {
  await sendApplicationStatusEmail(payload, async () => Response.json({ sent: true }));
  await sendApplicationStatusEmail(payload, async () => Response.json({ resend: { id: 'legacy-laravel-id' } }));
  for (const response of [Response.json({ sent: false }), new Response('<html>SPA fallback</html>')]) {
    await assert.rejects(sendApplicationStatusEmail(payload, async () => response), /did not confirm/);
  }
});
