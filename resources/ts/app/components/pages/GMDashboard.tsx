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
  Divider,
} from '@mui/material';
import {
  PersonAddAlt1,
  PeopleAlt,
  EmojiEvents,
  Timelapse,
  TrendingUp,
  DashboardCustomize,
  Apartment,
  CalendarMonth,
  ArrowForwardRounded,
  WorkspacePremium,
  Insights,
  FactCheck,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';

const GREEN_UI = {
  pageBg:
    'radial-gradient(circle at top left, rgba(220, 246, 219, 0.95), rgba(248, 252, 245, 0.98) 34%, #f7fbf3 100%)',
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

const softIconBoxSx = {
  width: 44,
  height: 44,
  borderRadius: '16px',
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  background: GREEN_UI.greenSoft,
  color: GREEN_UI.greenDark,
};

export default function GMDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [forInterview, setForInterview] = useState<any[]>([]);
  const [topEvaluations, setTopEvaluations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: applicantsData, error: applicantsError } = await supabase
          .from('applicants')
          .select('*')
          .eq('status', 'For Interview')
          .order('interview_date', { ascending: true })
          .limit(5);

        if (applicantsError) throw applicantsError;

        const mappedApplicants = (applicantsData ?? []).map((app: any) => ({
          id: app.applicant_id,
          name: `${app.first_name ?? ''} ${app.middle_name ?? ''} ${app.last_name ?? ''}`
            .replace(/\s+/g, ' ')
            .trim(),
          position: app.position_applied ?? '',
          interviewDate: app.interview_date ?? '',
          interviewTime: app.interview_time ?? '',
          status: app.status ?? '',
        }));

        setForInterview(mappedApplicants);

        setStats({
          forInterviewCount: mappedApplicants.length,
          activeEmployees: 0,
          pendingRequests: 0,
        });

        setTopEvaluations([]);
      } catch (e) {
        console.error('GM dashboard error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statCards = [
    {
      title: 'Active Employees',
      value: loading ? '…' : String(stats?.activeEmployees ?? 0),
      icon: <PeopleAlt />,
      color: GREEN_UI.greenDark,
      accent: 'rgba(58, 168, 101, 0.14)',
    },
    {
      title: 'For Interview',
      value: loading ? '…' : String(stats?.forInterviewCount ?? 0),
      icon: <PersonAddAlt1 />,
      color: '#2f8f8b',
      accent: 'rgba(47, 143, 139, 0.13)',
    },
    {
      title: 'Pending Evaluation Approvals',
      value: loading ? '…' : String(topEvaluations.length),
      icon: <TrendingUp />,
      color: '#d9a441',
      accent: 'rgba(217, 164, 65, 0.16)',
    },
    {
      title: 'Pending Requests',
      value: loading ? '…' : String(stats?.pendingRequests ?? 0),
      icon: <Timelapse />,
      color: '#b73e2d',
      accent: 'rgba(183, 62, 45, 0.13)',
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
      {/* Header */}
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
            left: { xs: '72%', md: '46%' },
            bottom: -95,
            background: 'rgba(174, 222, 144, 0.18)',
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            gap: 2.5,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ maxWidth: 720 }}>
            <Chip
              icon={<DashboardCustomize />}
              label="General Manager Portal"
              sx={{
                mb: 1.5,
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                fontWeight: 600,
                '& .MuiChip-icon': { color: GREEN_UI.greenDark },
              }}
            />
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                color: GREEN_UI.text,
                fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
                letterSpacing: '-0.045em',
                lineHeight: 1.08,
              }}
            >
              General Manager Dashboard
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 1, lineHeight: 1.7, maxWidth: 650 }}>
              Welcome, {user?.name} — monitor estate-wide operations, hiring priorities, evaluation approvals,
              and workforce activity from one soft dashboard view.
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Loading */}
      {loading && (
        <Paper elevation={0} sx={{ ...softCardSx, p: 2, mb: 2.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <CircularProgress size={18} sx={{ color: GREEN_UI.green }} />
          <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
            Loading estate data…
          </Typography>
        </Paper>
      )}

      {/* EOTM Banner — content, preserved as-is */}
      {stats?.eotmEmployee && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 2.5 },
            mb: 2.5,
            color: 'white',
            borderRadius: '26px',
            background: 'linear-gradient(135deg, #d9a441 0%, #e8c06a 100%)',
            boxShadow: '0 18px 40px rgba(217, 164, 65, 0.22)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
            <Box
              sx={{
                width: 62,
                height: 62,
                borderRadius: '20px',
                bgcolor: 'rgba(255,255,255,0.20)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <EmojiEvents sx={{ fontSize: 42 }} />
            </Box>
            <Box>
              <Typography variant="caption" sx={{ opacity: 0.9, letterSpacing: 1, fontWeight: 700 }}>
                🏆 EMPLOYEE OF THE MONTH
              </Typography>
              <Typography variant="h5" fontWeight={700} sx={{ letterSpacing: '-0.03em' }}>
                {stats.eotmEmployee}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.88 }}>
                Highest Performance Score
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Stat Cards */}
      <Grid container spacing={{ xs: 1.5, md: 2 }} sx={{ mb: 2.5 }}>
        {statCards.map((stat, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, md: 3 }} sx={{ display: 'flex' }}>
            <Card
              elevation={0}
              sx={{
                ...softCardSx,
                width: '100%',
                minHeight: 138,
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 24px 46px rgba(43, 91, 55, 0.14)' },
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 2.25 }, height: '100%', '&:last-child': { pb: { xs: 2, sm: 2.25 } } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                      {stat.title}
                    </Typography>
                    <Typography
                      variant="h4"
                      fontWeight={700}
                      sx={{ color: GREEN_UI.text, mt: 0.8, letterSpacing: '-0.045em' }}
                    >
                      {stat.value}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 50,
                      height: 50,
                      borderRadius: '18px',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: stat.accent,
                      color: stat.color,
                      flexShrink: 0,
                    }}
                  >
                    {stat.icon}
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted, mt: 1.4, display: 'block' }}>
                  Live summary from your current HRIS records
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={{ xs: 1.5, md: 2.5 }}>
        {/* Applicants For Interview */}
        <Grid size={{ xs: 12 }}>
          <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 2.5 }, height: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: { xs: 'flex-start', sm: 'center' },
                flexWrap: 'wrap',
                gap: 1.5,
                mb: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ ...softIconBoxSx }}>
                  <CalendarMonth />
                </Box>
                <Box>
                  <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, letterSpacing: '-0.025em' }}>
                    Applicants for Interview
                  </Typography>
                  <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                    Upcoming interview queue
                  </Typography>
                </Box>
              </Box>
              <Button
                size="small"
                variant="contained"
                onClick={() => navigate('/dashboard/recruitment')}
                endIcon={<ArrowForwardRounded />}
                sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
              >
                Manage
              </Button>
            </Box>

            <Divider sx={{ borderColor: GREEN_UI.border, mb: 1.5 }} />

            {forInterview.length === 0 ? (
              <Paper elevation={0} sx={{ ...innerCardSx, bgcolor: '#ffffff', p: 2.2, textAlign: 'center' }}>
                <Box sx={{ ...softIconBoxSx, mx: 'auto', mb: 1 }}>
                  <FactCheck />
                </Box>
                <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                  No scheduled interviews
                </Typography>
                <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                  No applicants are currently marked for interview.
                </Typography>
              </Paper>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.25 }}>
                {forInterview.map(a => (
                  <Paper
                    key={a.id}
                    elevation={0}
                    sx={{
                      ...innerCardSx,
                      p: 1.5,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                      <Box sx={{ ...softIconBoxSx, width: 40, height: 40, borderRadius: '14px' }}>
                        <PersonAddAlt1 fontSize="small" />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }} noWrap>
                          {a.name || 'Unnamed Applicant'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted }} noWrap>
                          {a.position} · {a.interviewDate || 'Date TBD'} {a.interviewTime || ''}
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      label="For Interview"
                      size="small"
                      variant="outlined"
                      sx={{
                        bgcolor: '#e9f6ff',
                        color: '#1d6f9c',
                        borderColor: '#b7dff7',
                        fontWeight: 600,
                      }}
                    />
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Pending Evaluations */}
      {topEvaluations.length > 0 && (
        <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, sm: 2.5 }, mt: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ ...softIconBoxSx }}>
                <Insights />
              </Box>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, letterSpacing: '-0.025em' }}>
                  Evaluations — Pending Your Approval
                </Typography>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                  Performance approvals requiring General Manager review
                </Typography>
              </Box>
            </Box>
            <Button
              size="small"
              variant="contained"
              onClick={() => navigate('/dashboard/evaluation')}
              startIcon={<WorkspacePremium />}
              sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
            >
              Approve Now
            </Button>
          </Box>

          <Divider sx={{ borderColor: GREEN_UI.border, mb: 1 }} />

          <Box sx={{ display: 'grid', gap: 1.25 }}>
            {topEvaluations.map((e, i) => (
              <Paper
                key={e.id}
                elevation={0}
                sx={{ ...innerCardSx, p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                  <Chip
                    label={`#${i + 1}`}
                    size="small"
                    sx={{
                      fontWeight: 700,
                      bgcolor: i === 0 ? '#fff7e0' : GREEN_UI.greenSoft,
                      color: i === 0 ? '#9b6b00' : GREEN_UI.greenDark,
                    }}
                  />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }} noWrap>
                      {e.employee}
                    </Typography>
                    <Typography variant="caption" sx={{ color: GREEN_UI.muted }} noWrap>
                      {e.position} · {e.period}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="body1" fontWeight={700} sx={{ color: GREEN_UI.greenDark }}>
                  {e.finalScore?.toFixed(2)}%
                </Typography>
              </Paper>
            ))}
          </Box>
        </Paper>
      )}
    </Box>
  );
}
