import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ID_ATTEMPTS = 5;

function createApplicantId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `APP-${new Date().getFullYear()}-${suffix}`;
}

/** Insert only: a collision must never overwrite another applicant's record. */
export async function submitApplicant(
  client: Pick<SupabaseClient, 'from'>,
  application: Record<string, unknown>,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt++) {
    const applicantId = createApplicantId();
    const { error } = await client.from('applicants').insert({ ...application, applicant_id: applicantId });
    if (!error) return applicantId;

    // Retry only a confirmed applicant-ID collision, never other unique constraints
    // or ambiguous network failures where the original insert may have succeeded.
    const isIdCollision = error.code === '23505'
      && error.message.includes('"applicants_applicant_id_key"');
    if (!isIdCollision) throw error;
  }

  throw new Error('Unable to assign an applicant ID. Your form is still available; please submit again.');
}
