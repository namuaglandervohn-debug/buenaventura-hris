import type { SupabaseClient } from '@supabase/supabase-js';

/** Submit without an applicant account; allocate the tracking ID on the server. */
export async function submitApplicant(
  client: Pick<SupabaseClient, 'rpc'>,
  application: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await client.rpc('submit_public_application', { p_application: application });
  if (error) throw error;
  if (typeof data !== 'string' || !/^APP-\d{4}-\d{4,9}$/.test(data)) {
    throw new Error('The application service did not return a tracking ID. Your form is still available; please try again.');
  }
  return data;
}
