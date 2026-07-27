import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  CircularProgress,
  Alert,
  Tooltip,
  Grid,
  Autocomplete,
} from "@mui/material";
import {
  AddCircleOutline,
  Visibility,
  ManageSearch,
  DeleteOutline,
  Sync,
  GroupsRounded,
  CheckCircleRounded,
  EventAvailableRounded,
  SearchRounded,
  BadgeRounded,
  AccountCircleRounded,
  WorkRounded,
  StorefrontRounded,
  LocalPhoneRounded,
  EmailRounded,
  CalendarMonthRounded,
  ScheduleRounded,
  AccessTimeRounded,
  CoffeeRounded,
  CloseRounded,
  PersonAddAlt1Rounded,
} from "@mui/icons-material";
import ActionSnackbar from "../ActionSnackbar";
import { supabase } from "../../lib/supabaseClient";
import { nextEmployeeId } from "../../lib/employeeIds";
import {
  OUTLETS,
  POSITIONS,
  DEPARTMENTS,
} from "../../lib/constants";
import { useAuth } from "../../context/AuthContext";

interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  outlet: string;
  status: "Active" | "On Leave" | "Resigned";
  contact: string;
  email?: string;
  dateHired?: string;
  createdAt?: string;
  dailySchedule?: string;
  breakTime?: string;
  timeIn?: string;
  timeOut?: string;
}

const EMPTY_FORM = {
  name: "",
  position: "",
  department: "",
  outlet: "",
  status: "Active" as const,
  contact: "",
  email: "",
  dateHired: "",
  dailySchedule: "",
  breakTime: "",
  timeIn: "",
  timeOut: "",
};

// Preset schedule options
const SCHEDULE_PRESETS = [
  { label: "6:00 AM – 3:00 PM",  timeIn: "6:00 AM",  timeOut: "3:00 PM"  },
  { label: "7:00 AM – 4:00 PM",  timeIn: "7:00 AM",  timeOut: "4:00 PM"  },
  { label: "8:00 AM – 5:00 PM",  timeIn: "8:00 AM",  timeOut: "5:00 PM"  },
  { label: "9:00 AM – 6:00 PM",  timeIn: "9:00 AM",  timeOut: "6:00 PM"  },
  { label: "10:00 AM – 7:00 PM", timeIn: "10:00 AM", timeOut: "7:00 PM"  },
  { label: "3:00 PM – 11:00 PM", timeIn: "3:00 PM",  timeOut: "11:00 PM" },
  { label: "11:00 PM – 7:00 AM", timeIn: "11:00 PM", timeOut: "7:00 AM"  },
  { label: "Off",                 timeIn: "",          timeOut: ""          },
];

const BREAK_TIME_OPTIONS = ["30 minutes", "1 hour", "1 hour 30 minutes", "2 hours"];

const TIME_OPTIONS = [
  "5:00 AM","6:00 AM","7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM",
  "12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM",
  "7:00 PM","8:00 PM","9:00 PM","10:00 PM","11:00 PM",
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

const iconTileSx = {
  width: 42,
  height: 42,
  borderRadius: '16px',
  display: 'grid',
  placeItems: 'center',
  color: GREEN_UI.greenDark,
  bgcolor: GREEN_UI.greenSoft,
  border: `1px solid ${GREEN_UI.borderStrong}`,
};

const pillButtonSx = {
  borderRadius: "12px",
  textTransform: 'none',
  fontWeight: 700,
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
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: GREEN_UI.text },
};

const employeeStatusChipSx = (status: Employee['status']) => {
  const styles: Record<Employee['status'], { bg: string; color: string; border: string }> = {
    Active: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    'On Leave': { bg: '#fff7e0', color: '#9b6b00', border: '#f5d786' },
    Resigned: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da' },
  };

  const selected = styles[status] ?? styles.Active;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25 },
  };
};

