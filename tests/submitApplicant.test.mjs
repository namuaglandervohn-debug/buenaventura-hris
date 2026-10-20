import assert from 'node:assert/strict';
import test from 'node:test';
import { submitApplicant, nextApplicantNumber } from '../resources/ts/app/lib/submitApplicant.ts';

const year = new Date().getFullYear();
const id = (number) => `APP-${year}-${String(number).padStart(4, '0')}`;
const collision = { code: '23505', message: 'duplicate key value violates unique constraint "applicants_applicant_id_key"' };

function fakeClient(errors = [], initialIds = []) {
  const inserted = [];
  const records = initialIds.map((applicant_id) => ({ applicant_id }));
  const reads = [];
  return {
    inserted, records, reads,
    from(table) {
      assert.equal(table, 'applicants');
      return {
        select(columns) { assert.equal(columns, 'applicant_id'); return this; },
        like(_column, pattern) { this.prefix = pattern.slice(0, -1); return this; },
        order() { return this; },
        async range(start, end) {
          reads.push([start, end]);
          return { data: records.filter((row) => row.applicant_id.startsWith(this.prefix)).toSorted((a, b) => a.applicant_id.localeCompare(b.applicant_id)).slice(start, end + 1), error: null };
        },
        async insert(row) {
          inserted.push(row);
          const error = errors[inserted.length - 1] ?? null;
          if (error === collision) records.push({ applicant_id: row.applicant_id });
          if (error) return { error };
          if (records.some((record) => record.applicant_id === row.applicant_id)) return { error: collision };
          records.push(row);
          return { error: null };
        },
      };
    },
  };
}

test('continues the screenshot sequence at 0016, ignoring missing rows and legacy random IDs', async () => {
  const client = fakeClient([], [id(2), id(15), id(6), `APP-${year}-47E70185990E2033`, `APP-${year}-1234567890123456`]);
  assert.equal(await submitApplicant(client, { name: 'Applicant' }), id(16));
  assert.equal(client.inserted[0].name, 'Applicant');
});

test('simultaneous submissions receive distinct sequential IDs', async () => {
  const client = fakeClient([], [id(15)]);
  const ids = await Promise.all(Array.from({ length: 50 }, () => submitApplicant(client, { name: 'Applicant' })));
  assert.equal(new Set(ids).size, 50);
  assert.deepEqual(ids.toSorted(), Array.from({ length: 50 }, (_, index) => id(index + 16)));
});

test('an ID collision retries the latest sequence and preserves the application', async () => {
  const client = fakeClient([collision], [id(15)]);
  const actual = await submitApplicant(client, { name: 'Applicant', resume_file_data: 'resume', applicant_id: 'old-id' });
  assert.equal(actual, id(17));
  assert.equal(client.inserted.length, 2);
  assert.equal(client.inserted[1].resume_file_data, 'resume');
});

test('checks all pages and compares numbers correctly beyond four digits', async () => {
  const client = fakeClient([], [...Array.from({ length: 1001 }, (_, index) => id(index + 1)), id(9999), id(10000)]);
  assert.equal(await nextApplicantNumber(client, year), 10001);
  assert.equal(client.reads.length, 2);
});

test('starts a new year at 0001 without using a previous-year maximum', async () => {
  const client = fakeClient([], [`APP-${year - 1}-9999`]);
  assert.equal(await submitApplicant(client, {}), id(1));
});

test('repeated collisions are bounded and produce an actionable message', async () => {
  const client = fakeClient(Array(20).fill(collision));
  await assert.rejects(submitApplicant(client, {}), /Your form is still available/);
  assert.equal(client.inserted.length, 20);
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

test('a failed sequence lookup does not attempt to save with a guessed ID', async () => {
  const error = { message: 'Lookup unavailable' };
  const client = { from: () => ({ select() { return this; }, like() { return this; }, order() { return this; }, range: async () => ({ data: null, error }) }) };
  await assert.rejects(submitApplicant(client, {}), (received) => received === error);
});
