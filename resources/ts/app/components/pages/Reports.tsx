import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Card,
  CardContent,
  TextField,
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
} from '@mui/material';
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
} from '@mui/icons-material';
import { supabase } from '../../lib/supabaseClient';

interface ReportData {
  [key: string]: any[];
}

interface ReportType {
  value: string;
  label: string;
  icon: React.ReactElement;
}

const REPORT_TYPES: ReportType[] = [
  { value: 'employees', label: 'Employee Records', icon: <GridView /> },
  { value: 'applications', label: 'Recruitment / Applications', icon: <GridView /> },
  { value: 'schedules', label: 'Weekly Schedules', icon: <GridView /> },
  { value: 'attendance', label: 'Attendance Summary', icon: <GridView /> },
  { value: 'attendanceLogs', label: 'Attendance Logs', icon: <GridView /> },
  { value: 'payroll', label: 'Payroll Summary', icon: <GridView /> },
  { value: 'evaluations', label: 'Performance Evaluations', icon: <BarChartIcon /> },
  { value: 'requests', label: 'Leave / OT / Undertime Requests', icon: <GridView /> },
  { value: 'criteria', label: 'Evaluation Criteria & Weights', icon: <BarChartIcon /> },
  { value: 'systemLogs', label: 'System Logs', icon: <GridView /> },
];

