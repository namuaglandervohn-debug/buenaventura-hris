import { supabase } from "./supabaseClient";

const EMPLOYEE_ID_YEAR = "2026";
const EMPLOYEE_ID_PATTERN = /^EMP-(\d{4})-(\d+)$/i;

export async function nextEmployeeId() {
  const { data, error } = await supabase
    .from("employees")
    .select("employee_id");

  if (error) throw error;

  const maxSequence = (data ?? []).reduce((max, row) => {
    const employeeId = String(row.employee_id ?? "").trim();
    const match = employeeId.match(EMPLOYEE_ID_PATTERN);
    if (!match || match[1] !== EMPLOYEE_ID_YEAR) return max;

    const sequence = Number(match[2]);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `EMP-${EMPLOYEE_ID_YEAR}-${String(maxSequence + 1).padStart(4, "0")}`;
}
