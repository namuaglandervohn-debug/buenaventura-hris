import { createClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { createTabAuthOptions } from './authStorage';

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  { auth: typeof window !== 'undefined' ? createTabAuthOptions(window.sessionStorage) : { persistSession: false } },
);
