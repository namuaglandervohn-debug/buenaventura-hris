import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { loadApplicationFiles } from '../../lib/applicationFiles';
import {
  Sync,
  CalendarMonth,
  TaskAlt,
  Event,
  CancelOutlined,
  PictureAsPdf,
  Article,
  FileDownload,
  InsertDriveFile,
  Visibility,
  Image as ImageIcon,
  EditNote,
  AddCircle,
  RemoveCircle,
  PersonSearch,
  BadgeOutlined,
  WorkOutline,
  CalendarToday,
  EventAvailable,
  TuneOutlined,
  ArchiveOutlined,
  UnarchiveOutlined,
  HowToReg,
} from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useAuth } from '../../context/AuthContext';
import ActionSnackbar from '../ActionSnackbar';

interface DocFile {
  name: string;
  type: string;
  data: string; // base64 data URI
}

type DocumentItem = { name: string; data?: string; type?: string };

type AppStatus =
  | 'Submitted'
  | 'Under Review'
  | 'Missing Requirements'
  | 'For Interview'
  | 'Hired'
  | 'Not Qualified'
  | 'Not Hired'
  | 'Archived';

interface Application {
  id: string;
  name: string;
  position: string;
  dateApplied: string;
  status: AppStatus;

  // Name parts
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;

  // Personal info
  gender?: string;
  civilStatus?: string;
  birthdate?: string;
  birthplace?: string;
  height?: string;
  weight?: string;

  // Contact
  email: string;
  phone: string;
  address?: string;

  // Employment
  experience?: string;
  education?: string;
  coverLetter?: string;

  // Government IDs
  tin?: string;
  sss?: string;
  philhealth?: string;
  pagibig?: string;

  // Emergency contact
  emergencyContact?: string;

  // Submitted documents
  resumeFileName?: string;
  resumeFileData?: string;
  supportingDocuments?: string[];
  supportingDocumentFiles?: DocFile[];

  // Requirements
  hasResume?: boolean;
  hasBirthCert?: boolean;
  hasTOR?: boolean;
  hasMedCert?: boolean;
  requirementsNote?: string;
  customRequirements?: { label: string; checked: boolean }[];

  // Interview
  interviewDate?: string;
  interviewTime?: string;
  interviewLocation?: string;
  interviewNotes?: string;
  interviewFeedback?: string;
  hiringDecision?: string;
  scheduledBy?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;

  raw?: any;
}

const STATUS_COLORS: Record<AppStatus, 'default' | 'primary' | 'warning' | 'info' | 'success' | 'error'> = {
  Submitted: 'default',
  'Under Review': 'primary',
  'Missing Requirements': 'warning',
  'For Interview': 'info',
  Hired: 'success',
  'Not Qualified': 'error',
  'Not Hired': 'error',
  Archived: 'default',
};

const ALL_STATUSES: AppStatus[] = [
  'Submitted',
  'Under Review',
  'Missing Requirements',
  'For Interview',
  'Hired',
  'Not Qualified',
  'Archived',
];


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
  borderRadius: "12px",
  textTransform: 'none',
  fontWeight: 600,
  px: 2,
};

const tableHeaderIconSx = {
  fontSize: 16,
  color: 'inherit',
};

const chipIconSx = {
  '& .MuiChip-icon': {
    color: 'inherit',
    fontSize: 16,
    ml: 0.65,
  },
};

const statusChipSx = (status: AppStatus) => {
  const styles: Record<AppStatus, { bg: string; color: string; border: string }> = {
    Submitted: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da' },
    'Under Review': { bg: '#eaf6ff', color: '#24658f', border: '#b9ddf4' },
    'Missing Requirements': { bg: '#fff7e0', color: '#9b6b00', border: '#f5d786' },
    'For Interview': { bg: '#e9f6ff', color: '#1d6f9c', border: '#b7dff7' },
    Hired: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    'Not Qualified': { bg: '#fdeaea', color: '#9c2f2f', border: '#efb8b8' },
    'Not Hired': { bg: '#fdeaea', color: '#9c2f2f', border: '#efb8b8' },
    Archived: { bg: '#f4f1e8', color: '#7a5b1f', border: '#dfcfa9' },
  };

  const selected = styles[status] ?? styles.Submitted;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25, fontWeight: 600 },
  };
};

const softTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '16px',
    backgroundColor: '#fbfef9',
    transition: 'all 180ms ease',
    '& fieldset': { borderColor: GREEN_UI.border },
    '&:hover fieldset': { borderColor: GREEN_UI.borderStrong },
    '&.Mui-focused fieldset': { borderColor: GREEN_UI.green, borderWidth: 1.5 },
    '&.Mui-disabled': { backgroundColor: '#f6fbf4' },
  },
  '& .MuiInputLabel-root': { color: GREEN_UI.muted, fontWeight: 400 },
  '& .MuiInputBase-input, & .MuiSelect-select, & textarea': {
    fontWeight: 400,
    color: GREEN_UI.text,
  },
  '& .MuiInputBase-input.Mui-disabled, & .MuiSelect-select.Mui-disabled': {
    WebkitTextFillColor: GREEN_UI.text,
    fontWeight: 400,
  },
  '& .MuiInputBase-input::placeholder, & textarea::placeholder': {
    fontWeight: 400,
    opacity: 0.72,
  },
};

const APPLICANT_LIST_COLUMNS = `
  applicant_id,
  name,
  first_name,
  middle_name,
  last_name,
  suffix,
  position_applied,
  created_at,
  status,
  email,
  phone_number,
  interview_date,
  interview_time,
  interview_location,
  interview_notes,
  scheduled_by,
  has_resume,
  has_birth_cert,
  has_tor,
  has_med_cert,
  requirements_note,
  custom_requirements,
  supporting_documents
`;

const MINIMAL_APPLICANT_LIST_COLUMNS = `
  applicant_id,
  first_name,
  middle_name,
  last_name,
  suffix,
  position_applied,
  created_at,
  status,
  interview_date,
  interview_time
`;

const APPLICANT_PROFILE_COLUMNS = `
  applicant_id,
  name,
  first_name,
  middle_name,
  last_name,
  suffix,
  position_applied,
  created_at,
  status,
  email,
  phone_number,
  address,
  gender,
  civil_status,
  birthdate,
  birthplace,
  height,
  weight,
  education,
  experience,
  cover_letter,
  tin,
  sss,
  philhealth,
  pagibig,
  emergency_contact,
  resume_file_name,
  supporting_documents,
  supporting_document_files,
  has_resume,
  has_birth_cert,
  has_tor,
  has_med_cert,
  requirements_note,
  custom_requirements,
  interview_date,
  interview_time,
  interview_location,
  interview_notes,
  interview_feedback,
  hiring_decision,
  scheduled_by
`;

const PROFILE_DIALOG_TIMEOUT_MS = 10000;
const DOCUMENT_LOAD_TIMEOUT_MS = 15000;

const displayValue = (value: any) => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const safeJsonParse = (value?: string) => {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const ensureArray = <T,>(value: T[] | string | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const formatDateTime = (dateString?: string) => {
  if (!dateString) return '—';

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return displayValue(dateString);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';

  hours = hours % 12;
  hours = hours || 12;

  return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
};

const formatInterviewDateTime = (date?: string, time?: string) => {
  if (!date) return '—';
  return formatDateTime(time ? `${date}T${time}` : date);
};

const withTimeout = <T,>(
  promise: PromiseLike<T>,
  timeoutMs = 15000,
  message = 'The request took too long. Please check your connection and try again.'
) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });

const waitForNextPaint = () =>
  new Promise<void>(resolve => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });

const buildApplicantFullName = (app: Application) =>
  [app.firstName, app.middleName, app.lastName, app.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || app.name || '—';

const buildAddressText = (parts: any, fallback?: string) => {
  if (!parts || typeof parts !== 'object') return fallback || '—';

  return (
    [parts.street, parts.barangay, parts.city, parts.province, parts.region, parts.country, parts.zipCode]
      .filter(Boolean)
      .join(', ') ||
    fallback ||
    '—'
  );
};

const mapApplicantRow = (app: any): Application => {
  const customRequirements = ensureArray<{ label: string; checked: boolean }>(app.custom_requirements);
  const supportingDocuments = ensureArray<string>(app.supporting_documents);
  const supportingDocumentFiles = ensureArray<DocFile>(app.supporting_document_files);

  const mapped: Application = {
    id: app.applicant_id,
    name:
      `${app.first_name ?? ''} ${app.middle_name ?? ''} ${app.last_name ?? ''} ${app.suffix ?? ''}`
        .replace(/\s+/g, ' ')
        .trim() || app.name || '—',
    position: app.position_applied ?? '',
    dateApplied: app.created_at ?? '',
    status: (app.status ?? 'Submitted') as AppStatus,

    firstName: app.first_name ?? '',
    middleName: app.middle_name ?? '',
    lastName: app.last_name ?? '',
    suffix: app.suffix ?? '',

    gender: app.gender ?? '',
    civilStatus: app.civil_status ?? '',
    birthdate: app.birthdate ?? '',
    birthplace: app.birthplace ?? '',
    height: app.height ?? '',
    weight: app.weight ?? '',

    email: app.email ?? '',
    phone: app.phone_number ?? '',
    address: app.address ?? '',

    experience: app.experience ?? '',
    education: app.education ?? '',
    coverLetter: app.cover_letter ?? '',

    tin: app.tin ?? '',
    sss: app.sss ?? '',
    philhealth: app.philhealth ?? '',
    pagibig: app.pagibig ?? '',
    emergencyContact: app.emergency_contact ?? '',

    resumeFileName: app.resume_file_name ?? '',
    resumeFileData: app.resume_file_data ?? '',
    supportingDocuments,
    supportingDocumentFiles,

    hasResume: app.has_resume ?? false,
    hasBirthCert: app.has_birth_cert ?? false,
    hasTOR: app.has_tor ?? false,
    hasMedCert: app.has_med_cert ?? false,
    requirementsNote: app.requirements_note ?? '',
    customRequirements,

    interviewDate: app.interview_date ?? '',
    interviewTime: app.interview_time ?? '',
    interviewLocation: app.interview_location ?? '',
    interviewNotes: app.interview_notes ?? '',
    interviewFeedback: app.interview_feedback ?? '',
    hiringDecision: app.hiring_decision ?? '',
    scheduledBy: app.scheduled_by ?? '',
    isArchived: Boolean(app.is_archived) || app.status === 'Archived',
    archivedAt: app.archived_at ?? '',
    archivedBy: app.archived_by ?? '',
    archiveReason: app.archive_reason ?? '',
    raw: app,
  };

  return mapped;
};

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);

