import { formatDisplayDate } from '../../lib/displayDate';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Container,
  Card,
  CardContent,
  Chip,
  Alert,
  Divider,
  Grid,
  CircularProgress,
  Stack,
  InputAdornment,
} from '../bootstrap';
import {
  ArrowBackIosNew,
  ManageSearch,
  AccountCircle,
  BusinessCenter,
  Event,
  InfoOutlined,
  Sell,
  LocationOn,
  Schedule,
  Person,
  Notes,
  AssignmentTurnedIn,
  MarkEmailReadOutlined,
  PhoneIphone,
  HelpOutline,
} from '../bootstrap/icons';
import AuthBackground from '../AuthBackground';
import { supabase } from '../../lib/supabaseClient';
import { recruitmentStatusLabel, recruitmentStatusPalette } from '../../lib/recruitmentStatus';

interface ApplicationStatus {
  id: string;
  name: string;
  position: string;
  email: string;
  phone: string;
  status: 'Submitted' | 'Under Review' | 'Missing Requirements' | 'For Interview' | 'Hired' | 'Not Qualified' | 'Not Hired' | 'Withdrawn' | 'Archived';
  dateApplied: string;
  // Interview fields set by HR
  interviewDate?: string;
  interviewTime?: string;
  interviewLocation?: string;
  interviewNotes?: string;
  scheduledBy?: string;
  notes?: string;
  accountEmail?: string;
}

const STATUS_MESSAGES: Record<string, string> = {
  Submitted: 'Your application has been received and is in the queue for review.',
  'Under Review': 'Your application is currently being reviewed by our HR team.',
  'Missing Requirements': 'Open your applicant account to view and upload the requested documents.',
  'For Interview': 'Congratulations! You have been selected for an interview. Please see your schedule below.',
  Hired: 'Congratulations! You have been selected to join Buenaventura Estate.',
  'Not Qualified': 'Thank you for your interest. Unfortunately, you do not meet the requirements for this position.',
  'Not Hired': 'Thank you for attending the interview. We will not be moving forward with your application.',
  Withdrawn: 'This application has been withdrawn.',
  Archived: 'This application has been archived.',
};

const formatTime = (time?: string) => {
  if (!time) return '—';

  const [hourStr, minute] = time.split(':');

  let hour = parseInt(hourStr);

  const ampm = hour >= 12 ? 'PM' : 'AM';

  hour = hour % 12;
  hour = hour ? hour : 12;

  return `${hour}:${minute} ${ampm}`;
};

const softCardSx = {
  borderRadius: '20px',
  border: '1px solid rgba(123, 161, 131, 0.18)',
  background: 'rgba(255, 255, 255, 0.88)',
  boxShadow: '0 18px 45px rgba(31, 95, 61, 0.08)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    '& fieldset': {
      borderColor: 'rgba(98, 133, 105, 0.22)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(45, 125, 76, 0.55)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#2f8f56',
      borderWidth: 1.5,
    },
  },
  '& .MuiInputLabel-root': {
    fontSize: 14,
    color: '#607064',
  },
  '& .MuiFormHelperText-root': {
    ml: 0.5,
    color: '#758477',
  },
};

