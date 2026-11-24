import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { Alert, Box, Button, CircularProgress, Container, IconButton, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from '../bootstrap';
import { ArrowBackRounded, Badge, Visibility, VisibilityOff } from '../bootstrap/icons';
import AuthBackground from '../AuthBackground';
import BrandLogo from '../BrandLogo';
import { COMPANY, OUTLETS } from '../../lib/constants';
import { supabase } from '../../lib/supabaseClient';
import { employeeConfirmationRedirect } from '../../lib/applicantConfirmationRedirect';

function PasswordVisibility({ label, visible, onToggle }: { label: string; visible: boolean; onToggle: () => void }) {
  return (
    <InputAdornment position="end">
      <IconButton
        type="button"
        size="small"
        aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
        onMouseDown={event => event.preventDefault()}
        onClick={onToggle}
        sx={{
          color: '#557261',
          bgcolor: 'rgba(221,245,229,.55)',
          border: '1px solid rgba(45,168,97,.12)',
          '&:hover': { bgcolor: '#ddf5e5', color: '#006b3c' },
        }}
      >
        {visible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
      </IconButton>
    </InputAdornment>
  );
}

export default function EmployeeSelfRegistration() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [position, setPosition] = useState('');
  const [positionOptions, setPositionOptions] = useState<string[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [positionsError, setPositionsError] = useState('');
  const [email, setEmail] = useState('');
  const [outlet, setOutlet] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadPositions = async () => {
      setPositionsLoading(true);
      setPositionsError('');
      try {
        const { data, error: positionError } = await supabase.rpc('list_active_employee_registration_positions');
        if (!mounted) return;
        if (positionError) {
          setPositionsError('Could not load active positions. Refresh the page and try again.');
          setPositionOptions([]);
        } else {
          const options = [...new Set((data ?? []).map((title: string) => title.trim()).filter(Boolean))];
          setPositionOptions(options);
          if (options.length === 0) setPositionsError('There are no active positions available for registration. Contact HR.');
        }
      } catch {
        if (mounted) {
          setPositionsError('Could not load active positions. Refresh the page and try again.');
          setPositionOptions([]);
        }
      } finally {
        if (mounted) setPositionsLoading(false);
      }
    };
    void loadPositions();
    return () => { mounted = false; };
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    const cleanFullName = fullName.trim().replace(/\s+/g, ' ');
    const cleanEmployeeId = employeeId.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanFullName || cleanFullName.split(' ').length < 2 || !cleanEmployeeId || !position || !cleanEmail || !outlet || !password) {
      setError('Enter your full name, employee ID, position, email, assigned outlet, and password.');
      return;
    }
    if (!positionOptions.includes(position)) {
      setError('Choose a position from the active positions list.');
      return;
    }
    if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
      setError('Use a password with at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: employeeConfirmationRedirect(window.location.origin),
          data: { registration_kind: 'employee', full_name: cleanFullName, employee_id: cleanEmployeeId, position, outlet },
        },
      });
      if (signupError) throw signupError;
      if (!data.user) throw new Error('Registration did not return an account. Please try again.');
      if (data.user.identities?.length === 0) throw new Error('An account already uses this email address. Sign in or contact HR for help.');
      if (data.session) await supabase.auth.signOut({ scope: 'local' });
      setPassword('');
      setConfirmation('');
      setShowPassword(false);
      setShowConfirmation(false);
      setNotice('Registration submitted for HR approval. Confirm your email and wait for HR to approve your account before signing in.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit your registration.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthBackground>
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 6 } }}>
        <Paper elevation={0} sx={{ p: { xs: 2.5, sm: 4 }, borderRadius: '30px', background: 'rgba(250,255,249,.95)', border: '1px solid rgba(86,156,103,.24)', boxShadow: '0 24px 70px rgba(22,80,43,.18)' }}>
          <Stack alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
            <BrandLogo size={76} />
            <Typography variant="h4" component="h1" textAlign="center" fontWeight={750} sx={{ color: '#193c27', letterSpacing: '-.04em' }}>Employee account registration</Typography>
          </Stack>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
          <Box component="form" onSubmit={submit} noValidate>
            <TextField fullWidth required label="Full Name" autoComplete="name" value={fullName}
              onChange={event => setFullName(event.target.value)} margin="normal" />
            <TextField fullWidth required label="Employee ID" autoComplete="off" value={employeeId}
              onChange={event => setEmployeeId(event.target.value)} margin="normal"
              InputProps={{ startAdornment: <InputAdornment position="start"><Badge fontSize="small" /></InputAdornment> }} />
            <TextField fullWidth required select label="Position" value={position}
              onChange={event => setPosition(event.target.value)} margin="normal"
              disabled={positionsLoading || positionOptions.length === 0}
              helperText={positionsLoading ? 'Loading active positions…' : positionsError || 'Choose the position assigned to your employee ID.'}>
              <MenuItem value="" disabled>Select active position</MenuItem>
              {positionOptions.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
            <TextField fullWidth required label="Email address" type="email" autoComplete="email" value={email}
              onChange={event => setEmail(event.target.value)} margin="normal" />
            <TextField fullWidth required select label="Assigned Outlet" value={outlet}
              onChange={event => setOutlet(event.target.value)} margin="normal">
              {OUTLETS.map(option => <MenuItem key={option} value={option}>{option}</MenuItem>)}
            </TextField>
            <TextField fullWidth required label="New password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password}
              onChange={event => setPassword(event.target.value)} margin="normal" helperText="At least 8 characters."
              InputProps={{ endAdornment: <PasswordVisibility label="new password" visible={showPassword} onToggle={() => setShowPassword(visible => !visible)} /> }} />
            <TextField fullWidth required label="Confirm password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" value={confirmation}
              onChange={event => setConfirmation(event.target.value)} margin="normal"
              InputProps={{ endAdornment: <PasswordVisibility label="confirm password" visible={showConfirmation} onToggle={() => setShowConfirmation(visible => !visible)} /> }}
              error={Boolean(confirmation && password !== confirmation)}
              helperText={confirmation ? (password === confirmation ? 'Passwords match.' : 'Passwords do not match.') : undefined} />
            <Button type="submit" fullWidth variant="contained" disabled={busy || positionsLoading || positionOptions.length === 0} startIcon={busy ? <CircularProgress size={18} color="inherit" /> : undefined}
              sx={{ mt: 2, py: 1.4, borderRadius: '999px', textTransform: 'none', fontWeight: 700 }}>
              {busy ? 'Submitting…' : 'Submit registration'}
            </Button>
          </Box>
          <Button component={RouterLink} to="/login" startIcon={<ArrowBackRounded />} sx={{ mt: 2, display: 'flex', mx: 'auto' }}>Back to sign in</Button>
        </Paper>
        <Typography align="center" sx={{ mt: 2.5, color: 'rgba(255,255,255,.92)', fontSize: '.78rem', fontWeight: 700 }}>
          © {new Date().getFullYear()} {COMPANY.name} · Est. {COMPANY.established} · HRIS Capstone
        </Typography>
      </Container>
    </AuthBackground>
  );
}
