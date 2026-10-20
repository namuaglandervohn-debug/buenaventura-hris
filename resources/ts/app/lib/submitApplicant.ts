import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ID_ATTEMPTS = 20;
const PAGE_SIZE = 1000;

/** Read every page and compare numerically; row counts and lexical sorting are
 * unreliable after deletions and when a sequence grows beyond four digits. */
export async function nextApplicantNumber(client: Pick<SupabaseClient, 'from'>, year: number): Promise<number> {
  let maximum = 0;
  // Previously issued random IDs have a 16-character suffix and are not counters.
  const numberedId = new RegExp(`^APP-${year}-(\\d{4,9})$`);
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client.from('applicants').select('applicant_id')
      .like('applicant_id', `APP-${year}-%`).order('applicant_id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      const match = numberedId.exec(row.applicant_id);
      if (match) maximum = Math.max(maximum, Number(match[1]));
    }
    if ((data?.length ?? 0) < PAGE_SIZE) return maximum + 1;
  }
}

/** Insert only: a collision must never overwrite another applicant's record. */
export async function submitApplicant(
  client: Pick<SupabaseClient, 'from'>,
  application: Record<string, unknown>,
): Promise<string> {
  const year = new Date().getFullYear();
  let nextNumber = await nextApplicantNumber(client, year);
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const applicantId = `APP-${year}-${String(nextNumber).padStart(4, '0')}`;
    const { error } = await client.from('applicants').insert({ ...application, applicant_id: applicantId });
    if (!error) return applicantId;

    // Retry only a confirmed applicant-ID collision, never other unique constraints
    // or ambiguous network failures where the original insert may have succeeded.
    const isIdCollision = error.code === '23505'
      && error.message.includes('"applicants_applicant_id_key"');
    if (!isIdCollision) throw error;
    // Another submission may have claimed this number. The database unique
    // constraint decides the winner; retry with its latest maximum, never upsert.
    await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
    nextNumber = Math.max(nextNumber + 1, await nextApplicantNumber(client, year));
  }

  throw new Error('Unable to assign an applicant ID. Your form is still available; please submit again.');
}
