import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Box, Typography, Paper, TextField, Button, MenuItem, Alert,
  Grid, CircularProgress, Dialog, DialogContent, DialogActions,
  Chip,
} from '@mui/material';
import { ArrowBackIosNew, Send, TaskAlt, ContentCopy } from '@mui/icons-material';
import { POSITIONS } from '../../lib/constants';
import FileUploadField from '../FileUploadField';
import { copyToClipboard } from '../../lib/copyToClipboard';
import { saveApplicationFiles } from '../../lib/applicationFiles';
import { supabase } from '../../lib/supabaseClient';
import { submitApplicant } from '../../lib/submitApplicant';
import ActionSnackbar from '../ActionSnackbar';

/** Convert a File to a base64 data URI */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ApplicationForm() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    position: '', experience: '', education: '', coverLetter: '',
  });
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submissionInProgress = useRef(false);
  const [error, setError] = useState('');
  const [successDialog, setSuccessDialog] = useState(false);
  const [newAppId, setNewAppId] = useState('');
  const [copied, setCopied] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionInProgress.current) return;
    submissionInProgress.current = true;
    setSubmitting(true); setError('');
    try {
      // Encode files as base64 so they persist and are viewable in HR view
      let resumeFileName: string | null = null;
      let resumeFileData: string | null = null;
      if (resumeFiles[0]) {
        resumeFileName = resumeFiles[0].name;
        resumeFileData = await fileToBase64(resumeFiles[0]);
      }
      const supportingDocumentFiles = await Promise.all(
        supportingFiles.map(async (f) => ({
          name: f.name,
          type: f.type,
          data: await fileToBase64(f),
        }))
      );

      const fullName = `${formData.firstName} ${formData.lastName}`.trim();

      const applicantId = await submitApplicant(supabase, {
        name: fullName,
        first_name: formData.firstName.trim(),
        last_name: formData.lastName.trim(),
        suffix: '',
        email: formData.email.trim().toLowerCase(),
        phone_number: formData.phone,
        position_applied: formData.position,
        experience: formData.experience,
        education: formData.education,
        cover_letter: formData.coverLetter,
        resume_file_name: resumeFileName,
        resume_file_data: resumeFileData,
        supporting_documents: supportingFiles.map((f) => f.name),
        supporting_document_files: supportingDocumentFiles,
        status: 'Submitted',
      });

      saveApplicationFiles(applicantId, {
        resumeFileName,
        resumeFileData,
        supportingDocuments: supportingFiles.map((f) => f.name),
        supportingDocumentFiles,
      });

      setNewAppId(applicantId);
      setSuccessDialog(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(newAppId);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const resetForm = () => {
    setFormData({ firstName: '', lastName: '', email: '', phone: '', position: '', experience: '', education: '', coverLetter: '' });
    setResumeFiles([]);
    setSupportingFiles([]);
  };

  const f = formData;
  const set = (key: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [key]: e.target.value });

  /** Phone: digits only, max 11 characters */
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, phone: v }));
  };

  const EDUCATIONAL_ATTAINMENT = [
    'High School Graduate',
    'Vocational / Technical Course',
    'Some College',
    "Bachelor's Degree",
    "Master's Degree",
    'Doctorate',
    'Others',
  ];

  return (
    <Box>
      <Button startIcon={<ArrowBackIosNew />} onClick={() => navigate('/dashboard/recruitment')} sx={{ mb: 2 }}>
        Back to Applications
      </Button>

      <Paper sx={{ p: { xs: 2, sm: 4 } }}>
        <Typography variant="h5" gutterBottom fontWeight={700}>Job Application Form</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Please fill out all required fields.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="First Name" value={f.firstName} onChange={set('firstName')} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Last Name" value={f.lastName} onChange={set('lastName')} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Email Address" type="email" value={f.email} onChange={set('email')} required />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Phone Number" value={f.phone} onChange={setPhone} required placeholder="09XXXXXXXXX"
                inputProps={{ maxLength: 11 }} helperText={`${f.phone.length}/11`} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth select label="Position Applied For" value={f.position} onChange={set('position')} required
                InputLabelProps={{ shrink: true }}>
                <MenuItem key="pos-empty" value="">Select Position…</MenuItem>
                {POSITIONS.map((pos) => <MenuItem key={pos} value={pos}>{pos}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Years of Experience" type="number" value={f.experience} onChange={set('experience')} required inputProps={{ min: 0 }} />
            </Grid>
            <Grid size={12}>
              <TextField fullWidth select label="Highest Educational Attainment" value={f.education} onChange={set('education')} required
                InputLabelProps={{ shrink: true }}>
                <MenuItem key="edu-empty" value="">Select Educational Attainment…</MenuItem>
                {EDUCATIONAL_ATTAINMENT.map((edu) => <MenuItem key={edu} value={edu}>{edu}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField fullWidth multiline rows={4} label="Cover Letter / Message" value={f.coverLetter} onChange={set('coverLetter')} placeholder="Tell us why you're interested in this position..." />
            </Grid>

            {/* ── Resume Upload ── */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
                Resume / CV
              </Typography>
              <FileUploadField
                label="Upload Resume"
                accept=".pdf,.doc,.docx"
                multiple={false}
                files={resumeFiles}
                onChange={setResumeFiles}
                helperText="PDF, DOC, DOCX · Max 10 MB"
              />
            </Grid>

            {/* ── Supporting Documents Upload ── */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="body2" fontWeight={600} sx={{ mb: 1, color: 'text.primary' }}>
                Supporting Documents
              </Typography>
              <FileUploadField
                label="Upload Supporting Documents"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                multiple
                files={supportingFiles}
                onChange={setSupportingFiles}
                helperText="IDs, Certificates, etc. · PDF, DOC, JPG, PNG"
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={() => navigate('/dashboard/recruitment')}>Cancel</Button>
                <Button type="submit" variant="contained" startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <Send />} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Application'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>

      {/* Success Dialog */}
      <Dialog open={successDialog} onClose={() => { setSuccessDialog(false); navigate('/dashboard/recruitment'); }} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          <Box sx={{ width: 72, height: 72, borderRadius: '50%', bgcolor: 'success.light', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', mb: 3 }}>
            <TaskAlt sx={{ fontSize: 44, color: 'success.main' }} />
          </Box>
          <Typography variant="h5" fontWeight={700} color="success.main" gutterBottom>Application Submitted!</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            The application has been saved and assigned the following ID:
          </Typography>
          <Paper sx={{ p: 3, bgcolor: 'primary.light', borderRadius: 2, mb: 2 }}>
            <Typography variant="body2" sx={{ color: 'white' }}>Applicant ID</Typography>
            <Typography variant="h4" fontWeight={700} sx={{ my: 1, color: 'white', letterSpacing: 2 }}>{newAppId}</Typography>
            <Button size="small" variant="outlined" startIcon={<ContentCopy />} onClick={handleCopy}
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.7)' }}>
              {copied ? 'Copied!' : 'Copy ID'}
            </Button>
          </Paper>
          <Chip label="Status: Submitted" color="default" />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 3, gap: 1 }}>
          <Button onClick={() => { setSuccessDialog(false); resetForm(); }}>
            Add Another
          </Button>
          <Button variant="contained" onClick={() => { setSuccessDialog(false); navigate('/dashboard/recruitment'); }}>
            Go to Applications List
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity="success"
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      />
    </Box>
  );
}
