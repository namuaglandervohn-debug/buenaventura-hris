import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, CircularProgress, Container, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '../bootstrap';
import { Visibility, VisibilityOff } from '../bootstrap/icons';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import AuthBackground from '../AuthBackground';
import { getAuthEmailLoginPath } from '../../lib/authEmail';

export default function ApplicantPasswordReset({ client }: { client: SupabaseClient }) {
  const loginPath = getAuthEmailLoginPath(window.location.search);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const passwordsMatch = password === confirmation;
  const showMatch = confirmation.length > 0;

  const visibilityControl = (shown: boolean, toggle: () => void, field: string) => (
    <InputAdornment position="end">
      <IconButton type="button" edge="end" disabled={saving}
        aria-label={`${shown ? 'Hide' : 'Show'} ${field}`} onClick={toggle}
        onMouseDown={event => event.preventDefault()}>
        {shown ? <VisibilityOff /> : <Visibility />}
      </IconButton>
    </InputAdornment>
  );

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (active) setSession(error ? null : data.session);
    }).catch(() => {
      if (active) setSession(null);
    });
    return () => { active = false; };
  }, [client]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || saving || saved) return;
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
      setPassword('');
      setConfirmation('');
      // The password change succeeded. Discard the temporary recovery session.
      void client.auth.signOut({ scope: 'local' }).catch(() => {});
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update the password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthBackground>
      <Container component="main" maxWidth="sm" sx={{ py: 4 }}>
        <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 5 }}>
          <Stack spacing={2}>
            <Typography component="h1" variant="h5" fontWeight={700}>Reset your password</Typography>
            {session === undefined && <CircularProgress size={24} aria-label="Checking password reset link" />}
            {session === null && <Alert severity="error">This reset link is invalid or expired. Request a new one from the sign-in page.</Alert>}
            {saved && <Alert severity="success">Password updated. Sign in with your new password.</Alert>}
            {(saved || session === null) && <Button href={loginPath} sx={{ alignSelf: 'flex-start' }}>Back to sign in</Button>}
            {session && !saved && (
              <Stack component="form" onSubmit={submit} spacing={2}>
                <Typography variant="body2" color="text.secondary">{session.user.email}</Typography>
                {error && <Alert severity="error">{error}</Alert>}
                <TextField label="New password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required
                  inputProps={{ minLength: 8, maxLength: 120 }} value={password}
                  onChange={event => { setPassword(event.target.value); setError(''); }} disabled={saving}
                  InputProps={{ endAdornment: visibilityControl(showPassword, () => setShowPassword(value => !value), 'new password') }} />
                <TextField label="Confirm new password" type={showConfirmation ? 'text' : 'password'} autoComplete="new-password" required
                  inputProps={{ minLength: 8, maxLength: 120 }} value={confirmation}
                  onChange={event => { setConfirmation(event.target.value); setError(''); }} disabled={saving}
                  InputProps={{ endAdornment: visibilityControl(showConfirmation, () => setShowConfirmation(value => !value), 'confirmation password') }}
                  error={showMatch && !passwordsMatch}
                  helperText={<span role="status" aria-live="polite" style={{ color: showMatch && passwordsMatch ? '#166534' : undefined }}>
                    {showMatch ? passwordsMatch ? 'Passwords match.' : 'Passwords do not match.' : ' '}
                  </span>} />
                <Button type="submit" variant="contained" disabled={saving || password.length < 8 || !passwordsMatch}>
                  {saving ? 'Saving…' : 'Save new password'}
                </Button>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Container>
    </AuthBackground>
  );
}
