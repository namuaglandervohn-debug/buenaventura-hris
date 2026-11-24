import { formatDisplayDate, formatDisplayDateTime } from '../../lib/displayDate';
import TextField from '../DateTextField';
import React, { useRef, useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, CircularProgress,
  Alert, Tooltip, IconButton, MenuItem, InputAdornment, Checkbox, FormControlLabel,
} from '../bootstrap';
import { Calculate, Visibility, Send, AddCircleOutline, Sync, Payments, TaskAlt, DeleteOutline, Print, CloudUpload, Download, Settings, CalendarMonth } from '../bootstrap/icons';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { attendancePunchFields, loadAttendanceCalculator } from '../../lib/loadAttendanceCalculator';
import { summarizePayrollHours, type CalculatedAttendance } from '../../lib/scheduledAttendance';
import { leaveDaysInYear } from '../../lib/leaveRequestDates';
import { includeSelectedJobTitle, jobTitleKey } from '../../lib/jobTitles';
import { useJobTitleOptions } from '../../lib/useJobTitleOptions';
import { loadJobSalaryRates, parseSalaryRate } from '../../lib/jobSalaryRates';
import {
  calculatePayslipLineAmount, calculatePayslipTotals, netPayAfterDeductions,
  calculateAttendancePay, payrollHoursPerDay, payrollPremiumFields, payslipAmountFields, payslipQuantityAmounts, regularOvertimeMultiplier,
  type PayrollPremiumRates, type PayslipAmountField, type PayslipQuantityField,
} from '../../lib/payslipTotals';
import ActionSnackbar from '../ActionSnackbar';
import { escapePayslipText, payslipHeading, payslipPeriod } from '../../lib/payslipPresentation';
import { calculatePayrollPremiums, payrollPremiumDefaults, type PayrollHoliday } from '../../lib/payrollPremiums';

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

const COMPANY_PAID_LEAVE_TYPE = 'Company Paid Leave';
const COMPANY_ANNUAL_LEAVE_ALLOWANCE = 5;

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
  periodStart?: string;
  periodEnd?: string;
  payPeriodLabel: string;
  payRate: string;
  cutoffLabel?: string;
  totalHours: string;
  regularHours: string;
  overtime: string;
  hourlyRate?: number;
  deductions: string;
  grossPay: string;
  netPay: string;
  status: 'Draft' | 'For Review' | 'Processed' | 'Released';
  // Extended payslip fields
  payslipDate?: string;
  basicPayAmt?: string;
  basicPayHours?: string;
  absenceDeductionAmt?: string;
  otAmt?: string;
  nsdHours?: string; nsdAmt?: string;
  regularHolidayDays?: string; regularHolidayAmt?: string;
  specialHolidayDays?: string; specialHolidayAmt?: string;
  silDays?: string; silAmt?: string;
  allowanceAmt?: string;
  retroAmt?: string;
  leaveConversionDays?: string;
  leaveConversionAmt?: string;
  leaveConversionRate?: string;
  tardinessMin?: string;
  lateDeductionAmt?: string;
  undertimeHours?: string;
  undertimeDeductionAmt?: string;
  sssAmt?: string;
  phicAmt?: string;
  hdmfAmt?: string;
  cashAdvance?: string;
  atd?: string;
  otherCharges?: string;
  breakages?: string;
  amesco?: string;
  pagibigLoan?: string;
  uploadedPayslipName?: string;
  uploadedPayslipPath?: string;
  payslipDetails?: Record<string, unknown>;
}

interface EmployeeOption {
  employeeId: string;
  name: string;
  position: string;
  outlet: string;
  salary?: string | number | null;
}

const MANUAL_CALCULATED_FIELDS = [
  { quantity: 'regularHours', amount: 'basicPayAmt', label: 'Basic Pay', unit: 'hours' },
  { quantity: 'overtime', amount: 'otAmt', label: 'Regular Overtime', unit: 'hours' },
  { quantity: 'nsdHours', amount: 'nsdAmt', label: 'Night Shift Differential', unit: 'hours' },
  { quantity: 'regularHolidayDays', amount: 'regularHolidayAmt', label: 'Regular Holiday Premium', unit: 'days' },
  { quantity: 'specialHolidayDays', amount: 'specialHolidayAmt', label: 'Special Holiday Premium', unit: 'days' },
] as const;
const MANUAL_DEDUCTIONS = [
  ['sssAmt', 'SSS'], ['phicAmt', 'PhilHealth'], ['hdmfAmt', 'Pag-IBIG'],
  ['cashAdvance', 'Cash Advance'], ['otherCharges', 'Other Deductions'],
] as const;
const EMPTY = {
  employee: '', period: new Date().toISOString().slice(0, 7), cutoff: '5',
  regularHours: '', overtime: '', nsdHours: '', regularHolidayDays: '', specialHolidayDays: '',
  allowanceAmt: '', sssAmt: '', phicAmt: '', hdmfAmt: '', cashAdvance: '', otherCharges: '',
};

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

const amountInputValue = (value: string) => value.replace(/[₱,\s]/g, '');
const numericInputStyle = { fontSize: '0.73rem', textAlign: 'right' as const, padding: '1px 0' };

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

