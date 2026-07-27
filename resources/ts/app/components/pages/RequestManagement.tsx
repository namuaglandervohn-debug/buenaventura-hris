import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Grid,
  CircularProgress,
  Alert,
  Tooltip,
  Tabs,
  Tab,
  InputAdornment,
} from '@mui/material';
import {
  AddCircleOutline,
  TaskAlt,
  CancelOutlined,
  Sync,
  Security,
  AssignmentTurnedIn,
  PendingActions,
  CheckCircleOutline,
  HourglassTop,
  Person,
  Badge,
  CalendarMonth,
  AccessTime,
  Description,
  VisibilityOutlined,
  DeleteOutline,
  Close,
  DoneAll,
  PlaylistAddCheck,
  InfoOutlined,
  ManageSearch,
} from '@mui/icons-material';
import { useAuth } from '../../context/AuthContext';
import { supabase } from "../../lib/supabaseClient";
import ActionSnackbar from '../ActionSnackbar';

type RequestType = 'Leave' | 'Overtime' | 'Undertime';
type RequestStatus = 'Pending' | 'Supervisor Approved' | 'Approved' | 'Disapproved' | 'Rejected' | 'Cancelled';

type SnackbarSeverity = 'success' | 'error' | 'info' | 'warning';

interface RequestRecord {
  id: string;
  requestId: string;
  databaseRequestId?: string;
  employeeId: string;
  employee: string;
  type: RequestType;
  leaveType?: string | null;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  totalDays?: number | null;
  totalHours?: number | null;
  reason: string;
  status: RequestStatus;
  supervisorStatus?: string | null;
  supervisorNote?: string | null;
  supervisorName?: string | null;
  hrStatus?: string | null;
  hrNote?: string | null;
  hrName?: string | null;
  submittedDate: string;
}

interface EmployeeLeaveDirectoryRow {
  employeeId: string;
  name: string;
  position: string;
  department: string;
}

interface NewRequestState {
  type: RequestType;
  leaveType: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  reason: string;
}

const EMPTY: NewRequestState = {
  type: 'Leave',
  leaveType: 'Vacation Leave',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  reason: '',
};

const REQUEST_SELECT = `
  id,
  request_id,
  employee_id,
  request_type,
  leave_type,
  start_date,
  end_date,
  start_time,
  end_time,
  total_days,
  total_hours,
  reason,
  status,
  supervisor_status,
  supervisor_note,
  supervisor_name,
  hr_status,
  hr_note,
  hr_name,
  created_at,
  employees:employees!employee_requests_employee_id_fkey (
    employee_id,
    first_name,
    middle_name,
    last_name,
    suffix
  )
`;

const STATUS_CHIP: Record<string, { color: any; label: string }> = {
  Pending: { color: 'warning', label: 'Pending' },
  'Supervisor Approved': { color: 'info', label: 'Supervisor Approved' },
  Approved: { color: 'success', label: 'HR Approved' },
  Disapproved: { color: 'error', label: 'Disapproved' },
  Rejected: { color: 'error', label: 'Rejected' },
  Cancelled: { color: 'default', label: 'Cancelled' },
};

const LEAVE_TYPES = [
  'Vacation Leave',
  'Sick Leave',
  'Emergency Leave',
  'Maternity Leave',
  'Paternity Leave',
  'Bereavement Leave',
  'Other',
];

const DEFAULT_LEAVE_ENTITLEMENTS: Record<string, number> = {
  'Vacation Leave': 5,
  'Sick Leave': 5,
  'Emergency Leave': 3,
  'Maternity Leave': 105,
  'Paternity Leave': 7,
  'Bereavement Leave': 3,
  Other: 0,
};

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
  borderRadius: '12px',
  textTransform: 'none',
  fontWeight: 600,
  px: 2,
};

const requestStatusChipSx = (status: RequestStatus) => {
  const styles: Record<RequestStatus, { bg: string; color: string; border: string }> = {
    Pending: { bg: '#fff7e0', color: '#9b6b00', border: '#f5d786' },
    'Supervisor Approved': { bg: '#e9f6ff', color: '#1d6f9c', border: '#b7dff7' },
    Approved: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    Disapproved: { bg: '#fdeaea', color: '#9c2f2f', border: '#efb8b8' },
    Rejected: { bg: '#fdeaea', color: '#9c2f2f', border: '#efb8b8' },
    Cancelled: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da' },
  };

  const selected = styles[status] ?? styles.Pending;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25 },
  };
};

const requestTypeChipSx = (type: RequestType) => {
  const styles: Record<RequestType, { bg: string; color: string; border: string }> = {
    Leave: { bg: '#eaf6ff', color: '#24658f', border: '#b9ddf4' },
    Overtime: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    Undertime: { bg: '#fff7e0', color: '#9b6b00', border: '#f5d786' },
  };

  const selected = styles[type] ?? styles.Leave;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25 },
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
  '& .MuiInputLabel-root': { color: GREEN_UI.muted },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: GREEN_UI.text },
};

function normalizeRole(role?: string | null) {
  return String(role ?? '').trim().toLowerCase();
}

