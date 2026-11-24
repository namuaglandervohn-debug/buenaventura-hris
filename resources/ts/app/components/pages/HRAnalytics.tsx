import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert, Box, Card, CardContent, CircularProgress, FormControl, Grid,
  InputLabel, MenuItem, Paper, Select, Stack, Typography,
} from '../bootstrap';
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { supabase } from '../../lib/supabaseClient';
import { OUTLETS } from '../../lib/constants';

type Row = Record<string, any>;
type AnalyticsData = {
  employees: Row[];
  evaluations: Row[];
  requests: Row[];
  applicants: Row[];
  userAccounts: Row[];
  demoRecords: Row[];
};

const GREEN = '#197a49';
const MUTED = '#718176';
const BORDER = '#e3eee4';
const COLORS = ['#197a49', '#37a66b', '#e3ad45', '#c95c54', '#5b8cbd', '#83c996'];
const REPORTING_YEARS = [2026, 2025, 2024];
const OUTLET_COLORS = new Map([
  ['maria clara resort', '#3b82c4'],
  ['maria clara restaurant', '#37a66b'],
  ['buenaventura café', '#e3ad45'],
]);
const EMPTY: AnalyticsData = { employees: [], evaluations: [], requests: [], applicants: [], userAccounts: [], demoRecords: [] };
const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
const outletColor = (name: string) => OUTLET_COLORS.get(normalized(name)) ?? MUTED;
const number = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/[,%₱]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateOnly = (value: unknown) => String(value ?? '').slice(0, 10);
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const getMonthOptions = () => Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2000, index, 1)),
}));
const sameMonth = (value: unknown, month: string) => dateOnly(value).slice(0, 7) === month;
const outletOf = (row: Row, employeeOutlets: Map<string, string>) =>
  String(row.outlet || employeeOutlets.get(String(row.employee_id ?? '')) || 'Unassigned').trim() || 'Unassigned';
const validEvaluation = (row: Row) => ['approved', 'reviewed', 'completed'].includes(normalized(row.status));
const requestStatus = (value: unknown) => {
  const status = normalized(value);
  if (status.includes('approv')) return 'Approved';
  if (status.includes('reject') || status.includes('disapprov') || status.includes('declin')) return 'Rejected';
  return 'Pending';
};
const recruitmentStatus = (row: Row) => {
  const status = normalized(row.hiring_decision || row.status);
  if (status.includes('withdraw')) return 'Withdrawn';
  if (status.includes('reject') || status.includes('not qualified') || status.includes('not hired')) return 'Rejected';
  if (status.includes('interview')) return 'For interview';
  if (status === 'hired' || (status.includes('hired') && !status.includes('not hired'))) return 'Hired';
  return 'Pending review';
};

