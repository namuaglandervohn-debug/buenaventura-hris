import { formatDisplayDate, formatDisplayDateTime, formatDisplayDateRange, parseDisplayDate } from '../../lib/displayDate';
import TextField from '../DateTextField';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Card,
  CardContent,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Divider,
  TablePagination,
  IconButton,
  Tooltip,
} from '../bootstrap';
import {
  Print,
  GridView,
  Analytics as BarChartIcon,
  Sync,
  FileDownload,
  Assessment,
  Dataset,
  CalendarMonth,
  RestartAlt,
  Tune,
  InsertDriveFile,
  PictureAsPdf,
  Download,
} from '../bootstrap/icons';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { fileToDataUrl } from '../../lib/applicationFiles';
import { COMPANY, OUTLETS } from '../../lib/constants';
import cafeLogoUrl from '../../../assets/report-logos/buenaventura-cafe.jpg';
import mariaClaraLogoUrl from '../../../assets/report-logos/maria-clara.jpg';

interface ReportData {
  [key: string]: any[];
}

interface ReportType {
  value: string;
  label: string;
  icon: React.ReactElement;
}

interface GeneratedReport {
  id: string;
  report_title: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  file_name: string;
  storage_path: string;
  record_count: number;
  prepared_by: string;
  created_at: string;
}

const REPORT_TYPES: ReportType[] = [
  { value: 'employees', label: 'Employee Records', icon: <GridView /> },
  { value: 'applications', label: 'Recruitment Report', icon: <GridView /> },
  { value: 'schedules', label: 'Employee Work Schedule Report', icon: <GridView /> },
  { value: 'attendance', label: 'Attendance Report', icon: <GridView /> },
  { value: 'attendanceLogs', label: 'Undertime and Tardiness Report', icon: <GridView /> },
  { value: 'payroll', label: 'Payroll Summary', icon: <GridView /> },
  { value: 'evaluations', label: 'Performance Evaluations', icon: <BarChartIcon /> },
  { value: 'recognition', label: 'Employee Recognition Report', icon: <Assessment /> },
  { value: 'requests', label: 'Leave / OT / Undertime Requests', icon: <GridView /> },
  { value: 'criteria', label: 'Evaluation Criteria & Weights', icon: <BarChartIcon /> },
  { value: 'systemLogs', label: 'System Logs', icon: <GridView /> },
  { value: 'consolidated', label: 'Consolidated HR Summary', icon: <Assessment /> },
];

const COLUMNS: Record<string, string[]> = {
  employees: ['id', 'name', 'position', 'department', 'outlet', 'status', 'contact', 'email', 'dateHired'],
  applications: ['id', 'name', 'position', 'outlet', 'email', 'phone', 'dateApplied', 'status', 'hiringDecision'],
  schedules: ['id', 'employee', 'week', 'position', 'outlet', 'timeIn', 'timeOut', 'finalized', 'status'],
  attendance: [
    'id',
    'employee',
    'position',
    'outlet',
    'period',
    'presentDays',
    'absentDays',
    'incompleteDays',
    'lateMinutes',
    'undertimeMinutes',
    'overtimeMinutes',
    'workHours',
    'status',
  ],
  attendanceLogs: [
    'id',
    'employee',
    'outlet',
    'date',
    'timeIn',
    'timeOut',
    'totalHours',
    'lateMinutes',
    'undertimeMinutes',
    'overtimeMinutes',
    'validationStatus',
    'source',
  ],
  payroll: [
    'id',
    'employee',
    'position',
    'outlet',
    'period',
    'regularHours',
    'overtimeHours',
    'grossPay',
    'deductions',
    'netPay',
    'status',
  ],
  evaluations: ['id', 'employee', 'position', 'outlet', 'period', 'rawScore', 'finalScore', 'rating', 'status'],
  recognition: ['rank', 'employee', 'position', 'outlet', 'period', 'finalScore', 'rating', 'status'],
  requests: ['id', 'employee', 'outlet', 'type', 'leaveType', 'date', 'time', 'reason', 'status', 'reviewerRemarks'],
  criteria: ['id', 'criteriaName', 'category', 'weight', 'maxScore', 'active', 'description'],
  systemLogs: ['id', 'userName', 'userRole', 'action', 'module', 'recordId', 'recordTable', 'description', 'dateTime'],
  consolidated: ['module', 'metric', 'value'],
};

const PERIOD_OPTIONS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'custom', label: 'Custom range' },
] as const;
type PeriodMode = (typeof PERIOD_OPTIONS)[number]['value'];

const toIsoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const getPeriodRange = (period: PeriodMode, today = new Date()) => {
  const year = today.getFullYear();
  const month = today.getMonth();
  if (period === 'annual') return { start: `${year}-01-01`, end: `${year}-12-31` };
  if (period === 'quarterly') {
    const quarterStart = Math.floor(month / 3) * 3;
    return { start: toIsoDate(new Date(year, quarterStart, 1)), end: toIsoDate(new Date(year, quarterStart + 3, 0)) };
  }
  if (period === 'custom') return { start: '', end: '' };
  return { start: toIsoDate(new Date(year, month, 1)), end: toIsoDate(new Date(year, month + 1, 0)) };
};

const REPORT_SUMMARY_MODULES = ['employees', 'applications', 'schedules', 'attendance', 'attendanceLogs', 'payroll', 'evaluations', 'recognition', 'requests'];
const REPORTS_WITHOUT_OUTLET = new Set(['criteria', 'systemLogs']);
const REPORT_OUTLET_LOGOS = new Map([
  ['buenaventura cafe', cafeLogoUrl],
  ['maria clara restaurant', mariaClaraLogoUrl],
  ['maria clara resort', mariaClaraLogoUrl],
]);

const PRINT_HEADER_STYLES = `
  .print-header { display: flex; align-items: center; gap: 16px; background: #1f7a46; color: white; padding: 18px 22px; border-radius: 8px 8px 0 0; print-color-adjust: exact; }
  .print-header p { color: white; margin: 0; font-size: 10px; }
  .print-header-logo { flex: none; object-fit: cover; border-radius: 50%; }
`;

async function makeCircularLogo(blob: Blob) {
  const imageUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the report logo.');
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

async function printReport(html: string, windowFeatures: string) {
  const printWindow = window.open('', '_blank', windowFeatures);
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();
  const logo = printWindow.document.querySelector<HTMLImageElement>('.print-header-logo');
  if (logo) await logo.decode().catch(() => logo.remove());
  if (!printWindow.closed) printWindow.print();
}

const reportDateColumns = new Set(['date', 'dateHired', 'dateApplied', 'createdAt', 'submittedDate', 'periodStart', 'periodEnd']);
const currencyColumns = new Set(['salary', 'grossPay', 'deductions', 'netPay']);
const percentColumns = new Set(['finalScore', 'rawScore', 'weight', 'maxScore']);
const statusColumns = new Set(['status', 'validationStatus', 'finalized', 'active']);


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

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#ffffff',
    '& fieldset': { borderColor: GREEN_UI.border },
    '&:hover fieldset': { borderColor: GREEN_UI.borderStrong },
    '&.Mui-focused fieldset': { borderColor: GREEN_UI.green },
  },
  '& .MuiInputLabel-root.Mui-focused': { color: GREEN_UI.greenDark },
};

const statusChipSx = (value: any) => {
  const tone = getStatusColor(value);
  const palette = {
    success: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    warning: { bg: '#fff7e0', color: '#9b6b00', border: '#f5d786' },
    error: { bg: '#fdeaea', color: '#9c2f2f', border: '#efb8b8' },
    default: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da' },
  } as const;
  const selected = palette[tone] ?? palette.default;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25 },
  };
};