function getUserName(currentUser: any) {
  const directName = currentUser?.name || currentUser?.full_name;
  if (directName) return directName;

  const fullName = [currentUser?.first_name, currentUser?.middle_name, currentUser?.last_name, currentUser?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return fullName || currentUser?.email || 'User';
}

function formatEmployeeName(row: any) {
  return [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getReviewerUserId(currentUser: any) {
  return currentUser?.user_id || null;
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const dateOnly = value.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateOnly;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function formatTime(value?: string | null) {
  if (!value) return '—';
  return value.slice(0, 5);
}

function computeTotalDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  const diff = end.getTime() - start.getTime();
  return Math.round(diff / 86_400_000) + 1;
}

function computeTotalHours(startTime: string, endTime: string) {
  if (!startTime || !endTime) return 0;

  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  if ([startHour, startMinute, endHour, endMinute].some(value => Number.isNaN(value))) return 0;

  let diffMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (diffMinutes < 0) diffMinutes += 24 * 60;

  return Number((diffMinutes / 60).toFixed(2));
}

const SEQUENTIAL_REQUEST_ID_REGEX = /^REQ-(\d{4})-(\d+)$/i;

function getRequestYear(value?: string | null) {
  if (!value) return new Date().getFullYear();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().getFullYear() : date.getFullYear();
}

function buildSequentialRequestId(year: number, sequence: number) {
  return `REQ-${year}-${String(sequence).padStart(4, '0')}`;
}

function applyDisplayRequestIds(records: RequestRecord[]) {
  const usedSequenceByYear = new Map<number, Set<number>>();
  const assignedDisplayId = new Map<string, string>();

  records.forEach(record => {
    const match = String(record.databaseRequestId ?? record.requestId ?? '').match(SEQUENTIAL_REQUEST_ID_REGEX);
    if (!match) return;

    const year = Number(match[1]);
    const sequence = Number(match[2]);

    if (!Number.isFinite(year) || !Number.isFinite(sequence)) return;

    if (!usedSequenceByYear.has(year)) usedSequenceByYear.set(year, new Set<number>());
    usedSequenceByYear.get(year)?.add(sequence);
    assignedDisplayId.set(record.id, buildSequentialRequestId(year, sequence));
  });

  const nextSequenceByYear = new Map<number, number>();
  const sortedRecords = [...records].sort((a, b) => {
    const dateA = new Date(a.submittedDate || '').getTime();
    const dateB = new Date(b.submittedDate || '').getTime();
    const safeDateA = Number.isNaN(dateA) ? 0 : dateA;
    const safeDateB = Number.isNaN(dateB) ? 0 : dateB;

    if (safeDateA !== safeDateB) return safeDateA - safeDateB;
    return a.id.localeCompare(b.id);
  });

  sortedRecords.forEach(record => {
    if (assignedDisplayId.has(record.id)) return;

    const year = getRequestYear(record.submittedDate);
    if (!usedSequenceByYear.has(year)) usedSequenceByYear.set(year, new Set<number>());

    const usedSequences = usedSequenceByYear.get(year)!;
    let nextSequence = nextSequenceByYear.get(year) ?? 1;

    while (usedSequences.has(nextSequence)) {
      nextSequence += 1;
    }

    usedSequences.add(nextSequence);
    nextSequenceByYear.set(year, nextSequence + 1);
    assignedDisplayId.set(record.id, buildSequentialRequestId(year, nextSequence));
  });

  return records.map(record => ({
    ...record,
    requestId: assignedDisplayId.get(record.id) ?? record.requestId,
  }));
}

function mapRequestRow(row: any): RequestRecord {
  const employeeRow = Array.isArray(row.employees) ? row.employees[0] : row.employees;
  const employeeName = formatEmployeeName(employeeRow);

  return {
    id: row.id,
    requestId: row.request_id || row.id,
    databaseRequestId: row.request_id || row.id,
    employeeId: row.employee_id || '',
    employee: employeeName || row.employee_id || 'Unknown Employee',
    type: row.request_type as RequestType,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    totalDays: row.total_days,
    totalHours: row.total_hours,
    reason: row.reason || '',
    status: (row.status || 'Pending') as RequestStatus,
    supervisorStatus: row.supervisor_status,
    supervisorNote: row.supervisor_note,
    supervisorName: row.supervisor_name,
    hrStatus: row.hr_status,
    hrNote: row.hr_note,
    hrName: row.hr_name,
    submittedDate: row.created_at,
  };
}

export default function RequestManagement() {
  const { user } = useAuth();
  const currentUser = user as any;

  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [employeeLeaveDirectory, setEmployeeLeaveDirectory] = useState<EmployeeLeaveDirectoryRow[]>([]);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [viewDialog, setViewDialog] = useState(false);
  const [selectedReq, setSelectedReq] = useState<RequestRecord | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [newRequest, setNewRequest] = useState<NewRequestState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [leaveBalanceSearch, setLeaveBalanceSearch] = useState('');
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success' as SnackbarSeverity,
  });

  const role = normalizeRole(currentUser?.role);
  const isSupervisor = role.includes('supervisor');
  const isHR = role === 'hr_admin' || role.includes('hr') || role.includes('admin') || role.includes('human resource');
  const isGM = role === 'general_manager' || role.includes('general manager') || role.includes('general_manager');
  const isEmployee = role === 'employee' || role.includes('employee');

  const resolveCurrentEmployeeId = async () => {
    if (currentUser?.employee_id) return currentUser.employee_id as string;

    if (currentUser?.email) {
      const { data: account } = await supabase
        .from('user_accounts')
        .select('employee_id')
        .eq('email', currentUser.email)
        .maybeSingle();

      if (account?.employee_id) return account.employee_id as string;

      const { data: employee } = await supabase
        .from('employees')
        .select('employee_id')
        .eq('email', currentUser.email)
        .maybeSingle();

      if (employee?.employee_id) return employee.employee_id as string;
    }

    return null;
  };

  const generateNextRequestId = async () => {
    const year = new Date().getFullYear();
    const startOfYear = `${year}-01-01T00:00:00.000Z`;
    const startOfNextYear = `${year + 1}-01-01T00:00:00.000Z`;

    const { data, error: sequenceError } = await supabase
      .from('employee_requests')
      .select('request_id, created_at')
      .gte('created_at', startOfYear)
      .lt('created_at', startOfNextYear);

    if (sequenceError) throw sequenceError;

    const usedSequences = new Set<number>();
    const recordsThisYear = data ?? [];

    recordsThisYear.forEach(row => {
      const match = String(row.request_id ?? '').match(SEQUENTIAL_REQUEST_ID_REGEX);
      if (!match || Number(match[1]) !== year) return;

      const sequence = Number(match[2]);
      if (Number.isFinite(sequence)) usedSequences.add(sequence);
    });

    let nextSequence = 1;
    while (usedSequences.has(nextSequence)) {
      nextSequence += 1;
    }

    /*
      Legacy records may still have request IDs like REQ-AB3D15D9A9.
      This keeps new IDs from duplicating the display sequence assigned to those old rows.
    */
    nextSequence = Math.max(nextSequence, recordsThisYear.length + 1);

    return buildSequentialRequestId(year, nextSequence);
  };

  const fetchEmployeeLeaveDirectory = async () => {
    const { data, error: employeeError } = await supabase
      .from('employees')
      .select('employee_id, first_name, middle_name, last_name, suffix, position, department')
      .order('first_name', { ascending: true });

    if (employeeError) throw employeeError;

    setEmployeeLeaveDirectory(
      (data ?? []).map((row: any) => ({
        employeeId: row.employee_id ?? '',
        name: formatEmployeeName(row) || row.employee_id || 'Unnamed Employee',
        position: row.position ?? '',
        department: row.department ?? '',
      }))
    );
  };

  const fetchRequests = async (employeeIdOverride?: string | null) => {
    setLoading(true);
    setError(null);

    try {
      const employeeIdForFilter = employeeIdOverride ?? currentEmployeeId;

      if (isEmployee && !employeeIdForFilter && !isHR && !isSupervisor && !isGM) {
        setRequests([]);
        setError('Your account is not linked to an employee record yet. Please make sure your user account has an employee_id.');
        return;
      }

      let query = supabase
        .from('employee_requests')
        .select(REQUEST_SELECT)
        .order('created_at', { ascending: false });

      if (isEmployee && !isHR && !isSupervisor && !isGM && employeeIdForFilter) {
        query = query.eq('employee_id', employeeIdForFilter);
      }

      const { data, error: requestError } = await query;

      if (requestError) throw requestError;

      setRequests(applyDisplayRequestIds((data ?? []).map(mapRequestRow)));
    } catch (e: any) {
      setError(`Could not load requests: ${e.message ?? 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      setLoading(true);
      try {
        const employeeId = await resolveCurrentEmployeeId();
        if (!active) return;
        setCurrentEmployeeId(employeeId);
        if (!isEmployee) {
          await fetchEmployeeLeaveDirectory();
        } else {
          setEmployeeLeaveDirectory([]);
        }
        await fetchRequests(employeeId);
      } catch (e: any) {
        if (!active) return;
        setError(`Could not initialize requests: ${e.message ?? 'Unknown error'}`);
        setLoading(false);
      }
    };

    initialize();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.email, currentUser?.employee_id, currentUser?.role]);

  const handleSubmit = async () => {
    const startDate = newRequest.startDate;
    const endDate = newRequest.type === 'Undertime' ? newRequest.startDate : newRequest.endDate || newRequest.startDate;
    const reason = newRequest.reason.trim();

    if (!currentEmployeeId) {
      setSnackbar({
        open: true,
        message: 'Your account is not linked to an employee record. Please add employee_id to your user account first.',
        severity: 'error',
      });
      return;
    }

    if (!startDate || !endDate || !reason) {
      setSnackbar({ open: true, message: 'Please complete the required date and reason fields.', severity: 'error' });
      return;
    }

    if (endDate < startDate) {
      setSnackbar({ open: true, message: 'End date cannot be earlier than start date.', severity: 'error' });
      return;
    }

    if (newRequest.type === 'Leave' && !newRequest.leaveType) {
      setSnackbar({ open: true, message: 'Please select a leave type.', severity: 'error' });
      return;
    }

    if ((newRequest.type === 'Overtime' || newRequest.type === 'Undertime') && (!newRequest.startTime || !newRequest.endTime)) {
      setSnackbar({ open: true, message: 'Please provide start time and end time.', severity: 'error' });
      return;
    }

    setSaving(true);

    try {
      const totalDays = newRequest.type === 'Leave' ? computeTotalDays(startDate, endDate) : 0;
      const totalHours = newRequest.type === 'Overtime' || newRequest.type === 'Undertime'
        ? computeTotalHours(newRequest.startTime, newRequest.endTime)
        : 0;

      const generatedRequestId = await generateNextRequestId();

      const payload = {
        request_id: generatedRequestId,
        employee_id: currentEmployeeId,
        request_type: newRequest.type,
        leave_type: newRequest.type === 'Leave' ? newRequest.leaveType : null,
        start_date: startDate,
        end_date: endDate,
        start_time: newRequest.type === 'Leave' ? null : newRequest.startTime,
        end_time: newRequest.type === 'Leave' ? null : newRequest.endTime,
        total_days: totalDays,
        total_hours: totalHours,
        reason,
        status: 'Pending',
        supervisor_status: 'Pending',
        hr_status: 'Pending',
      };

      const { data, error: insertError } = await supabase
        .from('employee_requests')
        .insert(payload)
        .select(REQUEST_SELECT)
        .single();

      if (insertError) throw insertError;

      setRequests(prev => applyDisplayRequestIds([mapRequestRow(data), ...prev]));
      setOpenDialog(false);
      setNewRequest(EMPTY);
      setSnackbar({ open: true, message: '✅ Request submitted successfully!', severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed to submit request: ${e.message ?? 'Unknown error'}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const updateRequest = async (id: string, update: Record<string, any>, successMsg: string) => {
    try {
      const { data, error: updateError } = await supabase
        .from('employee_requests')
        .update(update)
        .eq('id', id)
        .select(REQUEST_SELECT)
        .single();

      if (updateError) throw updateError;

      const updatedRecord = mapRequestRow(data);
      setRequests(prev => {
        const existingDisplayId = prev.find(r => r.id === id)?.requestId;
        return applyDisplayRequestIds(prev.map(r => (r.id === id ? { ...updatedRecord, requestId: existingDisplayId ?? updatedRecord.requestId } : r)));
      });
      if (selectedReq?.id === id) {
        setSelectedReq({ ...updatedRecord, requestId: selectedReq.requestId });
      }
      setSnackbar({ open: true, message: successMsg, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed to update request: ${e.message ?? 'Unknown error'}`, severity: 'error' });
    }
  };

  const supervisorApprove = (id: string) => updateRequest(
    id,
    {
      status: 'Supervisor Approved',
      supervisor_status: 'Approved',
      supervisor_note: noteInput.trim() || null,
      supervisor_name: getUserName(currentUser),
      supervisor_user_id: getReviewerUserId(currentUser),
      supervisor_reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: getReviewerUserId(currentUser),
      reviewed_at: new Date().toISOString(),
      reviewer_remarks: noteInput.trim() || null,
    },
    '✅ Request approved by Supervisor and forwarded to HR for final validation.'
  );

  const supervisorDisapprove = (id: string) => updateRequest(
    id,
    {
      status: 'Disapproved',
      supervisor_status: 'Disapproved',
      supervisor_note: noteInput.trim() || null,
      supervisor_name: getUserName(currentUser),
      supervisor_user_id: getReviewerUserId(currentUser),
      supervisor_reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: getReviewerUserId(currentUser),
      reviewed_at: new Date().toISOString(),
      reviewer_remarks: noteInput.trim() || null,
    },
    '❌ Request disapproved by Supervisor.'
  );

  const hrApprove = (id: string) => updateRequest(
    id,
    {
      status: 'Approved',
      hr_status: 'Approved',
      hr_note: noteInput.trim() || null,
      hr_name: getUserName(currentUser),
      hr_user_id: getReviewerUserId(currentUser),
      hr_reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: getReviewerUserId(currentUser),
      reviewed_at: new Date().toISOString(),
      reviewer_remarks: noteInput.trim() || null,
    },
    '✅ Request validated and fully approved by HR.'
  );

  const hrReject = (id: string) => updateRequest(
    id,
    {
      status: 'Disapproved',
      hr_status: 'Disapproved',
      hr_note: noteInput.trim() || null,
      hr_name: getUserName(currentUser),
      hr_user_id: getReviewerUserId(currentUser),
      hr_reviewed_at: new Date().toISOString(),
      reviewed_by_user_id: getReviewerUserId(currentUser),
      reviewed_at: new Date().toISOString(),
      reviewer_remarks: noteInput.trim() || null,
    },
    '❌ Request rejected by HR.'
  );

  const cancelRequest = (id: string) => updateRequest(
    id,
    { status: 'Cancelled' },
    'Request cancelled.'
  );

  const handleDelete = async (request: RequestRecord) => {
    if (!window.confirm(`Delete request ${request.requestId}? This cannot be undone.`)) return;

    try {
      const { error: deleteError } = await supabase
        .from('employee_requests')
        .delete()
        .eq('id', request.id);

      if (deleteError) throw deleteError;

      setRequests(prev => prev.filter(r => r.id !== request.id));
      setSnackbar({ open: true, message: `🗑️ Request ${request.requestId} deleted.`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed to delete request: ${e.message ?? 'Unknown error'}`, severity: 'error' });
    }
  };

  const requestSearchQuery = search.trim().toLowerCase();
  const searchedRequests = requestSearchQuery
    ? requests.filter(r =>
        [
          r.requestId,
          r.databaseRequestId,
          r.employeeId,
          r.employee,
          r.type,
          r.leaveType,
          r.status,
          r.reason,
          r.startDate,
          r.endDate,
          r.submittedDate,
          r.supervisorName,
          r.hrName,
        ].some(value => String(value ?? '').toLowerCase().includes(requestSearchQuery))
      )
    : requests;

  const tabData = [
    { label: 'All', data: searchedRequests },
    { label: 'Pending', data: searchedRequests.filter(r => r.status === 'Pending') },
    { label: 'Supervisor Approved', data: searchedRequests.filter(r => r.status === 'Supervisor Approved') },
    { label: 'Approved', data: searchedRequests.filter(r => r.status === 'Approved') },
    { label: 'Disapproved', data: searchedRequests.filter(r => r.status === 'Disapproved' || r.status === 'Rejected') },
    { label: 'Cancelled', data: searchedRequests.filter(r => r.status === 'Cancelled') },
  ];

  const displayData = tabData[tab]?.data ?? searchedRequests;

  const requestStats = [
    {
      label: 'Total Requests',
      value: requests.length,
      caption: 'All submitted leave, overtime, and undertime requests.',
      icon: <AssignmentTurnedIn fontSize="small" />,
    },
    {
      label: 'Pending',
      value: requests.filter(r => r.status === 'Pending').length,
      caption: 'Requests waiting for supervisor review.',
      icon: <PendingActions fontSize="small" />,
    },
    {
      label: 'For HR Validation',
      value: requests.filter(r => r.status === 'Supervisor Approved').length,
      caption: 'Supervisor-approved requests awaiting final HR action.',
      icon: <HourglassTop fontSize="small" />,
    },
    {
      label: 'Approved',
      value: requests.filter(r => r.status === 'Approved').length,
      caption: 'Requests fully approved and validated.',
      icon: <CheckCircleOutline fontSize="small" />,
    },
  ];

  const leaveBalances = Object.entries(DEFAULT_LEAVE_ENTITLEMENTS).map(([leaveType, available]) => {
    const approvedDays = requests
      .filter(request =>
        request.type === 'Leave' &&
        request.status === 'Approved' &&
        request.leaveType === leaveType &&
        (!isEmployee || request.employeeId === currentEmployeeId)
      )
      .reduce((sum, request) => sum + Number(request.totalDays ?? 0), 0);

    return {
      leaveType,
      available,
      used: approvedDays,
      remaining: Math.max(available - approvedDays, 0),
    };
  });

  const employeeLeaveBalanceRows = employeeLeaveDirectory.map(employee => {
    const balances = Object.entries(DEFAULT_LEAVE_ENTITLEMENTS).map(([leaveType, available]) => {
      const approvedDays = requests
        .filter(request =>
          request.type === 'Leave' &&
          request.status === 'Approved' &&
          request.leaveType === leaveType &&
          request.employeeId === employee.employeeId
        )
        .reduce((sum, request) => sum + Number(request.totalDays ?? 0), 0);

      return {
        leaveType,
        remaining: Math.max(available - approvedDays, 0),
      };
    });

    return {
      ...employee,
      balances,
      totalRemaining: balances.reduce((sum, balance) => sum + balance.remaining, 0),
    };
  });
  const normalizedLeaveBalanceSearch = leaveBalanceSearch.trim().toLowerCase();
  const filteredEmployeeLeaveBalanceRows = normalizedLeaveBalanceSearch
    ? employeeLeaveBalanceRows.filter(employee =>
        [
          employee.employeeId,
          employee.name,
          employee.position,
          employee.department,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedLeaveBalanceSearch)
      )
    : employeeLeaveBalanceRows;

  const resetNewRequestType = (type: RequestType) => {
    setNewRequest(prev => ({
      ...prev,
      type,
      leaveType: type === 'Leave' ? prev.leaveType || 'Vacation Leave' : '',
      startTime: type === 'Leave' ? '' : prev.startTime,
      endTime: type === 'Leave' ? '' : prev.endTime,
      endDate: type === 'Undertime' ? prev.startDate : prev.endDate,
    }));
  };

  const leaveBalanceSection = (
    <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mt: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.5, flexWrap: 'wrap' }}>
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
          <CalendarMonth />
        </Box>
        <Box>
          <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
            {isEmployee ? 'Leave Balance' : 'Employee Leave Balances'}
          </Typography>
          <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
            {isEmployee
              ? 'Available, used, and remaining leave credits. Submitted and supervisor-approved requests do not reduce balances until final approval.'
              : 'List of existing employees and their remaining leave credits. Only final HR-approved leave requests reduce balances.'}
          </Typography>
        </Box>
      </Box>
      {isEmployee ? (
        <Grid container spacing={1.2}>
          {leaveBalances.map(balance => (
            <Grid key={balance.leaveType} size={{ xs: 12, sm: 6, md: 3 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: 1.5, minHeight: 112 }}>
                <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text, mb: 0.75 }}>
                  {balance.leaveType}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
                  {[
                    ['Available', balance.available],
                    ['Used', balance.used],
                    ['Remaining', balance.remaining],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                        {label}
                      </Typography>
                      <Typography fontWeight={700} sx={{ color: label === 'Remaining' ? GREEN_UI.greenDark : GREEN_UI.text }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      ) : (
        <>
        <TextField
          fullWidth
          size="small"
          placeholder="Search employee name, ID, position, or department..."
          value={leaveBalanceSearch}
          onChange={event => setLeaveBalanceSearch(event.target.value)}
          sx={{ ...softTextFieldSx, mb: 1.25 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <ManageSearch sx={{ color: GREEN_UI.greenDark }} fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            borderRadius: '18px',
            border: `1px solid ${GREEN_UI.border}`,
            bgcolor: 'rgba(255,255,255,0.82)',
            overflowX: 'auto',
          }}
        >
          <Table size="small" sx={{ minWidth: 1120 }}>
            <TableHead>
              <TableRow
                sx={{
                  '& th': {
                    bgcolor: GREEN_UI.greenSoft,
                    color: GREEN_UI.greenDark,
                    fontWeight: 800,
                    borderBottom: `1px solid ${GREEN_UI.border}`,
                    whiteSpace: 'nowrap',
                  },
                }}
              >
                <TableCell>Employee</TableCell>
                <TableCell>Position</TableCell>
                <TableCell>Department</TableCell>
                {LEAVE_TYPES.map(type => (
                  <TableCell key={type} align="center">
                    {type.replace(' Leave', '')}
                  </TableCell>
                ))}
                <TableCell align="center">Total Remaining</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employeeLeaveBalanceRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={LEAVE_TYPES.length + 4} align="center" sx={{ py: 4, color: GREEN_UI.muted }}>
                    No employee records found.
                  </TableCell>
                </TableRow>
              ) : filteredEmployeeLeaveBalanceRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={LEAVE_TYPES.length + 4} align="center" sx={{ py: 4, color: GREEN_UI.muted }}>
                    No employees match your search.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEmployeeLeaveBalanceRows.map(employee => (
                  <TableRow
                    key={employee.employeeId}
                    hover
                    sx={{
                      '& td': {
                        borderBottom: `1px solid ${GREEN_UI.border}`,
                        color: GREEN_UI.text,
                      },
                    }}
                  >
                    <TableCell>
                      <Box>
                        <Typography fontWeight={800} sx={{ color: GREEN_UI.text }}>
                          {employee.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                          {employee.employeeId}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{employee.position || '—'}</TableCell>
                    <TableCell>{employee.department || '—'}</TableCell>
                    {employee.balances.map(balance => (
                      <TableCell key={balance.leaveType} align="center">
                        <Chip
                          label={balance.remaining}
                          size="small"
                          sx={{
                            minWidth: 46,
                            bgcolor: balance.remaining > 0 ? GREEN_UI.greenSoft : '#f4f7f3',
                            color: balance.remaining > 0 ? GREEN_UI.greenDark : GREEN_UI.muted,
                            border: `1px solid ${balance.remaining > 0 ? GREEN_UI.borderStrong : GREEN_UI.border}`,
                            fontWeight: 800,
                          }}
                        />
                      </TableCell>
                    ))}
                    <TableCell align="center">
                      <Typography fontWeight={900} sx={{ color: GREEN_UI.greenDark }}>
                        {employee.totalRemaining}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      )}
      <Alert severity="info" sx={{ mt: 1.5, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}` }}>
        Unused leave credits remain available until the end of the current leave cycle. Carry-over or cash conversion is processed only when HR/Admin records an approved organization adjustment; otherwise unused credits are reset for the next cycle.
      </Alert>
    </Paper>
  );

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
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              icon={<PlaylistAddCheck />}
              label="Request Workspace"
              size="small"
              sx={{
                mb: 1.2,
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                fontWeight: 700,
                '& .MuiChip-icon': { color: GREEN_UI.greenDark },
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
              Leave, Overtime & Undertime Requests
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 690, lineHeight: 1.7 }}>
              {isSupervisor
                ? 'Review employee requests, add remarks, and forward approved items to HR for final validation.'
                : isHR
                  ? 'Validate supervisor-approved requests and keep request decisions properly documented.'
                  : 'Submit and track your leave, overtime, and undertime requests in one clean workspace.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="Refresh requests">
              <span>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={() => fetchRequests(currentEmployeeId)}
                  disabled={loading}
                  sx={{
                    ...pillButtonSx,
                    py: 1.1,
                    bgcolor: GREEN_UI.green,
                    boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                    '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
                  }}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </Button>
              </span>
            </Tooltip>
            {(isEmployee || Boolean(currentEmployeeId)) && (
              <Button
                variant="contained"
                startIcon={<AddCircleOutline />}
                onClick={() => setOpenDialog(true)}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.greenDark,
                  boxShadow: '0 12px 24px rgba(31, 122, 70, 0.24)',
                  '&:hover': { bgcolor: '#176739', boxShadow: '0 16px 28px rgba(31, 122, 70, 0.30)' },
                }}
              >
                New Request
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {requestStats.map(stat => (
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
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
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

      {false && (
      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.5, flexWrap: 'wrap' }}>
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
            <CalendarMonth />
          </Box>
          <Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              {isEmployee ? 'Leave Balance' : 'Employee Leave Balances'}
            </Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              {isEmployee
                ? 'Available, used, and remaining leave credits. Submitted and supervisor-approved requests do not reduce balances until final approval.'
                : 'List of existing employees and their remaining leave credits. Only final HR-approved leave requests reduce balances.'}
            </Typography>
          </Box>
        </Box>
        {isEmployee ? (
          <Grid container spacing={1.2}>
            {leaveBalances.map(balance => (
              <Grid key={balance.leaveType} size={{ xs: 12, sm: 6, md: 3 }}>
                <Paper elevation={0} sx={{ ...innerCardSx, p: 1.5, minHeight: 112 }}>
                  <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text, mb: 0.75 }}>
                    {balance.leaveType}
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
                    {[
                      ['Available', balance.available],
                      ['Used', balance.used],
                      ['Remaining', balance.remaining],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                          {label}
                        </Typography>
                        <Typography fontWeight={700} sx={{ color: label === 'Remaining' ? GREEN_UI.greenDark : GREEN_UI.text }}>
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        ) : (
          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              borderRadius: '18px',
              border: `1px solid ${GREEN_UI.border}`,
              bgcolor: 'rgba(255,255,255,0.82)',
              overflowX: 'auto',
            }}
          >
            <Table size="small" sx={{ minWidth: 1120 }}>
              <TableHead>
                <TableRow
                  sx={{
                    '& th': {
                      bgcolor: GREEN_UI.greenSoft,
                      color: GREEN_UI.greenDark,
                      fontWeight: 800,
                      borderBottom: `1px solid ${GREEN_UI.border}`,
                      whiteSpace: 'nowrap',
                    },
                  }}
                >
                  <TableCell>Employee</TableCell>
                  <TableCell>Position</TableCell>
                  <TableCell>Department</TableCell>
                  {LEAVE_TYPES.map(type => (
                    <TableCell key={type} align="center">
                      {type.replace(' Leave', '')}
                    </TableCell>
                  ))}
                  <TableCell align="center">Total Remaining</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employeeLeaveBalanceRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={LEAVE_TYPES.length + 4} align="center" sx={{ py: 4, color: GREEN_UI.muted }}>
                      No employee records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  employeeLeaveBalanceRows.map(employee => (
                    <TableRow
                      key={employee.employeeId}
                      hover
                      sx={{
                        '& td': {
                          borderBottom: `1px solid ${GREEN_UI.border}`,
                          color: GREEN_UI.text,
                        },
                      }}
                    >
                      <TableCell>
                        <Box>
                          <Typography fontWeight={800} sx={{ color: GREEN_UI.text }}>
                            {employee.name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                            {employee.employeeId}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{employee.position || '—'}</TableCell>
                      <TableCell>{employee.department || '—'}</TableCell>
                      {employee.balances.map(balance => (
                        <TableCell key={balance.leaveType} align="center">
                          <Chip
                            label={balance.remaining}
                            size="small"
                            sx={{
                              minWidth: 46,
                              bgcolor: balance.remaining > 0 ? GREEN_UI.greenSoft : '#f4f7f3',
                              color: balance.remaining > 0 ? GREEN_UI.greenDark : GREEN_UI.muted,
                              border: `1px solid ${balance.remaining > 0 ? GREEN_UI.borderStrong : GREEN_UI.border}`,
                              fontWeight: 800,
                            }}
                          />
                        </TableCell>
                      ))}
                      <TableCell align="center">
                        <Typography fontWeight={900} sx={{ color: GREEN_UI.greenDark }}>
                          {employee.totalRemaining}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Alert severity="info" sx={{ mt: 1.5, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}` }}>
          Unused leave credits remain available until the end of the current leave cycle. Carry-over or cash conversion is processed only when HR/Admin records an approved organization adjustment; otherwise unused credits are reset for the next cycle.
        </Alert>
      </Paper>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={() => fetchRequests(currentEmployeeId)} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {(isSupervisor || isHR) && (
        <Alert
          icon={<InfoOutlined />}
          severity="info"
          sx={{
            mb: 2,
            borderRadius: '20px',
            border: `1px solid ${GREEN_UI.border}`,
            bgcolor: 'rgba(239, 250, 235, 0.86)',
            color: GREEN_UI.text,
            '& .MuiAlert-icon': { color: GREEN_UI.greenDark },
          }}
        >
          <strong>Two-Step Approval Flow:</strong> Employee submits → <strong>Supervisor</strong> reviews and approves → <strong>HR</strong> validates for final approval.
          {isSupervisor && ' You can approve or disapprove Pending requests.'}
          {isHR && ' You validate Supervisor Approved requests for final HR approval.'}
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
            <ManageSearch fontSize="small" />
          </Box>
          <Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              Request Directory
            </Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              Search by request ID, employee, type, leave category, date, reason, or status.
            </Typography>
          </Box>
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder="Search requests..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          sx={softTextFieldSx}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <ManageSearch sx={{ color: GREEN_UI.greenDark }} fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
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
              borderRadius: '12px',
              textTransform: 'none',
              fontWeight: 600,
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
        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 7, gap: 2 }}>
            <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading requests…</Typography>
          </Box>
        ) : (
          <Table sx={{ minWidth: 980, '& th, & td': { borderColor: 'rgba(139, 184, 144, 0.16)' } }}>
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
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Request ID</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Employee</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Type</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Date Coverage</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Time / Total</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Reason</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Submitted</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 260 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {displayData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 7 }}>
                    <Box sx={{ maxWidth: 380, mx: 'auto' }}>
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
                        <AssignmentTurnedIn />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {requests.length === 0 ? 'No requests yet' : 'No requests match your search'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        {requests.length === 0
                          ? 'Submitted requests will appear here automatically.'
                          : 'Try another request ID, employee, date, reason, or status keyword.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                displayData.map(req => {
                  const chip = STATUS_CHIP[req.status] ?? { color: 'default', label: req.status };
                  const canSupervisorReview = isSupervisor && req.status === 'Pending';
                  const canHrReview = isHR && req.status === 'Supervisor Approved';
                  const canCancel = isEmployee && req.status === 'Pending' && req.employeeId === currentEmployeeId;

                  return (
                    <TableRow
                      key={req.id}
                      hover
                      sx={{
                        transition: 'background 160ms ease',
                        '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                        '& td': { py: 1.55, color: GREEN_UI.text },
                      }}
                    >
                      <TableCell>
                        <Chip
                          icon={<Badge />}
                          label={req.requestId}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontWeight: 600,
                            bgcolor: '#f8fcf5',
                            borderColor: GREEN_UI.border,
                            '& .MuiChip-icon': { color: GREEN_UI.greenDark },
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
                            }}
                          >
                            <Person fontSize="small" />
                          </Box>
                          <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>
                            {req.employee}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip label={req.type} size="small" variant="outlined" sx={requestTypeChipSx(req.type)} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <CalendarMonth fontSize="small" sx={{ color: GREEN_UI.greenDark }} />
                          <Typography variant="body2" sx={{ color: GREEN_UI.text, fontWeight: 700 }}>
                            {formatDate(req.startDate)} {req.endDate && req.endDate !== req.startDate ? `– ${formatDate(req.endDate)}` : ''}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <AccessTime fontSize="small" sx={{ color: GREEN_UI.greenDark }} />
                          <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                            {req.type === 'Leave'
                              ? `${req.totalDays ?? computeTotalDays(req.startDate, req.endDate)} day(s)`
                              : `${formatTime(req.startTime)} – ${formatTime(req.endTime)} (${req.totalHours ?? 0} hr/s)`}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <Tooltip title={req.reason || 'No reason provided'}>
                          <Typography
                            variant="body2"
                            sx={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: GREEN_UI.muted,
                              fontWeight: 700,
                            }}
                          >
                            {req.reason || '—'}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(req.submittedDate)}</TableCell>
                      <TableCell>
                        <Chip label={chip.label} size="small" variant="outlined" sx={requestStatusChipSx(req.status)} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Chip
                            icon={<VisibilityOutlined />}
                            label="View Details"
                            size="small"
                            clickable
                            variant="outlined"
                            onClick={() => {
                              setSelectedReq(req);
                              setNoteInput('');
                              setViewDialog(true);
                            }}
                            sx={{
                              minWidth: 126,
                              justifyContent: 'center',
                              fontWeight: 600,
                              borderColor: GREEN_UI.borderStrong,
                              color: GREEN_UI.greenDark,
                              bgcolor: '#ffffff',
                              '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                              '&:hover': { bgcolor: GREEN_UI.greenSoft },
                            }}
                          />

                          {(canSupervisorReview || canHrReview) && (
                            <Chip
                              icon={canHrReview ? <Security /> : <TaskAlt />}
                              label={canHrReview ? 'Validate' : 'Review'}
                              size="small"
                              clickable
                              variant="outlined"
                              onClick={() => {
                                setSelectedReq(req);
                                setNoteInput('');
                                setViewDialog(true);
                              }}
                              sx={{
                                minWidth: 104,
                                justifyContent: 'center',
                                fontWeight: 600,
                                borderColor: '#a9dfb6',
                                color: GREEN_UI.greenDark,
                                bgcolor: '#f4fbf5',
                                '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                                '&:hover': { bgcolor: '#e5f8e9' },
                              }}
                            />
                          )}

                          {canCancel && (
                            <Chip
                              icon={<Close />}
                              label="Cancel"
                              size="small"
                              clickable
                              variant="outlined"
                              onClick={() => cancelRequest(req.id)}
                              sx={{
                                minWidth: 92,
                                justifyContent: 'center',
                                fontWeight: 600,
                                borderColor: '#f5d786',
                                color: '#9b6b00',
                                bgcolor: '#fffdf5',
                                '& .MuiChip-icon': { color: '#9b6b00' },
                                '&:hover': { bgcolor: '#fff7e0' },
                              }}
                            />
                          )}

                          {isHR && (
                            <Chip
                              icon={<DeleteOutline />}
                              label="Delete"
                              size="small"
                              clickable
                              variant="outlined"
                              onClick={() => handleDelete(req)}
                              sx={{
                                minWidth: 90,
                                justifyContent: 'center',
                                fontWeight: 600,
                                borderColor: '#efb8b8',
                                color: '#9c2f2f',
                                bgcolor: '#fffafa',
                                '& .MuiChip-icon': { color: '#9c2f2f' },
                                '&:hover': { bgcolor: '#fdeaea' },
                              }}
                            />
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {leaveBalanceSection}

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="sm"
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AddCircleOutline sx={{ color: GREEN_UI.greenDark }} />
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              Submit New Request
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#fbfff9' }}>
          <Grid container spacing={2} sx={{ mt: 2.25 }}>
            <Grid size={12}>
              <TextField
                fullWidth
                select
                label="Request Type"
                value={newRequest.type}
                onChange={event => resetNewRequestType(event.target.value as RequestType)}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem value="Leave">Leave</MenuItem>
                <MenuItem value="Overtime">Overtime</MenuItem>
                <MenuItem value="Undertime">Undertime</MenuItem>
              </TextField>
            </Grid>

            {newRequest.type === 'Leave' && (
              <Grid size={12}>
                <TextField
                  fullWidth
                  select
                  label="Leave Type"
                  value={newRequest.leaveType}
                  onChange={event => setNewRequest({ ...newRequest, leaveType: event.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                >
                  {LEAVE_TYPES.map(type => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}

            {newRequest.type === 'Undertime' ? (
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Date of Undertime"
                  type="date"
                  value={newRequest.startDate}
                  onChange={event => setNewRequest({ ...newRequest, startDate: event.target.value, endDate: event.target.value })}
                  InputLabelProps={{ shrink: true }}
                  helperText="Undertime applies to a single specific date only."
                  sx={softTextFieldSx}
                />
              </Grid>
            ) : (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Start Date"
                    type="date"
                    value={newRequest.startDate}
                    onChange={event => setNewRequest({ ...newRequest, startDate: event.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={softTextFieldSx}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="End Date"
                    type="date"
                    value={newRequest.endDate}
                    onChange={event => setNewRequest({ ...newRequest, endDate: event.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={softTextFieldSx}
                  />
                </Grid>
              </>
            )}

            {(newRequest.type === 'Overtime' || newRequest.type === 'Undertime') && (
              <>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Start Time"
                    type="time"
                    value={newRequest.startTime}
                    onChange={event => setNewRequest({ ...newRequest, startTime: event.target.value })}
                    InputLabelProps={{ shrink: true }}
                    sx={softTextFieldSx}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="End Time"
                    type="time"
                    value={newRequest.endTime}
                    onChange={event => setNewRequest({ ...newRequest, endTime: event.target.value })}
                    InputLabelProps={{ shrink: true }}
                    helperText={
                      newRequest.startTime && newRequest.endTime
                        ? `Computed total: ${computeTotalHours(newRequest.startTime, newRequest.endTime)} hour(s)`
                        : 'Required for overtime and undertime.'
                    }
                    sx={softTextFieldSx}
                  />
                </Grid>
              </>
            )}

            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Reason / Details"
                value={newRequest.reason}
                onChange={event => setNewRequest({ ...newRequest, reason: event.target.value })}
                sx={softTextFieldSx}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1, flexWrap: 'wrap', bgcolor: '#fbfff9' }}>
          <Button onClick={() => setOpenDialog(false)} startIcon={<Close />} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <DoneAll />}
            sx={{
              ...pillButtonSx,
              bgcolor: GREEN_UI.green,
              '&:hover': { bgcolor: GREEN_UI.greenDark },
            }}
          >
            {saving ? 'Submitting…' : 'Submit Request'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={viewDialog}
        onClose={() => setViewDialog(false)}
        maxWidth="sm"
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
              <Description sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Request Details — {selectedReq?.requestId}
              </Typography>
            </Box>
            {selectedReq && (
              <Chip
                label={STATUS_CHIP[selectedReq.status]?.label ?? selectedReq.status}
                size="small"
                variant="outlined"
                sx={requestStatusChipSx(selectedReq.status)}
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: { xs: 2, sm: 3 }, bgcolor: '#fbfff9' }}>
          {selectedReq && (
            <Box sx={{ pt: 0.5 }}>
              <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
                {([
                  ['Request ID', selectedReq.requestId],
                  ['Employee', selectedReq.employee],
                  ['Employee ID', selectedReq.employeeId],
                  ['Type', selectedReq.type],
                  ['Leave Type', selectedReq.type === 'Leave' ? selectedReq.leaveType || '—' : 'N/A'],
                  ['Date Coverage', `${formatDate(selectedReq.startDate)}${selectedReq.endDate && selectedReq.endDate !== selectedReq.startDate ? ` – ${formatDate(selectedReq.endDate)}` : ''}`],
                  ['Time Coverage', selectedReq.type === 'Leave' ? 'N/A' : `${formatTime(selectedReq.startTime)} – ${formatTime(selectedReq.endTime)}`],
                  ['Total', selectedReq.type === 'Leave' ? `${selectedReq.totalDays ?? 0} day(s)` : `${selectedReq.totalHours ?? 0} hour(s)`],
                  ['Reason', selectedReq.reason],
                  ['Submitted', formatDate(selectedReq.submittedDate)],
                ] as [string, any][]).map(([label, value], index, arr) => (
                  <Box
                    key={label}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 2,
                      py: 0.85,
                      borderBottom: index === arr.length - 1 ? 'none' : `1px solid ${GREEN_UI.border}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={600} textAlign="right" sx={{ color: GREEN_UI.text }}>{value}</Typography>
                  </Box>
                ))}
              </Paper>

              {selectedReq.supervisorName && (
                <Alert
                  severity="info"
                  sx={{ mt: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
                >
                  Supervisor Review: {selectedReq.supervisorStatus || 'Reviewed'} by {selectedReq.supervisorName}
                  {selectedReq.supervisorNote ? ` — ${selectedReq.supervisorNote}` : ''}
                </Alert>
              )}

              {selectedReq.hrName && (
                <Alert
                  severity="success"
                  sx={{ mt: 1, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
                >
                  HR Review: {selectedReq.hrStatus || 'Reviewed'} by {selectedReq.hrName}
                  {selectedReq.hrNote ? ` — ${selectedReq.hrNote}` : ''}
                </Alert>
              )}

              {((isSupervisor && selectedReq.status === 'Pending') || (isHR && selectedReq.status === 'Supervisor Approved')) && (
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="Note / Remarks (optional)"
                  value={noteInput}
                  onChange={event => setNoteInput(event.target.value)}
                  sx={{ mt: 2, ...softTextFieldSx }}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 1, gap: 1, flexWrap: 'wrap', bgcolor: '#fbfff9' }}>
          <Button onClick={() => setViewDialog(false)} startIcon={<Close />} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Close
          </Button>

          {isSupervisor && selectedReq?.status === 'Pending' && (
            <>
              <Button
                variant="outlined"
                startIcon={<CancelOutlined />}
                onClick={() => {
                  supervisorDisapprove(selectedReq.id);
                  setViewDialog(false);
                }}
                sx={{
                  ...pillButtonSx,
                  borderColor: '#efb8b8',
                  color: '#9c2f2f',
                  '&:hover': { borderColor: '#dc8f8f', bgcolor: '#fdeaea' },
                }}
              >
                Disapprove
              </Button>
              <Button
                variant="contained"
                startIcon={<TaskAlt />}
                onClick={() => {
                  supervisorApprove(selectedReq.id);
                  setViewDialog(false);
                }}
                sx={{
                  ...pillButtonSx,
                  bgcolor: GREEN_UI.green,
                  '&:hover': { bgcolor: GREEN_UI.greenDark },
                }}
              >
                Approve
              </Button>
            </>
          )}

          {isHR && selectedReq?.status === 'Supervisor Approved' && (
            <>
              <Button
                variant="outlined"
                startIcon={<CancelOutlined />}
                onClick={() => {
                  hrReject(selectedReq.id);
                  setViewDialog(false);
                }}
                sx={{
                  ...pillButtonSx,
                  borderColor: '#efb8b8',
                  color: '#9c2f2f',
                  '&:hover': { borderColor: '#dc8f8f', bgcolor: '#fdeaea' },
                }}
              >
                Reject
              </Button>
              <Button
                variant="contained"
                startIcon={<Security />}
                onClick={() => {
                  hrApprove(selectedReq.id);
                  setViewDialog(false);
                }}
                sx={{
                  ...pillButtonSx,
                  bgcolor: GREEN_UI.green,
                  '&:hover': { bgcolor: GREEN_UI.greenDark },
                }}
              >
                Validate & Approve
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar(previous => ({ ...previous, open: false }))}
      />
    </Box>
  );
}