function ChartCard({ title, subtitle, children, height = 270 }: { title: string; subtitle?: string; children: ReactNode; height?: number }) {
  return (
    <Paper elevation={0} sx={{ height: '100%', p: { xs: 1.75, sm: 2.25 }, borderRadius: '22px', border: `1px solid ${BORDER}`, bgcolor: 'rgba(255,255,255,.94)', boxShadow: '0 12px 30px rgba(43,91,55,.07)' }}>
      <Typography variant="subtitle1" fontWeight={750} sx={{ color: '#1e2d24' }}>{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      <Box sx={{ width: '100%', height, mt: 1.5, position: 'relative' }}>{children}</Box>
    </Paper>
  );
}

function EmptyChart({ show, message = 'No records for this selection' }: { show: boolean; message?: string }) {
  return show ? <Box sx={{ position: 'absolute', inset: 0, zIndex: 1, display: 'grid', placeItems: 'center', color: MUTED, fontSize: '.9rem', pointerEvents: 'none' }}>{message}</Box> : null;
}

function MetricCard({ label, value, color = GREEN }: { label: string; value: string; color?: string }) {
  return (
    <Card elevation={0} sx={{ height: '100%', border: `1px solid ${BORDER}`, borderRadius: '18px', bgcolor: 'rgba(255,255,255,.94)' }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="body2" color="text.secondary" fontWeight={650}>{label}</Typography>
        <Typography variant="h4" fontWeight={800} sx={{ color, mt: .5 }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

type AttendanceTotal = { day_number: number; present: number; late: number; absent: number; includes_demo: boolean };

export default function HRAnalytics() {
  const monthOptions = useMemo(getMonthOptions, []);
  const today = new Date();
  const currentYear = today.getFullYear();
  const [reportingYear, setReportingYear] = useState(
    REPORTING_YEARS.find(year => year <= currentYear) ?? REPORTING_YEARS[REPORTING_YEARS.length - 1],
  );
  const [reportingMonth, setReportingMonth] = useState(today.getMonth() + 1);
  const month = `${reportingYear}-${String(reportingMonth).padStart(2, '0')}`;
  const [outlet, setOutlet] = useState('All Outlets');
  const [data, setData] = useState<AnalyticsData>(EMPTY);
  const [loadedMonth, setLoadedMonth] = useState('');
  const [loading, setLoading] = useState(true);
  const [monthlyRefresh, setMonthlyRefresh] = useState(0);
  const [attendanceRefresh, setAttendanceRefresh] = useState(0);
  const [attendance, setAttendance] = useState<{ scope: string; rows: AttendanceTotal[]; failed?: boolean }>();
  const attendanceScope = `${month}:${outlet}`;
  const reportMonthLabel = `${monthOptions[reportingMonth - 1].label} ${reportingYear}`;
  const visibleMonth = loadedMonth || month;

  useEffect(() => {
    let monthlyTimer: number | undefined;
    let attendanceTimer: number | undefined;
    const refreshMonthly = () => {
      window.clearTimeout(monthlyTimer);
      monthlyTimer = window.setTimeout(() => setMonthlyRefresh(value => value + 1), 200);
    };
    const refreshAttendance = () => {
      window.clearTimeout(attendanceTimer);
      attendanceTimer = window.setTimeout(() => setAttendanceRefresh(value => value + 1), 200);
    };
    const refreshBoth = () => { refreshMonthly(); refreshAttendance(); };
    const channel = supabase.channel('hr-analytics-live-data');
    ['employee_evaluations', 'employee_requests', 'applicants'].forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshMonthly);
    });
    ['employees', 'user_accounts', 'hr_analytics_demo_records'].forEach(table => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, refreshBoth);
    });
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, refreshAttendance);
    channel.subscribe();
    window.addEventListener('focus', refreshBoth);
    return () => {
      window.clearTimeout(monthlyTimer);
      window.clearTimeout(attendanceTimer);
      window.removeEventListener('focus', refreshBoth);
      void supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const { data: rows, error } = await supabase.rpc('hris_analytics_daily_attendance', {
          report_year: reportingYear,
          report_month: reportingMonth,
          report_outlet: outlet === 'All Outlets' ? null : outlet,
        }).abortSignal(controller.signal);
        if (error) throw error;
        if (!controller.signal.aborted) setAttendance({ scope: attendanceScope, rows: rows ?? [] });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Attendance analytics could not load:', error);
        setAttendance(previous => ({
          scope: attendanceScope,
          rows: previous?.scope === attendanceScope ? previous.rows : [],
          failed: true,
        }));
      }
    };
    void load();
    return () => controller.abort();
  }, [reportingYear, reportingMonth, outlet, attendanceScope, attendanceRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    const dateFrom = `${reportingYear}-01-01`;
    const lastDay = new Date(reportingYear, reportingMonth, 0).getDate();
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
    const loadRows = async (page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>) => {
      const rows: Row[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const result = await page(from, from + pageSize - 1);
        if (result.error) throw result.error;
        rows.push(...(result.data ?? []));
        if ((result.data ?? []).length < pageSize) break;
      }
      return { data: rows, error: null };
    };
    const load = async () => {
      setLoading(true);
      const sources: Array<[keyof AnalyticsData, PromiseLike<any>]> = [
        ['employees', supabase.from('employees').select('employee_id,first_name,middle_name,last_name,suffix,outlet,status,department,position,hire_date').abortSignal(controller.signal)],
        ['evaluations', supabase.from('employee_evaluations').select('employee_id,employee_name,outlet,evaluation_period_end,final_weighted_score,status').abortSignal(controller.signal)],
        ['requests', supabase.from('employee_requests').select('employee_id,request_type,status,created_at,start_date').abortSignal(controller.signal)],
        ['applicants', supabase.from('applicants').select('applicant_id,status,hiring_decision,created_at').abortSignal(controller.signal)],
        ['userAccounts', supabase.from('user_accounts').select('employee_id,applicant_id,outlet').abortSignal(controller.signal)],
        ['demoRecords', loadRows((from, to) => supabase.from('hr_analytics_demo_records')
          .select('seed_key,record_type,employee_id,outlet,record_date,status,score,request_type')
          .gte('record_date', dateFrom)
          .lte('record_date', monthEnd)
          .neq('record_type', 'attendance')
          .or(`record_type.eq.employee_outlet,record_date.gte.${month}-01`)
          .order('seed_key')
          .range(from, to)
          .abortSignal(controller.signal))],
      ];
      const results = await Promise.allSettled(sources.map(([, query]) => query));
      if (controller.signal.aborted) return;
      const next: AnalyticsData = { ...EMPTY };
      const failures: string[] = [];
      results.forEach((result, index) => {
        const key = sources[index][0];
        if (result.status === 'rejected' || result.value.error) {
          failures.push({ employees: 'Employees', evaluations: 'Performance', requests: 'Requests', applicants: 'Recruitment', userAccounts: 'Outlet assignments', demoRecords: 'Analytics demo data' }[key]);
          return;
        }
        next[key] = result.value.data ?? [];
      });
      setData(next);
      setLoadedMonth(month);
      if (failures.length) console.warn('Some HR analytics sources could not load:', failures);
      setLoading(false);
    };
    void load();
    return () => controller.abort();
  }, [month, reportingYear, reportingMonth, monthlyRefresh]);

  const employeeOutlets = useMemo(() => {
    const map = new Map(data.employees.map(row => [String(row.employee_id ?? ''), String(row.outlet ?? 'Unassigned')]));
    data.userAccounts.forEach(row => {
      if (row.employee_id && row.outlet) map.set(String(row.employee_id), String(row.outlet));
    });
    return map;
  }, [data.employees, data.userAccounts]);
  const analyticsEmployeeOutlets = useMemo(() => {
    const map = new Map(employeeOutlets);
    data.demoRecords.filter(row => row.record_type === 'employee_outlet' && row.employee_id && row.outlet)
      .forEach(row => map.set(String(row.employee_id), String(row.outlet)));
    return map;
  }, [employeeOutlets, data.demoRecords]);
  const applicantOutlets = useMemo(() => new Map(data.userAccounts.filter(row => row.applicant_id && row.outlet).map(row => [String(row.applicant_id), String(row.outlet)])), [data.userAccounts]);
  const inOutlet = (row: Row) => outlet === 'All Outlets' || outletOf(row, employeeOutlets).toLowerCase() === outlet.toLowerCase();
  const demoEvaluations: Row[] = data.demoRecords.filter(row => row.record_type === 'performance').map(row => ({
    employee_id: row.employee_id, outlet: row.outlet, evaluation_period_end: row.record_date,
    final_weighted_score: row.score, status: row.status,
  }));
  const demoRequests: Row[] = data.demoRecords.filter(row => row.record_type === 'leave_request').map(row => ({
    employee_id: row.employee_id, outlet: row.outlet, request_type: row.request_type,
    status: row.status, created_at: row.record_date,
  }));
  const demoApplicants = data.demoRecords.filter(row => row.record_type === 'recruitment').map(row => ({
    applicant_id: row.seed_key, outlet: row.outlet, status: row.status, created_at: row.record_date,
  }));
  const monthEvaluations = [...data.evaluations, ...demoEvaluations].filter(row => sameMonth(row.evaluation_period_end, visibleMonth) && validEvaluation(row) && inOutlet(row));
  const monthRequests = [...data.requests, ...demoRequests].filter(row => sameMonth(row.created_at || row.start_date, visibleMonth) && normalized(row.request_type).includes('leave') && inOutlet(row));
  const monthApplicants = [...data.applicants, ...demoApplicants].filter(row => sameMonth(row.created_at, visibleMonth) && (outlet === 'All Outlets' || String(row.outlet || applicantOutlets.get(String(row.applicant_id ?? '')) || '').toLowerCase() === outlet.toLowerCase()));
  const attendanceResult = attendance?.scope === attendanceScope ? attendance : undefined;
  const daysInMonth = new Date(reportingYear, reportingMonth, 0).getDate();
  const attendanceByDay = attendanceResult?.rows.length
    ? attendanceResult.rows
    : Array.from({ length: daysInMonth }, (_, index) => ({ day_number: index + 1 }));
  const hasAttendance = attendanceResult?.rows.some(row => row.present + row.late + row.absent > 0);
  const attendanceSubtitle = [
    attendanceResult?.rows.some(row => row.includes_demo) && 'Includes demo attendance',
    attendanceResult?.failed && hasAttendance && 'Showing the last loaded totals',
  ].filter(Boolean).join(' · ');

  const employeeNames = useMemo(() => new Map(data.employees.map(row => [
    String(row.employee_id),
    [row.first_name, row.middle_name, row.last_name, row.suffix]
      .map(part => String(part ?? '').trim()).filter(Boolean).join(' '),
  ])), [data.employees]);

  const performanceByOutlet = useMemo(() => {
    type Performer = { name: string; score: number };
    type OutletPerformance = { total: number; count: number; topPerformer?: Performer };
    const grouped = new Map<string, OutletPerformance>();
    monthEvaluations.forEach(row => {
      const key = outletOf(row, employeeOutlets);
      const current: OutletPerformance = grouped.get(key) ?? { total: 0, count: 0 };
      const id = String(row.employee_id ?? '');
      const name = employeeNames.get(id) || String(row.employee_name ?? '').trim();
      const score = number(row.final_weighted_score);
      const top = current.topPerformer;
      if (name && row.final_weighted_score != null && (
        !top || score > top.score || (score === top.score && name.localeCompare(top.name) < 0)
      )) {
        current.topPerformer = { name, score };
      }
      current.total += score;
      current.count += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped, ([name, result]) => ({
      name,
      average: Number((result.total / result.count).toFixed(1)),
      topPerformer: result.topPerformer,
    })).sort((a, b) => b.average - a.average);
  }, [monthEvaluations, employeeOutlets, employeeNames]);

  const recruitment = useMemo(() => {
    const statuses = ['For interview', 'Hired', 'Pending review', 'Rejected', 'Withdrawn'];
    const counts = new Map(statuses.map(status => [status, 0]));
    monthApplicants.forEach(row => {
      const status = recruitmentStatus(row);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });
    return statuses.map(name => ({ name, value: counts.get(name) ?? 0 })).filter(item => item.value > 0);
  }, [monthApplicants]);

  const leaveByOutlet = useMemo(() => {
    const rows = new Map<string, { Approved: number; Pending: number; Rejected: number }>();
    monthRequests.forEach(row => {
      const name = outletOf(row, employeeOutlets);
      const current = rows.get(name) ?? { Approved: 0, Pending: 0, Rejected: 0 };
      current[requestStatus(row.status)] += 1;
      rows.set(name, current);
    });
    return Array.from(rows, ([name, counts]) => ({ name, ...counts })).sort((a, b) => (b.Approved + b.Pending + b.Rejected) - (a.Approved + a.Pending + a.Rejected));
  }, [monthRequests, employeeOutlets]);

  const employeeDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    data.employees.filter(row => {
      const hireDate = dateOnly(row.hire_date);
      return hireDate !== ''
        && sameMonth(hireDate, visibleMonth)
        && (outlet === 'All Outlets' || outletOf(row, analyticsEmployeeOutlets).toLowerCase() === outlet.toLowerCase());
    }).forEach(row => {
      const name = outletOf(row, analyticsEmployeeOutlets);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    demoApplicants.filter(row =>
      sameMonth(row.created_at, visibleMonth)
      && recruitmentStatus(row) === 'Hired'
      && (outlet === 'All Outlets' || String(row.outlet ?? '').toLowerCase() === outlet.toLowerCase())
    ).forEach(row => {
      const name = outletOf(row, analyticsEmployeeOutlets);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    return Array.from(counts, ([name, employees]) => ({ name, employees })).sort((a, b) => b.employees - a.employees);
  }, [data.employees, demoApplicants, analyticsEmployeeOutlets, outlet, visibleMonth]);

  const averagePerformance = monthEvaluations.length ? monthEvaluations.reduce((sum, row) => sum + number(row.final_weighted_score), 0) / monthEvaluations.length : null;
  const tooltip = { contentStyle: { borderRadius: 12, borderColor: BORDER }, labelStyle: { color: '#1e2d24', fontWeight: 700 } };
  const monthLabel = `${monthOptions[Number(visibleMonth.slice(5)) - 1]?.label ?? ''} ${visibleMonth.slice(0, 4)}`.trim();

  return (
    <Box sx={{ mt: 2.5, mb: 2.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" gap={1.5} sx={{ mb: 1.75 }}>
        <Box>
          <Typography variant="h5" fontWeight={800} sx={{ color: '#1e2d24', letterSpacing: '-.025em' }}>HR Analytics</Typography>
          <Typography variant="body2" color="text.secondary">{monthLabel}{outlet !== 'All Outlets' ? ` · ${outlet}` : ' · All outlets'}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <FormControl size="small" sx={{ minWidth: 190, bgcolor: 'white' }}>
            <InputLabel id="analytics-outlet-label">Outlet</InputLabel>
            <Select labelId="analytics-outlet-label" value={outlet} label="Outlet" onChange={event => setOutlet(event.target.value)}>
              <MenuItem value="All Outlets">All Outlets</MenuItem>
              {OUTLETS.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 155, bgcolor: 'white' }}>
            <InputLabel id="analytics-month-label">Reporting month</InputLabel>
            <Select labelId="analytics-month-label" value={reportingMonth} label="Reporting month" onChange={event => setReportingMonth(Number(event.target.value))}>
              {monthOptions.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 115, bgcolor: 'white' }}>
            <InputLabel id="analytics-year-label">Year</InputLabel>
            <Select labelId="analytics-year-label" value={reportingYear} label="Year" onChange={event => setReportingYear(Number(event.target.value))}>
              {REPORTING_YEARS.map(year => <MenuItem key={year} value={year}>{year}</MenuItem>)}
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      {loading && <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ mb: 1.5, borderRadius: '14px' }}>Loading HR analytics…</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard label="Employees" value={!loadedMonth ? '…' : data.employees.filter(row => outlet === 'All Outlets' || outletOf(row, analyticsEmployeeOutlets).toLowerCase() === outlet.toLowerCase()).length.toLocaleString()} /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard label="Average performance" value={!loadedMonth ? '…' : averagePerformance === null ? '—' : `${averagePerformance.toFixed(1)}%`} color="#5b8cbd" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard label="Applicants this month" value={!loadedMonth ? '…' : monthApplicants.length.toLocaleString()} color="#bd8120" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard label="Leave requests this month" value={!loadedMonth ? '…' : monthRequests.length.toLocaleString()} color="#8b5ad8" /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title={`Daily Attendance Trends · ${reportMonthLabel}`} subtitle={attendanceSubtitle}>
            <EmptyChart show={!hasAttendance} message={attendanceResult?.failed ? 'Attendance could not load' : attendanceResult ? undefined : 'Loading attendance…'} />
            <ResponsiveContainer width="100%" height="100%"><LineChart data={attendanceByDay} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
              <XAxis dataKey="day_number" interval="preserveStartEnd" minTickGap={12} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis width={0} allowDecimals={false} tick={false} axisLine={false} tickLine={false} />
              <Tooltip {...tooltip} labelFormatter={day => `${monthOptions[reportingMonth - 1].label} ${day}`} />
              <Legend />
              <Line type="monotone" dataKey="present" name="On time" stroke="#37a66b" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="late" name="Late" stroke="#e3ad45" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="absent" name="Absent" stroke="#c95c54" strokeWidth={2.5} dot={false} />
            </LineChart></ResponsiveContainer>
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Average Performance by Outlet">
            {!loading && <EmptyChart show={!performanceByOutlet.length} />}
            <ResponsiveContainer width="100%" height="100%"><BarChart data={performanceByOutlet} margin={{ top: 60, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} /><XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} /><YAxis domain={[0, 100]} tick={{ fill: MUTED, fontSize: 12 }} />
              <Tooltip {...tooltip} />
              <Bar dataKey="average" name="Average score (%)" radius={[5, 5, 0, 0]}>
                {performanceByOutlet.map(entry => <Cell key={entry.name} fill={outletColor(entry.name)} />)}
                {!loading && (
                  <LabelList content={({ index, viewBox }) => {
                    const performer = index == null ? undefined : performanceByOutlet[index]?.topPerformer;
                    if (!performer || !viewBox || !('width' in viewBox)) return null;
                    const { x = 0, y = 0, width = 0 } = viewBox;
                    const labelWidth = Math.min(width, 180);
                    const labelHeight = 52;
                    return (
                      <foreignObject
                        x={x + (width - labelWidth) / 2}
                        y={y - labelHeight - 4}
                        width={labelWidth}
                        height={labelHeight}
                        pointerEvents="none"
                      >
                        <Box sx={{
                          px: .25,
                          minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                          color: '#1e2d24', fontSize: '.7rem', lineHeight: 1.25, textAlign: 'center',
                          overflowWrap: 'anywhere',
                        }}>
                          <strong>{performer.name}</strong>
                          <Box component="span" sx={{ display: 'block' }}>{performer.score}%</Box>
                        </Box>
                      </foreignObject>
                    );
                  }} />
                )}
              </Bar>
            </BarChart></ResponsiveContainer>
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Recruitment Status">
            {!loading && <EmptyChart show={!recruitment.length} />}
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={recruitment} dataKey="value" nameKey="name" cx="50%" cy="46%" outerRadius={78} innerRadius={44} paddingAngle={3}>
              {recruitment.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
            </Pie><Tooltip {...tooltip} /><Legend verticalAlign="bottom" content={({ payload }) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: .75, px: 1, pt: .5 }}>
                {(payload ?? []).map((item: any) => {
                  const name = String(item.value ?? '');
                  const count = recruitment.find(row => row.name === name)?.value ?? 0;
                  return <Box key={name} sx={{ display: 'inline-flex', alignItems: 'center', gap: .5, px: .8, py: .3, borderRadius: 1, bgcolor: '#f5faf4', color: '#4f6254', fontSize: 11, whiteSpace: 'nowrap' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />{name}: {count}
                  </Box>;
                })}
              </Box>
            )} /></PieChart></ResponsiveContainer>
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <ChartCard title="Leave Requests by Outlet and Status">
            {!loading && <EmptyChart show={!leaveByOutlet.length} />}
            <ResponsiveContainer width="100%" height="100%"><BarChart data={leaveByOutlet} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} /><XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 12 }} /><Tooltip {...tooltip} /><Legend />
              <Bar dataKey="Approved" stackId="requests" fill="#37a66b" /><Bar dataKey="Pending" stackId="requests" fill="#e3ad45" /><Bar dataKey="Rejected" stackId="requests" fill="#c95c54" />
            </BarChart></ResponsiveContainer>
          </ChartCard>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <ChartCard title="Employees Hired This Month by Outlet">
            {!loading && <EmptyChart show={!employeeDistribution.length} />}
            <ResponsiveContainer width="100%" height="100%"><BarChart data={employeeDistribution} margin={{ top: 8, right: 16, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} /><XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fill: MUTED, fontSize: 12 }} /><Tooltip {...tooltip} /><Bar dataKey="employees" name="Hired employees" fill={GREEN} radius={[5, 5, 0, 0]}>
                {employeeDistribution.map(entry => <Cell key={entry.name} fill={outletColor(entry.name)} />)}
              </Bar>
            </BarChart></ResponsiveContainer>
          </ChartCard>
        </Grid>
      </Grid>
    </Box>
  );
}
