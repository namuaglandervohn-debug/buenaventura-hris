import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, CircularProgress,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, Tooltip,
} from '@mui/material';
import {
  AccountBalanceWallet,
  BadgeOutlined,
  CalendarMonth,
  CheckCircle,
  Download,
  EventNote,
  Paid,
  Payments,
  Print,
  ReceiptLong,
  Sync,
  Visibility,
  WorkOutline,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import ActionSnackbar from '../ActionSnackbar';

interface Payslip {
  id: string;
  displayId?: string;
  payrollId?: string;
  employeeId?: string;
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
  status: string;
  releasedAt?: string;
  payslipDate?: string;
  // Extended receipt fields
  basicPayAmt?: string;
  otAmt?: string;
  nsdHours?: string;
  nsdAmt?: string;
  regularHolidayDays?: string;
  regularHolidayAmt?: string;
  specialHolidayDays?: string;
  specialHolidayAmt?: string;
  silDays?: string;
  silAmt?: string;
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
  uploadedPayslipName?: string;
  uploadedPayslipPath?: string;
}

interface EmployeeContext {
  employeeId: string;
  name: string;
  position?: string;
}

const money = (value: number | string | null | undefined) => {
  const n = typeof value === 'number'
    ? value
    : parseFloat(String(value ?? '').replace(/[₱,]/g, '')) || 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const monthFromDate = (dateValue?: string | null) =>
  dateValue ? dateValue.slice(0, 7) : new Date().toISOString().slice(0, 7);

const parsePayslipDetails = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, string>;
};

const dbStatusToUi = (status?: string | null) => {
  switch ((status ?? '').toLowerCase()) {
    case 'endorsed':
    case 'exported':
      return 'Released';
    case 'approved':
      return 'Processed';
    case 'reviewed':
      return 'For Review';
    case 'draft':
    default:
      return 'Draft';
  }
};

const buildEmployeePayrollDisplayIds = (items: any[], summariesById: Map<string, any>) => {
  const sortedItems = [...items].sort((a, b) => {
    const summaryA = summariesById.get(a.payroll_id);
    const summaryB = summariesById.get(b.payroll_id);
    const dateA = String(summaryA?.period_start ?? a.created_at ?? '');
    const dateB = String(summaryB?.period_start ?? b.created_at ?? '');
    return dateA.localeCompare(dateB) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });

  const yearCounters: Record<string, number> = {};
  const displayIds = new Map<string, string>();

  sortedItems.forEach((item) => {
    const summary = summariesById.get(item.payroll_id);
    const sourceDate = String(summary?.period_start ?? item.created_at ?? new Date().toISOString());
    const year = sourceDate.slice(0, 4) || new Date().getFullYear().toString();

    yearCounters[year] = (yearCounters[year] ?? 0) + 1;
    displayIds.set(item.payroll_item_id, `PAYROLL-${year}-${String(yearCounters[year]).padStart(4, '0')}`);
  });

  return displayIds;
};

const mapItemToPayslip = (item: any, summariesById: Map<string, any>, displayId?: string): Payslip => {
  const summary = summariesById.get(item.payroll_id);
  const details = parsePayslipDetails(item.payslip_details);

  return {
    id: item.payroll_item_id,
    displayId: displayId ?? item.payroll_item_id,
    payrollId: item.payroll_id,
    employeeId: item.employee_id,
    employee: item.employee_name || item.employee_id || 'Unnamed Employee',
    position: item.position || '',
    outlet: item.outlet || '',
    period: monthFromDate(summary?.period_start),
    cutoffLabel: summary?.cutoff_label ?? '',
    totalHours: String(item.total_work_hours ?? item.regular_hours ?? '0'),
    overtime: String(item.overtime_hours ?? '0'),
    deductions: money(item.total_deductions),
    grossPay: money(item.gross_pay),
    netPay: money(item.net_pay),
    status: dbStatusToUi(summary?.status),
    releasedAt: summary?.endorsed_at ?? summary?.reviewed_at ?? undefined,
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
    uploadedPayslipName: item.uploaded_file_name ?? details.uploadedPayslipName ?? '',
    uploadedPayslipPath: item.uploaded_file_path ?? details.uploadedPayslipPath ?? '',
  };
};

const isUuid = (value: unknown) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? '').trim());

