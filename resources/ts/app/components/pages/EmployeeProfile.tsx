import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Box, Typography, Button, Paper, TextField, Divider, Chip, Grid,
  CircularProgress, Alert, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, Tooltip, InputAdornment, Autocomplete,
} from '@mui/material';
import {
  ArrowBackIosNew,
  EditNote,
  Save,
  CancelOutlined,
  AccountCircle,
  FileDownload,
  Visibility,
  InsertDriveFile,
  PictureAsPdf,
  Article,
  Image as ImageIcon,
  DeleteOutline,
  Phone,
  Email,
  LocationOn,
  AccessTime,
  Badge,
  Work,
  Storefront,
  CalendarMonth,
  Schedule,
  Coffee,
  CheckCircle,
} from '@mui/icons-material';
import { supabase } from '../../lib/supabaseClient';
import { OUTLETS, POSITIONS, DEPARTMENTS } from '../../lib/constants';
import FileUploadField from '../FileUploadField';
import { useAuth } from '../../context/AuthContext';
import ActionSnackbar from '../ActionSnackbar';

interface DocFile {
  name: string; type: string; data: string;
}

type ApplicationFormDetails = {
  applicantId?: string;
  status?: string;
  positionApplied?: string;
  name?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  gender?: string;
  civilStatus?: string;
  birthdate?: string;
  birthplace?: string;
  height?: string;
  weight?: string;
  email?: string;
  phone?: string;
  tin?: string;
  sss?: string;
  philhealth?: string;
  pagibig?: string;
  hearAbout?: string;
  hearAboutOther?: string;
  age?: string;
  nationality?: string;
  currentAddress?: string;
  permanentAddress?: string;
  educationBackground?: {
    level?: string;
    schoolName?: string;
    courseProgram?: string;
    yearGraduated?: string;
    honorsAwards?: string;
  };
  workExperiences?: {
    companyOrganization?: string;
    positionHeld?: string;
    totalYearsExperience?: string;
    employmentStartDate?: string;
    employmentEndDate?: string;
    employmentPeriod?: string;
    dutiesResponsibilities?: string;
  }[];
  skills?: string[];
  otherSkills?: string;
  certifications?: string[];
  characterReferences?: {
    name?: string;
    position?: string;
    company?: string;
    contact?: string;
  }[];
  emergencyContacts?: {
    name?: string;
    relation?: string;
    phone?: string;
    address?: string;
  }[];
  submittedDocuments?: string[];
  otherDocument?: string;
  applicantSignature?: string;
  declarationDate?: string;
  submittedAt?: string;
};

interface Employee {
  id: string;
  name: string;
  applicantId?: string;

  first_name?: string;
  middle_name?: string;
  last_name?: string;
  suffix?: string;

  position: string;
  outlet: string;
  status: string;
  contact: string;
  email: string;

  address?: string;
  department?: string;
  supervisor?: string;
  dateHired?: string;
  emergencyContact?: string;
  createdAt?: string;
  updatedAt?: string;

  documents?: DocFile[];
  employeeDocumentsOnly?: DocFile[];

  gender?: string;
  civilStatus?: string;
  birthdate?: string;
  birthplace?: string;
  employmentType?: string;
  salary?: string | number;
  dailySchedule?: string;
  breakTime?: string;
  timeIn?: string;
  timeOut?: string;
  education?: string;
  experience?: string;
  tin?: string;
  sss?: string;
  philhealth?: string;
  pagibig?: string;

  applicationForm?: ApplicationFormDetails | null;
}

const SCHEDULE_PRESETS = [
  { label: '6:00 AM - 3:00 PM', timeIn: '6:00 AM', timeOut: '3:00 PM' },
  { label: '7:00 AM - 4:00 PM', timeIn: '7:00 AM', timeOut: '4:00 PM' },
  { label: '8:00 AM - 5:00 PM', timeIn: '8:00 AM', timeOut: '5:00 PM' },
  { label: '9:00 AM - 6:00 PM', timeIn: '9:00 AM', timeOut: '6:00 PM' },
  { label: '10:00 AM - 7:00 PM', timeIn: '10:00 AM', timeOut: '7:00 PM' },
  { label: '3:00 PM - 11:00 PM', timeIn: '3:00 PM', timeOut: '11:00 PM' },
  { label: '11:00 PM - 7:00 AM', timeIn: '11:00 PM', timeOut: '7:00 AM' },
  { label: 'Off', timeIn: '', timeOut: '' },
];

const BREAK_TIME_OPTIONS = ['30 minutes', '1 hour', '1 hour 30 minutes', '2 hours'];