export default function EmployeeRecords() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<
    Partial<typeof EMPTY_FORM>
  >({});

  const fetchEmployees = async () => {
  setLoading(true);
  setError(null);

  try {
    const { data: employeesData, error: employeesError } = await supabase
      .from("employees")
      .select("*")
      .order("created_at", { ascending: true });

    if (employeesError) throw employeesError;

    const { data: userAccountsData, error: userAccountsError } = await supabase
      .from("user_accounts")
      .select("employee_id, outlet");

    if (userAccountsError) throw userAccountsError;

    const outletMap = new Map(
      (userAccountsData ?? []).map((u: any) => [
        u.employee_id,
        u.outlet,
      ])
    );

    const safe = (employeesData ?? []).map((e: any) => ({
      id: e.employee_id,
      name: `${e.first_name ?? ""} ${e.middle_name ?? ""} ${e.last_name ?? ""} ${e.suffix ?? ""}`
  .replace(/\s+/g, " ")
  .trim(),
      position: e.position ?? "",
      department: e.department ?? "",

      // Fetch outlet from user_accounts table first
      outlet: outletMap.get(e.employee_id) || e.outlet || "",

      status: e.status ?? "Active",
      contact: e.phone_number ?? "",
      email: e.email ?? "",
      dateHired: e.hire_date ?? "",
      createdAt: e.created_at ?? "",
      dailySchedule: e.daily_schedule ?? "",
      breakTime: e.break_time ?? "",
      timeIn: e.time_in ?? "",
      timeOut: e.time_out ?? "",
    }));

    setEmployees(safe);
  } catch (err: any) {
    console.error("Fetch employees error:", err);
    setError(`Could not load employees: ${err.message}`);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchEmployees();
  }, []);

  const validate = () => {
    const errs: Partial<typeof EMPTY_FORM> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.position.trim())
      errs.position = "Position is required";
    if (!form.outlet.trim())
      errs.outlet = "Outlet / Branch is required";
    if (!form.contact.trim())
      errs.contact = "Contact number is required";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddEmployee = async () => {
  if (!validate()) return;

  setSaving(true);

  try {
    const employeeIdGenerated = await nextEmployeeId();

    const nameParts = form.name.trim().split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    const { data: employeeData, error } = await supabase
      .from("employees")
      .insert({
        employee_id: employeeIdGenerated,
        first_name: firstName,
        middle_name: "",
        last_name: lastName,
        email: form.email || null,
        phone_number: form.contact,
        department: form.department,
        position: form.position,
        outlet: form.outlet,
        status: form.status,
        hire_date: form.dateHired || null,
      })
      .select()
      .single();

    if (error) throw error;

    const newEmployee: Employee = {
      id: employeeData.employee_id,
      name: `${employeeData.first_name ?? ""} ${employeeData.middle_name ?? ""} ${employeeData.last_name ?? ""} ${employeeData.suffix ?? ""}`.replace(/\s+/g, " ").trim(),
      position: employeeData.position ?? "",
      department: employeeData.department ?? "",
      outlet: employeeData.outlet ?? "",
      status: employeeData.status ?? "Active",
      contact: employeeData.phone_number ?? "",
      email: employeeData.email ?? "",
      dateHired: employeeData.hire_date ?? "",
      createdAt: employeeData.created_at ?? "",
      dailySchedule: employeeData.daily_schedule ?? "",
      breakTime: employeeData.break_time ?? "",
      timeIn: employeeData.time_in ?? "",
      timeOut: employeeData.time_out ?? "",
    };

    setEmployees((prev) => [newEmployee, ...prev]);
    setDialogOpen(false);
    setForm(EMPTY_FORM);
    setFormErrors({});

    setSnackbar({
      open: true,
      message: `✅ Employee ${employeeIdGenerated} added successfully.`,
      severity: "success",
    });
  } catch (err: any) {
    console.error("Add employee error:", err);
    setSnackbar({
      open: true,
      message: `Failed to add employee: ${err.message}`,
      severity: "error",
    });
  } finally {
    setSaving(false);
  }
};

  const handleDelete = async (emp: Employee) => {
  if (!window.confirm(`Remove ${emp.name} (${emp.id})?`)) return;

  try {
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("employee_id", emp.id);

    if (error) throw error;

    setEmployees((prev) => prev.filter((e) => e.id !== emp.id));

    setSnackbar({
      open: true,
      message: `${emp.name} removed.`,
      severity: "success",
    });
  } catch (err: any) {
    setSnackbar({
      open: true,
      message: `Failed to delete: ${err.message}`,
      severity: "error",
    });
  }
};

  const filtered = employees.filter(
    (emp) =>
      (emp.name ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (emp.id ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      (emp.position ?? "")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );

  // Only HR can add employees; HR and GM can delete
  const canModify = user?.role === "hr";
  const canDelete = user?.role === "hr" || user?.role === "gm";

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
      {/* Header */}
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
              icon={<GroupsRounded sx={{ fontSize: '16px !important' }} />}
              label="Employee Workspace"
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
              Employee Records
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              {canModify
                ? 'Manage employee information, outlet assignment, contact details, and schedule information in one clean workspace.'
                : 'View employee directory information and employment details in a clean, read-only workspace.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="Refresh employees">
              <span>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={fetchEmployees}
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
            {canModify && (
              <Button
                variant="contained"
                startIcon={<AddCircleOutline />}
                onClick={() => setDialogOpen(true)}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.greenDark,
                  boxShadow: '0 12px 24px rgba(31, 122, 70, 0.22)',
                  '&:hover': { bgcolor: '#176238', boxShadow: '0 16px 28px rgba(31, 122, 70, 0.28)' },
                }}
              >
                Add Employee
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {[
          {
            label: 'Total Employees',
            value: employees.length,
            caption: 'All employee records in the directory',
            icon: <GroupsRounded />,
          },
          {
            label: 'Active Employees',
            value: employees.filter((emp) => emp.status === 'Active').length,
            caption: 'Currently active personnel',
            icon: <CheckCircleRounded />,
          },
          {
            label: 'On Leave',
            value: employees.filter((emp) => emp.status === 'On Leave').length,
            caption: 'Employees marked as on leave',
            icon: <EventAvailableRounded />,
          },
          {
            label: 'Search Results',
            value: filtered.length,
            caption: search ? 'Records matching your search' : 'Currently visible records',
            icon: <SearchRounded />,
          },
        ].map((stat) => (
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
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                    {stat.label}
                  </Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ color: GREEN_UI.text, mt: 0.5, letterSpacing: '-0.04em' }}>
                    {stat.value}
                  </Typography>
                </Box>
                <Box sx={iconTileSx}>{stat.icon}</Box>
              </Box>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted, mt: 1.2 }}>
                {stat.caption}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Error banner */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={fetchEmployees} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* Search */}
      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
          <Box sx={{ ...iconTileSx, width: 38, height: 38}}>
            <ManageSearch fontSize="small" />
          </Box>
          <Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }}>
              Employee Directory
            </Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              Search employee records using name, employee ID, or position.
            </Typography>
          </Box>
        </Box>
        <TextField
          fullWidth
          placeholder="Search by name, ID, or position..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={softTextFieldSx}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <ManageSearch sx={{ color: GREEN_UI.greenDark }} />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* Table */}
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
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading employees…</Typography>
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
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Employee ID</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Name</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Position</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Outlet / Branch</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Contact</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 210 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
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
                        <ManageSearch />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {employees.length === 0 ? 'No employees yet' : 'No employee records found'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        {employees.length === 0
                          ? 'Once employees are added, their records will appear here automatically.'
                          : 'Try adjusting your search keyword to find the right employee record.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((emp) => (
                  <TableRow
                    key={emp.id}
                    hover
                    sx={{
                      transition: 'background 160ms ease',
                      '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                      '& td': { py: 1.55, color: GREEN_UI.text },
                    }}
                  >
                    <TableCell>
                      <Chip
                        icon={<BadgeRounded sx={{ fontSize: '16px !important', color: `${GREEN_UI.greenDark} !important` }} />}
                        label={emp.id}
                        size="small"
                        variant="outlined"
                        sx={{ fontWeight: 600, bgcolor: '#f8fcf5', borderColor: GREEN_UI.border }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Box
                          sx={{
                            ...iconTileSx,
                            width: 36,
                            height: 36,
                            borderRadius: '14px',
                            bgcolor: '#f3fbf0',
                          }}
                        >
                          <AccountCircleRounded fontSize="small" />
                        </Box>
                        <Box>
                          <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>
                            {emp.name}
                          </Typography>
                          {emp.email && (
                            <Typography variant="caption" sx={{ color: GREEN_UI.muted, display: 'block', mt: 0.25 }}>
                              {emp.email}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <WorkRounded sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                          {emp.position || '—'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <StorefrontRounded sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" sx={{ color: GREEN_UI.text, fontWeight: 700 }}>
                          {emp.outlet || '—'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip label={emp.status} size="small" variant="outlined" sx={{ ...employeeStatusChipSx(emp.status), whiteSpace: 'nowrap' }} />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <LocalPhoneRounded sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" sx={{ color: GREEN_UI.text, fontWeight: 700 }}>
                          {emp.contact || '—'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          label={user?.role === "supervisor" ? "View Profile" : "Edit Profile"}
                          size="small"
                          clickable
                          variant="outlined"
                          icon={<Visibility sx={{ fontSize: '16px !important' }} />}
                          onClick={() => navigate(`/dashboard/employees/${emp.id}`)}
                          sx={{
                            minWidth: 116,
                            justifyContent: 'center',
                            fontWeight: 600,
                            borderColor: GREEN_UI.borderStrong,
                            color: GREEN_UI.greenDark,
                            bgcolor: '#ffffff',
                            '&:hover': { bgcolor: GREEN_UI.greenSoft },
                          }}
                        />
                        {canDelete && (
                          <Chip
                            label="Delete"
                            size="small"
                            clickable
                            variant="outlined"
                            icon={<DeleteOutline sx={{ fontSize: '16px !important' }} />}
                            onClick={() => handleDelete(emp)}
                            sx={{
                              minWidth: 86,
                              justifyContent: 'center',
                              fontWeight: 600,
                              borderColor: '#efb8b8',
                              color: '#9c2f2f',
                              bgcolor: '#fffafa',
                              '&:hover': { bgcolor: '#fdeaea' },
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

      {/* Add Employee Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setForm(EMPTY_FORM);
          setFormErrors({});
        }}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ ...iconTileSx, width: 40, height: 40, borderRadius: '15px' }}>
              <PersonAddAlt1Rounded fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }}>
                Add New Employee
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Create a new employee record with profile and schedule details.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2.5,
            bgcolor: '#fbfff9',
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {/* ── Basic Information ───────────────────────────── */}
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ ...iconTileSx, width: 34, height: 34, borderRadius: '13px' }}>
                <BadgeRounded fontSize="small" />
              </Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: GREEN_UI.greenDark }}>
                Basic Information
              </Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Full Name"
                  fullWidth
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  error={!!formErrors.name}
                  helperText={formErrors.name}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AccountCircleRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  select
                  fullWidth
                  required
                  label="Position / Job Title"
                  value={form.position}
                  onChange={(e) =>
                    setForm({ ...form, position: e.target.value })
                  }
                  error={!!formErrors.position}
                  helperText={formErrors.position}
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <WorkRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                >
                  <MenuItem key="pos-empty" value="">
                    Select Position…
                  </MenuItem>
                  {POSITIONS.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  select
                  fullWidth
                  label="Department"
                  value={form.department}
                  onChange={(e) =>
                    setForm({ ...form, department: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <WorkRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                >
                  <MenuItem key="dept-empty" value="">
                    Select Department…
                  </MenuItem>
                  {DEPARTMENTS.map((d) => (
                    <MenuItem key={d} value={d}>
                      {d}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  select
                  fullWidth
                  required
                  label="Outlet / Branch"
                  value={form.outlet}
                  onChange={(e) =>
                    setForm({ ...form, outlet: e.target.value })
                  }
                  error={!!formErrors.outlet}
                  helperText={formErrors.outlet}
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <StorefrontRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                >
                  <MenuItem key="outlet-empty" value="">
                    Select Outlet / Branch…
                  </MenuItem>
                  {OUTLETS.map((o) => (
                    <MenuItem key={o} value={o}>
                      {o}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  select
                  fullWidth
                  label="Employment Status"
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as any })
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CheckCircleRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                >
                  <MenuItem key="Active" value="Active">Active</MenuItem>
                  <MenuItem key="On Leave" value="On Leave">On Leave</MenuItem>
                  <MenuItem key="Resigned" value="Resigned">Resigned</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ ...iconTileSx, width: 34, height: 34, borderRadius: '13px' }}>
                <LocalPhoneRounded fontSize="small" />
              </Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: GREEN_UI.greenDark }}>
                Contact & Hiring Details
              </Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Contact Number"
                  fullWidth
                  required
                  value={form.contact}
                  onChange={(e) =>
                    setForm({ ...form, contact: e.target.value.replace(/\D/g, '').slice(0, 11) })
                  }
                  error={!!formErrors.contact}
                  helperText={formErrors.contact || `${form.contact.length}/11`}
                  placeholder="09XXXXXXXXX"
                  inputProps={{ maxLength: 11, inputMode: 'numeric' }}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocalPhoneRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Email Address"
                  fullWidth
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <EmailRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Date Hired"
                  fullWidth
                  type="date"
                  value={form.dateHired}
                  onChange={(e) =>
                    setForm({ ...form, dateHired: e.target.value })
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <CalendarMonthRounded sx={{ color: GREEN_UI.greenDark }} />
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
            </Grid>
          </Paper>

          {/* ── Schedule Assignment ─────────────────────────── */}
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box sx={{ ...iconTileSx, width: 34, height: 34, borderRadius: '13px' }}>
                <ScheduleRounded fontSize="small" />
              </Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ color: GREEN_UI.greenDark }}>
                Schedule Assignment
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted, display: 'block', mb: 1.5 }}>
              Optional schedule details for initial employee setup.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  freeSolo
                  options={SCHEDULE_PRESETS.map((s) => s.label)}
                  value={form.dailySchedule}
                  onChange={(_, newVal) => {
                    const preset = SCHEDULE_PRESETS.find((s) => s.label === newVal);
                    setForm({
                      ...form,
                      dailySchedule: newVal ?? "",
                      timeIn:  preset ? preset.timeIn  : form.timeIn,
                      timeOut: preset ? preset.timeOut : form.timeOut,
                    });
                  }}
                  onInputChange={(_, newVal) =>
                    setForm({ ...form, dailySchedule: newVal })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Daily Schedule Assignment"
                      placeholder='e.g. 8:00 AM – 5:00 PM or type "Off"'
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <InputAdornment position="start">
                            <ScheduleRounded sx={{ color: GREEN_UI.greenDark }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  freeSolo
                  options={BREAK_TIME_OPTIONS}
                  value={form.breakTime}
                  onChange={(_, newVal) =>
                    setForm({ ...form, breakTime: newVal ?? "" })
                  }
                  onInputChange={(_, newVal) =>
                    setForm({ ...form, breakTime: newVal })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Break Time"
                      placeholder="e.g. 1 hour"
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <InputAdornment position="start">
                            <CoffeeRounded sx={{ color: GREEN_UI.greenDark }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  freeSolo
                  options={TIME_OPTIONS}
                  value={form.timeIn}
                  onChange={(_, newVal) =>
                    setForm({ ...form, timeIn: newVal ?? "" })
                  }
                  onInputChange={(_, newVal) =>
                    setForm({ ...form, timeIn: newVal })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Scheduled Time-In"
                      placeholder="e.g. 8:00 AM"
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <InputAdornment position="start">
                            <AccessTimeRounded sx={{ color: GREEN_UI.greenDark }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  freeSolo
                  options={TIME_OPTIONS}
                  value={form.timeOut}
                  onChange={(_, newVal) =>
                    setForm({ ...form, timeOut: newVal ?? "" })
                  }
                  onInputChange={(_, newVal) =>
                    setForm({ ...form, timeOut: newVal })
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Scheduled Time-Out"
                      placeholder="e.g. 5:00 PM"
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: (
                          <InputAdornment position="start">
                            <AccessTimeRounded sx={{ color: GREEN_UI.greenDark }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Paper>
        </DialogContent>
        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            py: 2,
            bgcolor: '#fbfff9',
            borderTop: `1px solid ${GREEN_UI.border}`,
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Button
            onClick={() => {
              setDialogOpen(false);
              setForm(EMPTY_FORM);
              setFormErrors({});
            }}
            startIcon={<CloseRounded />}
            sx={{ ...pillButtonSx, color: GREEN_UI.muted }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddEmployee}
            disabled={saving}
            startIcon={
              saving ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <PersonAddAlt1Rounded />
              )
            }
            sx={{
              ...pillButtonSx,
              bgcolor: GREEN_UI.green,
              boxShadow: '0 12px 24px rgba(58, 168, 101, 0.22)',
              '&:hover': { bgcolor: GREEN_UI.greenDark },
            }}
          >
            {saving ? "Saving…" : "Add Employee"}
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
      />
    </Box>
  );
}
