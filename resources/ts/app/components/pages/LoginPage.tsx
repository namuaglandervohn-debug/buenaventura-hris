import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  InputAdornment,
  IconButton,
  Stack,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
} from "../bootstrap";
import {
  ArrowBackRounded,
  Visibility,
  VisibilityOff,
  Email,
  VpnKey,
} from "../bootstrap/icons";
import AuthBackground from "../AuthBackground";
import BrandLogo from "../BrandLogo";
import { COMPANY } from "../../lib/constants";
import { consumeAuthEmailLinkResult, supabase } from "../../lib/supabaseClient";
import { applicantConfirmationRedirect, employeeConfirmationRedirect } from "../../lib/applicantConfirmationRedirect";
import { getSignInErrorMessage } from "../../lib/authEmail";
import { getApplicationDestination, getPostLoginPath } from "../../lib/applicationNavigation";
import type { SignInGroup } from "../../lib/authSession";

const signInChoices: { value: SignInGroup; label: string }[] = [
  { value: 'staff', label: 'Admin / Staff' },
  { value: 'employee', label: 'Employee' },
  { value: 'applicant', label: 'Applicant' },
];

export default function LoginPage() {
  const { state } = useLocation();
  const registrationEmail = typeof state?.registrationEmail === 'string' ? state.registrationEmail : '';
  const [email, setEmail] = useState(registrationEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState('');
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; action: 'reset' | 'confirm' }>({ open: false, action: 'reset' });
  const [accountEmail, setAccountEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const submitting = useRef(false);
  const showingEmailLinkResult = useRef(false);
  const [signingIn, setSigningIn] = useState(false);
  const { login, user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const freshLogin = searchParams.get("fresh") === "1";
  const applicationDestination = getApplicationDestination(searchParams.get('next'));
  const postLoginPath = getPostLoginPath(user?.role, applicationDestination);
  const employeeRegistration = searchParams.get('employeeRegistration') === '1';
  const registrationPath = `/applicant?mode=register${applicationDestination ? `&next=${encodeURIComponent(applicationDestination)}` : ''}`;
  const [selectedSignInGroup, setSignInGroup] = useState<SignInGroup | null>(registrationEmail ? 'applicant' : null);
  const signInGroup = applicationDestination ? 'applicant' : selectedSignInGroup;

  useEffect(() => {
    const result = consumeAuthEmailLinkResult();
    if (result) showingEmailLinkResult.current = true;
    if (result === 'signup') {
      setSignInGroup(employeeRegistration ? 'employee' : 'applicant');
      setNotice(employeeRegistration
        ? 'Email verified. Your employee account still needs HR approval before you can sign in.'
        : 'Email verified. Sign in with your email and password.');
    } else if (result === 'wrong-project') {
      setError('This email link belongs to a different HRIS site. Return to the site where you registered to sign in or request a new link.');
    } else if (result === 'invalid-link') {
      setError('This email link is invalid or expired. If you already confirmed your email, try signing in. You can also request a new link below.');
    }
  }, []);

  useEffect(() => {
    if (freshLogin) {
      logout();
      setSearchParams({}, { replace: true });
      return;
    }

    if (!loading && postLoginPath && !showingEmailLinkResult.current) {
      navigate(postLoginPath, { replace: true });
    }
  }, [freshLogin, loading, logout, navigate, postLoginPath, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || sendingEmail || submitting.current) return;
    if (!signInGroup) {
      setError('Choose how you want to sign in.');
      return;
    }
    submitting.current = true;
    showingEmailLinkResult.current = false;
    setSigningIn(true);
    setError("");
    setNotice('');
    try {
      await login(email, password, signInGroup);
    } catch (err) {
      setError(getSignInErrorMessage(err));
    } finally {
      submitting.current = false;
      setSigningIn(false);
    }
  };

  const openEmailDialog = (action: 'reset' | 'confirm') => {
    setAccountEmail('');
    setEmailError('');
    setEmailNotice('');
    setEmailDialog({ open: true, action });
  };

  const closeEmailDialog = () => {
    if (!sendingEmail) setEmailDialog(dialog => ({ ...dialog, open: false }));
  };

  const requestAccountEmail = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!emailDialog.open || loading || sendingEmail || emailNotice || submitting.current) return;
    const address = accountEmail.trim().toLowerCase();
    setEmailError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setEmailError('Enter a valid email address.');
      return;
    }

    setSendingEmail(true);
    try {
      const redirectTo = emailDialog.action === 'confirm' && (signInGroup === 'employee' || employeeRegistration)
        ? employeeConfirmationRedirect(window.location.origin)
        : applicantConfirmationRedirect(window.location.origin, applicationDestination);
      const { error } = emailDialog.action === 'reset'
        ? await supabase.auth.resetPasswordForEmail(address, { redirectTo })
        : await supabase.auth.resend({ type: 'signup', email: address, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      setEmailNotice(emailDialog.action === 'reset'
        ? 'If an account exists for that address, check your inbox or spam folder for a password reset link.'
        : 'Confirmation requested. If your email still needs confirmation, check your inbox or spam folder.');
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Could not request the email.');
    } finally {
      setSendingEmail(false);
    }
  };

  const fieldSx = {
    mt: 1.4,
    mb: 0.8,
    "& .MuiInputLabel-root": {
      color: "#6F7E73",
      fontSize: "0.9rem",
      fontWeight: 700,
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#087443",
    },
    "& .MuiOutlinedInput-root": {
      minHeight: 54,
      backgroundColor: "rgba(255,255,255,0.92)",
      boxShadow: "0 10px 24px rgba(26, 83, 55, 0.06)",
      transition: "all 180ms ease",
      "& fieldset": {
        borderColor: "rgba(56, 116, 77, 0.16)",
      },
      "&:hover": {
        backgroundColor: "#FFFFFF",
        boxShadow: "0 14px 30px rgba(26, 83, 55, 0.10)",
        transform: "translateY(-1px)",
      },
      "&:hover fieldset": {
        borderColor: "rgba(8, 116, 67, 0.34)",
      },
      "&.Mui-focused": {
        backgroundColor: "#FFFFFF",
        boxShadow: "0 16px 34px rgba(8, 116, 67, 0.14)",
      },
      "&.Mui-focused fieldset": {
        borderColor: "#2DA861",
        borderWidth: "1.5px",
      },
    },
    "& .MuiInputBase-input": {
      color: "#11221A",
      fontSize: "0.94rem",
    },
  };

  return (
    <AuthBackground topLeftAction={(
      <Button
        component={RouterLink}
        to="/"
        startIcon={<ArrowBackRounded />}
        sx={{ minHeight: 44, px: 2, bgcolor: '#fff', color: '#087443', '&:hover': { bgcolor: '#e8f5ed' } }}
      >
        Back
      </Button>
    )}>
      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Paper
          elevation={0}
          sx={{
            position: "relative",
            overflow: "hidden",
            p: { xs: 2.7, sm: 4, md: 4.6 },
            borderRadius: "28px",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(248,253,247,0.94) 48%, rgba(239,250,238,0.92) 100%)",
            backdropFilter: "blur(22px)",
            border: "1px solid rgba(255,255,255,0.78)",
            boxShadow:
              "0 32px 70px rgba(10, 34, 24, 0.28), inset 0 1px 0 rgba(255,255,255,0.85)",
            "&::before": {
              content: '""',
              position: "absolute",
              width: 220,
              height: 220,
              top: -95,
              right: -85,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(68,185,111,0.24) 0%, rgba(68,185,111,0.08) 52%, rgba(68,185,111,0) 72%)",
              pointerEvents: "none",
            },
            "&::after": {
              content: '""',
              position: "absolute",
              width: 180,
              height: 180,
              left: -90,
              bottom: -82,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(217,164,65,0.18) 0%, rgba(217,164,65,0.06) 55%, rgba(217,164,65,0) 74%)",
              pointerEvents: "none",
            },
          }}
        >
          <Box sx={{ position: "relative", zIndex: 1 }}>
            {/* Brand header */}
            <Stack alignItems="center" spacing={1.25} sx={{ mb: 3 }}>
              <Box
                sx={{
                  width: { xs: 66, sm: 76 },
                  height: { xs: 66, sm: 76 },
                  borderRadius: "24px",
                  bgcolor: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 20px 34px rgba(8, 116, 67, 0.34), inset 0 1px 0 rgba(255,255,255,0.45)",
                  border: "1px solid rgba(255,255,255,0.58)",
                }}
              >
                <BrandLogo size="100%" />
              </Box>

              <Chip
                size="small"
                label="BUENAVENTURA ESTATE"
                sx={{
                  height: 28,
                  px: 0.5,
                  letterSpacing: 1.6,
                  bgcolor: "#DDF5E5",
                  color: "#006B3C",
                  border: "1px solid rgba(45,168,97,0.20)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  "& .MuiChip-label": { px: 1.2 },
                }}
              />

              <Typography
                align="center"
                sx={{
                  maxWidth: 430,
                  fontSize: { xs: "1.38rem", sm: "1.72rem" },
                  fontWeight: 700,
                  color: "#122019",
                  lineHeight: 1.15,
                  letterSpacing: "-0.04em",
                }}
              >
                Human Resource Information System
              </Typography>
            </Stack>

            {notice && <Alert severity="success" sx={{ mb: 2 }}>{notice}</Alert>}
            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 2,
                  borderRadius: "16px",
                  border: "1px solid rgba(211, 47, 47, 0.14)",
                  fontWeight: 700,
                  "& .MuiAlert-message": { fontSize: "0.88rem" },
                }}
              >
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <Typography id="sign-in-choice-label" variant="subtitle2" sx={{ color: '#125335', mb: 1 }}>Sign in as</Typography>
              <Box role="group" aria-labelledby="sign-in-choice-label" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {signInChoices.filter(({ value }) => !applicationDestination || value === 'applicant').map(({ value, label }) => (
                  <Button key={value} type="button" aria-pressed={signInGroup === value}
                    variant={signInGroup === value ? 'contained' : 'outlined'} disabled={loading || signingIn}
                    onClick={() => { setSignInGroup(value); setError(''); }}
                    sx={{ flex: '1 1 auto', borderRadius: '12px', minHeight: 42, whiteSpace: 'nowrap' }}>
                    {label}
                  </Button>
                ))}
              </Box>
              {signInGroup === 'staff' && <Typography variant="caption" sx={{ color: '#3e604b', display: 'block', mt: 0.75 }}>
                HR/Admin, General Manager, Supervisor, and Accounting &amp; Finance
              </Typography>}
              {signInGroup === 'employee' && <Button component={RouterLink} to="/employee-register" size="small" sx={{ mt: 0.5, px: 0, textTransform: 'none' }}>
                Existing employee? Register your account
              </Button>}

              <TextField
                fullWidth
                label="Email"
                disabled={loading || signingIn}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ fontSize: 19, color: "#0A7A43" }} />
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx}
              />

              <TextField
                fullWidth
                label="Password"
                disabled={loading || signingIn}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <VpnKey sx={{ fontSize: 19, color: "#0A7A43" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        size="small"
                        sx={{
                          color: "#557261",
                          bgcolor: "rgba(221,245,229,0.55)",
                          border: "1px solid rgba(45,168,97,0.12)",
                          "&:hover": {
                            bgcolor: "#DDF5E5",
                            color: "#006B3C",
                          },
                        }}
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx}
              />

              <Button
                type="submit"
                className="hris-public-action"
                disabled={loading || signingIn || sendingEmail}
                aria-busy={loading || signingIn}
                startIcon={loading || signingIn ? <CircularProgress size={18} color="inherit" /> : undefined}
                fullWidth
                variant="contained"
                size="large"
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.45,
                  borderRadius: "999px",
                  textTransform: "none",
                  fontSize: "0.98rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  boxShadow: "0 18px 32px rgba(8,116,67,0.28)",
                  "&:hover": {
                    boxShadow: "0 22px 38px rgba(8,116,67,0.34)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 180ms ease",
                }}
              >
                {signingIn ? 'Signing in…' : loading ? 'Checking session…' : 'Sign In to HRIS'}
              </Button>
            </form>
            <Stack alignItems="center" sx={{ width: '100%' }}>
              <Stack alignItems="center" spacing={0.5}>
                <Button size="small" aria-haspopup="dialog" disabled={loading || signingIn || sendingEmail} onClick={() => openEmailDialog('reset')}>Forgot password?</Button>
                <Button size="small" aria-haspopup="dialog" disabled={loading || signingIn || sendingEmail} onClick={() => openEmailDialog('confirm')}>Resend confirmation email</Button>
              </Stack>
              <Button
                component={RouterLink}
                to={registrationPath}
                disabled={loading || signingIn}
                onClick={(event) => {
                  if ((applicationDestination || showingEmailLinkResult.current) && user && user.role !== 'applicant'
                    && event.button === 0 && !event.metaKey && !event.altKey && !event.ctrlKey && !event.shiftKey) {
                    logout();
                  }
                }}
                fullWidth
                variant="outlined"
                sx={{ mt: { xs: 3.5, sm: 4.5 }, minHeight: 46, borderRadius: '999px', color: '#087443', borderColor: '#087443', fontWeight: 700 }}
              >
                Create an applicant account
              </Button>
            </Stack>
          </Box>
        </Paper>

        <Typography
          align="center"
          sx={{
            mt: 2.5,
            color: "rgba(255,255,255,0.92)",
            fontSize: "0.78rem",
            fontWeight: 700,
            textShadow: "0 2px 12px rgba(0,0,0,0.22)",
          }}
        >
          © {new Date().getFullYear()} {COMPANY.name} · Est. {COMPANY.established} · HRIS Capstone
        </Typography>
      </Container>
      <Dialog open={emailDialog.open} onClose={closeEmailDialog} fullWidth maxWidth="xs" aria-labelledby="account-email-dialog-title">
        <Box component="form" noValidate onSubmit={requestAccountEmail} aria-busy={sendingEmail}>
          <DialogTitle id="account-email-dialog-title">
            {emailDialog.action === 'reset' ? 'Forgot password?' : 'Resend confirmation email'}
          </DialogTitle>
          <DialogContent>
            {emailNotice ? <Alert severity="success">{emailNotice}</Alert> : (
              <TextField
                autoFocus
                fullWidth
                required
                margin="dense"
                type="email"
                label="Email address"
                autoComplete="email"
                value={accountEmail}
                onChange={event => { setAccountEmail(event.target.value); setEmailError(''); }}
                disabled={sendingEmail}
                error={Boolean(emailError)}
                helperText={emailError || undefined}
                slotProps={{ htmlInput: { maxLength: 120 } }}
              />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            {emailNotice ? (
              <Button type="button" autoFocus variant="contained" onClick={closeEmailDialog}>Done</Button>
            ) : (
              <>
                <Button type="button" disabled={sendingEmail} onClick={closeEmailDialog}>Cancel</Button>
                <Button type="submit" variant="contained" disabled={sendingEmail}>
                  {sendingEmail ? 'Sending…' : 'Send email'}
                </Button>
              </>
            )}
          </DialogActions>
        </Box>
      </Dialog>
    </AuthBackground>
  );
}
