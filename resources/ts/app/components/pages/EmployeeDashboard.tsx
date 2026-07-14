import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Grid,
  Paper,
  Chip,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  CalendarMonth,
  Assignment,
  Payments,
  Fingerprint,
  DashboardRounded,
  ArrowForwardRounded,
  EventAvailableRounded,
  AccessTimeRounded,
  WalletRounded,
  FactCheckRounded,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

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

const softChipSx = {
  borderRadius: '12px',
  fontWeight: 600,
  bgcolor: GREEN_UI.greenSoft,
  color: GREEN_UI.greenDark,
  borderColor: GREEN_UI.borderStrong,
  '& .MuiChip-label': { px: 1.25 },
};

const getAttendanceChipSx = (status?: string) => {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized.includes('present')) {
    return { bgcolor: '#e5f8e9', color: '#217a43', borderColor: '#a9dfb6' };
  }

  if (normalized.includes('late')) {
    return { bgcolor: '#fff7e0', color: '#9b6b00', borderColor: '#f5d786' };
  }

  if (normalized.includes('absent')) {
    return { bgcolor: '#fdeaea', color: '#9c2f2f', borderColor: '#efb8b8' };
  }

  return { bgcolor: '#f4f7f3', color: '#5f6e63', borderColor: '#dce8da' };
};

const getRequestChipSx = (status?: string) => {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized.includes('approved') && !normalized.includes('supervisor')) {
    return { bgcolor: '#e5f8e9', color: '#217a43', borderColor: '#a9dfb6' };
  }

  if (normalized.includes('supervisor')) {
    return { bgcolor: '#e9f6ff', color: '#1d6f9c', borderColor: '#b7dff7' };
  }

  if (normalized.includes('disapproved') || normalized.includes('rejected') || normalized.includes('cancel')) {
    return { bgcolor: '#fdeaea', color: '#9c2f2f', borderColor: '#efb8b8' };
  }

  return { bgcolor: '#fff7e0', color: '#9b6b00', borderColor: '#f5d786' };
};

