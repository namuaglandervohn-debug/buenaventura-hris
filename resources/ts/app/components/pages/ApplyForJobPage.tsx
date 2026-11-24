import TextField from '../DateTextField';
import MobileNumberField from '../MobileNumberField';
import { formatMobileNumber as formatPhoneWithCountryCode, isPhilippineMobileNumber, localMobileNumber as sanitizePhoneNumber } from '../../lib/mobileNumber';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import {
  Box,
  Typography,
  Paper,
  Button,
  MenuItem,
  Container,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  CircularProgress,
  Stack,
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
  Tooltip,
} from '../bootstrap';

import {
  Send,
  ContentCopy,
  Add,
  Delete,
  UploadFile,
  ArrowBackRounded,
  ArrowForwardRounded,
  WorkOutline,
  PersonOutline,
  SchoolOutlined,
  AutoAwesomeOutlined,
  Groups2Outlined,
  DescriptionOutlined,
  HomeWorkOutlined,
  AssignmentTurnedInOutlined,
  VerifiedUserOutlined,
  CheckCircleOutlineRounded,
  LocationOnOutlined,
  ArticleOutlined,
  WorkOutlined,
  LocalPhoneRounded,
  Visibility,
  FileDownload,
} from '../bootstrap/icons';

import AuthBackground from '../AuthBackground';
import { useAuth } from '../../context/AuthContext';
import { APPLICANT_COUNTRIES as COUNTRIES, APPLICANT_NATIONALITIES as NATIONALITIES, reusableApplicantProfile } from '../../lib/applicantProfile';
import { completeApplicantAddress, PH_PROVINCES_BY_REGION, CITIES_BY_PROVINCE, ZIP_BY_CITY, BARANGAYS_BY_CITY } from '../../lib/applicantAddress';
import { CIVIL_STATUS, GENDER, SUFFIXES, EDUCATIONAL_ATTAINMENT, HEAR_ABOUT_OPTIONS, RELATIONSHIPS, SKILLS } from '../../lib/applicationFormOptions';
import { applicationTextFieldSx as textFieldSx, applicationButtonSx as softButtonSx, applicationPrimaryButtonSx, applicationSecondaryButtonSx } from '../layouts/applicationFormStyles';
import { copyToClipboard } from '../../lib/copyToClipboard';
import { fileToDataUrl, saveApplicationFiles } from '../../lib/applicationFiles';
import { supabase } from '../../lib/supabaseClient';
import { submitApplicantWithConfirmation, sendApplicantConfirmation } from '../../lib/submitApplicantWithConfirmation';
import { currentLeaveDate as currentManilaDate } from '../../lib/leaveRequestDates';
import { applicationHistoryColumns, previousApplicationAnswers, previousApplicationFiles, type ApplicationHistoryItem } from '../../lib/applicationHistory';
import { formatDisplayDate } from '../../lib/displayDate';

const ACCEPTED_APPLICATION_FILE_TYPES = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
const ACCEPTED_APPLICATION_FILE_LABEL = 'PDF, DOC, DOCX, JPG, JPEG, and PNG';
const APPLICATION_FILE_TYPES = new Map(Object.entries({
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
}));
const applicationFileType = (file: File) => APPLICATION_FILE_TYPES.get(file.name.match(/\.([^.]+)$/)?.[1].toLowerCase() ?? '');
const applicationFileTitleKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const SUPPORTING_DOCUMENT_EXAMPLES = 'Transcript of Records, Birth Certificate, Medical Certificate, valid ID, training certificates, or other required documents';