const fullNameFromParts = (record: any) =>
  [record?.first_name, record?.middle_name, record?.last_name, record?.suffix]
    .filter(Boolean)
    .join(' ')
    .trim();


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
  background: GREEN_UI.cardBgSoft,
  boxShadow: GREEN_UI.shadowSoft,
};

const pillButtonSx = {
  borderRadius: '12px',
  textTransform: 'none',
  fontWeight: 700,
  px: 2,
};

const releasedChipSx = {
  bgcolor: '#e5f8e9',
  color: '#217a43',
  borderColor: '#a9dfb6',
  fontWeight: 600,
  '& .MuiChip-label': { px: 1.25 },
};

export default function EmployeePayslips() {
  const { user } = useAuth();
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [viewDialog, setViewDialog] = useState(false);
  const [employeeContext, setEmployeeContext] = useState<EmployeeContext | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  const resolveEmployeeContext = useCallback(async (): Promise<EmployeeContext | null> => {
    const authUser = user as any;
    if (!authUser) return null;

    const directEmployeeId = String(authUser.employee_id ?? '').trim();

    const loadEmployee = async (employeeId: string, fallbackName = ''): Promise<EmployeeContext | null> => {
      const cleanEmployeeId = String(employeeId ?? '').trim();
      if (!cleanEmployeeId) return null;

      const { data: employee, error } = await supabase
        .from('employees')
        .select('employee_id, first_name, middle_name, last_name, suffix, position, email')
        .eq('employee_id', cleanEmployeeId)
        .maybeSingle();

      if (error) {
        console.warn('Could not verify employee record:', error.message);
        return {
          employeeId: cleanEmployeeId,
          name: fallbackName || String(authUser.name ?? authUser.full_name ?? authUser.email ?? cleanEmployeeId),
        };
      }

      if (!employee) {
        return {
          employeeId: cleanEmployeeId,
          name: fallbackName || String(authUser.name ?? authUser.full_name ?? authUser.email ?? cleanEmployeeId),
        };
      }

      return {
        employeeId: String(employee.employee_id),
        name: fullNameFromParts(employee) || fallbackName || String(authUser.name ?? authUser.full_name ?? cleanEmployeeId),
        position: String(employee.position ?? ''),
      };
    };

    if (directEmployeeId) {
      const employee = await loadEmployee(directEmployeeId);
      if (employee) return employee;
    }

    const tryAccountLookup = async (column: string, value: unknown) => {
      const cleanValue = String(value ?? '').trim();
      if (!cleanValue) return null;
      if (column === 'id' && !isUuid(cleanValue)) return null;

      const { data, error } = await supabase
        .from('user_accounts')
        .select('id, user_id, employee_id, full_name, first_name, middle_name, last_name, suffix, email')
        .eq(column, cleanValue)
        .maybeSingle();

      if (error) {
        console.warn(`Could not verify user_accounts.${column}:`, error.message);
        return null;
      }

      if (!data?.employee_id) return null;

      return loadEmployee(
        String(data.employee_id),
        data.full_name || fullNameFromParts(data) || String(data.email ?? '')
      );
    };

    const fromAccount =
      await tryAccountLookup('user_id', authUser.user_id) ||
      await tryAccountLookup('id', authUser.id) ||
      await tryAccountLookup('email', authUser.email);

    if (fromAccount) return fromAccount;

    const email = String(authUser.email ?? '').trim();
    if (email) {
      const { data: employeeByEmail, error } = await supabase
        .from('employees')
        .select('employee_id, first_name, middle_name, last_name, suffix, position, email')
        .eq('email', email)
        .maybeSingle();

      if (!error && employeeByEmail?.employee_id) {
        return {
          employeeId: String(employeeByEmail.employee_id),
          name: fullNameFromParts(employeeByEmail) || String(authUser.name ?? authUser.full_name ?? email),
          position: String(employeeByEmail.position ?? ''),
        };
      }
    }

    return null;
  }, [user]);

  const fetchPayslips = useCallback(async () => {
    setLoading(true);
    try {
      const currentEmployee = await resolveEmployeeContext();
      setEmployeeContext(currentEmployee);

      if (!currentEmployee?.employeeId) {
        setPayslips([]);
        setSnackbar({
          open: true,
          message: 'No employee ID is linked to this account. Ask HR/Admin to link your user account to your employee record.',
          severity: 'error',
        });
        return;
      }

      const { data: summaries, error: summariesError } = await supabase
        .from('payroll_summaries')
        .select('payroll_id, period_start, period_end, cutoff_label, status, endorsed_at, reviewed_at, created_at')
        .in('status', ['Endorsed', 'Exported'])
        .order('period_start', { ascending: false });

      if (summariesError) throw summariesError;

      const releasedSummaries = summaries ?? [];
      const releasedPayrollIds = releasedSummaries
        .map((summary: any) => summary.payroll_id)
        .filter(Boolean);

      if (releasedPayrollIds.length === 0) {
        setPayslips([]);
        return;
      }

      const summaryMap = new Map<string, any>(releasedSummaries.map((summary: any) => [summary.payroll_id, summary]));

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
          uploaded_file_path,
          uploaded_file_name,
          uploaded_file_mime_type,
          uploaded_at,
          created_at,
          updated_at
        `)
        .eq('employee_id', currentEmployee.employeeId)
        .in('payroll_id', releasedPayrollIds)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;

      const displayIds = buildEmployeePayrollDisplayIds(items ?? [], summaryMap);
      const mapped = (items ?? [])
        .map((item: any) => mapItemToPayslip(item, summaryMap, displayIds.get(item.payroll_item_id)))
        .filter((p: Payslip) => p.status === 'Released')
        .sort((a: Payslip, b: Payslip) => b.period.localeCompare(a.period));

      setPayslips(mapped);
    } catch (e: any) {
      console.error(e);
      setPayslips([]);
      setSnackbar({ open: true, message: `Could not load payslips: ${e.message ?? e}`, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [resolveEmployeeContext]);

  useEffect(() => {
    fetchPayslips();

    const channel = supabase
      .channel('employee-payslips-live-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_summaries' }, () => fetchPayslips())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_items' }, () => fetchPayslips())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPayslips]);

  const handlePrint = (slip: Payslip) => {
    const grossAmt = parseAmt(slip.grossPay);
    const dedAmt   = parseAmt(slip.deductions);
    const netAmt   = parseAmt(slip.netPay);
    const sss      = parseFloat((grossAmt * 0.045).toFixed(2));
    const phic     = parseFloat((grossAmt * 0.02).toFixed(2));
    const hdmf     = 100;
    const totalDed = dedAmt > 0 ? dedAmt : sss + phic + hdmf;

    const win = window.open('', '_blank', 'width=720,height=960');
    if (!win) return;
    win.document.write(`
      <html><head><title>Payslip — ${slip.employee}</title>
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
        <tr><td style="width:40%"><b>Department:</b></td><td colspan="2">${slip.position || '—'}</td></tr>
        <tr><td><b>Pay Period:</b></td><td colspan="2">${slip.period}</td></tr>
        <tr class="highlight"><td><b>Employee ID:</b></td><td colspan="2"><b>${slip.employeeId || '—'}</b></td></tr>
        <tr class="highlight"><td><b>Employee Name:</b></td><td colspan="2"><b>${slip.employee.toUpperCase()}</b></td></tr>
        <tr><td><b>Position:</b></td><td colspan="2">${slip.position || '—'}</td></tr>
        <tr class="sec-hdr"><td>Earnings:</td><td class="center" style="width:24%">Days/Hours/Mins.</td><td class="right" style="width:22%">Amount</td></tr>
        <tr><td>Basic Pay</td><td class="right">${slip.totalHours || '—'}</td><td class="right">${slip.basicPayAmt || fmt(grossAmt)}</td></tr>
        <tr><td>Reg.OT</td><td class="right">${slip.overtime && slip.overtime !== '0' ? slip.overtime : '—'}</td><td class="right">${slip.otAmt || '—'}</td></tr>
        <tr><td>NSD</td><td class="right">${slip.nsdHours || '—'}</td><td class="right">${slip.nsdAmt || '—'}</td></tr>
        <tr><td>Regular Holiday</td><td class="right">${slip.regularHolidayDays || '—'}</td><td class="right">${slip.regularHolidayAmt || '—'}</td></tr>
        <tr><td>Special Holiday</td><td class="right">${slip.specialHolidayDays || '—'}</td><td class="right">${slip.specialHolidayAmt || '—'}</td></tr>
        <tr><td>SIL</td><td class="right">${slip.silDays || '—'}</td><td class="right">${slip.silAmt || '—'}</td></tr>
        <tr><td>Allowance</td><td class="right">—</td><td class="right">${slip.allowanceAmt || '—'}</td></tr>
        <tr><td>RETRO/ADJUSTMENT</td><td class="right">—</td><td class="right">${slip.retroAmt || '—'}</td></tr>
        <tr><td>Tardiness (Mins.)</td><td class="right">${slip.tardinessMin || '—'}</td><td class="right">—</td></tr>
        <tr><td>Undertime (Hours)</td><td class="right">${slip.undertimeHours || '—'}</td><td class="right">—</td></tr>
        <tr class="gross-row"><td colspan="2" class="center">GROSS PAY</td><td class="right">${fmt(grossAmt)}</td></tr>
        <tr class="sec-hdr"><td colspan="3">DEDUCTIONS:</td></tr>
        <tr><td colspan="2">SSS Premium</td><td class="right">${slip.sssAmt || (grossAmt > 0 ? fmt(sss) : '—')}</td></tr>
        <tr><td colspan="2">PHIC Premium</td><td class="right">${slip.phicAmt || (grossAmt > 0 ? fmt(phic) : '—')}</td></tr>
        <tr><td colspan="2">HDMF Premium</td><td class="right">${slip.hdmfAmt || (grossAmt > 0 ? fmt(hdmf) : '—')}</td></tr>
        <tr><td colspan="2">CASH ADVANCE</td><td class="right">${slip.cashAdvance || '—'}</td></tr>
        <tr><td colspan="2">ATD</td><td class="right">${slip.atd || '—'}</td></tr>
        <tr><td colspan="2">Other Charges</td><td class="right">${slip.otherCharges || '—'}</td></tr>
        <tr><td colspan="2">BREAKAGES Charges (last)</td><td class="right">${slip.breakages || '—'}</td></tr>
        <tr><td colspan="2">AMESCO/OTHER CHARGES</td><td class="right">${slip.amesco || '—'}</td></tr>
        <tr><td colspan="2">PAG-IBIG LOAN</td><td class="right">${slip.pagibigLoan || '—'}</td></tr>
        <tr class="sec-hdr"><td colspan="2" class="right">TOTAL DEDUCTIONS:</td><td class="right">${fmt(totalDed)}</td></tr>
        <tr class="net-row"><td colspan="2" class="center">NET PAY</td><td class="right">${fmt(netAmt)}</td></tr>
      </table>
      <div class="ack">
        I acknowledge to have received the amount of <b>${fmt(netAmt)}</b> and have no further claim for services rendered.
      </div>
      <div class="sig">
        <div class="sig-line">Date: ${slip.payslipDate ? new Date(slip.payslipDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) : '___________'}</div>
        <div style="width:42%; text-align:center;">
          <div style="padding-bottom:4px; border-bottom:1px solid #333; font-size:10px;">${slip.employee.toUpperCase()}</div>
          <div style="font-size:9px; margin-top:3px;">${slip.position || '—'}</div>
        </div>
      </div>
      <div class="footer">Generated: ${new Date().toLocaleString()} &nbsp;·&nbsp; Payroll ID: ${slip.displayId ?? slip.id} &nbsp;·&nbsp; Electronically generated payslip.</div>
      </body></html>`);
    win.document.close();
    win.print();
  };


  const openUploadedPayslip = async (slip: Payslip) => {
    if (!slip.uploadedPayslipPath) return;

    const { data, error } = await supabase.storage
      .from('payslips')
      .createSignedUrl(slip.uploadedPayslipPath, 60 * 5);

    if (error || !data?.signedUrl) {
      setSnackbar({ open: true, message: `Could not open uploaded payslip: ${error?.message ?? 'Missing file URL'}`, severity: 'error' });
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const parseAmt = (v: string) => parseFloat((v ?? '').replace(/[₱,]/g, '')) || 0;
  const fmt = (v: number) => v > 0
    ? `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—';

  const latestPayslip = payslips[0];
  const totalNetPay = payslips.reduce((sum, slip) => sum + parseAmt(slip.netPay), 0);

  const payslipStats = [
    {
      label: 'Released Payslips',
      value: payslips.length,
      caption: 'Payroll records available for viewing and printing.',
      icon: <ReceiptLong fontSize="small" />,
    },
    {
      label: 'Latest Period',
      value: latestPayslip?.period ?? '—',
      caption: latestPayslip?.cutoffLabel || 'Most recent released payroll period.',
      icon: <CalendarMonth fontSize="small" />,
    },
    {
      label: 'Latest Net Pay',
      value: latestPayslip?.netPay ?? '₱0.00',
      caption: 'Latest released amount after deductions.',
      icon: <Payments fontSize="small" />,
    },
    {
      label: 'Total Net Released',
      value: money(totalNetPay),
      caption: employeeContext?.employeeId ? `Employee ID: ${employeeContext.employeeId}` : 'Linked employee account summary.',
      icon: <AccountBalanceWallet fontSize="small" />,
    },
  ];

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
              icon={<ReceiptLong sx={{ fontSize: '1rem !important' }} />}
              label="Employee Payroll Workspace"
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
              My Payslips
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              View and print your released electronic payslips in a clean employee payroll record.
              {employeeContext?.employeeId ? ` Linked employee ID: ${employeeContext.employeeId}.` : ''}
            </Typography>
          </Box>

          <Tooltip title="Refresh payslips">
            <span>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                onClick={fetchPayslips}
                disabled={loading}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.green,
                  boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                  '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
                }}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </Button>
            </span>
          </Tooltip>
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1.5,
          mb: 2.5,
        }}
      >
        {payslipStats.map(stat => (
          <Paper
            key={stat.label}
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
                <Typography
                  variant="h4"
                  fontWeight={700}
                  sx={{ color: GREEN_UI.text, mt: 0.5, letterSpacing: '-0.04em', fontSize: { xs: '1.65rem', md: '1.95rem' } }}
                >
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
        ))}
      </Box>

      {!loading && payslips.length === 0 && (
        <Alert
          severity="info"
          icon={<ReceiptLong />}
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
        >
          No released payslips found for this employee account yet. Payslips will appear here after Accounting/Finance releases the payroll.
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, overflow: 'hidden' }}>
        <Box
          sx={{
            p: { xs: 2, sm: 2.25 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexWrap: 'wrap',
            gap: 1.5,
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
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
              <Paid />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, letterSpacing: '-0.02em' }}>
                Released Payslip Records
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Open a payslip preview or print a released payroll receipt.
              </Typography>
            </Box>
          </Box>
          <Chip
            icon={<CheckCircle sx={{ fontSize: '1rem !important' }} />}
            label={`${payslips.length} Released`}
            variant="outlined"
            sx={{ ...releasedChipSx, '& .MuiChip-icon': { color: '#217a43' } }}
          />
        </Box>

        <TableContainer sx={{ overflowX: 'auto' }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 7, gap: 2 }}>
              <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
              <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading payslips…</Typography>
            </Box>
          ) : (
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow
                  sx={{
                    '& th': {
                      borderBottom: `1px solid ${GREEN_UI.border}`,
                      color: GREEN_UI.muted,
                      fontWeight: 700,
                      fontSize: '0.76rem',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      bgcolor: 'rgba(245, 252, 241, 0.72)',
                    },
                  }}
                >
                  <TableCell>Payroll ID</TableCell>
                  <TableCell>Period</TableCell>
                  <TableCell>Employee ID</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Gross Pay</TableCell>
                  <TableCell>Deductions</TableCell>
                  <TableCell>Net Pay</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payslips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 7, color: GREEN_UI.muted }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <ReceiptLong sx={{ fontSize: 42, color: GREEN_UI.greenDark, opacity: 0.7 }} />
                        <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>No released payslips found.</Typography>
                        <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
                          Released payroll records will show here once available.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : payslips.map(p => (
                  <TableRow
                    key={p.id}
                    hover
                    sx={{
                      '& td': { borderBottom: `1px solid ${GREEN_UI.border}`, py: 1.55 },
                      '&:hover': { bgcolor: 'rgba(230, 248, 233, 0.35)' },
                    }}
                  >
                    <TableCell>
                      <Chip
                        icon={<ReceiptLong sx={{ fontSize: '0.95rem !important' }} />}
                        label={p.displayId ?? p.id}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 600,
                          bgcolor: '#f8fcf5',
                          borderColor: GREEN_UI.border,
                          color: GREEN_UI.greenDark,
                          '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <EventNote sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>{p.period}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <BadgeOutlined sx={{ fontSize: 18, color: GREEN_UI.muted }} />
                        <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>{p.employeeId || '—'}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <WorkOutline sx={{ fontSize: 18, color: GREEN_UI.muted }} />
                        <Typography variant="body2" sx={{ color: GREEN_UI.text }}>{p.position || '—'}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: GREEN_UI.text }}>{p.grossPay}</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#9c2f2f' }}>{p.deductions}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: GREEN_UI.greenDark }}>{p.netPay}</TableCell>
                    <TableCell>
                      <Chip
                        icon={<CheckCircle sx={{ fontSize: '0.95rem !important' }} />}
                        label={p.status}
                        size="small"
                        variant="outlined"
                        sx={{ ...releasedChipSx, '& .MuiChip-icon': { color: '#217a43' } }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<Visibility />}
                          onClick={() => { setSelected(p); setViewDialog(true); }}
                          sx={{
                            ...pillButtonSx,
                            borderColor: GREEN_UI.borderStrong,
                            color: GREEN_UI.greenDark,
                            bgcolor: '#fbfef9',
                            '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                          }}
                        >
                          View
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<Print />}
                          onClick={() => handlePrint(p)}
                          sx={{
                            ...pillButtonSx,
                            bgcolor: GREEN_UI.green,
                            boxShadow: 'none',
                            '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: 'none' },
                          }}
                        >
                          Print
                        </Button>
                        {p.uploadedPayslipPath && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Download />}
                            onClick={() => openUploadedPayslip(p)}
                            sx={{
                              ...pillButtonSx,
                              borderColor: GREEN_UI.borderStrong,
                              color: GREEN_UI.greenDark,
                              bgcolor: '#ffffff',
                              '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                            }}
                          >
                            File
                          </Button>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Paper>

      {/* Payslip Detail Dialog — receipt format */}
      <Dialog
        open={viewDialog}
        onClose={() => setViewDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '26px',
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: '0 30px 80px rgba(43, 91, 55, 0.18)',
            overflow: 'hidden',
          },
        }}
      >
        <DialogTitle
          sx={{
            p: 2.25,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(239,250,235,0.96))',
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: '16px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: GREEN_UI.greenSoft,
                  color: GREEN_UI.greenDark,
                }}
              >
                <ReceiptLong />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, letterSpacing: '-0.02em' }}>
                  Payslip Preview
                </Typography>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                  Receipt-format employee payroll record
                </Typography>
              </Box>
            </Box>
            {selected && (
              <Chip
                label={selected.displayId ?? selected.id}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 600, borderColor: GREEN_UI.border, color: GREEN_UI.greenDark }}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 1.5, sm: 2.25 }, bgcolor: '#fbfef9' }}>
          {selected && (() => {
            const grossAmt = parseAmt(selected.grossPay);
            const dedAmt   = parseAmt(selected.deductions);
            const netAmt   = parseAmt(selected.netPay);
            const sss      = parseFloat((grossAmt * 0.045).toFixed(2));
            const phic     = parseFloat((grossAmt * 0.02).toFixed(2));
            const hdmf     = 100;
            const totalDed = dedAmt > 0 ? dedAmt : sss + phic + hdmf;

            const labelSx = { fontWeight: 600, color: GREEN_UI.muted, fontSize: '0.76rem' };
            const valueSx = { fontWeight: 600, color: GREEN_UI.text, fontSize: '0.78rem' };

            const earningsRows: [string, string, string][] = [
              ['Basic Pay',          selected.totalHours || '—',                                           selected.basicPayAmt || fmt(grossAmt)],
              ['Reg.OT',             selected.overtime && selected.overtime !== '0' ? selected.overtime : '—', selected.otAmt || '—'],
              ['NSD',                selected.nsdHours  || '—',                                            selected.nsdAmt  || '—'],
              ['Regular Holiday',    selected.regularHolidayDays || '—',                                   selected.regularHolidayAmt || '—'],
              ['Special Holiday',    selected.specialHolidayDays || '—',                                   selected.specialHolidayAmt || '—'],
              ['SIL',                selected.silDays   || '—',                                            selected.silAmt  || '—'],
              ['Allowance',          '—',                                                                   selected.allowanceAmt || '—'],
              ['RETRO/ADJUSTMENT',   '—',                                                                   selected.retroAmt || '—'],
              ['Tardiness (Mins.)',  selected.tardinessMin   || '—',                                       '—'],
              ['Undertime (Hours)',  selected.undertimeHours || '—',                                       '—'],
            ];

            const deductionRows: [string, string][] = [
              ['SSS Premium',              selected.sssAmt      || (grossAmt > 0 ? fmt(sss)  : '—')],
              ['PHIC Premium',             selected.phicAmt     || (grossAmt > 0 ? fmt(phic) : '—')],
              ['HDMF Premium',             selected.hdmfAmt     || (grossAmt > 0 ? fmt(hdmf) : '—')],
              ['CASH ADVANCE',             selected.cashAdvance || '—'],
              ['ATD',                      selected.atd         || '—'],
              ['Other Charges',            selected.otherCharges || '—'],
              ['BREAKAGES Charges (last)', selected.breakages   || '—'],
              ['AMESCO/OTHER CHARGES',     selected.amesco      || '—'],
              ['PAG-IBIG LOAN',            selected.pagibigLoan || '—'],
            ];

            return (
              <Paper elevation={0} sx={{ ...innerCardSx, overflow: 'hidden', bgcolor: '#ffffff' }}>
                <Box sx={{ textAlign: 'center', py: 1.5, px: 2, borderBottom: `1px solid ${GREEN_UI.border}` }}>
                  <Typography fontWeight={700} sx={{ color: GREEN_UI.greenDark, letterSpacing: '0.08em', fontSize: '0.9rem' }}>
                    BUENAVENTURA ESTATE
                  </Typography>
                  <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                    ELECTRONIC PAYSLIP
                  </Typography>
                </Box>

                <Box sx={{ p: 1.5, display: 'grid', gap: 1 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                    <Paper elevation={0} sx={{ p: 1.25, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}`, bgcolor: GREEN_UI.cardBgSoft }}>
                      <Typography sx={labelSx}>Department</Typography>
                      <Typography sx={valueSx}>{selected.position || '—'}</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 1.25, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}`, bgcolor: GREEN_UI.cardBgSoft }}>
                      <Typography sx={labelSx}>Pay Period</Typography>
                      <Typography sx={valueSx}>{selected.period}</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 1.25, borderRadius: '16px', border: `1px solid ${GREEN_UI.borderStrong}`, bgcolor: GREEN_UI.greenSoft }}>
                      <Typography sx={labelSx}>Employee ID</Typography>
                      <Typography sx={valueSx}>{selected.employeeId || '—'}</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 1.25, borderRadius: '16px', border: `1px solid ${GREEN_UI.borderStrong}`, bgcolor: GREEN_UI.greenSoft }}>
                      <Typography sx={labelSx}>Employee Name</Typography>
                      <Typography sx={valueSx}>{selected.employee.toUpperCase()}</Typography>
                    </Paper>
                    <Paper elevation={0} sx={{ p: 1.25, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfef9', gridColumn: { xs: 'auto', sm: '1 / -1' } }}>
                      <Typography sx={labelSx}>Position</Typography>
                      <Typography sx={valueSx}>{selected.position || '—'}</Typography>
                    </Paper>
                  </Box>
                </Box>

                <Divider sx={{ borderColor: GREEN_UI.border }} />

                <Box sx={{ px: 1.5, py: 1.25 }}>
                  <Typography fontWeight={700} sx={{ color: GREEN_UI.text, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Paid sx={{ fontSize: 18, color: GREEN_UI.greenDark }} /> Earnings
                  </Typography>
                  <Box sx={{ border: `1px solid ${GREEN_UI.border}`, borderRadius: '16px', overflow: 'hidden' }}>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', bgcolor: GREEN_UI.cardBgSoft, borderBottom: `1px solid ${GREEN_UI.border}` }}>
                      <Typography sx={{ p: 1, fontSize: '0.73rem', fontWeight: 700, color: GREEN_UI.muted }}>Item</Typography>
                      <Typography sx={{ p: 1, fontSize: '0.73rem', fontWeight: 700, color: GREEN_UI.muted, textAlign: 'right' }}>Days/Hours/Mins.</Typography>
                      <Typography sx={{ p: 1, fontSize: '0.73rem', fontWeight: 700, color: GREEN_UI.muted, textAlign: 'right' }}>Amount</Typography>
                    </Box>
                    {earningsRows.map(([label, days, amount]) => (
                      <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', borderBottom: `1px solid ${GREEN_UI.border}` }}>
                        <Typography sx={{ p: 1, fontSize: '0.77rem', color: GREEN_UI.text }}>{label}</Typography>
                        <Typography sx={{ p: 1, fontSize: '0.77rem', color: GREEN_UI.text, textAlign: 'right' }}>{days}</Typography>
                        <Typography sx={{ p: 1, fontSize: '0.77rem', color: GREEN_UI.text, textAlign: 'right', fontWeight: 600 }}>{amount}</Typography>
                      </Box>
                    ))}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px', bgcolor: '#fff9d7' }}>
                      <Typography sx={{ p: 1, fontSize: '0.78rem', fontWeight: 700, color: GREEN_UI.text, textAlign: 'center' }}>GROSS PAY</Typography>
                      <Typography sx={{ p: 1, fontSize: '0.78rem', fontWeight: 700, color: GREEN_UI.text, textAlign: 'right' }}>{fmt(grossAmt)}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ px: 1.5, py: 1.25 }}>
                  <Typography fontWeight={700} sx={{ color: GREEN_UI.text, mb: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Payments sx={{ fontSize: 18, color: '#9c2f2f' }} /> Deductions
                  </Typography>
                  <Box sx={{ border: `1px solid ${GREEN_UI.border}`, borderRadius: '16px', overflow: 'hidden' }}>
                    {deductionRows.map(([label, amount]) => (
                      <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '1fr 130px', borderBottom: `1px solid ${GREEN_UI.border}` }}>
                        <Typography sx={{ p: 1, fontSize: '0.77rem', color: GREEN_UI.text }}>{label}</Typography>
                        <Typography sx={{ p: 1, fontSize: '0.77rem', color: GREEN_UI.text, textAlign: 'right', fontWeight: 600 }}>{amount}</Typography>
                      </Box>
                    ))}
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 130px', bgcolor: GREEN_UI.cardBgSoft, borderBottom: `1px solid ${GREEN_UI.border}` }}>
                      <Typography sx={{ p: 1, fontSize: '0.78rem', fontWeight: 700, color: GREEN_UI.text, textAlign: 'right' }}>TOTAL DEDUCTIONS</Typography>
                      <Typography sx={{ p: 1, fontSize: '0.78rem', fontWeight: 700, color: '#9c2f2f', textAlign: 'right' }}>{fmt(totalDed)}</Typography>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 130px', bgcolor: '#fff9d7' }}>
                      <Typography sx={{ p: 1, fontSize: '0.82rem', fontWeight: 700, color: GREEN_UI.greenDark, textAlign: 'center' }}>NET PAY</Typography>
                      <Typography sx={{ p: 1, fontSize: '0.82rem', fontWeight: 700, color: GREEN_UI.greenDark, textAlign: 'right' }}>{fmt(netAmt)}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ p: 1.5, borderTop: `1px solid ${GREEN_UI.border}` }}>
                  <Typography variant="caption" sx={{ color: GREEN_UI.muted, lineHeight: 1.7, display: 'block' }}>
                    I acknowledge to have received the amount of <strong>{fmt(netAmt)}</strong> and have no further claim for services rendered.
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'flex-end', mt: 2, gap: 2, flexWrap: 'wrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: GREEN_UI.muted }}>
                      <EventNote sx={{ fontSize: 17 }} />
                      <Typography variant="caption" fontWeight={600}>
                        Date:{' '}
                        {selected.payslipDate
                          ? new Date(selected.payslipDate + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
                          : '___________'}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 220, textAlign: 'center' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.82rem', pb: '4px', borderBottom: `1px solid ${GREEN_UI.text}`, color: GREEN_UI.text }}>
                        {selected.employee.toUpperCase()}
                      </Typography>
                      <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>{selected.position || '—'}</Typography>
                    </Box>
                  </Box>
                </Box>
              </Paper>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 2.25, py: 1.75, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfef9' }}>
          <Button onClick={() => setViewDialog(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Close
          </Button>
          {selected?.uploadedPayslipPath && (
            <Button
              variant="outlined"
              startIcon={<Download />}
              onClick={() => openUploadedPayslip(selected)}
              sx={{
                ...pillButtonSx,
                borderColor: GREEN_UI.borderStrong,
                color: GREEN_UI.greenDark,
                '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
              }}
            >
              Open Uploaded File
            </Button>
          )}
          {selected && selected.status === 'Released' && (
            <Button
              variant="contained"
              startIcon={<Print />}
              onClick={() => handlePrint(selected!)}
              sx={{
                ...pillButtonSx,
                bgcolor: GREEN_UI.green,
                boxShadow: '0 12px 24px rgba(58, 168, 101, 0.22)',
                '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.24)' },
              }}
            >
              Print Payslip
            </Button>
          )}
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