const applicationToApplicantUpdate = (update: Partial<Application>) => {
  const dbUpdate: Record<string, any> = {};

  const map: Partial<Record<keyof Application, string>> = {
    firstName: 'first_name',
    middleName: 'middle_name',
    lastName: 'last_name',
    suffix: 'suffix',
    email: 'email',
    phone: 'phone_number',
    address: 'address',
    position: 'position_applied',
    status: 'status',
    gender: 'gender',
    civilStatus: 'civil_status',
    birthdate: 'birthdate',
    birthplace: 'birthplace',
    height: 'height',
    weight: 'weight',
    education: 'education',
    experience: 'experience',
    coverLetter: 'cover_letter',
    tin: 'tin',
    sss: 'sss',
    philhealth: 'philhealth',
    pagibig: 'pagibig',
    emergencyContact: 'emergency_contact',
    resumeFileName: 'resume_file_name',
    resumeFileData: 'resume_file_data',
    supportingDocuments: 'supporting_documents',
    hasResume: 'has_resume',
    hasBirthCert: 'has_birth_cert',
    hasTOR: 'has_tor',
    hasMedCert: 'has_med_cert',
    requirementsNote: 'requirements_note',
    customRequirements: 'custom_requirements',
    interviewDate: 'interview_date',
    interviewTime: 'interview_time',
    interviewLocation: 'interview_location',
    interviewNotes: 'interview_notes',
    interviewFeedback: 'interview_feedback',
    hiringDecision: 'hiring_decision',
    scheduledBy: 'scheduled_by',
  };

  Object.entries(map).forEach(([appKey, dbKey]) => {
    const key = appKey as keyof Application;
    if (!dbKey || !hasOwn(update, key)) return;

    const value = update[key];

    if (['birthdate', 'interviewDate', 'interviewTime'].includes(key)) {
      dbUpdate[dbKey] = value || null;
    } else {
      dbUpdate[dbKey] = value;
    }
  });

  return dbUpdate;
};

const getFileTypeFromName = (name?: string) => {
  const lower = (name ?? '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.(jpg|jpeg|png|gif|bmp|webp)$/.test(lower)) return `image/${lower.split('.').pop()}`;
  return '';
};

const generateTemporaryPassword = (base: string) => {
  const cleanBase = base.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'employee';

  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return `${cleanBase}@${values[0].toString(36).slice(0, 6)}!`;
  }

  return `${cleanBase}@${Math.random().toString(36).slice(2, 8)}!`;
};

const buildDocumentsForApplication = (app: Application | null, submittedDocuments: string[] = []): DocumentItem[] => {
  const docs: DocumentItem[] = [];

  if (!app) return docs;

  if (app.resumeFileName) {
    docs.push({
      name: app.resumeFileName,
      data: app.resumeFileData,
      type: getFileTypeFromName(app.resumeFileName),
    });
  }

  (app.supportingDocumentFiles ?? []).forEach(file => {
    docs.push({ name: file.name, data: file.data, type: file.type });
  });

  submittedDocuments.forEach(name => {
    if (!docs.some(doc => doc.name === name)) {
      docs.push({ name });
    }
  });

  return docs;
};

const getSubmittedDocumentsForApplication = (app: Application | null): string[] => {
  if (!app) return [];

  const raw = app.raw ?? {};
  const extra = safeJsonParse(app.coverLetter);

  if (Array.isArray(raw.submitted_documents) && raw.submitted_documents.length) {
    return raw.submitted_documents;
  }

  if (Array.isArray(extra.submittedDocuments) && extra.submittedDocuments.length) {
    return extra.submittedDocuments;
  }

  return app.supportingDocuments ?? [];
};