const getFullName = (row: any) =>
  [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

const toDateOnly = (value: any) => {
  if (!value) return '';
  const str = String(value);
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const money = (value: any) => {
  const n = Number(value ?? 0);
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const numericTotal = (rows: any[], key: string) => rows.reduce((sum, row) => sum + (Number(row?.[key]) || 0), 0);
const countMatching = (rows: any[], key: string, expected: string) => rows.filter(row =>
  String(row?.[key] ?? '').toLowerCase().includes(expected.toLowerCase()),
).length;

const summarizeReport = (type: string, rows: any[]) => {
  const count = rows.length;
  let metrics: Array<{ metric: string; value: string }> = [{ metric: 'Records in period', value: count.toLocaleString() }];
  let findings: string[] = [];

  switch (type) {
    case 'employees': {
      const active = rows.filter(row => String(row.status ?? '').trim().toLowerCase() === 'active').length;
      const onLeave = countMatching(rows, 'status', 'leave');
      metrics = [
        { metric: 'Employee records', value: count.toLocaleString() },
        { metric: 'Active employees', value: active.toLocaleString() },
        { metric: 'Employees on leave', value: onLeave.toLocaleString() },
      ];
      findings = [`${active} of ${count} employee records are currently active.`, `${new Set(rows.map(row => row.position).filter(value => value && value !== '—')).size} distinct positions are represented. Current employee records are a live snapshot, so they are not removed by the selected hire-date range.`];
      break;
    }
    case 'applications': {
      const hired = rows.filter(row => {
        const decision = String(row.hiringDecision || row.status).trim().toLowerCase();
        return decision.includes('hired') && !decision.includes('not hired');
      }).length;
      const interview = rows.filter(row => String(row.status).toLowerCase().includes('interview')).length;
      const outletAssigned = rows.filter(row => String(row.outlet ?? '').trim() && row.outlet !== '—').length;
      metrics = [
        { metric: 'Applications received', value: count.toLocaleString() },
        { metric: 'Hired', value: hired.toLocaleString() },
        { metric: 'For interview', value: interview.toLocaleString() },
      ];
      findings = [`${hired} of ${count} applications have a hired decision.`, outletAssigned === 0
        ? 'Applications do not have outlet assignments in the source records; outlet-specific views exclude unassigned applications.'
        : `${outletAssigned} application records have an outlet assignment.`];
      break;
    }
    case 'schedules': {
      const published = rows.filter(row => ['published', 'confirmed'].includes(String(row.status).toLowerCase())).length;
      metrics = [
        { metric: 'Schedule records', value: count.toLocaleString() },
        { metric: 'Published or confirmed', value: published.toLocaleString() },
        { metric: 'Outlets represented', value: new Set(rows.map(row => row.outlet).filter(value => value && value !== '—')).size.toLocaleString() },
      ];
      findings = [`${published} of ${count} schedule records are published or confirmed.`];
      break;
    }
    case 'attendance': {
      const presentDays = numericTotal(rows, 'presentDays');
      const absentDays = numericTotal(rows, 'absentDays');
      const late = numericTotal(rows, 'lateMinutes');
      const overtime = numericTotal(rows, 'overtimeMinutes');
      metrics = [
        { metric: 'Attendance summaries', value: count.toLocaleString() },
        { metric: 'Present days', value: presentDays.toLocaleString() },
        { metric: 'Absent days', value: absentDays.toLocaleString() },
        { metric: 'Late minutes', value: late.toLocaleString() },
        { metric: 'Overtime minutes', value: overtime.toLocaleString() },
        { metric: 'Work hours', value: numericTotal(rows, 'workHours').toFixed(2) },
      ];
      findings = [`${late} late minutes and ${absentDays} absent days were recorded across the selected summaries.`, `Total recorded work time was ${numericTotal(rows, 'workHours').toFixed(2)} hours.`];
      break;
    }
    case 'attendanceLogs': {
      const late = numericTotal(rows, 'lateMinutes');
      const overtime = numericTotal(rows, 'overtimeMinutes');
      metrics = [
        { metric: 'Attendance records', value: count.toLocaleString() },
        { metric: 'Total work hours', value: numericTotal(rows, 'totalHours').toFixed(2) },
        { metric: 'Late minutes', value: late.toLocaleString() },
        { metric: 'Undertime minutes', value: numericTotal(rows, 'undertimeMinutes').toLocaleString() },
        { metric: 'Overtime minutes', value: overtime.toLocaleString() },
      ];
      findings = [`The selected records contain ${late} late minutes and ${overtime} overtime minutes.`, `${countMatching(rows, 'validationStatus', 'validated')} records are marked validated.`];
      break;
    }
    case 'payroll': {
      const gross = numericTotal(rows, 'grossPay');
      const net = numericTotal(rows, 'netPay');
      const deductions = numericTotal(rows, 'deductions');
      metrics = [
        { metric: 'Payroll items', value: count.toLocaleString() },
        { metric: 'Gross pay total', value: money(gross) },
        { metric: 'Deductions total', value: money(deductions) },
        { metric: 'Net pay total', value: money(net) },
      ];
      findings = [`Gross pay totals ${money(gross)} and net pay totals ${money(net)} for the selected payroll items.`, `${countMatching(rows, 'status', 'endorsed') + countMatching(rows, 'status', 'exported')} payroll items are in an endorsed or exported payroll.`];
      break;
    }
    case 'evaluations': {
      const completedRows = rows.filter(row => ['approved', 'completed'].includes(String(row.status ?? '').trim().toLowerCase()));
      const avg = completedRows.length ? numericTotal(completedRows, 'finalScore') / completedRows.length : 0;
      const approved = completedRows.length;
      metrics = [
        { metric: 'Evaluation records', value: count.toLocaleString() },
        { metric: 'Average final score (completed)', value: completedRows.length ? `${avg.toFixed(2)}%` : 'No completed evaluations' },
        { metric: 'Completed evaluations', value: approved.toLocaleString() },
      ];
      findings = [completedRows.length
        ? `The average final score is ${avg.toFixed(2)}% across ${completedRows.length} completed evaluations.`
        : `No completed evaluations are available among the ${count} matching records.`, `${count - approved} evaluation records are still in progress or otherwise not completed.`];
      break;
    }
    case 'recognition': {
      const ranked = [...rows].sort((left, right) => Number(right.finalScore || 0) - Number(left.finalScore || 0));
      const topScore = ranked.length ? Number(ranked[0].finalScore || 0) : null;
      metrics = [
        { metric: 'Employees recognized', value: count.toLocaleString() },
        { metric: 'Top final score', value: topScore === null ? 'No completed evaluations' : `${topScore.toFixed(2)}%` },
        { metric: 'Outlets represented', value: new Set(rows.map(row => row.outlet).filter(value => value && value !== '—')).size.toLocaleString() },
      ];
      findings = [ranked.length
        ? `${ranked[0].employee} has the highest final evaluation score at ${topScore!.toFixed(2)}%.`
        : 'No approved or completed evaluations are available for recognition in this period.',
      'Recognition rankings use saved final evaluation scores for the selected outlet and period.'];
      break;
    }
    case 'requests': {
      const approved = countMatching(rows, 'status', 'approved');
      const pending = countMatching(rows, 'status', 'pending');
      metrics = [
        { metric: 'Employee requests', value: count.toLocaleString() },
        { metric: 'Approved', value: approved.toLocaleString() },
        { metric: 'Pending', value: pending.toLocaleString() },
        { metric: 'Leave requests', value: countMatching(rows, 'type', 'leave').toLocaleString() },
        { metric: 'Overtime requests', value: countMatching(rows, 'type', 'overtime').toLocaleString() },
        { metric: 'Undertime requests', value: countMatching(rows, 'type', 'undertime').toLocaleString() },
      ];
      findings = [`${approved} requests are approved and ${pending} remain pending.`, `${count} requests were submitted in the selected period.`];
      break;
    }
    default:
      findings = [`${count} records were included in this report.`];
  }

  return { count, metrics, findings };
};

const formatTime = (value: any) => {
  if (!value) return '—';
  return String(value).slice(0, 5);
};

const buildPeriod = (start: any, end: any, label?: string | null) => {
  if (label) return label;
  const s = toDateOnly(start);
  const e = toDateOnly(end);
  if (!s && !e) return '—';
  return s === e ? s : `${s} to ${e}`;
};

const firstFilled = (...values: any[]) => {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
};

const getComparableReportDate = (value: any) => {
  if (!value) return '';
  const str = String(value).trim();
  const dateMatch = str.match(/\d{4}-\d{2}-\d{2}/);
  if (dateMatch) return dateMatch[0];
  const monthMatch = str.match(/^(\d{4}-\d{2})$/);
  if (monthMatch) return `${monthMatch[1]}-01`;
  const weekMatch = str.match(/^(\d{4})-W(\d{1,2})$/i);
  if (weekMatch) {
    const year = Number(weekMatch[1]);
    const week = Number(weekMatch[2]);
    const firstThursday = new Date(Date.UTC(year, 0, 4));
    firstThursday.setUTCDate(firstThursday.getUTCDate() + (week - 1) * 7);
    const monday = new Date(firstThursday);
    monday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const isWithinReportRange = (row: any, dateFrom: string, dateTo: string) => {
  const dateVal = row.date || row.dateApplied || row.createdAt || row.periodStart || row.submittedDate || row.week || row.period;
  const comparableDate = getComparableReportDate(dateVal);
  if (!comparableDate) return true;
  return (!dateFrom || comparableDate >= dateFrom) && (!dateTo || comparableDate <= dateTo);
};

const loadSystemLogs = async () => {
  const pageSize = 500;
  const rows = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('system_logs')
      .select('log_id,user_name,user_role,action,module,record_id,record_table,description,created_at')
      .order('created_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
};

const labelize = (key: string) =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .replace('Id', 'ID')
    .trim();

const getStatusColor = (value: any) => {
  const status = String(value ?? '').toLowerCase();
  if (
    ['active', 'approved', 'present', 'processed', 'hired', 'confirmed', 'published', 'validated', 'reviewed', 'endorsed', 'exported', 'true'].some(s =>
      status.includes(s),
    )
  ) {
    return 'success' as const;
  }
  if (
    ['pending', 'draft', 'under review', 'late', 'needs review', 'unprocessed'].some(s => status.includes(s))
  ) {
    return 'warning' as const;
  }
  if (
    ['resigned', 'not qualified', 'absent', 'disapproved', 'rejected', 'declined', 'cancelled', 'invalid', 'false'].some(s =>
      status.includes(s),
    )
  ) {
    return 'error' as const;
  }
  return 'default' as const;
};

export default function Reports() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState('employees');
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly');
  const [dateFrom, setDateFrom] = useState(() => getPeriodRange('monthly').start);
  const [dateTo, setDateTo] = useState(() => getPeriodRange('monthly').end);
  const [selectedOutlet, setSelectedOutlet] = useState('All Outlets');
  const [logDate, setLogDate] = useState('');
  const [logUser, setLogUser] = useState('');
  const [logModule, setLogModule] = useState('');
  const [preparedByName, setPreparedByName] = useState('');
  const [allData, setAllData] = useState<ReportData>({});
  const [loadingAll, setLoadingAll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [reportHistory, setReportHistory] = useState<GeneratedReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);

  const loadTable = async (tableName: string, orderColumn?: string) => {
    let query = supabase.from(tableName).select('*');

    if (orderColumn) {
      query = query.order(orderColumn, { ascending: false });
    }

    const { data, error: tableError } = await query;
    if (tableError) {
      throw new Error(`${tableName}: ${tableError.message}`);
    }

    return data ?? [];
  };

  const fetchAll = async () => {
    setLoadingAll(true);
    setError(null);
    setWarning(null);

    const warnings: string[] = [];

    const safe = async (tableName: string, orderColumn?: string) => {
      try {
        return await (tableName === 'system_logs' ? loadSystemLogs() : loadTable(tableName, orderColumn));
      } catch (err: any) {
        warnings.push(err?.message ?? `Unable to load ${tableName}`);
        return [];
      }
    };

    try {
      const [
        employees,
        applicants,
        schedules,
        attendanceSummaries,
        attendanceLogs,
        payrollSummaries,
        payrollItems,
        requests,
        criteria,
        evaluations,
        systemLogs,
        userAccounts,
      ] = await Promise.all([
        safe('employees', 'created_at'),
        safe('applicants', 'created_at'),
        safe('schedule'),
        safe('attendance_summaries', 'created_at'),
        safe('attendance_logs', 'created_at'),
        safe('payroll_summaries', 'created_at'),
        safe('payroll_items', 'created_at'),
        safe('employee_requests', 'created_at'),
        safe('evaluation_criteria', 'created_at'),
        safe('employee_evaluations', 'created_at'),
        safe('system_logs'),
        safe('user_accounts'),
      ]);
      setPreparedByName(String(user?.name ?? user?.email ?? '').trim());

      const outletByEmployeeId = new Map<string, any>();
      const outletByApplicantId = new Map<string, any>();
      userAccounts.forEach((u: any) => {
        if (u.employee_id) outletByEmployeeId.set(u.employee_id, u.outlet);
        if (u.applicant_id) outletByApplicantId.set(u.applicant_id, u.outlet);
      });

      const employeeById = new Map<string, any>();
      employees.forEach((e: any) => employeeById.set(e.employee_id, { ...e, outlet: firstFilled(outletByEmployeeId.get(e.employee_id), e.outlet) }));

      const payrollById = new Map<string, any>();
      payrollSummaries.forEach((p: any) => payrollById.set(p.payroll_id, p));

      const map: ReportData = {
        employees: employees.map((e: any) => ({
          id: e.employee_id,
          name: getFullName(e) || e.employee_name || '—',
          position: e.position || '—',
          department: e.department || '—',
          outlet: firstFilled(outletByEmployeeId.get(e.employee_id), e.outlet) || '—',
          status: e.status || '—',
          contact: e.phone_number || '—',
          email: e.email || '—',
          dateHired: toDateOnly(e.hire_date) || '—',
          date: toDateOnly(e.hire_date || e.created_at),
        })),

        applications: applicants.map((a: any) => ({
          id: a.applicant_id,
          name: a.name || getFullName(a) || '—',
          position: a.position_applied || '—',
          outlet: firstFilled(outletByApplicantId.get(a.applicant_id), a.outlet) || '—',
          email: a.email || '—',
          phone: a.phone_number || '—',
          dateApplied: toDateOnly(a.created_at),
          date: toDateOnly(a.created_at),
          status: a.status || '—',
          hiringDecision: a.hiring_decision || '—',
        })),

        schedules: schedules.map((s: any) => {
          const emp = s.employee_id ? employeeById.get(s.employee_id) : null;
          return {
            id: s.schedule_id,
            employee: s.employee_id
              ? `${s.employee_id}${emp ? ` - ${getFullName(emp)}` : ''}`
              : '—',
            week: s.week || '—',
            position: s.position || emp?.position || '—',
            outlet: firstFilled(s.outlet, emp?.outlet) || '—',
            timeIn: formatTime(s.time_in),
            timeOut: formatTime(s.time_out),
            finalized: s.is_finalized ? 'Finalized' : 'Draft',
            status: s.status || (s.is_finalized ? 'Finalized' : 'Draft'),
            date: s.week || '',
          };
        }),

        attendance: attendanceSummaries.map((a: any) => ({
          id: a.summary_id,
          employee: `${a.employee_id}${a.employee_name || employeeById.get(a.employee_id) ? ` - ${a.employee_name || getFullName(employeeById.get(a.employee_id))}` : ''}`,
          position: a.position || employeeById.get(a.employee_id)?.position || '—',
          outlet: firstFilled(a.outlet, employeeById.get(a.employee_id)?.outlet) || '—',
          period: buildPeriod(a.period_start, a.period_end),
          presentDays: a.total_present_days ?? 0,
          absentDays: a.total_absent_days ?? 0,
          incompleteDays: a.total_incomplete_days ?? 0,
          lateMinutes: a.total_late_minutes ?? 0,
          undertimeMinutes: a.total_undertime_minutes ?? 0,
          overtimeMinutes: a.total_overtime_minutes ?? 0,
          workHours: a.total_work_hours ?? 0,
          status: a.status || 'Draft',
          date: toDateOnly(a.period_start),
        })),

        attendanceLogs: attendanceLogs.map((a: any) => ({
          id: a.log_id,
          employee: `${a.employee_id || a.biometric_user_id || '—'}${a.employee_name ? ` - ${a.employee_name}` : ''}`,
          outlet: firstFilled(employeeById.get(a.employee_id)?.outlet, a.outlet) || '—',
          date: toDateOnly(a.attendance_date),
          timeIn: formatTime(a.time_in),
          timeOut: formatTime(a.time_out),
          totalHours: a.total_hours ?? 0,
          lateMinutes: a.late_minutes ?? 0,
          undertimeMinutes: a.undertime_minutes ?? 0,
          overtimeMinutes: a.overtime_minutes ?? 0,
          validationStatus: a.validation_status || 'Unprocessed',
          source: a.source || '—',
        })),

        payroll: payrollItems.map((item: any) => {
          const payroll = payrollById.get(item.payroll_id);
          const emp = item.employee_id ? employeeById.get(item.employee_id) : null;
          return {
            id: item.payroll_item_id,
            employee: `${item.employee_id}${item.employee_name || emp ? ` - ${item.employee_name || getFullName(emp)}` : ''}`,
            position: item.position || emp?.position || '—',
            outlet: firstFilled(item.outlet, emp?.outlet) || '—',
            period: buildPeriod(payroll?.period_start, payroll?.period_end, payroll?.cutoff_label),
            regularHours: item.regular_hours ?? 0,
            overtimeHours: item.overtime_hours ?? 0,
            grossPay: item.gross_pay ?? 0,
            deductions: item.total_deductions ?? 0,
            netPay: item.net_pay ?? 0,
            status: payroll?.status || 'Draft',
            date: toDateOnly(payroll?.period_start || item.created_at),
          };
        }),

        evaluations: evaluations.map((e: any) => ({
          id: e.evaluation_id,
          employee: `${e.employee_id}${e.employee_name || employeeById.get(e.employee_id) ? ` - ${e.employee_name || getFullName(employeeById.get(e.employee_id))}` : ''}`,
          position: e.position || employeeById.get(e.employee_id)?.position || '—',
          outlet: firstFilled(e.outlet, employeeById.get(e.employee_id)?.outlet) || '—',
          period: buildPeriod(e.evaluation_period_start, e.evaluation_period_end, e.evaluation_period_label),
          rawScore: e.total_raw_score ?? 0,
          finalScore: e.final_weighted_score ?? 0,
          rating: e.rating_label || '—',
          status: e.status || 'Draft',
          date: toDateOnly(e.evaluation_period_start),
        })),
        requests: requests.map((r: any) => ({
          id: r.request_id,
          employee: `${r.employee_id || '—'}${employeeById.get(r.employee_id) ? ` - ${getFullName(employeeById.get(r.employee_id))}` : ''}`,
          outlet: firstFilled(employeeById.get(r.employee_id)?.outlet) || '—',
          type: r.request_type || '—',
          leaveType: r.leave_type || '—',
          date: buildPeriod(r.start_date, r.end_date),
          time: r.start_time || r.end_time ? `${formatTime(r.start_time)} - ${formatTime(r.end_time)}` : '—',
          reason: r.reason || '—',
          status: r.status || 'Pending',
          reviewerRemarks: r.reviewer_remarks || '—',
          createdAt: toDateOnly(r.created_at),
        })),

        criteria: criteria.map((c: any) => ({
          id: c.criteria_id,
          criteriaName: c.criteria_name || '—',
          category: c.category || '—',
          weight: c.weight ?? 0,
          maxScore: c.max_score ?? 100,
          active: c.is_active ? 'Active' : 'Inactive',
          description: c.description || '—',
          date: toDateOnly(c.created_at),
        })),

        systemLogs: systemLogs.map(l => ({
          id: l.log_id,
          userName: l.user_name || '—',
          userRole: l.user_role || '—',
          action: l.action || '—',
          module: l.module || '—',
          recordId: l.record_id || '—',
          recordTable: l.record_table || '—',
          description: l.description || '—',
          date: parseDisplayDate(formatDisplayDate(l.created_at)),
          dateTime: l.created_at,
        })),
      };

      map.recognition = map.evaluations
        .filter((row: any) => ['approved', 'reviewed', 'completed'].includes(String(row.status ?? '').trim().toLowerCase()))
        .sort((left: any, right: any) => Number(right.finalScore || 0) - Number(left.finalScore || 0));

      setAllData(map);
      if (warnings.length > 0) {
        setWarning(`Some report sources could not be loaded: ${warnings.join(' | ')}`);
      }
    } catch (err: any) {
      setError(`Failed to load report data: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setLoadingAll(false);
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const fetchReportHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    const { data, error } = await supabase.from('generated_report_history')
      .select('id,report_title,report_type,period_start,period_end,file_name,storage_path,record_count,prepared_by,created_at')
      .order('created_at', { ascending: false }).limit(10);
    if (error) {
      setReportHistory([]);
      setHistoryError(`Could not load saved report history: ${error.message}`);
    } else {
      setReportHistory((data ?? []) as GeneratedReport[]);
    }
    setHistoryLoading(false);
  };

  useEffect(() => { void fetchReportHistory(); }, []);

  useEffect(() => {
    setPage(0);
  }, [reportType, dateFrom, dateTo, rowsPerPage, logDate, logUser, logModule]);

  const selected = REPORT_TYPES.find(r => r.value === reportType) ?? REPORT_TYPES[0];
  const outletsAvailable = useMemo(() => [...new Set(
    Object.values(allData).flatMap(rows => rows.map(row => String(row?.outlet ?? '').trim()).filter(value => value && value !== '—')),
  )].sort((left, right) => left.localeCompare(right)), [allData]);

  const getFilteredRowsForType = (type: string): any[] => {
    if (type === 'consolidated') return consolidatedRows;
    const rows = allData[type] ?? [];
    const withinRange = rows.filter(row => {
      if (type === 'systemLogs') {
        return (logDate ? row.date === logDate : isWithinReportRange(row, dateFrom, dateTo))
          && (!logUser || row.userName === logUser)
          && (!logModule || row.module === logModule);
      }
      return type === 'employees' || isWithinReportRange(row, dateFrom, dateTo);
    });
    const outletFiltered = selectedOutlet === 'All Outlets' || REPORTS_WITHOUT_OUTLET.has(type)
      ? withinRange
      : withinRange.filter(row => String(row.outlet ?? '').trim().toLowerCase() === selectedOutlet.toLowerCase());
    if (type === 'recognition') {
      return [...outletFiltered]
        .sort((left, right) => Number(right.finalScore || 0) - Number(left.finalScore || 0))
        .map((row, index) => ({ ...row, rank: index + 1 }));
    }
    return outletFiltered;
  };

  const filteredByType: Record<string, any[]> = useMemo(() => Object.fromEntries(
    REPORT_SUMMARY_MODULES.map(type => [type, getFilteredRowsForType(type)]),
  ) as Record<string, any[]>, [allData, dateFrom, dateTo, logDate, logModule, logUser, selectedOutlet]);
  const consolidatedSummary: Array<{ type: string; label: string; rows: any[]; count: number; metrics: Array<{ metric: string; value: string }>; findings: string[] }> = useMemo(() => REPORT_SUMMARY_MODULES.map(type => {
    const summary = summarizeReport(type, filteredByType[type] ?? []);
    const typeLabel = REPORT_TYPES.find(item => item.value === type)?.label ?? type;
    return {
      type,
      label: typeLabel,
      rows: filteredByType[type] ?? [],
      ...summary,
    };
  }), [filteredByType]);
  const consolidatedRows: any[] = useMemo(() => consolidatedSummary.flatMap(section => section.metrics.map(metric => ({
    module: section.label,
    metric: metric.metric,
    value: metric.value,
  }))), [consolidatedSummary]);
  const currentData: any[] = reportType === 'consolidated' ? consolidatedRows : (allData[reportType] ?? []);
  const cols = COLUMNS[reportType] ?? [];
  const filtered: any[] = reportType === 'consolidated' ? consolidatedRows : (filteredByType[reportType] ?? []);

  const paginated = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const formatValue = (key: string, value: any) => {
    if (value === null || value === undefined || value === '') return '—';
    if (key === 'dateTime') return formatDisplayDateTime(String(value), '—');
    if (key === 'week' || key === 'period') return formatDisplayDateRange(String(value));
    if (reportDateColumns.has(key)) return formatDisplayDateRange(String(value));
    if (currencyColumns.has(key)) return money(value);
    if (percentColumns.has(key)) return `${Number(value).toFixed(2)}${key === 'weight' || key === 'finalScore' || key === 'rawScore' ? '%' : ''}`;
    return String(value);
  };

  const escapeHtml = (value: any) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const reportBrandName = selectedOutlet === 'All Outlets' ? COMPANY.name : selectedOutlet;
  const outletKey = selectedOutlet.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
  const reportLogoUrl = REPORT_OUTLET_LOGOS.get(outletKey);

  const getNarrativeSections = (type: string) => {
    if (type === 'consolidated') return consolidatedSummary;
    const rows = getFilteredRowsForType(type);
    const label = REPORT_TYPES.find(item => item.value === type)?.label ?? type;
    return [{ type, label, rows, ...summarizeReport(type, rows) }];
  };

  const getNarrativeRecordCount = (type: string, sections = getNarrativeSections(type)) =>
    type === 'consolidated'
      ? REPORT_SUMMARY_MODULES.reduce((sum, module) => sum + (filteredByType[module]?.length ?? 0), 0)
      : (sections[0]?.rows?.length ?? 0);

  const getNarrativeIntro = (type: string, sections = getNarrativeSections(type)) => {
    const period = type === 'systemLogs' && logDate
      ? formatDisplayDate(logDate)
      : `${formatDisplayDate(dateFrom)} to ${formatDisplayDate(dateTo)}`;
    const count = getNarrativeRecordCount(type, sections);
    if (type === 'consolidated') {
      return `This consolidated HR summary brings together current employee, recruitment, schedule, attendance, payroll, performance, and employee request information for ${selectedOutlet} during ${period}. It reviews ${count} source records across ${sections.length} HR areas.`;
    }
    const label = REPORT_TYPES.find(item => item.value === type)?.label ?? type;
    return `This report summarizes ${label.toLowerCase()} for ${selectedOutlet} during ${period}. It is based on ${count} matching record${count === 1 ? '' : 's'} currently available in the HRIS.`;
  };

  const getNarrativeConclusion = (type: string, sections = getNarrativeSections(type)) => {
    const count = getNarrativeRecordCount(type, sections);
    if (type === 'consolidated') {
      return `The selected period contains ${count} source records across ${sections.length} HR areas. These results provide a consolidated view of the records currently available for the selected outlet and reporting period.`;
    }
    const label = REPORT_TYPES.find(item => item.value === type)?.label ?? type;
    return `${count} ${label.toLowerCase()} record${count === 1 ? '' : 's'} were included for ${selectedOutlet} in the selected reporting period. The findings above summarize the saved HRIS data available for review.`;
  };

  const getMetricNarrative = (metrics: Array<{ metric: string; value: string }>) =>
    metrics.length
      ? `The summary figures are: ${metrics.map(item => `${item.metric.toLowerCase()} was ${item.value}`).join('; ')}.`
      : '';

  const renderNarrativeHtml = (type: string, sections = getNarrativeSections(type)) => {
    const details = sections.map(section => `
      ${type === 'consolidated' ? `<h3>${escapeHtml(section.label)}</h3>` : ''}
      <p>${escapeHtml(getMetricNarrative(section.metrics))}</p>
      ${section.findings.map(finding => `<p>${escapeHtml(finding)}</p>`).join('')}
    `).join('');
    const title = REPORT_TYPES.find(item => item.value === type)?.label ?? 'Consolidated HR Summary';
    return `
      <h2>Executive Summary</h2>
      <p>${escapeHtml(getNarrativeIntro(type, sections))}</p>
      <h2>Key Findings</h2>
      ${details}
      <h2>Conclusion</h2>
      <p>${escapeHtml(getNarrativeConclusion(type, sections))}</p>
      <div class="prepared"><span>Prepared by: <strong>${escapeHtml(preparedByName || user?.name || user?.email || 'Authorized HRIS user')}</strong></span><span>Report Type: <strong>${escapeHtml(title)}</strong></span></div>
    `;
  };

  const exportCSV = () => {
    if (filtered.length === 0) return;

    const header = cols.map(labelize).join(',');
    const rows = filtered.map(row =>
      cols
        .map(c => `"${String(formatValue(c, row[c])).replace(/"/g, '""')}"`)
        .join(','),
    );

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportType}_report_${dateFrom}_to_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdfReport = async () => {
    if (!filtered.length || generatingPdf) return;
    if (reportType === 'consolidated' && warning) {
      setPdfError('A consolidated report needs data from every HR module. Resolve the data-source warning and refresh before creating this PDF.');
      return;
    }
    if (periodMode === 'custom' && (!dateFrom || !dateTo || dateTo < dateFrom)) {
      setPdfError('Choose a valid custom date range before creating the PDF.');
      return;
    }
    setGeneratingPdf(true);
    setPdfError(null);
    let uploadedPath: string | null = null;
    try {
      const { jsPDF } = await import('jspdf');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const authUserId = sessionData.session?.user.id;
      if (!authUserId) throw new Error('Sign in again before generating a report.');

      const isLogReport = reportType === 'systemLogs';
      const isConsolidated = reportType === 'consolidated';
      const reportDates = isLogReport && logDate
        ? formatDisplayDate(logDate)
        : `${formatDisplayDate(dateFrom)} to ${formatDisplayDate(dateTo)}`;
      const generatedAt = new Date();
      const slug = reportType.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      const outletSlug = selectedOutlet === 'All Outlets' ? 'all-outlets' : selectedOutlet.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      const fileName = `${slug}_${outletSlug}_${dateFrom || 'all'}_to_${dateTo || 'all'}.pdf`;
      const document = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
      const fontName = 'DejaVuSans';
      const fontFile = `${fontName}.ttf`;
      const [fontResponse, logoResponse] = await Promise.all([
        fetch(`/fonts/dejavu/${fontFile}`),
        reportLogoUrl ? fetch(reportLogoUrl) : null,
      ]);
      if (!fontResponse.ok) throw new Error('Could not load the report font.');
      if (logoResponse && !logoResponse.ok) throw new Error('Could not load the outlet logo.');
      const fontDataUrl = await fileToDataUrl(await fontResponse.blob());
      document.addFileToVFS(fontFile, fontDataUrl.slice(fontDataUrl.indexOf(',') + 1));
      document.addFont(fontFile, fontName, 'normal');
      const logoImage = logoResponse ? await makeCircularLogo(await logoResponse.blob()) : null;
      const pageWidth = document.internal.pageSize.getWidth();
      const pageHeight = document.internal.pageSize.getHeight();
      const margin = 48;
      const logoSize = 54;
      const headingX = logoImage ? margin + logoSize + 14 : margin;
      const preparedBy = preparedByName || user?.name || sessionData.session?.user.email || 'Authorized HRIS user';
      const reportSections = getNarrativeSections(reportType);
      const reportRecordCount = getNarrativeRecordCount(reportType, reportSections);
      const reportTitle = selectedOutlet === 'All Outlets' ? selected.label : `${selected.label} — ${selectedOutlet}`;
      const header = () => {
        document.setFillColor(31, 122, 70);
        document.rect(0, 0, pageWidth, 86, 'F');
        if (logoImage) document.addImage(logoImage, 'PNG', margin, 16, logoSize, logoSize, 'outlet-logo');
        document.setTextColor(255, 255, 255);
        document.setFont('helvetica', 'bold');
        document.setFontSize(16);
        document.text(reportBrandName.toUpperCase(), headingX, 26);
        document.setFont('helvetica', 'normal');
        document.setFontSize(9);
        document.text('HUMAN RESOURCE INFORMATION SYSTEM', headingX, 42);
        document.setFont('helvetica', 'bold');
        document.setFontSize(12);
        document.text(selected.label, headingX, 64);
        document.setFont('helvetica', 'normal');
        document.setFontSize(8);
        document.text(`Generated ${formatDisplayDateTime(generatedAt)}`, pageWidth - margin, 26, { align: 'right' });
      };
      const footer = () => {
          document.setDrawColor(169, 223, 182);
          document.line(margin, pageHeight - 27, pageWidth - margin, pageHeight - 27);
          document.setFont('helvetica', 'normal');
          document.setFontSize(8);
          document.setTextColor(103, 121, 108);
          document.text(COMPANY.name, margin, pageHeight - 13);
      };
      let cursorY = 116;
      const bodyWidth = pageWidth - margin * 2;
      const drawPage = () => {
        document.addPage();
        header();
        cursorY = 116;
      };
      const ensureSpace = (height: number) => {
        if (cursorY + height > pageHeight - 58) drawPage();
      };
      const drawHeading = (text: string, subheading = false) => {
        ensureSpace(subheading ? 24 : 32);
        document.setTextColor(31, 122, 70);
        document.setFont('helvetica', 'bold');
        document.setFontSize(subheading ? 11 : 13);
        document.text(text, margin, cursorY);
        cursorY += subheading ? 18 : 23;
      };
      const drawParagraph = (text: string) => {
        if (!text) return;
        const fontSize = 10;
        const lineHeight = 15;
        const setParagraphStyle = () => {
          document.setTextColor(38, 54, 43);
          document.setFont(fontName, 'normal');
          document.setFontSize(fontSize);
        };
        setParagraphStyle();
        const lines = document.splitTextToSize(text, bodyWidth) as string[];
        let offset = 0;
        while (offset < lines.length) {
          const availableLines = Math.max(1, Math.floor((pageHeight - 58 - cursorY) / lineHeight));
          const currentLines = lines.slice(offset, offset + availableLines);
          document.text(currentLines, margin, cursorY, { lineHeightFactor: lineHeight / fontSize });
          cursorY += currentLines.length * lineHeight + 10;
          offset += currentLines.length;
          if (offset < lines.length) {
            drawPage();
            setParagraphStyle();
          }
        }
      };

      header();
      drawHeading('Executive Summary');
      drawParagraph(getNarrativeIntro(reportType, reportSections));
      drawHeading('Key Findings');
      reportSections.forEach(section => {
        if (isConsolidated) drawHeading(section.label, true);
        drawParagraph(getMetricNarrative(section.metrics));
        section.findings.forEach(finding => drawParagraph(finding));
      });
      drawHeading('Conclusion');
      drawParagraph(getNarrativeConclusion(reportType, reportSections));
      ensureSpace(52);
      document.setDrawColor(220, 232, 221);
      document.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 20;
      document.setFont('helvetica', 'normal');
      document.setFontSize(9);
      document.setTextColor(103, 121, 108);
      document.text('Prepared by:', margin, cursorY);
      document.setFont('helvetica', 'bold');
      document.setTextColor(38, 54, 43);
      document.text(preparedBy, margin, cursorY + 15);
      document.setFont('helvetica', 'normal');
      document.setTextColor(103, 121, 108);
      document.text('Report Type:', pageWidth - margin, cursorY, { align: 'right' });
      document.setFont('helvetica', 'bold');
      document.setTextColor(38, 54, 43);
      document.text(selected.label, pageWidth - margin, cursorY + 15, { align: 'right' });

      const pageCount = document.getNumberOfPages();
      for (let pageIndex = 1; pageIndex <= pageCount; pageIndex += 1) {
        document.setPage(pageIndex);
        footer();
        document.setFont('helvetica', 'normal');
        document.setFontSize(8);
        document.setTextColor(103, 121, 108);
        document.text(`Page ${pageIndex} of ${pageCount}`, pageWidth - margin, pageHeight - 13, { align: 'right' });
      }

      const pdfBlob = document.output('blob');
      const storagePath = `${authUserId}/${Date.now()}_${slug}_${outletSlug}.pdf`;
      const { error: uploadError } = await supabase.storage.from('hr-report-pdfs').upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      uploadedPath = storagePath;

      const periodStart = isLogReport && logDate ? logDate : dateFrom;
      const periodEnd = isLogReport && logDate ? logDate : dateTo;
      const { data: savedReport, error: historyInsertError } = await supabase.from('generated_report_history')
        .insert({
          report_title: reportTitle,
          report_type: reportType,
          period_start: periodStart || null,
          period_end: periodEnd || null,
          file_name: fileName,
          storage_path: storagePath,
          record_count: reportRecordCount,
          prepared_by: preparedBy,
          created_by: authUserId,
        })
        .select('id,report_title,report_type,period_start,period_end,file_name,storage_path,record_count,prepared_by,created_at')
        .single();
      if (historyInsertError) throw historyInsertError;

      document.save(fileName);
      setReportHistory(current => [savedReport as GeneratedReport, ...current].slice(0, 10));
    } catch (cause) {
      if (uploadedPath) await supabase.storage.from('hr-report-pdfs').remove([uploadedPath]).catch(() => {});
      setPdfError(cause instanceof Error ? cause.message : 'Could not generate the PDF report.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const downloadSavedReport = async (report: GeneratedReport) => {
    if (downloadingReportId) return;
    setDownloadingReportId(report.id);
    setPdfError(null);
    try {
      const { data, error } = await supabase.storage.from('hr-report-pdfs').download(report.storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = report.file_name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setPdfError(cause instanceof Error ? cause.message : 'Could not download the saved PDF.');
    } finally {
      setDownloadingReportId(null);
    }
  };

  const getPrintLogo = () => reportLogoUrl
    ? `<img class="print-header-logo" src="${escapeHtml(new URL(reportLogoUrl, window.location.href).href)}" width="72" height="72" alt="">`
    : '';

  const handlePrint = () => {
    const generatedAt = formatDisplayDateTime(new Date());
    void printReport(`
      <html><head><title>${selected.label} Report</title>
      <style>
        @media print { @page { size: A4 portrait; margin: 16mm; } body { padding: 0; } }
        body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; line-height: 1.65; color: #26362b; }
        ${PRINT_HEADER_STYLES}
        .print-header h1 { font-size: 19px; margin: 0 0 4px; }
        .content { border: 1px solid #dce8dd; border-top: 0; padding: 20px 22px; }
        h2 { color: #1f7a46; font-size: 14px; margin: 20px 0 7px; }
        h2:first-child { margin-top: 0; }
        h3 { color: #2d6843; font-size: 12px; margin: 15px 0 4px; }
        p { margin: 5px 0 10px; }
        .prepared { border-top: 1px solid #dce8dd; margin-top: 24px; padding-top: 12px; display: flex; justify-content: space-between; gap: 20px; }
        .footer { color: #718176; font-size: 10px; margin-top: 22px; border-top: 1px solid #dce8dd; padding-top: 8px; }
      </style></head><body>
      <div class="print-header">${getPrintLogo()}<div><h1>${escapeHtml(reportBrandName)}</h1><p>Human Resource Information System · ${escapeHtml(selected.label)}</p></div></div>
      <div class="content">${renderNarrativeHtml(reportType)}<div class="footer">Generated: ${escapeHtml(generatedAt)}</div></div>
      </body></html>
    `, 'width=900,height=700');
  };

  const handlePrintAllReports = () => {
    const generatedAt = formatDisplayDateTime(new Date());
    const reportSections = REPORT_TYPES.map(rt => {
      return `<section class="report-section">${renderNarrativeHtml(rt.value, getNarrativeSections(rt.value))}</section>`;
    }).join('');

    void printReport(`
      <html><head><title>All HRIS Reports</title>
      <style>
        @media print {
          @page { size: A4 portrait; margin: 16mm; }
          body { padding: 0; }
        }
        body { font-family: Arial, sans-serif; padding: 28px; font-size: 12px; line-height: 1.65; color: #26362b; }
        ${PRINT_HEADER_STYLES}
        .print-header h1 { margin: 0 0 6px; font-size: 21px; }
        .report-section { border: 1px solid #dce8dd; padding: 18px 22px; page-break-inside: auto; }
        .report-section + .report-section { border-top: 0; }
        h2 { color: #1f7a46; font-size: 14px; margin: 18px 0 7px; }
        h2:first-child { margin-top: 0; }
        h3 { color: #2d6843; font-size: 12px; margin: 14px 0 4px; }
        p { margin: 5px 0 10px; }
        .prepared { border-top: 1px solid #dce8dd; margin-top: 20px; padding-top: 10px; display: flex; justify-content: space-between; gap: 20px; }
        .footer { color: #718176; font-size: 10px; margin-top: 18px; border-top: 1px solid #dce8dd; padding-top: 8px; }
      </style></head><body>
      <div class="print-header">
        ${getPrintLogo()}
        <div>
          <h1>${escapeHtml(reportBrandName)} HRIS - All Reports</h1>
          <p>Period: ${escapeHtml(formatDisplayDate(dateFrom))} to ${escapeHtml(formatDisplayDate(dateTo))} | Generated: ${escapeHtml(generatedAt)}</p>
        </div>
      </div>
      ${reportSections}
      <div class="footer">Buenaventura Estate HRIS | Generated: ${escapeHtml(generatedAt)} | Confidential</div>
      </body></html>
    `, 'width=1100,height=800');
  };


  const totalLoadedRecords = Object.values(allData).reduce<number>((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const totalFilteredRecords = REPORT_TYPES.reduce((sum, rt) => sum + getFilteredRowsForType(rt.value).length, 0);
  const reportStats = [
    {
      label: 'Current Report',
      value: filtered.length,
      icon: <Assessment fontSize="small" />,
    },
    {
      label: 'Loaded Records',
      value: totalLoadedRecords,
      icon: <Dataset fontSize="small" />,
    },
    {
      label: 'Report Types',
      value: REPORT_TYPES.length,
      icon: <GridView fontSize="small" />,
    },
    {
      label: 'Period Filter',
      value: `${formatDisplayDate(dateFrom)} → ${formatDisplayDate(dateTo)}`,
      icon: <CalendarMonth fontSize="small" />,
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
              Reports
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={loadingAll ? <CircularProgress size={16} color="inherit" /> : <Sync />}
              onClick={fetchAll}
              disabled={loadingAll}
              sx={{
                ...pillButtonSx,
                py: 1.1,
                bgcolor: GREEN_UI.green,
                boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
              }}
            >
              {loadingAll ? 'Refreshing…' : 'Refresh Data'}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {reportStats.map(stat => (
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
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    sx={{ color: GREEN_UI.text, mt: 0.5, letterSpacing: '-0.04em', fontSize: { xs: '1.65rem', sm: '1.95rem' } }}
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
            </Paper>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={fetchAll} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}
      {warning && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}>
          {warning}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, md: 2.5 }, mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
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
            <Tune fontSize="small" />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.1 }}>
              Report Configuration
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Report Type"
              value={reportType}
              onChange={e => {
                setReportType(e.target.value);
                if (REPORTS_WITHOUT_OUTLET.has(e.target.value)) setSelectedOutlet('All Outlets');
              }}
              InputLabelProps={{ shrink: true }}
              sx={fieldSx}
            >
              {REPORT_TYPES.map(rt => (
                <MenuItem key={rt.value} value={rt.value}>
                  {rt.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth select label="Reporting Period" value={periodMode}
              onChange={event => {
                const nextPeriod = event.target.value as PeriodMode;
                setPeriodMode(nextPeriod);
                const range = getPeriodRange(nextPeriod);
                setDateFrom(range.start);
                setDateTo(range.end);
              }} InputLabelProps={{ shrink: true }} sx={fieldSx}>
              {PERIOD_OPTIONS.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField fullWidth select label="Outlet" value={selectedOutlet}
              onChange={event => setSelectedOutlet(event.target.value)} InputLabelProps={{ shrink: true }} sx={fieldSx}
              disabled={REPORTS_WITHOUT_OUTLET.has(reportType)}>
              <MenuItem value="All Outlets">All Outlets</MenuItem>
              {OUTLETS.map(outlet => <MenuItem key={outlet} value={outlet}>{outlet}</MenuItem>)}
              {outletsAvailable.filter(outlet => !OUTLETS.includes(outlet as typeof OUTLETS[number])).map(outlet =>
                <MenuItem key={outlet} value={outlet}>{outlet}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }} sx={{ alignSelf: 'flex-end' }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<RestartAlt />}
              sx={{ ...pillButtonSx, height: '56px', borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
              onClick={() => {
                setPeriodMode('monthly');
                const range = getPeriodRange('monthly');
                setDateFrom(range.start);
                setDateTo(range.end);
                setSelectedOutlet('All Outlets');
                setLogDate('');
                setLogUser('');
                setLogModule('');
              }}
            >
              Reset
            </Button>
          </Grid>
          {periodMode === 'custom' && <>
            <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Date From"
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={fieldSx}
            />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Date To"
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={fieldSx}
            />
            </Grid>
          </>}
        </Grid>

        {reportType === 'systemLogs' && (
          <Grid container spacing={1.5} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth type="date" label="Log Date" value={logDate}
                onChange={event => setLogDate(event.target.value)} helperText="Select one day in Manila time." sx={fieldSx} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth select label="Log User" value={logUser} onChange={event => setLogUser(event.target.value)} sx={fieldSx}>
                <MenuItem value="">All users</MenuItem>
                {[...new Set(currentData.map(row => row.userName))].sort().map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField fullWidth select label="Log Module" value={logModule} onChange={event => setLogModule(event.target.value)} sx={fieldSx}>
                <MenuItem value="">All modules</MenuItem>
                {[...new Set(currentData.map(row => row.module))].sort().map(module => <MenuItem key={module} value={module}>{module}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        )}
        <Divider sx={{ my: 2, borderColor: GREEN_UI.border }} />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            startIcon={generatingPdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdf />}
            onClick={() => void downloadPdfReport()}
            disabled={loadingAll || filtered.length === 0 || generatingPdf}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            {generatingPdf ? 'Creating PDF…' : 'Download PDF'}
          </Button>
          <Button
            variant="contained"
            startIcon={<Print />}
            onClick={handlePrint}
            disabled={loadingAll || filtered.length === 0}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            Print Report
          </Button>
          <Button
            variant="outlined"
            className="hris-light-action"
            startIcon={<FileDownload />}
            onClick={exportCSV}
            disabled={loadingAll || filtered.length === 0}
            sx={pillButtonSx}
          >
            Export CSV
          </Button>
          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handlePrintAllReports}
            disabled={loadingAll || totalFilteredRecords === 0}
            sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}
          >
            Export All Reports
          </Button>
        </Box>
        {pdfError && <Alert severity="error" sx={{ mt: 1.5 }}>{pdfError}</Alert>}
      </Paper>

      <Paper elevation={0} sx={{ ...softCardSx, mb: 2.5, overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', borderBottom: `1px solid ${GREEN_UI.border}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
              <InsertDriveFile fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text }}>Generated PDF history</Typography>
              <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>The 10 latest reports saved by authorized staff.</Typography>
            </Box>
          </Box>
          <Button size="small" variant="outlined" startIcon={historyLoading ? <CircularProgress size={14} /> : <Sync />}
            disabled={historyLoading} onClick={() => void fetchReportHistory()}
            sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}>
            Refresh history
          </Button>
        </Box>
        {historyError && <Alert severity="warning" sx={{ m: 2 }}>{historyError}</Alert>}
        {historyLoading ? <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 100 }}><CircularProgress size={24} sx={{ color: GREEN_UI.green }} /></Box>
          : reportHistory.length === 0 ? <Box sx={{ py: 4, px: 2, textAlign: 'center' }}>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>No PDF reports saved yet</Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>Choose a report and select Download PDF to create the first saved copy.</Typography>
          </Box>
          : <TableContainer sx={{ maxHeight: 430 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {['REPORT', 'REPORTING PERIOD', 'RECORDS', 'PREPARED BY', 'GENERATED', 'FILE'].map(column => (
                    <TableCell key={column} sx={{ bgcolor: '#f0f8eb', color: GREEN_UI.greenDark, fontWeight: 800 }}>{column}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {reportHistory.map(report => (
                  <TableRow key={report.id} hover>
                    <TableCell sx={{ fontWeight: 700, color: GREEN_UI.text }}>{report.report_title}</TableCell>
                    <TableCell sx={{ color: GREEN_UI.muted, whiteSpace: 'nowrap' }}>
                      {report.period_start ? formatDisplayDate(report.period_start) : '—'}
                      {report.period_end && report.period_end !== report.period_start ? ` to ${formatDisplayDate(report.period_end)}` : ''}
                    </TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={report.record_count} sx={{ borderColor: GREEN_UI.borderStrong }} /></TableCell>
                    <TableCell sx={{ color: GREEN_UI.muted }}>{report.prepared_by}</TableCell>
                    <TableCell sx={{ color: GREEN_UI.muted, whiteSpace: 'nowrap' }}>{formatDisplayDateTime(report.created_at)}</TableCell>
                    <TableCell>
                      <Tooltip title={`Download ${report.file_name}`}>
                        <span>
                          <IconButton aria-label={`Download ${report.file_name}`} size="small" disabled={Boolean(downloadingReportId)}
                            onClick={() => void downloadSavedReport(report)} sx={{ color: GREEN_UI.greenDark, border: `1px solid ${GREEN_UI.borderStrong}`, borderRadius: '10px' }}>
                            {downloadingReportId === report.id ? <CircularProgress size={17} /> : <Download fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>}
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {REPORT_TYPES.map(rt => {
          const active = reportType === rt.value;
          return (
            <Grid key={rt.value} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <Card
                elevation={0}
                sx={{
                  ...innerCardSx,
                  cursor: 'pointer',
                  height: '100%',
                  borderRadius: '20px',
                  background: active
                    ? 'linear-gradient(135deg, #3aa865 0%, #1f7a46 100%)'
                    : GREEN_UI.cardBg,
                  color: active ? '#ffffff' : GREEN_UI.text,
                  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                  '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 20px 42px rgba(43, 91, 55, 0.13)' },
                }}
                onClick={() => {
                  setReportType(rt.value);
                  if (REPORTS_WITHOUT_OUTLET.has(rt.value)) setSelectedOutlet('All Outlets');
                }}
              >
                <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: '14px',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: active ? 'rgba(255,255,255,0.18)' : GREEN_UI.greenSoft,
                          color: active ? '#ffffff' : GREEN_UI.greenDark,
                          flexShrink: 0,
                        }}
                      >
                        {rt.icon}
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={700} sx={{ fontSize: '0.9rem', lineHeight: 1.2 }} noWrap>
                          {rt.label}
                        </Typography>
                      </Box>
                    </Box>
                    {loadingAll ? (
                      <CircularProgress size={16} sx={{ color: active ? '#ffffff' : GREEN_UI.green }} />
                    ) : (
                      <Chip
                        label={`${getFilteredRowsForType(rt.value).length}`}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 700,
                          bgcolor: active ? 'rgba(255,255,255,0.15)' : '#ffffff',
                          color: active ? '#ffffff' : GREEN_UI.greenDark,
                          borderColor: active ? 'rgba(255,255,255,0.28)' : GREEN_UI.border,
                        }}
                      />
                    )}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Paper elevation={0} sx={{ ...softCardSx, overflow: 'hidden' }}>
        <Box
          sx={{
            p: { xs: 2, md: 2.5 },
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexWrap: 'wrap',
            gap: 1.5,
            borderBottom: `1px solid ${GREEN_UI.border}`,
            background: 'linear-gradient(90deg, #ffffff 0%, #f4fbf1 100%)',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
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
              {selected.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.1 }}>
                {selected.label} — Source Records
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                PDF and print reports summarize these records in prose; CSV export keeps the row-by-row data.
              </Typography>
            </Box>
          </Box>
          <Chip
            label={`${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 700, color: GREEN_UI.greenDark, borderColor: GREEN_UI.borderStrong, bgcolor: '#ffffff' }}
          />
        </Box>

        {loadingAll ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 7, gap: 2 }}>
            <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading report data…</Typography>
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ py: 7, px: 2, textAlign: 'center' }}>
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
              <InsertDriveFile />
            </Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              No records found
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
              Try changing the report type or date range to display matching records.
            </Typography>
          </Box>
        ) : (
          <>
            <div>
              <TableContainer
                sx={{
                  overflowX: 'auto',
                  '&::-webkit-scrollbar': { height: 10 },
                  '&::-webkit-scrollbar-thumb': { bgcolor: '#cfe8d1'},
                }}
              >
                <Table sx={{ minWidth: 950, '& th, & td': { borderColor: 'rgba(139, 184, 144, 0.16)' } }} size="small">
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
                      {cols.map(c => (
                        <TableCell key={c}>{labelize(c)}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map((row, i) => (
                      <TableRow
                        key={`${reportType}-${row.id ?? row.rank ?? i}`}
                        hover
                        sx={{
                          transition: 'background 160ms ease',
                          '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                          '& td': { py: 1.55, color: GREEN_UI.text },
                        }}
                      >
                        {cols.map(c => (
                          <TableCell
                            key={c}
                            sx={{ whiteSpace: 'nowrap', fontSize: '0.82rem', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {statusColumns.has(c) ? (
                              <Chip label={formatValue(c, row[c])} size="small" variant="outlined" sx={statusChipSx(row[c])} />
                            ) : c === 'finalScore' || c === 'rawScore' ? (
                              <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.greenDark }}>
                                {formatValue(c, row[c])}
                              </Typography>
                            ) : c === 'id' || c === 'rank' ? (
                              <Chip
                                label={formatValue(c, row[c])}
                                size="small"
                                variant="outlined"
                                sx={{ fontWeight: 600, bgcolor: '#f8fcf5', borderColor: GREEN_UI.border }}
                              />
                            ) : (
                              formatValue(c, row[c])
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>

            <TablePagination
              component="div"
              count={filtered.length}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={event => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[10, 25, 50, 100]}
              sx={{
                borderTop: `1px solid ${GREEN_UI.border}`,
                color: GREEN_UI.muted,
                '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontWeight: 700 },
                '& .MuiTablePagination-actions button': { borderRadius: '12px' },
              }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