export function ApplicationTracker({ initialApplicantId = '', inDialog = false }: {
  initialApplicantId?: string;
  inDialog?: boolean;
}) {
  const [applicantId, setApplicantId] = useState(initialApplicantId);
  const selectedApplicationId = inDialog ? initialApplicantId.trim() : '';
  const [applicationData, setApplicationData] = useState<ApplicationStatus | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(Boolean(selectedApplicationId));
  const currentStatusPalette = applicationData ? recruitmentStatusPalette(applicationData.status) : undefined;

  const loadApplication = useCallback(async (applicantId: string, signal?: AbortSignal) => {
    setError('');
    setApplicationData(null);
    setLoading(true);

    try {
      const id = applicantId.trim().toUpperCase();

      const query = supabase
        .from('applicants')
        .select('*')
        .eq('applicant_id', id);
      const { data, error } = await (signal ? query.abortSignal(signal) : query).single();
      if (signal?.aborted) return;

      if (error || !data) {
        setError(selectedApplicationId
          ? 'Application status could not be loaded. Please try again.'
          : 'Applicant ID not found. Please check your ID and try again.');
        return;
      }

      let accountEmail = '';

      if (data.status === 'Hired' && !data.is_archived) {
        const employeeQuery = supabase
          .from('employees')
          .select('employee_id')
          .eq('applicant_id', data.applicant_id);
        const { data: employeeData } = await (signal ? employeeQuery.abortSignal(signal) : employeeQuery).maybeSingle();
        if (signal?.aborted) return;

        if (employeeData?.employee_id) {
          const accountQuery = supabase
            .from('user_accounts')
            .select('email')
            .eq('employee_id', employeeData.employee_id);
          const { data: accountData } = await (signal ? accountQuery.abortSignal(signal) : accountQuery).maybeSingle();
          if (signal?.aborted) return;

          accountEmail = accountData?.email ?? '';
        }
      }

      setApplicationData({
        id: data.applicant_id,
        name: `${data.first_name ?? ''} ${data.middle_name ?? ''} ${data.last_name ?? ''}`.replace(/\s+/g, ' ').trim(),
        position: data.position_applied ?? '',
        email: data.email ?? '',
        phone: data.phone_number ?? '',
        status: data.is_archived ? 'Archived' : data.status ?? 'Submitted',
        dateApplied: formatDisplayDate(data.created_at),
        interviewDate: data.interview_date ?? '',
        interviewTime: data.interview_time ?? '',
        interviewLocation: data.interview_location ?? '',
        interviewNotes: data.interview_notes ?? '',
        scheduledBy: data.scheduled_by ?? '',
        notes: data.notes ?? '',
        accountEmail,
      });
    } catch {
      if (!signal?.aborted) setError('Application status could not be loaded. Please try again.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedApplicationId]);

  useEffect(() => {
    if (!selectedApplicationId) return;
    const controller = new AbortController();
    void loadApplication(selectedApplicationId, controller.signal);
    return () => controller.abort();
  }, [selectedApplicationId, loadApplication]);

  const handleTrack = (event: React.FormEvent) => {
    event.preventDefault();
    void loadApplication(applicantId);
  };

  const InfoCard = ({
    icon,
    label,
    value,
    chip,
  }: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    chip?: React.ReactNode;
  }) => (
    <Paper elevation={0} sx={{ ...softCardSx, p: 2.25, height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: '14px',
            display: 'grid',
            placeItems: 'center',
            color: '#2f8f56',
            background: 'linear-gradient(135deg, #e5f7e9 0%, #f5fff4 100%)',
            border: '1px solid rgba(47, 143, 86, 0.16)',
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              color: '#708274',
              fontWeight: 700,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              mb: 0.35,
            }}
          >
            {label}
          </Typography>
          {chip || (
            <Typography variant="body1" sx={{ color: '#203528', fontWeight: 600, lineHeight: 1.35, wordBreak: 'break-word' }}>
              {value || '—'}
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );

  return (
    <Paper
      elevation={0}
      sx={{
        overflow: 'hidden',
        borderRadius: inDialog ? 0 : '26px',
        background: 'linear-gradient(135deg, rgba(250,255,248,0.96) 0%, rgba(235,249,234,0.96) 100%)',
        border: inDialog ? 0 : '1px solid rgba(255,255,255,0.7)',
        boxShadow: inDialog ? 'none' : '0 30px 75px rgba(14, 61, 31, 0.20)',
        backdropFilter: 'blur(18px)',
      }}
    >
      <Box
        sx={{
          p: inDialog ? { xs: 1.5, sm: 3 } : { xs: 3, sm: 4, md: 5 },
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: -120,
            right: -120,
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(91, 190, 112, 0.22), rgba(91, 190, 112, 0))',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: -140,
            left: -120,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0))',
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          {!inDialog && <Stack alignItems="center" textAlign="center" spacing={1.4} sx={{ mb: 3.5 }}>
            <Typography
              variant="h4"
              sx={{
                color: '#173722',
                fontWeight: 700,
                letterSpacing: -0.8,
                fontSize: { xs: "1.55rem", sm: "2rem", md: "2.35rem" },
                lineHeight: 1.05,
              }}
            >
              Track Your Application
            </Typography>
            <Typography
              variant="body1"
              sx={{ color: '#607064', maxWidth: 620, fontSize: { xs: 14, md: 15.5 }, lineHeight: 1.7 }}
            >
              Enter your Applicant ID to check your current application status, interview schedule, and HR notes.
            </Typography>
          </Stack>}

          {!selectedApplicationId && <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2.25, md: 3 }, mb: 3 }}>
            <form onSubmit={handleTrack}>
              <Grid container spacing={2} alignItems="flex-start">
                <Grid size={{ xs: 12, md: 8 }}>
                  <TextField
                    fullWidth
                    label="Enter Applicant ID"
                    value={applicantId}
                    onChange={(e) => setApplicantId(e.target.value)}
                    placeholder="Paste your applicant ID"
                    required
                    helperText="Enter the complete applicant ID provided after submission."
                    sx={inputSx}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Sell sx={{ color: '#2f8f56' }} />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    size="large"
                    startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <ManageSearch />}
                    disabled={loading}
                    sx={{
                      height: 56,
                      borderRadius: '16px',
                      textTransform: 'none',
                      fontWeight: 700,
                      fontSize: 14,
                      bgcolor: '#2f8f56',
                      boxShadow: '0 16px 34px rgba(47,143,86,0.28)',
                      '&:hover': {
                        bgcolor: '#267849',
                        boxShadow: '0 20px 40px rgba(47,143,86,0.34)',
                      },
                      '&.Mui-disabled': {
                        bgcolor: 'rgba(47,143,86,0.45)',
                        color: '#fff',
                      },
                    }}
                  >
                    {loading ? 'Searching…' : 'Track Status'}
                  </Button>
                </Grid>
              </Grid>
            </form>
          </Paper>}

          {selectedApplicationId && loading && (
            <Stack direction="row" spacing={1.5} alignItems="center" role="status" sx={{ p: 2 }}>
              <CircularProgress size={20} />
              <Typography>Loading application status…</Typography>
            </Stack>
          )}

          {error && (
            <Alert
              severity="error"
              action={selectedApplicationId ? (
                <Button color="inherit" size="small" onClick={() => void loadApplication(selectedApplicationId)}>Try again</Button>
              ) : undefined}
              sx={{
                mb: 3,
                borderRadius: '18px',
                border: '1px solid rgba(211,47,47,0.14)',
                '& .MuiAlert-message': { fontSize: 14, fontWeight: 600 },
              }}
            >
              {error}
            </Alert>
          )}

          {applicationData && (
            <Card
              elevation={0}
              sx={{
                mt: selectedApplicationId ? 0 : 3,
                borderRadius: '26px',
                background: 'rgba(255,255,255,0.95)',
                border: '1px solid rgba(123, 161, 131, 0.18)',
                boxShadow: '0 24px 55px rgba(28, 89, 53, 0.12)',
                overflow: 'hidden',
              }}
            >
              <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  spacing={2}
                  sx={{ mb: 2.5 }}
                >
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: '16px',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#2f8f56',
                        background: 'linear-gradient(135deg, #e2f7e8, #f5fff4)',
                        border: '1px solid rgba(47,143,86,0.18)',
                      }}
                    >
                      <AssignmentTurnedIn />
                    </Box>
                    <Box>
                      <Typography
                        variant="h5"
                        sx={{ color: '#183722', fontWeight: 700, fontSize: { xs: '1.55rem', md: '2rem' }, letterSpacing: -0.4 }}
                      >
                        Application Status
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#667768', fontSize: 13.5 }}>
                        Latest status and details retrieved from HR records
                      </Typography>
                    </Box>
                  </Stack>

                  <Chip
                    label={applicationData.id}
                    variant="outlined"
                    icon={<Sell />}
                    sx={{
                      borderRadius: '999px',
                      height: 34,
                      px: 0.8,
                      color: '#23643c',
                      bgcolor: '#f2fbf3',
                      borderColor: 'rgba(47,143,86,0.28)',
                      fontWeight: 700,
                      '& .MuiChip-icon': { color: '#2f8f56' },
                    }}
                  />
                </Stack>

                <Divider sx={{ mb: 3, borderColor: 'rgba(105,140,111,0.16)' }} />

                <Alert
                  severity="info"
                  sx={{
                    mb: 3,
                    borderRadius: '20px',
                    bgcolor: currentStatusPalette?.bg,
                    color: currentStatusPalette?.color,
                    border: `1px solid ${currentStatusPalette?.border}`,
                    '& .MuiAlert-icon': { alignItems: 'center', color: currentStatusPalette?.color },
                    '& .MuiAlert-message': { width: '100%' },
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, fontSize: 14.5 }}>
                        {recruitmentStatusLabel(applicationData.status)}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: 13.5 }}>{STATUS_MESSAGES[applicationData.status]}</Typography>
                    </Box>
                    <Chip
                      label={recruitmentStatusLabel(applicationData.status)}
                      size="small"
                      sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, borderRadius: '999px', fontWeight: 600,
                        bgcolor: currentStatusPalette?.bg, color: currentStatusPalette?.color, border: `1px solid ${currentStatusPalette?.border}` }}
                    />
                  </Stack>
                </Alert>

                <Grid container spacing={2.25}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoCard icon={<AccountCircle />} label="Applicant Name" value={applicationData.name} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoCard icon={<BusinessCenter />} label="Position Applied" value={applicationData.position} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoCard icon={<Event />} label="Date Submitted" value={applicationData.dateApplied} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoCard
                      icon={<InfoOutlined />}
                      label="Current Status"
                      chip={
                        <Chip
                          label={recruitmentStatusLabel(applicationData.status)}
                          size="small"
                          sx={{ mt: 0.25, borderRadius: '999px', fontWeight: 600,
                            bgcolor: currentStatusPalette?.bg, color: currentStatusPalette?.color, border: `1px solid ${currentStatusPalette?.border}` }}
                        />
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoCard icon={<MarkEmailReadOutlined />} label="Email Address" value={applicationData.email} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <InfoCard icon={<PhoneIphone />} label="Phone Number" value={applicationData.phone} />
                  </Grid>

                  {applicationData.status === 'Hired' && (
                    <Grid size={{ xs: 12, md: 6 }}>
                      <InfoCard
                        icon={<MarkEmailReadOutlined />}
                        label="Employee Login Email"
                        value={applicationData.accountEmail || 'Account email is not yet available'}
                      />
                    </Grid>
                  )}

                  {/* ── Interview Schedule — shown only when status is "For Interview" ── */}
                  {applicationData.status === 'For Interview' && applicationData.interviewDate && (
                    <Grid size={12}>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: { xs: 2.25, md: 3 },
                          borderRadius: '20px',
                          borderColor: 'rgba(2, 136, 209, 0.24)',
                          borderWidth: 1,
                          bgcolor: 'rgba(232, 246, 255, 0.68)',
                          boxShadow: '0 18px 42px rgba(2, 136, 209, 0.08)',
                        }}
                      >
                        <Stack direction="row" alignItems="center" gap={1.4} sx={{ mb: 2 }}>
                          <Box
                            sx={{
                              width: 42,
                              height: 42,
                              borderRadius: '14px',
                              display: 'grid',
                              placeItems: 'center',
                              color: '#0277bd',
                              background: 'rgba(255,255,255,0.82)',
                              border: '1px solid rgba(2, 136, 209, 0.16)',
                            }}
                          >
                            <Event />
                          </Box>
                          <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#075a87', lineHeight: 1.25 }}>
                              Your Interview Schedule
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#51798f', fontWeight: 600 }}>
                              Please review your schedule and instructions carefully.
                            </Typography>
                          </Box>
                        </Stack>
                        <Divider sx={{ mb: 2.5, borderColor: 'rgba(2, 136, 209, 0.14)' }} />
                        <Grid container spacing={2}>
                          <Grid size={{ xs: 12, sm: 6 }}>
                            <InfoCard icon={<Event />} label="Interview Date" value={formatDisplayDate(applicationData.interviewDate)} />
                          </Grid>
                          {applicationData.interviewTime && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                              <InfoCard icon={<Schedule />} label="Interview Time" value={formatTime(applicationData.interviewTime)} />
                            </Grid>
                          )}
                          {applicationData.interviewLocation && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                              <InfoCard icon={<LocationOn />} label="Location" value={applicationData.interviewLocation} />
                            </Grid>
                          )}
                          {applicationData.scheduledBy && (
                            <Grid size={{ xs: 12, sm: 6 }}>
                              <InfoCard icon={<Person />} label="Scheduled By" value={applicationData.scheduledBy} />
                            </Grid>
                          )}
                          {applicationData.interviewNotes && (
                            <Grid size={12}>
                              <InfoCard icon={<Notes />} label="Notes / Instructions" value={applicationData.interviewNotes} />
                            </Grid>
                          )}
                        </Grid>
                      </Paper>
                    </Grid>
                  )}

                  {/* Fallback when status is For Interview but no date yet */}
                  {applicationData.status === 'For Interview' && !applicationData.interviewDate && (
                    <Grid size={12}>
                      <Alert
                        severity="info"
                        icon={<Event />}
                        sx={{ borderRadius: '18px', border: '1px solid rgba(2, 136, 209, 0.16)' }}
                      >
                        <Typography variant="body2" fontWeight={700}>
                          Interview Schedule Pending
                        </Typography>
                        <Typography variant="body2">
                          Your interview schedule has not been set yet. Please check back later or contact HR.
                        </Typography>
                      </Alert>
                    </Grid>
                  )}

                  {applicationData.notes && (
                    <Grid size={12}>
                      <Paper elevation={0} sx={{ ...softCardSx, p: 2.25, bgcolor: 'rgba(248, 252, 247, 0.92)' }}>
                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                          <Box
                            sx={{
                              width: 42,
                              height: 42,
                              borderRadius: '14px',
                              display: 'grid',
                              placeItems: 'center',
                              color: '#2f8f56',
                              background: 'linear-gradient(135deg, #e5f7e9 0%, #f5fff4 100%)',
                              border: '1px solid rgba(47, 143, 86, 0.16)',
                            }}
                          >
                            <Notes />
                          </Box>
                          <Box>
                            <Typography variant="caption" color="text.secondary" gutterBottom sx={{ fontWeight: 600 }}>
                              Additional Notes
                            </Typography>
                            <Typography variant="body1" sx={{ color: '#203528', fontWeight: 600 }}>
                              {applicationData.notes}
                            </Typography>
                          </Box>
                        </Stack>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </CardContent>
            </Card>
          )}

          {!selectedApplicationId && <Paper
            elevation={0}
            sx={{
              ...softCardSx,
              mt: 3,
              p: { xs: 2.25, md: 3 },
              bgcolor: 'rgba(247, 253, 246, 0.84)',
            }}
          >
            <Stack direction="row" spacing={1.6} alignItems="flex-start">
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#2f8f56',
                  background: 'linear-gradient(135deg, #e5f7e9 0%, #f5fff4 100%)',
                  border: '1px solid rgba(47, 143, 86, 0.16)',
                  flexShrink: 0,
                }}
              >
                <HelpOutline />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#203528', mb: 0.5 }}>
                  How to get your Applicant ID?
                </Typography>
                <Typography variant="caption" display="block" sx={{ color: '#657568', fontSize: 12.5, lineHeight: 1.7 }}>
                  Your Applicant ID is given to you when you submit an application through the{' '}
                  <strong>Apply for a Job</strong> page. Make sure to save it.
                </Typography>
              </Box>
            </Stack>
          </Paper>}
        </Box>
      </Box>
    </Paper>
  );
}

export default function TrackApplicationPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  const applicantId = searchParams.get('id') ?? '';

  if (authLoading) return <Box sx={{ p: 5 }}><CircularProgress /></Box>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <AuthBackground>
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        <Button
          startIcon={<ArrowBackIosNew />}
          onClick={() => navigate(user.role === 'applicant' ? '/applicant' : '/')}
          variant="contained"
          color="inherit"
          sx={{
            mb: 2.5,
            px: 2.25,
            py: 1.05,
            borderRadius: '16px',
            bgcolor: 'rgba(255,255,255,0.9)',
            color: '#235235',
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'none',
            border: '1px solid rgba(90, 130, 95, 0.18)',
            boxShadow: '0 14px 34px rgba(20, 82, 44, 0.12)',
            '&:hover': {
              bgcolor: '#ffffff',
              boxShadow: '0 18px 38px rgba(20, 82, 44, 0.16)',
            },
          }}
        >
          Back
        </Button>
        <ApplicationTracker key={applicantId} initialApplicantId={applicantId} />
      </Container>
    </AuthBackground>
  );
}
