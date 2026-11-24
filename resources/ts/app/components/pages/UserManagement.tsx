import { useState, useEffect } from 'react';
import ProfilePhotoAvatar from '../ProfilePhotoAvatar';
import { useProfilePhotoDirectory } from '../../lib/useProfilePhotoDirectory';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid,
  CircularProgress, Alert, Tooltip, IconButton, InputAdornment,
  Divider, Stack,
} from '../bootstrap';
import {
  AddCircleOutline, Sync, EditNote, Visibility, VisibilityOff, Password, DeleteOutline,
  AdminPanelSettings, Badge, ManageSearch, CheckCircleOutline, HighlightOff, HourglassEmpty,
} from '../bootstrap/icons';
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from '../../context/AuthContext';
import { NO_OUTLET, OUTLETS } from '../../lib/constants';
import { useJobTitleOptions } from '../../lib/useJobTitleOptions';
import ActionSnackbar from '../ActionSnackbar';

type UserRole = 'hr' | 'employee' | 'supervisor' | 'gm' | 'accounting';

interface UserAccount {
  id: string; // this will be USR-2026-0001
  name: string;
  email: string;
  role: UserRole;
  employeeId?: string; // EMP-2026-0001
  applicantId?: string; // APP-2026-0001
  outlet?: string;
  hasLogin: boolean;
  active?: boolean;
  createdAt?: string;
}

interface EmployeeOption {
  employeeId: string;
  name: string;
  outlet: string;
  position: string;
}

interface EmployeeAccountRequest {
  id: string;
  employee_id: string;
  full_name: string;
  submitted_full_name?: string | null;
  requested_outlet?: string | null;
  requested_position?: string | null;
  email: string;
  created_at: string;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  role: 'employee' as UserRole,
  position: '',
  employeeId: '',
  outlet: '',
  password: '',
};
const EMPTY_PASSWORD_FORM = { password: '', confirmation: '', showPassword: false, showConfirmation: false };
const ACCOUNT_FIELDS = 'user_id,full_name,email,role,employee_id,applicant_id,outlet,is_active,created_at,auth_user_id';

/** Role dropdown options — values must match UserRole */
const ROLES: { value: UserRole; label: string }[] = [
  { value: 'hr',         label: 'HR Personnel / Admin' },
  { value: 'employee',   label: 'Employee' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'gm',         label: 'General Manager' },
  { value: 'accounting', label: 'Accounting & Finance' },
];

const normalizeUserRole = (role?: string | null): UserRole => {
  const normalized = String(role ?? '').trim().toLowerCase();
  if (normalized === 'hr_admin' || normalized.includes('hr')) return 'hr';
  if (normalized === 'general_manager' || normalized === 'general manager' || normalized === 'gm') return 'gm';
  if (normalized === 'accounting_finance' || normalized.includes('accounting')) return 'accounting';
  if (normalized.includes('supervisor')) return 'supervisor';
  return 'employee';
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
  borderRadius: "12px",
  textTransform: 'none',
  fontWeight: 600,
  px: 2,
};

const softTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#fbfef9',
    transition: 'all 180ms ease',
    '& fieldset': { borderColor: GREEN_UI.border },
    '&:hover fieldset': { borderColor: GREEN_UI.borderStrong },
    '&.Mui-focused fieldset': { borderColor: GREEN_UI.green, borderWidth: 1.5 },
    '&.Mui-disabled': { backgroundColor: '#f6fbf4' },
  },
  '& .MuiInputLabel-root': { color: GREEN_UI.muted },
  '& .MuiInputLabel-root.Mui-focused': { color: GREEN_UI.greenDark },
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: GREEN_UI.text },
};

const roleChipSx = (role: UserRole | string) => {
  const normalizedRole = normalizeUserRole(role);
  const styles: Record<UserRole, { bg: string; color: string; border: string }> = {
    hr: { bg: '#e5f8e9', color: '#1f7a46', border: '#8ed7a2' },
    employee: { bg: '#f4f1ff', color: '#5b3aa4', border: '#d7c8ff' },
    supervisor: { bg: '#eaf6ff', color: '#1d6f9c', border: '#9bd2f1' },
    gm: { bg: '#fff7e0', color: '#9b6b00', border: '#efc45f' },
    accounting: { bg: '#fff0f5', color: '#a03464', border: '#f2b7cc' },
  };

  const selected = styles[normalizedRole] ?? styles.employee;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.3 },
  };
};

const activeChipSx = (active?: boolean) => ({
  bgcolor: active === false ? '#f2f4f1' : '#e5f8e9',
  color: active === false ? '#6f786f' : '#217a43',
  borderColor: active === false ? '#dce2d9' : '#a9dfb6',
  fontWeight: 700,
  '& .MuiChip-label': { px: 1.35 },
});

const getNextEmployeeId = (ids: string[]) => {
  const numbers = ids
    .map((id) => {
      const match = id.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));

  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;

  return `EMP${String(next).padStart(3, "0")}`;
};

