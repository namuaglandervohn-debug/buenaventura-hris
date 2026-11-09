import assert from 'node:assert/strict';
import test from 'node:test';
import { submitApplicant } from '../resources/ts/app/lib/submitApplicant.ts';

test('public applications submit without a login or profile and use the server tracking ID', async () => {
  const application = { first_name: 'Jane', last_name: 'Smith', email: 'jane@example.com', resume_file_data: 'resume' };
  const client = {
    from: () => assert.fail('Submission must not read private application records'),
    auth: { getSession: () => assert.fail('No applicant login is required') },
    async rpc(name, args) {
      assert.equal(name, 'submit_public_application');
      assert.deepEqual(args.p_application, application);
      return { data: 'APP-2026-0016', error: null };
    },
  };
  assert.equal(await submitApplicant(client, application), 'APP-2026-0016');
});

test('submission errors propagate without retrying an ambiguous save', async () => {
  const error = { message: 'Network request failed' };
  let calls = 0;
  await assert.rejects(submitApplicant({ rpc: async () => { calls++; return { data: null, error }; } }, {}), received => received === error);
  assert.equal(calls, 1);
});

test('missing or invalid tracking IDs never report success', async () => {
  for (const data of [null, {}, '', 'unknown', 'APP-2026-0016']) {
    const result = submitApplicant({ rpc: async () => ({ data, error: null }) }, {});
    if (data === 'APP-2026-0016') assert.equal(await result, data);
    else await assert.rejects(result, /did not return a tracking ID/);
  }
});