export default function RecruitmentManagement() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [viewDialog, setViewDialog] = useState(false);
  const [viewEditMode, setViewEditMode] = useState(false);
  const [interviewDialog, setInterviewDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
  const [archiveView, setArchiveView] = useState<'active' | 'archived'>('active');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as 'success' | 'error',
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [loadingDocumentName, setLoadingDocumentName] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; data: string; type: string } | null>(null);

  // Interview scheduling form
  const [iForm, setIForm] = useState({
    interviewDate: '',
    interviewTime: '',
    interviewLocation: 'HR Office, Buenaventura Estate',
    interviewNotes: '',
  });

  // GM hiring decision form
  const [gmForm, setGmForm] = useState({ interviewFeedback: '', hiringDecision: '' });

  // Requirements checklist
  const [reqForm, setReqForm] = useState({
    hasResume: false,
    hasBirthCert: false,
    hasTOR: false,
    hasMedCert: false,
    requirementsNote: '',
    customRequirements: [] as { label: string; checked: boolean }[],
  });

  // Edit application
  const [editAppForm, setEditAppForm] = useState<Partial<Application>>({});
  const [search, setSearch] = useState('');

  // Edit requirements checklist dialog
  const [editReqDialog, setEditReqDialog] = useState(false);
  const [newReqText, setNewReqText] = useState('');

  const isHR = user?.role === 'hr';
  const isGM = user?.role === 'gm';

  const isRequirementsLocked =
    selectedApp?.status === 'Hired' || selectedApp?.status === 'For Interview' || selectedApp?.status === 'Not Qualified';

  const canEditRequirements = Boolean(isHR && selectedApp && !isRequirementsLocked);
  const hasLoadedApplicationsRef = useRef(false);
  const fetchRequestIdRef = useRef(0);
  const profileFetchRequestIdRef = useRef(0);
  const autoLoadedDocumentKeyRef = useRef('');
  const isMountedRef = useRef(true);

  const fetchApplications = useCallback(async (options?: { silent?: boolean }) => {
    const requestId = fetchRequestIdRef.current + 1;
    fetchRequestIdRef.current = requestId;

    const showFullLoader = !options?.silent && !hasLoadedApplicationsRef.current;

    if (showFullLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      let { data, error: fetchError } = await withTimeout(
        supabase.from('applicants').select(APPLICANT_LIST_COLUMNS).order('created_at', { ascending: true }),
        15000,
        'Loading applications took too long. Please check your connection and try again.'
      );

      // If a local database is missing one of the optional lightweight columns,
      // retry with only the table fields needed for the list before using "*".
      if (fetchError) {
        const minimalFallback = await withTimeout(
          supabase.from('applicants').select(MINIMAL_APPLICANT_LIST_COLUMNS).order('created_at', { ascending: true }),
          15000,
          'Loading applications took too long. Please check your connection and try again.'
        );

        data = minimalFallback.data;
        fetchError = minimalFallback.error;
      }

      // Last-resort compatibility fallback for older schemas.
      if (fetchError) {
        const fullFallback = await withTimeout(
          supabase.from('applicants').select('*').order('created_at', { ascending: true }),
          15000,
          'Loading applications took too long. Please check your connection and try again.'
        );
        data = fullFallback.data;
        fetchError = fullFallback.error;
      }

      if (fetchError) throw fetchError;
      if (!isMountedRef.current || fetchRequestIdRef.current !== requestId) return;

      setApplications((data ?? []).map(mapApplicantRow));
      hasLoadedApplicationsRef.current = true;
    } catch (e: any) {
      if (!isMountedRef.current || fetchRequestIdRef.current !== requestId) return;
      setError(`Could not load applications: ${e.message}`);
    } finally {
      if (!isMountedRef.current || fetchRequestIdRef.current !== requestId) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void fetchApplications();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchApplications]);

  const sendApplicantStatusEmail = async (app: Application, status: AppStatus, overrides: Partial<Application> = {}) => {
    if (!app.email) return;

    const response = await fetch('/api/applications/send-status-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        applicant_id: app.id,
        email: app.email,
        name: buildApplicantFullName({ ...app, ...overrides }),
        position: overrides.position ?? app.position,
        status,
        note: overrides.interviewNotes ?? overrides.requirementsNote ?? overrides.hiringDecision ?? '',
        interview_date: overrides.interviewDate ?? app.interviewDate ?? '',
        interview_time: overrides.interviewTime ?? app.interviewTime ?? '',
        interview_location: overrides.interviewLocation ?? app.interviewLocation ?? '',
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || 'Unable to send application status email.');
    }
  };

  const updateApplicantRecord = async (
    id: string,
    dbUpdate: Record<string, any>,
    localUpdate: Partial<Application>,
    message: string,
    options?: { notifyStatus?: AppStatus }
  ) => {
    setSaving(true);

    try {
      const previousApp = applications.find(app => app.id === id) ?? selectedApp;
      const { error: updateError } = await supabase.from('applicants').update(dbUpdate).eq('applicant_id', id);

      if (updateError) throw updateError;

      setApplications(prev =>
        prev.map(app => {
          if (app.id !== id) return app;
          const updated = { ...app, ...localUpdate };
          return { ...updated, name: buildApplicantFullName(updated) };
        })
      );

      if (selectedApp?.id === id) {
        setSelectedApp(prev => {
          if (!prev) return prev;
          const updated = { ...prev, ...localUpdate };
          return { ...updated, name: buildApplicantFullName(updated) };
        });
      }

      if (options?.notifyStatus && previousApp?.email) {
        try {
          await sendApplicantStatusEmail(previousApp, options.notifyStatus, localUpdate);
          setSnackbar({ open: true, message: `${message} Applicant was notified by email.`, severity: 'success' });
        } catch (emailError: any) {
          setSnackbar({
            open: true,
            message: `${message} Email notification failed: ${emailError.message ?? emailError}`,
            severity: 'error',
          });
        }
      } else {
        setSnackbar({ open: true, message, severity: 'success' });
      }
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message}`, severity: 'error' });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = (id: string, status: AppStatus) =>
    updateApplicantRecord(
      id,
      { status },
      { status },
      `Status updated to "${status}"!`,
      status === 'For Interview' ? undefined : { notifyStatus: status }
    );

  const buildRequirementsStatusNote = (status: AppStatus) => {
    const standardRequirements: [string, boolean][] = [
      ['Resume / CV', reqForm.hasResume],
      ['Birth Certificate', reqForm.hasBirthCert],
      ['Transcript of Records', reqForm.hasTOR],
      ['Medical Certificate', reqForm.hasMedCert],
      ...(reqForm.customRequirements ?? []).map(item => [item.label, item.checked] as [string, boolean]),
    ];
    const submitted = standardRequirements.filter(([, checked]) => checked).map(([label]) => label);
    const missing = standardRequirements.filter(([, checked]) => !checked).map(([label]) => label);

    return [
      `Requirements status: ${status}.`,
      submitted.length ? `Submitted requirements: ${submitted.join(', ')}.` : '',
      missing.length ? `Pending/missing requirements: ${missing.join(', ')}.` : 'All listed requirements have been marked submitted.',
      reqForm.requirementsNote ? `HR note: ${reqForm.requirementsNote}` : '',
      'Please keep your Applicant ID for tracking your requirements and application status.',
    ].filter(Boolean).join('\n');
  };

  const handleSaveRequirements = async (id: string) => {
    const hasMissingStandard = !reqForm.hasResume || !reqForm.hasBirthCert || !reqForm.hasTOR || !reqForm.hasMedCert;
    const hasMissingCustom = (reqForm.customRequirements ?? []).some(item => !item.checked);
    const newStatus: AppStatus = hasMissingStandard || hasMissingCustom ? 'Missing Requirements' : 'Under Review';

    const localUpdate: Partial<Application> = {
      hasResume: reqForm.hasResume,
      hasBirthCert: reqForm.hasBirthCert,
      hasTOR: reqForm.hasTOR,
      hasMedCert: reqForm.hasMedCert,
      requirementsNote: reqForm.requirementsNote,
      customRequirements: reqForm.customRequirements,
      status: newStatus,
    };

    await updateApplicantRecord(
      id,
      applicationToApplicantUpdate(localUpdate),
      { ...localUpdate, requirementsNote: buildRequirementsStatusNote(newStatus) },
      'Requirements checklist saved!',
      { notifyStatus: newStatus }
    );
  };

  const handleScheduleInterview = async () => {
    if (!selectedApp) return;

    const localUpdate: Partial<Application> = {
      status: 'For Interview',
      interviewDate: iForm.interviewDate,
      interviewTime: iForm.interviewTime,
      interviewLocation: iForm.interviewLocation,
      interviewNotes: iForm.interviewNotes,
      scheduledBy: user?.name ?? '',
    };

    await updateApplicantRecord(
      selectedApp.id,
      applicationToApplicantUpdate(localUpdate),
      localUpdate,
      '✅ Interview scheduled! Status set to "For Interview".'
    );

    try {
      await sendApplicantStatusEmail(selectedApp, 'For Interview', localUpdate);
      setSnackbar({ open: true, message: 'Interview scheduled and applicant was notified by email.', severity: 'success' });
    } catch (emailError: any) {
      setSnackbar({
        open: true,
        message: `Interview scheduled, but email notification failed: ${emailError.message ?? emailError}`,
        severity: 'error',
      });
    }

    setInterviewDialog(false);
  };

  const saveEditedApplication = async () => {
    if (!selectedApp) return;

    const dbUpdate = applicationToApplicantUpdate(editAppForm);

    if (Object.keys(dbUpdate).length === 0) {
      setViewEditMode(false);
      return;
    }

    await updateApplicantRecord(selectedApp.id, dbUpdate, editAppForm, 'Application updated successfully.');
    setViewEditMode(false);
  };

  const handleHiringDecision = async (id: string, decision: 'Hired' | 'Not Qualified') => {
    const status: AppStatus = decision === 'Hired' ? 'Hired' : 'Not Qualified';

    try {
      await updateApplicantRecord(
        id,
        {
          interview_feedback: gmForm.interviewFeedback,
          hiring_decision: decision,
          status,
        },
        {
          interviewFeedback: gmForm.interviewFeedback,
          hiringDecision: decision,
          status,
        },
        `✅ Hiring decision: ${status}`
      );

      if (decision !== 'Hired') {
        const app = applications.find(application => application.id === id) ?? selectedApp;
        if (app) {
          try {
            await sendApplicantStatusEmail(app, status, {
              interviewFeedback: gmForm.interviewFeedback,
              hiringDecision: decision,
              status,
            });
            setSnackbar({ open: true, message: `Hiring decision: ${status}. Applicant was notified by email.`, severity: 'success' });
          } catch (emailError: any) {
            setSnackbar({
              open: true,
              message: `Hiring decision saved, but email notification failed: ${emailError.message ?? emailError}`,
              severity: 'error',
            });
          }
        }
        setViewDialog(false);
        return;
      }

      const app = applications.find(application => application.id === id) ?? selectedApp;
      if (!app) return;

      const firstName = app.firstName ?? '';
      const middleName = app.middleName ?? '';
      const lastName = app.lastName ?? '';
      const suffix = app.suffix ?? '';
      const fullName = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ') || app.name;
      const loginName = `${firstName}${lastName}`.replace(/\s+/g, '').toLowerCase() || app.id.toLowerCase();
      const sendHiredCredentialsEmail = async (payload: {
        applicantId: string;
        employeeId: string;
        recipientEmail: string;
        name: string;
        position: string;
        loginEmail: string;
        temporaryPassword: string;
      }) => {
        const response = await fetch('/api/applications/send-hired-credentials-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            applicant_id: payload.applicantId,
            employee_id: payload.employeeId,
            recipient_email: payload.recipientEmail,
            name: payload.name,
            position: payload.position,
            login_email: payload.loginEmail,
            temporary_password: payload.temporaryPassword,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || 'Unable to send hired credentials email.');
        }
      };

      const createOrResetHiredAccount = async (payload: {
        employeeId: string;
        name: string;
        email: string;
        password: string;
      }) => {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error('Your admin session has expired. Please sign in again.');

        const response = await fetch('/api/applications/hired-account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            employee_id: payload.employeeId,
            name: payload.name,
            email: payload.email,
            password: payload.password,
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            suffix,
            outlet: '',
          }),
        });

        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.message || body?.email || body?.supabase || 'Unable to create Supabase Auth account.');
        }

        return body;
      };

      const { data: existingEmployee, error: existingEmployeeError } = await supabase
        .from('employees')
        .select('employee_id')
        .eq('applicant_id', app.id)
        .maybeSingle();

      if (existingEmployeeError) throw existingEmployeeError;

      let employeeId = existingEmployee?.employee_id as string | undefined;

      if (!employeeId) {
        const { count: employeeCount, error: countError } = await supabase
          .from('employees')
          .select('*', { count: 'exact', head: true });

        if (countError) throw countError;
        employeeId = `EMP-2026-${String((employeeCount ?? 0) + 1).padStart(4, '0')}`;
      }

      const employeePayload = {
        employee_id: employeeId,
        applicant_id: app.id,
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        suffix,
        email: app.email ?? '',
        phone_number: app.phone ?? '',
        address: app.address ?? '',
        gender: app.gender ?? '',
        civil_status: app.civilStatus ?? '',
        birthdate: app.birthdate || null,
        birthplace: app.birthplace ?? '',
        position: app.position ?? '',
        outlet: '',
        status: 'Active',
        hire_date: new Date().toISOString().split('T')[0],
        education: app.education ?? '',
        experience: app.experience ?? '',
        tin: app.tin ?? '',
        sss: app.sss ?? '',
        philhealth: app.philhealth ?? '',
        pagibig: app.pagibig ?? '',
        emergency_contact: app.emergencyContact ?? '',
      };

      const { error: employeeSaveError } = existingEmployee
        ? await supabase.from('employees').update(employeePayload).eq('employee_id', employeeId)
        : await supabase.from('employees').insert(employeePayload);

      if (employeeSaveError) throw employeeSaveError;

      const loginEmail = `${loginName}@buenaventura-hris.me`;
      const temporaryPassword = generateTemporaryPassword(loginName);
      await createOrResetHiredAccount({
        employeeId,
        name: fullName,
        email: loginEmail,
        password: temporaryPassword,
      });

      setSnackbar({
        open: true,
        message: `Applicant hired and employee Supabase Auth account is ready. Temporary password: ${temporaryPassword}`,
        severity: 'success',
      });

      try {
        await sendHiredCredentialsEmail({
          applicantId: app.id,
          employeeId,
          recipientEmail: app.email ?? '',
          name: fullName,
          position: app.position ?? '',
          loginEmail,
          temporaryPassword,
        });
      } catch (emailError: any) {
        console.warn('Hired credentials email failed:', emailError);
        setSnackbar({
          open: true,
          message: `Applicant hired, but the credentials email could not be sent. Login: ${loginEmail} | Temporary password: ${temporaryPassword}`,
          severity: 'error',
        });
      }

      setViewDialog(false);
      void fetchApplications({ silent: true });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message}`, severity: 'error' });
    }
  };

  const handleArchiveToggle = async (app: Application, archive: boolean) => {
    const action = archive ? 'archive' : 'restore';
    if (!window.confirm(`${archive ? 'Archive' : 'Restore'} application ${app.id}?`)) return;

    try {
      const archivePayload = archive
        ? {
            status: 'Archived',
            requirements_note: [
              app.requirementsNote,
              `Archived ${new Date().toLocaleString()} by ${user?.email ?? user?.name ?? 'HR/Admin'} for applicant record retention.`,
            ].filter(Boolean).join('\n'),
          }
        : {
            status: 'Submitted',
            requirements_note: app.requirementsNote ?? null,
          };

      const { error: archiveError } = await supabase.from('applicants').update(archivePayload).eq('applicant_id', app.id);
      if (archiveError) throw archiveError;

      setApplications(prev =>
        prev.map(item =>
          item.id === app.id
            ? {
                ...item,
                isArchived: archive,
                status: archive ? 'Archived' : 'Submitted',
                requirementsNote: archivePayload.requirements_note ?? '',
              }
            : item
        )
      );
      setSnackbar({
        open: true,
        message: `Application ${action}d successfully. The record remains retained in the archive.`,
        severity: 'success',
      });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed to ${action}: ${e.message}`, severity: 'error' });
    }
  };

  const setFormsFromApplication = (app: Application) => {
    setReqForm({
      hasResume: app.hasResume ?? false,
      hasBirthCert: app.hasBirthCert ?? false,
      hasTOR: app.hasTOR ?? false,
      hasMedCert: app.hasMedCert ?? false,
      requirementsNote: app.requirementsNote ?? '',
      customRequirements: app.customRequirements ?? [],
    });
    setGmForm({
      interviewFeedback: app.interviewFeedback ?? '',
      hiringDecision: app.hiringDecision ?? '',
    });
  };

  const openView = async (app: Application) => {
    const requestId = profileFetchRequestIdRef.current + 1;
    profileFetchRequestIdRef.current = requestId;

    setSelectedApp(app);
    setFormsFromApplication(app);
    setEditAppForm({});
    setViewEditMode(false);
    setDocumentsLoading(false);
    setLoadingDocumentName(null);
    setPreviewDoc(null);
    autoLoadedDocumentKeyRef.current = '';
    setViewDialog(true);
    setProfileLoading(true);

    // Let the dialog paint first before starting network work.
    // This makes the Application dialog feel instant instead of frozen.
    await waitForNextPaint();

    if (!isMountedRef.current || profileFetchRequestIdRef.current !== requestId) return;

    try {
      const { data, error: fetchError } = await withTimeout(
        supabase.from('applicants').select(APPLICANT_PROFILE_COLUMNS).eq('applicant_id', app.id).single(),
        PROFILE_DIALOG_TIMEOUT_MS,
        'Loading the application profile took too long. Basic applicant details are shown for now.'
      );

      if (fetchError) throw fetchError;
      if (!isMountedRef.current || profileFetchRequestIdRef.current !== requestId) return;

      const fullApp = mapApplicantRow(data);
      setSelectedApp(fullApp);
      setFormsFromApplication(fullApp);
    } catch (err) {
      console.warn('[RecruitmentManagement] openView profile fetch failed, using table data:', err);

      if (isMountedRef.current && profileFetchRequestIdRef.current === requestId) {
        setSnackbar({
          open: true,
          message: 'Showing basic applicant details. Full profile fields could not be loaded right now.',
          severity: 'error',
        });
      }
    } finally {
      if (!isMountedRef.current || profileFetchRequestIdRef.current !== requestId) return;
      setProfileLoading(false);
    }
  };

  const closeViewDialog = () => {
    profileFetchRequestIdRef.current += 1;
    setViewEditMode(false);
    setProfileLoading(false);
    setDocumentsLoading(false);
    setLoadingDocumentName(null);
    autoLoadedDocumentKeyRef.current = '';
    setViewDialog(false);
  };


  const searchedApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    const scopedApplications = applications.filter(app => (archiveView === 'archived' ? app.isArchived : !app.isArchived));
    if (!query) return scopedApplications;

    return scopedApplications.filter(app =>
      [
        app.id,
        app.name,
        app.position,
        app.email,
        app.phone,
        app.status,
        app.date,
        app.interviewDate,
        app.hearAbout,
      ].some(value => String(value ?? '').toLowerCase().includes(query))
    );
  }, [applications, archiveView, search]);

  const tabData = useMemo(
    () => [
      { label: 'All', data: searchedApplications },
      { label: 'Submitted', data: searchedApplications.filter(a => a.status === 'Submitted') },
      { label: 'Under Review', data: searchedApplications.filter(a => a.status === 'Under Review') },
      { label: 'Missing Requirements', data: searchedApplications.filter(a => a.status === 'Missing Requirements') },
      { label: 'For Interview', data: searchedApplications.filter(a => a.status === 'For Interview') },
      { label: 'Hired', data: searchedApplications.filter(a => a.status === 'Hired') },
      { label: 'Not Qualified', data: searchedApplications.filter(a => a.status === 'Not Qualified') },
      { label: 'Not Hired', data: searchedApplications.filter(a => a.status === 'Not Hired') },
      { label: 'Archived', data: searchedApplications.filter(a => a.status === 'Archived') },
    ],
    [searchedApplications]
  );

  const displayData = tabData[tab]?.data ?? searchedApplications;

  const recruitmentStats = useMemo(
    () => [
      {
        label: 'Total Applications',
        value: applications.length,
        caption: 'All submitted applicants',
        icon: <InsertDriveFile fontSize="small" />,
      },
      {
        label: 'For Review',
        value: applications.filter(a => a.status === 'Submitted' || a.status === 'Under Review').length,
        caption: 'Needs HR checking',
        icon: <EditNote fontSize="small" />,
      },
      {
        label: 'For Interview',
        value: applications.filter(a => a.status === 'For Interview').length,
        caption: 'Ready for schedule / decision',
        icon: <Event fontSize="small" />,
      },
      {
        label: 'Hired',
        value: applications.filter(a => a.status === 'Hired').length,
        caption: 'Converted to employees',
        icon: <TaskAlt fontSize="small" />,
      },
    ],
    [applications]
  );

  const updateEditField = (field: keyof Application, value: any) => {
    setEditAppForm(prev => ({ ...prev, [field]: value }));
  };

  const getEditableValue = (field: keyof Application, fallback: any) => {
    const value = editAppForm[field];
    return value === undefined || value === null ? fallback ?? '' : value;
  };

  const renderProfileField = (
    label: string,
    value: any,
    size: { xs: number; sm?: number; md?: number } = { xs: 12, sm: 6 },
    field?: keyof Application,
    options?: { multiline?: boolean; rows?: number; type?: string }
  ) => {
    const editable = Boolean(viewEditMode && field);

    return (
      <Grid size={size}>
        <TextField
          fullWidth
          label={label}
          value={editable && field ? getEditableValue(field, value) : displayValue(value)}
          disabled={!editable}
          size="small"
          type={options?.type}
          multiline={options?.multiline}
          rows={options?.rows}
          InputLabelProps={options?.type === 'date' ? { shrink: true } : undefined}
          onChange={event => field && updateEditField(field, event.target.value)}
          sx={softTextFieldSx}
        />
      </Grid>
    );
  };

  const renderProfileSectionTitle = (title: string) => (
    <Grid size={12}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          mt: 1.25,
          mb: 0.75,
          px: 1.25,
          py: 1,
          borderRadius: '16px',
          bgcolor: 'rgba(230, 248, 233, 0.58)',
          border: `1px solid ${GREEN_UI.border}`,
        }}
      >
        <Box
          sx={{
            width: 8,
            height: 28,
            borderRadius: '999px',
            background: `linear-gradient(180deg, ${GREEN_UI.green}, rgba(58, 168, 101, 0.18))`,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ color: GREEN_UI.greenDark, letterSpacing: 0.35, textTransform: 'uppercase' }}
        >
          {title}
        </Typography>
      </Box>
    </Grid>
  );

  const renderRequirementChecklist = () => (
    <Grid size={12}>
      <Paper elevation={0} sx={{ p: { xs: 1.75, sm: 2.25 }, ...innerCardSx }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
          <Box>
            <Typography fontWeight={600}>Requirements Checklist</Typography>
            <Typography variant="caption" color="text.secondary">
              HR can mark submitted requirements before interview scheduling.
            </Typography>
          </Box>

          {isHR && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<EditNote />}
              onClick={() => setEditReqDialog(true)}
              disabled={saving || Boolean(isRequirementsLocked)}
              sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
            >
              Edit Checklist
            </Button>
          )}
        </Box>

        <FormGroup>
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reqForm.hasResume}
                    disabled={!canEditRequirements || saving}
                    onChange={event => setReqForm({ ...reqForm, hasResume: event.target.checked })}
                  />
                }
                label="Resume / CV"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reqForm.hasBirthCert}
                    disabled={!canEditRequirements || saving}
                    onChange={event => setReqForm({ ...reqForm, hasBirthCert: event.target.checked })}
                  />
                }
                label="Birth Certificate"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reqForm.hasTOR}
                    disabled={!canEditRequirements || saving}
                    onChange={event => setReqForm({ ...reqForm, hasTOR: event.target.checked })}
                  />
                }
                label="Transcript of Records / Diploma"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reqForm.hasMedCert}
                    disabled={!canEditRequirements || saving}
                    onChange={event => setReqForm({ ...reqForm, hasMedCert: event.target.checked })}
                  />
                }
                label="Medical Certificate"
              />
            </Grid>
          </Grid>

          {(reqForm.customRequirements ?? []).map((customRequirement, index) => (
            <FormControlLabel
              key={`${customRequirement.label}-${index}`}
              control={
                <Checkbox
                  checked={customRequirement.checked}
                  disabled={!canEditRequirements || saving}
                  onChange={event => {
                    const updated = [...(reqForm.customRequirements ?? [])];
                    updated[index] = { ...updated[index], checked: event.target.checked };
                    setReqForm({ ...reqForm, customRequirements: updated });
                  }}
                />
              }
              label={customRequirement.label}
            />
          ))}
        </FormGroup>

        <TextField
          fullWidth
          label="Requirements Note"
          size="small"
          multiline
          rows={2}
          value={reqForm.requirementsNote}
          disabled={!canEditRequirements || saving}
          onChange={event => setReqForm({ ...reqForm, requirementsNote: event.target.value })}
          sx={{ mt: 1.5, ...softTextFieldSx }}
        />

        {isHR && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
            <Button
              variant="contained"
              size="small"
              onClick={() => selectedApp && handleSaveRequirements(selectedApp.id)}
              sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
              disabled={!canEditRequirements || saving || !selectedApp}
              startIcon={saving ? <CircularProgress color="inherit" size={16} /> : <TaskAlt />}
            >
              Save Requirements
            </Button>
          </Box>
        )}
      </Paper>
    </Grid>
  );

  const autoLoadDocumentData = useCallback(async (app: Application) => {
    setDocumentsLoading(true);
    setLoadingDocumentName(null);

    // Let the dialog and document cards paint first, then load the saved base64 data automatically.
    await waitForNextPaint();

    try {
      let mergedApp = app;

      try {
        const fileData = loadApplicationFiles(app.id);
        if (fileData) {
          mergedApp = { ...mergedApp, ...fileData } as Application;
        }
      } catch (fileError) {
        console.warn('[RecruitmentManagement] Automatic local file load failed:', fileError);
      }

      const submittedDocumentNames = getSubmittedDocumentsForApplication(mergedApp);
      const docs = buildDocumentsForApplication(mergedApp, submittedDocumentNames);
      const resumeNeedsData = Boolean(
        mergedApp.resumeFileName &&
          !mergedApp.resumeFileData &&
          docs.some(document => document.name === mergedApp.resumeFileName && !document.data)
      );
      const supportingNeedsData = Boolean(
        (mergedApp.supportingDocuments?.length ?? 0) > 0 &&
          (mergedApp.supportingDocumentFiles?.length ?? 0) === 0
      );

      let resumeFileData = mergedApp.resumeFileData;
      let supportingDocumentFiles = mergedApp.supportingDocumentFiles;

      if (resumeNeedsData || supportingNeedsData) {
        try {
          const { data, error: resumeFetchError } = await withTimeout(
            supabase
              .from('applicants')
              .select('resume_file_data, supporting_document_files')
              .eq('applicant_id', mergedApp.id)
              .single(),
            DOCUMENT_LOAD_TIMEOUT_MS,
            'Loading the selected document took too long. Please try again.'
          );

          if (!resumeFetchError && data?.resume_file_data) {
            resumeFileData = data.resume_file_data;
          }
          if (!resumeFetchError && data?.supporting_document_files) {
            supportingDocumentFiles = ensureArray<DocFile>(data.supporting_document_files);
          }
        } catch (resumeError) {
          console.warn('[RecruitmentManagement] Automatic document data fetch failed:', resumeError);
        }
      }

      if (!isMountedRef.current) return;

      setSelectedApp(prev => {
        if (!prev || prev.id !== app.id) return prev;
        return { ...prev, ...mergedApp, resumeFileData, supportingDocumentFiles };
      });
    } finally {
      if (!isMountedRef.current) return;
      setDocumentsLoading(false);
      setLoadingDocumentName(null);
    }
  }, []);

  useEffect(() => {
    if (!viewDialog || !selectedApp || profileLoading || documentsLoading) return;

    const submittedDocumentNames = getSubmittedDocumentsForApplication(selectedApp);
    const docs = buildDocumentsForApplication(selectedApp, submittedDocumentNames);
    if (docs.length === 0 || docs.every(document => Boolean(document.data))) return;

    const documentKey = `${selectedApp.id}:${docs.map(document => document.name).join('|')}`;
    if (autoLoadedDocumentKeyRef.current === documentKey) return;

    autoLoadedDocumentKeyRef.current = documentKey;
    void autoLoadDocumentData(selectedApp);
  }, [autoLoadDocumentData, documentsLoading, profileLoading, selectedApp, viewDialog]);

  const loadDocumentDataForAction = async (doc: DocumentItem): Promise<DocumentItem | null> => {
    if (doc.data) return doc;

    if (!selectedApp) return null;

    setDocumentsLoading(true);
    setLoadingDocumentName(doc.name);

    // Give the button spinner a chance to render before reading large base64 file data.
    await waitForNextPaint();

    try {
      let mergedApp = selectedApp;

      try {
        const fileData = loadApplicationFiles(selectedApp.id);
        if (fileData) {
          mergedApp = { ...selectedApp, ...fileData } as Application;
          setSelectedApp(mergedApp);
        }
      } catch (fileError) {
        console.warn('[RecruitmentManagement] Local file load failed:', fileError);
      }

      const submittedDocumentNames = getSubmittedDocumentsForApplication(mergedApp);

      let loadedDoc = buildDocumentsForApplication(mergedApp, submittedDocumentNames).find(
        item => item.name === doc.name && Boolean(item.data)
      );

      // Manual fallback: if automatic loading has not completed yet, fetch the resume data here.
      if (!loadedDoc?.data && mergedApp.resumeFileName === doc.name) {
        try {
          const { data, error: resumeFetchError } = await withTimeout(
            supabase
              .from('applicants')
              .select('resume_file_data, supporting_document_files')
              .eq('applicant_id', mergedApp.id)
              .single(),
            DOCUMENT_LOAD_TIMEOUT_MS,
            'Loading the selected document took too long. Please try again.'
          );

          if (!resumeFetchError && data?.resume_file_data) {
            loadedDoc = { ...doc, data: data.resume_file_data, type: doc.type || getFileTypeFromName(doc.name) };
            setSelectedApp(prev =>
              prev?.id === mergedApp.id ? { ...prev, resumeFileData: data.resume_file_data } : prev
            );
          }
          if (!resumeFetchError && data?.supporting_document_files) {
            const supportingDocumentFiles = ensureArray<DocFile>(data.supporting_document_files);
            const supportingDoc = supportingDocumentFiles.find(file => file.name === doc.name && file.data);
            if (supportingDoc) {
              loadedDoc = { name: supportingDoc.name, data: supportingDoc.data, type: supportingDoc.type || doc.type || getFileTypeFromName(supportingDoc.name) };
              setSelectedApp(prev =>
                prev?.id === mergedApp.id ? { ...prev, supportingDocumentFiles } : prev
              );
            }
          }
        } catch (resumeError) {
          console.warn('[RecruitmentManagement] Document data fetch failed:', resumeError);
        }
      }

      if (!loadedDoc?.data && mergedApp.resumeFileName !== doc.name) {
        try {
          const { data, error: supportingFetchError } = await withTimeout(
            supabase
              .from('applicants')
              .select('supporting_document_files')
              .eq('applicant_id', mergedApp.id)
              .single(),
            DOCUMENT_LOAD_TIMEOUT_MS,
            'Loading the selected document took too long. Please try again.'
          );

          if (!supportingFetchError && data?.supporting_document_files) {
            const supportingDocumentFiles = ensureArray<DocFile>(data.supporting_document_files);
            const supportingDoc = supportingDocumentFiles.find(file => file.name === doc.name && file.data);
            if (supportingDoc) {
              loadedDoc = { name: supportingDoc.name, data: supportingDoc.data, type: supportingDoc.type || doc.type || getFileTypeFromName(supportingDoc.name) };
              setSelectedApp(prev =>
                prev?.id === mergedApp.id ? { ...prev, supportingDocumentFiles } : prev
              );
            }
          }
        } catch (supportingError) {
          console.warn('[RecruitmentManagement] Supporting document data fetch failed:', supportingError);
        }
      }

      if (!loadedDoc?.data) {
        setSnackbar({
          open: true,
          message: 'File data is not available for this document. Only the filename was saved.',
          severity: 'error',
        });
        return null;
      }

      return loadedDoc;
    } finally {
      setDocumentsLoading(false);
      setLoadingDocumentName(null);
    }
  };

  const handlePreviewDocument = async (doc: DocumentItem) => {
    const documentToPreview = await loadDocumentDataForAction(doc);
    if (!documentToPreview?.data) return;

    setPreviewDoc({
      name: documentToPreview.name,
      data: documentToPreview.data,
      type: documentToPreview.type || getFileTypeFromName(documentToPreview.name),
    });
  };

  const handleDownloadDocument = async (doc: DocumentItem) => {
    const documentToDownload = await loadDocumentDataForAction(doc);
    if (!documentToDownload?.data) return;

    downloadFile(documentToDownload.data, documentToDownload.name);
  };

  const renderDocumentCard = (doc: DocumentItem, index: number) => {
    const type = doc.type || getFileTypeFromName(doc.name);
    const hasData = Boolean(doc.data);
    const isLoadingThisDocument = documentsLoading && (!loadingDocumentName || loadingDocumentName === doc.name);

    return (
      <Grid key={`${doc.name}-${index}`} size={{ xs: 12, sm: 6 }}>
        <Paper
          elevation={0}
          sx={{
            p: 1.6,
            ...innerCardSx,
            transition: 'transform 180ms ease, box-shadow 180ms ease',
            '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 18px 36px rgba(43, 91, 55, 0.12)' },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DocIcon name={doc.name} type={type} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography fontWeight={600} noWrap>
                {doc.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {hasData
                  ? 'File ready for preview and download'
                  : documentsLoading
                    ? 'Loading file data automatically…'
                    : 'File data will load automatically when the application opens'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={isLoadingThisDocument ? <CircularProgress color="inherit" size={14} /> : <Visibility />}
              disabled={documentsLoading}
              onClick={() => handlePreviewDocument({ ...doc, type })}
              sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
            >
              {isLoadingThisDocument ? 'Loading…' : 'Preview'}
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={isLoadingThisDocument ? <CircularProgress color="inherit" size={14} /> : <FileDownload />}
              disabled={documentsLoading}
              onClick={() => handleDownloadDocument({ ...doc, type })}
              sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
            >
              {isLoadingThisDocument ? 'Loading…' : 'Download'}
            </Button>
          </Box>
        </Paper>
      </Grid>
    );
  };

  const renderDocumentsSection = (submittedDocuments: string[]) => {
    const docs = buildDocumentsForApplication(selectedApp, submittedDocuments);

    return (
      <>
        {renderProfileSectionTitle('VII. DOCUMENTS')}
        {renderProfileField('Resume / Biodata', selectedApp?.resumeFileName ? `Uploaded: ${selectedApp.resumeFileName}` : selectedApp?.hasResume ? 'Submitted' : 'Not Submitted')}
        {renderProfileField('Birth Certificate', selectedApp?.hasBirthCert ? 'Submitted' : 'Not Submitted')}
        {renderProfileField('Transcript of Records / Diploma', selectedApp?.hasTOR ? 'Submitted' : 'Not Submitted')}
        {renderProfileField('Medical Certificate', selectedApp?.hasMedCert ? 'Submitted' : 'Not Submitted')}
        {renderProfileField('Submitted Documents', submittedDocuments, { xs: 12 })}

        <Grid size={12}>
          <Grid container spacing={1.5}>
            {documentsLoading && (
              <Grid size={12}>
                <LinearProgress sx={{ mb: 0.75 }} />
                <Typography variant="caption" color="text.secondary">
                  Loading document data automatically…
                </Typography>
              </Grid>
            )}

            {docs.length > 0 ? (
              docs.map(renderDocumentCard)
            ) : (
              <Grid size={12}>
                <Alert severity="info">No document filenames were found for this application yet.</Alert>
              </Grid>
            )}
          </Grid>
        </Grid>
      </>
    );
  };

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
            left: { xs: '70%', md: '44%' },
            bottom: -95,
            background: 'rgba(174, 222, 144, 0.18)',
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', md: 'center' },
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box sx={{ maxWidth: 720 }}>
            <Chip
              icon={<PersonSearch />}
              label="Recruitment Workspace"
              size="small"
              sx={{
                ...chipIconSx,
                mb: 1.2,
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                fontWeight: 700,
              }}
            />
            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
                color: GREEN_UI.text,
                letterSpacing: '-0.04em',
                lineHeight: 1.08,
                mb: 0.75,
              }}
            >
              Recruitment & Application Management
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              {isHR
                ? 'Review applications, verify requirements, schedule interviews, and keep each applicant moving smoothly through the hiring flow.'
                : isGM
                  ? 'Review interview-ready applicants and record final hiring decisions in a clean, focused workspace.'
                  : 'View submitted job applications and their current processing status.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="Refresh applications">
              <span>
                <Button
                  variant="contained"
                  startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={() => fetchApplications({ silent: true })}
                  disabled={loading || refreshing}
                  sx={{
                    ...pillButtonSx,
                    py: 1.1,
                    bgcolor: GREEN_UI.green,
                    boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                    '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
                  }}
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {recruitmentStats.map(stat => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                ...softCardSx,
                p: 2,
                minHeight: 126,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 180ms ease, box-shadow 180ms ease',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 22px 48px rgba(43, 91, 55, 0.13)' },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.5 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 500 }}>
                    {stat.label}
                  </Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ color: GREEN_UI.text, mt: 0.5, letterSpacing: '-0.04em' }}>
                    {stat.value}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: '16px',
                    display: 'grid',
                    placeItems: 'center',
                    bgcolor: GREEN_UI.greenSoft,
                    color: GREEN_UI.greenDark,
                    flexShrink: 0,
                  }}
                >
                  {stat.icon}
                </Box>
              </Box>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted, mt: 1.2 }}>
                {stat.caption}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={() => fetchApplications()} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '16px',
              display: 'grid',
              placeItems: 'center',
              bgcolor: GREEN_UI.greenSoft,
              color: GREEN_UI.greenDark,
            }}
          >
            <PersonSearch fontSize="small" />
          </Box>
          <Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              Applicant Directory
            </Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              Search by application ID, applicant, position, contact, status, or source.
            </Typography>
          </Box>
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder="Search applications..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          sx={softTextFieldSx}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <PersonSearch sx={{ color: GREEN_UI.greenDark }} fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
          <Chip
            icon={<InsertDriveFile />}
            label={`Active Records (${applications.filter(app => !app.isArchived).length})`}
            clickable
            variant={archiveView === 'active' ? 'filled' : 'outlined'}
            onClick={() => {
              setArchiveView('active');
              setTab(0);
            }}
            sx={{
              ...chipIconSx,
              fontWeight: 700,
              bgcolor: archiveView === 'active' ? GREEN_UI.greenSoft : '#ffffff',
              color: GREEN_UI.greenDark,
              borderColor: GREEN_UI.borderStrong,
            }}
          />
          <Chip
            icon={<ArchiveOutlined />}
            label={`Archived Records (${applications.filter(app => app.isArchived).length})`}
            clickable
            variant={archiveView === 'archived' ? 'filled' : 'outlined'}
            onClick={() => {
              setArchiveView('archived');
              setTab(0);
            }}
            sx={{
              ...chipIconSx,
              fontWeight: 700,
              bgcolor: archiveView === 'archived' ? '#fff7e0' : '#ffffff',
              color: archiveView === 'archived' ? '#9b6b00' : GREEN_UI.greenDark,
              borderColor: archiveView === 'archived' ? '#f5d786' : GREEN_UI.borderStrong,
            }}
          />
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ ...softCardSx, mb: 2, p: { xs: 0.75, sm: 1 }, overflow: 'hidden' }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 52,
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTab-root': {
              minHeight: 42,
              mx: 0.35,
              my: 0.5,
              px: 1.6,
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 700,
              color: GREEN_UI.muted,
              transition: 'all 180ms ease',
            },
            '& .Mui-selected': {
              bgcolor: GREEN_UI.greenSoft,
              color: `${GREEN_UI.greenDark} !important`,
              boxShadow: 'inset 0 0 0 1px rgba(58, 168, 101, 0.18)',
            },
          }}
        >
          {tabData.map((tabItem, index) => (
            <Tab key={tabItem.label} label={`${tabItem.label} (${tabItem.data.length})`} value={index} />
          ))}
        </Tabs>
      </Paper>

      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          ...softCardSx,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { height: 10 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#cfe8d1'},
        }}
      >
        {refreshing && !loading && <LinearProgress sx={{ bgcolor: '#edf7eb', '& .MuiLinearProgress-bar': { bgcolor: GREEN_UI.green } }} />}
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 7, gap: 2 }}>
            <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 500 }}>Loading applications…</Typography>
          </Box>
        ) : (
          <Table sx={{ minWidth: 850, '& th, & td': { borderColor: 'rgba(139, 184, 144, 0.16)' } }}>
            <TableHead>
              <TableRow
                sx={{
                  background: 'linear-gradient(90deg, #eff8eb 0%, #f8fcf5 100%)',
                  '& th': {
                    color: GREEN_UI.greenDark,
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase',
                    py: 1.7,
                  },
                }}
              >
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    App ID
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    Applicant Name
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    Position
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    Date Applied
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    Interview Date
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    Status
                  </Box>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 210 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <TuneOutlined sx={tableHeaderIconSx} />
                    Actions
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 7 }}>
                    <Box sx={{ maxWidth: 360, mx: 'auto' }}>
                      <Box
                        sx={{
                          width: 54,
                          height: 54,
                          borderRadius: '20px',
                          display: 'grid',
                          placeItems: 'center',
                          mx: 'auto',
                          mb: 1.5,
                          bgcolor: GREEN_UI.greenSoft,
                          color: GREEN_UI.greenDark,
                        }}
                      >
                        <InsertDriveFile />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        No applications in this category
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        Once applicants reach this status, they will appear here automatically.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                displayData.map(app => (
                  <TableRow
                    key={app.id}
                    hover
                    sx={{
                      transition: 'background 160ms ease',
                      '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                      '& td': { py: 1.55, color: GREEN_UI.text },
                    }}
                  >
                    <TableCell>
                      <Chip
                        icon={<BadgeOutlined />}
                        label={app.id}
                        size="small"
                        variant="outlined"
                        sx={{
                          ...chipIconSx,
                          fontWeight: 600,
                          bgcolor: '#f8fcf5',
                          borderColor: GREEN_UI.border,
                          color: GREEN_UI.greenDark,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: '14px',
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: GREEN_UI.greenSoft,
                            color: GREEN_UI.greenDark,
                            flexShrink: 0,
                            fontWeight: 600,
                            fontSize: '0.82rem',
                          }}
                        >
                          {app.name?.charAt(0)?.toUpperCase() || 'A'}
                        </Box>
                        <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>
                          {app.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <WorkOutline sx={{ fontSize: 17, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 500 }}>
                          {app.position || '—'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: GREEN_UI.muted, fontWeight: 500 }}>
                        <CalendarToday sx={{ fontSize: 17, color: GREEN_UI.greenDark }} />
                        {formatDateTime(app.dateApplied)}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: GREEN_UI.muted, fontWeight: 500 }}>
                        <EventAvailable sx={{ fontSize: 17, color: GREEN_UI.greenDark }} />
                        {formatInterviewDateTime(app.interviewDate, app.interviewTime)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={<TaskAlt />}
                        label={app.status}
                        size="small"
                        variant="outlined"
                        sx={{ ...chipIconSx, ...statusChipSx(app.status), whiteSpace: 'nowrap' }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          icon={<Visibility />}
                          label="View Profile"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => openView(app)}
                          sx={{
                            ...chipIconSx,
                            minWidth: 110,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: GREEN_UI.borderStrong,
                            color: GREEN_UI.greenDark,
                            bgcolor: '#ffffff',
                            '&:hover': { bgcolor: GREEN_UI.greenSoft },
                          }}
                        />
                        {isGM && app.status === 'For Interview' && (
                          <Chip
                            icon={<HowToReg />}
                            label="Hiring Decision"
                            size="small"
                            clickable
                            variant="outlined"
                            onClick={() => openView(app)}
                            sx={{
                              ...chipIconSx,
                              minWidth: 122,
                              justifyContent: 'center',
                              fontWeight: 600,
                              borderColor: '#a9dfb6',
                              color: GREEN_UI.greenDark,
                              bgcolor: '#f4fbf5',
                              '&:hover': { bgcolor: '#e5f8e9' },
                            }}
                          />
                        )}
                        {(isHR || isGM) && (
                          <Chip
                            icon={app.isArchived ? <UnarchiveOutlined /> : <ArchiveOutlined />}
                            label={app.isArchived ? 'Restore' : 'Archive'}
                            size="small"
                            clickable
                            variant="outlined"
                            onClick={() => handleArchiveToggle(app, !app.isArchived)}
                            sx={{
                              ...chipIconSx,
                              minWidth: 86,
                              justifyContent: 'center',
                              fontWeight: 600,
                              borderColor: app.isArchived ? '#a9dfb6' : '#f5d786',
                              color: app.isArchived ? GREEN_UI.greenDark : '#9b6b00',
                              bgcolor: app.isArchived ? GREEN_UI.greenSoft : '#fff7e0',
                              '&:hover': { bgcolor: app.isArchived ? '#dff4e4' : '#ffefd0' },
                            }}
                          />
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <Dialog
        open={viewDialog}
        onClose={closeViewDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: { xs: '22px', sm: '30px' },
            overflow: 'hidden',
            border: `1px solid ${GREEN_UI.border}`,
            background: '#fbfff9',
            boxShadow: '0 28px 70px rgba(27, 73, 37, 0.18)',
          },
        }}
      >
        <DialogTitle
          fontWeight={700}
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.25,
            background: 'linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)',
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '14px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: GREEN_UI.greenSoft,
                  color: GREEN_UI.greenDark,
                  flexShrink: 0,
                }}
              >
                <PersonSearch fontSize="small" />
              </Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Application — {selectedApp?.id}
              </Typography>
            </Box>
            {selectedApp && (
              <Chip
                icon={<TaskAlt />}
                label={selectedApp.status}
                size="small"
                variant="outlined"
                sx={{ ...chipIconSx, ...statusChipSx(selectedApp.status) }}
              />
            )}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9', maxHeight: { xs: '72vh', sm: '76vh' } }}>
          {profileLoading && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Basic details are shown first while the full application profile loads…
              </Typography>
            </Box>
          )}

          {selectedApp &&
            (() => {
              const raw = selectedApp.raw ?? {};
              const extra = safeJsonParse(selectedApp.coverLetter);

              const educationBackground =
                extra.educationBackground ?? extra.educationalBackground ?? raw.educational_background ?? {};

              const workExperience = extra.workExperience ?? raw.work_experience ?? {};

              const skills =
                Array.isArray(raw.skills) && raw.skills.length
                  ? raw.skills
                  : Array.isArray(extra.skills)
                    ? extra.skills
                    : [];

              const certifications =
                Array.isArray(raw.certifications) && raw.certifications.length
                  ? raw.certifications
                  : Array.isArray(extra.certifications)
                    ? extra.certifications
                    : [];

              const characterReferences =
                Array.isArray(raw.character_references) && raw.character_references.length
                  ? raw.character_references
                  : Array.isArray(extra.characterReferences)
                    ? extra.characterReferences
                    : raw.reference_name
                      ? [
                          {
                            name: raw.reference_name,
                            position: raw.reference_position,
                            company: raw.reference_company,
                            contact: raw.reference_contact,
                          },
                        ]
                      : [];

              const emergencyContact =
                extra.emergencyContact ??
                (raw.emergency_contact_name || raw.emergency_contact_phone
                  ? {
                      name: raw.emergency_contact_name,
                      relation: raw.emergency_contact_relation,
                      phone: raw.emergency_contact_phone,
                      address: raw.emergency_contact_address,
                    }
                  : {});

              const submittedDocuments = getSubmittedDocumentsForApplication(selectedApp);

              const currentAddress =
                raw.current_address ?? extra.currentAddress ?? buildAddressText(extra.currentAddressParts, selectedApp.address);

              const permanentAddress =
                raw.permanent_address ?? extra.permanentAddress ?? buildAddressText(extra.permanentAddressParts);

              return (
                <Grid container spacing={2} sx={{ pt: 1 }}>
                  {renderProfileSectionTitle('I. POSITION APPLIED FOR')}
                  {renderProfileField('Position Applied For', selectedApp.position, { xs: 12, sm: 6 }, 'position')}
                  {renderProfileField('How did you hear about this job opening?', raw.hear_about ?? extra.hearAbout)}
                  {(raw.hear_about_other || extra.hearAboutOther) &&
                    renderProfileField('Other Source', raw.hear_about_other ?? extra.hearAboutOther, { xs: 12 })}

                  {renderProfileSectionTitle('II. PERSONAL DETAILS')}
                  {renderProfileField('First Name', selectedApp.firstName, { xs: 12, sm: 6 }, 'firstName')}
                  {renderProfileField('Middle Name', selectedApp.middleName, { xs: 12, sm: 6 }, 'middleName')}
                  {renderProfileField('Last Name', selectedApp.lastName, { xs: 12, sm: 6 }, 'lastName')}
                  {renderProfileField('Suffix', selectedApp.suffix, { xs: 12, sm: 6 }, 'suffix')}
                  {renderProfileField('Full Name', buildApplicantFullName({ ...selectedApp, ...editAppForm }), { xs: 12 })}
                  {renderProfileField('Date of Birth', selectedApp.birthdate, { xs: 12, sm: 6 }, 'birthdate', { type: 'date' })}
                  {renderProfileField('Age', raw.age ?? extra.age)}
                  {renderProfileField('Gender', selectedApp.gender, { xs: 12, sm: 6 }, 'gender')}
                  {renderProfileField('Civil Status', selectedApp.civilStatus, { xs: 12, sm: 6 }, 'civilStatus')}
                  {renderProfileField('Nationality', raw.nationality ?? extra.nationality)}
                  {renderProfileField('Birthplace', selectedApp.birthplace, { xs: 12, sm: 6 }, 'birthplace')}
                  {renderProfileField('Height (cm)', selectedApp.height, { xs: 12, sm: 6 }, 'height')}
                  {renderProfileField('Weight (kg)', selectedApp.weight, { xs: 12, sm: 6 }, 'weight')}
                  {renderProfileField('Contact Number', selectedApp.phone, { xs: 12, sm: 6 }, 'phone')}
                  {renderProfileField('Email Address', selectedApp.email, { xs: 12, sm: 6 }, 'email')}
                  {renderProfileField('Current Address', currentAddress, { xs: 12 }, 'address', { multiline: true, rows: 2 })}
                  {renderProfileField('Permanent Address', permanentAddress, { xs: 12 })}

                  {renderProfileSectionTitle('III. EDUCATIONAL BACKGROUND')}
                  {renderProfileField('Educational Level', selectedApp.education ?? educationBackground.level, { xs: 12, sm: 6 }, 'education')}
                  {renderProfileField('Name of School', raw.school_name ?? educationBackground.schoolName)}
                  {renderProfileField('Course / Program', raw.course_program ?? educationBackground.courseProgram)}
                  {renderProfileField('Year Graduated', raw.year_graduated ?? educationBackground.yearGraduated)}
                  {renderProfileField('Honors / Awards', raw.honors_awards ?? educationBackground.honorsAwards, { xs: 12 })}

                  {renderProfileSectionTitle('IV. WORK EXPERIENCE')}
                  {renderProfileField('Total Years of Experience', selectedApp.experience ?? workExperience.totalYearsExperience, { xs: 12, sm: 6 }, 'experience')}
                  {renderProfileField('Company / Organization', raw.company_organization ?? workExperience.companyOrganization)}
                  {renderProfileField('Position Held', raw.position_held ?? workExperience.positionHeld)}
                  {renderProfileField('Employment Period', raw.employment_period ?? workExperience.employmentPeriod)}
                  {renderProfileField('Duties / Responsibilities', raw.duties_responsibilities ?? workExperience.dutiesResponsibilities, { xs: 12 })}

                  {renderProfileSectionTitle('V. SKILLS AND QUALIFICATIONS')}
                  {renderProfileField('Skills', skills, { xs: 12 })}
                  {renderProfileField('Other Skills', raw.other_skills ?? extra.otherSkills, { xs: 12 })}
                  {renderProfileField('Certifications / Trainings', certifications, { xs: 12 })}

                  {renderProfileSectionTitle('VI. GOVERNMENT IDS, CHARACTER REFERENCES, and EMERGENCY CONTACT')}
                  {renderProfileField('TIN', selectedApp.tin, { xs: 12, sm: 6 }, 'tin')}
                  {renderProfileField('SSS', selectedApp.sss, { xs: 12, sm: 6 }, 'sss')}
                  {renderProfileField('PhilHealth', selectedApp.philhealth, { xs: 12, sm: 6 }, 'philhealth')}
                  {renderProfileField('Pag-IBIG', selectedApp.pagibig, { xs: 12, sm: 6 }, 'pagibig')}

                  {characterReferences.length > 0 ? (
                    characterReferences.map((reference: any, index: number) => (
                      <Grid key={`reference-${index}`} size={12}>
                        <Paper elevation={0} sx={{ p: 2, ...innerCardSx }}>
                          <Typography fontWeight={700} sx={{ mb: 1, color: GREEN_UI.greenDark }}>
                            Character Reference {index + 1}
                          </Typography>
                          <Grid container spacing={2}>
                            {renderProfileField('Name', reference.name)}
                            {renderProfileField('Position / Relationship', reference.position)}
                            {renderProfileField('Company / Organization', reference.company)}
                            {renderProfileField('Contact Number', reference.contact)}
                          </Grid>
                        </Paper>
                      </Grid>
                    ))
                  ) : (
                    renderProfileField('Character References', '—', { xs: 12 })
                  )}

                  {renderProfileField('Emergency Contact Person', emergencyContact.name ?? selectedApp.emergencyContact, { xs: 12, sm: 6 }, 'emergencyContact')}
                  {renderProfileField('Relationship', emergencyContact.relation)}
                  {renderProfileField('Contact Number', emergencyContact.phone)}
                  {renderProfileField('Address', emergencyContact.address, { xs: 12 })}

                  {renderDocumentsSection(submittedDocuments)}

                  {renderProfileSectionTitle('VIII. APPLICANT DECLARATION')}
                  {renderProfileField('Applicant Signature / Full Name', raw.applicant_signature ?? extra.applicantSignature)}
                  {renderProfileField('Declaration Date', raw.declaration_date ?? extra.declarationDate)}

                  {renderProfileSectionTitle('IX. HR REQUIREMENTS VALIDATION')}
                  {renderRequirementChecklist()}

                  {selectedApp.status === 'For Interview' && (
                    <>
                      {renderProfileSectionTitle('X. INTERVIEW DETAILS')}
                      {renderProfileField('Interview Date', selectedApp.interviewDate, { xs: 12, sm: 6 })}
                      {renderProfileField('Interview Time', selectedApp.interviewTime, { xs: 12, sm: 6 })}
                      {renderProfileField('Interview Location', selectedApp.interviewLocation, { xs: 12 })}
                      {renderProfileField('Interview Notes', selectedApp.interviewNotes, { xs: 12 })}
                      {renderProfileField('Scheduled By', selectedApp.scheduledBy)}
                    </>
                  )}

                  {isGM && selectedApp.status === 'For Interview' && (
                    <>
                      {renderProfileSectionTitle('XI. GM INTERVIEW FEEDBACK')}
                      <Grid size={12}>
                        <TextField
                          fullWidth
                          label="Interview Feedback / Remarks"
                          multiline
                          rows={4}
                          value={gmForm.interviewFeedback}
                          onChange={event => setGmForm({ ...gmForm, interviewFeedback: event.target.value })}
                          disabled={saving}
                          sx={softTextFieldSx}
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
              );
            })()}
        </DialogContent>

        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2,
            gap: 1,
            flexWrap: 'wrap',
            bgcolor: '#ffffff',
            borderTop: `1px solid ${GREEN_UI.border}`,
          }}
        >
          {selectedApp && (isHR || isGM) && (
            <TextField
              select
              size="small"
              variant="outlined"
              label="Status Update"
              value={selectedApp.status}
              onChange={event => handleUpdateStatus(selectedApp.id, event.target.value as AppStatus)}
              disabled={saving}
              sx={{ minWidth: 210, mr: 'auto', ...softTextFieldSx }}
            >
              {ALL_STATUSES.map(status => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          )}
          {selectedApp && (isHR || isGM) && (
            <Button
              variant={viewEditMode ? 'contained' : 'outlined'}
              sx={{
                ...pillButtonSx,
                ...(viewEditMode
                  ? { bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }
                  : { borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }),
              }}
              onClick={async () => {
                if (!viewEditMode) {
                  setEditAppForm(selectedApp);
                  setViewEditMode(true);
                  return;
                }

                await saveEditedApplication();
              }}
              disabled={saving}
            >
              {viewEditMode ? 'Save Changes' : 'Edit Profile'}
            </Button>
          )}

          {viewEditMode && (
            <Button
              onClick={() => {
                setEditAppForm({});
                setViewEditMode(false);
              }}
              disabled={saving}
              sx={{ ...pillButtonSx }}
            >
              Cancel Edit
            </Button>
          )}

          <Button onClick={closeViewDialog} sx={{ ...pillButtonSx }}>Close</Button>

          {isHR && selectedApp?.status === 'For Interview' && (
              <Button
                variant="outlined"
                color="info"
                startIcon={<CalendarMonth />}
                disabled={saving}
                sx={{ ...pillButtonSx, borderColor: '#b7dff7', color: '#1d6f9c' }}
                onClick={() => {
                  setInterviewDialog(true);
                  setIForm({
                    interviewDate: selectedApp.interviewDate ?? '',
                    interviewTime: selectedApp.interviewTime ?? '',
                    interviewLocation: selectedApp.interviewLocation ?? 'HR Office, Buenaventura Estate',
                    interviewNotes: selectedApp.interviewNotes ?? '',
                  });
                }}
              >
                {selectedApp.interviewDate ? 'Update Interview' : 'Schedule Interview'}
              </Button>
            )}

          {isGM && selectedApp?.status === 'For Interview' && (
            <>
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelOutlined />}
                onClick={() => handleHiringDecision(selectedApp.id, 'Not Qualified')}
                disabled={saving}
                sx={{ ...pillButtonSx }}
              >
                Not Qualified
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<TaskAlt />}
                onClick={() => handleHiringDecision(selectedApp.id, 'Hired')}
                disabled={saving}
                sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
              >
                Hire Applicant
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: { xs: '18px', sm: '28px' },
            overflow: 'hidden',
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: '0 28px 70px rgba(27, 73, 37, 0.18)',
          },
        }}
      >
        <DialogTitle
          fontWeight={700}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 1,
            px: { xs: 2, sm: 3 },
            py: 2,
            background: 'linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)',
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {previewDoc && <DocIcon name={previewDoc.name} type={previewDoc.type} />}
            <Typography fontWeight={700} noWrap sx={{ flex: 1 }}>
              {previewDoc?.name}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownload />}
            onClick={() => previewDoc && downloadFile(previewDoc.data, previewDoc.name)}
            sx={{ flexShrink: 0, ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
          >
            Download
          </Button>
        </DialogTitle>
        <DialogContent sx={{ flex: 1, overflow: 'hidden', p: 1.5, display: 'flex', flexDirection: 'column', bgcolor: '#fbfff9' }}>
          {previewDoc &&
            (() => {
              const isPdf = previewDoc.type === 'application/pdf' || previewDoc.name.toLowerCase().endsWith('.pdf');
              const isImage =
                previewDoc.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(previewDoc.name);

              if (isPdf) {
                return (
                  <iframe
                    src={previewDoc.data}
                    title={previewDoc.name}
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, flex: 1 }}
                  />
                );
              }

              if (isImage) {
                return (
                  <Box
                    sx={{
                      flex: 1,
                      overflow: 'auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: '#f6fbf4',
                      borderRadius: '20px',
                      border: `1px solid ${GREEN_UI.border}`,
                    }}
                  >
                    <img
                      src={previewDoc.data}
                      alt={previewDoc.name}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        borderRadius: 4,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                      }}
                    />
                  </Box>
                );
              }

              return (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  <InsertDriveFile sx={{ fontSize: 72, color: 'text.disabled' }} />
                  <Typography variant="h6" color="text.secondary">
                    Preview not available for this file type
                  </Typography>
                  <Typography variant="body2" color="text.disabled">
                    ({previewDoc.type || 'unknown type'})
                  </Typography>
                  <Button
                    variant="contained"
                    startIcon={<FileDownload />}
                    onClick={() => downloadFile(previewDoc.data, previewDoc.name)}
                    sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
                  >
                    Download to view
                  </Button>
                </Box>
              );
            })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#ffffff' }}>
          <Button onClick={() => setPreviewDoc(null)} sx={{ ...pillButtonSx }}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={interviewDialog}
        onClose={() => setInterviewDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: { xs: '22px', sm: '28px' },
            overflow: 'hidden',
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: '0 28px 70px rgba(27, 73, 37, 0.18)',
          },
        }}
      >
        <DialogTitle
          fontWeight={700}
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.25,
            background: 'linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)',
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: GREEN_UI.greenDark }}>
            <Event /> Schedule Interview — {selectedApp?.name}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          <Grid container spacing={2} sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Interview Date"
                type="date"
                value={iForm.interviewDate}
                onChange={event => setIForm({ ...iForm, interviewDate: event.target.value })}
                InputLabelProps={{ shrink: true }}
                required
                sx={softTextFieldSx}
/>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Interview Time"
                type="time"
                value={iForm.interviewTime}
                onChange={event => setIForm({ ...iForm, interviewTime: event.target.value })}
                InputLabelProps={{ shrink: true }}
                              sx={softTextFieldSx}
/>
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Interview Location"
                value={iForm.interviewLocation}
                onChange={event => setIForm({ ...iForm, interviewLocation: event.target.value })}
                              sx={softTextFieldSx}
/>
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Interview Notes / Instructions for Applicant"
                value={iForm.interviewNotes}
                onChange={event => setIForm({ ...iForm, interviewNotes: event.target.value })}
                placeholder="e.g. Please bring original documents and 2 valid IDs."
                              sx={softTextFieldSx}
/>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#ffffff' }}>
          <Button onClick={() => setInterviewDialog(false)} sx={{ ...pillButtonSx }}>Cancel</Button>
          <Button
            variant="contained"
            color="info"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CalendarMonth />}
            onClick={handleScheduleInterview}
            disabled={saving || !iForm.interviewDate}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            {saving ? 'Saving…' : 'Confirm Interview Schedule'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editReqDialog}
        onClose={() => setEditReqDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: { xs: '22px', sm: '28px' },
            overflow: 'hidden',
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: '0 28px 70px rgba(27, 73, 37, 0.18)',
          },
        }}
      >
        <DialogTitle
          fontWeight={700}
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.25,
            background: 'linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)',
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: GREEN_UI.greenDark }}>
            <EditNote /> Edit Requirements Checklist
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Standard requirements are fixed. You may add custom requirements below.
          </Typography>

          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 0.5 }}>
            STANDARD REQUIREMENTS
          </Typography>
          <Box sx={{ mb: 2 }}>
            {['Resume / CV', 'Birth Certificate', 'Transcript of Records (TOR)', 'Medical Certificate'].map(label => (
              <Chip key={label} label={label} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5 }} />
            ))}
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: 0.5 }}>
            CUSTOM REQUIREMENTS
          </Typography>
          <Box sx={{ mb: 2, mt: 1 }}>
            {(reqForm.customRequirements ?? []).length === 0 ? (
              <Typography variant="caption" color="text.disabled">
                No custom requirements added yet.
              </Typography>
            ) : (
              (reqForm.customRequirements ?? []).map((customRequirement, index) => (
                <Box key={`${customRequirement.label}-${index}`} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Chip label={customRequirement.label} size="small" variant="outlined" color="info" />
                  <Tooltip title="Remove">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => {
                        const updated = reqForm.customRequirements.filter((_, itemIndex) => itemIndex !== index);
                        setReqForm({ ...reqForm, customRequirements: updated });
                      }}
                    >
                      <RemoveCircle fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              label="New Requirement"
              placeholder="e.g. NBI Clearance, Police Clearance, etc."
              value={newReqText}
              onChange={event => setNewReqText(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && newReqText.trim()) {
                  setReqForm({
                    ...reqForm,
                    customRequirements: [...(reqForm.customRequirements ?? []), { label: newReqText.trim(), checked: false }],
                  });
                  setNewReqText('');
                }
              }}
                          sx={softTextFieldSx}
/>
            <Button
              variant="contained"
              startIcon={<AddCircle />}
              disabled={!newReqText.trim()}
              onClick={() => {
                setReqForm({
                  ...reqForm,
                  customRequirements: [...(reqForm.customRequirements ?? []), { label: newReqText.trim(), checked: false }],
                });
                setNewReqText('');
              }}
              sx={{ flexShrink: 0, ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
            >
              Add
            </Button>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#ffffff' }}>
          <Button onClick={() => setEditReqDialog(false)} sx={{ ...pillButtonSx }}>Close</Button>
          <Button
            variant="contained"
            onClick={() => setEditReqDialog(false)}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar(state => ({ ...state, open: false }))}
      />
    </Box>
  );
}

/** Download a base64 data URI as a file */
function downloadFile(dataUri: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function DocIcon({ name, type }: { name: string; type?: string }) {
  const lowerName = name.toLowerCase();

  if (type === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return <PictureAsPdf fontSize="small" sx={{ color: '#E53935' }} />;
  }

  if ((type ?? '').includes('word') || lowerName.endsWith('.doc') || lowerName.endsWith('.docx')) {
    return <Article fontSize="small" sx={{ color: '#1565C0' }} />;
  }

  if ((type ?? '').startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name)) {
    return <ImageIcon fontSize="small" sx={{ color: '#7B1FA2' }} />;
  }

  return <InsertDriveFile fontSize="small" sx={{ color: '#546E7A' }} />;
}
