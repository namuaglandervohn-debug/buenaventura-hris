import TextField from '../DateTextField';
import MobileNumberField from '../MobileNumberField';
import { formatMobileNumber, isPhilippineMobileNumber } from '../../lib/mobileNumber';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, Box, Button, CircularProgress, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton, InputAdornment, MenuItem, Paper, Stack, Tooltip, Typography } from '../bootstrap';
import { AccountCircle, ArrowBackRounded, Assignment, BadgeOutlined, CakeOutlined, Close, DeleteOutline, EditNote, EmailOutlined, FileDownload, FavoriteBorder, HomeOutlined, LockOutlined, LocationCityOutlined, MapOutlined, PersonOutline, PhoneOutlined, PlaceOutlined, Public, Save, TrackChanges, Visibility, VisibilityOff, WcOutlined } from '../bootstrap/icons';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabaseClient';
import { applicantConfirmationRedirect } from '../../lib/applicantConfirmationRedirect';
import AuthBackground from '../AuthBackground';
import RootLayout from '../layouts/RootLayout';
import { ApplicationTracker } from './TrackApplicationPage';
import { fileToDataUrl } from '../../lib/applicationFiles';
import { recruitmentStatusLabel, recruitmentStatusPalette } from '../../lib/recruitmentStatus';
import { accountColors } from '../layouts/accountColors';
import { profileCardSx, profileDetailsSx, profileFieldSx, profileHeroSx, profileIconSx } from '../layouts/profileStyles';
import ProfilePhotoUpload from '../ProfilePhotoUpload';
import ProfilePhotoAvatar from '../ProfilePhotoAvatar';
import { APPLICANT_COUNTRIES, APPLICANT_NATIONALITIES } from '../../lib/applicantProfile';
import { applicationHistoryColumns, type ApplicationHistoryItem } from '../../lib/applicationHistory';
import { formatDisplayDate } from '../../lib/displayDate';
import { completeApplicantAddress, PH_PROVINCES_BY_REGION, CITIES_BY_PROVINCE, BARANGAYS_BY_CITY, ZIP_BY_CITY } from '../../lib/applicantAddress';

const initial = { firstName: '', middleName: '', lastName: '', suffix: '', birthdate: '', contactNumber: '', gender: '', civilStatus: '', nationality: 'Filipino', currentCountry: 'Philippines', currentRegion: '', currentProvince: '', currentCity: '', currentBarangay: '', currentStreet: '', currentZipCode: '' };
type ProfileField = [keyof typeof initial, string, boolean];
const personalDetails: ProfileField[] = [
  ['firstName', 'First name', true], ['middleName', 'Middle name', false], ['lastName', 'Last name', true], ['suffix', 'Suffix', false],
  ['birthdate', 'Date of birth', true], ['contactNumber', 'Mobile number', true], ['gender', 'Gender', false], ['civilStatus', 'Civil status', false],
  ['nationality', 'Nationality', false],
];
const addressDetails: ProfileField[] = [
  ['currentCountry', 'Country', true], ['currentRegion', 'Region', false], ['currentProvince', 'Province', false],
  ['currentCity', 'City / Municipality', true], ['currentBarangay', 'Barangay', false], ['currentStreet', 'Street / House No. / Purok', true], ['currentZipCode', 'ZIP Code', false],
];
const fields = [...personalDetails, ...addressDetails];
const registrationIcons: Record<keyof typeof initial, typeof PersonOutline> = {
  firstName: PersonOutline, middleName: PersonOutline, lastName: PersonOutline, suffix: BadgeOutlined,
  birthdate: CakeOutlined, contactNumber: PhoneOutlined, gender: WcOutlined, civilStatus: FavoriteBorder,
  nationality: Public, currentCountry: Public, currentRegion: MapOutlined, currentProvince: MapOutlined,
  currentCity: LocationCityOutlined, currentBarangay: PlaceOutlined, currentStreet: HomeOutlined,
  currentZipCode: PlaceOutlined,
};