const formatPeso = (value: unknown) => {
  const amount = Number(String(value ?? '').replace(/[₱,]/g, ''));
  if (!Number.isFinite(amount)) return '₱0.00';
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mySchedule, setMySchedule] = useState<any | null>(null);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [myAttendance, setMyAttendance] = useState<any[]>([]);
  const [myPayslips, setMyPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.employeeId) {
        setMySchedule(null);
        setMyRequests([]);
        setMyPayslips([]);
        setMyAttendance([]);
        setLoading(false);
        return;
      }

      try {
        const employeeId = user.employeeId;
        const [scheduleRes, requestsRes, payrollRes, logsRes] = await Promise.all([
          supabase
            .from('schedule')
            .select('*')
            .eq('employee_id', employeeId)
            .order('week', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('employee_requests')
            .select('request_id, request_type, start_date, reason, status')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .from('payroll_items')
            .select('payroll_item_id, net_pay, payroll_id, created_at')
            .eq('employee_id', employeeId)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('attendance_logs')
            .select('log_id, attendance_date, raw_time_in, raw_time_out, time_in, time_out, total_hours, is_absent, is_late')
            .eq('employee_id', employeeId)
            .order('attendance_date', { ascending: false })
            .limit(7),
        ]);

        setMySchedule(scheduleRes.data ?? null);
        setMyRequests(
          (requestsRes.data ?? []).map((row) => ({
            id: row.request_id,
            type: row.request_type,
            date: row.start_date,
            reason: row.reason,
            status: row.status,
          }))
        );
        setMyPayslips(
          (payrollRes.data ?? []).map((row) => ({
            id: row.payroll_item_id,
            netPay: row.net_pay,
            period: row.payroll_id,
          }))
        );
        setMyAttendance(
          (logsRes.data ?? []).map((row) => ({
            id: row.log_id,
            date: row.attendance_date,
            timeIn: row.raw_time_in || row.time_in || '—',
            timeOut: row.raw_time_out || row.time_out || '—',
            totalHours: row.total_hours ?? '—',
            status: row.is_absent ? 'Absent' : row.is_late ? 'Late' : 'Present',
          }))
        );
      } catch (e) {
        console.error('Employee dashboard error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  const todayAtt = myAttendance.find(a => a.date === new Date().toISOString().split('T')[0]);
  const pendingReqs = myRequests.filter(r => r.status === 'Pending').length;
  const latestPayslip = myPayslips[myPayslips.length - 1];

  const statCards = [
    {
      title: 'Attendance Today',
      value: loading ? '…' : (todayAtt ? todayAtt.status : 'No entry'),
      icon: <Fingerprint />,
      helper: todayAtt ? `${todayAtt.timeIn || '—'} – ${todayAtt.timeOut || '—'}` : 'View your DTR for official records',
      color: '#2F8F8B',
      bg: '#e8f7f5',
    },
    {
      title: 'Active Schedule',
      value: loading ? '…' : (mySchedule ? (mySchedule.outlet ?? mySchedule.week ?? 'Assigned') : 'No schedule'),
      icon: <CalendarMonth />,
      helper: mySchedule ? (mySchedule.week ?? 'Latest assigned schedule') : 'No active schedule yet',
      color: GREEN_UI.greenDark,
      bg: GREEN_UI.greenSoft,
    },
    {
      title: 'Pending Requests',
      value: loading ? '…' : String(pendingReqs),
      icon: <Assignment />,
      helper: pendingReqs === 1 ? '1 request waiting for action' : `${pendingReqs} requests waiting for action`,
      color: '#9b6b00',
      bg: '#fff7e0',
    },
    {
      title: 'Latest Payslip',
      value: loading ? '...' : (latestPayslip ? 'Available' : 'No payslip'),
      icon: <Payments />,
      helper: latestPayslip ? 'Most recent released/encoded payslip' : 'No payslip available yet',
      color: '#6c3a8f',
      bg: '#f3eaf9',
    },
  ];


  return (
    <Box
      sx={{
        minHeight: '100%',
        mx: { xs: -2, sm: -3 },
        my: { xs: -2, sm: -3 },
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 2.5, sm: 3, md: 4 },
        background: GREEN_UI.pageBg,
        color: GREEN_UI.text,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          ...softCardSx,
          position: 'relative',
          overflow: 'hidden',
          p: { xs: 2.25, sm: 3, md: 3.5 },
          mb: 3,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 220,
            height: 220,
            borderRadius: '50%',
            bgcolor: 'rgba(58, 168, 101, 0.10)',
            right: -72,
            top: -112,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            width: 145,
            height: 145,
            borderRadius: '50%',
            bgcolor: 'rgba(47, 143, 139, 0.10)',
            right: 92,
            bottom: -82,
          }}
        />

        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
            gap: 2.5,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Chip
              icon={<DashboardRounded />}
              label="Employee Portal"
              variant="outlined"
              sx={{ ...softChipSx, mb: 1.5 }}
            />
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                color: GREEN_UI.text,
                letterSpacing: '-0.04em',
                fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
                lineHeight: 1.05,
              }}
            >
              Welcome back, {user?.name}! 👋
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: GREEN_UI.muted, mt: 1, maxWidth: 680, fontWeight: 500 }}
            >
              View your schedule, attendance, requests, payslips, evaluation, and profile in one clean workspace.
            </Typography>
          </Box>

          <Box
            sx={{
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', md: 'flex-end' },
            }}
          >
          </Box>
        </Box>

        {loading && <LinearProgress sx={{ mt: 2.5, bgcolor: '#e7f3e7', '& .MuiLinearProgress-bar': { bgcolor: GREEN_UI.green } }} />}
      </Paper>

      <Grid container spacing={{ xs: 2, md: 2.5 }} sx={{ mb: 3 }}>
        {statCards.map((stat, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, md: 4, lg: 3 }} sx={{ display: 'flex' }}>
            <Card
              elevation={0}
              sx={{
                ...softCardSx,
                width: '100%',
                minHeight: 152,
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover': {
                  transform: 'translateY(-3px)',
                  boxShadow: '0 24px 60px rgba(43, 91, 55, 0.13)',
                },
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.25 }, height: '100%', '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '18px',
                      bgcolor: stat.bg,
                      color: stat.color,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      '& svg': { fontSize: 25 },
                    }}
                  >
                    {stat.icon}
                  </Box>
                  <Chip
                    label={`0${index + 1}`}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontWeight: 600,
                      bgcolor: '#fbfef9',
                      borderColor: GREEN_UI.border,
                      color: GREEN_UI.muted,
                    }}
                  />
                </Box>

                <Typography
                  variant="h5"
                  fontWeight={700}
                  title={String(stat.value)}
                  sx={{
                    mt: 2,
                    mb: 0.45,
                    color: GREEN_UI.text,
                    fontSize: { xs: '1.35rem', sm: '1.45rem' },
                    letterSpacing: '-0.03em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.value}
                </Typography>
                <Typography variant="body2" fontWeight={600} sx={{ color: GREEN_UI.text }}>
                  {stat.title}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: GREEN_UI.muted,
                    display: 'block',
                    mt: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stat.helper}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={{ xs: 2, md: 2.5 }}>
        {myAttendance.length > 0 && (
          <Grid size={{ xs: 12, lg: myRequests.length > 0 ? 7 : 12 }}>
            <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 2.75 }, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                <Box>
                  <Chip icon={<AccessTimeRounded />} label="Attendance" variant="outlined" sx={{ ...softChipSx, mb: 1 }} />
                  <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, letterSpacing: '-0.02em' }}>
                    Recent Attendance
                  </Typography>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
                    Latest time records from your DTR.
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<ArrowForwardRounded />}
                  onClick={() => navigate('/dashboard/dtr')}
                  sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
                >
                  View All
                </Button>
              </Box>

              <Grid container spacing={1.5}>
                {myAttendance.slice(-5).reverse().map(a => {
                  const statusStyle = getAttendanceChipSx(a.status);

                  return (
                    <Grid key={a.id} size={{ xs: 12, sm: 6, md: 4, lg: 6, xl: 4 }}>
                      <Paper
                        elevation={0}
                        sx={{
                          ...innerCardSx,
                          p: 1.65,
                          height: '100%',
                          transition: 'transform 180ms ease, box-shadow 180ms ease',
                          '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 36px rgba(43, 91, 55, 0.12)' },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>
                            {a.date}
                          </Typography>
                          <Chip
                            label={a.status}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, ...statusStyle }}
                          />
                        </Box>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AccessTimeRounded sx={{ fontSize: 15 }} />
                          {a.timeIn || '—'} – {a.timeOut || '—'} · {a.totalHours || '—'} hrs
                        </Typography>
                      </Paper>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>
          </Grid>
        )}

        {myRequests.length > 0 && (
          <Grid size={{ xs: 12, lg: myAttendance.length > 0 ? 5 : 12 }}>
            <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 2.75 }, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                <Box>
                  <Chip icon={<Assignment />} label="Requests" variant="outlined" sx={{ ...softChipSx, mb: 1 }} />
                  <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, letterSpacing: '-0.02em' }}>
                    My Requests
                  </Typography>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
                    Latest leave, overtime, and undertime filings.
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  endIcon={<ArrowForwardRounded />}
                  onClick={() => navigate('/dashboard/requests')}
                  sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
                >
                  View All
                </Button>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {myRequests.slice(-3).reverse().map(r => {
                  const statusStyle = getRequestChipSx(r.status);

                  return (
                    <Paper
                      key={r.id}
                      elevation={0}
                      sx={{
                        ...innerCardSx,
                        p: 1.65,
                        transition: 'transform 180ms ease, box-shadow 180ms ease',
                        '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 36px rgba(43, 91, 55, 0.12)' },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.25 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>
                            {r.type} — {r.date}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              color: GREEN_UI.muted,
                              display: 'block',
                              mt: 0.35,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: { xs: 185, sm: 360, lg: 280 },
                            }}
                          >
                            {r.reason?.slice(0, 60)}
                          </Typography>
                        </Box>
                        <Chip
                          label={r.status}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 600, flexShrink: 0, ...statusStyle }}
                        />
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Paper>
          </Grid>
        )}
      </Grid>

      {!loading && myAttendance.length === 0 && myRequests.length === 0 && (
        <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 3 }, mt: 3, textAlign: 'center' }}>
          <Box
            sx={{
              width: 58,
              height: 58,
              borderRadius: '20px',
              bgcolor: GREEN_UI.greenSoft,
              color: GREEN_UI.greenDark,
              display: 'grid',
              placeItems: 'center',
              mx: 'auto',
              mb: 1.5,
            }}
          >
            <WalletRounded />
          </Box>
          <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
            No recent employee activity yet
          </Typography>
          <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
            DTR entries and requests will appear here once records are available.
          </Typography>
        </Paper>
      )}
    </Box>
  );
}