const COLUMNS: Record<string, string[]> = {
  employees: ['id', 'name', 'position', 'department', 'outlet', 'status', 'contact', 'email', 'dateHired'],
  applications: ['id', 'name', 'position', 'email', 'phone', 'dateApplied', 'status', 'hiringDecision'],
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
  requests: ['id', 'employee', 'type', 'leaveType', 'date', 'time', 'reason', 'status', 'reviewerRemarks'],
  criteria: ['id', 'criteriaName', 'category', 'weight', 'maxScore', 'active', 'description'],
  systemLogs: ['id', 'userName', 'userRole', 'action', 'module', 'recordTable', 'description', 'date'],
};

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
    borderRadius: '16px',
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
  return comparableDate >= dateFrom && comparableDate <= dateTo;
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
  const [reportType, setReportType] = useState('employees');
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState('2026-12-31');
  const [allData, setAllData] = useState<ReportData>({});
  const [loadingAll, setLoadingAll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const printRef = useRef<HTMLDivElement>(null);

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
        return await loadTable(tableName, orderColumn);
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
        safe('system_logs', 'created_at'),
        safe('user_accounts'),
      ]);

      const outletByEmployeeId = new Map<string, any>();
      userAccounts.forEach((u: any) => {
        if (u.employee_id) outletByEmployeeId.set(u.employee_id, u.outlet);
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
            outlet: firstFilled(emp?.outlet, s.outlet) || '—',
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
          outlet: firstFilled(employeeById.get(a.employee_id)?.outlet, a.outlet) || '—',
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
            outlet: firstFilled(emp?.outlet, item.outlet) || '—',
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
          outlet: firstFilled(employeeById.get(e.employee_id)?.outlet, e.outlet) || '—',
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

        systemLogs: systemLogs.map((l: any) => ({
          id: l.log_id,
          userName: l.user_name || '—',
          userRole: l.user_role || '—',
          action: l.action || '—',
          module: l.module || '—',
          recordTable: l.record_table || '—',
          description: l.description || '—',
          date: toDateOnly(l.created_at),
        })),
      };

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
    fetchAll();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [reportType, dateFrom, dateTo, rowsPerPage]);

  const selected = REPORT_TYPES.find(r => r.value === reportType) ?? REPORT_TYPES[0];
  const currentData: any[] = allData[reportType] ?? [];
  const cols = COLUMNS[reportType] ?? [];

  const filtered = useMemo(() => {
    return currentData.filter(row => isWithinReportRange(row, dateFrom, dateTo));
  }, [currentData, dateFrom, dateTo]);

  const getFilteredRowsForType = (type: string) => {
    const rows = allData[type] ?? [];
    return rows.filter(row => isWithinReportRange(row, dateFrom, dateTo));
  };

  const paginated = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const formatValue = (key: string, value: any) => {
    if (value === null || value === undefined || value === '') return '—';
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

  const hasPrintableValue = (value: any) => {
    if (value === null || value === undefined) return false;
    return String(value).trim() !== '' && String(value).trim() !== 'â€”';
  };

  const getPrintableColumns = (type: string, rows: any[]) => {
    const sectionCols = COLUMNS[type] ?? [];
    if (rows.length === 0) return sectionCols;
    const filledCols = sectionCols.filter(col => rows.some(row => hasPrintableValue(row[col])));
    return filledCols.length > 0 ? filledCols : sectionCols;
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

  const handlePrint = () => {
    const content = printRef.current?.innerHTML ?? '';
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;

    win.document.write(`
      <html><head><title>${selected.label} Report</title>
      <style>
        @media print { @page { size: A4 landscape; margin: 15mm; } body { padding: 0; } }
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 12px; color: #1b1b1b; }
        h2 { color: #2e7d32; margin-bottom: 4px; }
        p { color: #555; margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { background: #2e7d32; color: white; padding: 8px; text-align: left; font-size: 11px; }
        td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 11px; }
        tr:nth-child(even) td { background: #f5f5f5; }
        .footer { color: #777; font-size: 10px; text-align: center; margin-top: 20px; }
      </style></head><body>
      <h2>Buenaventura Estate HRIS — ${selected.label} Report</h2>
      <p>Period: ${dateFrom} to ${dateTo} &nbsp;|&nbsp; Total records: ${filtered.length} &nbsp;|&nbsp; Generated: ${new Date().toLocaleString()}</p>
      ${content}
      <div class="footer">Buenaventura Estate HRIS &nbsp;·&nbsp; Printed: ${new Date().toLocaleString()} &nbsp;·&nbsp; Confidential</div>
      </body></html>
    `);

    win.document.close();
    win.print();
  };

  const handlePrintAllReports = () => {
    const generatedAt = new Date().toLocaleString();
    const reportSections = REPORT_TYPES.map(rt => {
      const rows = getFilteredRowsForType(rt.value);
      const sectionCols = getPrintableColumns(rt.value, rows);
      const tableRows = rows.length > 0
        ? rows.map(row => `
            <tr>
              ${sectionCols.map(col => `<td>${escapeHtml(formatValue(col, row[col]))}</td>`).join('')}
            </tr>
          `).join('')
        : `<tr><td colspan="${sectionCols.length || 1}" class="empty">No records in the selected date range.</td></tr>`;

      return `
        <section class="report-section">
          <div class="section-title">
            <h2>${escapeHtml(rt.label)}</h2>
            <span>${rows.length} record${rows.length === 1 ? '' : 's'}</span>
          </div>
          <table>
            <thead>
              <tr>${sectionCols.map(col => `<th>${escapeHtml(labelize(col))}</th>`).join('')}</tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>
      `;
    }).join('');

    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return;

    win.document.write(`
      <html><head><title>All HRIS Reports</title>
      <style>
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          body { padding: 0; }
          .report-section { break-inside: avoid; page-break-inside: avoid; }
        }
        body { font-family: Arial, sans-serif; padding: 24px; font-size: 10px; color: #1b1b1b; }
        .cover { border-bottom: 3px solid #2e7d32; margin-bottom: 18px; padding-bottom: 12px; }
        h1 { color: #1f7a46; margin: 0 0 6px; font-size: 22px; }
        h2 { color: #1f7a46; margin: 0; font-size: 15px; }
        p { color: #555; margin: 0; }
        .report-section { margin: 18px 0 26px; }
        .section-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
        .section-title span { color: #1f7a46; font-weight: 700; border: 1px solid #a9dfb6; border-radius: 999px; padding: 3px 8px; }
        table { width: 100%; border-collapse: collapse; table-layout: auto; }
        th { background: #2e7d32; color: white; padding: 6px; text-align: left; font-size: 9px; overflow-wrap: anywhere; }
        td { padding: 5px 6px; border-bottom: 1px solid #ddd; font-size: 9px; vertical-align: top; overflow-wrap: anywhere; }
        tr:nth-child(even) td { background: #f5f5f5; }
        .empty { color: #777; text-align: center; font-style: italic; }
        .footer { color: #777; font-size: 9px; text-align: center; margin-top: 20px; }
      </style></head><body>
      <div class="cover">
        <h1>Buenaventura Estate HRIS - All Reports</h1>
        <p>Period: ${escapeHtml(dateFrom)} to ${escapeHtml(dateTo)} | Generated: ${escapeHtml(generatedAt)}</p>
      </div>
      ${reportSections}
      <div class="footer">Buenaventura Estate HRIS | Generated: ${escapeHtml(generatedAt)} | Confidential</div>
      </body></html>
    `);

    win.document.close();
    win.print();
  };


  const totalLoadedRecords = Object.values(allData).reduce<number>((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
  const totalFilteredRecords = REPORT_TYPES.reduce((sum, rt) => sum + getFilteredRowsForType(rt.value).length, 0);
  const reportStats = [
    {
      label: 'Current Report',
      value: filtered.length,
      caption: `${selected.label} records in selected date range`,
      icon: <Assessment fontSize="small" />,
    },
    {
      label: 'Loaded Records',
      value: totalLoadedRecords,
      caption: 'Total records loaded across all report modules',
      icon: <Dataset fontSize="small" />,
    },
    {
      label: 'Report Types',
      value: REPORT_TYPES.length,
      caption: 'Available HRIS report categories',
      icon: <GridView fontSize="small" />,
    },
    {
      label: 'Period Filter',
      value: `${dateFrom.slice(5)} → ${dateTo.slice(5)}`,
      caption: 'Active date range used for preview, print, and CSV export',
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
            <Chip
              icon={<BarChartIcon sx={{ fontSize: 16 }} />}
              label="Reports Workspace"
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
              Reports
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              Generate, print, and export HRIS reports in a clean, organized reporting workspace.
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
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              Choose a report type and date range before printing or exporting.
            </Typography>
          </Box>
        </Box>

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              select
              label="Report Type"
              value={reportType}
              onChange={e => setReportType(e.target.value)}
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
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
          <Grid size={{ xs: 12, md: 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<RestartAlt />}
              sx={{ ...pillButtonSx, height: '56px', borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
              onClick={() => {
                setDateFrom('2026-01-01');
                setDateTo('2026-12-31');
              }}
            >
              Reset
            </Button>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2, borderColor: GREEN_UI.border }} />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
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
            startIcon={<FileDownload />}
            onClick={exportCSV}
            disabled={loadingAll || filtered.length === 0}
            sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: '#ffffff' }}
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
                onClick={() => setReportType(rt.value)}
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
                        <Typography variant="caption" sx={{ color: active ? 'rgba(255,255,255,0.76)' : GREEN_UI.muted }}>
                          Report category
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
                {selected.label} — Data Preview
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Previewed records are the same records used for printing and CSV export.
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
            <div ref={printRef}>
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
