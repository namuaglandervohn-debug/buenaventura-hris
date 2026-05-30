import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, CircularProgress,
  Alert, Tooltip, IconButton, MenuItem,
} from '@mui/material';
import { Calculate, Visibility, Send, AddCircleOutline, Sync, Payments, TaskAlt, DeleteOutline, Print } from '@mui/icons-material';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { POSITIONS } from '../../lib/constants';
import ActionSnackbar from '../ActionSnackbar';

// ── Position → Default Monthly Salary mapping ────────────────────────────
const POSITION_SALARIES: Record<string, number> = {
  'General Manager': 65000, 'Assistant General Manager': 50000,
  'Operations Manager': 45000, 'Front Office & Sales Supervisor': 35000,
  'Chef/Cook': 22000, 'Commis Chef': 18000, 'Dispatcher/Steward': 16000,
  'Public/Room Attendant': 15000, 'Pool Attendant': 15000,
  'Laundry Attendant': 15000, 'Gardener': 15000,
  'HR and Admin Manager': 40000,
  'Driver/Liaison': 18000, 'Purchaser': 20000, 'Stockman': 16000,
  'Accounting and Finance Manager': 45000, 'Accounting Officer': 28000,
  'Finance Officer': 28000, 'Compliance Officer': 28000,
  'Service Crew': 15000, 'Sales Associate': 16000, 'Cashier': 16000,
  'HR Assistant': 18000, 'Security Guard': 16000, 'Maintenance Staff': 15000,
};

const AVAILABLE_POSITIONS = POSITIONS.filter(position => position !== 'Payroll Staff');

interface Payroll {
  id: string;
  displayId?: string;
  payrollId?: string;
  payrollItemId?: string;
  employeeId?: string;
  attendanceSummaryId?: string | null;
  employee: string;
  position: string;
  outlet?: string;
  period: string;
  cutoffLabel?: string;
  totalHours: string;
  overtime: string;
  deductions: string;
  grossPay: string;
  netPay: string;
  status: 'Draft' | 'For Review' | 'Processed' | 'Released';
  // Extended payslip fields
  payslipDate?: string;
  basicPayAmt?: string;
  otAmt?: string;
  nsdHours?: string; nsdAmt?: string;
  regularHolidayDays?: string; regularHolidayAmt?: string;
  specialHolidayDays?: string; specialHolidayAmt?: string;
  silDays?: string; silAmt?: string;
  allowanceAmt?: string;
  retroAmt?: string;
  tardinessMin?: string;
  undertimeHours?: string;
  sssAmt?: string;
  phicAmt?: string;
  hdmfAmt?: string;
  cashAdvance?: string;
  atd?: string;
  otherCharges?: string;
  breakages?: string;
  amesco?: string;
  pagibigLoan?: string;
}

interface EmployeeOption {
  employeeId: string;
  name: string;
  position: string;
  outlet: string;
  salary?: string | number | null;
}

const EMPTY = { employee: '', position: '', period: new Date().toISOString().slice(0, 7), totalHours: '', overtime: '0', deductions: '0', grossPay: '', netPay: '' };

const money = (value: number | string | null | undefined) => {
  const n = typeof value === 'number'
    ? value
    : parseFloat(String(value ?? '').replace(/[₱,]/g, '')) || 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const toNumber = (value: number | string | null | undefined) =>
  typeof value === 'number'
    ? value
    : parseFloat(String(value ?? '').replace(/[₱,]/g, '')) || 0;

const dbStatusToUi = (status?: string | null): Payroll['status'] => {
  switch ((status ?? '').toLowerCase()) {
    case 'reviewed':
      return 'For Review';
    case 'approved':
      return 'Processed';
    case 'endorsed':
    case 'exported':
      return 'Released';
    case 'draft':
    default:
      return 'Draft';
  }
};

const uiStatusToDb = (status: string) => {
  switch (status) {
    case 'For Review':
      return 'Reviewed';
    case 'Processed':
      return 'Approved';
    case 'Released':
      return 'Endorsed';
    case 'Draft':
    default:
      return 'Draft';
  }
};

const formatPayrollDisplayId = (payrollId?: string | null, periodStart?: string | null, fallbackIndex = 1) => {
  const year = String(periodStart ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
  const raw = String(payrollId ?? '').trim();
  const formatted = raw.match(/^PAY-(\d{4})-(\d+)$/i);
  if (formatted) return `PAY-${formatted[1]}-${String(Number(formatted[2])).padStart(4, '0')}`;
  const numberMatch = raw.match(/(\d+)$/);
  const seq = numberMatch ? Number(numberMatch[1]) : fallbackIndex;
  return `PAY-${year}-${String(seq || fallbackIndex).padStart(4, '0')}`;
};

const formatPayrollDisplayIdFromEmployee = (employeeId?: string | null, periodStart?: string | null, fallbackPayrollId?: string | null) => {
  const rawEmployeeId = String(employeeId ?? '').trim();
  const employeeMatch = rawEmployeeId.match(/^EMP-(\d{4})-(\d+)$/i);
  if (employeeMatch) return `PAY-${employeeMatch[1]}-${String(Number(employeeMatch[2])).padStart(4, '0')}`;

  const trailingNumber = rawEmployeeId.match(/(\d+)$/);
  if (trailingNumber) {
    const year = String(periodStart ?? new Date().toISOString().slice(0, 10)).slice(0, 4);
    return `PAY-${year}-${String(Number(trailingNumber[1])).padStart(4, '0')}`;
  }

  return formatPayrollDisplayId(fallbackPayrollId, periodStart);
};

const parseSalaryRate = (value: unknown) => {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '').replace(/,/g, '');
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) return 0;
  return Number(matches[0]) || 0;
};

const roundMoney = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));

const fullNameFromEmployee = (row: any) => [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
  .map((part) => String(part ?? '').trim())
  .filter(Boolean)
  .join(' ');

const getEmployeeOutlet = (employee: any, userAccountOutlet?: string | null) =>
  String(userAccountOutlet ?? employee?.outlet ?? '').trim();

const statusColor = (status: Payroll['status']) => {
  if (status === 'Released') return 'success';
  if (status === 'Processed') return 'info';
  if (status === 'For Review') return 'warning';
  return 'default';
};

const GREEN_UI = {
  pageBg: 'radial-gradient(circle at top left, rgba(220, 246, 219, 0.95), rgba(248, 252, 245, 0.98) 34%, #f7fbf3 100%)',
  cardBg: 'rgba(255, 255, 255, 0.92)',
  cardBgSoft: 'rgba(245, 252, 241, 0.88)',
  border: 'rgba(139, 184, 144, 0.24)',
  borderStrong: 'rgba(73, 156, 92, 0.32)',
  green: '#3aa865',
  greenDark: '#1f7a46',
  greenSoft: '#e6f8e9',
  text: '#1e2d24',
  muted: '#6c7d70',
  shadow: '0 20px 55px rgba(43, 91, 55, 0.10)',
  shadowSoft: '0 12px 28px rgba(43, 91, 55, 0.08)',
};

const softCardSx = {
  borderRadius: '26px',
  border: `1px solid ${GREEN_UI.border}`,
  background: GREEN_UI.cardBg,
  boxShadow: GREEN_UI.shadow,
};

const innerCardSx = {
  borderRadius: '20px',
  border: `1px solid ${GREEN_UI.border}`,
  bgcolor: '#ffffff',
  boxShadow: GREEN_UI.shadowSoft,
};

const pillButtonSx = {
  borderRadius: '12px',
  textTransform: 'none',
  fontWeight: 600,
  px: 2,
};

const softTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '16px',
    backgroundColor: '#fbfef9',
    transition: 'all 180ms ease',
    '& fieldset': { borderColor: GREEN_UI.border },
    '&:hover fieldset': { borderColor: GREEN_UI.borderStrong },
    '&.Mui-focused fieldset': { borderColor: GREEN_UI.green, borderWidth: 1.5 },
    '&.Mui-disabled': { backgroundColor: '#f6fbf4' },
  },
  '& .MuiInputLabel-root': { color: GREEN_UI.muted },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: GREEN_UI.text },
};

const dialogPaperSx = {
  borderRadius: { xs: '22px', sm: '30px' },
  overflow: 'hidden',
  border: `1px solid ${GREEN_UI.border}`,
  background: '#fbfff9',
  boxShadow: '0 28px 70px rgba(27, 73, 37, 0.18)',
};

const dialogTitleSx = {
  px: { xs: 2, sm: 3 },
  py: 2.25,
  background: 'linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)',
  borderBottom: `1px solid ${GREEN_UI.border}`,
  color: GREEN_UI.text,
};

const payrollStatusChipSx = (status: Payroll['status']) => {
  const styles: Record<Payroll['status'], { bg: string; color: string; border: string }> = {
    Draft: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da' },
    'For Review': { bg: '#fff7e0', color: '#9b6b00', border: '#f5d786' },
    Processed: { bg: '#e9f6ff', color: '#1d6f9c', border: '#b7dff7' },
    Released: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
  };

  const selected = styles[status] ?? styles.Draft;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25 },
  };
};

const getMonthRange = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
    year,
  };
};

const monthFromDate = (dateValue?: string | null) =>
  dateValue ? dateValue.slice(0, 7) : new Date().toISOString().slice(0, 7);

const parsePayslipDetails = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, string>;
};