function registrationAdornment(Icon: typeof PersonOutline) {
  return <InputAdornment position="start" aria-hidden="true" sx={{ color: 'primary.main' }}>
    <Icon fontSize="small" />
  </InputAdornment>;
}
const requirementFileTypes: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
const requirementFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

function RequirementFilePreview({ file, onClose }: { file: File; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const type = requirementFileTypes[extension];
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file.slice(0, file.size, type));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, type]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="requirement-file-preview-title">
      <DialogTitle id="requirement-file-preview-title" sx={{ overflowWrap: 'anywhere' }}>{file.name}</DialogTitle>
      <DialogContent dividers>
        {url && type === 'application/pdf' ? (
          <Box component="iframe" title={file.name} src={url} sx={{ display: 'block', width: '100%', height: '65vh', border: 0 }} />
        ) : url && type?.startsWith('image/') ? (
          <Box component="img" src={url} alt={file.name} sx={{ display: 'block', mx: 'auto', maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }} />
        ) : <Typography>Download this file to open it on your device.</Typography>}
      </DialogContent>
      <DialogActions>
        {url && <Button component="a" href={url} download={file.name} startIcon={<FileDownload />}>Download</Button>}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
type ApplicantSubmission = ApplicationHistoryItem & {
  status: string;
  requirements_note: string | null;
  is_archived: boolean;
  has_resume: boolean;
  has_birth_cert: boolean;
  has_tor: boolean;
  has_med_cert: boolean;
  custom_requirements: { label: string; checked: boolean }[] | null;
};

function missingRequirements(app: ApplicantSubmission) {
  return [
    !app.has_resume && 'Resume / CV',
    !app.has_birth_cert && 'Birth Certificate',
    !app.has_tor && 'Transcript of Records',
    !app.has_med_cert && 'Medical Certificate',
    ...(app.custom_requirements ?? []).filter(requirement => !requirement.checked).map(requirement => requirement.label),
  ].filter(Boolean).join(', ');
}

