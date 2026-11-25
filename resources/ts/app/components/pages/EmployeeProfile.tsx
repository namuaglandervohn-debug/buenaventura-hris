import { formatDisplayDate, formatDisplayDateRange, formatDisplayDateTime } from '../../lib/displayDate';
import TextField from '../DateTextField';
import MobileNumberField from '../MobileNumberField';
import { formatMobileNumber, isPhilippineMobileNumber } from '../../lib/mobileNumber';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Box, Typography, Button, Paper, Divider, Chip, Grid,
  CircularProgress, Alert, MenuItem, Dialog, DialogTitle,
  DialogContent, DialogActions, IconButton, Tooltip,
  Checkbox, FormControlLabel, FormGroup, InputAdornment, type TextFieldProps,
} from '../bootstrap';
import {
  ArrowBackIosNew,
  EditNote,
  Save,
  ArrowBackRounded,
  Add,
  FileDownload,
  Visibility,
  VisibilityOff,
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
} from '../bootstrap/icons';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import ActionSnackbar from '../ActionSnackbar';
import { APPLICANT_NATIONALITIES } from '../../lib/applicantProfile';
import { NO_OUTLET, OUTLETS } from '../../lib/constants';
import { loadJobSalaryRates, parseSalaryRate } from '../../lib/jobSalaryRates';
import { includeSelectedJobTitle, jobTitleKey } from '../../lib/jobTitles';
import { useJobTitleOptions } from '../../lib/useJobTitleOptions';
import { formatSalaryInput, readDailyRateEdit } from '../../lib/salaryInput';
import { saveEmployeeProfilePhoto } from '../../lib/profilePhoto';
import ProfilePhotoUpload from '../ProfilePhotoUpload';
import ProfilePhotoAvatar from '../ProfilePhotoAvatar';
import { CIVIL_STATUS, GENDER, SUFFIXES, EDUCATIONAL_ATTAINMENT, HEAR_ABOUT_OPTIONS, RELATIONSHIPS, SKILLS } from '../../lib/applicationFormOptions';
import { applicationTextFieldSx, applicationPrimaryButtonSx, applicationSecondaryButtonSx } from '../layouts/applicationFormStyles';

interface DocFile {
  name: string; title?: string; type: string; data: string;
  category?: 'certificate';
}

const ACCOUNT_TABS = ['Account', 'Personal', 'Education', 'Work', 'References', 'Documents'];
const EMPTY_PASSWORD_FIELDS = { password: '', confirmation: '', showPassword: false, showConfirmation: false };

function getProfileFiles(profile: Employee) {
  const applicantFiles = profile.applicantDocuments ?? [];
  const applicantCertificates = applicantFiles.filter(file => file.category === 'certificate');
  const certificates = [...applicantCertificates];
  const documents = new Map<string, DocFile>();
  for (const file of applicantFiles.filter(file => file.category !== 'certificate')) {
    const existing = documents.get(file.name);
    documents.set(file.name, { ...existing, ...file, title: file.title || existing?.title, data: file.data || existing?.data, type: file.type || existing?.type });
  }

  for (const file of profile.employeeDocumentsOnly ?? []) {
    if (applicantCertificates.some(original => original.name === file.name && original.data === file.data)) continue;
    if (file.category === 'certificate') certificates.push(file);
    else {
      const existing = documents.get(file.name);
      documents.set(file.name, { ...existing, ...file, title: file.title || existing?.title, data: file.data || existing?.data, type: file.type || existing?.type });
    }
  }

  return { certificates, documents: [...documents.values()] };
}

const salaryFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });

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
  profilePhoto?: string | null;

  applicantDocuments?: DocFile[];
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

