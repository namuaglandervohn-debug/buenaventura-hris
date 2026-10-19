import assert from 'node:assert/strict';
import test from 'node:test';
import { submitApplicant } from '../resources/ts/app/lib/submitApplicant.ts';

const collision = { code: '23505', message: 'duplicate key value violates unique constraint "applicants_applicant_id_key"' };

function fakeClient(errors = []) {
  const inserted = [];
  return {
    inserted,
    from(table) {
      assert.equal(table, 'applicants');
      return {
        async insert(row) {
          inserted.push(row);
          return { error: errors[inserted.length - 1] ?? null };
        },
      };
    },
  };
}

test('IDs do not depend on row counts or deleted records; parallel inserts get distinct IDs', async () => {
  const client = fakeClient();
  const ids = await Promise.all(Array.from({ length: 200 }, () => submitApplicant(client, { name: 'Applicant' })));
  assert.equal(new Set(ids).size, 200);
  for (const id of ids) assert.match(id, new RegExp(`^APP-${new Date().getFullYear()}-[0-9A-F]{16}$`));
  assert.equal(client.inserted.length, 200);
  assert.equal(client.inserted[0].name, 'Applicant');
});

test('an ID collision retries with a fresh ID and preserves the application', async () => {
  const client = fakeClient([collision]);
  const id = await submitApplicant(client, { name: 'Applicant', resume_file_data: 'resume', applicant_id: 'old-id' });
  assert.equal(client.inserted.length, 2);
  assert.notEqual(client.inserted[0].applicant_id, id);
  assert.equal(client.inserted[1].applicant_id, id);
  assert.equal(client.inserted[1].resume_file_data, 'resume');
});

test('repeated collisions are bounded and produce an actionable message', async () => {
  const client = fakeClient(Array(5).fill(collision));
  await assert.rejects(submitApplicant(client, {}), /Your form is still available/);
  assert.equal(client.inserted.length, 5);
});

for (const error of [
  { code: '23505', message: 'duplicate key value violates unique constraint "applicants_email_key"' },
  { code: '42501', message: 'permission denied' },
  { code: '', message: 'Network request failed' },
]) {
  test(`other failures are returned without retry: ${error.message}`, async () => {
    const client = fakeClient([error]);
    await assert.rejects(submitApplicant(client, {}), (received) => received === error);
    assert.equal(client.inserted.length, 1);
  });
}