const TIME_OPTIONS = [
  '5:00 AM', '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
  '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM',
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadFile(dataUri: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function DocIcon({ name, type }: { name: string; type?: string }) {
  if (type === 'application/pdf' || name.endsWith('.pdf'))
    return <PictureAsPdf fontSize="small" sx={{ color: '#E53935' }} />;
  if ((type ?? '').includes('word') || name.endsWith('.doc') || name.endsWith('.docx'))
    return <Article fontSize="small" sx={{ color: '#1565C0' }} />;
  if ((type ?? '').startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(name))
    return <ImageIcon fontSize="small" sx={{ color: '#7B1FA2' }} />;
  return <InsertDriveFile fontSize="small" sx={{ color: '#546E7A' }} />;
}

function parseApplicationDetails(raw?: string | null): Partial<ApplicationFormDetails> {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const displayValue = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};

const compactList = (items?: Array<string | null | undefined>) => {
  const cleanItems = (items ?? []).filter((item): item is string => Boolean(item));
  return cleanItems.length > 0 ? cleanItems.join(', ') : '-';
};

const InfoItem = ({ label, value }: { label: string; value?: any }) => (
  <Grid size={{ xs: 12, sm: 6, md: 4 }}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body1" fontWeight={500}>
      {value || "—"}
    </Typography>
  </Grid>
);


const GREEN_UI = {
  pageBg: 'radial-gradient(circle at top left, rgba(220, 246, 219, 0.95), rgba(248, 252, 245, 0.98) 34%, #f7fbf3 100%)',
  cardBg: 'rgba(255, 255, 255, 0.94)',
  cardBgSoft: 'rgba(245, 252, 241, 0.88)',
  border: 'rgba(139, 184, 144, 0.24)',
  borderStrong: 'rgba(73, 156, 92, 0.34)',
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
  fontWeight: 600,
  px: 2,
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
  '& .MuiInputBase-input, & .MuiSelect-select': { fontWeight: 400 },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: GREEN_UI.text },
};

const statusChipSx = (status?: string) => {
  if (status === 'Active') {
    return { bgcolor: '#e5f8e9', color: '#217a43', borderColor: '#a9dfb6', fontWeight: 600 };
  }

  if (status === 'On Leave') {
    return { bgcolor: '#fff7e0', color: '#9b6b00', borderColor: '#f5d786', fontWeight: 600 };
  }

  if (status === 'Resigned') {
    return { bgcolor: '#fdeaea', color: '#9c2f2f', borderColor: '#efb8b8', fontWeight: 600 };
  }

  return { bgcolor: '#f4f7f3', color: '#5f6e63', borderColor: '#dce8da', fontWeight: 600 };
};

export default function EmployeeProfile() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [deleteDialog, setDeleteDialog] = useState(false);
  // New document upload state
  const [newDocFiles, setNewDocFiles] = useState<File[]>([]);
  const [previewDoc, setPreviewDoc] = useState<{ name: string; data: string; type: string } | null>(null);
  const [profileTab, setProfileTab] = useState('Personal');
  const [editProfileTab, setEditProfileTab] = useState('Personal');

  useEffect(() => {
  if (!id) return;

  (async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("employee_id", id)
        .single();

      if (error) throw error;

      let applicantDocs: DocFile[] = [];
      let applicationForm: ApplicationFormDetails | null = null;

      if (data.applicant_id) {
        const { data: applicantData, error: applicantError } = await supabase
          .from("applicants")
          .select("*")
          .eq("applicant_id", data.applicant_id)
          .maybeSingle();

        if (applicantError) throw applicantError;

        const parsedApplication = parseApplicationDetails(applicantData?.cover_letter);

        applicationForm = applicantData ? {
          ...parsedApplication,
          applicantId: applicantData.applicant_id ?? data.applicant_id,
          status: applicantData.status ?? "",
          positionApplied: applicantData.position_applied ?? parsedApplication.positionApplied ?? "",
          name: applicantData.name ?? "",
          firstName: applicantData.first_name ?? "",
          middleName: applicantData.middle_name ?? "",
          lastName: applicantData.last_name ?? "",
          suffix: applicantData.suffix ?? "",
          gender: applicantData.gender ?? "",
          civilStatus: applicantData.civil_status ?? "",
          birthdate: applicantData.birthdate ?? "",
          birthplace: applicantData.birthplace ?? "",
          height: applicantData.height ?? "",
          weight: applicantData.weight ?? "",
          email: applicantData.email ?? "",
          phone: applicantData.phone_number ?? "",
          tin: applicantData.tin ?? "",
          sss: applicantData.sss ?? "",
          philhealth: applicantData.philhealth ?? "",
          pagibig: applicantData.pagibig ?? "",
          age: parsedApplication.age ?? "",
          nationality: parsedApplication.nationality ?? "",
          currentAddress: parsedApplication.currentAddress ?? applicantData.address ?? "",
          submittedAt: applicantData.created_at ?? "",
        } : null;

        const resumeDoc =
          applicantData?.resume_file_name && applicantData?.resume_file_data
            ? [{
                name: applicantData.resume_file_name,
                type: "application/pdf",
                data: applicantData.resume_file_data,
              }]
            : [];

        const supportingDocs = Array.isArray(applicantData?.supporting_document_files)
          ? applicantData.supporting_document_files
          : [];

        applicantDocs = [...resumeDoc, ...supportingDocs];
      }

      const employeeDocs = Array.isArray(data.documents) ? data.documents : [];

      const employeeData: Employee = {
        id: data.employee_id,
        applicantId: data.applicant_id ?? "",
        name: `${data.first_name ?? ""} ${data.middle_name ?? ""} ${data.last_name ?? ""} ${data.suffix ?? ""}`.replace(/\s+/g, " ").trim(),
        first_name: data.first_name ?? "",
        middle_name: data.middle_name ?? "",
        last_name: data.last_name ?? "",
        suffix: data.suffix ?? "",
        position: data.position ?? "",
        outlet: data.outlet ?? "",
        status: data.status ?? "Active",
        contact: data.phone_number ?? "",
        email: data.email ?? "",
        address: data.address ?? "",
        department: data.department ?? "",
        supervisor: data.supervisor ?? "",
        dateHired: data.hire_date ?? "",
        emergencyContact: data.emergency_contact ?? "",
        createdAt: data.created_at ?? "",
        updatedAt: data.updated_at ?? "",
        documents: [
  ...new Map(
    [...applicantDocs, ...employeeDocs].map(doc => [doc.name, doc])
  ).values(),
],
        employeeDocumentsOnly: employeeDocs,

        gender: data.gender ?? "",
        civilStatus: data.civil_status ?? "",
        birthdate: data.birthdate ?? "",
        birthplace: data.birthplace ?? "",
        employmentType: data.employment_type ?? "",
        salary: data.salary ?? "",
        dailySchedule: data.daily_schedule ?? "",
        breakTime: data.break_time ?? "",
        timeIn: data.time_in ?? "",
        timeOut: data.time_out ?? "",
        education: data.education ?? "",
        experience: data.experience ?? "",
        tin: data.tin ?? "",
        sss: data.sss ?? "",
        philhealth: data.philhealth ?? "",
        pagibig: data.pagibig ?? "",
        applicationForm,
      };

      setEmployee(employeeData);
      setEditForm(employeeData);
    } catch (e: any) {
      setError(`Could not load employee: ${e.message}`);
    } finally {
      setLoading(false);
    }
  })();
}, [id]);


  const handleSave = async () => {
  if (!editForm || !id) return;

  setSaving(true);

  try {
    let updatedDocs = [...(editForm.employeeDocumentsOnly ?? [])];

    if (newDocFiles.length > 0) {
      const encoded = await Promise.all(
        newDocFiles.map(async f => ({
          name: f.name,
          type: f.type,
          data: await fileToBase64(f),
        }))
      );

      updatedDocs = [...updatedDocs, ...encoded];
    }

    const { data, error } = await supabase
      .from("employees")
      .update({
        first_name: editForm.first_name ?? "",
        middle_name: editForm.middle_name ?? "",
        last_name: editForm.last_name ?? "",
        suffix: editForm.suffix ?? "",
        email: editForm.email,
        phone_number: editForm.contact,
        address: editForm.address,
        department: editForm.department,
        position: editForm.position,
        outlet: editForm.outlet ?? "",
        status: editForm.status,
        supervisor: editForm.supervisor,
        hire_date: editForm.dateHired,
        emergency_contact: editForm.emergencyContact,
        gender: editForm.gender,
        civil_status: editForm.civilStatus,
        birthdate: editForm.birthdate,
        birthplace: editForm.birthplace,
        employment_type: editForm.employmentType,
        salary: editForm.salary === "" ? null : editForm.salary,
        daily_schedule: editForm.dailySchedule,
        break_time: editForm.breakTime,
        time_in: editForm.timeIn,
        time_out: editForm.timeOut,
        education: editForm.education,
        experience: editForm.experience,
        tin: editForm.tin,
        sss: editForm.sss,
        philhealth: editForm.philhealth,
        pagibig: editForm.pagibig,
        documents: updatedDocs,
      })
      .eq("employee_id", id)
      .select()
      .single();

    if (error) throw error;

    const appForm = editForm.applicationForm;
    if (appForm?.applicantId) {
      const applicantName = `${appForm.firstName ?? ""} ${appForm.middleName ?? ""} ${appForm.lastName ?? ""} ${appForm.suffix ?? ""}`.replace(/\s+/g, " ").trim();
      const coverLetterData = {
        ...appForm,
        hearAbout: appForm.hearAbout,
        hearAboutOther: appForm.hearAboutOther,
        age: appForm.age,
        nationality: appForm.nationality,
        currentAddress: appForm.currentAddress,
        permanentAddress: appForm.permanentAddress,
        educationBackground: appForm.educationBackground,
        workExperiences: appForm.workExperiences ?? [],
        workExperience: appForm.workExperiences?.[0] ?? null,
        skills: appForm.skills ?? [],
        otherSkills: appForm.otherSkills,
        certifications: appForm.certifications ?? [],
        characterReferences: appForm.characterReferences ?? [],
        emergencyContacts: appForm.emergencyContacts ?? [],
        emergencyContact: appForm.emergencyContacts?.[0] ?? null,
        submittedDocuments: appForm.submittedDocuments ?? [],
        otherDocument: appForm.otherDocument,
      };

      const { error: applicantUpdateError } = await supabase
        .from("applicants")
        .update({
          name: applicantName || appForm.name || editForm.name,
          first_name: appForm.firstName ?? "",
          middle_name: appForm.middleName ?? "",
          last_name: appForm.lastName ?? "",
          suffix: appForm.suffix ?? "",
          gender: appForm.gender ?? "",
          civil_status: appForm.civilStatus ?? "",
          birthdate: appForm.birthdate || null,
          birthplace: appForm.birthplace ?? "",
          height: appForm.height ?? "",
          weight: appForm.weight ?? "",
          email: appForm.email ?? editForm.email,
          phone_number: appForm.phone ?? editForm.contact,
          address: appForm.currentAddress ?? editForm.address,
          position_applied: appForm.positionApplied ?? editForm.position,
          education: appForm.educationBackground?.level ?? editForm.education,
          experience: appForm.workExperiences?.[0]?.totalYearsExperience ?? editForm.experience,
          tin: appForm.tin ?? "",
          sss: appForm.sss ?? "",
          philhealth: appForm.philhealth ?? "",
          pagibig: appForm.pagibig ?? "",
          emergency_contact: appForm.emergencyContacts?.[0]
            ? `${appForm.emergencyContacts[0].name ?? ""} - ${appForm.emergencyContacts[0].relation ?? ""} - ${appForm.emergencyContacts[0].phone ?? ""}`
            : editForm.emergencyContact,
          cover_letter: JSON.stringify(coverLetterData),
        })
        .eq("applicant_id", appForm.applicantId);

      if (applicantUpdateError) throw applicantUpdateError;
    }

    const updatedEmployee = {
  ...editForm,
  id: data.employee_id,
  name: `${data.first_name ?? ""} ${data.middle_name ?? ""} ${data.last_name ?? ""} ${data.suffix ?? ""}`.replace(/\s+/g, " ").trim(),
  first_name: data.first_name ?? "",
  middle_name: data.middle_name ?? "",
  last_name: data.last_name ?? "",
  suffix: data.suffix ?? "",
  position: data.position ?? "",
  outlet: data.outlet ?? editForm.outlet ?? "",
  status: data.status ?? "Active",
  contact: data.phone_number ?? "",
  email: data.email ?? "",
  address: data.address ?? "",
  department: data.department ?? "",
  supervisor: data.supervisor ?? "",
  dateHired: data.hire_date ?? "",
  emergencyContact: data.emergency_contact ?? "",
  gender: data.gender ?? "",
  civilStatus: data.civil_status ?? "",
  birthdate: data.birthdate ?? "",
  birthplace: data.birthplace ?? "",
  employmentType: data.employment_type ?? "",
  salary: data.salary ?? "",
  dailySchedule: data.daily_schedule ?? "",
  breakTime: data.break_time ?? "",
  timeIn: data.time_in ?? "",
  timeOut: data.time_out ?? "",
  education: data.education ?? "",
  experience: data.experience ?? "",
  tin: data.tin ?? "",
  sss: data.sss ?? "",
  philhealth: data.philhealth ?? "",
  pagibig: data.pagibig ?? "",
  documents: [...(employee?.documents ?? []).filter(d => !(employee?.employeeDocumentsOnly ?? []).some(ed => ed.name === d.name)), ...updatedDocs],
  employeeDocumentsOnly: updatedDocs,
  createdAt: data.created_at ?? "",
  updatedAt: data.updated_at ?? employee?.updatedAt ?? "",
};

    setEmployee(updatedEmployee);
    setEditForm(updatedEmployee);
    setEditing(false);
    setNewDocFiles([]);

    setSnackbar({
      open: true,
      message: "Profile updated successfully!",
      severity: "success",
    });
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Save failed: ${e.message}`,
      severity: "error",
    });
  } finally {
    setSaving(false);
  }
};

  const handleDelete = async () => {
  if (!id) return;

  try {
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("employee_id", id);

    if (error) throw error;

    setSnackbar({
      open: true,
      message: "Employee deleted successfully!",
      severity: "success",
    });

    navigate('/dashboard/employees');
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Delete failed: ${e.message}`,
      severity: 'error',
    });
  }

  setDeleteDialog(false);
};

  const handleRemoveDoc = (idx: number) => {
  if (!editForm) return;

  const docToRemove = editForm.documents?.[idx];
  if (!docToRemove) return;

  setEditForm({
    ...editForm,
    documents: editForm.documents?.filter((_, i) => i !== idx),
    employeeDocumentsOnly: editForm.employeeDocumentsOnly?.filter(
      (doc) => doc.name !== docToRemove.name
    ),
  });
};

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300, gap: 2 }}>
        <CircularProgress /><Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  if (error || !employee || !editForm) {
    return (
      <Box>
        <Button startIcon={<ArrowBackIosNew />} onClick={() => navigate('/dashboard/employees')} sx={{ mb: 2, ...pillButtonSx, color: GREEN_UI.greenDark }}>Back</Button>
        <Alert severity="error">{error ?? 'Employee not found.'}</Alert>
      </Box>
    );
  }

  const handleCloseEdit = () => {
    setEditing(false);
    setEditForm(employee);
    setNewDocFiles([]);
  };

  const renderSectionTitle = (title: string) => (
    <Grid size={12}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.6, mt: 1.5, mb: 1.35 }}>
        <Box
          sx={{
            width: 34,
            height: 6,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${GREEN_UI.green}, rgba(58, 168, 101, 0.10))`,
            boxShadow: '0 0 12px rgba(58,168,101,0.18)',
          }}
        />
        <Typography
          variant="subtitle2"
          sx={{ color: GREEN_UI.greenDark, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700, fontSize: '0.95rem' }}
        >
          {title.toUpperCase()}
        </Typography>
      </Box>
      <Divider sx={{ borderColor: GREEN_UI.border, mb: 2.25 }} />
    </Grid>
  );

  const readOnlyField = (label: string, value?: string | number | null, multiline = false) => (
    <Box
      sx={{
        minHeight: multiline ? 96 : 74,
        px: 1.5,
        py: 1.25,
        borderRadius: '16px',
        border: `1px solid ${GREEN_UI.border}`,
        bgcolor: '#fbfef9',
      }}
    >
      <Typography variant="caption" sx={{ color: GREEN_UI.muted, display: 'block', mb: 0.45 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          color: GREEN_UI.text,
          fontWeight: 500,
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {displayValue(value)}
      </Typography>
    </Box>
  );

  const application = employee.applicationForm;
  const editFullName = `${editForm.first_name ?? ''} ${editForm.middle_name ?? ''} ${editForm.last_name ?? ''} ${editForm.suffix ?? ''}`.replace(/\s+/g, ' ').trim();

  const handleEditFullName = (value: string) => {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    setEditForm({
      ...editForm,
      first_name: parts[0] ?? '',
      middle_name: parts.length > 2 ? parts.slice(1, -1).join(' ') : '',
      last_name: parts.length > 1 ? parts[parts.length - 1] : '',
      suffix: '',
    });
  };

  const editApplication = editForm.applicationForm ?? {};

  const updateApplicationForm = (patch: Partial<ApplicationFormDetails>) => {
    setEditForm({
      ...editForm,
      applicationForm: {
        ...(editForm.applicationForm ?? {}),
        ...patch,
      },
    });
  };

  const updateEducation = (patch: Partial<NonNullable<ApplicationFormDetails['educationBackground']>>) => {
    updateApplicationForm({
      educationBackground: {
        ...(editForm.applicationForm?.educationBackground ?? {}),
        ...patch,
      },
    });
  };

  const updateWorkExperience = (index: number, patch: Partial<NonNullable<ApplicationFormDetails['workExperiences']>[number]>) => {
    const workExperiences = [...(editForm.applicationForm?.workExperiences ?? [])];
    workExperiences[index] = { ...(workExperiences[index] ?? {}), ...patch };
    updateApplicationForm({ workExperiences });
  };

  const updateCharacterReference = (index: number, patch: Partial<NonNullable<ApplicationFormDetails['characterReferences']>[number]>) => {
    const characterReferences = [...(editForm.applicationForm?.characterReferences ?? [])];
    characterReferences[index] = { ...(characterReferences[index] ?? {}), ...patch };
    updateApplicationForm({ characterReferences });
  };

  const updateEmergencyContact = (index: number, patch: Partial<NonNullable<ApplicationFormDetails['emergencyContacts']>[number]>) => {
    const emergencyContacts = [...(editForm.applicationForm?.emergencyContacts ?? [])];
    emergencyContacts[index] = { ...(emergencyContacts[index] ?? {}), ...patch };
    updateApplicationForm({ emergencyContacts });
  };

  const editAppField = (label: string, value: string | undefined, onChange: (value: string) => void, props: any = {}) => (
    <TextField
      fullWidth
      label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      InputLabelProps={{ shrink: true }}
      sx={softTextFieldSx}
      {...props}
    />
  );

  const detailItem = (label: string, value?: string | number | null, size: any = { xs: 12, sm: 6 }) => (
    <Grid size={size}>
      <Typography variant="body2" sx={{ color: GREEN_UI.muted, display: 'block', mb: 0.45, fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography variant="body1" sx={{ color: GREEN_UI.text, fontWeight: 600, wordBreak: 'break-word', lineHeight: 1.45 }}>
        {displayValue(value)}
      </Typography>
    </Grid>
  );

  const profileSection = (title: string, children: any) => (
    <Box sx={{ py: { xs: 2.75, sm: 3.25 }, borderTop: `1px solid ${GREEN_UI.border}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 2.25 }}>
        <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, lineHeight: 1.25, fontSize: { xs: '1.08rem', sm: '1.18rem' } }}>
          {title}
        </Typography>
      </Box>
      <Grid container spacing={{ xs: 2, sm: 3 }}>
        {children}
      </Grid>
    </Box>
  );

  const editField = (
    key: keyof Employee,
    label: string,
    options?: string[],
    fieldOptions?: { multiline?: boolean; rows?: number; type?: string }
  ) => {
    if (options) {
      const currentValue = String(editForm?.[key] ?? "");
      const finalOptions = currentValue && !options.includes(currentValue)
        ? [currentValue, ...options]
        : options;

      return (
        <TextField
          fullWidth
          select
          label={label}
          value={currentValue}
          margin="none"
          size="small"
          InputLabelProps={{ shrink: true }}
          onChange={e => setEditForm({ ...editForm, [key]: e.target.value as any })}
          sx={{
            ...softTextFieldSx,
            '& .MuiOutlinedInput-root': {
              ...softTextFieldSx['& .MuiOutlinedInput-root'],
              minHeight: 42,
              borderRadius: '18px',
              bgcolor: '#fbfef9',
            },
            '& .MuiInputLabel-root': { color: GREEN_UI.muted, fontWeight: 400, fontSize: '0.95rem' },
            '& .MuiInputBase-input, & .MuiSelect-select': { fontWeight: 400, fontSize: '1rem', py: 1.35 },
          }}
        >
          <MenuItem key="__empty__" value="" sx={{ fontWeight: 400 }}>Select {label}…</MenuItem>
          {finalOptions.map(o => (
            <MenuItem key={o} value={o} sx={{ fontWeight: 400 }}>{o}</MenuItem>
          ))}
        </TextField>
      );
    }

    return (
      <TextField
        fullWidth
        label={label}
        value={editForm?.[key] ?? ""}
        margin="none"
        size="small"
        type={fieldOptions?.type}
        multiline={fieldOptions?.multiline}
        rows={fieldOptions?.rows}
        InputLabelProps={{ shrink: true }}
        onChange={e => setEditForm({ ...editForm, [key]: e.target.value as any })}
        sx={{
          ...softTextFieldSx,
          '& .MuiOutlinedInput-root': {
            ...softTextFieldSx['& .MuiOutlinedInput-root'],
            minHeight: fieldOptions?.multiline ? undefined : 42,
            borderRadius: '18px',
            bgcolor: '#fbfef9',
          },
          '& .MuiInputLabel-root': { color: GREEN_UI.muted, fontWeight: 400, fontSize: '0.95rem' },
          '& .MuiInputBase-input, & .MuiSelect-select, & textarea': { fontWeight: 400, fontSize: '1rem', py: fieldOptions?.multiline ? undefined : 1.35 },
        }}
      />
    );
  };

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, background: GREEN_UI.pageBg, minHeight: '100%' }}>
      <Button startIcon={<ArrowBackIosNew />} onClick={() => navigate('/dashboard/employees')} sx={{ mb: 2, ...pillButtonSx, color: GREEN_UI.greenDark }}>
        Back to Employee Records
      </Button>

      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, mb: 3, ...softCardSx }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexWrap: 'wrap',
            gap: 2,
            mb: 3,
            p: { xs: 1.5, sm: 2 },
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)',
            border: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ width: 58, height: 58, borderRadius: '18px', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AccountCircle sx={{ fontSize: 36 }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ color: GREEN_UI.text, fontWeight: 700 }}>{employee.name || 'Employee Profile'}</Typography>
              <Typography variant="body2" color="text.secondary">{employee.id} • {employee.position || 'No position set'}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label={employee.status} size="small" variant="outlined" sx={statusChipSx(employee.status)} />
            {user?.role !== 'supervisor' && (
              <>
                <Button
                  variant="outlined"
                  startIcon={<EditNote />}
                  sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
                  onClick={() => {
                    setEditForm({
                      ...employee,
                      documents: employee?.documents ?? [],
                      employeeDocumentsOnly: employee?.employeeDocumentsOnly ?? [],
                    });
                    setNewDocFiles([]);
                    setEditProfileTab('Personal');
                    setEditing(true);
                  }}
                >
                  Edit Profile
                </Button>
                <Button variant="outlined" color="error" size="small" sx={pillButtonSx} onClick={() => setDeleteDialog(true)}>Remove</Button>
              </>
            )}
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
            borderTop: '1px solid ' + GREEN_UI.border,
            borderBottom: '1px solid ' + GREEN_UI.border,
            mx: { xs: -2, sm: -3 },
            mb: 1,
          }}
        >
          {[
            { icon: <Phone fontSize="small" />, value: application?.phone || employee.contact || '-' },
            { icon: <Email fontSize="small" />, value: application?.email || employee.email || '-' },
            { icon: <LocationOn fontSize="small" />, value: application?.currentAddress || employee.address || '-' },
          ].map((item, index) => (
            <Box
              key={index}
              sx={{
                minHeight: 60,
                px: { xs: 2, sm: 3 },
                py: 1.4,
                display: 'flex',
                alignItems: 'center',
                gap: 1.1,
                color: GREEN_UI.muted,
                borderRight: { md: index < 2 ? '1px solid ' + GREEN_UI.border : 'none' },
                borderBottom: { xs: index < 2 ? '1px solid ' + GREEN_UI.border : 'none', md: 'none' },
              }}
            >
              <Box sx={{ color: GREEN_UI.greenDark, display: 'flex' }}>{item.icon}</Box>
              <Typography variant="body1" sx={{ color: GREEN_UI.muted, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.35 }}>
                {item.value}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            display: 'flex',
            gap: 3.25,
            overflowX: 'auto',
            px: { xs: 0, sm: 0.5 },
            py: 1.25,
            mb: 1,
            borderBottom: '1px solid ' + GREEN_UI.border,
          }}
        >
          {['Personal', 'Education', 'Work', 'References', 'Documents'].map((tab, index) => (
            <Box
              key={tab}
              component="button"
              type="button"
              onClick={() => setProfileTab(tab)}
              sx={{
                border: 0,
                px: 1.5,
                py: 0.55,
                borderRadius: '8px',
                bgcolor: profileTab === tab ? GREEN_UI.greenSoft : 'transparent',
                color: profileTab === tab ? GREEN_UI.greenDark : GREEN_UI.text,
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 700,
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark },
              }}
            >
              {tab}
            </Box>
          ))}
        </Box>

        {application ? (
          <Box>
            {profileTab === 'Personal' && (
              <>
            {profileSection('General Information', (
              <>
                {detailItem('Employee ID', employee.id)}
                {detailItem('Applicant ID', application.applicantId || employee.applicantId)}
                {detailItem('Position applied for', application.positionApplied || employee.position)}
                {detailItem('Application status', application.status)}
                {detailItem('How applicant heard about opening', application.hearAbout === 'Other' ? application.hearAboutOther : application.hearAbout)}
                {detailItem('Date hired', employee.dateHired)}
              </>
            ))}

            {profileSection('Personal Information', (
              <>
                {detailItem('First name', application.firstName || employee.first_name)}
                {detailItem('Middle name', application.middleName || employee.middle_name)}
                {detailItem('Last name', application.lastName || employee.last_name)}
                {detailItem('Suffix', application.suffix || employee.suffix)}
                {detailItem('Date of birth', application.birthdate || employee.birthdate)}
                {detailItem('Age', application.age)}
                {detailItem('Gender', application.gender || employee.gender)}
                {detailItem('Civil status', application.civilStatus || employee.civilStatus)}
                {detailItem('Nationality', application.nationality)}
                {detailItem('Birthplace', application.birthplace || employee.birthplace)}
                {detailItem('Height (cm)', application.height)}
                {detailItem('Weight(kg)', application.weight)}
                {detailItem('Current address', application.currentAddress || employee.address, { xs: 12 })}
                {detailItem('Permanent address', application.permanentAddress, { xs: 12 })}
              </>
            ))}
              </>
            )}

            {profileTab === 'Education' && (
              <>
            {profileSection('Education', (
              <>
                {detailItem('Educational level', application.educationBackground?.level || employee.education)}
                {detailItem('Name of school', application.educationBackground?.schoolName)}
                {detailItem('Course / Program', application.educationBackground?.courseProgram)}
                {detailItem('Year graduated', application.educationBackground?.yearGraduated)}
                {detailItem('Honors / Awards', application.educationBackground?.honorsAwards, { xs: 12 })}
              </>
            ))}
              </>
            )}

            {profileTab === 'Work' && (
              <>
            {profileSection('Work Experience', (
              (application.workExperiences ?? []).length > 0 ? (
                (application.workExperiences ?? []).map((work, index) => (
                  <Grid key={'work-' + index} size={12}>
                    <Box sx={{ pb: index < (application.workExperiences ?? []).length - 1 ? 2 : 0, borderBottom: index < (application.workExperiences ?? []).length - 1 ? '1px solid ' + GREEN_UI.border : 'none' }}>
                      <Typography variant="body1" sx={{ color: GREEN_UI.greenDark, fontWeight: 700, mb: 1.5 }}>
                        Work Experience {index + 1}
                      </Typography>
                      <Grid container spacing={{ xs: 2, sm: 3 }}>
                        {detailItem('Company / Organization', work.companyOrganization)}
                        {detailItem('Position held', work.positionHeld)}
                        {detailItem('Total years of experience', work.totalYearsExperience)}
                        {detailItem('Employment period', work.employmentPeriod || [work.employmentStartDate, work.employmentEndDate].filter(Boolean).join(' to '))}
                        {detailItem('Duties / Responsibilities', work.dutiesResponsibilities, { xs: 12 })}
                      </Grid>
                    </Box>
                  </Grid>
                ))
              ) : (
                detailItem('Work experience', employee.experience || 'No work experience submitted.', { xs: 12 })
              )
            ))}

            {profileSection('Skills And Qualifications', (
              <>
                {detailItem('Skills', compactList(application.skills), { xs: 12 })}
                {detailItem('Other skills', application.otherSkills, { xs: 12 })}
                {detailItem('Certifications / Trainings', compactList(application.certifications), { xs: 12 })}
              </>
            ))}
              </>
            )}

            {profileTab === 'References' && (
              <>
            {profileSection('Government IDs, References, And Emergency Contact', (
              <>
                {detailItem('TIN', application.tin || employee.tin)}
                {detailItem('SSS', application.sss || employee.sss)}
                {detailItem('PhilHealth', application.philhealth || employee.philhealth)}
                {detailItem('Pag-IBIG', application.pagibig || employee.pagibig)}

                <Grid size={12}>
                  <Divider sx={{ my: 0.5, borderColor: GREEN_UI.border }} />
                </Grid>

                {(application.characterReferences ?? []).length > 0 ? (
                  (application.characterReferences ?? []).map((reference, index) => (
                    <Grid key={'reference-' + index} size={{ xs: 12, md: 6 }}>
                      <Typography variant="body1" sx={{ color: GREEN_UI.greenDark, fontWeight: 700, mb: 1 }}>
                        Character Reference {index + 1}
                      </Typography>
                      <Grid container spacing={2}>
                        {detailItem('Name', reference.name, { xs: 12 })}
                        {detailItem('Position / Relationship', reference.position, { xs: 12 })}
                        {detailItem('Company / Organization', reference.company, { xs: 12 })}
                        {detailItem('Contact number', reference.contact, { xs: 12 })}
                      </Grid>
                    </Grid>
                  ))
                ) : (
                  detailItem('Character references', '-', { xs: 12 })
                )}

                {(application.emergencyContacts ?? []).length > 0 ? (
                  (application.emergencyContacts ?? []).map((contact, index) => (
                    <Grid key={'emergency-' + index} size={{ xs: 12, md: 6 }}>
                      <Typography variant="body1" sx={{ color: GREEN_UI.greenDark, fontWeight: 700, mb: 1 }}>
                        Emergency Contact {index + 1}
                      </Typography>
                      <Grid container spacing={2}>
                        {detailItem('Name', contact.name, { xs: 12 })}
                        {detailItem('Relationship', contact.relation, { xs: 12 })}
                        {detailItem('Phone number', contact.phone, { xs: 12 })}
                        {detailItem('Address', contact.address, { xs: 12 })}
                      </Grid>
                    </Grid>
                  ))
                ) : (
                  detailItem('Emergency contact person', employee.emergencyContact, { xs: 12 })
                )}
              </>
            ))}
              </>
            )}

            {profileTab === 'Documents' && (
              <>
            {profileSection('Documents', (
              <>
                {detailItem('Resume / Biodata', employee.documents?.some(doc => /resume|biodata/i.test(doc.name)) ? 'Uploaded' : compactList(application.submittedDocuments?.filter(doc => /resume|biodata/i.test(doc))))}
                {detailItem('Submitted documents', compactList(application.submittedDocuments))}
                {application.otherDocument && detailItem('Other document', application.otherDocument, { xs: 12 })}
                <Grid size={12}>
                  {(employee.documents ?? []).length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {(employee.documents ?? []).map((doc, i) => (
                        <Paper key={i} variant="outlined" sx={{ p: 1.4, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: '12px', borderColor: GREEN_UI.border }}>
                          <DocIcon name={doc.name} type={doc.type} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body1" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">Employee Document</Typography>
                          </Box>
                          {doc.data && (
                            <>
                              <Tooltip title="Preview">
                                <Button size="small" variant="contained" color="primary"
                                  startIcon={<Visibility fontSize="small" />}
                                  sx={{ fontSize: '0.72rem', px: 1.2, whiteSpace: 'nowrap' }}
                                  onClick={() => setPreviewDoc({ name: doc.name, data: doc.data, type: doc.type })}>
                                  Preview
                                </Button>
                              </Tooltip>
                              <Tooltip title="Download">
                                <IconButton size="small" color="primary" onClick={() => downloadFile(doc.data, doc.name)}>
                                  <FileDownload fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Paper>
                      ))}
                    </Box>
                  ) : (
                    <Typography variant="body2" color="text.secondary">No documents uploaded yet.</Typography>
                  )}
                </Grid>
              </>
            ))}
              </>
            )}
          </Box>
        ) : (
          <Alert severity="info" sx={{ borderRadius: '16px', border: '1px solid ' + GREEN_UI.border }}>
            No linked application form details were found for this employee.
          </Alert>
        )}

        {employee.updatedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Last updated: {new Date(employee.updatedAt).toLocaleString()}
          </Typography>
        )}
      </Paper>

      {/* Edit Profile Dialog */}
      <Dialog
        open={editing}
        onClose={saving ? undefined : handleCloseEdit}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: { xs: '22px', sm: '28px' },
            overflow: 'hidden',
            border: `1px solid ${GREEN_UI.border}`,
            background: '#fbfff9',
            boxShadow: '0 28px 70px rgba(27, 73, 37, 0.18)',
            maxHeight: { xs: '92vh', sm: '90vh' },
          },
        }}
      >
        <DialogTitle
          sx={{
            px: { xs: 2, sm: 3 },
            py: { xs: 2, sm: 2.6 },
            background: 'linear-gradient(135deg, #ffffff 0%, #f0faee 100%)',
            borderBottom: `1px solid ${GREEN_UI.border}`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 38,
                  height: 38,
                  borderRadius: '16px',
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: GREEN_UI.greenSoft,
                  color: GREEN_UI.greenDark,
                  flexShrink: 0,
                }}
              >
                <EditNote fontSize="small" />
              </Box>
              <Box>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, lineHeight: 1.2 }}>Edit Employee Profile</Typography>
                <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.7 }}>Update employee details and documents</Typography>
              </Box>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.5,
            bgcolor: '#fbfff9',
            '&::-webkit-scrollbar': { width: 10 },
            '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(108,125,112,0.38)', borderRadius: 999 },
          }}
        >
          <Box sx={{ display: 'flex', gap: 3.25, overflowX: 'auto', px: { xs: 0, sm: 0.5 }, py: 1, mb: 2.25, borderBottom: '1px solid ' + GREEN_UI.border }}>
            {['Personal', 'Education', 'Work', 'References', 'Documents'].map((tab) => (
              <Box key={tab} component="button" type="button" onClick={() => setEditProfileTab(tab)} sx={{ border: 0, px: 1.5, py: 0.55, borderRadius: '8px', bgcolor: editProfileTab === tab ? GREEN_UI.greenSoft : 'transparent', color: editProfileTab === tab ? GREEN_UI.greenDark : GREEN_UI.text, cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700, fontFamily: 'inherit', whiteSpace: 'nowrap', '&:hover': { bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark } }}>
                {tab}
              </Box>
            ))}
          </Box>

          {editProfileTab === 'Personal' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>General Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Employee ID', employee.id, () => undefined, { disabled: true })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Applicant ID', editApplication.applicantId || employee.applicantId, () => undefined, { disabled: true })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Position applied for', editApplication.positionApplied || employee.position, (value) => updateApplicationForm({ positionApplied: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Application status', editApplication.status, (value) => updateApplicationForm({ status: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('How applicant heard about opening', editApplication.hearAbout === 'Other' ? editApplication.hearAboutOther : editApplication.hearAbout, (value) => updateApplicationForm({ hearAbout: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editField('dateHired', 'Date hired', undefined, { type: 'date' })}</Grid>
                </Grid>
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Personal Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('First name', editApplication.firstName || editForm.first_name, (value) => { setEditForm({ ...editForm, first_name: value, applicationForm: { ...(editForm.applicationForm ?? {}), firstName: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Middle name', editApplication.middleName || editForm.middle_name, (value) => { setEditForm({ ...editForm, middle_name: value, applicationForm: { ...(editForm.applicationForm ?? {}), middleName: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Last name', editApplication.lastName || editForm.last_name, (value) => { setEditForm({ ...editForm, last_name: value, applicationForm: { ...(editForm.applicationForm ?? {}), lastName: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Suffix', editApplication.suffix || editForm.suffix, (value) => { setEditForm({ ...editForm, suffix: value, applicationForm: { ...(editForm.applicationForm ?? {}), suffix: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Date of birth', editApplication.birthdate || editForm.birthdate, (value) => updateApplicationForm({ birthdate: value }), { type: 'date' })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Age', editApplication.age, (value) => updateApplicationForm({ age: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Gender', editApplication.gender || editForm.gender, (value) => updateApplicationForm({ gender: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Civil status', editApplication.civilStatus || editForm.civilStatus, (value) => updateApplicationForm({ civilStatus: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Nationality', editApplication.nationality, (value) => updateApplicationForm({ nationality: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Birthplace', editApplication.birthplace || editForm.birthplace, (value) => updateApplicationForm({ birthplace: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Height (cm)', editApplication.height, (value) => updateApplicationForm({ height: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Weight(kg)', editApplication.weight, (value) => updateApplicationForm({ weight: value }))}</Grid>
                  <Grid size={12}>{editAppField('Current address', editApplication.currentAddress || editForm.address, (value) => { setEditForm({ ...editForm, address: value, applicationForm: { ...(editForm.applicationForm ?? {}), currentAddress: value } }); }, { multiline: true, rows: 2 })}</Grid>
                  <Grid size={12}>{editAppField('Permanent address', editApplication.permanentAddress, (value) => updateApplicationForm({ permanentAddress: value }), { multiline: true, rows: 2 })}</Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {editProfileTab === 'Education' && (
            <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
              <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Education</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Educational level', editApplication.educationBackground?.level || editForm.education, (value) => { setEditForm({ ...editForm, education: value, applicationForm: { ...(editForm.applicationForm ?? {}), educationBackground: { ...(editForm.applicationForm?.educationBackground ?? {}), level: value } } }); })}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Name of school', editApplication.educationBackground?.schoolName, (value) => updateEducation({ schoolName: value }))}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Course / Program', editApplication.educationBackground?.courseProgram, (value) => updateEducation({ courseProgram: value }))}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Year graduated', editApplication.educationBackground?.yearGraduated, (value) => updateEducation({ yearGraduated: value }))}</Grid>
                <Grid size={12}>{editAppField('Honors / Awards', editApplication.educationBackground?.honorsAwards, (value) => updateEducation({ honorsAwards: value }), { multiline: true, rows: 2 })}</Grid>
              </Grid>
            </Paper>
          )}

          {editProfileTab === 'Work' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Work Experience</Typography>
                {(editApplication.workExperiences ?? [{}]).map((work, index) => (
                  <Grid key={'edit-work-' + index} container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Company / Organization', work.companyOrganization, (value) => updateWorkExperience(index, { companyOrganization: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Position held', work.positionHeld, (value) => updateWorkExperience(index, { positionHeld: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Total years of experience', work.totalYearsExperience, (value) => updateWorkExperience(index, { totalYearsExperience: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Employment period', work.employmentPeriod || [work.employmentStartDate, work.employmentEndDate].filter(Boolean).join(' to '), (value) => updateWorkExperience(index, { employmentPeriod: value }))}</Grid>
                    <Grid size={12}>{editAppField('Duties / Responsibilities', work.dutiesResponsibilities, (value) => updateWorkExperience(index, { dutiesResponsibilities: value }), { multiline: true, rows: 3 })}</Grid>
                  </Grid>
                ))}
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Skills And Qualifications</Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>{editAppField('Skills', compactList(editApplication.skills), (value) => updateApplicationForm({ skills: value.split(',').map(item => item.trim()).filter(Boolean) }), { multiline: true, rows: 2 })}</Grid>
                  <Grid size={12}>{editAppField('Other skills', editApplication.otherSkills, (value) => updateApplicationForm({ otherSkills: value }), { multiline: true, rows: 2 })}</Grid>
                  <Grid size={12}>{editAppField('Certifications / Trainings', compactList(editApplication.certifications), (value) => updateApplicationForm({ certifications: value.split(',').map(item => item.trim()).filter(Boolean) }), { multiline: true, rows: 2 })}</Grid>
                </Grid>
              </Paper>
            </Box>
          )}

          {editProfileTab === 'References' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Government IDs</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('TIN', editApplication.tin || editForm.tin, (value) => updateApplicationForm({ tin: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('SSS', editApplication.sss || editForm.sss, (value) => updateApplicationForm({ sss: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('PhilHealth', editApplication.philhealth || editForm.philhealth, (value) => updateApplicationForm({ philhealth: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Pag-IBIG', editApplication.pagibig || editForm.pagibig, (value) => updateApplicationForm({ pagibig: value }))}</Grid>
                </Grid>
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Character References</Typography>
                {(editApplication.characterReferences ?? [{}]).map((reference, index) => (
                  <Grid key={'edit-ref-' + index} container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Name', reference.name, (value) => updateCharacterReference(index, { name: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Position / Relationship', reference.position, (value) => updateCharacterReference(index, { position: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Company / Organization', reference.company, (value) => updateCharacterReference(index, { company: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Contact number', reference.contact, (value) => updateCharacterReference(index, { contact: value }))}</Grid>
                  </Grid>
                ))}
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Emergency Contact</Typography>
                {(editApplication.emergencyContacts ?? [{}]).map((contact, index) => (
                  <Grid key={'edit-emergency-' + index} container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Name', contact.name, (value) => updateEmergencyContact(index, { name: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Relationship', contact.relation, (value) => updateEmergencyContact(index, { relation: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Phone number', contact.phone, (value) => updateEmergencyContact(index, { phone: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Address', contact.address, (value) => updateEmergencyContact(index, { address: value }))}</Grid>
                  </Grid>
                ))}
              </Paper>
            </Box>
          )}

          {editProfileTab === 'Documents' && (
            <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
              <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Documents</Typography>
              <Grid container spacing={2}>
                <Grid size={12}>{editAppField('Submitted documents', compactList(editApplication.submittedDocuments), (value) => updateApplicationForm({ submittedDocuments: value.split(',').map(item => item.trim()).filter(Boolean) }), { multiline: true, rows: 2 })}</Grid>
                <Grid size={12}>{editAppField('Other document', editApplication.otherDocument, (value) => updateApplicationForm({ otherDocument: value }))}</Grid>
              </Grid>
              {(editForm.documents ?? []).length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 2 }}>
                  {(editForm.documents ?? []).map((doc, i) => (
                    <Paper key={doc.name + '-' + i} elevation={0} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: '16px', border: '1px solid ' + GREEN_UI.border, bgcolor: '#fff' }}>
                      <DocIcon name={doc.name} type={doc.type} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {doc.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">Employee Document</Typography>
                      </Box>
                      {doc.data && (
                        <Tooltip title="Preview">
                          <IconButton size="small" color="primary" onClick={() => setPreviewDoc({ name: doc.name, data: doc.data, type: doc.type })}>
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Remove document">
                        <IconButton size="small" color="error" onClick={() => handleRemoveDoc(i)}>
                          <DeleteOutline fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>No documents uploaded yet.</Typography>
              )}
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>Upload Additional Documents</Typography>
              <FileUploadField label="Upload Documents" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" multiple files={newDocFiles} onChange={setNewDocFiles} helperText="ID cards, certificates, contracts, medical records, etc." />
            </Paper>
          )}
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, gap: 1.2, borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#ffffff' }}>
          <Button onClick={handleCloseEdit} disabled={saving} startIcon={<CancelOutlined />} sx={{ ...pillButtonSx, color: GREEN_UI.muted, py: 1 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
            onClick={handleSave}
            disabled={saving}
            sx={{ ...pillButtonSx, py: 1, px: 2.2, bgcolor: GREEN_UI.green, boxShadow: '0 10px 22px rgba(58,168,101,0.24)', '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Document Preview Dialog */}
      <Dialog open={!!previewDoc} onClose={() => setPreviewDoc(null)} maxWidth="lg" fullWidth
        PaperProps={{ sx: { height: '90vh', display: 'flex', flexDirection: 'column' } }}>
        <DialogTitle fontWeight={700} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            {previewDoc && <DocIcon name={previewDoc.name} type={previewDoc.type} />}
            <Typography fontWeight={700} noWrap sx={{ flex: 1 }}>{previewDoc?.name}</Typography>
          </Box>
          <Button variant="outlined" size="small" startIcon={<FileDownload />}
            onClick={() => previewDoc && downloadFile(previewDoc.data, previewDoc.name)} sx={{ ml: 2, flexShrink: 0 }}>
            Download
          </Button>
        </DialogTitle>
        <DialogContent sx={{ flex: 1, overflow: 'hidden', p: 1, display: 'flex', flexDirection: 'column' }}>
          {previewDoc && (() => {
            const isPdf = previewDoc.type === 'application/pdf' || previewDoc.name.toLowerCase().endsWith('.pdf');
            const isImage = previewDoc.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(previewDoc.name);
            if (isPdf) return <iframe src={previewDoc.data} title={previewDoc.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, flex: 1 }} />;
            if (isImage) return (
              <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f0f0f0', borderRadius: 2 }}>
                <img src={previewDoc.data} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
              </Box>
            );
            return (
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <InsertDriveFile sx={{ fontSize: 72, color: 'text.disabled' }} />
                <Typography variant="h6" color="text.secondary">Preview not available</Typography>
                <Button variant="contained" startIcon={<FileDownload />} onClick={() => downloadFile(previewDoc.data, previewDoc.name)}>Download to view</Button>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPreviewDoc(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle fontWeight={700}>Remove Employee</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to permanently remove <strong>{employee.name}</strong> ({employee.id}) from the database? This cannot be undone.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Remove Permanently</Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      />
    </Box>
  );
}