function ApplicationFilePreview({ file, onClose }: { file: File; onClose: () => void }) {
  const type = applicationFileType(file);
  const isDocx = type === APPLICATION_FILE_TYPES.get('docx');
  const [url, setUrl] = useState('');
  const [documentText, setDocumentText] = useState<string | null>(null);

  useEffect(() => {
    const source = URL.createObjectURL(file.slice(0, file.size, type));
    setUrl(source);
    let active = true;

    if (isDocx) {
      void Promise.all([import('mammoth'), file.arrayBuffer()])
        .then(([mammoth, arrayBuffer]) => mammoth.extractRawText({ arrayBuffer }))
        .then(({ value }) => { if (active) setDocumentText(value.trim()); })
        .catch(() => { if (active) setDocumentText(''); });
    }

    return () => {
      active = false;
      URL.revokeObjectURL(source);
    };
  }, [file, type, isDocx]);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="application-file-preview-title">
      <DialogTitle id="application-file-preview-title" sx={{ overflowWrap: 'anywhere' }}>{file.name}</DialogTitle>
      <DialogContent dividers>
        {url && (type === 'application/pdf' ? (
          <Box component="iframe" title={file.name} src={url} sx={{ display: 'block', width: '100%', height: '65vh', border: 0 }} />
        ) : type?.startsWith('image/') ? (
          <Box component="img" src={url} alt={file.name} sx={{ display: 'block', mx: 'auto', maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain' }} />
        ) : isDocx && documentText === null ? (
          <CircularProgress size={24} aria-label="Loading file preview" />
        ) : isDocx && documentText ? (
          <>
            <Typography variant="caption" color="text.secondary">Text preview. Download the original to view its formatting.</Typography>
            <Typography sx={{ mt: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{documentText}</Typography>
          </>
        ) : (
          <Typography>Download this file to open it on your device.</Typography>
        ))}
      </DialogContent>
      <DialogActions>
        {url && <Button component="a" href={url} download={file.name} startIcon={<FileDownload />}>Download</Button>}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}




const steps = ['Position', 'Personal', 'Education & Work', 'Skills', 'References', 'Documents'];

type CharacterReference = { name: string; position: string; company: string; contact: string };
type AddressPrefix = 'birthplace' | 'current' | 'permanent';
type WorkExperience = {
  companyOrganization: string;
  positionHeld: string;
  totalYearsExperience: string;
  employmentStartDate: string;
  employmentEndDate: string;
  dutiesResponsibilities: string;
};
type EmergencyContact = {
  name: string;
  relation: string;
  relationOther: string;
  phone: string;
  address: string;
};

const EMPTY_CHARACTER_REFERENCE: CharacterReference = { name: '', position: '', company: '', contact: '' };
const EMPTY_WORK_EXPERIENCE: WorkExperience = {
  companyOrganization: '',
  positionHeld: '',
  totalYearsExperience: '',
  employmentStartDate: '',
  employmentEndDate: '',
  dutiesResponsibilities: '',
};
const EMPTY_EMERGENCY_CONTACT: EmergencyContact = {
  name: '',
  relation: '',
  relationOther: '',
  phone: '',
  address: '',
};

const EMPTY = {
  position: '', hearAbout: '', hearAboutOther: '',
  firstName: '', middleName: '', lastName: '', suffix: '', birthdate: '', age: '', gender: '', civilStatus: '', nationality: '', contactNumber: '', email: '',
  birthplaceCountry: 'Philippines', birthplaceRegion: '', birthplaceProvince: '', birthplaceCity: '',
  currentCountry: 'Philippines', currentRegion: '', currentProvince: '', currentCity: '', currentBarangay: '', currentStreet: '', currentZipCode: '', currentAddress: '',
  permanentCountry: 'Philippines', permanentRegion: '', permanentProvince: '', permanentCity: '', permanentBarangay: '', permanentStreet: '', permanentZipCode: '', permanentAddress: '',
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactRelationOther: '', emergencyContactPhone: '', emergencyContactAddress: '',
  education: '', schoolName: '', courseProgram: '', yearGraduated: '',
  companyOrganization: '', positionHeld: '', employmentStartDate: '', employmentEndDate: '', employmentPeriod: '', dutiesResponsibilities: '', totalYearsExperience: '',
  skills: [] as string[], otherSkills: '',
  referenceName: '', referencePosition: '', referenceCompany: '', referenceContact: '',
  submittedDocuments: [] as string[], otherDocument: '', applicantSignature: '', declarationDate: null as string | null,
  birthplace: '', height: '', weight: '', address: '', experience: '', tin: '', sss: '', philhealth: '', pagibig: '',
};

type FormState = typeof EMPTY;
type FormKey = keyof FormState;
type FieldErrors = Partial<Record<FormKey | 'resumeFiles' | 'supportingFiles', string>>;

function calculateAge(birthdate: string) {
  if (!birthdate) return '';
  const birth = new Date(birthdate);
  const today = new Date();
  if (Number.isNaN(birth.getTime()) || birth > today) return '';
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
}


const fallbackBarangays = ['Poblacion', 'Barangay 1', 'Barangay 2', 'Barangay 3', 'Other / Not listed'];

const SectionTitle = ({
  icon,
  title,
}: {
  icon: ReactNode;
  title: string;
}) => (
  <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
    <Box
      sx={{
        width: 42,
        height: 42,
        minWidth: 42,
        borderRadius: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#166534',
        background: 'linear-gradient(135deg, rgba(220, 252, 231, 0.96), rgba(187, 247, 208, 0.68))',
        border: '1px solid rgba(34, 197, 94, 0.18)',
        boxShadow: '0 12px 26px rgba(22, 101, 52, 0.10)',
      }}
    >
      {icon}
    </Box>
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="h6"
        fontWeight={700}
        sx={{ color: '#14532d', lineHeight: 1.15, letterSpacing: '-0.02em', overflowWrap: 'anywhere' }}
      >
        {title}
      </Typography>
    </Box>
  </Stack>
);

export default function ApplyForJobPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedPosition = (searchParams.get('position') ?? '').trim();
  const requestedSource = searchParams.get('reuse') ?? '';

  const { user, loading: authLoading } = useAuth();
  const [history, setHistory] = useState<ApplicationHistoryItem[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [choosingHistory, setChoosingHistory] = useState(false);
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [missingHistoryFiles, setMissingHistoryFiles] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [formData, setFormData] = useState<FormState>(EMPTY);
  const [openPositions, setOpenPositions] = useState<string[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [resumeFiles, setResumeFiles] = useState<File[]>([]);
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [otherSkillsEnabled, setOtherSkillsEnabled] = useState(false);
  const [certificateFiles, setCertificateFiles] = useState<File[]>([]);
  const [certificateError, setCertificateError] = useState('');
  const [documentTitles, setDocumentTitles] = useState<Record<string, string>>({});
  const [documentTitleError, setDocumentTitleError] = useState('');
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const certificateInput = useRef<HTMLInputElement>(null);
  const [successDialog, setSuccessDialog] = useState(false);
  const [applicantId, setApplicantId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submissionInProgress = useRef(false);
  const [error, setError] = useState('');
  const [emailNotice, setEmailNotice] = useState('');
  const [emailPending, setEmailPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [characterReferences, setCharacterReferences] = useState<CharacterReference[]>([EMPTY_CHARACTER_REFERENCE]);
  const [workExperiences, setWorkExperiences] = useState<WorkExperience[]>([EMPTY_WORK_EXPERIENCE]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([EMPTY_EMERGENCY_CONTACT]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'applicant') { setProfileLoading(false); return; }
    let active = true;
    setProfileLoading(true);
    void (async () => {
      try {
        const [result, submissions] = await Promise.all([
          supabase.from('applicant_profiles').select('profile').eq('auth_user_id', user.id).single(),
          supabase.from('applicants').select(applicationHistoryColumns).eq('auth_user_id', user.id)
            .order('created_at', { ascending: false }).order('applicant_id', { ascending: false }),
        ]);
        if (result.error) throw result.error;
        if (!active) return;
        const profile = completeApplicantAddress(result.data.profile || {});
        setProfileLoaded(true);
        const basicKeys = Object.keys(EMPTY).filter(key => key.startsWith('current') ||
          ['firstName', 'middleName', 'lastName', 'suffix', 'birthdate', 'gender', 'civilStatus', 'nationality', 'contactNumber'].includes(key));
        setFormData({ ...EMPTY, ...reusableApplicantProfile(profile, basicKeys), email: user.email,
          age: calculateAge(profile.birthdate || ''), contactNumber: sanitizePhoneNumber(profile.contactNumber || ''), position: requestedPosition });
        setWorkExperiences([EMPTY_WORK_EXPERIENCE]);
        setCharacterReferences([EMPTY_CHARACTER_REFERENCE]);
        setEmergencyContacts([EMPTY_EMERGENCY_CONTACT]);
        setOtherSkillsEnabled(false);
        setResumeFiles([]);
        setSupportingFiles([]);
        setCertificateFiles([]);
        setDocumentTitles({});
        setDocumentTitleError('');
        setMissingHistoryFiles([]);
        const rows = submissions.data ?? [];
        setHistory(rows);
        setSourceId(rows.find(row => row.applicant_id === requestedSource)?.applicant_id ?? rows[0]?.applicant_id ?? '');
        setChoosingHistory(rows.length > 0);
        if (submissions.error) setError('Could not load previous applications. You can still start with your saved profile.');
      } catch (e: any) { if (active) setError('Your saved profile could not be loaded. '+e.message); }
      finally { if (active) setProfileLoading(false); }
    })();
    return () => { active = false; };
  }, [user?.id, authLoading, requestedPosition, requestedSource]);

  const reuseApplication = async () => {
    if (!user || !sourceId || loadingAnswers) return;
    setLoadingAnswers(true);
    setHistoryError('');
    try {
      const { data, error: loadError } = await supabase.from('applicants')
        .select('first_name,middle_name,last_name,suffix,birthdate,gender,civil_status,phone_number,height,weight,education,position_applied,tin,sss,philhealth,pagibig,cover_letter,resume_file_name,resume_file_data,supporting_documents,supporting_document_files')
        .eq('auth_user_id', user.id).eq('applicant_id', sourceId).single();
      if (loadError) throw loadError;
      const answers = previousApplicationAnswers(data, RELATIONSHIPS);
      const files = previousApplicationFiles(data);
      const fields = completeApplicantAddress(answers.fields);
      const position = [requestedPosition, fields.position].find(title => openPositions.includes(title)) ?? '';
      setFieldErrors(!position && fields.position ? {
        position: `${fields.position} is no longer open. Select an available position.`,
      } : {});
      setFormData(prev => ({ ...prev, ...fields,
        position,
        age: fields.age || calculateAge(fields.birthdate ?? prev.birthdate),
        contactNumber: sanitizePhoneNumber(fields.contactNumber ?? prev.contactNumber),
      }));
      setWorkExperiences(answers.workExperiences.length ? answers.workExperiences : [EMPTY_WORK_EXPERIENCE]);
      setCharacterReferences(answers.characterReferences.length ? answers.characterReferences.map(ref => ({
        name: ref.name, position: ref.position, company: ref.company, contact: sanitizePhoneNumber(ref.contact),
      })) : [EMPTY_CHARACTER_REFERENCE]);
      setEmergencyContacts(answers.emergencyContacts.length ? answers.emergencyContacts.map(contact => ({
        name: contact.name, relation: contact.relation, relationOther: contact.relationOther,
        phone: sanitizePhoneNumber(contact.phone), address: contact.address,
      })) : [EMPTY_EMERGENCY_CONTACT]);
      setOtherSkillsEnabled(Boolean(fields.otherSkills.trim()));
      setResumeFiles(files.resume);
      setSupportingFiles(files.supporting);
      setCertificateFiles(files.certificates);
      setDocumentTitles(Object.fromEntries([
        ...files.resume, ...files.supporting, ...files.certificates,
      ].map(file => [applicationFileTitleKey(file), files.titlesByName[file.name] || file.name.replace(/\.[^.]+$/, '')])));
      setMissingHistoryFiles(files.missing);
      setChoosingHistory(false);
    } catch {
      setHistoryError('Could not load that application. Try again or start a new form.');
    } finally {
      setLoadingAnswers(false);
    }
  };

  const stepPaperSx = {
    p: { xs: 2, sm: 2.5, md: 4 },
    mb: { xs: 2, md: 3 },
    borderRadius: '26px',
    border: '1px solid rgba(22,101,52,0.10)',
    background: 'linear-gradient(180deg, #ffffff 0%, #fbfefc 100%)',
    minHeight: { xs: 'auto', lg: 520 },
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    boxShadow: '0 18px 45px rgba(15,23,42,0.06)',
    width: '100%',
    overflow: 'hidden',
  };

  const nestedPaperSx = {
    p: { xs: 2, sm: 2.5 },
    borderRadius: '20px',
    border: '1px solid rgba(22,101,52,0.10)',
    background: 'linear-gradient(180deg, #fbfefc 0%, #f6fbf4 100%)',
    boxShadow: '0 14px 34px rgba(15,23,42,0.045)',
    overflow: 'hidden',
  };

  const fieldGrid = { xs: 12, sm: 6, lg: 4 };
  const nameGrid = { xs: 12, sm: 6, lg: 3 };
  const halfGrid = { xs: 12, md: 6 };
  const addressGrid = { xs: 12, sm: 6, lg: 3 };
  const responsiveHeroTitleSx = {
    color: '#14532d',
    lineHeight: 1.05,
    fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
    overflowWrap: 'anywhere',
  };
  const responsiveFormTitleSx = {
    color: '#14532d',
    mb: 1,
    fontSize: { xs: '1.55rem', sm: '2rem', md: '2.35rem' },
    overflowWrap: 'anywhere',
  };
  const compactChoiceSx = {
    width: { xs: '100%', sm: '50%', lg: '32%' },
    mr: 0,
    '& .MuiFormControlLabel-label': {
      fontSize: { xs: '0.9rem', sm: '0.95rem' },
      overflowWrap: 'anywhere',
    },
  };
  const uploadButtonSx = {
    ...softButtonSx,
    borderColor: '#166534',
    color: '#166534',
    background: '#ffffff',
    minHeight: { xs: 76, sm: 90 },
    px: { xs: 2, sm: 3 },
    '& .MuiButton-startIcon': { flexShrink: 0 },
  };

  const stepIconSx = { fontSize: { xs: 18, sm: 20, md: 22 } };
  const stepIcons = [
    <WorkOutline sx={stepIconSx} />,
    <PersonOutline sx={stepIconSx} />,
    <SchoolOutlined sx={stepIconSx} />,
    <AutoAwesomeOutlined sx={stepIconSx} />,
    <Groups2Outlined sx={stepIconSx} />,
    <DescriptionOutlined sx={stepIconSx} />,
  ];

  const clearFieldError = (key: FormKey | 'resumeFiles' | 'supportingFiles') => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  useEffect(() => {
    let isMounted = true;

    const fetchOpenPositions = async () => {
      setPositionsLoading(true);

      const { data, error: positionsError } = await supabase
        .from('job_postings')
        .select('title, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!isMounted) return;

      if (positionsError) {
        console.error(positionsError);
        setOpenPositions([]);
        setError('Unable to load open positions. Please refresh the page or try again later.');
      } else {
        const titles = Array.from(
          new Set(
            (data ?? [])
              .map((job) => String(job.title ?? '').trim())
              .filter(Boolean)
          )
        );

        setOpenPositions(titles);
      }

      setPositionsLoading(false);
    };

    fetchOpenPositions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (positionsLoading) return;

    if (requestedPosition && openPositions.includes(requestedPosition)) {
      setFormData((prev) =>
        prev.position === requestedPosition ? prev : { ...prev, position: requestedPosition }
      );
      clearFieldError('position');
      return;
    }

    if (requestedPosition && !openPositions.includes(requestedPosition)) {
      setFormData((prev) => (prev.position ? { ...prev, position: '' } : prev));
      setFieldErrors((prev) => ({
        ...prev,
        position: 'The selected position is no longer available. Please choose from the current open positions.',
      }));
      return;
    }

    setFormData((prev) =>
      prev.position && !openPositions.includes(prev.position) ? { ...prev, position: '' } : prev
    );
  }, [positionsLoading, requestedPosition, openPositions]);

  const set = (key: FormKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [key]: e.target.value }));
    clearFieldError(key);
  };

  const setUpperText = (key: FormKey) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value.replace(/[^a-zA-ZÀ-žñÑ .'-]/g, '');
    setFormData((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
  };

  const setNumeric = (key: FormKey, maxLength: number) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, maxLength);
    setFormData((prev) => ({ ...prev, [key]: value }));
    clearFieldError(key);
  };

  const setEmail = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, email: e.target.value.trim().toLowerCase() }));
    clearFieldError('email');
  };

  const setBirthdate = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, birthdate: value, age: calculateAge(value) }));
    clearFieldError('birthdate');
    clearFieldError('age');
  };


  const buildAddress = (country: string, region: string, province: string, city: string, barangay = '', street = '', zipCode = '') =>
    [street, barangay, city, province, region, country, zipCode].map((part) => part.trim()).filter(Boolean).join(', ');

  const getProvinceOptions = (country: string, region: string) => country === 'Philippines' && region ? PH_PROVINCES_BY_REGION[region] ?? [] : [];
  const getCityOptions = (province: string) => CITIES_BY_PROVINCE[province] ?? [];
  const getBarangayOptions = (city: string) => BARANGAYS_BY_CITY[city] ?? fallbackBarangays;

  const handleAddressCountryChange = (prefix: AddressPrefix, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [`${prefix}Country`]: value,
      [`${prefix}Region`]: '',
      [`${prefix}Province`]: '',
      [`${prefix}City`]: '',
      ...(prefix !== 'birthplace' && { [`${prefix}Barangay`]: '', [`${prefix}ZipCode`]: '' }),
    } as FormState));
    clearFieldError(`${prefix}Country` as FormKey);
  };

  const handleAddressRegionChange = (prefix: AddressPrefix, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [`${prefix}Region`]: value,
      [`${prefix}Province`]: '',
      [`${prefix}City`]: '',
      ...(prefix !== 'birthplace' && { [`${prefix}Barangay`]: '', [`${prefix}ZipCode`]: '' }),
    } as FormState));
    clearFieldError(`${prefix}Region` as FormKey);
  };

  const handleAddressProvinceChange = (prefix: AddressPrefix, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [`${prefix}Province`]: value,
      [`${prefix}City`]: '',
      ...(prefix !== 'birthplace' && { [`${prefix}Barangay`]: '', [`${prefix}ZipCode`]: '' }),
    } as FormState));
    clearFieldError(`${prefix}Province` as FormKey);
  };

  const handleAddressCityChange = (prefix: AddressPrefix, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [`${prefix}City`]: value,
      ...(prefix !== 'birthplace' && { [`${prefix}Barangay`]: '', [`${prefix}ZipCode`]: ZIP_BY_CITY[value] ?? '' }),
    } as FormState));
    clearFieldError(`${prefix}City` as FormKey);
  };

  const handleAddressBarangayChange = (prefix: Exclude<AddressPrefix, 'birthplace'>, value: string) => {
    setFormData((prev) => ({ ...prev, [`${prefix}Barangay`]: value } as FormState));
    clearFieldError(`${prefix}Barangay` as FormKey);
  };

  const copyCurrentToPermanent = () => {
    setFormData((prev) => ({
      ...prev,
      permanentCountry: prev.currentCountry,
      permanentRegion: prev.currentRegion,
      permanentProvince: prev.currentProvince,
      permanentCity: prev.currentCity,
      permanentBarangay: prev.currentBarangay,
      permanentStreet: prev.currentStreet,
      permanentZipCode: prev.currentZipCode,
      permanentAddress: buildAddress(prev.currentCountry, prev.currentRegion, prev.currentProvince, prev.currentCity, prev.currentBarangay, prev.currentStreet, prev.currentZipCode),
    }));
  };

  const toggleListItem = (key: 'skills', value: string) => {
    setFormData((prev) => {
      const current = prev[key] as string[];
      return { ...prev, [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] };
    });
    clearFieldError(key);
  };

  const addCertificates = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (!files.length) return;
    const valid = files.filter(file => file.size > 0 && applicationFileType(file));
    setCertificateError(valid.length === files.length ? '' : `Select nonempty certificate files in ${ACCEPTED_APPLICATION_FILE_LABEL} format.`);
    if (valid.length) {
      setCertificateFiles(current => [...current, ...valid]);
      clearFieldError('supportingFiles');
    }
  };

  const updateCharacterReference = (index: number, key: keyof CharacterReference, value: string) => {
    setCharacterReferences((prev) => prev.map((reference, currentIndex) => currentIndex === index ? { ...reference, [key]: value } : reference));
  };
  const updateCharacterReferenceName = (index: number, value: string) => updateCharacterReference(index, 'name', value.replace(/[^a-zA-ZÀ-žñÑ .'-]/g, ''));
  const updateCharacterReferenceContact = (index: number, value: string) => updateCharacterReference(index, 'contact', sanitizePhoneNumber(value));
  const addCharacterReference = () => setCharacterReferences((prev) => [...prev, { ...EMPTY_CHARACTER_REFERENCE }]);
  const removeCharacterReference = (index: number) => setCharacterReferences((prev) => prev.length === 1 ? prev : prev.filter((_, currentIndex) => currentIndex !== index));

  const updateWorkExperience = (index: number, key: keyof WorkExperience, value: string) => {
    setWorkExperiences((prev) => prev.map((workExperience, currentIndex) => currentIndex === index ? { ...workExperience, [key]: value } : workExperience));
    if (key === 'employmentEndDate' || key === 'employmentStartDate') clearFieldError('employmentEndDate');
    if (key === 'totalYearsExperience') clearFieldError('totalYearsExperience');
  };
  const updateWorkExperienceText = (index: number, key: Exclude<keyof WorkExperience, 'totalYearsExperience'>, value: string) =>
    updateWorkExperience(index, key, value);
  const updateWorkExperienceNumeric = (index: number, key: 'totalYearsExperience', value: string) =>
    updateWorkExperience(index, key, value.replace(/\D/g, '').slice(0, 2));
  const addWorkExperience = () => setWorkExperiences((prev) => [...prev, { ...EMPTY_WORK_EXPERIENCE }]);
  const removeWorkExperience = (index: number) => setWorkExperiences((prev) => prev.length === 1 ? prev : prev.filter((_, currentIndex) => currentIndex !== index));

  const updateEmergencyContact = (index: number, key: keyof EmergencyContact, value: string) => {
    setEmergencyContacts((prev) => prev.map((contact, currentIndex) => currentIndex === index ? { ...contact, [key]: value } : contact));
    if (key === 'name') clearFieldError('emergencyContactName');
    if (key === 'relation') {
      clearFieldError('emergencyContactRelation');
      clearFieldError('emergencyContactRelationOther');
    }
    if (key === 'relationOther') clearFieldError('emergencyContactRelationOther');
    if (key === 'phone') clearFieldError('emergencyContactPhone');
  };
  const updateEmergencyContactName = (index: number, value: string) => updateEmergencyContact(index, 'name', value.replace(/[^a-zA-Z .'-]/g, ''));
  const updateEmergencyContactRelation = (index: number, value: string) => {
    updateEmergencyContact(index, 'relation', value);
    if (value !== 'Other') updateEmergencyContact(index, 'relationOther', '');
  };
  const updateEmergencyContactRelationOther = (index: number, value: string) => updateEmergencyContact(index, 'relationOther', value.replace(/[^a-zA-Z .'-]/g, ''));
  const updateEmergencyContactPhone = (index: number, value: string) => updateEmergencyContact(index, 'phone', sanitizePhoneNumber(value));
  const addEmergencyContact = () => setEmergencyContacts((prev) => [...prev, { ...EMPTY_EMERGENCY_CONTACT }]);
  const removeEmergencyContact = (index: number) => setEmergencyContacts((prev) => prev.length === 1 ? prev : prev.filter((_, currentIndex) => currentIndex !== index));

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const validateStep = (stepIndex: number) => {
    const errors: FieldErrors = {};
    if (stepIndex === 0) {
      if (!formData.position) errors.position = 'Position title is required.';
      if (!formData.hearAbout) errors.hearAbout = 'Please select where you heard about the opening.';
      if (formData.hearAbout === 'Other' && !formData.hearAboutOther.trim()) errors.hearAboutOther = 'Please specify where you heard about the opening.';
    }
    if (stepIndex === 1) {
      if (!formData.firstName.trim()) errors.firstName = 'First name is required.';
      if (!formData.lastName.trim()) errors.lastName = 'Last name is required.';
      if (!formData.birthdate) errors.birthdate = 'Date of birth is required.';
      if (formData.birthdate && new Date(formData.birthdate) > new Date()) errors.birthdate = 'Date of birth cannot be in the future.';
      if (!formData.age) errors.age = 'Age is required.';
      if (formData.age && Number(formData.age) < 15) errors.age = 'Age not qualified. Applicant must be at least 15 years old.';
      if (!formData.gender) errors.gender = 'Gender is required.';
      if (!formData.civilStatus) errors.civilStatus = 'Civil status is required.';
      if (!formData.nationality) errors.nationality = 'Nationality is required.';
      if (!formData.contactNumber) errors.contactNumber = 'Contact number is required.';
      if (formData.contactNumber && !isPhilippineMobileNumber(formData.contactNumber)) errors.contactNumber = 'Enter 10 digits starting with 9.';
      if (!formData.email.trim()) errors.email = 'Email address is required.';
      if (formData.email && !validateEmail(formData.email)) errors.email = 'Please enter a valid email address.';
      if (!formData.birthplaceCountry) errors.birthplaceCountry = 'Birthplace country is required.';
      if (formData.birthplaceCountry === 'Philippines') {
        if (!formData.birthplaceRegion) errors.birthplaceRegion = 'Birthplace region is required.';
        if (!formData.birthplaceProvince) errors.birthplaceProvince = 'Birthplace province is required.';
        if (!formData.birthplaceCity) errors.birthplaceCity = 'Birthplace city/municipality is required.';
      }
      if (!formData.height) errors.height = 'Height is required.';
      if (!formData.weight) errors.weight = 'Weight is required.';
      if (!formData.currentCountry) errors.currentCountry = 'Current country is required.';
      if (formData.currentCountry === 'Philippines') {
        if (!formData.currentRegion) errors.currentRegion = 'Current region is required.';
        if (!formData.currentProvince) errors.currentProvince = 'Current province is required.';
        if (!formData.currentCity) errors.currentCity = 'Current city/municipality is required.';
        if (!formData.currentBarangay) errors.currentBarangay = 'Current barangay is required.';
      }
      if (!formData.currentStreet.trim()) errors.currentStreet = 'Current street/address line is required.';
    }
    if (stepIndex === 2) {
      if (!formData.education) errors.education = 'Educational level is required.';
      if (!formData.schoolName.trim()) errors.schoolName = 'School name is required.';
      if (formData.yearGraduated && formData.yearGraduated.length !== 4) errors.yearGraduated = 'Year graduated must be 4 digits.';
      workExperiences.forEach((workExperience, index) => {
        const hasAnyValue =
          workExperience.companyOrganization.trim() ||
          workExperience.positionHeld.trim() ||
          workExperience.totalYearsExperience.trim() ||
          workExperience.employmentStartDate ||
          workExperience.employmentEndDate ||
          workExperience.dutiesResponsibilities.trim();

        if (!hasAnyValue) return;

        if (workExperience.employmentStartDate && workExperience.employmentEndDate && workExperience.employmentEndDate < workExperience.employmentStartDate) {
          errors.employmentEndDate = `Work experience ${index + 1}: End date cannot be earlier than start date.`;
        }
        if (workExperience.totalYearsExperience && Number(workExperience.totalYearsExperience) > 80) {
          errors.totalYearsExperience = `Work experience ${index + 1}: Please enter a valid total years of experience.`;
        }
      });
    }
    if (stepIndex === 3) {
      if (otherSkillsEnabled && !formData.otherSkills.trim()) errors.otherSkills = 'Enter your other skills.';
      if (!otherSkillsEnabled && formData.skills.length === 0) errors.skills = 'Select at least one skill or check Others.';
    }
    if (stepIndex === 4) {
      characterReferences.forEach((reference, index) => {
        const hasAnyValue = reference.name.trim() || reference.position.trim() || reference.company.trim() || reference.contact.trim();
        if (index === 0 || hasAnyValue) {
          if (!reference.name.trim()) errors.referenceName = `Reference ${index + 1}: name is required.`;
          if (!reference.position.trim()) errors.referencePosition = `Reference ${index + 1}: position/relationship is required.`;
          if (!reference.contact.trim()) errors.referenceContact = `Reference ${index + 1}: contact number is required.`;
          if (reference.contact && !isPhilippineMobileNumber(reference.contact)) errors.referenceContact = `Reference ${index + 1}: enter 10 digits starting with 9.`;
        }
      });
      emergencyContacts.forEach((emergencyContact, index) => {
        const hasAnyValue =
          emergencyContact.name.trim() ||
          emergencyContact.relation.trim() ||
          emergencyContact.relationOther.trim() ||
          emergencyContact.phone.trim() ||
          emergencyContact.address.trim();
        if (index === 0 || hasAnyValue) {
          if (!emergencyContact.name.trim()) errors.emergencyContactName = `Emergency contact ${index + 1}: contact person is required.`;
          if (!emergencyContact.relation.trim()) errors.emergencyContactRelation = `Emergency contact ${index + 1}: relationship is required.`;
          if (emergencyContact.relation === 'Other' && !emergencyContact.relationOther.trim()) {
            errors.emergencyContactRelationOther = `Emergency contact ${index + 1}: please specify the relationship.`;
          }
          if (!emergencyContact.phone.trim()) errors.emergencyContactPhone = `Emergency contact ${index + 1}: contact number is required.`;
          if (emergencyContact.phone && !isPhilippineMobileNumber(emergencyContact.phone)) {
            errors.emergencyContactPhone = `Emergency contact ${index + 1}: enter 10 digits starting with 9.`;
          }
        }
      });
    }
    if (stepIndex === 5) {
      if (resumeFiles.length === 0) errors.resumeFiles = 'Resume/Biodata file is required.';
      if (supportingFiles.length === 0 && certificateFiles.length === 0) errors.supportingFiles = 'At least one supporting document is required.';
      if (!formData.applicantSignature.trim()) errors.applicantSignature = 'Applicant signature/full name is required.';
      if (formData.declarationDate === '') errors.declarationDate = 'Declaration date is required.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { setError('Please complete all required fields before submitting.'); return false; }
    setError(''); return true;
  };

  const handleStepClick = (targetStep: number) => {
    setFieldErrors({});
    setError('');
    setActiveStep(targetStep);
  };
  const handleNext = (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    setFieldErrors({});
    setError('');
    setActiveStep((prev) => Math.min(prev + 1, steps.length - 1));
  };
  const handleBack = () => { if (activeStep > 0) { setActiveStep((prev) => prev - 1); setFieldErrors({}); setError(''); } };
  const validateAllSteps = () => {
    for (let i = 0; i < steps.length; i++) {
      if (!validateStep(i)) {
        setActiveStep(i);
        return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    if (submitter?.dataset.submitApplication !== 'true') return;

    if (submissionInProgress.current || !validateAllSteps()) return;
    const uploadedFiles = [...resumeFiles, ...supportingFiles, ...certificateFiles];
    if (uploadedFiles.some(file => !documentTitles[applicationFileTitleKey(file)]?.trim())) {
      setDocumentTitleError('Add a descriptive title for every uploaded file.');
      setActiveStep(certificateFiles.some(file => !documentTitles[applicationFileTitleKey(file)]?.trim()) ? 3 : 5);
      return;
    }
    submissionInProgress.current = true;
    setSubmitting(true); setError(''); setEmailNotice(''); setEmailPending(false);
    try {
      if (!user) throw new Error('Please sign in before applying.');
      const applicantEmail = user.email;
      const profile = { ...reusableApplicantProfile(formData, Object.keys(EMPTY)), workExperiences, characterReferences, emergencyContacts };
      const profileResult = await supabase.from('applicant_profiles').update({ profile, updated_at: new Date().toISOString() }).eq('auth_user_id', user.id).select('auth_user_id').single();
      if (profileResult.error) throw profileResult.error;

      const resumeFileData = resumeFiles[0] ? await fileToDataUrl(resumeFiles[0]) : null;
      const usedNames = new Set<string>();
      const uniqueName = (original: string) => {
        if (!usedNames.has(original)) { usedNames.add(original); return original; }
        const dot = original.lastIndexOf('.');
        const stem = dot > 0 ? original.slice(0, dot) : original;
        const extension = dot > 0 ? original.slice(dot) : '';
        let copy = 2;
        let candidate = `${stem} (${copy})${extension}`;
        while (usedNames.has(candidate)) candidate = `${stem} (${++copy})${extension}`;
        usedNames.add(candidate);
        return candidate;
      };
      if (resumeFiles[0]) usedNames.add(resumeFiles[0].name);
      const additionalResumeFiles = await Promise.all(resumeFiles.slice(1).map(async (file) => ({
        name: uniqueName(file.name),
        title: documentTitles[applicationFileTitleKey(file)]?.trim(),
        type: applicationFileType(file),
        data: await fileToDataUrl(file),
        category: 'resume',
      })));
      const certificates = await Promise.all(certificateFiles.map(async file => {
        const name = uniqueName(file.name);
        const type = applicationFileType(file);
        return { name, title: documentTitles[applicationFileTitleKey(file)]?.trim(), type, data: await fileToDataUrl(new Blob([file], { type })) };
      }));
      const supportingDocumentFiles = [
        ...(resumeFiles[0] ? [{ name: resumeFiles[0].name, title: documentTitles[applicationFileTitleKey(resumeFiles[0])]?.trim(), type: applicationFileType(resumeFiles[0]), category: 'resume' }] : []),
        ...additionalResumeFiles,
        ...await Promise.all(supportingFiles.map(async (file) => ({ name: uniqueName(file.name), title: documentTitles[applicationFileTitleKey(file)]?.trim(), type: applicationFileType(file), data: await fileToDataUrl(file) }))),
        ...certificates,
      ];
      const supportingDocumentNames = supportingDocumentFiles.map(file => file.name);
      const birthplaceAddress = buildAddress(formData.birthplaceCountry, formData.birthplaceRegion, formData.birthplaceProvince, formData.birthplaceCity);
      const currentAddress = buildAddress(formData.currentCountry, formData.currentRegion, formData.currentProvince, formData.currentCity, formData.currentBarangay, formData.currentStreet, formData.currentZipCode);
      const permanentAddress = buildAddress(formData.permanentCountry, formData.permanentRegion, formData.permanentProvince, formData.permanentCity, formData.permanentBarangay, formData.permanentStreet, formData.permanentZipCode);
      const normalizedWorkExperiences = workExperiences
        .filter((workExperience) =>
          workExperience.companyOrganization.trim() ||
          workExperience.positionHeld.trim() ||
          workExperience.totalYearsExperience.trim() ||
          workExperience.employmentStartDate ||
          workExperience.employmentEndDate ||
          workExperience.dutiesResponsibilities.trim()
        )
        .map((workExperience) => ({
          ...workExperience,
          employmentPeriod: [workExperience.employmentStartDate, workExperience.employmentEndDate].filter(Boolean).join(' to '),
        }));
      const normalizedCharacterReferences = characterReferences
        .filter((reference) => reference.name.trim() || reference.position.trim() || reference.company.trim() || reference.contact.trim())
        .map((reference) => ({ ...reference, contact: formatPhoneWithCountryCode(reference.contact) }));
      const normalizedEmergencyContacts = emergencyContacts
        .filter((contact) => contact.name.trim() || contact.relation.trim() || contact.relationOther.trim() || contact.phone.trim() || contact.address.trim())
        .map((contact) => ({
          ...contact,
          relation: contact.relation === 'Other' ? contact.relationOther : contact.relation,
          phone: formatPhoneWithCountryCode(contact.phone),
        }));
      const primaryEmergencyContact = normalizedEmergencyContacts[0] ?? null;
      const applicantExperience = normalizedWorkExperiences[0]?.totalYearsExperience ?? '';
      const coverLetterData = {
        hearAbout: formData.hearAbout, hearAboutOther: formData.hearAboutOther, age: formData.age, nationality: formData.nationality, birthplace: birthplaceAddress, height: formData.height, weight: formData.weight, currentAddress, permanentAddress,
        birthplaceParts: { country: formData.birthplaceCountry, region: formData.birthplaceRegion, province: formData.birthplaceProvince, city: formData.birthplaceCity },
        currentAddressParts: { country: formData.currentCountry, region: formData.currentRegion, province: formData.currentProvince, city: formData.currentCity, barangay: formData.currentBarangay, street: formData.currentStreet, zipCode: formData.currentZipCode },
        permanentAddressParts: { country: formData.permanentCountry, region: formData.permanentRegion, province: formData.permanentProvince, city: formData.permanentCity, barangay: formData.permanentBarangay, street: formData.permanentStreet, zipCode: formData.permanentZipCode },
        educationBackground: { level: formData.education, schoolName: formData.schoolName, courseProgram: formData.courseProgram, yearGraduated: formData.yearGraduated },
        workExperience: normalizedWorkExperiences[0] ?? null,
        workExperiences: normalizedWorkExperiences,
        skills: formData.skills, otherSkills: formData.otherSkills.trim(), certifications: certificates.map(file => file.name),
        documentTitles: Object.fromEntries(supportingDocumentFiles.map(file => [file.name, file.title])),
        characterReferences: normalizedCharacterReferences,
        emergencyContact: primaryEmergencyContact,
        emergencyContacts: normalizedEmergencyContacts,
        submittedDocuments: formData.submittedDocuments, otherDocument: formData.otherDocument, applicantSignature: formData.applicantSignature, declarationDate: formData.declarationDate ?? currentManilaDate(),
      };
      const fullName = `${formData.firstName} ${formData.middleName} ${formData.lastName} ${formData.suffix}`.replace(/\s+/g, ' ').trim();
      const { emailNotice: confirmationNotice } = await submitApplicantWithConfirmation(supabase, {
        auth_user_id: user.id, name: fullName, first_name: formData.firstName.trim(), middle_name: formData.middleName.trim(), last_name: formData.lastName.trim(), suffix: formData.suffix,
        gender: formData.gender, civil_status: formData.civilStatus, birthdate: formData.birthdate || null, birthplace: birthplaceAddress, height: formData.height, weight: formData.weight,
        email: applicantEmail, phone_number: formatPhoneWithCountryCode(formData.contactNumber), address: currentAddress, position_applied: formData.position, education: formData.education, experience: applicantExperience, cover_letter: JSON.stringify(coverLetterData),
        tin: formData.tin, sss: formData.sss, philhealth: formData.philhealth, pagibig: formData.pagibig,
        emergency_contact: primaryEmergencyContact ? `${primaryEmergencyContact.name} - ${primaryEmergencyContact.relation} - ${primaryEmergencyContact.phone}` : null,
        resume_file_name: resumeFiles[0]?.name ?? null, resume_file_data: resumeFileData, supporting_documents: supportingDocumentNames, supporting_document_files: supportingDocumentFiles, status: 'Submitted',
      }, {
        onSaved: (id) => {
          saveApplicationFiles(id, { resumeFileName: resumeFiles[0]?.name ?? null, resumeFileData, supportingDocuments: supportingDocumentNames, supportingDocumentFiles });
          setApplicantId(id);
          setEmailPending(true);
          setSuccessDialog(true);
        },
        sendConfirmation: async (id) => {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session?.access_token) throw new Error('Sign in to receive the confirmation email.');
          await sendApplicantConfirmation(id, data.session.access_token);
        },
      });
      setEmailNotice(confirmationNotice);
      setEmailPending(false);

    } catch (err: any) {
      const message = err.message || 'Something went wrong while submitting the application.';
      if (message.toLowerCase().includes('email')) {
        setActiveStep(1);
        setFieldErrors((prev) => ({ ...prev, email: message }));
      }
      setError(message);
    } finally { submissionInProgress.current = false; setSubmitting(false); }
  };

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Enter') return;

    const target = event.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    const role = target.getAttribute('role');

    if (tagName === 'textarea' || tagName === 'button' || role === 'button') return;

    event.preventDefault();
  };

  const handleCopyId = async () => { setCopyFailed(false); const ok = await copyToClipboard(applicantId); if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2500); } else setCopyFailed(true); };
  const handleCloseDialog = () => {
    navigate('/applicant', { replace: true });
  };

  const renderCountrySelect = (prefix: AddressPrefix, label = 'Country') => {
    const value = formData[`${prefix}Country` as FormKey] as string;
    const isRequired = prefix !== 'permanent';
    return (
      <TextField fullWidth required={isRequired} select label={label} value={value} onChange={(e) => handleAddressCountryChange(prefix, e.target.value)} error={isRequired && !!fieldErrors[`${prefix}Country` as FormKey]} helperText={isRequired ? fieldErrors[`${prefix}Country` as FormKey] : ''} sx={textFieldSx} InputLabelProps={{ shrink: true }}>
        {COUNTRIES.map((country) => <MenuItem key={country} value={country}>{country}</MenuItem>)}
      </TextField>
    );
  };

  const renderPhilippineAddressFields = (prefix: AddressPrefix) => {
    const isRequired = prefix !== 'permanent';
    const country = formData[`${prefix}Country` as FormKey] as string;
    const region = formData[`${prefix}Region` as FormKey] as string;
    const province = formData[`${prefix}Province` as FormKey] as string;
    const city = formData[`${prefix}City` as FormKey] as string;
    const provinceOptions = getProvinceOptions(country, region);
    const cityOptions = getCityOptions(province);
    const barangayOptions = getBarangayOptions(city);

    return (
      <>
        <Grid size={addressGrid}>{renderCountrySelect(prefix)}</Grid>
        <Grid size={addressGrid}>
          <TextField fullWidth required={isRequired} select label="Region" value={region} onChange={(e) => handleAddressRegionChange(prefix, e.target.value)} error={isRequired && !!fieldErrors[`${prefix}Region` as FormKey]} helperText={isRequired ? fieldErrors[`${prefix}Region` as FormKey] : ''} sx={textFieldSx} InputLabelProps={{ shrink: true }} disabled={country !== 'Philippines'}>
            {Object.keys(PH_PROVINCES_BY_REGION).map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={addressGrid}>
          <TextField fullWidth required={isRequired} select label="Province" value={province} onChange={(e) => handleAddressProvinceChange(prefix, e.target.value)} error={isRequired && !!fieldErrors[`${prefix}Province` as FormKey]} helperText={isRequired ? fieldErrors[`${prefix}Province` as FormKey] : ''} sx={textFieldSx} InputLabelProps={{ shrink: true }} disabled={country !== 'Philippines' || !region}>
            {provinceOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
        </Grid>
        <Grid size={addressGrid}>
          <TextField fullWidth required={isRequired} select label="City / Municipality" value={city} onChange={(e) => handleAddressCityChange(prefix, e.target.value)} error={isRequired && !!fieldErrors[`${prefix}City` as FormKey]} helperText={isRequired ? fieldErrors[`${prefix}City` as FormKey] : ''} sx={textFieldSx} InputLabelProps={{ shrink: true }} disabled={country !== 'Philippines' || !province}>
            {city && !cityOptions.includes(city) && <MenuItem value={city}>{city}</MenuItem>}
            {cityOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </TextField>
        </Grid>
        {prefix !== 'birthplace' && (
          <>
            <Grid size={addressGrid}>
              <TextField fullWidth required={isRequired} select label="Barangay" value={formData[`${prefix}Barangay`]} onChange={(e) => handleAddressBarangayChange(prefix, e.target.value)} error={isRequired && !!fieldErrors[`${prefix}Barangay`]} helperText={isRequired ? fieldErrors[`${prefix}Barangay`] : ''} sx={textFieldSx} InputLabelProps={{ shrink: true }} disabled={country !== 'Philippines' || !city}>
                {formData[`${prefix}Barangay`] && !barangayOptions.includes(formData[`${prefix}Barangay`]) && <MenuItem value={formData[`${prefix}Barangay`]}>{formData[`${prefix}Barangay`]}</MenuItem>}
                {barangayOptions.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={halfGrid}>
              <TextField fullWidth required={isRequired} label="Street / House No. / Purok" value={formData[`${prefix}Street`]} onChange={set(`${prefix}Street`)} error={isRequired && !!fieldErrors[`${prefix}Street`]} helperText={isRequired ? fieldErrors[`${prefix}Street`] : ''} inputProps={{ maxLength: 120 }} sx={textFieldSx} />
            </Grid>
            <Grid size={addressGrid}>
              <TextField fullWidth label="ZIP Code" value={formData[`${prefix}ZipCode`]} InputProps={{ readOnly: true }}/>
            </Grid>
          </>
        )}
      </>
    );
  };

  const renderDocumentRow = (file: File, index: number, placeholder: string, onRemove: () => void, showCheckmark = true) => (
    <Box key={`${file.name}-${file.lastModified}-${index}`} sx={{
      display: 'grid', alignItems: 'center',
      gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 240px) auto' },
      rowGap: { xs: 1, sm: 0.5 }, columnGap: 1,
      p: 1.25, borderRadius: '14px', border: '1px solid #bbf7d0', bgcolor: '#f0fdf4',
    }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ gridColumn: { sm: '1' }, gridRow: { sm: '2' }, minWidth: 0 }}>
        {showCheckmark && <CheckCircleOutlineRounded sx={{ color: '#15803d', fontSize: 18 }} />}
        <Typography variant="body2" fontWeight={700} sx={{ color: showCheckmark ? '#14532d' : undefined, overflowWrap: 'anywhere' }}>
          {file.name}
        </Typography>
      </Stack>
      <TextField size="small" required label="Document title" placeholder={placeholder}
        value={documentTitles[applicationFileTitleKey(file)] ?? ''}
        onChange={event => {
          setDocumentTitles(current => ({ ...current, [applicationFileTitleKey(file)]: event.target.value }));
          setDocumentTitleError('');
        }}
        sx={{
          display: { sm: 'contents' },
          '& > label': { gridColumn: { sm: '2' }, gridRow: { sm: '1' }, marginBottom: { sm: 0 } },
          '& > .hris-field': { gridColumn: { sm: '2' }, gridRow: { sm: '2' } },
        }}
      />
      <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.75} sx={{ gridColumn: { sm: '3' }, gridRow: { sm: '2' } }}>
        <Tooltip title="Preview">
          <IconButton type="button" size="small" color="primary" aria-label={`Preview ${file.name}`} aria-haspopup="dialog"
            onClick={() => setPreviewFile(file)}>
            <Visibility fontSize="small" />
          </IconButton>
        </Tooltip>
        <Button type="button" size="small" color="error" variant={showCheckmark ? 'outlined' : 'text'} aria-label={`Remove ${file.name}`}
          onClick={onRemove} sx={showCheckmark ? { textTransform: 'none', fontWeight: 700 } : undefined}>Remove</Button>
      </Stack>
    </Box>
  );

  if (authLoading || profileLoading) return <Box sx={{ p: 5 }}><CircularProgress /></Box>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/apply' + window.location.search)}`} replace />;
  if (user.role !== 'applicant') return <Navigate to="/dashboard" replace />;
  if (!profileLoaded) return <Container sx={{ py: 4 }}><Alert severity="error">{error || 'Your profile could not be loaded.'}</Alert><Button onClick={() => window.location.reload()}>Retry</Button></Container>;

  return (
    <AuthBackground>
      <Dialog open={choosingHistory} fullWidth maxWidth="sm" aria-labelledby="application-history-title">
        <DialogTitle id="application-history-title">Use a previous application?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2">Choose a submission to copy its answers, declaration, and saved files. Review them before submitting.</Typography>
            {historyError && <Alert severity="error">{historyError}</Alert>}
            <TextField select fullWidth label="Previous application" value={sourceId} disabled={loadingAnswers}
              onChange={event => setSourceId(event.target.value)} sx={textFieldSx}>
              {history.map(item => (
                <MenuItem key={item.applicant_id} value={item.applicant_id} sx={{ whiteSpace: 'normal' }}>
                  {[item.position_applied, formatDisplayDate(item.created_at), item.applicant_id].filter(Boolean).join(' · ')}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', px: 3, pb: 2 }}>
          <Button onClick={() => setChoosingHistory(false)} disabled={loadingAnswers}>Start new form</Button>
          <Button variant="contained" onClick={() => void reuseApplication()} disabled={loadingAnswers || positionsLoading || !sourceId}>
            {loadingAnswers ? 'Loading…' : 'Use previous answers'}
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ background: 'radial-gradient(circle at top left, rgba(187,247,208,0.75) 0%, rgba(246,251,244,0.98) 36%, #f6fbf4 100%)', borderRadius: { xs: 0, sm: '26px' }, py: { xs: 1.5, sm: 2.5, md: 5 }, px: { xs: 1, sm: 1.5, md: 3 }, minHeight: '100dvh' }}>
        <Container maxWidth="xl" disableGutters sx={{ px: { xs: 0, sm: 2, md: 3 } }}>
          <Box sx={{ mb: { xs: 2, md: 3 } }}>
            <Typography variant="h3" fontWeight={700} sx={responsiveHeroTitleSx}>Buenaventura Estate</Typography>
            <Typography color="text.secondary" sx={{ mt: 1, fontSize: { xs: '0.9rem', sm: '1rem' }, fontWeight: 600, overflowWrap: 'anywhere' }}>Human Resource Information System — Applicant Portal</Typography>
          </Box>

          <Paper elevation={0} sx={{ borderRadius: '26px', overflow: 'hidden', background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(22,101,52,0.10)', backdropFilter: 'blur(18px)', boxShadow: { xs: '0 18px 45px rgba(15,23,42,0.10)', md: '0 28px 80px rgba(15,23,42,0.12)' } }}>
            <Box sx={{ p: { xs: 2, sm: 2.5, md: 3.5 }, borderBottom: '1px solid rgba(22,101,52,0.08)' }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} spacing={{ xs: 2, md: 3 }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }}>
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 46,
                      height: 46,
                      minWidth: 46,
                      borderRadius: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#166534',
                      background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                      boxShadow: '0 14px 30px rgba(22,101,52,0.14)',
                    }}
                  >
                    <AssignmentTurnedInOutlined />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h4" fontWeight={700} sx={responsiveFormTitleSx}>Job Application Form</Typography>
                  </Box>
                </Stack>
                <Box
                  sx={{
                    width: { xs: '100%', lg: 720 },
                    maxWidth: '100%',
                    pb: { xs: 0.5, sm: 1 },
                    '@keyframes stepPulse': {
                      '0%': { boxShadow: '0 0 0 0 rgba(22, 163, 74, 0.35)' },
                      '70%': { boxShadow: '0 0 0 12px rgba(22, 163, 74, 0)' },
                      '100%': { boxShadow: '0 0 0 0 rgba(22, 163, 74, 0)' },
                    },
                  }}
                >
                  <Box sx={{ position: 'relative', width: '100%', px: { xs: 0, sm: 1.5 }, pt: 1 }}>
                    <Box
                      sx={{
                        position: 'absolute',
                        top: { xs: 23, sm: 27, md: 30 },
                        left: `${100 / (steps.length * 2)}%`,
                        right: `${100 / (steps.length * 2)}%`,
                        height: { xs: 3, sm: 4, md: 5 },
                        backgroundColor: '#dcfce7',
                        zIndex: 0,
                      }}
                    />
                    <Box
                      sx={{
                        position: 'absolute',
                        top: { xs: 23, sm: 27, md: 30 },
                        left: `${100 / (steps.length * 2)}%`,
                        right: `${100 / (steps.length * 2)}%`,
                        height: { xs: 3, sm: 4, md: 5 },
                        background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)',
                        transform: `scaleX(${activeStep / (steps.length - 1)})`,
                        transformOrigin: 'left center',
                        transition: 'transform 500ms ease',
                        zIndex: 1,
                        boxShadow: activeStep > 0 ? '0 0 18px rgba(22, 163, 74, 0.35)' : 'none',
                      }}
                    />

                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      sx={{ position: 'relative', zIndex: 2, width: '100%' }}
                    >
                      {steps.map((step, index) => {
                        const isCompleted = index < activeStep;
                        const isCurrent = index === activeStep;
                        const isReached = index <= activeStep;

                        return (
                          <Stack
                            key={step}
                            alignItems="center"
                            spacing={{ xs: 0.5, sm: 1 }}
                            onClick={() => handleStepClick(index)}
                            sx={{
                              cursor: 'pointer',
                              width: `${100 / steps.length}%`,
                              minWidth: 0,
                              px: { xs: 0.25, sm: 0.5 },
                              transition: 'transform 250ms ease',
                              '&:hover': { transform: { xs: 'none', sm: 'translateY(-3px)' } },
                            }}
                          >
                            <Box
                              sx={{
                                width: { xs: 34, sm: 42, md: 46 },
                                height: { xs: 34, sm: 42, md: 46 },
                                minWidth: { xs: 34, sm: 42, md: 46 },
                                minHeight: { xs: 34, sm: 42, md: 46 },
                                borderRadius: '50%',
                                background: isReached
                                  ? 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)'
                                  : '#f0fdf4',
                                color: isReached ? '#fff' : '#166534',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: { xs: '0.8rem', sm: '0.95rem', md: '1rem' },
                                border: isReached ? '2px solid #86efac' : '1.5px solid #bbf7d0',
                                boxShadow: isCurrent
                                  ? '0 10px 24px rgba(22, 163, 74, 0.30)'
                                  : isCompleted
                                    ? '0 8px 18px rgba(22, 163, 74, 0.18)'
                                    : '0 4px 12px rgba(15, 23, 42, 0.06)',
                                transform: isCurrent ? { xs: 'scale(1.04)', sm: 'scale(1.08)' } : 'scale(1)',
                                transition: 'all 300ms ease',
                                animation: isCurrent ? 'stepPulse 1.8s ease-in-out infinite' : 'none',
                              }}
                            >
                              {isCompleted ? <CheckCircleOutlineRounded sx={stepIconSx} /> : stepIcons[index]}
                            </Box>
                            <Typography
                              variant="caption"
                              sx={{
                                display: { xs: 'none', sm: 'block' },
                                fontWeight: 600,
                                color: isReached ? '#14532d' : '#475569',
                                textAlign: 'center',
                                lineHeight: 1.2,
                                transition: 'color 250ms ease',
                                fontSize: { sm: '0.68rem', md: '0.75rem' },
                                maxWidth: 110,
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {step}
                            </Typography>
                          </Stack>
                        );
                      })}
                    </Stack>
                    <Typography
                      variant="body2"
                      sx={{
                        display: { xs: 'block', sm: 'none' },
                        mt: 1.5,
                        textAlign: 'center',
                        fontWeight: 600,
                        color: '#14532d',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      Step {activeStep + 1} of {steps.length}: {steps[activeStep]}
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Box>

            <Box component="form" noValidate onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} sx={{ p: { xs: 1.5, sm: 2.5, md: 4.5 } }}>
              {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

              {activeStep === 0 && (
                <Paper elevation={0} sx={stepPaperSx}>
                  <SectionTitle icon={<WorkOutline />} title="I. Position Applied For" />
                  <Grid container spacing={2.5}>
                    <Grid size={halfGrid}>
                      <TextField
                        fullWidth
                        required
                        select
                        label="Position Title"
                        value={formData.position}
                        onChange={set('position')}
                        disabled={positionsLoading || openPositions.length === 0}
                        error={!!fieldErrors.position}
                        helperText={
                          fieldErrors.position ||
                          (positionsLoading
                            ? 'Loading current open positions...'
                            : openPositions.length === 0
                              ? 'No open positions are currently available.'
                              : undefined)
                        }
                        InputLabelProps={{ shrink: true }}
                        sx={textFieldSx}
                      >
                        {positionsLoading && (
                          <MenuItem value="" disabled>
                            Loading open positions...
                          </MenuItem>
                        )}
                        {!positionsLoading && openPositions.length === 0 && (
                          <MenuItem value="" disabled>
                            No open positions available
                          </MenuItem>
                        )}
                        {openPositions.map((position) => (
                          <MenuItem key={position} value={position}>
                            {position}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Grid>
                    <Grid size={halfGrid}><TextField fullWidth required select label="How did you hear about this job opening?" value={formData.hearAbout} onChange={set('hearAbout')} error={!!fieldErrors.hearAbout} helperText={fieldErrors.hearAbout} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{HEAR_ABOUT_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField></Grid>
                    {formData.hearAbout === 'Other' && <Grid size={{ xs: 12 }}><TextField fullWidth required label="Please specify" value={formData.hearAboutOther} onChange={set('hearAboutOther')} error={!!fieldErrors.hearAboutOther} helperText={fieldErrors.hearAboutOther} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>}
                  </Grid>
                </Paper>
              )}

              {activeStep === 1 && (
                <Paper elevation={0} sx={stepPaperSx}>
                  <SectionTitle icon={<PersonOutline />} title="II. Personal Details" />
                  <Grid container spacing={2.5}>
                    <Grid size={nameGrid}><TextField fullWidth placeholder="e.g. John" required label="First Name" value={formData.firstName} onChange={setUpperText('firstName')} error={!!fieldErrors.firstName} helperText={fieldErrors.firstName} inputProps={{ maxLength: 50 }} sx={textFieldSx} /></Grid>
                    <Grid size={nameGrid}><TextField fullWidth label="Middle Name (Optional)" value={formData.middleName} onChange={setUpperText('middleName')} inputProps={{ maxLength: 50 }} sx={textFieldSx} /></Grid>
                    <Grid size={nameGrid}><TextField fullWidth placeholder="e.g. Doe" required label="Last Name" value={formData.lastName} onChange={setUpperText('lastName')} error={!!fieldErrors.lastName} helperText={fieldErrors.lastName} inputProps={{ maxLength: 50 }} sx={textFieldSx} /></Grid>
                    <Grid size={nameGrid}><TextField fullWidth select label="Suffix" value={formData.suffix} onChange={set('suffix')} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{SUFFIXES.map((suffix) => <MenuItem key={suffix || 'none'} value={suffix}>{suffix || 'None'}</MenuItem>)}</TextField></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required type="date" label="Date of Birth" value={formData.birthdate} onChange={setBirthdate} error={!!fieldErrors.birthdate} helperText={fieldErrors.birthdate} InputLabelProps={{ shrink: true }} sx={textFieldSx} /></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required label="Age" value={formData.age} onChange={setNumeric('age', 3)} error={!!fieldErrors.age || (!!formData.age && Number(formData.age) < 15)} helperText={fieldErrors.age || (formData.age && Number(formData.age) < 15 ? 'Age not qualified. Applicant must be at least 15 years old.' : undefined)} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 3 }} sx={textFieldSx} /></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required select label="Gender" value={formData.gender} onChange={set('gender')} error={!!fieldErrors.gender} helperText={fieldErrors.gender} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{GENDER.map((gender) => <MenuItem key={gender} value={gender}>{gender}</MenuItem>)}</TextField></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required select label="Civil Status" value={formData.civilStatus} onChange={set('civilStatus')} error={!!fieldErrors.civilStatus} helperText={fieldErrors.civilStatus} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{CIVIL_STATUS.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required select label="Nationality" value={formData.nationality} onChange={set('nationality')} error={!!fieldErrors.nationality} helperText={fieldErrors.nationality} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{NATIONALITIES.map((nationality) => <MenuItem key={nationality} value={nationality}>{nationality}</MenuItem>)}</TextField></Grid>
                    <Grid size={fieldGrid}><MobileNumberField fullWidth required label="Contact Number" value={formData.contactNumber} onNumberChange={contactNumber => {
                      setFormData(prev => ({ ...prev, contactNumber }));
                      clearFieldError('contactNumber');
                    }} error={!!fieldErrors.contactNumber} helperText={fieldErrors.contactNumber} sx={textFieldSx} /></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth placeholder="example@email.com" required type="email" label="Email Address" value={formData.email} InputProps={{ readOnly: true }} error={!!fieldErrors.email} helperText={fieldErrors.email} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required label="Height (cm)" value={formData.height} onChange={setNumeric('height', 3)} error={!!fieldErrors.height} helperText={fieldErrors.height} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 3 }} sx={textFieldSx} /></Grid>
                    <Grid size={fieldGrid}><TextField fullWidth required label="Weight (kg)" value={formData.weight} onChange={setNumeric('weight', 3)} error={!!fieldErrors.weight} helperText={fieldErrors.weight} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 3 }} sx={textFieldSx} /></Grid>
                    <Grid size={{ xs: 12 }}><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, mb: 1 }}><LocationOnOutlined sx={{ color: '#166534' }} /><Typography fontWeight={700} sx={{ color: '#14532d' }}>Birthplace</Typography></Stack></Grid>
                    {renderPhilippineAddressFields('birthplace')}
                    <Grid size={{ xs: 12 }}><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, mb: 1 }}><LocationOnOutlined sx={{ color: '#166534' }} /><Typography fontWeight={700} sx={{ color: '#14532d' }}>Current Address</Typography></Stack></Grid>
                    {renderPhilippineAddressFields('current')}
                    <Grid size={{ xs: 12 }}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mt: 2, mb: 1 }}><Stack direction="row" spacing={1} alignItems="center"><HomeWorkOutlined sx={{ color: '#166534' }} /><Typography fontWeight={700} sx={{ color: '#14532d' }}>Permanent Address</Typography></Stack><Button type="button" variant="outlined" onClick={copyCurrentToPermanent} sx={{ ...softButtonSx, borderColor: '#166534', color: '#166534', background: '#ffffff', minHeight: { xs: 44, sm: 46 } }}>Same as Current Address</Button></Stack></Grid>
                    {renderPhilippineAddressFields('permanent')}
                  </Grid>
                </Paper>
              )}

              {activeStep === 2 && (
                <Paper elevation={0} sx={stepPaperSx}>
                  <SectionTitle icon={<SchoolOutlined />} title="III. Highest Educational Background" />
                  <Stack spacing={3}>
                    <Paper elevation={0} sx={nestedPaperSx}>
                      <Grid container spacing={2.5}>
                        <Grid size={fieldGrid}><TextField fullWidth required select label="Highest Educational Level" value={formData.education} onChange={set('education')} error={!!fieldErrors.education} helperText={fieldErrors.education} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{EDUCATIONAL_ATTAINMENT.map((level) => <MenuItem key={level} value={level}>{level}</MenuItem>)}</TextField></Grid>
                        <Grid size={fieldGrid}><TextField fullWidth required label="Name of School" value={formData.schoolName} onChange={set('schoolName')} error={!!fieldErrors.schoolName} helperText={fieldErrors.schoolName} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                        <Grid size={fieldGrid}><TextField fullWidth label="Course / Program" value={formData.courseProgram} onChange={set('courseProgram')} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                        <Grid size={fieldGrid}><TextField fullWidth placeholder="e.g. 2005" label="Year Graduated" value={formData.yearGraduated} onChange={setNumeric('yearGraduated', 4)} error={!!fieldErrors.yearGraduated} helperText={fieldErrors.yearGraduated} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 4 }} sx={textFieldSx} /></Grid>
                      </Grid>
                    </Paper>
                    <SectionTitle icon={<WorkOutlined />} title="IV. Work Experience (Optional)" />
                    <Paper elevation={0} sx={nestedPaperSx}>
                      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }} >
                        <Button type="button" variant="outlined" startIcon={<Add />} onClick={addWorkExperience} sx={{ ...softButtonSx, borderColor: '#166534', color: '#166534', background: '#ffffff', minHeight: { xs: 44, sm: 46 } }}>Add Work Experience</Button>
                      </Stack>
                      <Stack spacing={2.5}>
                        {workExperiences.map((workExperience, index) => (
                          <Paper key={`work-experience-${index}`} elevation={0} sx={nestedPaperSx}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                              <Stack direction="row" spacing={1} alignItems="center"><WorkOutline sx={{ color: '#166534' }} /><Typography fontWeight={700} sx={{ color: '#14532d' }}>Work Experience {index + 1}</Typography></Stack>
                              {workExperiences.length > 1 && <Button type="button" color="error" variant="outlined" startIcon={<Delete />} onClick={() => removeWorkExperience(index)} sx={{ ...softButtonSx, minHeight: 40 }}>Remove</Button>}
                            </Stack>
                            <Grid container spacing={2.5}>
                              <Grid size={fieldGrid}><TextField fullWidth label="Company / Organization" value={workExperience.companyOrganization} onChange={(e) => updateWorkExperienceText(index, 'companyOrganization', e.target.value)} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                              <Grid size={fieldGrid}><TextField fullWidth label="Position Held" value={workExperience.positionHeld} onChange={(e) => updateWorkExperienceText(index, 'positionHeld', e.target.value)} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                              <Grid size={fieldGrid}><TextField fullWidth label="Total Years of Work Experience" value={workExperience.totalYearsExperience} onChange={(e) => updateWorkExperienceNumeric(index, 'totalYearsExperience', e.target.value)} error={!!fieldErrors.totalYearsExperience} helperText={fieldErrors.totalYearsExperience} inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 2 }} sx={textFieldSx} /></Grid>
                              <Grid size={halfGrid}><TextField fullWidth type="date" label="Employment Start Date" value={workExperience.employmentStartDate} onChange={(e) => updateWorkExperienceText(index, 'employmentStartDate', e.target.value)} InputLabelProps={{ shrink: true }} sx={textFieldSx} /></Grid>
                              <Grid size={halfGrid}><TextField fullWidth type="date" label="Employment End Date" value={workExperience.employmentEndDate} onChange={(e) => updateWorkExperienceText(index, 'employmentEndDate', e.target.value)} error={!!fieldErrors.employmentEndDate} helperText={fieldErrors.employmentEndDate} InputLabelProps={{ shrink: true }} sx={textFieldSx} /></Grid>
                              <Grid size={halfGrid}><TextField fullWidth multiline minRows={3} label="Duties / Responsibilities" value={workExperience.dutiesResponsibilities} onChange={(e) => updateWorkExperienceText(index, 'dutiesResponsibilities', e.target.value)} inputProps={{ maxLength: 500 }} sx={textFieldSx} /></Grid>
                            </Grid>
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  </Stack>
                </Paper>
              )}

              {activeStep === 3 && (
                <Paper elevation={0} sx={stepPaperSx}>
                  <SectionTitle icon={<AutoAwesomeOutlined />} title="V. Skills and Qualifications" />
                  {fieldErrors.skills && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.skills}</Alert>}
                  <FormGroup row>
                    {SKILLS.map((skill) => <FormControlLabel key={skill} control={<Checkbox checked={formData.skills.includes(skill)} onChange={() => toggleListItem('skills', skill)} />} label={skill} sx={compactChoiceSx} />)}
                    <FormControlLabel label="Others" sx={compactChoiceSx} control={<Checkbox checked={otherSkillsEnabled} onChange={(_, checked) => {
                      setOtherSkillsEnabled(checked);
                      if (!checked) setFormData(previous => ({ ...previous, otherSkills: '' }));
                      clearFieldError('skills');
                      clearFieldError('otherSkills');
                    }} />} />
                  </FormGroup>
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    {otherSkillsEnabled && <TextField fullWidth required label="Other Skills" value={formData.otherSkills} onChange={event => {
                      set('otherSkills')(event);
                      clearFieldError('otherSkills');
                    }} error={Boolean(fieldErrors.otherSkills)} helperText={fieldErrors.otherSkills} inputProps={{ maxLength: 200 }} sx={textFieldSx} />}
                    <Box>
                      <Typography fontWeight={700} sx={{ color: '#14532d' }}>Certifications / Training (Optional)</Typography>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>{ACCEPTED_APPLICATION_FILE_LABEL}</Typography>
                      <input ref={certificateInput} hidden multiple type="file" accept={ACCEPTED_APPLICATION_FILE_TYPES} onChange={addCertificates} />
                      <Button type="button" variant="outlined" startIcon={<UploadFile />} onClick={() => certificateInput.current?.click()}>
                        {certificateFiles.length ? 'Add certificates' : 'Upload certificates'}
                      </Button>
                    </Box>
                    {certificateError && <Alert severity="error">{certificateError}</Alert>}
                    {documentTitleError && <Alert severity="error">{documentTitleError}</Alert>}
                    {certificateFiles.map((file, index) => renderDocumentRow(file, index, 'e.g. Food Safety Training',
                      () => setCertificateFiles(current => current.filter((_, fileIndex) => fileIndex !== index)), false,
                    ))}
                  </Stack>
                </Paper>
              )}

              {activeStep === 4 && (
                <Paper elevation={0} sx={stepPaperSx}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 1 }}>
                    <SectionTitle icon={<Groups2Outlined />} title="VI. Character References and Emergency Contact" />
                    <Button type="button" variant="outlined" startIcon={<Add />} onClick={addCharacterReference} sx={{ ...softButtonSx, borderColor: '#166534', color: '#166534', background: '#ffffff', minHeight: { xs: 44, sm: 46 } }}>Add Character Reference</Button>
                  </Stack>
                  {fieldErrors.referenceName && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.referenceName}</Alert>}
                  {fieldErrors.referencePosition && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.referencePosition}</Alert>}
                  {fieldErrors.referenceContact && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.referenceContact}</Alert>}
                  <Stack spacing={2.5}>
                    {characterReferences.map((reference, index) => (
                      <Paper key={`reference-${index}`} elevation={0} sx={nestedPaperSx}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="center"><Groups2Outlined sx={{ color: '#166534' }} /><Typography fontWeight={700} sx={{ color: '#14532d' }}>Character Reference {index + 1}</Typography></Stack>
                          {characterReferences.length > 1 && <Button type="button" color="error" variant="outlined" startIcon={<Delete />} onClick={() => removeCharacterReference(index)} sx={{ ...softButtonSx, minHeight: 40 }}>Remove</Button>}
                        </Stack>
                        <Grid container spacing={2.5}>
                          <Grid size={fieldGrid}><TextField fullWidth label="Reference Name" value={reference.name} onChange={(e) => updateCharacterReferenceName(index, e.target.value)} inputProps={{ maxLength: 80 }} sx={textFieldSx} /></Grid>
                          <Grid size={fieldGrid}><TextField fullWidth label="Position" value={reference.position} onChange={(e) => updateCharacterReference(index, 'position', e.target.value)} inputProps={{ maxLength: 80 }} sx={textFieldSx} /></Grid>
                          <Grid size={fieldGrid}><TextField fullWidth label="Company / Organization" value={reference.company} onChange={(e) => updateCharacterReference(index, 'company', e.target.value)} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                          <Grid size={fieldGrid}><MobileNumberField fullWidth label="Reference Contact Number" value={reference.contact} onNumberChange={digits => updateCharacterReferenceContact(index, digits)} sx={textFieldSx} /></Grid>
                        </Grid>
                      </Paper>
                    ))}
                  </Stack>
                  {fieldErrors.emergencyContactName && <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>{fieldErrors.emergencyContactName}</Alert>}
                  {fieldErrors.emergencyContactRelation && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.emergencyContactRelation}</Alert>}
                  {fieldErrors.emergencyContactRelationOther && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.emergencyContactRelationOther}</Alert>}
                  {fieldErrors.emergencyContactPhone && <Alert severity="warning" sx={{ mb: 2 }}>{fieldErrors.emergencyContactPhone}</Alert>}
                  <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ mt: 4, mb: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center"><LocalPhoneRounded sx={{ color: '#166534' }} /><Typography variant="h6" fontWeight={700} sx={{ color: '#14532d' }}>Emergency Contact</Typography></Stack>
                    <Button type="button" variant="outlined" startIcon={<Add />} onClick={addEmergencyContact} sx={{ ...softButtonSx, borderColor: '#166534', color: '#166534', background: '#ffffff', minHeight: { xs: 44, sm: 46 } }}>Add Emergency Contact</Button>
                  </Stack>
                  <Stack spacing={2.5}>
                    {emergencyContacts.map((emergencyContact, index) => (
                      <Paper key={`emergency-contact-${index}`} elevation={0} sx={nestedPaperSx}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
                          <Stack direction="row" spacing={1} alignItems="center"><LocalPhoneRounded sx={{ color: '#166534' }} /><Typography fontWeight={700} sx={{ color: '#14532d' }}>Emergency Contact {index + 1}</Typography></Stack>
                          {emergencyContacts.length > 1 && <Button type="button" color="error" variant="outlined" startIcon={<Delete />} onClick={() => removeEmergencyContact(index)} sx={{ ...softButtonSx, minHeight: 40 }}>Remove</Button>}
                        </Stack>
                        <Grid container spacing={2.5}>
                          <Grid size={fieldGrid}><TextField fullWidth required label="Emergency Contact Person" value={emergencyContact.name} onChange={(e) => updateEmergencyContactName(index, e.target.value)} inputProps={{ maxLength: 80 }} sx={textFieldSx} /></Grid>
                          <Grid size={fieldGrid}><TextField fullWidth required select label="Relationship" value={emergencyContact.relation} onChange={(e) => updateEmergencyContactRelation(index, e.target.value)} InputLabelProps={{ shrink: true }} sx={textFieldSx}>{RELATIONSHIPS.map((relationship) => <MenuItem key={relationship} value={relationship}>{relationship}</MenuItem>)}</TextField></Grid>
                          {emergencyContact.relation === 'Other' && <Grid size={fieldGrid}><TextField fullWidth required label="Please specify relationship" value={emergencyContact.relationOther} onChange={(e) => updateEmergencyContactRelationOther(index, e.target.value)} inputProps={{ maxLength: 80 }} sx={textFieldSx} /></Grid>}
                          <Grid size={fieldGrid}><MobileNumberField fullWidth required label="Emergency Contact Number" value={emergencyContact.phone} onNumberChange={digits => updateEmergencyContactPhone(index, digits)} sx={textFieldSx} /></Grid>
                          <Grid size={{ xs: 12, md: emergencyContact.relation === 'Other' ? 12 : 8 }}><TextField fullWidth label="Emergency Contact Address" value={emergencyContact.address} onChange={(e) => updateEmergencyContact(index, 'address', e.target.value)} inputProps={{ maxLength: 160 }} sx={textFieldSx} /></Grid>
                        </Grid>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              )}

              {activeStep === 5 && (
                <Paper elevation={0} sx={stepPaperSx}>
                  <SectionTitle icon={<DescriptionOutlined />} title="VII. Required Documents" />
                  {missingHistoryFiles.length > 0 && (
                    <Alert severity="warning" sx={{ overflowWrap: 'anywhere' }}>
                      These files could not be copied. Upload them again if needed. {missingHistoryFiles.join(', ')}
                    </Alert>
                  )}
                  <Grid container spacing={2.5} sx={{ mt: 1 }}>
                    <Grid size={{ xs: 12 }}>
                      <Alert severity="info" icon={<ArticleOutlined />} sx={{ borderRadius: 2, border: '1px solid rgba(22,101,52,0.12)', bgcolor: '#f0fdf4', color: '#14532d' }}>
                        <Stack spacing={0.75}>
                          <Typography variant="body2" fontWeight={700}>Accepted file types: {ACCEPTED_APPLICATION_FILE_LABEL}.</Typography>
                          <Typography variant="body2">You may upload multiple resume, certificate, and supporting-document files. Supporting documents may include: {SUPPORTING_DOCUMENT_EXAMPLES}.</Typography>
                          <Typography variant="body2">For front-and-back IDs or documents with separate pages, upload each clear image as a separate file. PDF files are also accepted for multi-page documents.</Typography>
                        </Stack>
                      </Alert>
                    </Grid>
                    <Grid size={halfGrid}>
                      <Box sx={{ height: '100%', p: 2.5, borderRadius: '20px', border: fieldErrors.resumeFiles ? '1px solid #ef4444' : '1px solid rgba(22,101,52,0.18)', bgcolor: '#fbfef9' }}>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <Box sx={{ width: 38, height: 38, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: '#dcfce7', color: '#166534', flexShrink: 0 }}><ArticleOutlined fontSize="small" /></Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography fontWeight={800} sx={{ color: '#14532d' }}>Resume / Biodata</Typography>
                              <Typography variant="body2" color="text.secondary">Upload one or more files. Accepted: {ACCEPTED_APPLICATION_FILE_LABEL}.</Typography>
                            </Box>
                          </Stack>
                          <Button fullWidth component="label" variant="contained" startIcon={<UploadFile />} sx={{ ...applicationPrimaryButtonSx, minHeight: 48 }}>
                            <input hidden multiple type="file" accept={ACCEPTED_APPLICATION_FILE_TYPES} onChange={(e) => { const files = Array.from(e.target.files ?? []); setResumeFiles((current) => [...current, ...files]); clearFieldError('resumeFiles'); e.target.value = ''; }} />
                            {resumeFiles.length ? 'Add Resume Files' : 'Select Resume Files'}
                          </Button>
                          {resumeFiles.length ? (
                            <Stack spacing={1}>
                              {documentTitleError && <Alert severity="error">{documentTitleError}</Alert>}
                              {resumeFiles.map((file, index) => renderDocumentRow(file, index, 'e.g. Resume / Biodata',
                                () => setResumeFiles(current => current.filter((_, fileIndex) => fileIndex !== index)),
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">Required before submitting the application.</Typography>
                          )}
                          {fieldErrors.resumeFiles && <Typography color="error" variant="caption" fontWeight={700}>{fieldErrors.resumeFiles}</Typography>}
                        </Stack>
                      </Box>
                    </Grid>
                    <Grid size={halfGrid}>
                      <Box sx={{ height: '100%', p: 2.5, borderRadius: '20px', border: fieldErrors.supportingFiles ? '1px solid #ef4444' : '1px solid rgba(22,101,52,0.18)', bgcolor: '#fbfef9' }}>
                        <Stack spacing={2}>
                          <Stack direction="row" spacing={1.25} alignItems="flex-start">
                            <Box sx={{ width: 38, height: 38, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: '#dcfce7', color: '#166534', flexShrink: 0 }}><DescriptionOutlined fontSize="small" /></Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography fontWeight={800} sx={{ color: '#14532d' }}>Supporting Documents</Typography>
                              <Typography variant="body2" color="text.secondary">Upload at least one file. Examples: valid ID, certificates, or records.</Typography>
                            </Box>
                          </Stack>
                          <Button fullWidth component="label" variant="contained" startIcon={<UploadFile />} sx={{ ...applicationPrimaryButtonSx, minHeight: 48 }}>
                            <input hidden multiple type="file" accept={ACCEPTED_APPLICATION_FILE_TYPES} onChange={(e) => { const selectedFiles = Array.from(e.target.files ?? []); setSupportingFiles((prev) => [...prev, ...selectedFiles]); clearFieldError('supportingFiles'); e.target.value = ''; }} />
                            {supportingFiles.length > 0 ? `Add Documents (${supportingFiles.length} selected)` : 'Select Documents'}
                          </Button>
                          {supportingFiles.length > 0 ? (
                            <Stack spacing={1}>
                              {documentTitleError && <Alert severity="error">{documentTitleError}</Alert>}
                              {supportingFiles.map((file, index) => renderDocumentRow(file, index, 'e.g. Birth Certificate',
                                () => setSupportingFiles(current => current.filter((_, fileIndex) => fileIndex !== index)),
                              ))}
                            </Stack>
                          ) : (
                            <Typography variant="caption" color="text.secondary">{certificateFiles.length > 0 ? 'Your uploaded certificates count as supporting documents.' : `Required before submitting the application. Accepted: ${ACCEPTED_APPLICATION_FILE_LABEL}.`}</Typography>
                          )}
                          {fieldErrors.supportingFiles && <Typography color="error" variant="caption" fontWeight={700}>{fieldErrors.supportingFiles}</Typography>}
                        </Stack>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12 }}><Typography variant="h6" fontWeight={700} sx={{ color: '#14532d', mt: 1 }}>VIII. Applicant Declaration</Typography></Grid>
                    <Grid size={halfGrid}><TextField fullWidth required label="Applicant's Signature / Full Name" value={formData.applicantSignature} onChange={(event) => { setUpperText('applicantSignature')(event); clearFieldError('applicantSignature'); }} error={!!fieldErrors.applicantSignature} helperText={fieldErrors.applicantSignature} inputProps={{ maxLength: 120 }} sx={textFieldSx} /></Grid>
                    <Grid size={halfGrid}><TextField fullWidth required type="date" label="Date" value={formData.declarationDate ?? currentManilaDate()} onChange={(event) => { set('declarationDate')(event); clearFieldError('declarationDate'); }} error={!!fieldErrors.declarationDate} helperText={fieldErrors.declarationDate} InputLabelProps={{ shrink: true }} sx={textFieldSx} /></Grid>
                  </Grid>
                </Paper>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems="center" sx={{ mt: 3, pt: 2 }}>
                <Button type="button" variant="outlined" startIcon={<ArrowBackRounded />} onClick={activeStep === 0 ? () => navigate('/applicant') : handleBack} sx={{ ...applicationSecondaryButtonSx, px: { xs: 2.5, sm: 5 }, py: 1.5, minWidth: 160, width: { xs: '100%', sm: 'auto' } }}>{activeStep === 0 ? 'Cancel' : 'Back'}</Button>
                {activeStep < steps.length - 1 ? <Button type="button" variant="contained" endIcon={<ArrowForwardRounded />} onClick={handleNext} sx={{ ...applicationPrimaryButtonSx, px: { xs: 2.5, sm: 6 }, py: 1.5, minWidth: 180, width: { xs: '100%', sm: 'auto' } }}>Next Step</Button> : <Button type="submit" data-submit-application="true" variant="contained" startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <Send />} disabled={submitting} sx={{ ...applicationPrimaryButtonSx, px: { xs: 2.5, sm: 6 }, py: 1.5, minWidth: 220, width: { xs: '100%', sm: 'auto' } }}>{submitting ? 'Submitting...' : 'Submit Application'}</Button>}
              </Stack>
            </Box>
          </Paper>
        </Container>
      </Box>

      {previewFile && <ApplicationFilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
      <Dialog open={successDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '26px', border: '1px solid rgba(22,101,52,0.12)', boxShadow: '0 28px 80px rgba(15,23,42,0.18)' } }}>
        <DialogContent sx={{ textAlign: 'center', p: { xs: 2.5, sm: 4 } }}><Box sx={{ width: { xs: 68, sm: 78 }, height: { xs: 68, sm: 78 }, borderRadius: '22px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2, background: 'linear-gradient(135deg, #dcfce7, #bbf7d0)', color: '#166534', boxShadow: '0 16px 34px rgba(22,101,52,0.18)' }}><VerifiedUserOutlined sx={{ fontSize: { xs: 42, sm: 50 } }} /></Box><Typography variant="h5" fontWeight={700} gutterBottom>Application Submitted Successfully</Typography><Typography color="text.secondary" sx={{ mb: 3 }}>Please save your Applicant ID. You will use this to track your application status.</Typography><Paper elevation={0} sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(31,122,71,0.08)', border: '1px solid rgba(31,122,71,0.18)', mb: 2 }}><Typography variant="h6" fontWeight={700} color="primary" sx={{ overflowWrap: 'anywhere' }}>{applicantId}</Typography></Paper>{emailPending && <Alert severity="info" sx={{ mb: 2 }}>Your application is saved. Sending your confirmation email…</Alert>}{!emailPending && !emailNotice && <Alert severity="success" sx={{ mb: 2 }}>A copy of your Applicant ID was sent to your email address.</Alert>}{emailNotice && <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>{emailNotice}</Alert>}{copied && <Alert severity="success" sx={{ mb: 2 }}>Applicant ID copied!</Alert>}{copyFailed && <Alert severity="error" sx={{ mb: 2 }}>Unable to copy Applicant ID.</Alert>}</DialogContent>
        <DialogActions sx={{ p: { xs: 2, sm: 3 }, justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}><Button variant="outlined" startIcon={<ContentCopy />} onClick={handleCopyId} sx={{ ...softButtonSx, borderColor: '#166534', color: '#166534', background: '#ffffff', width: { xs: '100%', sm: 'auto' } }}>Copy Applicant ID</Button><Button variant="contained" onClick={() => navigate('/track')} sx={{ ...applicationPrimaryButtonSx, width: { xs: '100%', sm: 'auto' } }}>Track Application</Button><Button onClick={handleCloseDialog} sx={{ ...softButtonSx, width: { xs: '100%', sm: 'auto' } }}>Close</Button></DialogActions>
      </Dialog>
    </AuthBackground>
  );
}
