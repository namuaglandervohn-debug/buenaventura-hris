import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  Payments,
  TaskAlt,
  Timelapse,
  AccountBalanceWallet,
  Refresh,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

interface PayrollSummaryRow {
  id?: string | null;
  payroll_id: string;
  period_start?: string | null;
  period_end?: string | null;
  cutoff_label?: string | null;
  total_employees?: number | string | null;
  status?: string | null;
  endorsed_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface PayrollItemRow {
  id?: string | null;
  payroll_item_id: string;
  payroll_id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  position?: string | null;
  outlet?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface PayrollPreview {
  id: string;
  displayId: string;
  payrollId: string;
  employee: string;
  employeeId: string;
  position: string;
  outlet: string;
  period: string;
  createdAt: string;
  status: 'For Review' | 'Processed';
}

interface DashboardStats {
  payrollForReview: number;
  payrollReleased: number;
  payrollItemsQueued: number;
}

const DEFAULT_STATS: DashboardStats = {
  payrollForReview: 0,
  payrollReleased: 0,
  payrollItemsQueued: 0,
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
  amber: '#d9a441',
  teal: '#2f8f8b',
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
  fontWeight: 700,
  px: 2,
};

const accountingStatusChipSx = (status: PayrollPreview['status']) => {
  const isProcessed = status === 'Processed';

  return {
    bgcolor: isProcessed ? '#e5f8e9' : '#fff7e0',
    color: isProcessed ? '#217a43' : '#9b6b00',
    borderColor: isProcessed ? '#a9dfb6' : '#f5d786',
    fontWeight: 600,
  };
};

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const parsed = Number(String(value ?? '').replace(/[₱,%]/g, '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCurrency = (value: unknown): string =>
  `₱${toNumber(value).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (value?: string | null): string => {
  if (!value) return '—';

  const dateOnly = String(value).slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);

  if (Number.isNaN(date.getTime())) return dateOnly;

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
};

const formatPeriod = (summary?: PayrollSummaryRow): string => {
  if (!summary) return '—';
  if (summary.cutoff_label?.trim()) return summary.cutoff_label.trim();

  if (summary.period_start && summary.period_end) {
    return `${formatDate(summary.period_start)} – ${formatDate(summary.period_end)}`;
  }

  return formatDate(summary.period_start ?? summary.period_end ?? null);
};

const isPayrollForAccountingReview = (status: unknown): boolean => {
  const normalized = normalizeText(status);

  // Reviewed = forwarded by HR to Accounting/Finance.
  // Approved = already processed/approved but still not released.
  return normalized === 'reviewed' || normalized === 'approved';
};

const isPayrollReleased = (status: unknown): boolean => {
  const normalized = normalizeText(status);

  // Endorsed is the status used by PayrollComputation when Accounting releases payroll records.
  // Exported is also treated as released because the schema allows it as a final payroll status.
  return normalized === 'endorsed' || normalized === 'exported';
};

const uiStatusFromDb = (status: unknown): PayrollPreview['status'] => {
  const normalized = normalizeText(status);
  return normalized === 'approved' ? 'Processed' : 'For Review';
};

const buildDisplayIds = (items: PayrollItemRow[], summariesById: Map<string, PayrollSummaryRow>): Map<string, string> => {
  const sorted = [...items].sort((a, b) => {
    const summaryA = summariesById.get(a.payroll_id);
    const summaryB = summariesById.get(b.payroll_id);
    const dateA = String(summaryA?.period_start ?? a.created_at ?? '');
    const dateB = String(summaryB?.period_start ?? b.created_at ?? '');

    return dateA.localeCompare(dateB) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
  });

  const counters: Record<string, number> = {};
  const displayIds = new Map<string, string>();

  sorted.forEach((item) => {
    const summary = summariesById.get(item.payroll_id);
    const sourceDate = String(summary?.period_start ?? item.created_at ?? new Date().toISOString());
    const year = sourceDate.slice(0, 4) || String(new Date().getFullYear());

    counters[year] = (counters[year] ?? 0) + 1;
    displayIds.set(item.payroll_item_id, `PAYROLL-${year}-${String(counters[year]).padStart(4, '0')}`);
  });

  return displayIds;
};

const fetchPayrollSummaries = async (): Promise<PayrollSummaryRow[]> => {
  const { data, error } = await supabase
    .from('payroll_summaries')
    .select('id, payroll_id, period_start, period_end, cutoff_label, total_employees, status, endorsed_at, updated_at, created_at')
    .order('period_start', { ascending: false });

  if (error) throw error;

  return (data ?? []) as PayrollSummaryRow[];
};

const fetchPayrollItems = async (payrollIds: string[]): Promise<PayrollItemRow[]> => {
  if (payrollIds.length === 0) return [];

  const { data, error } = await supabase
    .from('payroll_items')
    .select('id, payroll_item_id, payroll_id, employee_id, employee_name, position, outlet, created_at, updated_at')
    .in('payroll_id', payrollIds)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []) as PayrollItemRow[];
};

const resolveAccountingDashboardData = async (): Promise<{
  stats: DashboardStats;
  forReview: PayrollPreview[];
}> => {
  const summaries = await fetchPayrollSummaries();
  const summariesById = new Map<string, PayrollSummaryRow>(summaries.map((summary) => [summary.payroll_id, summary]));

  const reviewPayrollIds = summaries
    .filter((summary) => isPayrollForAccountingReview(summary.status))
    .map((summary) => summary.payroll_id);

  const releasedPayrollIds = summaries
    .filter((summary) => isPayrollReleased(summary.status))
    .map((summary) => summary.payroll_id);

  const allRelevantIds = [...new Set([...reviewPayrollIds, ...releasedPayrollIds])];
  const relevantItems = await fetchPayrollItems(allRelevantIds);

  const reviewIdSet = new Set(reviewPayrollIds);
  const releasedIdSet = new Set(releasedPayrollIds);

  const reviewItems = relevantItems.filter((item) => reviewIdSet.has(item.payroll_id));
  const releasedItems = relevantItems.filter((item) => releasedIdSet.has(item.payroll_id));
  const displayIds = buildDisplayIds(relevantItems, summariesById);

  const forReview = reviewItems
    .map((item): PayrollPreview => {
      const summary = summariesById.get(item.payroll_id);

      return {
        id: item.payroll_item_id,
        displayId: displayIds.get(item.payroll_item_id) ?? item.payroll_item_id,
        payrollId: item.payroll_id,
        employee: String(item.employee_name ?? 'Unnamed Employee').trim() || 'Unnamed Employee',
        employeeId: String(item.employee_id ?? '').trim() || '—',
        position: String(item.position ?? '').trim() || '—',
        outlet: String(item.outlet ?? '').trim() || '—',
        period: formatPeriod(summary),
        createdAt: String(item.created_at ?? ''),
        status: uiStatusFromDb(summary?.status),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return {
    stats: {
      payrollForReview: reviewItems.length,
      payrollReleased: releasedItems.length,
      payrollItemsQueued: reviewItems.length + releasedItems.length,
    },
    forReview,
  };
};

export default function AccountingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [forReview, setForReview] = useState<PayrollPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const loadDashboard = useCallback(async (showLoading = false) => {
    if (showLoading) setRefreshing(true);
    setError(null);

    try {
      const nextData = await resolveAccountingDashboardData();

      if (!mountedRef.current) return;

      setStats(nextData.stats);
      setForReview(nextData.forReview);
      setLastUpdated(new Date());
    } catch (dashboardError: any) {
      console.error('Accounting dashboard error:', dashboardError);

      if (!mountedRef.current) return;

      setError(dashboardError?.message ?? 'Could not load Accounting & Finance dashboard indicators.');
    } finally {
      if (!mountedRef.current) return;

      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    loadDashboard(false);

    const channel = supabase
      .channel('accounting-dashboard-live-indicators')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_summaries' }, () => loadDashboard(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payroll_items' }, () => loadDashboard(false))
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [loadDashboard]);

  const statCards = useMemo(() => [
    {
      title: 'Payroll For Review',
      value: loading ? '…' : String(stats.payrollForReview),
      icon: <Timelapse />,
      color: GREEN_UI.amber,
      softColor: '#fff7e0',
    },
    {
      title: 'Payroll Released',
      value: loading ? '…' : String(stats.payrollReleased),
      icon: <TaskAlt />,
      color: GREEN_UI.greenDark,
      softColor: GREEN_UI.greenSoft,
    },
    {
      title: 'Payroll Items Queued',
      value: loading ? '...' : String(stats.payrollForReview + stats.payrollReleased),
      icon: <AccountBalanceWallet />,
      color: GREEN_UI.teal,
      softColor: '#e8f7f6',
    },
  ], [loading, stats.payrollForReview, stats.payrollReleased]);


  return (
    <Box
      sx={{
        minHeight: '100%',
        p: { xs: 2, sm: 3, md: 4 },
        background: GREEN_UI.pageBg,
        color: GREEN_UI.text,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          ...softCardSx,
          overflow: 'hidden',
          position: 'relative',
          mb: 3,
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
            left: { xs: '72%', md: '46%' },
            bottom: -95,
            background: 'rgba(174, 222, 144, 0.18)',
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            p: { xs: 2.25, sm: 3, md: 3.5 },
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            alignItems: { xs: 'flex-start', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Chip
              icon={<AccountBalanceWallet sx={{ fontSize: 17 }} />}
              label="Accounting & Finance"
              size="small"
              sx={{
                mb: 1.5,
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                fontWeight: 600,
                border: `1px solid ${GREEN_UI.borderStrong}`,
                '& .MuiChip-icon': { color: GREEN_UI.greenDark },
              }}
            />
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                color: GREEN_UI.text,
                fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
                letterSpacing: '-0.04em',
                lineHeight: 1.05,
              }}
            >
              Accounting & Finance Dashboard
            </Typography>
            <Typography
               variant="body2" sx={{ color: GREEN_UI.muted, mt: 1, lineHeight: 1.7, maxWidth: 650 }}
            >
              Welcome, {(user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.email ?? 'Accounting Staff'} — monitor payroll reviews, releases, and payable totals for Buenaventura Estate.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {error && (
        <Alert
          severity="warning"
          sx={{
            mb: 3,
            borderRadius: '18px',
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: GREEN_UI.shadowSoft,
          }}
        >
          {error}
        </Alert>
      )}

      <Grid container spacing={{ xs: 2, md: 2.5 }} sx={{ mb: 3 }}>
        {statCards.map((stat, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, md: 4 }} sx={{ display: 'flex' }}>
            <Card
              elevation={0}
              sx={{
                ...innerCardSx,
                width: '100%',
                minHeight: 132,
                transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: GREEN_UI.shadow,
                  borderColor: GREEN_UI.borderStrong,
                },
              }}
            >
              <CardContent sx={{ height: '100%', p: { xs: 2, sm: 2.25 }, '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '18px',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: stat.softColor,
                      color: stat.color,
                      border: `1px solid ${GREEN_UI.border}`,
                      flexShrink: 0,
                      '& svg': { fontSize: 25 },
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Box
                    sx={{
                      width: 34,
                      height: 6,
                      mt: 1.25,
                      background: `linear-gradient(90deg, ${stat.color}, rgba(58, 168, 101, 0.08))`,
                    }}
                  />
                </Box>

                <Typography
                  fontWeight={700}
                  sx={{
                    mt: 2,
                    color: GREEN_UI.text,
                    fontSize: { xs: '1.45rem', sm: '1.6rem' },
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.value}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: GREEN_UI.muted,
                    mt: 0.45,
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.title}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 2.5, md: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            alignItems: { xs: 'stretch', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            mb: 2,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: '16px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: '#fff7e0',
                  color: GREEN_UI.amber,
                  border: `1px solid ${GREEN_UI.border}`,
                }}
              >
                <Timelapse fontSize="small" />
              </Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }}>
                Payroll Awaiting Release
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
              Shows payroll items with database status Reviewed or Approved.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<Payments />}
            onClick={() => navigate('/dashboard/payroll')}
            sx={{
              ...pillButtonSx,
              bgcolor: GREEN_UI.green,
              boxShadow: '0 12px 24px rgba(58, 168, 101, 0.22)',
              alignSelf: { xs: 'stretch', sm: 'center' },
              '&:hover': { bgcolor: GREEN_UI.greenDark },
            }}
          >
            Go to Payroll
          </Button>
        </Box>

        {loading ? (
          <Box
            sx={{
              ...innerCardSx,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.25,
              py: 5,
              color: GREEN_UI.muted,
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="body2" fontWeight={700}>
              Loading payroll records…
            </Typography>
          </Box>
        ) : forReview.length === 0 ? (
          <Box
            sx={{
              ...innerCardSx,
              textAlign: 'center',
              py: 5,
              px: 2,
            }}
          >
            <Box
              sx={{
                width: 62,
                height: 62,
                borderRadius: '22px',
                mx: 'auto',
                mb: 1.5,
                display: 'grid',
                placeItems: 'center',
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                border: `1px solid ${GREEN_UI.borderStrong}`,
              }}
            >
              <TaskAlt sx={{ fontSize: 34 }} />
            </Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              No payroll records awaiting release
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
              You are all caught up for now.
            </Typography>
          </Box>
        ) : (
          <>
            <TableContainer
              sx={{
                borderRadius: '20px',
                border: `1px solid ${GREEN_UI.border}`,
                overflowX: 'auto',
                background: 'rgba(255,255,255,0.72)',
              }}
            >
              <Table size="small">
                <TableHead
                  sx={{
                    '& .MuiTableCell-root': {
                      bgcolor: 'rgba(230, 248, 233, 0.72)',
                      color: GREEN_UI.greenDark,
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      borderBottom: `1px solid ${GREEN_UI.border}`,
                      whiteSpace: 'nowrap',
                    },
                  }}
                >
                  <TableRow>
                    <TableCell>Payroll ID</TableCell>
                    <TableCell>Employee</TableCell>
                    <TableCell>Position</TableCell>
                    <TableCell>Period</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody
                  sx={{
                    '& .MuiTableRow-root': {
                      transition: 'background 0.2s ease',
                    },
                    '& .MuiTableRow-root:hover': {
                      bgcolor: 'rgba(58, 168, 101, 0.045)',
                    },
                    '& .MuiTableCell-root': {
                      borderBottom: `1px solid ${GREEN_UI.border}`,
                      color: GREEN_UI.text,
                      fontSize: '0.87rem',
                    },
                    '& .MuiTableRow-root:last-child .MuiTableCell-root': {
                      borderBottom: 0,
                    },
                  }}
                >
                  {forReview.map((payroll) => (
                    <TableRow key={payroll.id} hover>
                      <TableCell>
                        <Chip
                          icon={<Payments sx={{ fontSize: 16 }} />}
                          label={payroll.displayId}
                          size="small"
                          sx={{
                            bgcolor: GREEN_UI.greenSoft,
                            color: GREEN_UI.greenDark,
                            border: `1px solid ${GREEN_UI.borderStrong}`,
                            fontWeight: 700,
                            '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>
                          {payroll.employee}
                        </Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                          {payroll.employeeId}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {payroll.position}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>
                          {payroll.period}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={payroll.status}
                          size="small"
                          variant="outlined"
                          sx={accountingStatusChipSx(payroll.status)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Box sx={{ mt: 2.25, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<AccountBalanceWallet />}
                onClick={() => navigate('/dashboard/payroll')}
                sx={{
                  ...pillButtonSx,
                  bgcolor: GREEN_UI.green,
                  boxShadow: '0 12px 24px rgba(58, 168, 101, 0.22)',
                  '&:hover': { bgcolor: GREEN_UI.greenDark },
                }}
              >
                Proceed to Payroll Release
              </Button>
            </Box>
          </>
        )}
      </Paper>
    </Box>
  );
}