const defaultDailyRateForPosition = (position: string) => {
  if (!position) return 0;
  return jobTitleKey(position) === 'service crew' ? 525 : 510;
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

const getSemiMonthlyCutoffRange = (monthValue: string, cutoff: string) => {
  const base = getMonthRange(monthValue);
  const [year, month] = monthValue.split('-').map(Number);
  const mm = String(month).padStart(2, '0');

  if (cutoff === '20') {
    return {
      ...base,
      start: `${year}-${mm}-06`,
      end: `${year}-${mm}-20`,
      cutoffLabel: `${monthValue} Cutoff 20`,
      payDateLabel: 'Salary payout every 25th',
    };
  }

  const previousMonthDate = new Date(year, month - 2, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = String(previousMonthDate.getMonth() + 1).padStart(2, '0');

  return {
    ...base,
    start: `${previousYear}-${previousMonth}-21`,
    end: `${year}-${mm}-05`,
    cutoffLabel: `${monthValue} Cutoff 5`,
    payDateLabel: 'Salary payout every 10th',
  };
};

const monthFromDate = (dateValue?: string | null) =>
  dateValue ? dateValue.slice(0, 7) : new Date().toISOString().slice(0, 7);

const formatMonthLabel = (monthValue: string) => {
  if (!monthValue) return 'the selected month';
  const [year, month] = monthValue.split('-').map(Number);
  if (!year || !month) return monthValue;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
};

const getPayrollPeriod = (start?: string, end?: string, savedCutoff?: string | null) => {
  const cutoff = /^(\d{4}-(?:0[1-9]|1[0-2])) Cutoff (5|20)$/i.exec(savedCutoff?.trim() ?? '');
  if (cutoff) {
    const [, month, day] = cutoff;
    return { month, label: `${formatMonthLabel(month)} · Cutoff ${day}` };
  }

  const month = monthFromDate(end || start);
  if (start && end && !savedCutoff?.trim()) {
    const day = String(Number(end.slice(8, 10)));
    if (day === '5' || day === '20') {
      const range = getSemiMonthlyCutoffRange(month, day);
      if (start === range.start && end === range.end) {
        return { month, label: `${formatMonthLabel(month)} · Cutoff ${day}` };
      }
    }
  }
  return { month, label: savedCutoff?.trim() || formatMonthLabel(month) };
};

const getWorkedMonthCutoffs = (month: string) => {
  const { start, end, year } = getMonthRange(month);
  const following = new Date(year, Number(month.slice(5)), 1);
  const nextMonth = `${following.getFullYear()}-${String(following.getMonth() + 1).padStart(2, '0')}`;
  return [
    getSemiMonthlyCutoffRange(month, '5'),
    getSemiMonthlyCutoffRange(month, '20'),
    getSemiMonthlyCutoffRange(nextMonth, '5'),
  ].map(cutoff => ({
    ...cutoff,
    workedStart: cutoff.start < start ? start : cutoff.start,
    workedEnd: cutoff.end > end ? end : cutoff.end,
  }));
};

function MonthlyHoursDialog({ onClose, showDrafts }: { onClose: () => void; showDrafts: boolean }) {
  const today = formatDisplayDate(new Date()).split('/');
  const [month, setMonth] = useState(`${today[2]}-${today[0]}`);
  const [employeeId, setEmployeeId] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeeError, setEmployeeError] = useState('');
  const [report, setReport] = useState<{
    key: string;
    rows: { dates: string; hours: number; cutoff: string; status: string; hoursCheck: string }[];
    hasAttendance: boolean;
    error?: string;
  } | null>(null);
  const reportKey = employeeId && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? `${employeeId}/${month}` : '';
  const currentReport = reportKey && report?.key === reportKey ? report : null;

  useEffect(() => {
    let active = true;
    void supabase.from('employees')
      .select('employee_id, first_name, middle_name, last_name, suffix')
      .order('last_name').order('first_name').order('employee_id')
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setEmployeeError('Could not load employees. Close and reopen Monthly Hours to retry.');
        else setEmployees((data ?? []).map(employee => ({
          id: employee.employee_id,
          name: fullNameFromEmployee(employee) || employee.employee_id,
        })));
        setEmployeesLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!reportKey) return;
    let active = true;
    const cutoffs = getWorkedMonthCutoffs(month);
    const { start, end } = getMonthRange(month);

    void Promise.all([
      supabase.from('attendance_logs').select(attendancePunchFields)
        .eq('employee_id', employeeId).gte('attendance_date', cutoffs[0].start).lte('attendance_date', cutoffs[2].end),
      supabase.from('payroll_summaries').select('period_start, period_end, status, payroll_items!inner(employee_id,total_work_hours)')
        .in('period_start', cutoffs.map(cutoff => cutoff.start))
        .eq('payroll_items.employee_id', employeeId),
      loadAttendanceCalculator(employeeId, cutoffs[0].start, cutoffs[2].end),
    ]).then(([attendance, payroll, calculate]) => {
      if (!active) return;
      if (attendance.error || payroll.error) {
        setReport({ key: reportKey, rows: [], hasAttendance: false, error: 'Could not load monthly hours. Close and reopen Monthly Hours to retry.' });
        return;
      }
      const logs = (attendance.data ?? []).map(log => calculate(log));
      const rows = cutoffs.map(cutoff => {
        const hours = logs.reduce((total, log) => {
          if (log.attendance_date < cutoff.workedStart || log.attendance_date > cutoff.workedEnd) return total;
          // DTR adds each daily entry after rounding it to two decimal places.
          return total + roundMoney(toNumber(log.total_hours));
        }, 0);
        const entry = payroll.data?.find(item => item.period_start === cutoff.start && item.period_end === cutoff.end);
        const status = entry ? dbStatusToUi(entry.status) : 'Not generated';
        const savedHours = entry?.payroll_items[0]?.total_work_hours;
        const cutoffHours = roundMoney(logs.reduce((sum, log) =>
          log.attendance_date >= cutoff.start && log.attendance_date <= cutoff.end ? sum + toNumber(log.total_hours) : sum, 0));
        const hoursCheck = savedHours == null || (!showDrafts && status === 'Draft') ? '—'
          : roundMoney(toNumber(savedHours)) === cutoffHours ? 'Matches DTR'
            : `Review · ${toNumber(savedHours).toFixed(2)} saved / ${cutoffHours.toFixed(2)} DTR`;
        return {
          dates: payslipPeriod(cutoff.workedStart, cutoff.workedEnd),
          hours: roundMoney(hours),
          cutoff: getPayrollPeriod(cutoff.start, cutoff.end, cutoff.cutoffLabel).label,
          status: !showDrafts && status === 'Draft' ? 'Not sent to Accounting' : status,
          hoursCheck,
        };
      });
      setReport({ key: reportKey, rows, hasAttendance: logs.some(log => log.attendance_date >= start && log.attendance_date <= end) });
    }).catch(() => {
      if (active) setReport({ key: reportKey, rows: [], hasAttendance: false, error: 'Could not load monthly hours. Close and reopen Monthly Hours to retry.' });
    });
    return () => { active = false; };
  }, [employeeId, month, reportKey, showDrafts]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="monthly-hours-title">
      <DialogTitle id="monthly-hours-title" fontWeight={700} sx={dialogTitleSx}>Monthly Hours</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '20px !important' }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 7 }}>
            <TextField fullWidth select label="Employee" value={employeeId} onChange={event => setEmployeeId(event.target.value)}
              disabled={employeesLoading || employees.length === 0} InputLabelProps={{ shrink: true }}>
              <MenuItem value="">Select employee…</MenuItem>
              {employees.map(employee => <MenuItem key={employee.id} value={employee.id}>{employee.name} ({employee.id})</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField fullWidth type="month" label="Worked Month" value={month} onChange={event => setMonth(event.target.value)}
              InputLabelProps={{ shrink: true }} />
          </Grid>
        </Grid>
        {employeeError && <Alert severity="error">{employeeError}</Alert>}
        {!employeeError && !employeesLoading && employees.length === 0 && <Alert severity="info">No employees found.</Alert>}
        {reportKey && !currentReport && <Typography role="status">Loading monthly hours…</Typography>}
        {currentReport?.error && <Alert severity="error">{currentReport.error}</Alert>}
        {currentReport && !currentReport.error && (
          <>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: GREEN_UI.greenSoft }}>
              <Typography variant="body2">DTR Total Hours · {formatMonthLabel(month)}</Typography>
              <Typography variant="h5" fontWeight={700}>{currentReport.rows.reduce((sum, row) => sum + row.hours, 0).toFixed(2)} hours</Typography>
            </Paper>
            {!currentReport.hasAttendance && <Alert severity="info">No attendance records for this employee in the selected month.</Alert>}
            <TableContainer>
              <Table size="small" aria-label="Monthly hours by payroll cutoff">
                <TableHead>
                  <TableRow>
                    <TableCell>Dates Worked</TableCell>
                    <TableCell align="right">Hours incl. OT</TableCell>
                    <TableCell>Payroll Cutoff</TableCell>
                    <TableCell>Payroll Status</TableCell>
                    <TableCell>Full Cutoff Check</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentReport.rows.map(row => (
                    <TableRow key={row.cutoff}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.dates}</TableCell>
                      <TableCell align="right">{row.hours.toFixed(2)}</TableCell>
                      <TableCell>{row.cutoff}</TableCell>
                      <TableCell>{row.status}</TableCell>
                      <TableCell>{row.hoursCheck}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="body2" color="text.secondary">The hours column shows work done in this month, including overtime. The cutoff check compares saved payroll with DTR for the full cutoff.</Typography>
          </>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

const parsePayslipDetails = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, string>;
};

const premiumRatesColumns = 'revision,nsd_percent,regular_holiday_percent,special_holiday_percent,sil_percent,holidays';
type PremiumRatesRow = PayrollPremiumRates & { revision: number; holidays: PayrollHoliday[] };
type PremiumRatesDraft = Partial<Record<keyof PayrollPremiumRates, string>>;

const loadPayrollRates = async (): Promise<PremiumRatesRow> => {
  const { data, error } = await supabase.from('payroll_premium_rates').select(premiumRatesColumns).eq('id', 1).single();
  if (error) throw error;
  return data;
};

export default function PayrollComputation() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [viewDialog, setViewDialog] = useState(false);
  const [addDialog, setAddDialog] = useState(false);
  const [generateDialog, setGenerateDialog] = useState(false);
  const [ratesDialog, setRatesDialog] = useState(false);
  const [premiumRates, setPremiumRates] = useState<PremiumRatesRow | null>(null);
  const [ratesDraft, setRatesDraft] = useState<PremiumRatesDraft>({});
  const [holidayDraft, setHolidayDraft] = useState<PayrollHoliday[]>([]);
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayType, setHolidayType] = useState<PayrollHoliday['type']>('regular');
  const [ratesError, setRatesError] = useState('');
  const [loadingRates, setLoadingRates] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [generatePeriod, setGeneratePeriod] = useState(new Date().toISOString().slice(0, 7));
  const [generateCutoff, setGenerateCutoff] = useState('5');
  const [generateBaseOverride, setGenerateBaseOverride] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [manualRates, setManualRates] = useState<{ dailyRate: number; premiums: PayrollPremiumRates } | null>(null);
  const [manualRateError, setManualRateError] = useState('');
  const manualDailyRate = manualRates?.dailyRate ?? 0;
  const manualHourlyRate = manualDailyRate / payrollHoursPerDay;
  const manualEarnings = MANUAL_CALCULATED_FIELDS.map(line => ({
    ...line,
    value: calculatePayslipLineAmount({ hourlyRate: manualHourlyRate }, line.quantity, form[line.quantity], manualRates?.premiums) ?? 0,
  }));
  const manualGross = roundMoney(manualEarnings.reduce((total, line) => total + line.value, roundMoney(toNumber(form.allowanceAmt))));
  const manualDeductions = roundMoney(MANUAL_DEDUCTIONS.reduce((total, [field]) => total + roundMoney(toNumber(form[field])), 0));
  const manualNetPay = netPayAfterDeductions(manualGross, manualDeductions);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState('');
  const [monthlyHoursOpen, setMonthlyHoursOpen] = useState(false);
  const [releaseCutoff, setReleaseCutoff] = useState<Payroll | null>(null);
  const [releaseOptions, setReleaseOptions] = useState<Payroll[]>([]);
  const [releaseReview, setReleaseReview] = useState<{ employees: string[]; exceptions: number; differences: number } | null>(null);
  const [releaseError, setReleaseError] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const releaseHasIssues = Boolean(releaseReview && (releaseReview.exceptions || releaseReview.differences));
  const [filterStatus, setFilterStatus] = useState('all');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning' });
  const { user } = useAuth();
  const [generatePosition, setGeneratePosition] = useState('');
  const jobTitleOptions = useJobTitleOptions(generateDialog);
  const [selectedJobRate, setSelectedJobRate] = useState<{ position: string; rate: number } | null>(null);
  const postedDailyRate = selectedJobRate?.position === generatePosition ? selectedJobRate.rate : 0;
  const generateBase = generateBaseOverride ?? String(postedDailyRate || defaultDailyRateForPosition(generatePosition));
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const payslipUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingPayslip, setUploadingPayslip] = useState(false);

  // ── Payslip edit state ───────────────────────────────────────────────
  const [editingPayslip, setEditingPayslip] = useState(false);
  const EDIT_EMPTY = {
    employee: '', position: '',
    payslipDate: '',
    regularHours: '', basicPayAmt: '',
    overtime: '', otAmt: '',
    nsdHours: '', nsdAmt: '',
    regularHolidayDays: '', regularHolidayAmt: '',
    specialHolidayDays: '', specialHolidayAmt: '',
    silDays: '', silAmt: '',
    allowanceAmt: '', retroAmt: '',
    tardinessMin: '', lateDeductionAmt: '', undertimeHours: '', undertimeDeductionAmt: '',
    sssAmt: '', phicAmt: '', hdmfAmt: '',
    cashAdvance: '', atd: '', otherCharges: '', breakages: '', amesco: '', pagibigLoan: '',
  };
  const [payslipEditForm, setPayslipEditForm] = useState(EDIT_EMPTY);
  const payslipTotals = editingPayslip && selectedPayroll
    ? calculatePayslipTotals(selectedPayroll, payslipEditForm)
    : { gross: 0, deductions: 0, net: 0 };
  const updatePayslipField = (key: keyof typeof EDIT_EMPTY, value: string) => {
    setPayslipEditForm(form => {
      const next = { ...form, [key]: value };
      if (!selectedPayroll || !Object.prototype.hasOwnProperty.call(payslipQuantityAmounts, key)) return next;

      const quantityField = key as PayslipQuantityField;
      const amountField = payslipQuantityAmounts[quantityField];
      if (Number(form[quantityField]) === Number(value)) return next;
      if (Number(selectedPayroll[quantityField] ?? '') === Number(value)) {
        next[amountField] = selectedPayroll[amountField] ?? '';
        return next;
      }
      const rates = premiumRates ? {
          ...premiumRates,
          nsd_percent: premiumRates.nsd_percent ?? payrollPremiumDefaults.nsd_percent,
          regular_holiday_percent: premiumRates.regular_holiday_percent ?? payrollPremiumDefaults.regular_holiday_percent,
          special_holiday_percent: premiumRates.special_holiday_percent ?? payrollPremiumDefaults.special_holiday_percent,
      } : undefined;
      if (quantityField === 'regularHolidayDays' && selectedPayroll.payslipDetails?.generatedPremiums && selectedPayroll.hourlyRate && rates) {
        const quantity = Number(value);
        const unworked = Math.min(quantity, Number(selectedPayroll.payslipDetails.regularUnworkedDays) || 0);
        const dailyRate = selectedPayroll.hourlyRate * payrollHoursPerDay;
        const workedPremium = (quantity - unworked) * rates.regular_holiday_percent / 100;
        if (Number.isFinite(quantity)) next[amountField] = money(dailyRate * (unworked + workedPremium));
        return next;
      }
      const calculated = calculatePayslipLineAmount(selectedPayroll, quantityField, value, rates);
      if (calculated !== undefined) {
        const basicPayAdjustment = quantityField === 'regularHours' && selectedPayroll.basicPayHours
          ? toNumber(selectedPayroll.basicPayAmt) - roundMoney(toNumber(selectedPayroll.regularHours) * (selectedPayroll.hourlyRate ?? 0))
          : 0;
        next[amountField] = money(calculated + basicPayAdjustment);
      }
      return next;
    });
  };
  const pef = (key: keyof typeof EDIT_EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) =>
    updatePayslipField(key, event.target.value);

  const renderAmountInput = (field: PayslipAmountField, label: string) => (
    <TextField
      variant="standard"
      fullWidth
      size="small"
      value={amountInputValue(payslipEditForm[field])}
      onChange={event => {
        const value = amountInputValue(event.target.value);
        if (/^-?\d*(?:\.\d*)?$/.test(value)) updatePayslipField(field, value ? `₱${value}` : '');
      }}
      placeholder="0"
      inputProps={{ 'aria-label': `${label} amount`, inputMode: 'decimal', style: numericInputStyle }}
      InputProps={{ startAdornment: <InputAdornment position="start" aria-hidden="true" disableTypography sx={{ fontSize: '0.73rem', mr: 0.25 }}>₱</InputAdornment> }}
    />
  );
  const renderPayslipEditLine = (label: string, dk: PayslipQuantityField | null, ak: PayslipAmountField) => (
    <Box key={label} sx={{ display: 'flex', borderBottom: '1px solid #eee', alignItems: 'center' }}>
      <Box sx={{ flex: 1, p: '1px 8px', borderRight: '1px solid #ccc', fontSize: '0.76rem' }}>{label}</Box>
      <Box sx={{ width: '24%', px: 0.5, borderRight: '1px solid #ccc' }}>
        {dk ? <TextField variant="standard" fullWidth size="small" value={payslipEditForm[dk]} onChange={event => {
          const value = event.target.value;
          if (/^\d*(?:\.\d*)?$/.test(value)) updatePayslipField(dk, value);
        }} placeholder="—" inputProps={{ 'aria-label': `${label} quantity`, inputMode: 'decimal', style: numericInputStyle }} />
             : <Box sx={{ textAlign: 'right', fontSize: '0.75rem', color: 'text.disabled', p: '3px 2px' }}>—</Box>}
      </Box>
      <Box sx={{ width: '22%', px: 0.5 }}>
        {renderAmountInput(ak, label)}
      </Box>
    </Box>
  );

  const currentUserName = (user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.email ?? 'System User';
  const currentUserRole = (user as any)?.role ?? 'user';
  const normalizedRole = String(currentUserRole).toLowerCase();
  const isHRAdmin = normalizedRole === 'hr_admin' || normalizedRole.includes('hr') || normalizedRole.includes('admin');
  const isAccountingFinance = normalizedRole === 'accounting_finance' || normalizedRole.includes('accounting') || normalizedRole.includes('finance');
  const isGeneralManager = normalizedRole === 'general_manager' || normalizedRole.includes('general_manager') || normalizedRole.includes('general manager');
  const isEmployee = normalizedRole === 'employee' || normalizedRole.includes('employee');
  const canManagePayroll = isHRAdmin || isGeneralManager;
  const canReleasePayroll = isAccountingFinance || isGeneralManager;

  useEffect(() => {
    if (!ratesDialog && !viewDialog) return;
    let active = true;
    setLoadingRates(true);
    setRatesError('');
    setPremiumRates(null);
    const loadRates = async () => {
      try {
        const rates = await loadPayrollRates();
        if (!active) return;
        setPremiumRates(rates);
        if (ratesDialog) {
          setRatesDraft(Object.fromEntries(payrollPremiumFields.map(({ column }) => [column, String(rates[column] ?? '')])));
          setHolidayDraft(rates.holidays ?? []);
          setHolidayDate('');
          setHolidayType('regular');
        }
      } catch {
        if (active) setRatesError('Payroll rates could not be loaded. Close and reopen this dialog to retry.');
      } finally {
        if (active) setLoadingRates(false);
      }
    };
    void loadRates();
    return () => { active = false; };
  }, [ratesDialog, viewDialog]);

  const savePremiumRates = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isHRAdmin || !premiumRates || loadingRates || savingRates) return;

    const nextRates: PayrollPremiumRates = {};
    for (const { column, label } of payrollPremiumFields) {
      const value = ratesDraft[column]?.trim() ?? '';
      if (value && (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))) {
        setRatesError(`Enter a valid nonnegative percentage for ${label}.`);
        return;
      }
      nextRates[column] = value ? Number(value) : null;
    }

    setSavingRates(true);
    setRatesError('');
    try {
      const { data, error } = await supabase.from('payroll_premium_rates')
        .update({ ...nextRates, holidays: holidayDraft, revision: premiumRates.revision + 1 })
        .eq('id', 1).eq('revision', premiumRates.revision).select(premiumRatesColumns).maybeSingle();
      if (error) throw error;
      if (!data) {
        setRatesError('The rates could not be saved. Reopen the dialog to load the latest settings and try again.');
        return;
      }
      setPremiumRates(data);
      setRatesDialog(false);
      setSnackbar({ open: true, message: 'Payroll rates saved.', severity: 'success' });
    } catch {
      setRatesError('Payroll rates could not be saved. Please try again.');
    } finally {
      setSavingRates(false);
    }
  };

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
    const period = getPayrollPeriod(summary?.period_start, summary?.period_end, summary?.cutoff_label);
    const details = parsePayslipDetails(item.payslip_details);
    const employee = employeesById.get(item.employee_id);
    const displayId = formatPayrollDisplayIdFromEmployee(item.employee_id, summary?.period_start, item.payroll_id);
    const dailyRate = item.rate_type?.toLowerCase() === 'daily' ? toNumber(item.salary_rate) : 0;
    const hourlyRate = dailyRate > 0 ? dailyRate / payrollHoursPerDay : toNumber(details.hourlyRate);

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
      period: period.month,
      periodStart: summary?.period_start,
      periodEnd: summary?.period_end,
      payPeriodLabel: payslipPeriod(summary?.period_start, summary?.period_end),
      payRate: item.salary_rate == null ? '—' : money(item.salary_rate),
      cutoffLabel: period.label,
      totalHours: String(item.total_work_hours ?? roundMoney(toNumber(item.regular_hours) + toNumber(item.overtime_hours))),
      regularHours: String(item.regular_hours ?? item.total_work_hours ?? '0'),
      overtime: String(item.overtime_hours ?? '0'),
      hourlyRate: hourlyRate > 0 ? hourlyRate : undefined,
      deductions: money(item.total_deductions),
      grossPay: money(item.gross_pay),
      netPay: money(item.net_pay),
      status: dbStatusToUi(summary?.status),
      payslipDate: summary?.endorsed_at ? String(summary.endorsed_at).slice(0, 10) : undefined,
      basicPayAmt: money(item.basic_pay),
      basicPayHours: details.basicPayHours,
      absenceDeductionAmt: money(item.absence_deduction),
      otAmt: money(item.overtime_pay),
      tardinessMin: String(item.total_late_minutes ?? ''),
      lateDeductionAmt: money(item.late_deduction),
      undertimeHours: item.total_undertime_minutes ? String(Number(item.total_undertime_minutes) / 60) : '',
      undertimeDeductionAmt: money(item.undertime_deduction),
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
      leaveConversionDays: details.leaveConversionDays ?? '',
      leaveConversionAmt: details.leaveConversionAmt ?? '',
      leaveConversionRate: details.leaveConversionRate ?? '',
      sssAmt: details.sssAmt ?? '',
      phicAmt: details.phicAmt ?? '',
      hdmfAmt: details.hdmfAmt ?? '',
      cashAdvance: details.cashAdvance ?? '',
      atd: details.atd ?? '',
      otherCharges: details.otherCharges ?? '',
      breakages: details.breakages ?? '',
      amesco: details.amesco ?? '',
      pagibigLoan: details.pagibigLoan ?? '',
      uploadedPayslipName: details.uploadedPayslipName ?? '',
      uploadedPayslipPath: details.uploadedPayslipPath ?? '',
      payslipDetails: details,
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
          rate_type,
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
    setManualRates(null);
    setManualRateError('');
    setForm(prev => ({
      ...prev,
      employee: employeeId,
    }));
  };

  const manualEmployee = getEmployeeOption(form.employee);
  useEffect(() => {
    if (!addDialog || !manualEmployee) return;
    let active = true;
    Promise.all([loadJobSalaryRates([manualEmployee.position]), loadPayrollRates()]).then(([rates, premiums]) => {
      if (!active) return;
      setManualRates({
        dailyRate: parseSalaryRate(manualEmployee.salary) || rates.get(jobTitleKey(manualEmployee.position)) || 0,
        premiums: {
          nsd_percent: premiums.nsd_percent ?? payrollPremiumDefaults.nsd_percent,
          regular_holiday_percent: premiums.regular_holiday_percent ?? payrollPremiumDefaults.regular_holiday_percent,
          special_holiday_percent: premiums.special_holiday_percent ?? payrollPremiumDefaults.special_holiday_percent,
        },
      });
    }).catch(() => {
      if (active) setManualRateError('Payroll rates could not be loaded. Reopen Manual Entry to try again.');
    });
    return () => { active = false; };
  }, [addDialog, manualEmployee]);

  const latestAttendanceMonth = async () => {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('attendance_date')
      .not('employee_id', 'is', null)
      .not('attendance_date', 'is', null)
      .order('attendance_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.attendance_date ? String(data.attendance_date).slice(0, 7) : '';
  };

  const openGenerateDialog = async () => {
    setGenerateBaseOverride(null);
    setSelectedJobRate(null);
    try {
      const latestMonth = await latestAttendanceMonth();
      if (latestMonth) setGeneratePeriod(latestMonth);
    } catch (e: any) {
      console.warn('Could not detect latest attendance month:', e?.message ?? e);
    } finally {
      setGenerateDialog(true);
    }
  };

  useEffect(() => {
    if (!generateDialog || !generatePosition) return;

    let canceled = false;
    loadJobSalaryRates([generatePosition])
      .then(rates => {
        if (!canceled) setSelectedJobRate({ position: generatePosition, rate: rates.get(jobTitleKey(generatePosition)) ?? 0 });
      })
      .catch(error => console.warn('Could not load the daily rate for payroll:', error.message));
    return () => { canceled = true; };
  }, [generateDialog, generatePosition]);

  const handleAdd = async () => {
    if (!manualEmployee || !manualDailyRate || !/^\d{4}-(0[1-9]|1[0-2])$/.test(form.period)) {
      setSnackbar({ open: true, message: 'Select an employee with a daily rate and a payroll period.', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { start, end, cutoffLabel } = getSemiMonthlyCutoffRange(form.period, form.cutoff);
      const preparedByUserId = await resolveCurrentUserAccountUserId();
      const details = {
        ...Object.fromEntries(manualEarnings.slice(2).flatMap(line => [
          [line.quantity, form[line.quantity]], [line.amount, money(line.value)],
        ])),
        ...Object.fromEntries(MANUAL_DEDUCTIONS.map(([field]) => [field, money(toNumber(form[field]))])),
        allowanceAmt: money(toNumber(form.allowanceAmt)),
      };
      const { error: itemError } = await supabase.rpc('save_manual_payroll_draft', {
        p_start: start, p_end: end, p_cutoff: cutoffLabel, p_prepared_by: preparedByUserId,
        p_item: {
          employee_id: manualEmployee.employeeId,
          employee_name: manualEmployee.name,
          position: manualEmployee.position,
          outlet: manualEmployee.outlet,
          salary_rate: manualDailyRate,
          total_work_hours: roundMoney(toNumber(form.regularHours) + toNumber(form.overtime)),
          regular_hours: toNumber(form.regularHours),
          overtime_hours: toNumber(form.overtime),
          basic_pay: manualEarnings[0].value,
          overtime_pay: manualEarnings[1].value,
          gross_pay: manualGross,
          other_deductions: manualDeductions,
          total_deductions: manualDeductions,
          net_pay: manualNetPay,
          payslip_details: details,
        },
      });

      if (itemError) throw itemError;

      await fetchPayroll();
      setAddDialog(false); setForm(EMPTY);
      setSnackbar({ open: true, message: `Payroll draft saved for ${manualEmployee.name}.`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { start, end, year, cutoffLabel, payDateLabel } = getSemiMonthlyCutoffRange(generatePeriod, generateCutoff);
      const [preparedByUserId, rates, existingPeriod] = await Promise.all([
        resolveCurrentUserAccountUserId(),
        loadPayrollRates(),
        supabase.from('payroll_summaries').select('payroll_id, status')
          .eq('period_start', start).eq('period_end', end).maybeSingle(),
      ]);
      if (existingPeriod.error) throw existingPeriod.error;
      if (existingPeriod.data && existingPeriod.data.status !== 'Draft') {
        throw new Error('This cutoff already has payroll beyond Draft. Review the existing payroll before generating it again.');
      }
      if (existingPeriod.data) {
        const { data: manualItems, error } = await supabase.from('payroll_items').select('payroll_item_id')
          .eq('payroll_id', existingPeriod.data.payroll_id).eq('remarks', 'Manual payroll entry').limit(1);
        if (error) throw error;
        if (manualItems?.length) throw new Error('This cutoff contains manual drafts. Review those payslips before regenerating payroll.');
      }
      const holidays = (rates.holidays ?? []).filter(holiday => holiday.date >= start && holiday.date <= end);
      const hasRegularHoliday = holidays.some(holiday => holiday.type === 'regular');
      const holidayDates = new Set(holidays.map(holiday => holiday.date));

      const calculate = await loadAttendanceCalculator(undefined, start, end);
      const attendanceLogs = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('attendance_logs')
          .select(`${attendancePunchFields},log_id,employee_name`)
          .gte('attendance_date', start).lte('attendance_date', end).not('employee_id', 'is', null)
          .order('log_id').range(offset, offset + pageSize - 1);
        if (error) throw error;
        attendanceLogs.push(...data.map(log => calculate(log)));
        if (data.length < pageSize) break;
      }

      if (!attendanceLogs?.length && !hasRegularHoliday) {
        const latestMonth = await latestAttendanceMonth();
        const latestHint = latestMonth
          ? ` Latest saved attendance is for ${formatMonthLabel(latestMonth)}.`
          : '';
        throw new Error(`No attendance logs were found for ${cutoffLabel}.${latestHint} Choose a payroll period with saved Attendance Monitoring records, then generate payroll again.`);
      }

      const employeeIdsWithLogs = [...new Set((attendanceLogs ?? []).map(log => String(log.employee_id)).filter(Boolean))];
      const employeesQuery = supabase
        .from('employees')
        .select('employee_id, first_name, middle_name, last_name, suffix, position, outlet, salary, status, hire_date');
      const { data: employees, error: employeesError } = await (hasRegularHoliday
        ? employeesQuery.ilike('status', 'active')
        : employeesQuery.in('employee_id', employeeIdsWithLogs));

      if (employeesError) throw employeesError;
      const employeeIds = (employees ?? []).filter(employee =>
        employeeIdsWithLogs.includes(employee.employee_id) || holidays.some(holiday =>
          holiday.type === 'regular' && (!employee.hire_date || employee.hire_date <= holiday.date),
        ),
      ).map(employee => employee.employee_id);
      if (!employeeIds.length) throw new Error('No eligible active employees were found for the selected cutoff.');

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
          const matchesPosition = !generatePosition || jobTitleKey(String(employee?.position ?? '')) === jobTitleKey(generatePosition);
          return isActive && matchesPosition;
        }),
      );

      const usableLogs = (attendanceLogs ?? []).filter(log => targetEmployeeIds.has(String(log.employee_id)));
      if (targetEmployeeIds.size === 0) {
        throw new Error(generatePosition
          ? `Attendance logs were found, but none are for active ${generatePosition} employees in the selected period.`
          : 'Attendance logs were found, but none belong to active employees in the selected period.');
      }

      const positions = [...new Set([...targetEmployeeIds].flatMap(employeeId => {
        const position = String(employeeMap.get(employeeId)?.position ?? '');
        const listedTitle = jobTitleOptions.find(title => jobTitleKey(title) === jobTitleKey(position));
        return [position, listedTitle].filter((title): title is string => Boolean(title));
      }))];
      const jobSalaryMap = await loadJobSalaryRates(positions);

      const groupedLogs = usableLogs.reduce((map, log) => {
        const employeeId = String(log.employee_id);
        map.set(employeeId, [...(map.get(employeeId) ?? []), log]);
        return map;
      }, new Map<string, typeof usableLogs>());
      const hoursByEmployee = new Map([...groupedLogs].map(([employeeId, logs]) => [employeeId, summarizePayrollHours(logs)]));

      const summaryPayloads = [...targetEmployeeIds].map(employeeId => {
        const logs = groupedLogs.get(employeeId) ?? [];
        const employee = employeeMap.get(employeeId);
        const { workedHours: totalWorkHours, overtimeMinutes: totalOvertimeMinutes, regularMinutes,
          lateMinutes: totalLateMinutes, undertimeMinutes: totalUndertimeMinutes } =
          hoursByEmployee.get(employeeId) ?? summarizePayrollHours([]);
        const totalAbsentDays = logs.filter(log => log.is_absent).length;
        const totalIncompleteDays = logs.filter(log => log.is_incomplete).length;
        const overtimeHours = roundMoney(totalOvertimeMinutes / 60);
        const regularHours = roundMoney(regularMinutes / 60);
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
          total_overtime_count: logs.filter(log => log.paidOvertime > 0).length,
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

      const payrollId = existingPeriod.data?.payroll_id ?? await getNextPayrollId(year);
      const isYearEndLeaveConversion = generateCutoff === '5' && String(generatePeriod).endsWith('-12');
      const leaveAllowanceMap = new Map<string, number>();
      const usedLeaveMap = new Map<string, number>();

      if (isYearEndLeaveConversion && targetEmployeeIds.size > 0) {
        const { data: leaveBalances, error: leaveBalancesError } = await supabase
          .from('employee_leave_balances')
          .select('employee_id, leave_type, available')
          .in('employee_id', [...targetEmployeeIds]);

        if (leaveBalancesError) throw leaveBalancesError;

        (leaveBalances ?? []).forEach((row: any) => {
          const employeeId = String(row.employee_id ?? '');
          if (!employeeId) return;
          const leaveType = String(row.leave_type ?? '');
          const allowance = Number(row.available ?? COMPANY_ANNUAL_LEAVE_ALLOWANCE) || COMPANY_ANNUAL_LEAVE_ALLOWANCE;
          if (leaveType === COMPANY_PAID_LEAVE_TYPE || !leaveAllowanceMap.has(employeeId)) {
            leaveAllowanceMap.set(employeeId, Math.max(leaveAllowanceMap.get(employeeId) ?? 0, allowance));
          }
        });

        const { data: approvedLeaves, error: approvedLeavesError } = await supabase
          .from('employee_requests')
          .select('employee_id, start_date, end_date')
          .in('employee_id', [...targetEmployeeIds])
          .eq('request_type', 'Leave')
          .eq('status', 'Approved')
          .gte('end_date', `${year}-01-01`)
          .lte('start_date', `${year}-12-31`);

        if (approvedLeavesError) throw approvedLeavesError;

        (approvedLeaves ?? []).forEach((request: any) => {
          const employeeId = String(request.employee_id ?? '');
          usedLeaveMap.set(employeeId, (usedLeaveMap.get(employeeId) ?? 0) + leaveDaysInYear(request.start_date, request.end_date || request.start_date, year));
        });
      }

      const fallbackRate = parseSalaryRate(generateBaseOverride ?? defaultDailyRateForPosition(generatePosition));
      let nightReviewCount = 0;
      const payrollItems = summaries.map((summary: any) => {
        const employee = employeeMap.get(summary.employee_id);
        const position = String(summary.position || employee?.position || '');
        const salaryRate = parseSalaryRate(employee?.salary) || jobSalaryMap.get(jobTitleKey(position)) || fallbackRate;
        const hourlyRate = salaryRate > 0 ? salaryRate / payrollHoursPerDay : 0;
        const regularHours = toNumber(summary.regular_hours);
        const overtimeHours = toNumber(summary.overtime_hours);
        const lateMinutes = Math.round(toNumber(summary.total_late_minutes));
        const undertimeMinutes = Math.round(toNumber(summary.total_undertime_minutes));
        const absentDays = Math.round(toNumber(summary.total_absent_days));
        const logs = groupedLogs.get(summary.employee_id) ?? [];
        const hours = hoursByEmployee.get(summary.employee_id) ?? summarizePayrollHours([]);
        const premiums = calculatePayrollPremiums(logs.map(log => ({ ...log, work_intervals: log.workedIntervals })), holidays, salaryRate, rates, employee?.hire_date);
        const nightNeedsReview = premiums.nightNeedsReview && (rates.nsd_percent ?? payrollPremiumDefaults.nsd_percent) > 0;
        if (nightNeedsReview) nightReviewCount++;
        const nonHolidayAbsences = logs.filter(log => log.is_absent && !holidayDates.has(log.attendance_date)).length;
        const { basicPay, basicPayHours, overtimePay, lateDeduction, undertimeDeduction, absenceDeduction } =
          calculateAttendancePay(hours, salaryRate, nonHolidayAbsences);
        const annualLeaveAllowance = leaveAllowanceMap.get(summary.employee_id) ?? COMPANY_ANNUAL_LEAVE_ALLOWANCE;
        const usedLeaveDays = usedLeaveMap.get(summary.employee_id) ?? 0;
        const unusedLeaveDays = isYearEndLeaveConversion ? Math.max(annualLeaveAllowance - usedLeaveDays, 0) : 0;
        const leaveConversionPay = roundMoney(unusedLeaveDays * salaryRate);
        const grossPay = roundMoney(basicPay + overtimePay + leaveConversionPay
          + premiums.nsdAmt + premiums.regularHolidayAmt + premiums.specialHolidayAmt);
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
          payslip_details: {
            payrollDisplayId: formatPayrollDisplayIdFromEmployee(summary.employee_id, start, payrollId),
            hourlyRate: roundMoney(hourlyRate),
            generatedPremiums: true,
            basicPayHours: basicPayHours.toFixed(2),
            nightNeedsReview,
            regularUnworkedDays: premiums.regularUnworkedDays,
            nsdHours: premiums.nsdHours ? String(premiums.nsdHours) : '',
            nsdAmt: premiums.nsdAmt ? money(premiums.nsdAmt) : '',
            regularHolidayDays: premiums.regularHolidayDays ? String(premiums.regularHolidayDays) : '',
            regularHolidayAmt: premiums.regularHolidayAmt ? money(premiums.regularHolidayAmt) : '',
            specialHolidayDays: premiums.specialHolidayDays ? String(premiums.specialHolidayDays) : '',
            specialHolidayAmt: premiums.specialHolidayAmt ? money(premiums.specialHolidayAmt) : '',
            leaveConversionDays: unusedLeaveDays ? String(unusedLeaveDays) : '',
            leaveConversionRate: unusedLeaveDays ? money(salaryRate) : '',
            leaveConversionAmt: unusedLeaveDays ? money(leaveConversionPay) : '',
          },
          remarks: `Generated from Attendance Monitoring logs for ${cutoffLabel}. ${payDateLabel}.`,
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

      const { error: saveError } = await supabase.rpc('save_generated_payroll', {
        p_replace_draft: Boolean(existingPeriod.data),
        p_items: payrollItems,
        p_summary: {
          payroll_id: payrollId,
          period_start: start,
          period_end: end,
          cutoff_label: cutoffLabel,
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
          remarks: `Generated directly from Attendance Monitoring attendance_logs. ${payDateLabel}.`,
        },
      });
      if (saveError) throw saveError;

      await fetchPayroll();
      setGenerateDialog(false);
      setGeneratePosition('');
      setSnackbar({
        open: true,
        message: nightReviewCount
          ? `Payroll generated. Review night shift hours on ${nightReviewCount} payslip(s) with incomplete punch or break timing.`
          : `Payroll generated from Attendance Monitoring. Payroll ID: ${payrollId}`,
        severity: nightReviewCount ? 'warning' : 'success',
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

  const handleReleaseSalary = (ids?: string[]) => {
    const eligible = (ids ? payrolls.filter(p => ids.includes(p.id)) : filtered)
      .filter(p => p.payrollId && p.periodStart && p.periodEnd && ['For Review', 'Processed'].includes(p.status));
    const options = [...new Map(eligible.map(row => [row.payrollId, row])).values()];
    if (!options.length) {
      setSnackbar({ open: true, message: 'No payroll cutoffs ready for release.', severity: 'success' });
      return;
    }
    setReleaseOptions(options);
    setReleaseReview(null);
    setReleaseError('');
    setReviewAcknowledged(false);
    setReleaseCutoff(options[0]);
  };

  useEffect(() => {
    if (!releaseCutoff?.payrollId || !releaseCutoff.periodStart || !releaseCutoff.periodEnd) return;
    const { payrollId, periodStart, periodEnd } = releaseCutoff;
    let active = true;
    async function loadReview() {
      try {
        const pageSize = 500;
        const items = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase.from('payroll_items')
            .select('employee_id,employee_name,total_work_hours,attendance_summary_id,regular_hours,overtime_hours,total_late_minutes,total_undertime_minutes').eq('payroll_id', payrollId)
            .order('payroll_item_id').range(offset, offset + pageSize - 1);
          if (error) throw error;
          items.push(...data);
          if (data.length < pageSize) break;
        }
        if (!items.length) throw new Error('No employees are in this cutoff.');
        const employees = new Map(items.map(item => [item.employee_id, { logs: [] as CalculatedAttendance[], exceptions: 0 }]));
        const calculate = await loadAttendanceCalculator(undefined, periodStart, periodEnd);
        for (let offset = 0; ; offset += pageSize) {
          const { data, error: logError } = await supabase.from('attendance_logs')
            .select(`${attendancePunchFields},validation_status`)
            .gte('attendance_date', periodStart).lte('attendance_date', periodEnd)
            .order('log_id').range(offset, offset + pageSize - 1);
          if (logError) throw logError;
          for (const log of data ?? []) {
            const employee = employees.get(log.employee_id);
            if (!employee) continue;
            employee.logs.push(calculate(log));
            if (log.validation_status !== 'Validated') employee.exceptions++;
          }
          if (!data || data.length < pageSize) break;
        }
        if (active) setReleaseReview({
          employees: items.map(item => item.employee_name || item.employee_id).sort(),
          exceptions: [...employees.values()].reduce((sum, employee) => sum + employee.exceptions, 0),
          differences: items.filter(item => {
            if (!item.attendance_summary_id) return false;
            const hours = summarizePayrollHours(employees.get(item.employee_id)?.logs ?? []);
            return roundMoney(hours.workedHours) !== toNumber(item.total_work_hours)
              || roundMoney(hours.regularMinutes / 60) !== toNumber(item.regular_hours)
              || roundMoney(hours.overtimeMinutes / 60) !== toNumber(item.overtime_hours)
              || hours.lateMinutes !== toNumber(item.total_late_minutes)
              || hours.undertimeMinutes !== toNumber(item.total_undertime_minutes);
          }).length,
        });
      } catch {
        if (active) setReleaseError('Could not verify this cutoff. Close the review and try again.');
      }
    }
    void loadReview();
    return () => { active = false; };
  }, [releaseCutoff]);

  const confirmRelease = async () => {
    if (!releaseReview || !releaseCutoff?.payrollId || releasing || (releaseHasIssues && !reviewAcknowledged)) return;
    const targets = payrolls.filter(p => p.payrollId === releaseCutoff.payrollId);
    if (targets.length === 0) {
      setSnackbar({ open: true, message: 'No payrolls ready for release.', severity: 'success' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const payrollIds = [...new Set(targets.map(p => p.payrollId).filter(Boolean))];

    setReleasing(true);
    try {
      const { data, error: updateError } = await supabase
        .from('payroll_summaries')
        .update({
          status: 'Endorsed',
          endorsed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('payroll_id', releaseCutoff.payrollId).in('status', ['Reviewed', 'Approved']).select('payroll_id').maybeSingle();

      if (updateError) throw updateError;
      if (!data) {
        setReleaseReview(null);
        setReleaseError('The cutoff status changed. Close this window and refresh payroll.');
        return;
      }

      setPayrolls(prev => prev.map(x => payrollIds.includes(x.payrollId) ? { ...x, status: 'Released' as any, payslipDate: today } : x));
      if (selectedPayroll?.payrollId && payrollIds.includes(selectedPayroll.payrollId)) {
        setSelectedPayroll(p => p ? { ...p, status: 'Released', payslipDate: today } : p);
      }

      setReleaseCutoff(null);
      setSnackbar({ open: true, message: `Released payslips for ${releaseReview.employees.length} employee(s).`, severity: 'success' });
    } catch (e: any) {
      setReleaseError(`Could not release payslips: ${e.message ?? e}`);
    } finally {
      setReleasing(false);
    }
  };

  const handlePayslipFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedPayroll) return;

    setUploadingPayslip(true);
    try {
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `${selectedPayroll.employeeId || 'employee'}/${selectedPayroll.period}/${selectedPayroll.id}-${Date.now()}-${safeFileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payslips')
        .upload(objectPath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const payslipDetails = {
        ...selectedPayroll.payslipDetails,
        nsdHours: selectedPayroll.nsdHours ?? '',
        nsdAmt: selectedPayroll.nsdAmt ?? '',
        regularHolidayDays: selectedPayroll.regularHolidayDays ?? '',
        regularHolidayAmt: selectedPayroll.regularHolidayAmt ?? '',
        specialHolidayDays: selectedPayroll.specialHolidayDays ?? '',
        specialHolidayAmt: selectedPayroll.specialHolidayAmt ?? '',
        silDays: selectedPayroll.silDays ?? '',
        silAmt: selectedPayroll.silAmt ?? '',
        allowanceAmt: selectedPayroll.allowanceAmt ?? '',
        retroAmt: selectedPayroll.retroAmt ?? '',
        sssAmt: selectedPayroll.sssAmt ?? '',
        phicAmt: selectedPayroll.phicAmt ?? '',
        hdmfAmt: selectedPayroll.hdmfAmt ?? '',
        cashAdvance: selectedPayroll.cashAdvance ?? '',
        atd: selectedPayroll.atd ?? '',
        otherCharges: selectedPayroll.otherCharges ?? '',
        breakages: selectedPayroll.breakages ?? '',
        amesco: selectedPayroll.amesco ?? '',
        pagibigLoan: selectedPayroll.pagibigLoan ?? '',
        uploadedPayslipName: file.name,
        uploadedPayslipPath: objectPath,
      };

      const { error: updateError } = await supabase
        .from('payroll_items')
        .update({
          payslip_details: payslipDetails,
          updated_at: new Date().toISOString(),
        })
        .eq('payroll_item_id', selectedPayroll.id);

      if (updateError) throw updateError;

      const updated = {
        ...selectedPayroll,
        payslipDetails,
        uploadedPayslipName: file.name,
        uploadedPayslipPath: objectPath,
      };
      setSelectedPayroll(updated);
      setPayrolls(prev => prev.map(payroll => payroll.id === selectedPayroll.id ? updated : payroll));
      setSnackbar({ open: true, message: 'Payslip file uploaded for employee access.', severity: 'success' });
    } catch (e: any) {
      setSnackbar({
        open: true,
        message: `Upload failed: ${e.message ?? e}. Confirm that the private "payslips" Storage bucket and access policies are configured.`,
        severity: 'error',
      });
    } finally {
      setUploadingPayslip(false);
    }
  };

  const openUploadedPayslip = async (payroll: Payroll) => {
    if (!payroll.uploadedPayslipPath) return;

    const { data, error } = await supabase.storage
      .from('payslips')
      .createSignedUrl(payroll.uploadedPayslipPath, 60 * 5);

    if (error || !data?.signedUrl) {
      setSnackbar({ open: true, message: `Could not open uploaded payslip: ${error?.message ?? 'Missing file URL'}`, severity: 'error' });
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
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
      icon: <Payments fontSize="small" />,
    },
    {
      label: 'Gross Pay',
      value: `₱${Math.round(totals.gross).toLocaleString()}`,
      icon: <Calculate fontSize="small" />,
    },
    {
      label: 'Deductions',
      value: `₱${Math.round(totals.ded).toLocaleString()}`,
      icon: <DeleteOutline fontSize="small" />,
    },
    {
      label: 'Net Pay',
      value: `₱${Math.round(totals.net).toLocaleString()}`,
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
        <h2>${escapePayslipText(payslipHeading(p.outlet).title)}</h2>
      </div>
      <table style="margin-top:0;">
        <tr><td style="width:40%"><b>Department:</b></td><td colspan="2">${escapePayslipText(payslipHeading(p.outlet).department)}</td></tr>
        <tr><td><b>Pay period:</b></td><td colspan="2">${escapePayslipText(p.payPeriodLabel)}</td></tr>
        <tr class="highlight"><td><b>Employee Name:</b></td><td colspan="2"><b>${p.employee.toUpperCase()}</b></td></tr>
        <tr><td><b>Position:</b></td><td colspan="2">${p.position || '—'}</td></tr>
        <tr><td><b>Rate:</b></td><td colspan="2">${p.payRate}</td></tr>
        <tr class="sec-hdr"><td>Earnings:</td><td class="center" style="width:24%">Days/Hours/Mins.</td><td class="right" style="width:22%">Amount</td></tr>
        <tr><td>Basic Pay</td><td class="right">${p.basicPayHours || p.regularHours || '—'}</td><td class="right">${p.basicPayAmt || fmtAmt(grossAmt)}</td></tr>
        <tr><td>Reg.OT</td><td class="right">${p.overtime && p.overtime !== '0' ? p.overtime : '—'}</td><td class="right">${p.otAmt || '—'}</td></tr>
        <tr><td>NSD</td><td class="right">${p.nsdHours || '—'}</td><td class="right">${p.nsdAmt || '—'}</td></tr>
        <tr><td>Regular Holiday</td><td class="right">${p.regularHolidayDays || '—'}</td><td class="right">${p.regularHolidayAmt || '—'}</td></tr>
        <tr><td>Special Holiday</td><td class="right">${p.specialHolidayDays || '—'}</td><td class="right">${p.specialHolidayAmt || '—'}</td></tr>
        <tr><td>SIL</td><td class="right">${p.silDays || '—'}</td><td class="right">${p.silAmt || '—'}</td></tr>
        <tr><td>Allowance</td><td class="right">—</td><td class="right">${p.allowanceAmt || '—'}</td></tr>
        <tr><td>RETRO</td><td class="right">—</td><td class="right">${p.retroAmt || '—'}</td></tr>
        ${p.leaveConversionAmt ? `<tr><td>Unused Leave Conversion</td><td class="right">${escapePayslipText(p.leaveConversionDays || '—')}</td><td class="right">${escapePayslipText(p.leaveConversionAmt)}</td></tr>` : ''}
        <tr class="gross-row"><td colspan="2" class="center">GROSS PAY</td><td class="right">${fmtAmt(grossAmt)}</td></tr>
        <tr class="sec-hdr"><td colspan="3">DEDUCTIONS:</td></tr>
        <tr><td>Tardiness (Mins.)</td><td class="right">${p.tardinessMin || '—'}</td><td class="right">${fmtAmt(toNumber(p.lateDeductionAmt))}</td></tr>
        <tr><td>Undertime (Hours)</td><td class="right">${p.undertimeHours || '—'}</td><td class="right">${fmtAmt(toNumber(p.undertimeDeductionAmt))}</td></tr>
        ${toNumber(p.absenceDeductionAmt) ? `<tr><td colspan="2">Absences</td><td class="right">${fmtAmt(toNumber(p.absenceDeductionAmt))}</td></tr>` : ''}
        <tr><td colspan="2">SSS Premium</td><td class="right">${p.sssAmt || '—'}</td></tr>
        <tr><td colspan="2">PHIC Premium</td><td class="right">${p.phicAmt || '—'}</td></tr>
        <tr><td colspan="2">HDMF Premium</td><td class="right">${p.hdmfAmt || '—'}</td></tr>
        <tr><td colspan="2">CASH ADVANCE</td><td class="right">${p.cashAdvance || '—'}</td></tr>
        <tr><td colspan="2">ATD</td><td class="right">${p.atd || '—'}</td></tr>
        <tr><td colspan="2">Breakages</td><td class="right">${p.breakages || '—'}</td></tr>
        <tr><td colspan="2">OTHER Charges</td><td class="right">${p.otherCharges || '—'}</td></tr>
        <tr><td colspan="2">AMESCO/OTHER CHARGES</td><td class="right">${p.amesco || '—'}</td></tr>
        <tr><td colspan="2">PAG-IBIG LOAN</td><td class="right">${p.pagibigLoan || '—'}</td></tr>
        <tr class="sec-hdr"><td colspan="2" class="right">TOTAL DEDUCTIONS:</td><td class="right">${totalDed > 0 ? fmtAmt(totalDed) : '—'}</td></tr>
        <tr class="net-row"><td colspan="2" class="center">NET PAY</td><td class="right">${fmtAmt(netAmt)}</td></tr>
      </table>
      <div class="ack">
        I acknowledge to have received the amount of <b>${fmtAmt(netAmt)}</b> and have no further claim for services rendered.
      </div>
      <div class="sig">
        <div class="sig-line">Date: ${p.payslipDate ? formatDisplayDate(p.payslipDate) : '___________'}</div>
        <div style="width:42%; text-align:center;">
          <div style="padding-bottom:4px; border-bottom:1px solid #333; font-size:10px;">${p.employee.toUpperCase()}</div>
          <div style="font-size:9px; margin-top:3px;">${p.position || '—'}</div>
        </div>
      </div>
      <div class="footer">Generated: ${formatDisplayDateTime(new Date())} &nbsp;·&nbsp; Payroll ID: ${p.displayId ?? p.payrollId ?? p.id} &nbsp;·&nbsp; Electronically generated payslip.</div>
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

            {(canManagePayroll || canReleasePayroll) && (
              <Button variant="outlined" startIcon={<CalendarMonth />} onClick={() => setMonthlyHoursOpen(true)}
                sx={{ ...pillButtonSx, py: 1.1, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}>
                Monthly Hours
              </Button>
            )}

            {isHRAdmin && (
              <Button variant="outlined" startIcon={<Settings />} onClick={() => setRatesDialog(true)}
                sx={{ ...pillButtonSx, py: 1.1, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}>
                Payroll Rates
              </Button>
            )}

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
                  onClick={openGenerateDialog}
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
          </Box>
        </Box>

        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Filter by Cutoff Month"
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
                <TableCell>Payroll Cutoff</TableCell>
                <TableCell>Total Hours<br />Includes OT</TableCell>
                <TableCell>Approved Overtime</TableCell>
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
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Typography variant="body2" fontWeight={700}>{p.cutoffLabel}</Typography>
                    <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>{p.payPeriodLabel}</Typography>
                  </TableCell>
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

      {isHRAdmin && (
        <Dialog open={ratesDialog} onClose={() => { if (!savingRates) setRatesDialog(false); }}
          maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }} aria-labelledby="payroll-rates-title">
          <Box component="form" onSubmit={savePremiumRates} noValidate>
            <DialogTitle id="payroll-rates-title" fontWeight={700} sx={dialogTitleSx}>Payroll Rates</DialogTitle>
            <DialogContent sx={{ display: 'grid', gap: 2, pt: '18px !important' }}>
              <Typography variant="body2" color="text.secondary">
                Payroll uses these percentages for eligible night hours and worked holidays. Basic Pay already includes worked hours, so enter only the holiday premium. An unworked regular holiday pays one daily rate.
              </Typography>
              {ratesError && <Alert severity="error">{ratesError}</Alert>}
              {loadingRates && <CircularProgress size={24} aria-label="Loading payroll rates" />}
              {!loadingRates && premiumRates && payrollPremiumFields.map(({ column, label, basis }) => (
                <TextField key={column} label={label} value={ratesDraft[column] ?? ''}
                  disabled={savingRates} onChange={event => {
                    const value = event.target.value;
                    if (/^\d*(?:\.\d*)?$/.test(value)) setRatesDraft(current => ({ ...current, [column]: value }));
                  }}
                  helperText={column === 'sil_percent' ? 'Percentage of daily pay per eligible day'
                    : `Default ${payrollPremiumDefaults[column]}% of ${basis} pay`}
                  inputProps={{ inputMode: 'decimal' }}
                  InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }} />
              ))}
              {!loadingRates && premiumRates && (
                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  <Typography fontWeight={700}>Holiday calendar</Typography>
                  <TextField label="Holiday date" type="date" value={holidayDate} disabled={savingRates}
                    onChange={event => setHolidayDate(event.target.value)} fullWidth />
                  <TextField select label="Holiday type" value={holidayType} disabled={savingRates}
                    onChange={event => setHolidayType(event.target.value as PayrollHoliday['type'])}>
                    <MenuItem value="regular">Regular Holiday</MenuItem>
                    <MenuItem value="special">Special Holiday</MenuItem>
                  </TextField>
                  <Button type="button" variant="outlined" disabled={!holidayDate || savingRates} onClick={() => {
                    setHolidayDraft(current => [...current.filter(holiday => holiday.date !== holidayDate),
                      { date: holidayDate, type: holidayType }].sort((a, b) => a.date.localeCompare(b.date)));
                    setHolidayDate('');
                  }}>Add or Update Holiday</Button>
                  {holidayDraft.map(holiday => (
                    <Box key={holiday.date} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant="body2">
                        {formatDisplayDate(holiday.date)} · {holiday.type === 'regular' ? 'Regular' : 'Special'}
                      </Typography>
                      <IconButton type="button" size="small" disabled={savingRates}
                        aria-label={`Remove holiday on ${formatDisplayDate(holiday.date)}`}
                        onClick={() => setHolidayDraft(current => current.filter(item => item.date !== holiday.date))}>
                        <DeleteOutline fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button disabled={savingRates} onClick={() => setRatesDialog(false)}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={loadingRates || savingRates || !premiumRates}>
                {savingRates ? 'Saving…' : 'Save Rates'}
              </Button>
            </DialogActions>
          </Box>
        </Dialog>
      )}

      {monthlyHoursOpen && (canManagePayroll || canReleasePayroll) && (
        <MonthlyHoursDialog onClose={() => setMonthlyHoursOpen(false)} showDrafts={canManagePayroll} />
      )}

      <Dialog open={Boolean(releaseCutoff)} onClose={() => { if (!releasing) setReleaseCutoff(null); }} fullWidth maxWidth="sm" aria-labelledby="release-review-title">
        <DialogTitle id="release-review-title" sx={dialogTitleSx}>Review Payroll Release</DialogTitle>
        {releaseCutoff && (
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '20px !important' }}>
            <TextField select fullWidth label="Payroll Cutoff" value={releaseCutoff.payrollId}
              disabled={releasing} onChange={event => {
                setReleaseReview(null);
                setReleaseError('');
                setReviewAcknowledged(false);
                setReleaseCutoff(releaseOptions.find(option => option.payrollId === event.target.value) ?? null);
              }}>
              {releaseOptions.map(option => (
                <MenuItem key={option.payrollId} value={option.payrollId}>{option.cutoffLabel} ({option.payPeriodLabel})</MenuItem>
              ))}
            </TextField>
            {releaseError && <Alert severity="error">{releaseError}</Alert>}
            {!releaseError && !releaseReview && <Typography role="status">Checking cutoff hours and attendance…</Typography>}
            {releaseReview && (
              <>
                <Typography fontWeight={700}>{releaseReview.employees.length} employees in this cutoff</Typography>
                <Box component="ul" sx={{ my: 0, pl: 3, maxHeight: 160, overflowY: 'auto' }}>
                  {releaseReview.employees.map((employee, index) => <li key={index}>{employee}</li>)}
                </Box>
                {releaseReview.exceptions > 0 || releaseReview.differences > 0 ? (
                  <Alert severity="warning">
                    {releaseReview.exceptions} attendance entries need review. {releaseReview.differences} employees have saved hours or adjustments that differ from current attendance. Regenerate the cutoff to recalculate these amounts.
                  </Alert>
                ) : <Alert severity="success">Saved payroll hours match DTR. No attendance entries need review.</Alert>}
                {releaseHasIssues && (
                  <FormControlLabel label="I reviewed the flagged items for this cutoff."
                    control={<Checkbox checked={reviewAcknowledged} disabled={releasing}
                      onChange={event => setReviewAcknowledged(event.target.checked)} />} />
                )}
              </>
            )}
          </DialogContent>
        )}
        <DialogActions>
          <Button disabled={releasing} onClick={() => setReleaseCutoff(null)}>Cancel</Button>
          <Button variant="contained" disabled={!releaseReview || releasing || (releaseHasIssues && !reviewAcknowledged)} onClick={confirmRelease}>
            {releasing ? 'Releasing…' : 'Confirm Release'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generate Payroll Dialog */}
      <Dialog open={generateDialog} onClose={() => { setGenerateDialog(false); setGeneratePosition(''); }} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>Generate Payroll</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '18px !important', px: { xs: 2, sm: 3 }, bgcolor: '#fbfff9' }}>
          <Alert severity="info" sx={{ fontSize: '0.8rem' }}>
            Uses the attendance and HR approvals for the selected cutoff. Select the same cutoff again to recalculate a draft after an attendance correction or approval.
          </Alert>
          <TextField label="Payroll Period" type="month" fullWidth value={generatePeriod}
            onChange={e => setGeneratePeriod(e.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField
            label="Cutoff"
            select
            fullWidth
            value={generateCutoff}
            onChange={e => setGenerateCutoff(e.target.value)}
            helperText={generateCutoff === '5' ? 'Covers previous month 21st to selected month 5th. Salary payout: 10th.' : 'Covers 6th to 20th. Salary payout: 25th.'}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="5">Cutoff 5 - payout 10</MenuItem>
            <MenuItem value="20">Cutoff 20 - payout 25</MenuItem>
          </TextField>
          <TextField
            label="Position (Optional)"
            select fullWidth value={generatePosition}
            onChange={e => {
              setGeneratePosition(e.target.value);
              setGenerateBaseOverride(null);
              setSelectedJobRate(null);
            }}
            InputLabelProps={{ shrink: true }}
            helperText="Leave blank to generate for all active employees"
          >
            <MenuItem key="all-pos" value="">All Positions</MenuItem>
            {includeSelectedJobTitle(jobTitleOptions, generatePosition).map(title => <MenuItem key={title} value={title}>{title}</MenuItem>)}
          </TextField>
          <TextField label="Fallback Daily Salary Rate (₱)" type="number" fullWidth value={generateBase}
            onChange={e => setGenerateBaseOverride(e.target.value)}
            helperText={postedDailyRate
              ? `Payroll uses the saved job posting rate of ${money(postedDailyRate)}.`
              : 'Payroll uses this rate when the job posting has no saved daily rate.'} />
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
      <Dialog open={addDialog} onClose={() => { if (!saving) setAddDialog(false); }} maxWidth="md" fullWidth PaperProps={{ sx: dialogPaperSx }}>
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
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}><TextField label="Period" type="month" fullWidth value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Cutoff" select fullWidth value={form.cutoff} onChange={e => setForm({ ...form, cutoff: e.target.value })}>
                <MenuItem value="5">Cutoff 5 - payout 10</MenuItem>
                <MenuItem value="20">Cutoff 20 - payout 25</MenuItem>
              </TextField>
            </Grid>
            {[
              ['Position', manualEmployee?.position || '—'],
              ['Daily Rate', manualDailyRate ? money(manualDailyRate) : '—'],
              ['Hourly Rate', manualHourlyRate ? money(manualHourlyRate) : '—'],
            ].map(([label, value]) => (
              <Grid size={{ xs: 12, sm: 4 }} key={label}><TextField label={label} fullWidth value={value} InputProps={{ readOnly: true }} /></Grid>
            ))}
          </Grid>
          {manualRateError && <Alert severity="error">{manualRateError}</Alert>}
          {manualEmployee && manualRates && !manualDailyRate && <Alert severity="warning">Save a daily rate for this position before creating the draft.</Alert>}
          <Typography fontWeight={700}>Earnings</Typography>
          <Grid container spacing={2}>
            {manualEarnings.map(line => (
              <React.Fragment key={line.quantity}>
                <Grid size={6}>
                  <TextField fullWidth label={`${line.quantity === 'regularHours' ? 'Regular' : line.label} (${line.unit})`}
                    value={form[line.quantity]} inputProps={{ inputMode: 'decimal' }}
                    onChange={e => { if (/^\d{0,6}(?:\.\d{0,2})?$/.test(e.target.value)) setForm({ ...form, [line.quantity]: e.target.value }); }} />
                </Grid>
                <Grid size={6}>
                  <TextField fullWidth label={`${line.label} amount`}
                    value={manualDailyRate ? line.value.toFixed(2) : '—'}
                    InputLabelProps={{ shrink: true }}
                    InputProps={{ readOnly: true, startAdornment: <InputAdornment position="start">₱</InputAdornment> }} />
                </Grid>
              </React.Fragment>
            ))}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Allowance" value={form.allowanceAmt} inputProps={{ inputMode: 'decimal' }}
                InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                onChange={e => { if (/^\d{0,8}(?:\.\d{0,2})?$/.test(e.target.value)) setForm({ ...form, allowanceAmt: e.target.value }); }} />
            </Grid>
          </Grid>
          <Typography fontWeight={700}>Deductions</Typography>
          <Grid container spacing={2}>
            {MANUAL_DEDUCTIONS.map(([field, label]) => (
              <Grid size={{ xs: 6, sm: 4 }} key={field}>
                <TextField fullWidth label={label} value={form[field]} inputProps={{ inputMode: 'decimal' }}
                  InputProps={{ startAdornment: <InputAdornment position="start">₱</InputAdornment> }}
                  onChange={e => { if (/^\d{0,8}(?:\.\d{0,2})?$/.test(e.target.value)) setForm({ ...form, [field]: e.target.value }); }} />
              </Grid>
            ))}
          </Grid>
          <Typography fontWeight={700}>Payroll Summary</Typography>
          <Grid container spacing={2}>
            {([['Gross Pay', manualGross], ['Total Deductions', manualDeductions], ['Net Pay', manualNetPay]] as const).map(([label, value]) => (
              <Grid size={{ xs: 12, sm: 4 }} key={label}><TextField fullWidth label={label} value={money(value)} InputProps={{ readOnly: true }} /></Grid>
            ))}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfff9' }}>
          <Button onClick={() => setAddDialog(false)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={handleAdd} disabled={saving || !manualDailyRate || !form.period}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'Saving…' : 'Save as Draft'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Payslip Dialog */}
      <Dialog
        open={viewDialog}
        onClose={() => { setViewDialog(false); setEditingPayslip(false); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            ...dialogPaperSx,
            maxWidth: 768,
            mx: { xs: 1.5, sm: 4 },
            width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
          },
        }}
      >
        <DialogTitle sx={{ ...dialogTitleSx, pb: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Payslip
            {selectedPayroll && <Chip label={selectedPayroll.id} size="small" variant="outlined" />}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 2 }}>
          {editingPayslip && ratesError && <Alert severity="warning" sx={{ mb: 1 }}>{ratesError}</Alert>}
          {typeof selectedPayroll?.payslipDetails?.manualAdjustmentReason === 'string' && (
            <Alert severity="info" sx={{ mb: 1 }}>
              <Typography fontWeight={700}>Manual adjustment reason</Typography>
              {selectedPayroll.payslipDetails.manualAdjustmentReason}
            </Alert>
          )}
          {canManagePayroll && Boolean(selectedPayroll?.payslipDetails?.nightNeedsReview) && (
            <Alert severity="warning" sx={{ mb: 1 }}>Check night shift hours against the original punches. Some work or break times are missing.</Alert>
          )}
          {selectedPayroll && (
            <Box>
              {editingPayslip ? (
                /* ── Edit Mode — Receipt Format ── */
                <Box sx={{ border: '1px solid #999', fontSize: '0.78rem', lineHeight: 1.5, mb: 2 }}>
                  {/* Company Header */}
                  <Box sx={{ textAlign: 'center', py: 1, px: 2, borderBottom: '1px solid #999', bgcolor: '#f9f9f9' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', letterSpacing: 0.5 }}>{payslipHeading(selectedPayroll.outlet).title}</Typography>
                  </Box>
                  {[
                    ['Department:', payslipHeading(selectedPayroll.outlet).department],
                    ['Pay period:', selectedPayroll.payPeriodLabel],
                    ['Employee Name:', <TextField variant="standard" fullWidth size="small" value={payslipEditForm.employee} onChange={pef('employee')} inputProps={{ 'aria-label': 'Employee Name', style: { fontSize: '0.76rem', fontWeight: 700 } }} />],
                    ['Position:', <TextField variant="standard" fullWidth size="small" value={payslipEditForm.position} onChange={pef('position')} inputProps={{ 'aria-label': 'Position', style: { fontSize: '0.76rem' } }} />],
                    ['Rate:', selectedPayroll.payRate],
                  ].map(([label, value], index) => (
                    <Box key={String(label)} sx={{ display: 'flex', borderBottom: '1px solid #ccc', alignItems: 'center', bgcolor: index === 2 ? '#e8f5e9' : undefined }}>
                      <Box sx={{ width: '40%', fontWeight: 600, p: '3px 8px', borderRight: '1px solid #ccc' }}>{label}</Box>
                      <Box sx={{ flex: 1, px: 1 }}>{value}</Box>
                    </Box>
                  ))}
                  {/* Earnings header */}
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #ccc', bgcolor: '#f5f5f5' }}>
                    <Box sx={{ flex: 1, fontWeight: 700, p: '4px 8px', borderRight: '1px solid #ccc', fontSize: '0.77rem' }}>Earnings:</Box>
                    <Box sx={{ width: '24%', fontWeight: 700, p: '4px 6px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.7rem' }}>Days/Hours/Mins.</Box>
                    <Box sx={{ width: '22%', fontWeight: 700, p: '4px 6px', textAlign: 'right', fontSize: '0.77rem' }}>Amount</Box>
                  </Box>
                  {([
                    ['Basic Pay / Regular Hours Worked', 'regularHours',      'basicPayAmt'       ],
                    ['Reg.OT',            'overtime',           'otAmt'             ],
                    ['NSD',               'nsdHours',           'nsdAmt'            ],
                    ['Regular Holiday',   'regularHolidayDays', 'regularHolidayAmt' ],
                    ['Special Holiday',   'specialHolidayDays', 'specialHolidayAmt' ],
                    ['SIL',              'silDays',             'silAmt'            ],
                    ['Allowance',         null,                  'allowanceAmt'      ],
                    ['RETRO',  null,                  'retroAmt'          ],
                  ] as const).map(([label, quantity, amount]) => renderPayslipEditLine(label, quantity, amount))}
                  {/* GROSS PAY */}
                  <Box sx={{ display: 'flex', borderTop: '1px solid #999', borderBottom: '1px solid #999', bgcolor: '#fff9c4', fontWeight: 700, alignItems: 'center' }}>
                    <Box sx={{ flex: 1, p: '4px 8px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.77rem' }}>GROSS PAY</Box>
                    <Box sx={{ width: '24%', borderRight: '1px solid #ccc' }} />
                    <Box sx={{ width: '22%', p: '2px 6px', textAlign: 'right' }}>{money(payslipTotals.gross)}</Box>
                  </Box>
                  {/* DEDUCTIONS header */}
                  <Box sx={{ p: '4px 8px', borderBottom: '1px solid #ccc', fontWeight: 700, fontSize: '0.77rem', bgcolor: '#f5f5f5' }}>DEDUCTIONS:</Box>
                  {renderPayslipEditLine('Tardiness (Mins.)', 'tardinessMin', 'lateDeductionAmt')}
                  {renderPayslipEditLine('Undertime (Hours)', 'undertimeHours', 'undertimeDeductionAmt')}
                  {toNumber(selectedPayroll.absenceDeductionAmt) > 0 && (
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', px: 1, py: 0.5 }}>
                      <span>Absences</span><span>{money(toNumber(selectedPayroll.absenceDeductionAmt))}</span>
                    </Box>
                  )}

                  {([
                    ['SSS Premium',              'sssAmt'      ],
                    ['PHIC Premium',             'phicAmt'     ],
                    ['HDMF Premium',             'hdmfAmt'     ],
                    ['CASH ADVANCE',             'cashAdvance' ],
                    ['ATD',                      'atd'         ],
                    ['Breakages', 'breakages'   ],
                    ['OTHER Charges',            'otherCharges'],
                    ['AMESCO/OTHER CHARGES',     'amesco'      ],
                    ['PAG-IBIG LOAN',            'pagibigLoan' ],
                  ] as [string, PayslipAmountField][]).map(([label, key]) => (
                    <Box key={label} sx={{ display: 'flex', borderBottom: '1px solid #eee', alignItems: 'center' }}>
                      <Box sx={{ flex: 1, p: '1px 8px', borderRight: '1px solid #ccc', fontSize: '0.76rem' }}>{label}</Box>
                      <Box sx={{ width: '22%', px: 0.5 }}>{renderAmountInput(key, label)}</Box>
                    </Box>
                  ))}
                  {/* TOTAL DEDUCTIONS */}
                  <Box sx={{ display: 'flex', borderTop: '1px solid #999', borderBottom: '1px solid #999', fontWeight: 700, alignItems: 'center' }}>
                    <Box sx={{ flex: 1, p: '4px 8px', borderRight: '1px solid #ccc', textAlign: 'right', fontSize: '0.77rem' }}>TOTAL DEDUCTIONS:</Box>
                    <Box sx={{ width: '22%', p: '2px 6px', textAlign: 'right' }}>{money(payslipTotals.deductions)}</Box>
                  </Box>
                  {/* NET PAY */}
                  <Box sx={{ display: 'flex', borderBottom: '1px solid #999', bgcolor: '#fff9c4', fontWeight: 700, alignItems: 'center' }}>
                    <Box component="label" htmlFor="payslip-net-pay" sx={{ flex: 1, p: '4px 8px', borderRight: '1px solid #ccc', textAlign: 'center', fontSize: '0.77rem' }}>NET PAY</Box>
                    <Box sx={{ width: '22%', px: 0.75 }}>
                      <TextField
                        id="payslip-net-pay"
                        variant="standard"
                        fullWidth
                        value={money(payslipTotals.net)}
                        slotProps={{
                          input: { readOnly: true, disableUnderline: true },
                          htmlInput: { style: { textAlign: 'right', fontSize: '0.77rem', fontWeight: 700, padding: '2px 0' } },
                        }}
                      />
                    </Box>
                  </Box>
                  {/* Acknowledgment */}
                  <Box sx={{ p: '8px', fontSize: '0.72rem', lineHeight: 1.7, bgcolor: '#fafafa', borderBottom: '1px solid #eee' }}>
                    I acknowledge to have received the amount of <strong>{money(payslipTotals.net)}</strong> and have no further claim for services rendered.
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', p: '10px 8px', gap: 2, flexWrap: 'wrap' }}>
                    <TextField label="Date:" type="date" variant="standard" size="small" value={payslipEditForm.payslipDate}
                      onChange={pef('payslipDate')} InputLabelProps={{ shrink: true }} />
                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                      <Box sx={{ fontWeight: 700, borderBottom: '1px solid #333' }}>{payslipEditForm.employee.toUpperCase()}</Box>
                      <Box>{payslipEditForm.position || '—'}</Box>
                    </Box>
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
                    ['Basic Pay',           selectedPayroll.basicPayHours || selectedPayroll.regularHours || '—', selectedPayroll.basicPayAmt || fmt(grossAmt)],
                    ['Reg.OT',              selectedPayroll.overtime && selectedPayroll.overtime !== '0' ? selectedPayroll.overtime : '—', selectedPayroll.otAmt || '—'],
                    ['NSD',                 selectedPayroll.nsdHours  || '—',                            selectedPayroll.nsdAmt  || '—'],
                    ['Regular Holiday',     selectedPayroll.regularHolidayDays || '—',                   selectedPayroll.regularHolidayAmt || '—'],
                    ['Special Holiday',     selectedPayroll.specialHolidayDays || '—',                   selectedPayroll.specialHolidayAmt || '—'],
                    ['SIL',                 selectedPayroll.silDays   || '—',                            selectedPayroll.silAmt  || '—'],
                    ['Allowance',           '—',                                                          selectedPayroll.allowanceAmt || '—'],
                    ['RETRO',    '—',                                                          selectedPayroll.retroAmt || '—'],
                    ...(selectedPayroll.leaveConversionAmt
                      ? [['Unused Leave Conversion', selectedPayroll.leaveConversionDays || '—', selectedPayroll.leaveConversionAmt] as [string, string, string]]
                      : []),
                  ];

                  const deductionRows: [string, string][] = [
                    [`Tardiness (${toNumber(selectedPayroll.tardinessMin)} min)`, fmt(toNumber(selectedPayroll.lateDeductionAmt))],
                    [`Undertime (${roundMoney(toNumber(selectedPayroll.undertimeHours))} hrs)`, fmt(toNumber(selectedPayroll.undertimeDeductionAmt))],
                    ...(toNumber(selectedPayroll.absenceDeductionAmt) > 0 ? [['Absences', fmt(toNumber(selectedPayroll.absenceDeductionAmt))] as [string, string]] : []),
                    ['SSS Premium',              selectedPayroll.sssAmt      || '—'],
                    ['PHIC Premium',             selectedPayroll.phicAmt     || '—'],
                    ['HDMF Premium',             selectedPayroll.hdmfAmt     || '—'],
                    ['CASH ADVANCE',             selectedPayroll.cashAdvance || '—'],
                    ['ATD',                      selectedPayroll.atd         || '—'],
                    ['Breakages', selectedPayroll.breakages   || '—'],
                    ['OTHER Charges',            selectedPayroll.otherCharges || '—'],
                    ['AMESCO/OTHER CHARGES',     selectedPayroll.amesco      || '—'],
                    ['PAG-IBIG LOAN',            selectedPayroll.pagibigLoan || '—'],
                  ];

                  return (
                    <Box sx={{ border: '1px solid #999', fontSize: '0.78rem', lineHeight: 1.5, mb: 2 }}>
                      {/* Company Header */}
                      <Box sx={{ textAlign: 'center', fontWeight: 700, py: 1, px: 2, borderBottom: '1px solid #999', fontSize: '0.88rem', letterSpacing: 0.5 }}>
                        {payslipHeading(selectedPayroll.outlet).title}
                      </Box>

                      {/* Department */}
                      <Box sx={rowSx}>
                        <Box sx={labelSx}>Department:</Box>
                        <Box sx={valSx}>{payslipHeading(selectedPayroll.outlet).department}</Box>
                      </Box>
                      {/* Pay Period */}
                      <Box sx={rowSx}>
                        <Box sx={labelSx}>Pay period:</Box>
                        <Box sx={valSx}>{selectedPayroll.payPeriodLabel}</Box>
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
                      <Box sx={rowSx}>
                        <Box sx={labelSx}>Rate:</Box>
                        <Box sx={valSx}>{selectedPayroll.payRate}</Box>
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
                              ? formatDisplayDate(selectedPayroll.payslipDate)
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
        <DialogActions
          disableSpacing
          sx={{
            display: { xs: 'grid', sm: 'flex' },
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridAutoRows: '1fr',
            alignItems: 'stretch',
            flexWrap: 'wrap',
            gap: 1,
            px: { xs: 1.5, sm: 2 },
            py: 2,
            borderTop: `1px solid ${GREEN_UI.border}`,
            bgcolor: '#fbfff9',
            '& > .MuiButton-root': {
              minHeight: 38,
              px: { xs: 1, sm: 1.5 },
              lineHeight: 1.4,
              textAlign: 'center',
            },
          }}
        >
          <input
            ref={payslipUploadRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.doc,.docx"
            style={{ display: 'none' }}
            onChange={handlePayslipFileUpload}
          />
          <Button onClick={() => { setViewDialog(false); setEditingPayslip(false); }}>Close</Button>
          {canManagePayroll && selectedPayroll && (
            <Button
              variant="outlined"
              startIcon={uploadingPayslip ? <CircularProgress size={16} /> : <CloudUpload />}
              disabled={uploadingPayslip}
              onClick={() => payslipUploadRef.current?.click()}
            >
              {uploadingPayslip ? 'Uploading...' : 'Upload Payslip'}
            </Button>
          )}
          {selectedPayroll?.uploadedPayslipPath && (
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={() => openUploadedPayslip(selectedPayroll)}
            >
              Open Uploaded File
            </Button>
          )}
          {!editingPayslip ? (
            selectedPayroll?.status !== 'Released' && (
            <Button variant="outlined" color="primary" disabled={loadingRates}
              onClick={() => {
                if (selectedPayroll) {
                  const today = new Date().toISOString().split('T')[0];
                  setPayslipEditForm({
                    employee:            selectedPayroll.employee         ?? '',
                    position:            selectedPayroll.position         ?? '',
                    payslipDate:         selectedPayroll.payslipDate      ?? today,
                    regularHours:        selectedPayroll.regularHours     ?? '',
                    basicPayAmt:         selectedPayroll.basicPayAmt      ?? '',
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
                    lateDeductionAmt:    selectedPayroll.lateDeductionAmt ?? '',
                    undertimeHours:      selectedPayroll.undertimeHours   ?? '',
                    undertimeDeductionAmt: selectedPayroll.undertimeDeductionAmt ?? '',
                    sssAmt:              selectedPayroll.sssAmt           ?? '',
                    phicAmt:             selectedPayroll.phicAmt          ?? '',
                    hdmfAmt:             selectedPayroll.hdmfAmt          ?? '',
                    cashAdvance:         selectedPayroll.cashAdvance      ?? '',
                    atd:                 selectedPayroll.atd              ?? '',
                    otherCharges:        selectedPayroll.otherCharges     ?? '',
                    breakages:           selectedPayroll.breakages        ?? '',
                    amesco:              selectedPayroll.amesco           ?? '',
                    pagibigLoan:         selectedPayroll.pagibigLoan      ?? '',
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
                const hasInvalidQuantity = (Object.keys(payslipQuantityAmounts) as PayslipQuantityField[]).some(field => {
                  const quantity = Number(payslipEditForm[field]);
                  return !Number.isFinite(quantity) || quantity < 0;
                });
                if (hasInvalidQuantity) {
                  setSnackbar({ open: true, message: 'Enter a valid, nonnegative number for each quantity.', severity: 'error' });
                  return;
                }
                const hasInvalidAmount = payslipAmountFields.some(field => {
                  const value = amountInputValue(payslipEditForm[field]);
                  return value !== amountInputValue(selectedPayroll[field] ?? '') && !Number.isFinite(Number(value));
                });
                if (hasInvalidAmount) {
                  setSnackbar({ open: true, message: 'Enter a valid number for each amount.', severity: 'error' });
                  return;
                }
                setSaving(true);
                try {
                  const { gross, deductions, net } = payslipTotals;
                  const regularHours = Number(payslipEditForm.regularHours);
                  const overtimeHours = Number(payslipEditForm.overtime);
                  const timeChanged = regularHours !== Number(selectedPayroll.regularHours)
                    || overtimeHours !== Number(selectedPayroll.overtime);
                  const totalHours = timeChanged && !selectedPayroll.attendanceSummaryId
                    ? roundMoney(regularHours + overtimeHours) : toNumber(selectedPayroll.totalHours);

                  const details = {
                    ...selectedPayroll.payslipDetails,
                    basicPayHours: selectedPayroll.basicPayHours
                      ? (toNumber(selectedPayroll.basicPayHours) + regularHours - toNumber(selectedPayroll.regularHours)).toFixed(2)
                      : undefined,
                    nsdHours: payslipEditForm.nsdHours,
                    nsdAmt: payslipEditForm.nsdAmt,
                    regularHolidayDays: payslipEditForm.regularHolidayDays,
                    regularUnworkedDays: selectedPayroll.payslipDetails?.generatedPremiums
                      ? Math.min(Number(payslipEditForm.regularHolidayDays), Number(selectedPayroll.payslipDetails.regularUnworkedDays) || 0)
                      : undefined,
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
                    uploadedPayslipName: selectedPayroll.uploadedPayslipName ?? '',
                    uploadedPayslipPath: selectedPayroll.uploadedPayslipPath ?? '',
                  };

                  const { error: updateError } = await supabase
                    .from('payroll_items')
                    .update({
                      employee_name: payslipEditForm.employee,
                      position: payslipEditForm.position,
                      total_work_hours: totalHours,
                      regular_hours: regularHours,
                      overtime_hours: overtimeHours,
                      total_late_minutes: Math.round(Number(payslipEditForm.tardinessMin)),
                      total_undertime_minutes: Math.round(Number(payslipEditForm.undertimeHours) * 60),
                      basic_pay: roundMoney(toNumber(payslipEditForm.basicPayAmt)),
                      overtime_pay: roundMoney(toNumber(payslipEditForm.otAmt)),
                      late_deduction: roundMoney(toNumber(payslipEditForm.lateDeductionAmt)),
                      undertime_deduction: roundMoney(toNumber(payslipEditForm.undertimeDeductionAmt)),
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
                    totalHours: String(totalHours),
                    basicPayHours: details.basicPayHours,
                    payslipDetails: details,
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