export default function PayrollComputation() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [viewDialog, setViewDialog] = useState(false);
  const [addDialog, setAddDialog] = useState(false);
  const [generateDialog, setGenerateDialog] = useState(false);
  const [generatePeriod, setGeneratePeriod] = useState(new Date().toISOString().slice(0, 7));
  const [generateBase, setGenerateBase] = useState('510');
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const { user } = useAuth();
  const [generatePosition, setGeneratePosition] = useState('');
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);

  // ── Payslip edit state ───────────────────────────────────────────────
  const [editingPayslip, setEditingPayslip] = useState(false);
  const EDIT_EMPTY = {
    employee: '', position: '', period: '',
    payslipDate: '',
    totalHours: '', basicPayAmt: '',
    overtime: '', otAmt: '',
    nsdHours: '', nsdAmt: '',
    regularHolidayDays: '', regularHolidayAmt: '',
    specialHolidayDays: '', specialHolidayAmt: '',
    silDays: '', silAmt: '',
    allowanceAmt: '', retroAmt: '',
    tardinessMin: '', undertimeHours: '',
    grossPay: '',
    sssAmt: '', phicAmt: '', hdmfAmt: '',
    cashAdvance: '', atd: '', otherCharges: '', breakages: '', amesco: '', pagibigLoan: '',
    deductions: '', netPay: '',
  };
  const [payslipEditForm, setPayslipEditForm] = useState(EDIT_EMPTY);
  const pef = (k: keyof typeof EDIT_EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setPayslipEditForm(f => ({ ...f, [k]: e.target.value }));

  const currentUserName = (user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.email ?? 'System User';
  const currentUserRole = (user as any)?.role ?? 'user';
  const normalizedRole = String(currentUserRole).toLowerCase();
  const isHRAdmin = normalizedRole === 'hr_admin' || normalizedRole.includes('hr') || normalizedRole.includes('admin');
  const isAccountingFinance = normalizedRole === 'accounting_finance' || normalizedRole.includes('accounting') || normalizedRole.includes('finance');
  const isGeneralManager = normalizedRole === 'general_manager' || normalizedRole.includes('general_manager') || normalizedRole.includes('general manager');
  const isEmployee = normalizedRole === 'employee' || normalizedRole.includes('employee');
  const canManagePayroll = isHRAdmin || isGeneralManager;
  const canReleasePayroll = isAccountingFinance || isGeneralManager;

  const resolveCurrentUserAccountUserId = async (): Promise<string | null> => {
    const authUser = user as any;
    if (!authUser) return null;

    const tryLookup = async (column: string, value: unknown) => {
      const cleanValue = String(value ?? '').trim();
      if (!cleanValue) return null;

      const { data, error } = await supabase
        .from('user_accounts')
        .select('user_id')
        .eq(column, cleanValue)
        .maybeSingle();

      if (error) {
        console.warn(`Could not verify user_accounts.${column}:`, error.message);
        return null;
      }

      return data?.user_id ? String(data.user_id) : null;
    };

    return (
      await tryLookup('user_id', authUser.user_id) ||
      await tryLookup('id', authUser.id) ||
      await tryLookup('email', authUser.email) ||
      await tryLookup('employee_id', authUser.employee_id) ||
      null
    );
  };

  const getNextPayrollId = async (year: number | string) => {
    const yearText = String(year);
    const { data, error } = await supabase
      .from('payroll_summaries')
      .select('payroll_id')
      .ilike('payroll_id', `PAY-${yearText}-%`);

    if (error) throw error;

    const maxSeq = (data ?? []).reduce((max: number, row: any) => {
      const match = String(row?.payroll_id ?? '').match(new RegExp(`^PAY-${yearText}-(\\d+)$`, 'i'));
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    return `PAY-${yearText}-${String(maxSeq + 1).padStart(4, '0')}`;
  };

  const mapItemToPayroll = (item: any, summariesById: Map<string, any>, employeesById = new Map<string, any>(), accountOutletsByEmployeeId = new Map<string, string>()): Payroll => {
    const summary = summariesById.get(item.payroll_id);
    const details = parsePayslipDetails(item.payslip_details);
    const employee = employeesById.get(item.employee_id);
    const displayId = formatPayrollDisplayIdFromEmployee(item.employee_id, summary?.period_start, item.payroll_id);

    return {
      id: item.payroll_item_id,
      displayId,
      payrollId: item.payroll_id,
      payrollItemId: item.payroll_item_id,
      employeeId: item.employee_id,
      attendanceSummaryId: item.attendance_summary_id,
      employee: item.employee_name || fullNameFromEmployee(employee) || item.employee_id || 'Unnamed Employee',
      position: item.position || employee?.position || '',
      outlet: String(item.outlet ?? '').trim() || getEmployeeOutlet(employee, accountOutletsByEmployeeId.get(item.employee_id)),
      period: monthFromDate(summary?.period_start),
      cutoffLabel: summary?.cutoff_label ?? '',
      totalHours: String(item.total_work_hours ?? item.regular_hours ?? '0'),
      overtime: String(item.overtime_hours ?? '0'),
      deductions: money(item.total_deductions),
      grossPay: money(item.gross_pay),
      netPay: money(item.net_pay),
      status: dbStatusToUi(summary?.status),
      payslipDate: summary?.endorsed_at ? String(summary.endorsed_at).slice(0, 10) : undefined,
      basicPayAmt: money(item.basic_pay),
      otAmt: money(item.overtime_pay),
      tardinessMin: String(item.total_late_minutes ?? ''),
      undertimeHours: item.total_undertime_minutes ? String(Number(item.total_undertime_minutes) / 60) : '',
      nsdHours: details.nsdHours ?? '',
      nsdAmt: details.nsdAmt ?? '',
      regularHolidayDays: details.regularHolidayDays ?? '',
      regularHolidayAmt: details.regularHolidayAmt ?? '',
      specialHolidayDays: details.specialHolidayDays ?? '',
      specialHolidayAmt: details.specialHolidayAmt ?? '',
      silDays: details.silDays ?? '',
      silAmt: details.silAmt ?? '',
      allowanceAmt: details.allowanceAmt ?? '',
      retroAmt: details.retroAmt ?? '',
      sssAmt: details.sssAmt ?? '',
      phicAmt: details.phicAmt ?? '',
      hdmfAmt: details.hdmfAmt ?? '',
      cashAdvance: details.cashAdvance ?? '',
      atd: details.atd ?? '',
      otherCharges: details.otherCharges ?? '',
      breakages: details.breakages ?? '',
      amesco: details.amesco ?? '',
      pagibigLoan: details.pagibigLoan ?? '',
    };
  };

  const fetchPayroll = async () => {
    setLoading(true); setError(null);
    try {
      const { data: summaries, error: summariesError } = await supabase
        .from('payroll_summaries')
        .select('payroll_id, period_start, period_end, cutoff_label, status, endorsed_at, reviewed_at, created_at')
        .order('period_start', { ascending: false });

      if (summariesError) throw summariesError;

      const summaryMap = new Map<string, any>((summaries ?? []).map((s: any) => [s.payroll_id, s]));

      const { data: items, error: itemsError } = await supabase
        .from('payroll_items')
        .select(`
          payroll_item_id,
          payroll_id,
          attendance_summary_id,
          employee_id,
          employee_name,
          position,
          outlet,
          salary_rate,
          total_work_hours,
          regular_hours,
          overtime_hours,
          total_late_minutes,
          total_undertime_minutes,
          total_absent_days,
          total_incomplete_days,
          basic_pay,
          overtime_pay,
          late_deduction,
          undertime_deduction,
          absence_deduction,
          other_deductions,
          gross_pay,
          total_deductions,
          net_pay,
          remarks,
          payslip_details,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;

      const employeeIds = [...new Set((items ?? []).map((item: any) => String(item.employee_id ?? '')).filter(Boolean))];
      let employeeMap = new Map<string, any>();
      let accountOutletMap = new Map<string, string>();

      if (employeeIds.length > 0) {
        const { data: employees, error: employeesError } = await supabase
          .from('employees')
          .select('employee_id, first_name, middle_name, last_name, suffix, position, outlet')
          .in('employee_id', employeeIds);

        if (employeesError) throw employeesError;
        employeeMap = new Map<string, any>((employees ?? []).map((employee: any) => [employee.employee_id, employee]));

        const { data: userAccounts, error: userAccountsError } = await supabase
          .from('user_accounts')
          .select('employee_id, outlet')
          .in('employee_id', employeeIds);

        if (userAccountsError) throw userAccountsError;
        accountOutletMap = new Map<string, string>((userAccounts ?? []).map((account: any) => [account.employee_id, String(account.outlet ?? '').trim()]));
      }

      const mapped = (items ?? []).map((item: any) => mapItemToPayroll(item, summaryMap, employeeMap, accountOutletMap));
      const seen = new Set<string>();
      setPayrolls(mapped.filter((p: Payroll) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      }));
    } catch (e: any) {
      setError(`Could not load payroll: ${e.message ?? e}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPayroll(); }, []);

  const fetchEmployeeOptions = async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('employee_id, first_name, middle_name, last_name, suffix, position, outlet, salary, status')
      .neq('status', 'Resigned')
      .order('last_name', { ascending: true });

    if (error) {
      console.warn('Could not load employee options for payroll:', error.message);
      setEmployeeOptions([]);
      return;
    }

    const employeeIds = (data ?? []).map((employee: any) => String(employee.employee_id ?? '')).filter(Boolean);
    let accountOutletMap = new Map<string, string>();

    if (employeeIds.length > 0) {
      const { data: userAccounts, error: userAccountsError } = await supabase
        .from('user_accounts')
        .select('employee_id, outlet')
        .in('employee_id', employeeIds);

      if (userAccountsError) console.warn('Could not load user account outlets for payroll:', userAccountsError.message);
      accountOutletMap = new Map<string, string>((userAccounts ?? []).map((account: any) => [account.employee_id, String(account.outlet ?? '').trim()]));
    }

    setEmployeeOptions((data ?? []).map((employee: any) => ({
      employeeId: String(employee.employee_id ?? ''),
      name: fullNameFromEmployee(employee) || String(employee.employee_id ?? ''),
      position: String(employee.position ?? ''),
      outlet: getEmployeeOutlet(employee, accountOutletMap.get(employee.employee_id)),
      salary: employee.salary ?? null,
    })).filter(employee => employee.employeeId));
  };

  useEffect(() => { fetchEmployeeOptions(); }, []);

  const getEmployeeOption = (employeeId: string) =>
    employeeOptions.find(employee => employee.employeeId === employeeId);

  const handleManualEmployeeChange = (employeeId: string) => {
    const selected = getEmployeeOption(employeeId);
    setForm(prev => ({
      ...prev,
      employee: employeeId,
      position: selected?.position || '',
    }));
  };

  const handleAdd = async () => {
    if (!form.employee || !form.grossPay) {
      setSnackbar({ open: true, message: 'Please enter an Employee ID and Gross Pay.', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { start, end } = getMonthRange(form.period);
      const preparedByUserId = await resolveCurrentUserAccountUserId();

      const { data: employee, error: empError } = await supabase
        .from('employees')
        .select('employee_id, first_name, middle_name, last_name, suffix, position, outlet, salary')
        .eq('employee_id', form.employee.trim())
        .single();

      if (empError || !employee) {
        throw new Error('Employee ID was not found in the employees table.');
      }

      const { data: userAccount, error: userAccountError } = await supabase
        .from('user_accounts')
        .select('outlet')
        .eq('employee_id', employee.employee_id)
        .maybeSingle();

      if (userAccountError) throw userAccountError;

      const { data: summary, error: summaryError } = await supabase
        .from('payroll_summaries')
        .upsert({
          period_start: start,
          period_end: end,
          cutoff_label: form.period,
          status: 'Draft',
          prepared_by_user_id: preparedByUserId,
        }, { onConflict: 'period_start,period_end' })
        .select('payroll_id')
        .single();

      if (summaryError) throw summaryError;

      const employeeName = [employee.first_name, employee.middle_name, employee.last_name, employee.suffix].filter(Boolean).join(' ');
      const payrollDisplayId = formatPayrollDisplayIdFromEmployee(employee.employee_id, start, summary.payroll_id);
      const employeeOutlet = getEmployeeOutlet(employee, userAccount?.outlet);
      const gross = toNumber(form.grossPay);
      const deductions = toNumber(form.deductions);
      const net = toNumber(form.netPay) || Math.max(gross - deductions, 0);

      const { data: item, error: itemError } = await supabase
        .from('payroll_items')
        .insert({
          payroll_id: summary.payroll_id,
          employee_id: employee.employee_id,
          employee_name: employeeName,
          position: employee.position || form.position,
          outlet: employeeOutlet,
          salary_rate: toNumber(employee.salary),
          rate_type: 'Monthly',
          total_work_hours: toNumber(form.totalHours),
          regular_hours: toNumber(form.totalHours),
          overtime_hours: toNumber(form.overtime),
          basic_pay: gross,
          overtime_pay: 0,
          gross_pay: gross,
          total_deductions: deductions,
          net_pay: net,
          payslip_details: { payrollDisplayId },
          remarks: 'Manual payroll entry',
        })
        .select()
        .single();

      if (itemError) throw itemError;

      await fetchPayroll();
      setAddDialog(false); setForm(EMPTY);
      setSnackbar({ open: true, message: `Payroll record saved for ${employeeName}!`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { start, end, year } = getMonthRange(generatePeriod);
      const preparedByUserId = await resolveCurrentUserAccountUserId();

      const { data: attendanceLogs, error: logsError } = await supabase
        .from('attendance_logs')
        .select('log_id, employee_id, employee_name, attendance_date, total_hours, late_minutes, undertime_minutes, overtime_minutes, is_absent, is_incomplete')
        .gte('attendance_date', start)
        .lte('attendance_date', end)
        .not('employee_id', 'is', null);

      if (logsError) throw logsError;
      if (!attendanceLogs || attendanceLogs.length === 0) {
        throw new Error('No attendance logs were found for the selected payroll period. Save/import attendance in Attendance Monitoring first, then generate payroll again.');
      }

      const employeeIds = [...new Set(attendanceLogs.map((log: any) => String(log.employee_id)).filter(Boolean))];
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('employee_id, first_name, middle_name, last_name, suffix, position, outlet, salary, status')
        .in('employee_id', employeeIds);

      if (employeesError) throw employeesError;

      const { data: userAccounts, error: userAccountsError } = await supabase
        .from('user_accounts')
        .select('employee_id, outlet')
        .in('employee_id', employeeIds);

      if (userAccountsError) throw userAccountsError;

      const accountOutletMap = new Map<string, string>((userAccounts ?? []).map((account: any) => [account.employee_id, String(account.outlet ?? '').trim()]));
      const employeeMap = new Map<string, any>((employees ?? []).map((employee: any) => [
        employee.employee_id,
        { ...employee, outlet: getEmployeeOutlet(employee, accountOutletMap.get(employee.employee_id)) },
      ]));
      const targetEmployeeIds = new Set(
        employeeIds.filter((employeeId) => {
          const employee = employeeMap.get(employeeId);
          const isActive = String(employee?.status ?? 'Active').toLowerCase() === 'active';
          const matchesPosition = !generatePosition || String(employee?.position ?? '') === generatePosition;
          return isActive && matchesPosition;
        }),
      );

      const usableLogs = attendanceLogs.filter((log: any) => targetEmployeeIds.has(String(log.employee_id)));
      if (usableLogs.length === 0) {
        throw new Error(generatePosition
          ? `Attendance logs were found, but none are for active ${generatePosition} employees in the selected period.`
          : 'Attendance logs were found, but none belong to active employees in the selected period.');
      }

      const positions = [...new Set([...targetEmployeeIds].map((employeeId) => employeeMap.get(employeeId)?.position).filter(Boolean))];
      const { data: jobPostings, error: jobsError } = positions.length > 0
        ? await supabase
            .from('job_postings')
            .select('title, salary_range, is_active')
            .in('title', positions)
        : { data: [], error: null } as any;

      if (jobsError) throw jobsError;

      const jobSalaryMap = new Map<string, number>();
      (jobPostings ?? []).forEach((job: any) => {
        const rate = parseSalaryRate(job.salary_range);
        if (job.title && rate > 0 && !jobSalaryMap.has(job.title)) jobSalaryMap.set(job.title, rate);
      });

      const groupedLogs = usableLogs.reduce((map: Map<string, any[]>, log: any) => {
        const employeeId = String(log.employee_id);
        map.set(employeeId, [...(map.get(employeeId) ?? []), log]);
        return map;
      }, new Map<string, any[]>());

      const summaryPayloads = [...groupedLogs.entries()].map(([employeeId, logs]) => {
        const employee = employeeMap.get(employeeId);
        const totalWorkHours = logs.reduce((sum, log) => sum + toNumber(log.total_hours), 0);
        const totalOvertimeMinutes = logs.reduce((sum, log) => sum + Math.round(toNumber(log.overtime_minutes)), 0);
        const totalLateMinutes = logs.reduce((sum, log) => sum + Math.round(toNumber(log.late_minutes)), 0);
        const totalUndertimeMinutes = logs.reduce((sum, log) => sum + Math.round(toNumber(log.undertime_minutes)), 0);
        const totalAbsentDays = logs.filter((log) => Boolean(log.is_absent)).length;
        const totalIncompleteDays = logs.filter((log) => Boolean(log.is_incomplete)).length;
        const overtimeHours = roundMoney(totalOvertimeMinutes / 60);
        const regularHours = roundMoney(Math.max(totalWorkHours - overtimeHours, 0));
        const employeeName = logs.find((log) => log.employee_name)?.employee_name || fullNameFromEmployee(employee) || employeeId;

        return {
          employee_id: employeeId,
          employee_name: employeeName,
          position: employee?.position ?? '',
          outlet: getEmployeeOutlet(employee),
          period_start: start,
          period_end: end,
          period_type: 'Monthly',
          total_attendance_days: new Set(logs.map((log) => String(log.attendance_date))).size,
          total_present_days: logs.filter((log) => !log.is_absent).length,
          total_absent_days: totalAbsentDays,
          total_incomplete_days: totalIncompleteDays,
          total_late_count: logs.filter((log) => Number(log.late_minutes ?? 0) > 0).length,
          total_undertime_count: logs.filter((log) => Number(log.undertime_minutes ?? 0) > 0).length,
          total_overtime_count: logs.filter((log) => Number(log.overtime_minutes ?? 0) > 0).length,
          total_late_minutes: totalLateMinutes,
          total_undertime_minutes: totalUndertimeMinutes,
          total_overtime_minutes: totalOvertimeMinutes,
          total_work_hours: roundMoney(totalWorkHours),
          regular_hours: regularHours,
          overtime_hours: overtimeHours,
          source_log_ids: logs.map((log) => log.log_id).filter(Boolean),
          status: 'Draft',
          generated_by_user_id: preparedByUserId,
        };
      });

      const { data: summaries, error: summariesError } = await supabase
        .from('attendance_summaries')
        .upsert(summaryPayloads, { onConflict: 'employee_id,period_start,period_end' })
        .select('summary_id, employee_id, employee_name, position, outlet, total_work_hours, regular_hours, overtime_hours, total_late_minutes, total_undertime_minutes, total_absent_days, total_incomplete_days');

      if (summariesError) throw summariesError;
      if (!summaries || summaries.length === 0) throw new Error('Attendance logs were found, but no attendance summaries could be created.');

      const { data: existingPeriodPayrolls, error: existingPeriodError } = await supabase
        .from('payroll_summaries')
        .select('payroll_id')
        .eq('period_start', start)
        .eq('period_end', end);

      if (existingPeriodError) throw existingPeriodError;

      const existingPayrollIds = (existingPeriodPayrolls ?? []).map((row: any) => row.payroll_id).filter(Boolean);
      if (existingPayrollIds.length > 0) {
        const { error: deleteOldError } = await supabase
          .from('payroll_summaries')
          .delete()
          .in('payroll_id', existingPayrollIds);
        if (deleteOldError) throw deleteOldError;
      }

      const payrollId = await getNextPayrollId(year);
      const fallbackRate = parseSalaryRate(generateBase);

      const payrollItems = summaries.map((summary: any) => {
        const employee = employeeMap.get(summary.employee_id);
        const position = String(summary.position || employee?.position || '');
        const salaryRate = jobSalaryMap.get(position) || fallbackRate || parseSalaryRate(employee?.salary) || 0;
        const hourlyRate = salaryRate > 0 ? salaryRate / 8 : 0;
        const regularHours = toNumber(summary.regular_hours);
        const overtimeHours = toNumber(summary.overtime_hours);
        const lateMinutes = Math.round(toNumber(summary.total_late_minutes));
        const undertimeMinutes = Math.round(toNumber(summary.total_undertime_minutes));
        const absentDays = Math.round(toNumber(summary.total_absent_days));
        const basicPay = roundMoney(regularHours * hourlyRate);
        const overtimePay = roundMoney(overtimeHours * hourlyRate * 1.25);
        const lateDeduction = roundMoney((lateMinutes / 60) * hourlyRate);
        const undertimeDeduction = roundMoney((undertimeMinutes / 60) * hourlyRate);
        const absenceDeduction = roundMoney(absentDays * salaryRate);
        const grossPay = roundMoney(basicPay + overtimePay);
        const totalDeductions = roundMoney(lateDeduction + undertimeDeduction + absenceDeduction);
        const netPay = roundMoney(Math.max(grossPay - totalDeductions, 0));

        return {
          payroll_id: payrollId,
          attendance_summary_id: summary.summary_id,
          employee_id: summary.employee_id,
          employee_name: summary.employee_name || fullNameFromEmployee(employee) || summary.employee_id,
          position,
          outlet: summary.outlet || getEmployeeOutlet(employee),
          salary_rate: salaryRate,
          rate_type: 'Daily',
          total_work_hours: toNumber(summary.total_work_hours),
          regular_hours: regularHours,
          overtime_hours: overtimeHours,
          total_late_minutes: lateMinutes,
          total_undertime_minutes: undertimeMinutes,
          total_absent_days: absentDays,
          total_incomplete_days: Math.round(toNumber(summary.total_incomplete_days)),
          basic_pay: basicPay,
          overtime_pay: overtimePay,
          late_deduction: lateDeduction,
          undertime_deduction: undertimeDeduction,
          absence_deduction: absenceDeduction,
          other_deductions: 0,
          gross_pay: grossPay,
          total_deductions: totalDeductions,
          net_pay: netPay,
          payslip_details: { payrollDisplayId: formatPayrollDisplayIdFromEmployee(summary.employee_id, start, payrollId), hourlyRate: roundMoney(hourlyRate) },
          remarks: `Generated from Attendance Monitoring logs for ${generatePeriod}.`,
        };
      });

      const totals = payrollItems.reduce((acc: any, item: any) => ({
        total_employees: acc.total_employees + 1,
        total_regular_hours: acc.total_regular_hours + toNumber(item.regular_hours),
        total_overtime_hours: acc.total_overtime_hours + toNumber(item.overtime_hours),
        total_late_minutes: acc.total_late_minutes + toNumber(item.total_late_minutes),
        total_undertime_minutes: acc.total_undertime_minutes + toNumber(item.total_undertime_minutes),
        total_gross_pay: acc.total_gross_pay + toNumber(item.gross_pay),
        total_deductions: acc.total_deductions + toNumber(item.total_deductions),
        total_overtime_pay: acc.total_overtime_pay + toNumber(item.overtime_pay),
        total_net_pay: acc.total_net_pay + toNumber(item.net_pay),
      }), {
        total_employees: 0,
        total_regular_hours: 0,
        total_overtime_hours: 0,
        total_late_minutes: 0,
        total_undertime_minutes: 0,
        total_gross_pay: 0,
        total_deductions: 0,
        total_overtime_pay: 0,
        total_net_pay: 0,
      });

      const { error: summaryInsertError } = await supabase
        .from('payroll_summaries')
        .insert({
          payroll_id: payrollId,
          period_start: start,
          period_end: end,
          cutoff_label: `${generatePeriod} Payroll`,
          status: 'Draft',
          prepared_by_user_id: preparedByUserId,
          total_employees: totals.total_employees,
          total_regular_hours: roundMoney(totals.total_regular_hours),
          total_overtime_hours: roundMoney(totals.total_overtime_hours),
          total_late_minutes: Math.round(totals.total_late_minutes),
          total_undertime_minutes: Math.round(totals.total_undertime_minutes),
          total_gross_pay: roundMoney(totals.total_gross_pay),
          total_deductions: roundMoney(totals.total_deductions),
          total_overtime_pay: roundMoney(totals.total_overtime_pay),
          total_net_pay: roundMoney(totals.total_net_pay),
          endorsed_to: 'Accounting and Finance Personnel',
          remarks: 'Generated directly from Attendance Monitoring attendance_logs.',
        });

      if (summaryInsertError) throw summaryInsertError;

      const { error: itemInsertError } = await supabase
        .from('payroll_items')
        .insert(payrollItems);

      if (itemInsertError) throw itemInsertError;

      await fetchPayroll();
      setGenerateDialog(false);
      setGeneratePosition('');
      setSnackbar({
        open: true,
        message: `✅ Payroll generated from Attendance Monitoring. Payroll ID: ${payrollId}`,
        severity: 'success',
      });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const target = payrolls.find(p => p.id === id);
      if (!target?.payrollId) throw new Error('Payroll summary ID not found.');

      const dbStatus = uiStatusToDb(status);
      const updates: any = {
        status: dbStatus,
        updated_at: new Date().toISOString(),
      };

      if (dbStatus === 'Reviewed' || dbStatus === 'Approved') {
        updates.reviewed_by_user_id = await resolveCurrentUserAccountUserId();
        updates.reviewed_at = new Date().toISOString();
      }

      if (dbStatus === 'Endorsed') {
        updates.endorsed_at = new Date().toISOString();
      }

      const { error: updateError } = await supabase
        .from('payroll_summaries')
        .update(updates)
        .eq('payroll_id', target.payrollId);

      if (updateError) throw updateError;

      setPayrolls(prev => prev.map(p => p.payrollId === target.payrollId ? { ...p, status: status as Payroll['status'] } : p));
      if (selectedPayroll?.payrollId === target.payrollId) {
        setSelectedPayroll(p => p ? { ...p, status: status as Payroll['status'] } : p);
      }
      setSnackbar({ open: true, message: `Status updated to "${status}"!`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    }
  };

  const handleReleaseSalary = async (ids?: string[]) => {
    const targets = ids ? payrolls.filter(p => ids.includes(p.id)) : filtered.filter(p => p.status === 'For Review' || p.status === 'Processed');
    if (targets.length === 0) {
      setSnackbar({ open: true, message: 'No payrolls ready for release.', severity: 'success' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const payrollIds = [...new Set(targets.map(p => p.payrollId).filter(Boolean))];

    try {
      const { error: updateError } = await supabase
        .from('payroll_summaries')
        .update({
          status: 'Endorsed',
          endorsed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('payroll_id', payrollIds);

      if (updateError) throw updateError;

      setPayrolls(prev => prev.map(x => payrollIds.includes(x.payrollId) ? { ...x, status: 'Released' as any, payslipDate: today } : x));
      if (selectedPayroll?.payrollId && payrollIds.includes(selectedPayroll.payrollId)) {
        setSelectedPayroll(p => p ? { ...p, status: 'Released', payslipDate: today } : p);
      }

      setSnackbar({ open: true, message: `✅ ${targets.length} salary record(s) marked as Released!`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!canManagePayroll) {
      setSnackbar({ open: true, message: 'You do not have permission to delete payroll items.', severity: 'error' });
      return;
    }
    if (!window.confirm(`Delete payroll item ${id}? This cannot be undone.`)) return;
    try {
      const { error: deleteError } = await supabase
        .from('payroll_items')
        .delete()
        .eq('payroll_item_id', id);

      if (deleteError) throw deleteError;

      setPayrolls(prev => prev.filter(p => p.id !== id));
      setSnackbar({ open: true, message: `🗑️ Payroll item ${id} deleted.`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    }
  };

  const filtered = payrolls.filter(p => {
    if (isAccountingFinance && !isGeneralManager && p.status === 'Draft') return false;
    const periodMatch = !filterPeriod || p.period === filterPeriod;
    const statusMatch = filterStatus === 'all' || p.status.toLowerCase().replace(' ', '') === filterStatus.toLowerCase().replace(' ', '');
    return periodMatch && statusMatch;
  });

  const parseAmt = (v: string) => parseFloat((v ?? '').replace(/[₱,]/g, '')) || 0;
  const totals = filtered.reduce((acc, p) => ({
    gross: acc.gross + parseAmt(p.grossPay),
    net: acc.net + parseAmt(p.netPay),
    ded: acc.ded + parseAmt(p.deductions),
  }), { gross: 0, net: 0, ded: 0 });


  const payrollStats = [
    {
      label: 'Payroll Records',
      value: filtered.length,
      caption: filterPeriod || filterStatus !== 'all' ? 'Records matching the current filter' : 'Total payroll rows currently loaded',
      icon: <Payments fontSize="small" />,
    },
    {
      label: 'Gross Pay',
      value: `₱${Math.round(totals.gross).toLocaleString()}`,
      caption: 'Combined gross pay from visible records',
      icon: <Calculate fontSize="small" />,
    },
    {
      label: 'Deductions',
      value: `₱${Math.round(totals.ded).toLocaleString()}`,
      caption: 'Total visible payroll deductions',
      icon: <DeleteOutline fontSize="small" />,
    },
    {
      label: 'Net Pay',
      value: `₱${Math.round(totals.net).toLocaleString()}`,
      caption: 'Estimated amount for release',
      icon: <TaskAlt fontSize="small" />,
    },
  ];

  const handleForwardToAccounting = async () => {
    const drafts = filtered.filter(p => p.status === 'Draft');
    if (drafts.length === 0) {
      setSnackbar({ open: true, message: 'No Draft payrolls to forward.', severity: 'success' });
      return;
    }

    const payrollIds = [...new Set(drafts.map(p => p.payrollId).filter(Boolean))];

    try {
      const { error: updateError } = await supabase
        .from('payroll_summaries')
        .update({
          status: 'Reviewed',
          reviewed_by_user_id: await resolveCurrentUserAccountUserId(),
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('payroll_id', payrollIds);

      if (updateError) throw updateError;

      setPayrolls(prev => prev.map(x => payrollIds.includes(x.payrollId) ? { ...x, status: 'For Review' } : x));
      setSnackbar({ open: true, message: `${drafts.length} payroll record(s) forwarded to Accounting (For Review).`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    }
  };

  const handlePrintPayslip = (p: Payroll) => {
    const parseAmt = (v: string) => parseFloat((v ?? '').replace(/[₱,]/g, '')) || 0;
    const fmtAmt = (v: number) => v > 0
      ? `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '—';
    const grossAmt = parseAmt(p.grossPay);
    const dedAmt   = parseAmt(p.deductions);
    const netAmt   = parseAmt(p.netPay);
    const totalDed = dedAmt > 0 ? dedAmt : 0;

    const win = window.open('', '_blank', 'width=720,height=960');
    if (!win) return;
    win.document.write(`
      <html><head><title>Payslip — ${p.employee}</title>
      <style>
        @media print { @page { size: A4 portrait; margin: 15mm; } body { padding: 0; } }
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 12px; color: #111; max-width: 580px; margin: 0 auto; }
        .header { text-align: center; border-bottom: 2px solid #1F7A47; padding-bottom: 8px; margin-bottom: 0; }
        h2 { color: #1F7A47; margin: 4px 0; font-size: 15px; letter-spacing: 1px; }
        table { width: 100%; border-collapse: collapse; }
        td { border: 1px solid #ccc; padding: 4px 8px; font-size: 11px; }
        .sec-hdr { background: #f5f5f5; font-weight: bold; font-size: 11px; }
        .highlight { background: #e8f5e9; }
        .gross-row { background: #fff9c4; font-weight: bold; }
        .net-row { background: #fff9c4; font-weight: bold; color: #1F7A47; }
        .right { text-align: right; }
        .center { text-align: center; }
        .ack { font-size: 10px; margin-top: 14px; border: 1px solid #ccc; padding: 8px; line-height: 1.6; }
        .sig { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 28px; }
        .sig-line { width: 42%; text-align: center; padding-bottom: 4px; border-bottom: 1px solid #333; font-size: 10px; }
        .footer { color: #999; font-size: 10px; text-align: center; margin-top: 14px; }
      </style></head><body>
      <div class="header">
        <h2>BUENAVENTURA ESTATE</h2>
        <div style="font-size:11px;margin-bottom:4px;">ELECTRONIC PAYSLIP</div>
      </div>
      <table style="margin-top:0;">
        <tr><td style="width:40%"><b>Department:</b></td><td colspan="2">${p.position || '—'}</td></tr>
        <tr><td><b>Pay Period:</b></td><td colspan="2">${p.period}</td></tr>
        <tr class="highlight"><td><b>Employee Name:</b></td><td colspan="2"><b>${p.employee.toUpperCase()}</b></td></tr>
        <tr><td><b>Position:</b></td><td colspan="2">${p.position || '—'}</td></tr>
        <tr class="sec-hdr"><td>Earnings:</td><td class="center" style="width:24%">Days/Hours/Mins.</td><td class="right" style="width:22%">Amount</td></tr>
        <tr><td>Basic Pay</td><td class="right">${p.totalHours || '—'}</td><td class="right">${p.basicPayAmt || fmtAmt(grossAmt)}</td></tr>
        <tr><td>Reg.OT</td><td class="right">${p.overtime && p.overtime !== '0' ? p.overtime : '—'}</td><td class="right">${p.otAmt || '—'}</td></tr>
        <tr><td>NSD</td><td class="right">${p.nsdHours || '—'}</td><td class="right">${p.nsdAmt || '—'}</td></tr>
        <tr><td>Regular Holiday</td><td class="right">${p.regularHolidayDays || '—'}</td><td class="right">${p.regularHolidayAmt || '—'}</td></tr>
        <tr><td>Special Holiday</td><td class="right">${p.specialHolidayDays || '—'}</td><td class="right">${p.specialHolidayAmt || '—'}</td></tr>
        <tr><td>SIL</td><td class="right">${p.silDays || '—'}</td><td class="right">${p.silAmt || '—'}</td></tr>
        <tr><td>Allowance</td><td class="right">—</td><td class="right">${p.allowanceAmt || '—'}</td></tr>
        <tr><td>RETRO/ADJUSTMENT</td><td class="right">—</td><td class="right">${p.retroAmt || '—'}</td></tr>
        <tr><td>Tardiness (Mins.)</td><td class="right">${p.tardinessMin || '—'}</td><td class="right">—</td></tr>
        <tr><td>Undertime (Hours)</td><td class="right">${p.undertimeHours || '—'}</td><td class="right">—</td></tr>
        <tr class="gross-row"><td colspan="2" class="center">GROSS PAY</td><td class="right">${fmtAmt(grossAmt)}</td></tr>
        <tr class="sec-hdr"><td colspan="3">DEDUCTIONS:</td></tr>
        <tr><td colspan="2">SSS Premium</td><td class="right">${p.sssAmt || '—'}</td></tr>
        <tr><td colspan="2">PHIC Premium</td><td class="right">${p.phicAmt || '—'}</td></tr>
        <tr><td colspan="2">HDMF Premium</td><td class="right">${p.hdmfAmt || '—'}</td></tr>
        <tr><td colspan="2">CASH ADVANCE</td><td class="right">${p.cashAdvance || '—'}</td></tr>
        <tr><td colspan="2">ATD</td><td class="right">${p.atd || '—'}</td></tr>
        <tr><td colspan="2">Other Charges</td><td class="right">${p.otherCharges || '—'}</td></tr>
        <tr><td colspan="2">BREAKAGES Charges (last)</td><td class="right">${p.breakages || '—'}</td></tr>
        <tr><td colspan="2">AMESCO/OTHER CHARGES</td><td class="right">${p.amesco || '—'}</td></tr>
        <tr><td colspan="2">PAG-IBIG LOAN</td><td class="right">${p.pagibigLoan || '—'}</td></tr>
        <tr class="sec-hdr"><td colspan="2" class="right">TOTAL DEDUCTIONS:</td><td class="right">${totalDed > 0 ? fmtAmt(totalDed) : '—'}</td></tr>
        <tr class="net-row"><td colspan="2" class="center">NET PAY</td><td class="right">${fmtAmt(netAmt)}</td></tr>
      </table>
      <div class="ack">
        I acknowledge to have received the amount of <b>${fmtAmt(netAmt)}</b> and have no further claim for services rendered.
      </div>
      <div class="sig">
        <div class="sig-line">Date: ${p.payslipDate ? new Date(p.payslipDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '___________'}</div>
        <div style="width:42%; text-align:center;">
          <div style="padding-bottom:4px; border-bottom:1px solid #333; font-size:10px;">${p.employee.toUpperCase()}</div>
          <div style="font-size:9px; margin-top:3px;">${p.position || '—'}</div>
        </div>
      </div>
      <div class="footer">Generated: ${new Date().toLocaleString()} &nbsp;·&nbsp; Payroll ID: ${p.displayId ?? p.payrollId ?? p.id} &nbsp;·&nbsp; Electronically generated payslip.</div>
      </body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <Box
      sx={{
        minHeight: '100%',
        p: { xs: 1.5, sm: 2.25, md: 3 },
        background: GREEN_UI.pageBg,
        color: GREEN_UI.text,
        borderRadius: { xs: 0, md: '32px' },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          ...softCardSx,
          p: { xs: 2, sm: 2.75, md: 3.25 },
          mb: 2.5,
          position: 'relative',
          overflow: 'hidden',
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,250,235,0.96) 60%, rgba(225,248,224,0.94) 100%)',
          '&:before': {
            content: '""',
            position: 'absolute',
            width: 260,
            height: 260,
            borderRadius: '50%',
            right: -90,
            top: -110,
            background: 'rgba(76, 175, 80, 0.12)',
          },
          '&:after': {
            content: '""',
            position: 'absolute',
            width: 160,
            height: 160,
            borderRadius: '50%',
            left: { xs: '70%', md: '44%' },
            bottom: -95,
            background: 'rgba(174, 222, 144, 0.18)',
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ maxWidth: 720 }}>
            <Chip
              icon={<Payments fontSize="small" />}
              label="Payroll Workspace"
              size="small"
              sx={{
                mb: 1.2,
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                fontWeight: 700,
                '& .MuiChip-icon': { color: GREEN_UI.greenDark },
              }}
            />
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
                color: GREEN_UI.text,
                letterSpacing: '-0.04em',
                lineHeight: 1.08,
                mb: 0.75,
              }}
            >
              Payroll Computation
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              Generate payroll from attendance summaries, review deductions, prepare payslips, and release employee salary records in one clean workspace.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="Refresh payroll records">
              <span>
                <Button
                  variant="outlined"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={fetchPayroll}
                  disabled={loading}
                  sx={{ ...pillButtonSx, py: 1.1, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </Button>
              </span>
            </Tooltip>

            {canReleasePayroll && (
              <Button
                variant="contained"
                startIcon={<Payments />}
                onClick={() => handleReleaseSalary()}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.green,
                  boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                  '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
                }}
              >
                Release Salary
              </Button>
            )}

            {canManagePayroll && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<Send />}
                  onClick={handleForwardToAccounting}
                  sx={{ ...pillButtonSx, py: 1.1, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}
                >
                  Forward to Accounting
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<AddCircleOutline />}
                  onClick={() => {
                    setForm(EMPTY);
                    void fetchEmployeeOptions();
                    setAddDialog(true);
                  }}
                  sx={{ ...pillButtonSx, py: 1.1, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}
                >
                  Manual Entry
                </Button>
                <Button
                  variant="contained"
                  startIcon={<Calculate />}
                  onClick={() => setGenerateDialog(true)}
                  sx={{
                    ...pillButtonSx,
                    py: 1.1,
                    bgcolor: GREEN_UI.green,
                    boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                    '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
                  }}
                >
                  Generate Payroll
                </Button>
              </>
            )}
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {payrollStats.map(stat => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                ...softCardSx,
                p: 2,
                minHeight: 126,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 22px 48px rgba(43, 91, 55, 0.13)' },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                    {stat.label}
                  </Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ color: GREEN_UI.text, mt: 0.5, letterSpacing: '-0.04em' }}>
                    {stat.value}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '16px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: GREEN_UI.greenSoft,
                    color: GREEN_UI.greenDark,
                    flexShrink: 0,
                  }}
                >
                  {stat.icon}
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted, mt: 1.2 }}>
                {stat.caption}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={<Button size="small" onClick={fetchPayroll} sx={{ ...pillButtonSx }}>Retry</Button>}
        >
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, mb: 2, p: { xs: 1.5, sm: 2 }, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '14px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: GREEN_UI.greenSoft,
              color: GREEN_UI.greenDark,
              flexShrink: 0,
            }}
          >
            <Visibility fontSize="small" />
          </Box>
          <Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Payroll Filters</Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>Narrow payroll records by period or processing status.</Typography>
          </Box>
        </Box>

        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Filter by Period"
              type="month"
              value={filterPeriod}
              onChange={e => setFilterPeriod(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={softTextFieldSx}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              select
              label="Status"
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={softTextFieldSx}
            >
              <MenuItem key="all" value="all">All Status</MenuItem>
              <MenuItem key="draft" value="draft">Draft</MenuItem>
              <MenuItem key="forreview" value="forreview">For Review</MenuItem>
              <MenuItem key="processed" value="processed">Processed</MenuItem>
              <MenuItem key="released" value="released">Released</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Button
              fullWidth
              variant="outlined"
              sx={{ ...pillButtonSx, height: '56px', borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}
              onClick={() => { setFilterPeriod(''); setFilterStatus('all'); }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          ...softCardSx,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { height: 10 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#cfe8d1'},
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 7, gap: 2 }}>
            <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading payroll records…</Typography>
          </Box>
        ) : (
          <Table sx={{ minWidth: 980, '& th, & td': { borderColor: 'rgba(139, 184, 144, 0.16)' } }}>
            <TableHead>
              <TableRow
                sx={{
                  background: 'linear-gradient(90deg, #eff8eb 0%, #f8fcf5 100%)',
                  '& th': {
                    color: GREEN_UI.greenDark,
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    py: 1.7,
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <TableCell>ID</TableCell>
                <TableCell>Employee</TableCell>
                <TableCell>Position</TableCell>
                <TableCell>Period</TableCell>
                <TableCell>Total Hours</TableCell>
                <TableCell>OT</TableCell>
                <TableCell>Deductions</TableCell>
                <TableCell>Gross Pay</TableCell>
                <TableCell>Net Pay</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ minWidth: 220 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 7 }}>
                    <Box sx={{ maxWidth: 390, mx: 'auto' }}>
                      <Box
                        sx={{
                          width: 54,
                          height: 54,
                          borderRadius: '20px',
                          display: 'grid',
                          placeItems: 'center',
                          mx: 'auto',
                          mb: 1.5,
                          bgcolor: GREEN_UI.greenSoft,
                          color: GREEN_UI.greenDark,
                        }}
                      >
                        <Payments />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {payrolls.length === 0 ? 'No payroll records yet' : 'No payroll records matched'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        {payrolls.length === 0
                          ? 'Click Generate Payroll to create records for all active employees.'
                          : 'Adjust or clear your filters to show more records.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : filtered.map(p => (
                <TableRow
                  key={p.id}
                  hover
                  sx={{
                    transition: 'background 160ms ease',
                    '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                    '& td': { py: 1.55, color: GREEN_UI.text },
                  }}
                >
                  <TableCell>
                    <Chip
                      label={p.displayId ?? p.id}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600, bgcolor: '#f8fcf5', borderColor: GREEN_UI.border }}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>{p.employee}</Typography>
                    <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>{p.employeeId || 'Employee record'}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>{p.position || '—'}</Typography>
                    <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>{p.outlet || 'No outlet'}</Typography>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{p.period}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.totalHours}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{p.overtime} hrs</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', color: '#9c2f2f !important', fontWeight: 600 }}>{p.deductions}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{p.grossPay}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: `${GREEN_UI.greenDark} !important` }}>{p.netPay}</TableCell>
                  <TableCell>
                    <Chip label={p.status} size="small" variant="outlined" sx={payrollStatusChipSx(p.status)} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Chip
                        icon={<Visibility />}
                        label={isEmployee ? 'View' : 'View Payslip'}
                        size="small"
                        clickable
                        variant="outlined"
                        onClick={() => { setSelectedPayroll(p); setViewDialog(true); }}
                        sx={{
                          minWidth: 116,
                          justifyContent: 'center',
                          fontWeight: 600,
                          borderColor: GREEN_UI.borderStrong,
                          color: GREEN_UI.greenDark,
                          bgcolor: '#ffffff',
                          '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                          '&:hover': { bgcolor: GREEN_UI.greenSoft },
                        }}
                      />
                      {canReleasePayroll && p.status !== 'Released' && (
                        <Chip
                          icon={<Payments />}
                          label="Release"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handleReleaseSalary([p.id])}
                          sx={{
                            minWidth: 96,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: '#a9dfb6',
                            color: GREEN_UI.greenDark,
                            bgcolor: '#f4fbf5',
                            '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                            '&:hover': { bgcolor: '#e5f8e9' },
                          }}
                        />
                      )}
                      {canManagePayroll && (
                        <Chip
                          icon={<DeleteOutline />}
                          label="Delete"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handleDelete(p.id)}
                          sx={{
                            minWidth: 86,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: '#efb8b8',
                            color: '#9c2f2f',
                            bgcolor: '#fffafa',
                            '& .MuiChip-icon': { color: '#9c2f2f' },
                            '&:hover': { bgcolor: '#fdeaea' },
                          }}
                        />
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {!loading && filtered.length > 0 && (
        <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 2.5 }, mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.75 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '14px',
                display: 'grid',
                placeItems: 'center',
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
              }}
            >
              <TaskAlt fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Summary {filterPeriod ? `— ${filterPeriod}` : '(All Periods)'}
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Computed from the payroll rows visible in the table.
              </Typography>
            </Box>
          </Box>

          <Grid container spacing={1.5}>
            {[
              ['Employees', filtered.length],
              ['Total Gross Pay', `₱${Math.round(totals.gross).toLocaleString()}`],
              ['Total Deductions', `₱${Math.round(totals.ded).toLocaleString()}`],
              ['Total Net Pay', `₱${Math.round(totals.net).toLocaleString()}`],
            ].map(([l, v]) => (
              <Grid key={String(l)} size={{ xs: 6, md: 3 }}>
                <Paper elevation={0} sx={{ ...innerCardSx, p: 1.75, minHeight: 86 }}>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>{l}</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ color: l === 'Total Net Pay' ? GREEN_UI.greenDark : GREEN_UI.text, mt: 0.5 }}>{v}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Generate Payroll Dialog */}
      <Dialog open={generateDialog} onClose={() => { setGenerateDialog(false); setGeneratePosition(''); }} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>Generate Payroll</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '18px !important', px: { xs: 2, sm: 3 }, bgcolor: '#fbfff9' }}>
          <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
            Auto-generates payroll for <strong>Active</strong> employees. Select a position to target only that role, or leave blank for all. This generates payroll directly from Attendance Monitoring records saved for the selected month.
          </Alert>
          <TextField label="Payroll Period" type="month" fullWidth value={generatePeriod}
            onChange={e => setGeneratePeriod(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField
            label="Position (Optional)"
            select fullWidth value={generatePosition}
            onChange={e => {
              const pos = e.target.value;
              setGeneratePosition(pos);
            }}
            InputLabelProps={{ shrink: true }}
            helperText="Leave blank to generate for all active employees"
          >
            <MenuItem key="all-pos" value="">All Positions</MenuItem>
            {AVAILABLE_POSITIONS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </TextField>
          <TextField label="Fallback Daily Salary Rate (₱)" type="number" fullWidth value={generateBase}
            onChange={e => setGenerateBase(e.target.value)}
            helperText="Used only if the selected job posting has no Salary Range / Daily Rate saved." />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfff9' }}>
          <Button onClick={() => { setGenerateDialog(false); setGeneratePosition(''); }}>Cancel</Button>
          <Button variant="contained" startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <Calculate />}
            onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Manual Add Dialog */}
      <Dialog open={addDialog} onClose={() => setAddDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>Manual Payroll Entry</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '18px !important', px: { xs: 2, sm: 3 }, bgcolor: '#fbfff9' }}>
          <TextField
            select
            label="Employee ID"
            fullWidth
            required
            value={form.employee}
            onChange={e => handleManualEmployeeChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Select employee…</MenuItem>
            {employeeOptions.map(employee => (
              <MenuItem key={employee.employeeId} value={employee.employeeId}>
                {employee.employeeId} — {employee.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Position"
            fullWidth
            value={form.position}
            onChange={e => setForm({ ...form, position: e.target.value })}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Select position…</MenuItem>
            {AVAILABLE_POSITIONS.map(position => (
              <MenuItem key={position} value={position}>{position}</MenuItem>
            ))}
          </TextField>
          <TextField label="Period" type="month" fullWidth value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} InputLabelProps={{ shrink: true }} />
          <Grid container spacing={2}>
            <Grid size={6}><TextField label="Total Hours" fullWidth value={form.totalHours} onChange={e => setForm({ ...form, totalHours: e.target.value })} /></Grid>
            <Grid size={6}><TextField label="Overtime (hrs)" fullWidth value={form.overtime} onChange={e => setForm({ ...form, overtime: e.target.value })} /></Grid>
            <Grid size={4}><TextField label="Gross Pay" fullWidth required value={form.grossPay} onChange={e => setForm({ ...form, grossPay: e.target.value })} placeholder="₱0" /></Grid>
            <Grid size={4}><TextField label="Deductions" fullWidth value={form.deductions} onChange={e => setForm({ ...form, deductions: e.target.value })} placeholder="₱0" /></Grid>
            <Grid size={4}><TextField label="Net Pay" fullWidth value={form.netPay} onChange={e => setForm({ ...form, netPay: e.target.value })} placeholder="₱0" /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfff9' }}>
          <Button onClick={() => setAddDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'Saving…' : 'Generate Payroll'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payslip Dialog */}
      <Dialog open={viewDialog} onClose={() => { setViewDialog(false); setEditingPayslip(false); }} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={{ ...dialogTitleSx, pb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Payslip
            {selectedPayroll && <Chip label={selectedPayroll.id} size="small" variant="outlined" />}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          {selectedPayroll && (
            <Box>
              {editingPayslip ? (
                /* ── Edit Mode — Receipt Format ── */
                <Box sx={{ border: '1px solid #999', fontSize: '0.78rem', lineHeight: 1.5, mb: 2 }}>
                  {/* Company Header */}
                  <Box sx={{ textAlign: 'center', py: 1, px: 2, borderBottom: '1px solid #999', bgcolor: '#f9f9f9' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', letterSpacing: 0.5 }}>BUENAVENTURA ESTATE</Typography>
                    <Typography sx={{ fontSize: '0.68rem', color: '#777' }}>ELECTRONIC PAYSLIP — EDITING</Typography>
                  </Box>
                  {/* Department */}
                  {[['Department:', 'position'], ['Pay period:', 'period'], ['Position:', 'position'], ['Date:', 'payslipDate']].map(([lbl, fk], idx) => (
                    <Box key={lbl} sx={{ display: 'flex', borderBottom: '1px solid #ccc', alignItems: 'center', ...(lbl === 'Pay period:' ? {} : {}) }}>
                      <Box sx={{ width: '40%', fontWeight: idx === 0 ? 600 : 600, p: '3px 8px', borderRight: '1px solid #ccc', fontSize: '0.77rem' }}>{lbl}</Box>
                      <Box sx={{ flex: 1, px: 1 }}>
                        <TextField variant="standard" fullWidth size="small"
                          type={fk === 'period' ? 'month' : fk === 'payslipDate' ? 'date' : 'text'}
                          value={(payslipEditForm as any)[fk]} onChange={pef(fk as any)}
                          InputLabelProps={{ shrink: true }} inputProps={{ style: { fontSize: '0.76rem' } }} />
                      </Box>
                    </Box>
                  ))}
                  {/* Employee Name — highlighted */}
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #ccc', alignItems: 'center', bgcolor: '#e8f5e9' }}>
                    <Box sx={{ width: '40%', fontWeight: 700, p: '3px 8px', borderRight: '1px solid #ccc', fontSize: '0.77rem' }}>Employee Name:</Box>
                    <Box sx={{ flex: 1, px: 1 }}><TextField variant="standard" fullWidth size="small" value={payslipEditForm.employee} onChange={pef('employee')} inputProps={{ style: { fontSize: '0.76rem', fontWeight: 700 } }} /></Box>
                  </Box>
                  {/* Earnings header */}
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #ccc', bgcolor: '#f5f5f5' }}>
                    <Box sx={{ flex: 1, fontWeight: 700, p: '4px 8px', borderRight: '1px solid #ccc', fontSize: '0.77rem' }}>Earnings:</Box>
                    <Box sx={{ width: '24%', fontWeight: 700, p: '4px 6px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.7rem' }}>Days/Hours/Mins.</Box>
                    <Box sx={{ width: '22%', fontWeight: 700, p: '4px 6px', textAlign: 'right', fontSize: '0.77rem' }}>Amount</Box>
                  </Box>
                  {([
                    ['Basic Pay',          'totalHours',        'basicPayAmt'       ],
                    ['Reg.OT',            'overtime',           'otAmt'             ],
                    ['NSD',               'nsdHours',           'nsdAmt'            ],
                    ['Regular Holiday',   'regularHolidayDays', 'regularHolidayAmt' ],
                    ['Special Holiday',   'specialHolidayDays', 'specialHolidayAmt' ],
                    ['SIL',              'silDays',             'silAmt'            ],
                    ['Allowance',         null,                  'allowanceAmt'      ],
                    ['RETRO/ADJUSTMENT',  null,                  'retroAmt'          ],
                    ['Tardiness (Mins.)', 'tardinessMin',        null                ],
                    ['Undertime (Hours)', 'undertimeHours',      null                ],
                  ] as [string, string | null, string | null][]).map(([label, dk, ak]) => (
                    <Box key={label} sx={{ display: 'flex', borderBottom: '1px solid #eee', alignItems: 'center' }}>
                      <Box sx={{ flex: 1, p: '1px 8px', borderRight: '1px solid #ccc', fontSize: '0.76rem' }}>{label}</Box>
                      <Box sx={{ width: '24%', px: 0.5, borderRight: '1px solid #ccc' }}>
                        {dk ? <TextField variant="standard" fullWidth size="small" value={(payslipEditForm as any)[dk]} onChange={pef(dk as any)} placeholder="—" inputProps={{ style: { fontSize: '0.73rem', textAlign: 'right', padding: '1px 0' } }} />
                             : <Box sx={{ textAlign: 'right', fontSize: '0.75rem', color: 'text.disabled', p: '3px 2px' }}>—</Box>}
                      </Box>
                      <Box sx={{ width: '22%', px: 0.5 }}>
                        {ak ? <TextField variant="standard" fullWidth size="small" value={(payslipEditForm as any)[ak]} onChange={pef(ak as any)} placeholder="₱0" inputProps={{ style: { fontSize: '0.73rem', textAlign: 'right', padding: '1px 0' } }} />
                             : <Box sx={{ textAlign: 'right', fontSize: '0.75rem', color: 'text.disabled', p: '3px 2px' }}>—</Box>}
                      </Box>
                    </Box>
                  ))}
                  {/* GROSS PAY */}
                  <Box sx={{ display: 'flex', borderTop: '1px solid #999', borderBottom: '1px solid #999', bgcolor: '#fff9c4', fontWeight: 700, alignItems: 'center' }}>
                    <Box sx={{ flex: 1, p: '4px 8px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.77rem' }}>GROSS PAY</Box>
                    <Box sx={{ width: '24%', borderRight: '1px solid #ccc' }} />
                    <Box sx={{ width: '22%', px: 0.5 }}><TextField variant="standard" fullWidth size="small" value={payslipEditForm.grossPay} onChange={pef('grossPay')} inputProps={{ style: { fontSize: '0.73rem', textAlign: 'right', fontWeight: 700, padding: '2px 0' } }} /></Box>
                  </Box>
                  {/* DEDUCTIONS header */}
                  <Box sx={{ p: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 700, fontSize: '0.77rem', bgcolor: '#f5f5f5' }}>DEDUCTIONS:</Box>
                  {([
                    ['SSS Premium',              'sssAmt'      ],
                    ['PHIC Premium',             'phicAmt'     ],
                    ['HDMF Premium',             'hdmfAmt'     ],
                    ['CASH ADVANCE',             'cashAdvance' ],
                    ['ATD',                      'atd'         ],
                    ['Other Charges',            'otherCharges'],
                    ['BREAKAGES Charges (last)', 'breakages'   ],
                    ['AMESCO/OTHER CHARGES',     'amesco'      ],
                    ['PAG-IBIG LOAN',            'pagibigLoan' ],
                  ] as [string, string][]).map(([label, key]) => (
                    <Box key={label} sx={{ display: 'flex', borderBottom: '1px solid #eee', alignItems: 'center' }}>
                      <Box sx={{ flex: 1, p: '1px 8px', borderRight: '1px solid #ccc', fontSize: '0.76rem' }}>{label}</Box>
                      <Box sx={{ width: '22%', px: 0.5 }}><TextField variant="standard" fullWidth size="small" value={(payslipEditForm as any)[key]} onChange={pef(key as any)} placeholder="₱0" inputProps={{ style: { fontSize: '0.73rem', textAlign: 'right', padding: '1px 0' } }} /></Box>
                    </Box>
                  ))}
                  {/* TOTAL DEDUCTIONS */}
                  <Box sx={{ display: 'flex', borderTop: '1px solid #999', borderBottom: '1px solid #999', fontWeight: 700, alignItems: 'center' }}>
                    <Box sx={{ flex: 1, p: '4px 8px', borderRight: '1px solid #ccc', textAlign: 'right', fontSize: '0.77rem' }}>TOTAL DEDUCTIONS:</Box>
                    <Box sx={{ width: '22%', px: 0.5 }}><TextField variant="standard" fullWidth size="small" value={payslipEditForm.deductions} onChange={pef('deductions')} inputProps={{ style: { fontSize: '0.73rem', textAlign: 'right', fontWeight: 700, padding: '2px 0' } }} /></Box>
                  </Box>
                  {/* NET PAY */}
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #999', bgcolor: '#fff9c4', fontWeight: 700, alignItems: 'center' }}>
                    <Box sx={{ flex: 1, p: '4px 8px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.77rem' }}>NET PAY</Box>
                    <Box sx={{ width: '22%', px: 0.5 }}><TextField variant="standard" fullWidth size="small" value={payslipEditForm.netPay} onChange={pef('netPay')} inputProps={{ style: { fontSize: '0.73rem', textAlign: 'right', fontWeight: 700, padding: '2px 0' } }} /></Box>
                  </Box>
                  {/* Acknowledgment */}
                  <Box sx={{ p: '8px', fontSize: '0.72rem', lineHeight: 1.7, bgcolor: '#fafafa', borderBottom: '1px solid #eee' }}>
                    I acknowledge to have received the amount of <strong>{payslipEditForm.netPay || '—'}</strong> and have no further claim for services rendered.
                  </Box>
                </Box>
              ) : (
                /* ── View Mode — Receipt Format ── */
                (() => {
                  const grossAmt = parseAmt(selectedPayroll.grossPay);
                  const dedAmt   = parseAmt(selectedPayroll.deductions);
                  const netAmt   = parseAmt(selectedPayroll.netPay);
                  const fmt      = (v: number) => v > 0
                    ? `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—';
                  const totalDed = dedAmt > 0 ? dedAmt : 0;
                  const otHours  = parseFloat(selectedPayroll.overtime) || 0;
                  const hasOT    = otHours > 0;

                  const rowSx = { display: 'flex', borderBottom: '1px solid #ccc' };
                  const labelSx = { width: '40%', fontWeight: 600, p: '4px 8px', borderRight: '1px solid #ccc', fontSize: '0.78rem' };
                  const valSx   = { flex: 1, p: '4px 8px', fontSize: '0.78rem' };

                  const earningsRows: [string, string, string][] = [
                    ['Basic Pay',           selectedPayroll.totalHours || '—',                           selectedPayroll.basicPayAmt || fmt(grossAmt)],
                    ['Reg.OT',              selectedPayroll.overtime && selectedPayroll.overtime !== '0' ? selectedPayroll.overtime : '—', selectedPayroll.otAmt || '—'],
                    ['NSD',                 selectedPayroll.nsdHours  || '—',                            selectedPayroll.nsdAmt  || '—'],
                    ['Regular Holiday',     selectedPayroll.regularHolidayDays || '—',                   selectedPayroll.regularHolidayAmt || '—'],
                    ['Special Holiday',     selectedPayroll.specialHolidayDays || '—',                   selectedPayroll.specialHolidayAmt || '—'],
                    ['SIL',                 selectedPayroll.silDays   || '—',                            selectedPayroll.silAmt  || '—'],
                    ['Allowance',           '—',                                                          selectedPayroll.allowanceAmt || '—'],
                    ['RETRO/ADJUSTMENT',    '—',                                                          selectedPayroll.retroAmt || '—'],
                    ['Tardiness (Mins.)',   selectedPayroll.tardinessMin   || '—',                       '—'],
                    ['Undertime (Hours)',   selectedPayroll.undertimeHours || '—',                       '—'],
                  ];

                  const deductionRows: [string, string][] = [
                    ['SSS Premium',              selectedPayroll.sssAmt      || '—'],
                    ['PHIC Premium',             selectedPayroll.phicAmt     || '—'],
                    ['HDMF Premium',             selectedPayroll.hdmfAmt     || '—'],
                    ['CASH ADVANCE',             selectedPayroll.cashAdvance || '—'],
                    ['ATD',                      selectedPayroll.atd         || '—'],
                    ['Other Charges',            selectedPayroll.otherCharges || '—'],
                    ['BREAKAGES Charges (last)', selectedPayroll.breakages   || '—'],
                    ['AMESCO/OTHER CHARGES',     selectedPayroll.amesco      || '—'],
                    ['PAG-IBIG LOAN',            selectedPayroll.pagibigLoan || '—'],
                  ];

                  return (
                    <Box sx={{ border: '1px solid #999', fontSize: '0.78rem', lineHeight: 1.5, mb: 2 }}>
                      {/* Company Header */}
                      <Box sx={{ textAlign: 'center', fontWeight: 700, py: 1, px: 2, borderBottom: '1px solid #999', fontSize: '0.88rem', letterSpacing: 0.5 }}>
                        BUENAVENTURA ESTATE
                      </Box>

                      {/* Department */}
                      <Box sx={rowSx}>
                        <Box sx={labelSx}>Department:</Box>
                        <Box sx={valSx}>{selectedPayroll.position || '—'}</Box>
                      </Box>
                      {/* Pay Period */}
                      <Box sx={rowSx}>
                        <Box sx={labelSx}>Pay period:</Box>
                        <Box sx={valSx}>{selectedPayroll.period}</Box>
                      </Box>
                      {/* Employee Name — highlighted */}
                      <Box sx={{ ...rowSx, bgcolor: '#e8f5e9' }}>
                        <Box sx={{ ...labelSx, fontWeight: 700 }}>Employee Name:</Box>
                        <Box sx={{ ...valSx, fontWeight: 700 }}>{selectedPayroll.employee.toUpperCase()}</Box>
                      </Box>
                      {/* Position */}
                      <Box sx={rowSx}>
                        <Box sx={labelSx}>Position:</Box>
                        <Box sx={valSx}>{selectedPayroll.position || '—'}</Box>
                      </Box>

                      {/* Earnings header */}
                      <Box sx={{ display: 'flex', borderBottom: '1px solid #ccc', bgcolor: '#f5f5f5' }}>
                        <Box sx={{ flex: 1, fontWeight: 700, p: '4px 8px', borderRight: '1px solid #ccc', fontSize: '0.78rem' }}>Earnings:</Box>
                        <Box sx={{ width: '24%', fontWeight: 700, p: '4px 6px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.7rem' }}>Days/Hours/Mins.</Box>
                        <Box sx={{ width: '22%', fontWeight: 700, p: '4px 6px', textAlign: 'right', fontSize: '0.78rem' }}>Amount</Box>
                      </Box>

                      {/* Earnings rows */}
                      {earningsRows.map(([label, days, amount]) => (
                        <Box key={label} sx={{ display: 'flex', borderBottom: '1px solid #eee' }}>
                          <Box sx={{ flex: 1, p: '3px 8px', borderRight: '1px solid #ccc', fontSize: '0.77rem' }}>{label}</Box>
                          <Box sx={{ width: '24%', p: '3px 6px', borderRight: '1px solid #ccc', textAlign: 'right', fontSize: '0.77rem' }}>{days}</Box>
                          <Box sx={{ width: '22%', p: '3px 6px', textAlign: 'right', fontSize: '0.77rem' }}>{amount}</Box>
                        </Box>
                      ))}

                      {/* GROSS PAY — highlighted */}
                      <Box sx={{ display: 'flex', borderTop: '1px solid #999', borderBottom: '1px solid #999', bgcolor: '#fff9c4', fontWeight: 700 }}>
                        <Box sx={{ flex: 1, p: '5px 8px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.78rem' }}>GROSS PAY</Box>
                        <Box sx={{ width: '24%', p: '5px 6px', borderRight: '1px solid #ccc' }} />
                        <Box sx={{ width: '22%', p: '5px 6px', textAlign: 'right', fontSize: '0.78rem' }}>{fmt(grossAmt)}</Box>
                      </Box>

                      {/* DEDUCTIONS label */}
                      <Box sx={{ p: '5px 8px', borderBottom: '1px solid #ccc', fontWeight: 700, fontSize: '0.78rem' }}>DEDUCTIONS:</Box>

                      {/* Deduction rows */}
                      {deductionRows.map(([label, amount]) => (
                        <Box key={label} sx={{ display: 'flex', borderBottom: '1px solid #eee' }}>
                          <Box sx={{ flex: 1, p: '3px 8px', borderRight: '1px solid #ccc', fontSize: '0.77rem' }}>{label}</Box>
                          <Box sx={{ width: '22%', p: '3px 6px', textAlign: 'right', fontSize: '0.77rem' }}>{amount}</Box>
                        </Box>
                      ))}

                      {/* TOTAL DEDUCTIONS */}
                      <Box sx={{ display: 'flex', borderTop: '1px solid #999', borderBottom: '1px solid #999', fontWeight: 700 }}>
                        <Box sx={{ flex: 1, p: '5px 8px', borderRight: '1px solid #ccc', textAlign: 'right', fontSize: '0.78rem' }}>TOTAL DEDUCTIONS:</Box>
                        <Box sx={{ width: '22%', p: '5px 6px', textAlign: 'right', fontSize: '0.78rem' }}>{totalDed > 0 ? fmt(totalDed) : '—'}</Box>
                      </Box>

                      {/* NET PAY — highlighted */}
                      <Box sx={{ display: 'flex', borderBottom: '1px solid #999', bgcolor: '#fff9c4', fontWeight: 700 }}>
                        <Box sx={{ flex: 1, p: '5px 8px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.78rem' }}>NET PAY</Box>
                        <Box sx={{ width: '22%', p: '5px 6px', textAlign: 'right', fontSize: '0.78rem' }}>{fmt(netAmt)}</Box>
                      </Box>

                      {/* Acknowledgment */}
                      <Box sx={{ p: '8px', borderBottom: '1px solid #ccc', fontSize: '0.72rem', lineHeight: 1.7 }}>
                        I acknowledge to have received the amount of{' '}
                        <strong>{fmt(netAmt)}</strong>{' '}
                        and have no further claim for services rendered.
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'flex-end', p: '10px 8px', gap: 2 }}>
                        <Box sx={{ fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                          Date:{' '}
                          <strong>
                            {selectedPayroll.payslipDate
                              ? new Date(selectedPayroll.payslipDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
                              : '___________'}
                          </strong>
                        </Box>
                        <Box sx={{ flex: 1, textAlign: 'center' }}>
                          <Box sx={{ fontWeight: 700, fontSize: '0.78rem', pb: '4px', borderBottom: '1px solid #333' }}>
                            {selectedPayroll.employee.toUpperCase()}
                          </Box>
                          <Box sx={{ fontSize: '0.72rem', mt: '3px' }}>{selectedPayroll.position || '—'}</Box>
                        </Box>
                      </Box>
                    </Box>
                  );
                })()
              )}

              <TextField select fullWidth label="Update Status" value={selectedPayroll.status}
                onChange={e => handleStatusChange(selectedPayroll.id, e.target.value)}
                InputLabelProps={{ shrink: true }}>
                <MenuItem key="Draft" value="Draft">Draft</MenuItem>
                <MenuItem key="For Review" value="For Review">For Review</MenuItem>
                <MenuItem key="Processed" value="Processed">Processed</MenuItem>
                <MenuItem key="Released" value="Released">Released</MenuItem>
              </TextField>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfff9', gap: 1, flexWrap: 'wrap' }}>
          <Button onClick={() => { setViewDialog(false); setEditingPayslip(false); }}>Close</Button>
          {!editingPayslip ? (
            selectedPayroll?.status !== 'Released' && (
            <Button variant="outlined" color="primary"
              onClick={() => {
                if (selectedPayroll) {
                  const g = parseAmt(selectedPayroll.grossPay);
                  const today = new Date().toISOString().split('T')[0];
                  setPayslipEditForm({
                    employee:            selectedPayroll.employee         ?? '',
                    position:            selectedPayroll.position         ?? '',
                    period:              selectedPayroll.period           ?? '',
                    payslipDate:         selectedPayroll.payslipDate      ?? today,
                    totalHours:          selectedPayroll.totalHours       ?? '',
                    basicPayAmt:         selectedPayroll.basicPayAmt      ?? selectedPayroll.grossPay ?? '',
                    overtime:            selectedPayroll.overtime         ?? '',
                    otAmt:               selectedPayroll.otAmt            ?? '',
                    nsdHours:            selectedPayroll.nsdHours         ?? '',
                    nsdAmt:              selectedPayroll.nsdAmt           ?? '',
                    regularHolidayDays:  selectedPayroll.regularHolidayDays ?? '',
                    regularHolidayAmt:   selectedPayroll.regularHolidayAmt  ?? '',
                    specialHolidayDays:  selectedPayroll.specialHolidayDays ?? '',
                    specialHolidayAmt:   selectedPayroll.specialHolidayAmt  ?? '',
                    silDays:             selectedPayroll.silDays          ?? '',
                    silAmt:              selectedPayroll.silAmt           ?? '',
                    allowanceAmt:        selectedPayroll.allowanceAmt     ?? '',
                    retroAmt:            selectedPayroll.retroAmt         ?? '',
                    tardinessMin:        selectedPayroll.tardinessMin     ?? '',
                    undertimeHours:      selectedPayroll.undertimeHours   ?? '',
                    grossPay:            selectedPayroll.grossPay         ?? '',
                    sssAmt:              selectedPayroll.sssAmt           ?? (g > 0 ? `₱${(g * 0.045).toFixed(2)}` : ''),
                    phicAmt:             selectedPayroll.phicAmt          ?? (g > 0 ? `₱${(g * 0.02).toFixed(2)}`  : ''),
                    hdmfAmt:             selectedPayroll.hdmfAmt          ?? (g > 0 ? '₱100.00' : ''),
                    cashAdvance:         selectedPayroll.cashAdvance      ?? '',
                    atd:                 selectedPayroll.atd              ?? '',
                    otherCharges:        selectedPayroll.otherCharges     ?? '',
                    breakages:           selectedPayroll.breakages        ?? '',
                    amesco:              selectedPayroll.amesco           ?? '',
                    pagibigLoan:         selectedPayroll.pagibigLoan      ?? '',
                    deductions:          selectedPayroll.deductions       ?? '',
                    netPay:              selectedPayroll.netPay           ?? '',
                  });
                  setEditingPayslip(true);
                }
              }}>
              Edit Payslip
            </Button>
            )
          ) : (
            <Button variant="contained" color="success" disabled={saving}
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
              onClick={async () => {
                if (!selectedPayroll) return;
                setSaving(true);
                try {
                  const gross = toNumber(payslipEditForm.grossPay);
                  const deductions = toNumber(payslipEditForm.deductions);
                  const net = toNumber(payslipEditForm.netPay) || Math.max(gross - deductions, 0);

                  const details = {
                    nsdHours: payslipEditForm.nsdHours,
                    nsdAmt: payslipEditForm.nsdAmt,
                    regularHolidayDays: payslipEditForm.regularHolidayDays,
                    regularHolidayAmt: payslipEditForm.regularHolidayAmt,
                    specialHolidayDays: payslipEditForm.specialHolidayDays,
                    specialHolidayAmt: payslipEditForm.specialHolidayAmt,
                    silDays: payslipEditForm.silDays,
                    silAmt: payslipEditForm.silAmt,
                    allowanceAmt: payslipEditForm.allowanceAmt,
                    retroAmt: payslipEditForm.retroAmt,
                    sssAmt: payslipEditForm.sssAmt,
                    phicAmt: payslipEditForm.phicAmt,
                    hdmfAmt: payslipEditForm.hdmfAmt,
                    cashAdvance: payslipEditForm.cashAdvance,
                    atd: payslipEditForm.atd,
                    otherCharges: payslipEditForm.otherCharges,
                    breakages: payslipEditForm.breakages,
                    amesco: payslipEditForm.amesco,
                    pagibigLoan: payslipEditForm.pagibigLoan,
                  };

                  const { error: updateError } = await supabase
                    .from('payroll_items')
                    .update({
                      employee_name: payslipEditForm.employee,
                      position: payslipEditForm.position,
                      total_work_hours: toNumber(payslipEditForm.totalHours),
                      regular_hours: toNumber(payslipEditForm.totalHours),
                      overtime_hours: toNumber(payslipEditForm.overtime),
                      total_late_minutes: Math.round(toNumber(payslipEditForm.tardinessMin)),
                      total_undertime_minutes: Math.round(toNumber(payslipEditForm.undertimeHours) * 60),
                      basic_pay: toNumber(payslipEditForm.basicPayAmt),
                      overtime_pay: toNumber(payslipEditForm.otAmt),
                      gross_pay: gross,
                      total_deductions: deductions,
                      net_pay: net,
                      payslip_details: details,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('payroll_item_id', selectedPayroll.id);

                  if (updateError) throw updateError;

                  const updated: Payroll = {
                    ...selectedPayroll,
                    ...payslipEditForm,
                    deductions: money(deductions),
                    grossPay: money(gross),
                    netPay: money(net),
                  };

                  setPayrolls(prev => prev.map(p => p.id === selectedPayroll.id ? updated : p));
                  setSelectedPayroll(updated);
                  setEditingPayslip(false);
                  setSnackbar({ open: true, message: '✅ Payslip saved successfully!', severity: 'success' });
                } catch (e: any) {
                  setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
                } finally { setSaving(false); }
              }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          )}
          <Button variant="contained" startIcon={<Print />} onClick={() => selectedPayroll && handlePrintPayslip(selectedPayroll)}>
            Print Payslip
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      />
    </Box>
  );
}