async function loadApplicantApplications(userId: string): Promise<ApplicantSubmission[]> {
  const { data, error } = await supabase.from('applicants')
    .select(`${applicationHistoryColumns},status,requirements_note,is_archived,has_resume,has_birth_cert,has_tor,has_med_cert,custom_requirements`)
    .eq('auth_user_id', userId).order('created_at', { ascending: false }).order('applicant_id', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export default function ApplicantPortal() {
  const { user, loading, logout, profilePhoto, updateProfilePhoto } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const registering = params.get('mode') === 'register';
  const [profile, setProfile] = useState<Record<string, any>>({ ...initial });
  const [profileBeforeEdit, setProfileBeforeEdit] = useState<Record<string, any> | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [ready, setReady] = useState(false);
  const [profileOwner, setProfileOwner] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [registrationReceipt, setRegistrationReceipt] = useState('');
  const [applications, setApplications] = useState<ApplicantSubmission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [requirementFiles, setRequirementFiles] = useState<File[]>([]);
  const [requirementTitles, setRequirementTitles] = useState<Record<string, string>>({});
  const [requirementPreviewFile, setRequirementPreviewFile] = useState<File | null>(null);
  const profileReady = ready && profileOwner === user?.id;
  const requestedNext = params.get('next') ?? '';
  const hasApplicationDestination = /^\/apply(?:\?|$)/.test(requestedNext);
  const next = hasApplicationDestination ? requestedNext : '/apply';
  const loginPath = hasApplicationDestination ? `/login?next=${encodeURIComponent(next)}` : '/login';
  const continueToSignIn = () => navigate(loginPath, { replace: true, state: { registrationEmail: registrationReceipt } });
  useEffect(() => {
    if (user?.role !== 'applicant') return;
    let active = true;
    setReady(false);
    void (async () => {
      try {
        const result = await supabase.from('applicant_profiles').select('profile').eq('auth_user_id', user.id).single();
        if (result.error) throw result.error;
        const list = await loadApplicantApplications(user.id);
        if (active) {
          setProfile({ ...initial, ...completeApplicantAddress(result.data.profile) });
          setApplications(list);
          setProfileOwner(user.id);
          setReady(true);
        }
      } catch (e: any) { if (active) setError(e.message || 'Could not load your profile.'); }
    })();
    return () => { active = false; };
  }, [user?.id, user?.role]);

  const uploadProfilePhoto = async (photo: string) => {
    if (!user || !profileReady) throw new Error('Sign in again to update your profile picture.');
    await updateProfilePhoto(photo);
    setNotice('Profile picture updated.');
  };
  const refreshApplications = async () => {
    if (!user || refreshing || busy) return;
    setRefreshing(true);
    setError('');
    try {
      setApplications(await loadApplicantApplications(user.id));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not refresh application status.');
    } finally {
      setRefreshing(false);
    }
  };
  const choices: Partial<Record<keyof typeof initial, string[]>> = { nationality: APPLICANT_NATIONALITIES, suffix: ['', 'Jr.', 'Sr.', 'II', 'III', 'IV'], gender: ['Male', 'Female', 'Prefer not to say'], civilStatus: ['Single', 'Married', 'Widowed', 'Separated'], currentCountry: APPLICANT_COUNTRIES, currentRegion: profile.currentCountry === 'Philippines' ? Object.keys(PH_PROVINCES_BY_REGION) : undefined, currentProvince: profile.currentCountry === 'Philippines' ? PH_PROVINCES_BY_REGION[profile.currentRegion] : undefined, currentCity: CITIES_BY_PROVINCE[profile.currentProvince], currentBarangay: BARANGAYS_BY_CITY[profile.currentCity] };
  const setProfileField = (key: keyof typeof initial, value: string) => {
    const addressChanges: Partial<Record<keyof typeof initial, Partial<typeof initial>>> = {
      currentCountry: { currentRegion: '', currentProvince: '', currentCity: '', currentBarangay: '', currentZipCode: '' },
      currentRegion: { currentProvince: '', currentCity: '', currentBarangay: '', currentZipCode: '' },
      currentProvince: { currentCity: '', currentBarangay: '', currentZipCode: '' },
      currentCity: { currentBarangay: '', currentZipCode: ZIP_BY_CITY[value] || '' },
    };
    setProfile(previous => ({ ...previous, [key]: value, ...addressChanges[key] }));
  };
  const renderFields = (items: ProfileField[], inProfile = false) => {
    const readOnly = inProfile && !profileBeforeEdit;
    return (
      <Grid container spacing={inProfile ? 1.5 : 2}>
        {items.map(([key, label, required]) => {
          const options = readOnly ? undefined : choices[key];
          const isDate = key === 'birthdate';
          if (key === 'contactNumber' && !readOnly) return (
            <Grid key={key} size={{ xs: 12, sm: 6 }}>
              <MobileNumberField fullWidth required={required} label={label} value={profile[key]}
                size={inProfile ? 'small' : undefined} sx={inProfile ? profileFieldSx : undefined}
                InputProps={inProfile ? undefined : { startAdornment: registrationAdornment(registrationIcons[key]) }}
                disabled={busy} onNumberChange={digits => setProfileField(key, formatMobileNumber(digits))} />
            </Grid>
          );
          return (
            <Grid key={key} size={{ xs: 12, sm: 6 }}>
              <TextField
                select={Boolean(options)} fullWidth required={required && !readOnly} label={label}
                value={profile[key] || (readOnly ? '—' : '')} type={isDate ? 'date' : 'text'}
                size={inProfile ? 'small' : undefined} sx={inProfile ? profileFieldSx : undefined}
                InputLabelProps={inProfile || isDate || options ? { shrink: true } : undefined}
                InputProps={inProfile ? undefined : { startAdornment: registrationAdornment(registrationIcons[key]) }}
                inputProps={readOnly ? { readOnly: true } : isDate ? { max: new Date().toISOString().slice(0, 10) } : { maxLength: 200 }}
                disabled={busy} onChange={readOnly ? undefined : event => setProfileField(key, event.target.value)}
              >
                {options && [
                  <MenuItem key="empty" value="">Select {label.toLowerCase()}</MenuItem>,
                  ...options.map(value => <MenuItem key={value} value={value}>{value}</MenuItem>),
                ]}
              </TextField>
            </Grid>
          );
        })}
      </Grid>
    );
  };
  const validateProfile = () => {
    if (fields.some(([key,, required]) => required && !String(profile[key] || '').trim())) throw new Error('Complete all required personal information.');
    if (!profile.birthdate || profile.birthdate > new Date().toISOString().slice(0,10)) throw new Error('Enter a valid date of birth.');
    if (!isPhilippineMobileNumber(String(profile.contactNumber))) throw new Error('Enter a valid Philippine mobile number.');
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setNotice('');
    try {
      if (user?.role === 'applicant') {
        if (!profileBeforeEdit) return;
        validateProfile();
        const updatedProfile = completeApplicantAddress(profile);
        const result = await supabase.from('applicant_profiles').update({ profile: updatedProfile, updated_at: new Date().toISOString() }).eq('auth_user_id', user.id).select('auth_user_id').single();
        if (result.error) throw result.error;
        setProfile(updatedProfile);
        setProfileBeforeEdit(null);
        setNotice('Profile saved. Future applications will use these details.');
      } else if (registering) {
        validateProfile();
        const registrationEmail = email.trim().toLowerCase();
        const result = await supabase.auth.signUp({ email: registrationEmail, password, options: { emailRedirectTo: applicantConfirmationRedirect(window.location.origin, hasApplicationDestination ? next : null), data: { registration_kind: 'applicant', applicant_profile: completeApplicantAddress(profile) } } });
        if (result.error && !['user_already_exists', 'email_exists'].includes(result.error.code ?? '')) throw result.error;
        if (result.data.session) {
          navigate(loginPath, { replace: true, state: { registrationEmail } });
        } else {
          setPassword('');
          setRegistrationReceipt(registrationEmail);
        }
      }
    } catch (e: any) {
      setError(e.message || 'Could not complete this action.');
    }
    finally { setBusy(false); }
  };
  const submitRequirements = async (applicantId: string) => {
    if (busy || refreshing || requirementFiles.length === 0) return;
    setError('');
    setNotice('');
    if (requirementFiles.length > 5 || requirementFiles.reduce((bytes, file) => bytes + file.size, 0) > 10 * 1024 * 1024) {
      setError('Upload one to five files, up to 10 MB total.');
      return;
    }
    if (requirementFiles.some(file => !requirementTitles[requirementFileKey(file)]?.trim())) {
      setError('Add a descriptive title for every uploaded file.');
      return;
    }
    setBusy(true);
    try {
      const documents = await Promise.all(requirementFiles.map(async (file) => {
        const type = requirementFileTypes[file.name.split('.').pop()?.toLowerCase() ?? ''];
        if (!type || !file.size) throw new Error('Use PDF, Word, JPG, or PNG documents.');
        return { name: file.name, title: requirementTitles[requirementFileKey(file)].trim(), type, data: await fileToDataUrl(new Blob([file], { type })) };
      }));
      const { error: uploadError } = await supabase.rpc('resubmit_application_requirements', { p_applicant_id: applicantId, p_files: documents });
      if (uploadError) throw uploadError;
      setApplications(current => current.map(app => app.applicant_id === applicantId ? { ...app, status: 'Under Review' } : app));
      setUploadFor(null);
      setRequirementFiles([]);
      setRequirementTitles({});
      setNotice('Your additional documents were submitted for HR review.');
    } catch (e: any) {
      setError(e.message || 'Could not upload the documents.');
    } finally {
      setBusy(false);
    }
  };
  if (loading) return <Box sx={{ p: 5 }}><CircularProgress /></Box>;
  if (user && user.role !== 'applicant') return <Navigate to="/dashboard" replace />;
  if (signingOut || (!user && !registering)) return <Navigate to={signingOut ? '/login' : loginPath} replace />;
  const backButton = (
    <Button component={Link} to={loginPath} startIcon={<ArrowBackRounded />} sx={{ mb: 1 }}>
      Back
    </Button>
  );
  if (user) {
    const savedProfile = profileBeforeEdit ?? profile;
    const name = [savedProfile.firstName, savedProfile.middleName, savedProfile.lastName, savedProfile.suffix].filter(Boolean).join(' ') || user.name;
    const initials = [savedProfile.firstName, savedProfile.lastName].map(part => String(part ?? '').charAt(0)).join('').toUpperCase() || name.charAt(0).toUpperCase();
    const signOut = () => {
      setSigningOut(true);
      logout();
    };
    return (
      <RootLayout applicant={{ onSignOut: signOut, busy: busy || refreshing }}>
        <Box sx={{ p: { xs: 0, sm: 1.5, md: 3 }, background: accountColors.dashboard, borderRadius: { md: '32px' } }}>
          <Paper elevation={0} sx={profileHeroSx}>
            <Stack direction="row" alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" flexWrap="wrap" gap={2} sx={{ position: 'relative', zIndex: 1 }}>
              <Stack direction="row" alignItems="center" gap={2} sx={{ minWidth: 0 }}>
                <ProfilePhotoAvatar photo={profilePhoto} initials={initials} />
                <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Typography component="h1" variant="h4" fontWeight={700}
                    sx={{ fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' }, color: '#1e2d24', letterSpacing: '-0.04em', lineHeight: 1.08 }}>
                    {name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{user.email}</Typography>
                  {profileReady && <Box sx={{ mt: 1 }}>
                    <ProfilePhotoUpload photo={profilePhoto} disabled={busy} onUpload={uploadProfilePhoto} />
                  </Box>}
                </Box>
              </Stack>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                <Button component={Link} to={next} variant="contained" disabled={!profileReady || busy}>Apply for a job</Button>
                {profileReady && (profileBeforeEdit ? (
                  <>
                    <Button type="button" variant="outlined" startIcon={<Close />} disabled={busy}
                      onClick={() => { setProfile(profileBeforeEdit); setProfileBeforeEdit(null); setError(''); }}>Cancel</Button>
                    <Button type="submit" form="applicant-profile-form" variant="contained" startIcon={<Save />} disabled={busy}>
                      {busy ? 'Saving…' : 'Save profile'}
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="contained" startIcon={<EditNote />} disabled={busy}
                    onClick={() => { setProfileBeforeEdit(profile); setError(''); setNotice(''); }}>Edit Profile</Button>
                ))}
                <Button variant="contained" disabled={!profileReady || busy || refreshing}
                  onClick={() => void refreshApplications()}>{refreshing ? 'Refreshing…' : 'Refresh Status'}</Button>
              </Stack>
            </Stack>
          </Paper>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
          <Grid container spacing={2.5} alignItems="flex-start">
            <Grid size={{ xs: 12, md: 8 }}>
              <Paper component="section" aria-labelledby="applicant-profile-title" elevation={0} sx={{ ...profileCardSx, p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
                  <Box aria-hidden="true" sx={profileIconSx}><AccountCircle /></Box>
                  <Typography id="applicant-profile-title" component="h2" variant="h6" fontWeight={700}>Personal information</Typography>
                </Stack>
                <Divider sx={{ mb: 2.5 }} />
                {profileReady ? (
                  <Box component="form" id="applicant-profile-form" onSubmit={submit}>
                    <Paper elevation={0} sx={{ ...profileDetailsSx, p: { xs: 1.5, sm: 2 } }}>
                      <Typography component="h3" variant="caption" fontWeight={700} color="primary.dark"
                        sx={{ display: 'block', mb: 1.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Your information</Typography>
                      {renderFields(personalDetails, true)}
                    </Paper>
                    <Paper elevation={0} sx={{ ...profileDetailsSx, p: { xs: 1.5, sm: 2 }, mt: 2.25 }}>
                      <Typography component="h3" variant="caption" fontWeight={700} color="primary.dark"
                        sx={{ display: 'block', mb: 1.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Address</Typography>
                      {renderFields(addressDetails, true)}
                    </Paper>
                  </Box>
                ) : !error && <CircularProgress size={24} aria-label="Loading applicant profile" />}
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Paper component="section" elevation={0} sx={{ ...profileCardSx, p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1} sx={{ mb: 2 }}>
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <Box aria-hidden="true" sx={profileIconSx}><Assignment /></Box>
                    <Typography component="h2" variant="h6" fontWeight={700}>Your applications</Typography>
                  </Stack>
                  <Button onClick={() => setTrackingId('')} variant="contained" startIcon={<TrackChanges />}>Track Application</Button>
                </Stack>
                <Divider sx={{ mb: 2 }} />
                {profileReady && applications.length === 0 && (
                  <Paper elevation={0} sx={{ ...profileDetailsSx, p: 2 }}>
                    <Typography variant="body2" color="text.secondary">No applications submitted yet.</Typography>
                  </Paper>
                )}
                {profileReady && applications.map(app => {
                  const status = app.is_archived ? 'Archived' : app.status;
                  const statusPalette = recruitmentStatusPalette(status);
                  return <Paper key={app.applicant_id} elevation={0} sx={{ ...profileDetailsSx, p: 1.5, mt: 1.25 }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
                      <Typography fontWeight={700}>{app.position_applied}</Typography>
                      <Chip label={recruitmentStatusLabel(status)} size="small" variant="outlined"
                        sx={{ bgcolor: statusPalette.bg, color: statusPalette.color, borderColor: statusPalette.border, fontWeight: 650 }} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {[app.applicant_id, formatDisplayDate(app.created_at)].filter(Boolean).join(' · ')}
                    </Typography>
                    <Stack direction="row" flexWrap="wrap" sx={{ mt: 0.5 }}>
                      <Button onClick={() => setTrackingId(app.applicant_id)}>View application status</Button>
                      <Button component={Link} to={`/apply?reuse=${encodeURIComponent(app.applicant_id)}`}>Reuse answers</Button>
                    </Stack>
                    {app.status === 'Missing Requirements' && !app.is_archived && (
                      <Stack spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
                        <Typography variant="body2">{missingRequirements(app)}</Typography>
                        {app.requirements_note && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{app.requirements_note}</Typography>}
                        {uploadFor === app.applicant_id ? (
                          <>
                            <Typography component="label" variant="body2">
                              Supporting documents (up to 5 files, 10 MB total; add a title for each)
                              <Box component="input" type="file" className="form-control" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={busy}
                                onChange={event => {
                                  const selected = Array.from(event.currentTarget.files ?? []);
                                  setRequirementFiles(current => [...current, ...selected.filter(file => !current.some(existing => requirementFileKey(existing) === requirementFileKey(file)))]);
                                  event.currentTarget.value = '';
                                }} sx={{ display: 'block', maxWidth: '100%', mt: 0.5 }} />
                            </Typography>
                            {requirementFiles.map((file, index) => <Paper key={requirementFileKey(file)} variant="outlined" sx={{ p: 1.25, display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 1, borderRadius: 2 }}>
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Typography variant="body2" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{file.name}</Typography>
                              </Box>
                              <TextField required size="small" label="Document title" placeholder={index === 0 ? 'e.g. Front page' : 'e.g. Back page'} value={requirementTitles[requirementFileKey(file)] ?? ''}
                                onChange={event => setRequirementTitles(current => ({ ...current, [requirementFileKey(file)]: event.target.value }))} sx={{ minWidth: { sm: 220 } }} />
                              <Stack direction="row" alignItems="center" justifyContent="flex-end">
                                <Tooltip title="Preview file"><IconButton type="button" size="small" aria-label={`Preview ${file.name}`} onClick={() => setRequirementPreviewFile(file)}><Visibility fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="Remove file"><IconButton type="button" size="small" color="error" aria-label={`Remove ${file.name}`} onClick={() => {
                                  setRequirementFiles(current => current.filter((_, fileIndex) => fileIndex !== index));
                                  setRequirementTitles(current => { const next = { ...current }; delete next[requirementFileKey(file)]; return next; });
                                }}><DeleteOutline fontSize="small" /></IconButton></Tooltip>
                              </Stack>
                            </Paper>)}
                            <Button variant="contained" disabled={busy || refreshing || !requirementFiles.length} onClick={() => void submitRequirements(app.applicant_id)}>
                              {busy ? 'Uploading…' : 'Submit documents'}
                            </Button>
                          </>
                        ) : (
                          <Button variant="outlined" disabled={busy} onClick={() => { setUploadFor(app.applicant_id); setRequirementFiles([]); }}>
                            Upload missing requirements
                          </Button>
                        )}
                      </Stack>
                    )}
                  </Paper>;
                })}
              </Paper>
            </Grid>
          </Grid>
        </Box>
        <Dialog open={trackingId !== null} onClose={() => setTrackingId(null)} aria-labelledby="track-application-dialog-title"
          fullWidth maxWidth="md" scroll="paper">
          <DialogTitle id="track-application-dialog-title">Track Application</DialogTitle>
          <DialogContent dividers sx={{ p: 0 }}>
            {trackingId !== null && <ApplicationTracker key={trackingId} initialApplicantId={trackingId} inDialog />}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setTrackingId(null)}>Close</Button>
          </DialogActions>
        </Dialog>
        {requirementPreviewFile && <RequirementFilePreview file={requirementPreviewFile} onClose={() => setRequirementPreviewFile(null)} />}
      </RootLayout>
    );
  }
  return <AuthBackground><Container maxWidth="md" sx={{ py: 4 }}><Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 5 }}>
    {backButton}
    <Typography component="h1" variant="h5" fontWeight={700} sx={{ mb: 2 }}>Create an applicant account</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}{notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
    <Box component="form" onSubmit={submit}><Stack spacing={3}>
      <TextField label="Email" type="email" required value={email} onChange={e => setEmail(e.target.value)}
        autoComplete="email" inputProps={{ maxLength: 120 }} disabled={busy}
        InputProps={{ startAdornment: registrationAdornment(EmailOutlined) }} />
      <TextField label="Password" type={showPassword ? 'text' : 'password'} required value={password}
        onChange={e => setPassword(e.target.value)} autoComplete="new-password"
        inputProps={{ minLength: 8, maxLength: 120 }} disabled={busy}
        InputProps={{
          startAdornment: registrationAdornment(LockOutlined),
          endAdornment: <InputAdornment position="end">
            <IconButton type="button" edge="end" disabled={busy} aria-label={showPassword ? 'Hide password' : 'Show password'}
              onMouseDown={event => event.preventDefault()} onClick={() => setShowPassword(previous => !previous)}>
              {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
            </IconButton>
          </InputAdornment>,
        }} />
      {renderFields(fields)}
      <Button type="submit" variant="contained" disabled={busy || Boolean(registrationReceipt)}>{busy ? 'Please wait...' : 'Create applicant account'}</Button>
    </Stack></Box>
    <Dialog open={Boolean(registrationReceipt)} maxWidth="xs" fullWidth aria-labelledby="applicant-activation-title"
      onClose={continueToSignIn}>
      <DialogTitle id="applicant-activation-title">Check your email</DialogTitle>
      <DialogContent>
        <Typography>If confirmation is still pending, check your inbox or spam folder for the activation link. If you already confirmed this address, sign in with the password you originally set or use Forgot password.</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{registrationReceipt}</Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={continueToSignIn}>
          Continue to sign in
        </Button>
      </DialogActions>
    </Dialog>
  </Paper></Container></AuthBackground>;
}