const getMissingColumnFromSupabaseError = (error: any) => {
  const message = String(error?.message ?? '');
  return message.match(/Could not find the '([^']+)' column/)?.[1] ?? '';
};


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
  const [positionRates, setPositionRates] = useState(() => new Map<string, number | null>());
  const [editForm, setEditForm] = useState<Employee | null>(null);
  const [salaryDraft, setSalaryDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [hasEmployeeLogin, setHasEmployeeLogin] = useState(false);
  const [passwordFields, setPasswordFields] = useState(EMPTY_PASSWORD_FIELDS);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [previewDoc, setPreviewDoc] = useState<DocFile | null>(null);
  const [wordPreview, setWordPreview] = useState<{ file: DocFile; text: string } | null>(null);
  const [profileTab, setProfileTab] = useState('Personal');
  const [editProfileTab, setEditProfileTab] = useState('Personal');
  const [otherSkillsEnabled, setOtherSkillsEnabled] = useState(false);
  const canEditOwnProfile = user?.role === 'employee' && user.employeeId === id;
  const canSeeSalary = Boolean(user && user.role !== 'supervisor');
  const canManageAccount = user?.role === 'hr' || user?.role === 'gm';
  const jobTitles = useJobTitleOptions(editing && canManageAccount);
  const positionKey = jobTitleKey(employee?.position ?? '');
  const editPositionKey = jobTitleKey(editForm?.position ?? '');
  const alternatePositionKey = editing && editPositionKey !== positionKey ? editPositionKey : '';
  const savedSalary = parseSalaryRate(employee?.salary);
  const editSavedSalary = editPositionKey === positionKey ? savedSalary : 0;

  useEffect(() => {
    if (previewDoc?.category !== 'certificate' || !/\.docx$/i.test(previewDoc.name)) return;

    const controller = new AbortController();
    const loadWordPreview = async () => {
      try {
        const [mammoth, response] = await Promise.all([
          import('mammoth'),
          fetch(previewDoc.data, { signal: controller.signal }),
        ]);
        if (!response.ok) throw new Error('Certificate could not be read.');
        const { value } = await mammoth.extractRawText({ arrayBuffer: await response.arrayBuffer() });
        if (!controller.signal.aborted) setWordPreview({ file: previewDoc, text: value.trim() });
      } catch {
        if (!controller.signal.aborted) setWordPreview({ file: previewDoc, text: '' });
      }
    };

    void loadWordPreview();
    return () => controller.abort();
  }, [previewDoc]);

  useEffect(() => {
    const keys = [positionKey, alternatePositionKey].filter(Boolean);
    if (!canSeeSalary || !keys.length) return;

    let active = true;
    const storeRates = (rates: Map<string, number> | null) => {
      if (!active) return;
      setPositionRates(previous => {
        const next = new Map(previous);
        for (const key of keys) next.set(key, rates ? rates.get(key) ?? 0 : null);
        return next;
      });
    };
    loadJobSalaryRates(keys)
      .then(storeRates)
      .catch(() => storeRates(null));

    return () => { active = false; };
  }, [canSeeSalary, positionKey, alternatePositionKey]);

  useEffect(() => {
  if (!id) return;

  (async () => {
    setLoading(true);
    setError(null);

    try {
      const [{ data, error }, { data: account }] = await Promise.all([
        supabase.from("employees").select("*").eq("employee_id", id).single(),
        supabase.from("user_accounts").select("outlet,role,auth_user_id").eq("employee_id", id)
          .eq("is_active", true).order("user_id").limit(1).maybeSingle(),
      ]);

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

        const storedProfileForm = data.profile_details?.applicationForm && typeof data.profile_details.applicationForm === 'object'
          ? data.profile_details.applicationForm : {};

        applicationForm = applicantData || Object.keys(storedProfileForm).length ? {
          ...parsedApplication,
          ...storedProfileForm,
          applicantId: applicantData?.applicant_id ?? data.applicant_id,
          status: applicantData?.status ?? "",
          positionApplied: applicantData?.position_applied ?? parsedApplication.positionApplied ?? "",
          name: `${data.first_name ?? applicantData?.first_name ?? ""} ${data.middle_name ?? applicantData?.middle_name ?? ""} ${data.last_name ?? applicantData?.last_name ?? ""} ${data.suffix ?? applicantData?.suffix ?? ""}`.replace(/\s+/g, " ").trim(),
          firstName: data.first_name ?? applicantData?.first_name ?? storedProfileForm.firstName ?? "",
          middleName: data.middle_name ?? applicantData?.middle_name ?? storedProfileForm.middleName ?? "",
          lastName: data.last_name ?? applicantData?.last_name ?? storedProfileForm.lastName ?? "",
          suffix: data.suffix ?? applicantData?.suffix ?? storedProfileForm.suffix ?? "",
          gender: data.gender ?? applicantData?.gender ?? storedProfileForm.gender ?? "",
          civilStatus: data.civil_status ?? applicantData?.civil_status ?? storedProfileForm.civilStatus ?? "",
          birthdate: data.birthdate ?? applicantData?.birthdate ?? storedProfileForm.birthdate ?? "",
          birthplace: data.birthplace ?? applicantData?.birthplace ?? storedProfileForm.birthplace ?? "",
          height: storedProfileForm.height ?? parsedApplication.height ?? "",
          weight: storedProfileForm.weight ?? parsedApplication.weight ?? "",
          email: data.email ?? applicantData?.email ?? "",
          phone: data.phone_number ?? applicantData?.phone_number ?? "",
          tin: data.tin ?? applicantData?.tin ?? storedProfileForm.tin ?? "",
          sss: data.sss ?? applicantData?.sss ?? storedProfileForm.sss ?? "",
          philhealth: data.philhealth ?? applicantData?.philhealth ?? storedProfileForm.philhealth ?? "",
          pagibig: data.pagibig ?? applicantData?.pagibig ?? storedProfileForm.pagibig ?? "",
          age: storedProfileForm.age ?? parsedApplication.age ?? "",
          nationality: storedProfileForm.nationality ?? parsedApplication.nationality ?? "",
          currentAddress: storedProfileForm.currentAddress ?? parsedApplication.currentAddress ?? applicantData?.address ?? data.address ?? "",
          submittedAt: applicantData?.created_at ?? "",
        } : null;

        const resumeDoc =
          applicantData?.resume_file_name && applicantData?.resume_file_data
            ? [{
                name: applicantData.resume_file_name,
                title: parsedApplication.documentTitles?.[applicantData.resume_file_name],
                type: "application/pdf",
                data: applicantData.resume_file_data,
              }]
            : [];

        const certificateNames = new Set([
          ...(Array.isArray(parsedApplication.certifications) ? parsedApplication.certifications : []),
          ...(Array.isArray(applicantData?.certifications) ? applicantData.certifications : []),
        ]);
        const supportingDocs: DocFile[] = Array.isArray(applicantData?.supporting_document_files)
          ? applicantData.supporting_document_files.map((file: DocFile) => ({
            ...file,
            title: file.title || parsedApplication.documentTitles?.[file.name],
            ...(certificateNames.has(file.name) ? { category: 'certificate' as const } : {}),
          }))
          : [];

        applicantDocs = [...resumeDoc, ...supportingDocs];
      }

      const employeeDocs = Array.isArray(data.documents) ? data.documents : [];

      const employeeData: Employee = {
        id: data.employee_id,
        profilePhoto: data.profile_photo ?? null,
        applicantId: data.applicant_id ?? "",
        name: `${data.first_name ?? ""} ${data.middle_name ?? ""} ${data.last_name ?? ""} ${data.suffix ?? ""}`.replace(/\s+/g, " ").trim(),
        first_name: data.first_name ?? "",
        middle_name: data.middle_name ?? "",
        last_name: data.last_name ?? "",
        suffix: data.suffix ?? "",
        position: data.position ?? "",
        outlet: account?.outlet?.trim() || data.outlet?.trim() || "",
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
        applicantDocuments: applicantDocs,
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
      setHasEmployeeLogin(Boolean(account?.role === 'employee' && account.auth_user_id));
    } catch (e: any) {
      setError(`Could not load employee: ${e.message}`);
    } finally {
      setLoading(false);
    }
  })();
}, [id]);


  const handleSave = async () => {
  if (!canEditOwnProfile || !editForm || !id) {
    setSnackbar({ open: true, message: 'Only the employee can edit their own profile.', severity: 'error' });
    return;
  }
    const original = employee?.applicationForm;
    const updated = editForm.applicationForm;
    const changedNumbers = [
      [editForm.contact, employee?.contact],
      ...(updated?.characterReferences ?? []).map((reference, index) => [reference.contact, original?.characterReferences?.[index]?.contact]),
      ...(updated?.emergencyContacts ?? []).map((contact, index) => [contact.phone, original?.emergencyContacts?.[index]?.phone]),
    ];
    if (changedNumbers.some(([value, previous]) => value && value !== previous && !isPhilippineMobileNumber(value))) {
      setSnackbar({ open: true, message: 'Enter a valid Philippine mobile number.', severity: 'error' });
      return;
    }

  setSaving(true);

  try {
    const documentsChanged = editForm.employeeDocumentsOnly !== employee?.employeeDocumentsOnly;
    const applicationForm = editForm.applicationForm ?? {};
    const employeeProfileForm = { ...applicationForm };
    delete employeeProfileForm.applicantId;
    delete employeeProfileForm.status;
    delete employeeProfileForm.positionApplied;
    delete employeeProfileForm.submittedAt;
    delete employeeProfileForm.submittedDocuments;
    delete employeeProfileForm.documentTitles;
    const employeeUpdate: Record<string, any> = {
      first_name: editForm.first_name ?? "",
      middle_name: editForm.middle_name ?? "",
      last_name: editForm.last_name ?? "",
      suffix: editForm.suffix ?? "",
      email: editForm.email,
      phone_number: editForm.contact,
      address: editForm.address,
      emergency_contact: editForm.emergencyContact,
      gender: editForm.gender,
      civil_status: editForm.civilStatus,
      birthdate: editForm.birthdate || null,
      birthplace: editForm.birthplace,
      education: editForm.education,
      experience: editForm.experience,
      tin: editForm.tin,
      sss: editForm.sss,
      philhealth: editForm.philhealth,
      pagibig: editForm.pagibig,
      profile_details: { applicationForm: employeeProfileForm },
    };
    if (documentsChanged) employeeUpdate.documents = [...(editForm.employeeDocumentsOnly ?? [])];
    let data: any = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await supabase
        .from("employees")
        .update(employeeUpdate)
        .eq("employee_id", id)
        .select()
        .single();

      if (!result.error) {
        data = result.data;
        break;
      }

      const missingColumn = getMissingColumnFromSupabaseError(result.error);
      if (!missingColumn || ['outlet', 'documents', 'salary', 'position'].includes(missingColumn) || !(missingColumn in employeeUpdate)) throw result.error;

      delete employeeUpdate[missingColumn];
    }

    if (!data) throw new Error("Employee profile could not be saved with the available employee columns.");

    const updatedEmployee = {
  ...editForm,
  id: data.employee_id,
  name: `${data.first_name ?? ""} ${data.middle_name ?? ""} ${data.last_name ?? ""} ${data.suffix ?? ""}`.replace(/\s+/g, " ").trim(),
  first_name: data.first_name ?? "",
  middle_name: data.middle_name ?? "",
  last_name: data.last_name ?? "",
  suffix: data.suffix ?? "",
  position: data.position ?? "",
  outlet: employee?.outlet ?? editForm.outlet,
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
  breakTime: editForm.breakTime ?? "",
  timeIn: data.time_in ?? "",
  timeOut: data.time_out ?? "",
  education: data.education ?? "",
  experience: data.experience ?? "",
  tin: data.tin ?? "",
  sss: data.sss ?? "",
  philhealth: data.philhealth ?? "",
  pagibig: data.pagibig ?? "",
  employeeDocumentsOnly: Array.isArray(data.documents) ? data.documents : [],
  createdAt: data.created_at ?? "",
  updatedAt: data.updated_at ?? employee?.updatedAt ?? "",
};

    setEmployee(current => current?.id === updatedEmployee.id ? { ...updatedEmployee, profilePhoto: current.profilePhoto } : updatedEmployee);
    setEditForm(updatedEmployee);
    setEditing(false);
    setSalaryDraft(null);
    setPasswordFields(EMPTY_PASSWORD_FIELDS);

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

  const uploadProfilePhoto = async (photo: string) => {
    if (!id || !canEditOwnProfile) throw new Error('Only the employee can edit their own profile.');
    await saveEmployeeProfilePhoto(id, photo);
    setEmployee(current => current?.id === id ? { ...current, profilePhoto: photo } : current);
    setSnackbar({ open: true, message: 'Profile picture updated.', severity: 'success' });
  };

  const passwordMatches = Boolean(passwordFields.confirmation) && passwordFields.password === passwordFields.confirmation;
  const passwordValid = passwordMatches && passwordFields.password.trim().length > 0
    && passwordFields.password.length >= 8 && new TextEncoder().encode(passwordFields.password).length <= 72;

  const handleUpdatePassword = async () => {
    if (!id || !canManageAccount || !hasEmployeeLogin || !passwordValid || updatingPassword) return;
    setUpdatingPassword(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error('Sign in again to update the employee password.');
      const response = await fetch('/api/admin/user-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action: 'update_employee_password', employee_id: id, password: passwordFields.password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result) throw new Error(result?.message || 'Could not update the employee password. Try again.');
      setPasswordFields(EMPTY_PASSWORD_FIELDS);
      setSnackbar({ open: true, message: 'Employee password updated.', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Could not update the employee password.', severity: 'error' });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleRemoveDoc = (file: DocFile) => {
    setEditForm(current => current && ({
      ...current,
      employeeDocumentsOnly: current.employeeDocumentsOnly?.filter(doc => doc !== file),
    }));
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

  const postingRate = positionRates.get(positionKey);
  const editPostingRate = positionRates.get(editPositionKey);
  const suggestedSalary = editSavedSalary || editPostingRate;
  const editSalary = salaryDraft ?? (suggestedSalary ? suggestedSalary.toFixed(2) : '');
  let salaryLabel = savedSalary ? `${salaryFormatter.format(savedSalary)}/day` : 'Not set';
  if (positionKey && postingRate === undefined && !savedSalary) salaryLabel = 'Loading…';
  if (postingRate === null && !savedSalary) salaryLabel = 'Unavailable';
  if (postingRate && !savedSalary) salaryLabel = `${salaryFormatter.format(postingRate)}/day`;

  const headerDetails = [
    { label: 'Position', value: employee.position || 'Not set' },
    ...(canSeeSalary ? [{ label: 'Salary', value: salaryLabel }] : []),
    { label: 'Outlet', value: employee.outlet && employee.outlet !== NO_OUTLET ? employee.outlet : 'No Outlet' },
  ];

  const handleCloseEdit = () => {
    setEditing(false);
    setEditForm(employee);
    setSalaryDraft(null);
    setPasswordFields(EMPTY_PASSWORD_FIELDS);
  };

  const profileFiles = getProfileFiles(employee);
  const editFiles = getProfileFiles(editForm);
  const certificateNames = new Set((employee.applicantDocuments ?? [])
    .filter(file => file.category === 'certificate').map(file => file.name));
  const isGeneralDocument = (name: string) => !certificateNames.has(name);
  const submittedDocumentNames = (employee.applicationForm?.submittedDocuments ?? []).filter(isGeneralDocument).map(name => {
    const document = profileFiles.documents.find(file => file.name === name);
    return document?.title && document.title !== name ? `${document.title} (${name})` : name;
  });

  const renderCertificates = (files: DocFile[], editable = false) => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {files.length === 0 && <Typography variant="body2" color="text.secondary">No certificates uploaded yet.</Typography>}
      {files.map((file, index) => (
        <Paper key={`${file.name}-${index}`} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: '16px', borderColor: GREEN_UI.border }}>
          <DocIcon name={file.name} type={file.type} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>{file.title || file.name}</Typography>
            {file.title && file.title !== file.name && <Typography variant="caption" color="text.secondary">{file.name}</Typography>}
          </Box>
          {file.data && (
            <Tooltip title="Preview">
              <IconButton size="small" color="primary" aria-label={`Preview ${file.name}`} onClick={() => { setWordPreview(null); setPreviewDoc(file); }}>
                <Visibility fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {editable && editForm.employeeDocumentsOnly?.includes(file) && (
            <Tooltip title="Remove certificate">
              <IconButton size="small" color="error" aria-label={`Remove ${file.name}`} onClick={() => handleRemoveDoc(file)}>
                <DeleteOutline fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Paper>
      ))}
    </Box>
  );

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

  const editAppField = (label: string, value: string | undefined, onChange: (value: string) => void, props: TextFieldProps = {}) => (
    <TextField
      fullWidth
      label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      InputLabelProps={{ shrink: true }}
      sx={applicationTextFieldSx}
      {...props}
    />
  );

  const editAppChoice = (label: string, value: string | undefined, onChange: (value: string) => void, options: readonly string[], disabled = false) => (
    editAppField(label, value, onChange, {
      select: true,
      disabled,
      children: [
        <MenuItem key="empty" value="">{options.includes('') ? 'None' : `Select ${label.toLowerCase()}…`}</MenuItem>,
        ...[...new Set([...options, value ?? ''])].filter(Boolean).map(option => (
          <MenuItem key={option} value={option}>{option}</MenuItem>
        )),
      ],
    })
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
            <ProfilePhotoAvatar photo={employee.profilePhoto} name={employee.name}
              sx={{ width: 58, height: 58, borderRadius: '18px', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }} />
            <Box>
              <Typography variant="h5" sx={{ color: GREEN_UI.text, fontWeight: 700 }}>{employee.name || 'Employee Profile'}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.75, rowGap: 0.25 }}>
                <Typography variant="body2" color="text.secondary">{employee.id}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, rowGap: 0.25 }}>
                  {headerDetails.map(({ label, value }, index) => (
                    <Typography key={label} variant="body2" color="text.secondary">
                      {index > 0 && <Box component="span" aria-hidden="true" sx={{ mr: 1 }}>|</Box>}
                      <strong>{label}:</strong> {value}
                    </Typography>
                  ))}
                </Box>
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label={employee.status} size="small" variant="outlined" sx={statusChipSx(employee.status)} />
            {canEditOwnProfile && (
              <Button
                variant="outlined"
                startIcon={<EditNote />}
                sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
                onClick={() => {
                  setEditForm(employee);
                  setSalaryDraft(null);
                  setEditProfileTab('Personal');
                  setPasswordFields(EMPTY_PASSWORD_FIELDS);
                  setOtherSkillsEnabled(Boolean(employee.applicationForm?.otherSkills));
                  setEditing(true);
                }}
              >
                Edit Profile
              </Button>
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
              <Box sx={{ color: GREEN_UI.greenDark, width: 22, minWidth: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{item.icon}</Box>
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
                {detailItem('Date hired', formatDisplayDate(employee.dateHired))}
              </>
            ))}

            {profileSection('Personal Information', (
              <>
                {detailItem('First name', application.firstName || employee.first_name)}
                {detailItem('Middle name', application.middleName || employee.middle_name)}
                {detailItem('Last name', application.lastName || employee.last_name)}
                {detailItem('Suffix', application.suffix || employee.suffix)}
                {detailItem('Date of birth', formatDisplayDate(application.birthdate || employee.birthdate))}
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
                        {detailItem('Employment period', formatDisplayDateRange(work.employmentPeriod || [work.employmentStartDate, work.employmentEndDate].filter(Boolean).join(' to ')))}
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
              </>
            ))}
            {profileSection('Certificates / Training', <Grid size={12}>{renderCertificates(profileFiles.certificates)}</Grid>)}
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
                {detailItem('Resume / Biodata', profileFiles.documents.some(doc => /resume|biodata/i.test(doc.name)) ? 'Uploaded' : compactList(submittedDocumentNames.filter(name => /resume|biodata/i.test(name))))}
                {detailItem('Submitted documents', compactList(submittedDocumentNames))}
                {application.otherDocument && detailItem('Other document', application.otherDocument, { xs: 12 })}
                <Grid size={12}>
                  {profileFiles.documents.length > 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {profileFiles.documents.map((doc, i) => (
                        <Paper key={i} variant="outlined" sx={{ p: 1.4, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: '12px', borderColor: GREEN_UI.border }}>
                          <DocIcon name={doc.name} type={doc.type} />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body1" fontWeight={600} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.title || doc.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{doc.title && doc.title !== doc.name ? `${doc.name} · ` : ''}Employee Document</Typography>
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
          <>
            <Alert severity="info" sx={{ borderRadius: '16px', border: '1px solid ' + GREEN_UI.border }}>
              No linked application form details were found for this employee.
            </Alert>
            {profileFiles.certificates.length > 0 && profileSection('Certificates / Training', <Grid size={12}>{renderCertificates(profileFiles.certificates)}</Grid>)}
          </>
        )}

        {employee.updatedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Last updated: {formatDisplayDateTime(employee.updatedAt)}
          </Typography>
        )}
      </Paper>

      {/* Edit Profile Dialog */}
      <Dialog
        open={editing}
        onClose={saving || updatingPassword ? undefined : handleCloseEdit}
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
            {(canManageAccount ? ACCOUNT_TABS : ACCOUNT_TABS.slice(1)).map((tab) => (
              <Button key={tab} type="button" variant={editProfileTab === tab ? 'contained' : 'outlined'} aria-pressed={editProfileTab === tab} onClick={() => setEditProfileTab(tab)} sx={{ ...(editProfileTab === tab ? applicationPrimaryButtonSx : applicationSecondaryButtonSx), minHeight: 38, px: 2, flexShrink: 0 }}>
                {tab}
              </Button>
            ))}
          </Box>

          {editProfileTab === 'Account' && canManageAccount && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, display: 'flex', alignItems: 'center', gap: 2 }}>
                <ProfilePhotoAvatar photo={employee.profilePhoto} name={employee.name}
                  sx={{ width: 58, height: 58, bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }} />
                <ProfilePhotoUpload photo={employee.profilePhoto} disabled={saving || updatingPassword} onUpload={uploadProfilePhoto} />
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Employment details</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>{editAppChoice('Position', editForm.position,
                    position => {
                      if (jobTitleKey(position) !== editPositionKey) setSalaryDraft(null);
                      setEditForm({ ...editForm, position });
                    }, includeSelectedJobTitle(jobTitles, editForm.position))}</Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField fullWidth label="Daily Salary (₱)" value={formatSalaryInput(editSalary)}
                      InputLabelProps={{ shrink: true }} inputProps={{ inputMode: 'decimal' }} sx={applicationTextFieldSx}
                      helperText={editPostingRate ? `Job posting rate is ${salaryFormatter.format(editPostingRate)}/day. Clear to use it.` : undefined}
                      onChange={event => {
                        const rate = readDailyRateEdit(event.target as HTMLInputElement, (event.nativeEvent as InputEvent).inputType, 9);
                        if (rate !== null) setSalaryDraft(rate);
                      }} />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField fullWidth select label="Select an outlet" value={editForm.outlet}
                      onChange={event => setEditForm({ ...editForm, outlet: event.target.value })}
                      InputLabelProps={{ shrink: true }} sx={applicationTextFieldSx}>
                      <MenuItem value="" disabled>Select an outlet</MenuItem>
                      <MenuItem value={NO_OUTLET}>No Outlet</MenuItem>
                      {editForm.outlet && editForm.outlet !== NO_OUTLET && !OUTLETS.includes(editForm.outlet) && (
                        <MenuItem value={editForm.outlet}>{editForm.outlet}</MenuItem>
                      )}
                      {OUTLETS.map(outlet => <MenuItem key={outlet} value={outlet}>{outlet}</MenuItem>)}
                    </TextField>
                  </Grid>
                </Grid>
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Employee password</Typography>
                {hasEmployeeLogin ? (
                  <Grid container spacing={2}>
                    {([
                      { field: 'password', visibility: 'showPassword', label: 'New password' },
                      { field: 'confirmation', visibility: 'showConfirmation', label: 'Confirm new password' },
                    ] as const).map(({ field, visibility, label }) => (
                      <Grid key={field} size={{ xs: 12, md: 6 }}>
                        {editAppField(label, passwordFields[field], value => setPasswordFields(current => ({ ...current, [field]: value })), {
                          type: passwordFields[visibility] ? 'text' : 'password',
                          autoComplete: 'new-password',
                          disabled: updatingPassword || saving,
                          error: field === 'confirmation' && Boolean(passwordFields.confirmation) && !passwordMatches,
                          helperText: field === 'password' ? 'Use at least 8 characters.' : passwordFields.confirmation && (passwordMatches ? 'Passwords match.' : 'Passwords do not match.'),
                          InputProps: { endAdornment: <InputAdornment position="end">
                            <IconButton edge="end" aria-label={`${passwordFields[visibility] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                              onClick={() => setPasswordFields(current => ({ ...current, [visibility]: !current[visibility] }))}>
                              {passwordFields[visibility] ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment> },
                        })}
                      </Grid>
                    ))}
                    <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="outlined" onClick={handleUpdatePassword} disabled={!passwordValid || updatingPassword || saving} sx={applicationSecondaryButtonSx}>
                        {updatingPassword ? 'Updating…' : 'Update Password'}
                      </Button>
                    </Grid>
                  </Grid>
                ) : <Alert severity="info">Link an active employee login in User Accounts to update its password.</Alert>}
              </Paper>
            </Box>
          )}

          {editProfileTab === 'Personal' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>General Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Employee ID', employee.id, () => undefined, { disabled: true })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Applicant ID', editApplication.applicantId || employee.applicantId, () => undefined, { disabled: true })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Position applied for', editApplication.positionApplied || employee.position, () => undefined, { disabled: true })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Application status', editApplication.status, () => undefined, { disabled: true })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('How applicant heard about opening', editApplication.hearAbout, () => undefined, HEAR_ABOUT_OPTIONS, true)}</Grid>
                  {editApplication.hearAbout === 'Other' && <Grid size={{ xs: 12, md: 6 }}>{editAppField('Please specify', editApplication.hearAboutOther, () => undefined, { disabled: true })}</Grid>}
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Date hired', editForm.dateHired, () => undefined, { type: 'date', disabled: true })}</Grid>
                </Grid>
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Personal Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('First name', editApplication.firstName || editForm.first_name, (value) => { setEditForm({ ...editForm, first_name: value, applicationForm: { ...(editForm.applicationForm ?? {}), firstName: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Middle name', editApplication.middleName || editForm.middle_name, (value) => { setEditForm({ ...editForm, middle_name: value, applicationForm: { ...(editForm.applicationForm ?? {}), middleName: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Last name', editApplication.lastName || editForm.last_name, (value) => { setEditForm({ ...editForm, last_name: value, applicationForm: { ...(editForm.applicationForm ?? {}), lastName: value } }); })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('Suffix', editApplication.suffix ?? editForm.suffix, (value) => { setEditForm({ ...editForm, suffix: value, applicationForm: { ...editApplication, suffix: value } }); }, SUFFIXES)}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Date of birth', editApplication.birthdate ?? editForm.birthdate, (value) => setEditForm({ ...editForm, birthdate: value, applicationForm: { ...editApplication, birthdate: value } }), { type: 'date' })}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Age', editApplication.age, (value) => updateApplicationForm({ age: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('Gender', editApplication.gender ?? editForm.gender, (value) => setEditForm({ ...editForm, gender: value, applicationForm: { ...editApplication, gender: value } }), GENDER)}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('Civil status', editApplication.civilStatus ?? editForm.civilStatus, (value) => setEditForm({ ...editForm, civilStatus: value, applicationForm: { ...editApplication, civilStatus: value } }), CIVIL_STATUS)}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('Nationality', editApplication.nationality, (value) => updateApplicationForm({ nationality: value }), APPLICANT_NATIONALITIES)}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>{editAppField('Birthplace', editApplication.birthplace || editForm.birthplace, (value) => updateApplicationForm({ birthplace: value }))}</Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <MobileNumberField fullWidth label="Mobile number" value={editForm.contact || editApplication.phone}
                      onNumberChange={digits => {
                        const phone = formatMobileNumber(digits);
                        setEditForm({ ...editForm, contact: phone, applicationForm: { ...editApplication, phone } });
                      }} sx={applicationTextFieldSx} />
                  </Grid>
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
                <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('Highest educational level', editApplication.educationBackground?.level ?? editForm.education, (value) => { setEditForm({ ...editForm, education: value, applicationForm: { ...editApplication, educationBackground: { ...editApplication.educationBackground, level: value } } }); }, EDUCATIONAL_ATTAINMENT)}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Name of school', editApplication.educationBackground?.schoolName, (value) => updateEducation({ schoolName: value }))}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Course / Program', editApplication.educationBackground?.courseProgram, (value) => updateEducation({ courseProgram: value }))}</Grid>
                <Grid size={{ xs: 12, md: 6 }}>{editAppField('Year graduated', editApplication.educationBackground?.yearGraduated, (value) => updateEducation({ yearGraduated: value }))}</Grid>
              </Grid>
            </Paper>
          )}

          {editProfileTab === 'Work' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                  <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700 }}>Work Experience</Typography>
                  <Button variant="outlined" startIcon={<Add />} sx={applicationSecondaryButtonSx}
                    onClick={() => updateApplicationForm({ workExperiences: [...(editApplication.workExperiences ?? [{}]), {}] })}>
                    Add Work Experience
                  </Button>
                </Box>
                {(editApplication.workExperiences ?? [{}]).map((work, index, entries) => (
                  <Grid key={'edit-work-' + index} container spacing={2} sx={{ mb: 2 }}>
                    {entries.length > 1 && <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Button variant="outlined" color="error" startIcon={<DeleteOutline />} aria-label={`Remove work experience ${index + 1}`}
                        onClick={() => updateApplicationForm({ workExperiences: entries.filter((_, entry) => entry !== index) })}>
                        Remove
                      </Button>
                    </Grid>}
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Company / Organization', work.companyOrganization, (value) => updateWorkExperience(index, { companyOrganization: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Position held', work.positionHeld, (value) => updateWorkExperience(index, { positionHeld: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Total years of experience', work.totalYearsExperience, (value) => updateWorkExperience(index, { totalYearsExperience: value }))}</Grid>
                    {work.employmentPeriod && !work.employmentStartDate && !work.employmentEndDate && (
                      <Grid size={12}>{editAppField('Saved employment period', work.employmentPeriod, (value) => updateWorkExperience(index, { employmentPeriod: value }))}</Grid>
                    )}
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Employment start date', work.employmentStartDate, (value) => updateWorkExperience(index, { employmentStartDate: value, employmentPeriod: [value, work.employmentEndDate].filter(Boolean).join(' to ') }), { type: 'date' })}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Employment end date', work.employmentEndDate, (value) => updateWorkExperience(index, { employmentEndDate: value, employmentPeriod: [work.employmentStartDate, value].filter(Boolean).join(' to ') }), { type: 'date' })}</Grid>
                    <Grid size={12}>{editAppField('Duties / Responsibilities', work.dutiesResponsibilities, (value) => updateWorkExperience(index, { dutiesResponsibilities: value }), { multiline: true, rows: 3 })}</Grid>
                  </Grid>
                ))}
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Skills And Qualifications</Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <FormGroup row>
                      {[...new Set([...SKILLS, ...(editApplication.skills ?? [])])].map(skill => (
                        <FormControlLabel key={skill} label={skill} control={<Checkbox checked={editApplication.skills?.includes(skill) ?? false}
                          onChange={(_, checked) => updateApplicationForm({ skills: checked
                            ? [...(editApplication.skills ?? []), skill]
                            : (editApplication.skills ?? []).filter(item => item !== skill) })} />} />
                      ))}
                      <FormControlLabel label="Others" control={<Checkbox checked={otherSkillsEnabled} onChange={(_, checked) => {
                        setOtherSkillsEnabled(checked);
                        if (!checked) updateApplicationForm({ otherSkills: '' });
                      }} />} />
                    </FormGroup>
                  </Grid>
                  {otherSkillsEnabled && <Grid size={12}>{editAppField('Other skills', editApplication.otherSkills, (value) => updateApplicationForm({ otherSkills: value }))}</Grid>}
                </Grid>
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Certificates / Training</Typography>
                {renderCertificates(editFiles.certificates, true)}
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
                    <Grid size={{ xs: 12, md: 6 }}>
                      <MobileNumberField fullWidth label="Contact number" value={reference.contact}
                        onNumberChange={digits => updateCharacterReference(index, { contact: formatMobileNumber(digits) })} sx={applicationTextFieldSx} />
                    </Grid>
                  </Grid>
                ))}
              </Paper>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
                <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Emergency Contact</Typography>
                {(editApplication.emergencyContacts ?? [{}]).map((contact, index) => (
                  <Grid key={'edit-emergency-' + index} container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Name', contact.name, (value) => updateEmergencyContact(index, { name: value }))}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppChoice('Relationship', contact.relation, (value) => updateEmergencyContact(index, { relation: value }), RELATIONSHIPS)}</Grid>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <MobileNumberField fullWidth label="Phone number" value={contact.phone}
                        onNumberChange={digits => updateEmergencyContact(index, { phone: formatMobileNumber(digits) })} sx={applicationTextFieldSx} />
                    </Grid>
                    <Grid size={{ xs: 12, md: 6 }}>{editAppField('Address', contact.address, (value) => updateEmergencyContact(index, { address: value }))}</Grid>
                  </Grid>
                ))}
              </Paper>
            </Box>
          )}

          {editProfileTab === 'Documents' && (
            <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
              <Typography variant="h6" sx={{ color: GREEN_UI.text, fontWeight: 700, mb: 2 }}>Documents</Typography>
              {editFiles.documents.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, my: 2 }}>
                  {editFiles.documents.map((doc, i) => (
                    <Paper key={doc.name + '-' + i} elevation={0} sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, borderRadius: '16px', border: '1px solid ' + GREEN_UI.border, bgcolor: '#fff' }}>
                      <DocIcon name={doc.name} type={doc.type} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {doc.title || doc.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">{doc.title && doc.title !== doc.name ? `${doc.name} · ` : ''}Employee Document</Typography>
                      </Box>
                      {doc.data && (
                        <Tooltip title="Preview">
                          <IconButton size="small" color="primary" onClick={() => setPreviewDoc({ name: doc.name, data: doc.data, type: doc.type })}>
                            <Visibility fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {editForm.employeeDocumentsOnly?.includes(doc) && (
                        <Tooltip title="Remove document">
                          <IconButton size="small" color="error" onClick={() => handleRemoveDoc(doc)}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Paper>
                  ))}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>No documents uploaded yet.</Typography>
              )}
            </Paper>
          )}
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, gap: 1.2, justifyContent: 'space-between', borderTop: `1px solid ${GREEN_UI.border}`, bgcolor: '#ffffff' }}>
          <Button variant="outlined" onClick={handleCloseEdit} disabled={saving || updatingPassword} startIcon={<ArrowBackRounded />} sx={applicationSecondaryButtonSx}>
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
            onClick={handleSave}
            disabled={saving || updatingPassword}
            sx={applicationPrimaryButtonSx}
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
            const isImage = previewDoc.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(previewDoc.name);
            if (isPdf) return <iframe src={previewDoc.data} title={previewDoc.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, flex: 1 }} />;
            if (isImage) return (
              <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f0f0f0', borderRadius: 2 }}>
                <img src={previewDoc.data} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
              </Box>
            );
            if (previewDoc.category === 'certificate' && /\.docx$/i.test(previewDoc.name)) {
              if (wordPreview?.file !== previewDoc) return <Box sx={{ m: 'auto' }}><CircularProgress aria-label="Loading certificate preview" /></Box>;
              if (wordPreview.text) return (
                <Box sx={{ overflow: 'auto', p: 3 }}>
                  <Typography variant="caption" color="text.secondary">Text preview. Download the original to view its formatting.</Typography>
                  <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mt: 2 }}>{wordPreview.text}</Typography>
                </Box>
              );
            }
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

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      />
    </Box>
  );
}
