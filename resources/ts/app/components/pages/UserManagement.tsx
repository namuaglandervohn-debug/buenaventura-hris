import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid,
  CircularProgress, Alert, Tooltip, IconButton, InputAdornment,
  Divider,
} from '@mui/material';
import {
  AddCircleOutline, Sync, EditNote, Visibility, VisibilityOff, Password, DeleteOutline,
  AdminPanelSettings, Badge, ManageSearch,
} from '@mui/icons-material';
import { supabase } from "../../lib/supabaseClient";
import { OUTLETS } from '../../lib/constants';
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
  password?: string;
  active?: boolean;
  createdAt?: string;
}

interface EmployeeOption {
  employeeId: string;
  name: string;
  outlet: string;
}

const EMPTY_FORM = {
  name: '',
  email: '',
  role: 'employee' as UserRole,
  employeeId: '',
  outlet: '',
  password: '',
};

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
    borderRadius: '16px',
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
  const [users, setUsers]           = useState<UserAccount[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [openAdd, setOpenAdd]       = useState(false);
  const [openEdit, setOpenEdit]     = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [editForm, setEditForm]     = useState<Partial<UserAccount>>({});
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [search, setSearch]         = useState('');
  const [newPwd, setNewPwd]         = useState('');
  const [showPwd, setShowPwd]       = useState(false);
  const [showEditPwd, setShowEditPwd] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [snackbar, setSnackbar]     = useState({
    open: false, message: '', severity: 'success' as 'success' | 'error',
  });
  // Tracks whether we're computing the next EMP ID before opening the dialog
  const [empIdLoading, setEmpIdLoading] = useState(false);

  /* ── Data fetching ───────────────────────────────────────────────────��� */
  const fetchUsers = async () => {
  setLoading(true);
  setError(null);

  try {
    const { data, error } = await supabase
      .from("user_accounts")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    const mappedUsers: UserAccount[] = (data ?? []).map((u: any) => ({
  id: u.user_id ?? "",
  name: u.full_name ?? "",
  email: u.email ?? "",
  password: u.password ?? "",
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

  const fetchEmployeeOptions = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, outlet")
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
  if (!form.name || !form.email || !form.password) {
    setSnackbar({
      open: true,
      message: "Name, email, and initial password are required.",
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
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        employee_id: form.employeeId,
        outlet: form.outlet,
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

    const newUser: UserAccount = {
      id: userData.user_id,
      name: userData.full_name,
      email: userData.email,
      password: "",
      role: userData.role,
      employeeId: userData.employee_id,
      applicantId: userData.applicant_id,
      outlet: userData.outlet,
      active: userData.is_active,
      createdAt: userData.created_at,
    };

    setUsers((prev) => [...prev, newUser]);

    setOpenAdd(false);
    setForm(EMPTY_FORM);

    setSnackbar({
      open: true,
      message: `Account created and linked to Supabase Auth${form.employeeId ? ` with Employee ID ${form.employeeId}` : ''}.`,
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

  // Edit account profile. Passwords are managed by Supabase Auth, not user_accounts.
  const handleEdit = async () => {
  if (!selectedUser) return;

  setSaving(true);

  try {
    const linkedEmployee = getEmployeeOption(editForm.employeeId);
    const employeeOutlet = linkedEmployee?.outlet || editForm.outlet || "";

    const updateData: any = {
      full_name: editForm.name,
      email: editForm.email,
      role: editForm.role,
      outlet: employeeOutlet,
      employee_id: editForm.employeeId,
      is_active: editForm.active ?? selectedUser.active ?? true,
    };

    if (newPwd.trim()) {
      throw new Error("Password resets must be completed in Supabase Auth or through a secure admin backend.");
    }

    let result = await supabase
      .from("user_accounts")
      .update(updateData)
      .eq("user_id", selectedUser.id)
      .select()
      .maybeSingle();

    if (!result.data) {
      result = await supabase
        .from("user_accounts")
        .update(updateData)
        .eq("email", selectedUser.email)
        .select()
        .maybeSingle();
    }

    if (result.error) throw result.error;
    if (!result.data) throw new Error("No matching user account found.");

    const data = result.data;

    const updatedUser: UserAccount = {
      id: data.user_id ?? "",
      name: data.full_name ?? "",
      email: data.email ?? "",
      password: data.password ?? "",
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
    setNewPwd("");
    setShowEditPwd(false);

    setSnackbar({
      open: true,
      message: newPwd.trim()
        ? "Account updated. Manage password changes in Supabase Auth."
        : "✅ Account updated!",
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

  /** Toggle active/inactive — works from both the table and the Edit dialog */
  const handleToggleActive = async (user: UserAccount) => {
  const newActive = user.active === false;

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

  const summaryCards = [
    { label: 'Total Accounts', value: totalUsers, icon: <AdminPanelSettings fontSize="small" /> },
    { label: 'Active Accounts', value: activeUsers, caption: 'Can access the system', icon: <Visibility fontSize="small" /> },
    { label: 'Inactive Accounts', value: inactiveUsers, caption: 'Temporarily disabled', icon: <VisibilityOff fontSize="small" /> },
    { label: 'Employee Users', value: employeeUsers, caption: 'Employee role accounts', icon: <Badge fontSize="small" /> },
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
            <Chip
              icon={<AdminPanelSettings sx={{ fontSize: 15 }} />}
              label="Access Control"
              size="small"
              sx={{
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
              User Account Management
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              Create login accounts, assign role access, connect employee IDs, and manage active or inactive system users in one clean workspace.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', width: { xs: '100%', sm: 'auto' } }}>
            <Tooltip title="Refresh accounts">
              <span style={{ width: 'inherit' }}>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={fetchUsers}
                  disabled={loading}
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
              <Typography variant="caption" sx={{ color: GREEN_UI.muted, mt: 1.2 }}>
                {stat.caption}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Alert
        severity="info"
        sx={{
          mb: 2,
          borderRadius: '18px',
          border: `1px solid ${GREEN_UI.border}`,
          bgcolor: 'rgba(240, 249, 241, 0.92)',
          color: '#365a3b',
          '& .MuiAlert-icon': { color: GREEN_UI.green },
          '& code': {
            px: 0.7,
            py: 0.18,
            mx: 0.25,
            borderRadius: 1.2,
            bgcolor: 'rgba(58, 168, 101, 0.10)',
            color: GREEN_UI.greenDark,
            fontWeight: 600,
          },
        }}
      >
        <strong>System Accounts</strong> are always active and not listed here: <code>admin</code> / admin123 (HR),
        and demo accounts (hr / employee / supervisor / gm / accounting @company.com). Additional accounts created here are stored in database.
      </Alert>

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
              User Account Directory
            </Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              Search by account, email, role, employee ID, applicant ID, or outlet.
            </Typography>
          </Box>
        </Box>
        <TextField
          fullWidth
          size="small"
          placeholder="Search user accounts..."
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
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 180 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.length === 0 || filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 7 }}>
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
                        <Box
                          sx={{
                            width: 38,
                            height: 38,
                            borderRadius: '16px',
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: GREEN_UI.greenSoft,
                            color: GREEN_UI.greenDark,
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {(u.name || '?').trim().charAt(0).toUpperCase()}
                        </Box>
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
                          size="small"
                          clickable
                          variant="outlined"
                          icon={u.active === false ? <Visibility /> : <VisibilityOff />}
                          onClick={() => handleToggleActive(u)}
                          sx={{
                            minWidth: 118,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: u.active === false ? '#a9dfb6' : '#efd69a',
                            color: u.active === false ? '#1f7a46' : '#8a6400',
                            bgcolor: u.active === false ? '#f1fbf2' : '#fffaf0',
                            '&:hover': { bgcolor: u.active === false ? GREEN_UI.greenSoft : '#fff2d2' },
                            '& .MuiChip-icon': { color: u.active === false ? '#1f7a46' : '#8a6400' },
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
                              outlet: linkedEmployee?.outlet || u.outlet,
                              employeeId: u.employeeId,
                              applicantId: u.applicantId,
                              active: u.active,
                            });

                            setNewPwd('');
                            setShowEditPwd(false);
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
          <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5, fontWeight: 500 }}>
            Set the user’s login details, role access, and linked employee information.
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
                helperText="Used to log in to the system"
                sx={softTextFieldSx}
              />
            </Grid>

            {renderDialogSectionTitle('II. ROLE ACCESS')}
            <Grid size={{ xs: 12, md: 6 }}>
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
            <Grid size={{ xs: 12, md: 6 }}>
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
                {OUTLETS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            </Grid>

            {renderDialogSectionTitle('III. LOGIN CREDENTIALS')}
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Linked Employee ID"
                value={form.employeeId}
                disabled
                InputProps={{
                  readOnly: true,
                  startAdornment: (
                    <InputAdornment position="start">
                      <Badge fontSize="small" sx={{ color: GREEN_UI.greenDark }} />
                    </InputAdornment>
                  ),
                }}
                helperText="Auto-generated — assigned sequentially"
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
                label="Supabase Auth Password"
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
        onClose={() => { setOpenEdit(false); setNewPwd(''); setShowEditPwd(false); }}
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
            <Grid size={12}>
              <TextField
                fullWidth
                label="Supabase Auth Password"
                placeholder="Manage password changes in Supabase Auth"
                type={showEditPwd ? 'text' : 'password'}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowEditPwd(s => !s)}>
                        {showEditPwd ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

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
                    onClick={() => selectedUser && handleToggleActive(selectedUser)}
                    disabled={saving}
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
            onClick={() => { setOpenEdit(false); setNewPwd(''); setShowEditPwd(false); }}
            sx={{ ...pillButtonSx, color: GREEN_UI.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEdit}
            disabled={saving}
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