export default function UserManagement() {
  const { user: signedInUser } = useAuth();
  const [users, setUsers]           = useState<UserAccount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [openAdd, setOpenAdd]       = useState(false);
  const [openEdit, setOpenEdit]     = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [editForm, setEditForm]     = useState<Partial<UserAccount>>({});
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const jobTitleOptions = useJobTitleOptions();
  const [employeeAccountRequests, setEmployeeAccountRequests] = useState<EmployeeAccountRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [openRequestsDialog, setOpenRequestsDialog] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [showPwd, setShowPwd]       = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [snackbar, setSnackbar]     = useState({
    open: false, message: '', severity: 'success' as 'success' | 'error' | 'warning',
  });
  // Tracks whether we're computing the next EMP ID before opening the dialog
  const [empIdLoading, setEmpIdLoading] = useState(false);
  const isHrAdminRole = (role?: string | null) => ['hr', 'hr_admin', 'admin'].includes(String(role ?? '').trim().toLowerCase());
  const activeHrAdminCount = users.filter(account => account.active !== false && isHrAdminRole(account.role)).length;
  const cannotRemoveLastHrAdmin = (account: UserAccount, nextRole = account.role, nextActive = account.active !== false) =>
    account.active !== false && isHrAdminRole(account.role)
      && (!isHrAdminRole(nextRole) || !nextActive)
      && activeHrAdminCount <= 1;

  /* ── Data fetching ───────────────────────────────────────────────────��� */
  const fetchUsers = async () => {
  setLoading(true);
  setError(null);

  try {
    const { data, error } = await supabase
      .from("user_accounts")
      .select(ACCOUNT_FIELDS)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const mappedUsers: UserAccount[] = (data ?? []).map((u: any) => ({
  id: u.user_id ?? "",
  name: u.full_name ?? "",
  email: u.email ?? "",
  hasLogin: Boolean(u.auth_user_id),
  role: u.role ?? "employee",
  employeeId: u.employee_id ?? "",
  applicantId: u.applicant_id ?? "",
  outlet: u.outlet ?? "",
  active: u.is_active ?? true,
  createdAt: u.created_at ?? "",
}));

    setUsers(mappedUsers);
  } catch (e: any) {
    setError(`Could not load user accounts: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => { fetchUsers(); }, []);

  const fetchEmployeeAccountRequests = async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    let { data, error } = await supabase.from('employee_account_requests')
      .select('id,employee_id,full_name,submitted_full_name,requested_outlet,requested_position,email,created_at').eq('status', 'Pending')
      .order('created_at', { ascending: true });
    if (error && /submitted_full_name|requested_outlet|requested_position/i.test(error.message)) {
      const legacyResult = await supabase.from('employee_account_requests')
        .select('id,employee_id,full_name,email,created_at').eq('status', 'Pending')
        .order('created_at', { ascending: true });
      data = (legacyResult.data ?? []).map(row => ({ ...row, submitted_full_name: null, requested_outlet: null, requested_position: null }));
      error = legacyResult.error;
    }
    if (error) {
      setRequestsError(`Could not load employee registrations: ${error.message}`);
      setEmployeeAccountRequests([]);
    } else {
      setEmployeeAccountRequests((data ?? []) as EmployeeAccountRequest[]);
    }
    setRequestsLoading(false);
  };

  useEffect(() => { void fetchEmployeeAccountRequests(); }, []);

  const reviewEmployeeAccountRequest = async (request: EmployeeAccountRequest, action: 'approve' | 'reject') => {
    if (reviewingRequestId) return;
    setReviewingRequestId(request.id);
    try {
      let { data, error } = await supabase.rpc(action === 'approve'
        ? 'approve_employee_account_request'
        : 'reject_employee_account_request', { p_request_id: request.id });
      if (error && action === 'approve') {
        const approvalError = error;
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (sessionError || !accessToken) throw new Error('Your HR session expired. Sign in again and retry.');

        const response = await fetch('/api/admin/user-accounts', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: 'approve_employee_account_request', request_id: request.id }),
        });
        const fallbackData = await response.json().catch(() => null);
        if (fallbackData?.code === 'employee_account_not_created') throw approvalError;
        if (!response.ok) throw new Error(fallbackData?.message || error.message || 'Could not approve the registration.');
        data = fallbackData;
        error = null;
      }
      if (error) throw error;
      if (action === 'approve' && data?.approved !== true) throw new Error('HR approval was not confirmed.');
      if (action === 'reject' && data?.rejected !== true) throw new Error('Request rejection was not confirmed.');
      setEmployeeAccountRequests(current => current.filter(item => item.id !== request.id));
      if (action === 'approve') await fetchUsers();
      setSnackbar({ open: true, message: action === 'approve'
        ? data?.employee_created
          ? `Employee record created and account activated for ${request.employee_id}.`
          : `Account approved and activated for ${request.employee_id}.`
        : `Registration request for ${request.employee_id} was rejected.`, severity: 'success' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message
        : cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string'
          ? cause.message
          : 'Could not review the registration.';
      setSnackbar({ open: true, message, severity: 'error' });
      await fetchEmployeeAccountRequests();
    } finally {
      setReviewingRequestId(null);
    }
  };

  const fetchEmployeeOptions = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, outlet, position")
      .order("first_name", { ascending: true });

    if (error) {
      console.warn("Could not load employee outlet options:", error.message);
      return;
    }

    setEmployeeOptions((data ?? []).map((employee: any) => ({
      employeeId: employee.employee_id ?? "",
      name: `${employee.first_name ?? ""} ${employee.middle_name ?? ""} ${employee.last_name ?? ""} ${employee.suffix ?? ""}`
        .replace(/\s+/g, " ")
        .trim(),
      outlet: employee.outlet ?? "",
      position: employee.position ?? "",
    })).filter(employee => employee.employeeId));
  };

  useEffect(() => { fetchEmployeeOptions(); }, []);

  const getEmployeeOption = (employeeId?: string) =>
    employeeOptions.find(employee => employee.employeeId === employeeId);

  useEffect(() => {
    if (!openEdit || !editForm.employeeId) return;

    const linkedEmployee = getEmployeeOption(editForm.employeeId);
    if (linkedEmployee?.outlet && editForm.outlet !== linkedEmployee.outlet) {
      setEditForm(prev => ({ ...prev, outlet: linkedEmployee.outlet }));
    }
  }, [openEdit, editForm.employeeId, editForm.outlet, employeeOptions]);

  /** Fetch all existing employee IDs (from /employees + already-loaded users),
   *  compute the next sequential EMP ID, then open the Create dialog. */
  const openCreateDialog = async () => {
  setEmpIdLoading(true);

  try {
    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("employee_id");

    if (employeesError) throw employeesError;

    const existingEmployeeIds = (employeesData ?? [])
      .map((e: any) => e.employee_id)
      .filter(Boolean);

    const nextEmployeeId = getNextEmployeeId(existingEmployeeIds);

    setForm({
      ...EMPTY_FORM,
      employeeId: nextEmployeeId,
    });

    setOpenAdd(true);
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Failed to generate employee ID: ${e.message}`,
      severity: "error",
    });
  } finally {
    setEmpIdLoading(false);
  }
};

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleCreate = async () => {
  if (!form.name || !form.email || !form.password || (form.role === 'employee' && !form.position)) {
    setSnackbar({
      open: true,
      message: form.role === 'employee' && !form.position
        ? "Select a position for the employee account."
        : "Name, email, and initial password are required.",
      severity: "error",
    });
    return;
  }

  setSaving(true);

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error("Your admin session has expired. Please sign in again.");

    const response = await fetch('/api/admin/user-accounts', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        employee_id: form.role === 'employee' ? form.employeeId : null,
        position: form.role === 'employee' ? form.position : null,
        outlet: form.outlet === NO_OUTLET ? '' : form.outlet,
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages = result?.errors
        ? Object.values(result.errors).flat().join(' ')
        : result?.message;
      throw new Error(messages || 'Account could not be created.');
    }

    const userData = result.user;
    if (typeof userData?.user_id !== 'string' || !userData.user_id) {
      throw new Error('The server did not confirm account creation. Refresh User Accounts before retrying.');
    }

    const newUser: UserAccount = {
      id: userData.user_id,
      name: userData.full_name,
      email: userData.email,
      hasLogin: true,
      role: userData.role,
      employeeId: userData.employee_id,
      applicantId: userData.applicant_id,
      outlet: userData.outlet,
      active: userData.is_active,
      createdAt: userData.created_at,
    };

    await fetchEmployeeOptions();
    setUsers((prev) => [...prev, newUser]);

    setOpenAdd(false);
    setForm(EMPTY_FORM);

    const welcomeEmailSent = result.welcome_email_sent === true;
    const emailReference = typeof result.welcome_email_id === 'string' ? result.welcome_email_id : '';
    setSnackbar({
      open: true,
      message: welcomeEmailSent
        ? `Account created. Resend accepted the welcome email. Delivery is pending.${emailReference ? ` Resend ID: ${emailReference}` : ''}`
        : 'Account created. The welcome email could not be sent. Contact the new user with sign-in instructions.',
      severity: welcomeEmailSent ? "success" : "warning",
    });
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Failed: ${e.message}`,
      severity: "error",
    });
  } finally {
    setSaving(false);
  }
};

  const handleEdit = async () => {
  if (!selectedUser) return;

  const nextRole = editForm.role ?? selectedUser.role;
  const nextActive = editForm.active ?? selectedUser.active ?? true;
  if (selectedUser.id === signedInUser?.id && isHrAdminRole(selectedUser.role)
    && (!isHrAdminRole(nextRole) || !nextActive)) {
    setSnackbar({ open: true, message: 'You cannot remove your own active HR Admin access. Ask another HR Admin to make this change.', severity: 'error' });
    return;
  }
  if (cannotRemoveLastHrAdmin(selectedUser, nextRole, nextActive)) {
    setSnackbar({ open: true, message: 'At least one active HR Admin account must remain. Activate another HR Admin account first.', severity: 'error' });
    return;
  }

  if (selectedUser.hasLogin && String(editForm.email ?? '').trim().toLowerCase() !== selectedUser.email.trim().toLowerCase()) {
    setSnackbar({
      open: true,
      message: 'This account email is linked to its sign-in login. Change it through the authentication account workflow so both records stay in sync.',
      severity: 'error',
    });
    return;
  }

  setSaving(true);

  try {
    const linkedEmployee = getEmployeeOption(editForm.employeeId);
    const employeeOutlet = linkedEmployee?.outlet || (editForm.outlet === NO_OUTLET ? "" : editForm.outlet || "");

    const updateData: any = {
      full_name: editForm.name,
      email: editForm.email,
      role: editForm.role,
      outlet: employeeOutlet,
      employee_id: editForm.employeeId,
      is_active: editForm.active ?? selectedUser.active ?? true,
    };

    let result = await supabase
      .from("user_accounts")
      .update(updateData)
      .eq("user_id", selectedUser.id)
      .select(ACCOUNT_FIELDS)
      .maybeSingle();

    if (!result.data) {
      result = await supabase
        .from("user_accounts")
        .update(updateData)
        .eq("email", selectedUser.email)
        .select(ACCOUNT_FIELDS)
        .maybeSingle();
    }

    if (result.error) throw result.error;
    if (!result.data) throw new Error("No matching user account found.");

    const data = result.data;

    const updatedUser: UserAccount = {
      id: data.user_id ?? "",
      name: data.full_name ?? "",
      email: data.email ?? "",
      hasLogin: Boolean(data.auth_user_id),
      role: data.role ?? "employee",
      employeeId: data.employee_id ?? "",
      applicantId: data.applicant_id ?? "",
      outlet: employeeOutlet || data.outlet || "",
      active: data.is_active ?? true,
      createdAt: data.created_at ?? "",
    };

    setUsers(prev =>
      prev.map(u => u.id === selectedUser.id ? updatedUser : u)
    );

    setOpenEdit(false);
    setPasswordForm(EMPTY_PASSWORD_FORM);

    setSnackbar({
      open: true,
      message: "Account updated.",
      severity: "success",
    });
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Failed: ${e.message}`,
      severity: "error",
    });
  } finally {
    setSaving(false);
  }
};

  const canUpdatePassword = Boolean(selectedUser?.hasLogin && selectedUser.active !== false);
  const passwordsMatch = Boolean(passwordForm.confirmation) && passwordForm.password === passwordForm.confirmation;
  const passwordValid = passwordsMatch && passwordForm.password.trim().length > 0
    && passwordForm.password.length >= 8 && new TextEncoder().encode(passwordForm.password).length <= 72;

  const closeEdit = () => {
    setOpenEdit(false);
    setPasswordForm(EMPTY_PASSWORD_FORM);
  };

  const handleUpdatePassword = async () => {
    if (!selectedUser || !canUpdatePassword || !passwordValid || updatingPassword || saving) return;
    setUpdatingPassword(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session) throw new Error('Sign in again to update the password.');
      const response = await fetch('/api/admin/user-accounts', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ action: 'update_account_password', user_id: selectedUser.id, password: passwordForm.password }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.password_updated !== true) {
        throw new Error(result?.message || 'Could not update the account password.');
      }
      setPasswordForm(EMPTY_PASSWORD_FORM);
      setSnackbar({ open: true, message: result.message, severity: result.password_email_sent ? 'success' : 'warning' });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : 'Could not update the account password.', severity: 'error' });
    } finally {
      setUpdatingPassword(false);
    }
  };

  /** Toggle active/inactive — works from both the table and the Edit dialog */
  const handleToggleActive = async (user: UserAccount) => {
  const newActive = user.active === false;

  if (!newActive && user.id === signedInUser?.id && isHrAdminRole(user.role)) {
    setSnackbar({ open: true, message: 'You cannot deactivate your own active HR Admin account. Ask another HR Admin to make this change.', severity: 'error' });
    return;
  }
  if (cannotRemoveLastHrAdmin(user, user.role, newActive)) {
    setSnackbar({ open: true, message: 'At least one active HR Admin account must remain. Activate another HR Admin account first.', severity: 'error' });
    return;
  }

  try {
    const { error } = await supabase
      .from("user_accounts")
      .update({
          is_active: newActive,
        })
      .eq("user_id", user.id);

    if (error) throw error;

    setUsers(prev =>
      prev.map(u =>
        u.id === user.id
          ? {
              ...u,
              active: newActive,
            }
          : u
      )
    );

    setSelectedUser(prev =>
      prev?.id === user.id
        ? {
            ...prev,
            active: newActive,
          }
        : prev
    );

    setEditForm(prev => ({
      ...prev,
      active: newActive,
    }));

    setSnackbar({
      open: true,
      message: `Account ${newActive ? "activated" : "deactivated"} successfully!`,
      severity: "success",
    });
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Failed: ${e.message}`,
      severity: "error",
    });
  }
};

  const handleDelete = async (u: UserAccount) => {
  if (u.id === signedInUser?.id && isHrAdminRole(u.role)) {
    setSnackbar({ open: true, message: 'You cannot delete your own active HR Admin account.', severity: 'error' });
    return;
  }
  if (cannotRemoveLastHrAdmin(u, u.role, false)) {
    setSnackbar({ open: true, message: 'At least one active HR Admin account must remain. Activate another HR Admin account first.', severity: 'error' });
    return;
  }
  if (!window.confirm(`Permanently delete account for ${u.name} (${u.id})? This cannot be undone.`)) return;

  try {
    const { error } = await supabase
      .from("user_accounts")
      .delete()
      .eq("user_id", u.id);

    if (error) throw error;

    setUsers(prev => prev.filter(x => x.id !== u.id));

    setSnackbar({
      open: true,
      message: `🗑️ Account for ${u.name} deleted.`,
      severity: "success",
    });
  } catch (e: any) {
    setSnackbar({
      open: true,
      message: `Failed: ${e.message}`,
      severity: "error",
    });
  }
};

  /* ── Render ─────────────────────────────────────────────────────────── */
  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.active !== false).length;
  const inactiveUsers = users.filter(u => u.active === false).length;
  const employeeUsers = users.filter(u => u.role === 'employee').length;
  const searchQuery = search.trim().toLowerCase();
  const filteredUsers = searchQuery
    ? users.filter(u =>
        [
          u.id,
          u.name,
          u.email,
          u.role,
          u.employeeId,
          u.applicantId,
          u.outlet,
          ROLES.find(r => r.value === normalizeUserRole(u.role))?.label,
        ].some(value => String(value ?? '').toLowerCase().includes(searchQuery))
      )
    : users;
  const employeePhotos = useProfilePhotoDirectory('employee', filteredUsers.map(account => account.employeeId));

  const summaryCards = [
    { label: 'Total Accounts', value: totalUsers, icon: <AdminPanelSettings fontSize="small" /> },
    { label: 'Active Accounts', value: activeUsers, icon: <Visibility fontSize="small" /> },
    { label: 'Inactive Accounts', value: inactiveUsers, icon: <VisibilityOff fontSize="small" /> },
    { label: 'Employee Users', value: employeeUsers, icon: <Badge fontSize="small" /> },
  ];

  const renderDialogSectionTitle = (title: string) => (
    <Grid size={12}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, mb: 0.5 }}>
        <Box
          sx={{
            width: 34,
            height: 6,
            background: `linear-gradient(90deg, ${GREEN_UI.green}, rgba(58, 168, 101, 0.08))`,
          }}
        />
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ color: GREEN_UI.greenDark, letterSpacing: 0.4, textTransform: 'uppercase' }}
        >
          {title}
        </Typography>
      </Box>
      <Divider sx={{ borderColor: GREEN_UI.border, mb: 1 }} />
    </Grid>
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
          <Box sx={{ maxWidth: 720 }}>
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
              User Account Management
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
            <Tooltip title="Refresh accounts">
              <span style={{ width: 'inherit' }}>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={() => { void fetchUsers(); void fetchEmployeeAccountRequests(); }}
                  disabled={loading || requestsLoading}
                  sx={{
                    ...pillButtonSx,
                    py: 1.1,
                    width: { xs: '100%', sm: 'auto' },
                    borderColor: GREEN_UI.borderStrong,
                    bgcolor: GREEN_UI.green,
                    '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                  }}
                >
                  {loading ? 'Refreshing…' : 'Refresh'}
                </Button>
              </span>
            </Tooltip>

            <Button
              variant="contained"
              startIcon={empIdLoading ? <CircularProgress size={16} color="inherit" /> : <AddCircleOutline />}
              onClick={openCreateDialog}
              disabled={empIdLoading}
              sx={{
                ...pillButtonSx,
                py: 1.1,
                width: { xs: '100%', sm: 'auto' },
                bgcolor: GREEN_UI.green,
                boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
                '&:hover': { bgcolor: GREEN_UI.greenDark, boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
              }}
            >
              {empIdLoading ? 'Preparing…' : 'Create Account'}
            </Button>

            <Button
              variant="outlined"
              startIcon={requestsLoading ? <CircularProgress size={16} /> : <HourglassEmpty />}
              onClick={() => {
                setOpenRequestsDialog(true);
                void fetchEmployeeAccountRequests();
              }}
              sx={{
                ...pillButtonSx,
                py: 1.1,
                width: { xs: '100%', sm: 'auto' },
                borderColor: GREEN_UI.borderStrong,
                color: GREEN_UI.greenDark,
                bgcolor: '#ffffff',
                '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
              }}
            >
              {requestsLoading ? 'Pending' : `Pending (${employeeAccountRequests.length})`}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {summaryCards.map(stat => (
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
            </Paper>
          </Grid>
        ))}
      </Grid>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={fetchUsers} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Search user accounts..."
          inputProps={{ 'aria-label': 'Search user accounts' }}
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
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading accounts…</Typography>
          </Box>
        ) : (
          <Table sx={{ minWidth: 900, '& th, & td': { borderColor: 'rgba(139, 184, 144, 0.16)' } }}>
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
                <TableCell sx={{ whiteSpace: 'nowrap' }}>User ID</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Account Name</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Email / Username</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Role</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Position</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 180 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 || filteredUsers.length === 0 ? (
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
                        <AdminPanelSettings />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {users.length === 0 ? 'No user accounts yet' : 'No user accounts match your search'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        {users.length === 0
                          ? 'Create the first account to start assigning role-based system access.'
                          : 'Try another name, email, role, ID, or outlet keyword.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map(u => (
                  <TableRow
                    key={u.id}
                    hover
                    sx={{
                      opacity: u.active === false ? 0.64 : 1,
                      transition: 'background 160ms ease',
                      '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                      '& td': { py: 1.55, color: GREEN_UI.text },
                    }}
                  >
                    <TableCell>
                      <Chip
                        label={u.id || '—'}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 600, bgcolor: '#f8fcf5', borderColor: GREEN_UI.border }}
                      />
                    </TableCell>

                    <TableCell sx={{ minWidth: 230 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                        <ProfilePhotoAvatar photo={u.employeeId ? employeePhotos.get(u.employeeId) : undefined} name={u.name}
                          sx={{ width: 38, height: 38, borderRadius: '16px', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark, fontWeight: 700, fontSize: '0.9rem' }} />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={600} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }} noWrap>
                            {u.name || 'Unnamed Account'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: GREEN_UI.muted }} noWrap>
                            {u.employeeId || 'No employee ID linked'}{u.outlet ? ` • ${u.outlet}` : ''}
                          </Typography>
                        </Box>
                      </Box>
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                        {u.email || '—'}
                      </Typography>
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip
                        label={ROLES.find(r => r.value === normalizeUserRole(u.role))?.label ?? u.role}
                        size="small"
                        variant="outlined"
                        sx={roleChipSx(u.role)}
                      />
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{getEmployeeOption(u.employeeId)?.position || '—'}</TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Chip
                        label={u.active === false ? 'Inactive' : 'Active'}
                        size="small"
                        variant="outlined"
                        sx={activeChipSx(u.active)}
                      />
                    </TableCell>

                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          label={u.active === false ? 'Activate' : 'Deactivate'}
                          className={u.active === false ? 'hris-chip-restore' : 'hris-chip-deactivate'}
                          size="small"
                          clickable
                          variant={u.active === false ? 'filled' : 'outlined'}
                          icon={u.active === false ? <Visibility /> : <VisibilityOff />}
                          onClick={() => handleToggleActive(u)}
                          sx={{
                            minWidth: 118,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: u.active === false ? GREEN_UI.greenDark : '#efd69a',
                            color: u.active === false ? '#ffffff' : '#8a6400',
                            bgcolor: u.active === false ? GREEN_UI.greenDark : '#fffaf0',
                            '&:hover': { bgcolor: u.active === false ? '#176339' : '#fff2d2' },
                            '&:focus-visible': { outline: `2px solid ${GREEN_UI.green}`, outlineOffset: 2 },
                            '& .MuiChip-icon': { color: u.active === false ? '#ffffff' : '#8a6400' },
                          }}
                        />

                        <Chip
                          label="Edit"
                          size="small"
                          clickable
                          variant="outlined"
                          icon={<EditNote />}
                          onClick={() => {
                            const linkedEmployee = getEmployeeOption(u.employeeId);
                            setSelectedUser(u);

                            setEditForm({
                              name: u.name,
                              email: u.email,
                              role: u.role,
                              outlet: linkedEmployee?.outlet || u.outlet || NO_OUTLET,
                              employeeId: u.employeeId,
                              applicantId: u.applicantId,
                              active: u.active,
                            });

                            setPasswordForm(EMPTY_PASSWORD_FORM);
                            setOpenEdit(true);
                          }}
                          sx={{
                            minWidth: 76,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: GREEN_UI.borderStrong,
                            color: GREEN_UI.greenDark,
                            bgcolor: '#ffffff',
                            '&:hover': { bgcolor: GREEN_UI.greenSoft },
                            '& .MuiChip-icon': { color: GREEN_UI.greenDark },
                          }}
                        />

                        <Chip
                          label="Delete"
                          className="hris-chip-danger"
                          size="small"
                          clickable
                          variant="outlined"
                          icon={<DeleteOutline />}
                          onClick={() => handleDelete(u)}
                          sx={{
                            minWidth: 86,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: '#efb8b8',
                            color: '#9c2f2f',
                            bgcolor: '#fffafa',
                            '&:hover': { bgcolor: '#fdeaea' },
                            '& .MuiChip-icon': { color: '#9c2f2f' },
                          }}
                        />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {/* ── Employee Registration Requests Dialog ────────────────────── */}
      <Dialog
        open={openRequestsDialog}
        onClose={() => setOpenRequestsDialog(false)}
        maxWidth="md"
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
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
              Employee self-registration requests
            </Typography>
            <Chip
              icon={<HourglassEmpty />}
              label={`${employeeAccountRequests.length} pending`}
              variant="outlined"
              sx={{ fontWeight: 700, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
            />
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9', maxHeight: '70vh' }}>
          {requestsError ? <Alert severity="warning" sx={{ mb: employeeAccountRequests.length ? 1.5 : 0 }}>{requestsError}</Alert> : null}
          {requestsLoading ? <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={24} sx={{ color: GREEN_UI.green }} /></Box>
            : employeeAccountRequests.length === 0 ? <Typography variant="body2" sx={{ color: GREEN_UI.muted, py: 1 }}>No employee registrations are waiting for review.</Typography>
            : <Stack spacing={1}>
              {employeeAccountRequests.map(request => (
                <Box key={request.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', p: 1.5, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}`, bgcolor: '#ffffff' }}>
                  <Box sx={{ minWidth: 220, flex: '1 1 300px' }}>
                    <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>{request.submitted_full_name || request.full_name || 'Employee'}</Typography>
                    <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                      Employee ID: {request.employee_id}{request.requested_position ? ` · Position: ${request.requested_position}` : ''}{request.requested_outlet ? ` · Assigned outlet: ${request.requested_outlet}` : ''}
                    </Typography>
                    <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>{request.email} · Submitted {new Date(request.created_at).toLocaleDateString()}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="outlined" color="error" startIcon={<HighlightOff />} disabled={Boolean(reviewingRequestId)} onClick={() => void reviewEmployeeAccountRequest(request, 'reject')}>Reject</Button>
                    <Button size="small" variant="contained" startIcon={reviewingRequestId === request.id ? <CircularProgress size={15} color="inherit" /> : <CheckCircleOutline />} disabled={Boolean(reviewingRequestId)} onClick={() => void reviewEmployeeAccountRequest(request, 'approve')}>Approve and activate</Button>
                  </Box>
                </Box>
              ))}
            </Stack>}
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, bgcolor: '#ffffff', borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button onClick={() => setOpenRequestsDialog(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Create Account Dialog ─────────────────────────────────────── */}
      <Dialog
        open={openAdd}
        onClose={() => setOpenAdd(false)}
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
          <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
            Create New User Account
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            {renderDialogSectionTitle('I. ACCOUNT DETAILS')}
            <Grid size={12}>
              <TextField
                fullWidth
                required
                label="Full Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                sx={softTextFieldSx}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                required
                label="Email / Username"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                sx={softTextFieldSx}
              />
            </Grid>

            {renderDialogSectionTitle('II. ROLE ACCESS')}
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                select
                label="Role"
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
              </TextField>
            </Grid>
            {form.role === 'employee' && (
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  required
                  select
                  label="Position"
                  value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                >
                  <MenuItem value="">Select Position…</MenuItem>
                  {jobTitleOptions.map(position => <MenuItem key={position} value={position}>{position}</MenuItem>)}
                </TextField>
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                select
                label="Outlet / Branch"
                value={form.outlet}
                onChange={e => setForm({ ...form, outlet: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem key="outlet-empty" value="">Select Outlet…</MenuItem>
                <MenuItem value={NO_OUTLET}>No Outlet</MenuItem>
                {OUTLETS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            </Grid>

            {renderDialogSectionTitle('III. LOGIN CREDENTIALS')}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Linked Employee ID"
                value={form.role === 'employee' ? form.employeeId : ''}
                disabled
                InputProps={{
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <Badge fontSize="small" sx={{ color: GREEN_UI.greenDark }} />
                    </InputAdornment>
                  ),
                }}
                sx={{
                  ...softTextFieldSx,
                  '& .MuiInputBase-input.Mui-disabled': {
                    WebkitTextFillColor: GREEN_UI.text,
                    fontWeight: 600,
                  },
                }}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                required
                label="Password"
                type={showPwd ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                sx={softTextFieldSx}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPwd(s => !s)}>
                        {showPwd ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </Grid>
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
          <Button
            onClick={() => setOpenAdd(false)}
            sx={{ ...pillButtonSx, color: GREEN_UI.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AddCircleOutline />}
            sx={{
              ...pillButtonSx,
              bgcolor: GREEN_UI.green,
              boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
              '&:hover': { bgcolor: GREEN_UI.greenDark },
            }}
          >
            {saving ? 'Creating…' : 'Create Account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Edit Account Dialog (includes Reset Password) ─────────────── */}
      <Dialog
        open={openEdit}
        onClose={saving || updatingPassword ? undefined : closeEdit}
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
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Edit Account
              </Typography>
              <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5, fontWeight: 500 }}>
                {selectedUser?.name || 'Selected user'}
              </Typography>
            </Box>
            {selectedUser && (
              <Chip
                label={selectedUser.active === false ? 'Inactive' : 'Active'}
                size="small"
                variant="outlined"
                sx={activeChipSx(selectedUser.active)}
              />
            )}
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            {renderDialogSectionTitle('I. ACCOUNT DETAILS')}
            <Grid size={12}>
              <TextField
                fullWidth
                label="Full Name"
                value={editForm.name ?? ''}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                sx={softTextFieldSx}
              />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Email / Username"
                value={editForm.email ?? ''}
                disabled={Boolean(selectedUser?.hasLogin)}
                helperText={selectedUser?.hasLogin ? 'This sign-in email is linked to Supabase Auth and cannot be changed here.' : undefined}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                sx={softTextFieldSx}
              />
            </Grid>

            {renderDialogSectionTitle('II. ROLE ACCESS')}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Role"
                value={editForm.role ?? 'employee'}
                onChange={e => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Outlet / Branch"
                value={editForm.outlet ?? ''}
                disabled={Boolean(getEmployeeOption(editForm.employeeId)?.outlet)}
                onChange={e => setEditForm({ ...editForm, outlet: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem key="edit-outlet-empty" value="">Select Outlet…</MenuItem>
                <MenuItem value={NO_OUTLET}>No Outlet</MenuItem>
                {OUTLETS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Linked Employee ID"
                value={editForm.employeeId ?? ''}
                onChange={e => {
                  const employeeId = e.target.value;
                  const linkedEmployee = getEmployeeOption(employeeId);
                  setEditForm({
                    ...editForm,
                    employeeId,
                    outlet: linkedEmployee?.outlet || editForm.outlet || '',
                  });
                }}
                sx={softTextFieldSx}
              />
            </Grid>

            {renderDialogSectionTitle('III. RESET PASSWORD')}
            {canUpdatePassword ? (
              <>
                {([
                  { field: 'password', visible: 'showPassword', label: 'New Password' },
                  { field: 'confirmation', visible: 'showConfirmation', label: 'Confirm New Password' },
                ] as const).map(({ field, visible, label }) => (
                  <Grid key={field} size={12}>
                    <TextField fullWidth label={label} autoComplete="new-password"
                      type={passwordForm[visible] ? 'text' : 'password'} value={passwordForm[field]}
                      onChange={event => setPasswordForm(current => ({ ...current, [field]: event.target.value }))}
                      disabled={saving || updatingPassword}
                      error={field === 'confirmation' && Boolean(passwordForm.confirmation) && !passwordsMatch}
                      helperText={field === 'password' ? 'Use at least 8 characters.' : (passwordForm.confirmation && (passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'))}
                      InputLabelProps={{ shrink: true }} sx={softTextFieldSx}
                      InputProps={{ endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" aria-label={`${passwordForm[visible] ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                            onClick={() => setPasswordForm(current => ({ ...current, [visible]: !current[visible] }))}>
                            {passwordForm[visible] ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ) }} />
                  </Grid>
                ))}
                <Grid size={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="outlined" onClick={handleUpdatePassword} disabled={!passwordValid || saving || updatingPassword} sx={pillButtonSx}>
                    {updatingPassword ? 'Updating…' : 'Update Password'}
                  </Button>
                </Grid>
              </>
            ) : <Grid size={12}><Alert severity="info">An active, linked login is required to update the password.</Alert></Grid>}

            {renderDialogSectionTitle('IV. ACCOUNT STATUS')}
            <Grid size={12}>
              <Paper elevation={0} sx={{ p: 2, ...innerCardSx }}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' },
                  }}
                >
                  <Box>
                    <Chip
                      label={selectedUser?.active === false ? 'Inactive' : 'Active'}
                      size="small"
                      variant="outlined"
                      sx={activeChipSx(selectedUser?.active)}
                    />
                    <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 1 }}>
                      {selectedUser?.active === false
                        ? 'This account is currently disabled.'
                        : 'This account is currently enabled.'}
                    </Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color={selectedUser?.active === false ? 'success' : 'warning'}
                    disabled={updatingPassword || saving}
                    onClick={() => selectedUser && handleToggleActive(selectedUser)}
                    sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong }}
                  >
                    {selectedUser?.active === false ? 'Activate Account' : 'Deactivate Account'}
                  </Button>
                </Box>
              </Paper>
            </Grid>
          </Grid>
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
          <Button
            onClick={closeEdit}
            disabled={saving || updatingPassword}
            sx={{ ...pillButtonSx, color: GREEN_UI.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEdit}
            disabled={saving || updatingPassword}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Password />}
            sx={{
              ...pillButtonSx,
              bgcolor: GREEN_UI.green,
              boxShadow: '0 12px 24px rgba(58, 168, 101, 0.25)',
              '&:hover': { bgcolor: GREEN_UI.greenDark },
            }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
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
