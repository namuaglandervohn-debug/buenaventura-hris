import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Chip, Grid,
  CircularProgress, Alert, Tooltip, InputAdornment,
  Checkbox,
  Autocomplete,
} from '@mui/material';
import {
  AccessTime,
  AddCircleOutline,
  AssignmentTurnedIn,
  CalendarMonth,
  CancelOutlined,
  CheckCircleOutline,
  CloudUpload,
  DoneAll,
  EditOutlined as EditIcon,
  EventAvailable,
  Image,
  InsertDriveFile,
  ManageSearch,
  PersonOutline,
  PlaylistAddCheck,
  Storefront,
  Sync,
  TaskAlt,
  ViewWeek,
  WorkOutline,
} from '@mui/icons-material';
import * as XLSX from 'xlsx';
import { supabase } from "../../lib/supabaseClient";
import { OUTLETS, POSITIONS } from '../../lib/constants';
import ActionSnackbar from '../ActionSnackbar';

const AVAILABLE_POSITIONS = POSITIONS.filter(position => position !== 'Payroll Staff');
import { useAuth } from '../../context/AuthContext';

interface Schedule {
  id: string; employeeId: string; employee: string; position: string; outlet: string; week: string;
  timeIn: string; timeOut: string; breakTime: string;
  monday: string; tuesday: string; wednesday: string; thursday: string;
  friday: string; saturday: string; sunday: string;
  status: 'Draft' | 'Published' | 'Confirmed' | 'Declined';
  confirmedBy?: string; confirmedAt?: string;
  declinedBy?: string; declinedAt?: string;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const EMPTY = {
  employeeId: '',
  employee: '',
  position: '',
  outlet: '',
  week: '',
  timeIn: '',
  timeOut: '',
  breakTime: '1 hour',
  monday: '',
  tuesday: '',
  wednesday: '',
  thursday: '',
  friday: '',
  saturday: '',
  sunday: '',
};

const SHIFT_PRESETS = [
  'Off',
  '6:00 AM – 3:00 PM',
  '7:00 AM – 4:00 PM',
  '8:00 AM – 5:00 PM',
  '9:00 AM – 6:00 PM',
  '10:00 AM – 7:00 PM',
  'AM (6:00 AM – 2:00 PM)',
  'MID (2:00 PM – 10:00 PM)',
  'PM (10:00 PM – 6:00 AM)',
  'Full (8:00 AM – 5:00 PM)',
];

const BREAK_TIME_OPTIONS = ['30 minutes', '1 hour', '1 hour 30 minutes', '2 hours'];
const PHOTO_SCHEDULE_WEEK = 'May 11-17, 2026';
const PHOTO_SCHEDULE_ROWS = [
  {
    name: 'Diether Raganit',
    position: 'Supervisor',
    outlet: 'Maria Clara Resort',
    monday: 'RD',
    tuesday: '9:00 AM - 7:00 PM / 5:00 PM - 9:00 PM',
    wednesday: 'FLEX',
    thursday: '9:00 AM - 1:00 PM / 5:00 PM - 9:00 PM',
    friday: '9:00 AM - 1:00 PM / 5:00 PM - 9:00 PM',
    saturday: '9:00 AM - 1:00 PM / 5:00 PM - 9:00 PM',
    sunday: '7:00 AM - 10:00 PM / 5:00 PM - 9:00 PM',
  },
  {
    name: 'Yurine Guanzon',
    position: 'Leadman',
    outlet: 'Buenaventura Cafe',
    monday: '2:00 PM - 5:00 PM / 6:00 PM - 12:00 AM',
    tuesday: '2:00 PM - 5:00 PM / 6:00 PM - 11:00 PM',
    wednesday: 'RD',
    thursday: '1:00 PM - 4:00 PM / 6:00 PM - 11:00 PM',
    friday: '2:00 PM - 5:00 PM / 6:00 PM - 11:00 PM',
    saturday: '2:00 PM - 5:00 PM / 6:00 PM - 12:00 AM',
    sunday: '1:00 PM - 2:00 PM / 6:00 PM - 12:00 AM',
  },
  {
    name: 'Christian Tejadillo',
    position: 'Server',
    outlet: 'Buenaventura Cafe',
    monday: '11:00 AM - 7:00 PM / 2:00 PM - 8:00 PM',
    tuesday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
    wednesday: '2:00 PM - 5:00 PM / 6:00 PM - 10:00 PM',
    thursday: 'RD',
    friday: '9:00 AM - 2:00 PM / 6:00 PM - 9:00 PM',
    saturday: '11:00 AM - 6:30 PM',
    sunday: '12:30 PM - 8:30 PM',
  },
  {
    name: 'Jilly John Jardinico',
    position: 'Server',
    outlet: 'Buenaventura Cafe',
    monday: '5:00 AM - 2:00 PM / 5:00 PM - 8:00 PM',
    tuesday: '5:00 AM - 2:00 PM / 5:00 PM - 8:00 PM',
    wednesday: '12:00 PM - 8:00 PM',
    thursday: '9:00 AM - 1:00 PM / 5:00 PM - 9:00 PM',
    friday: 'RD',
    saturday: '9:00 AM - 1:00 PM / 6:00 PM - 9:00 PM',
    sunday: '9:00 AM - 3:00 PM / 5:00 PM - 9:00 PM',
  },
  {
    name: 'Romel Cancio',
    position: 'Leadman',
    outlet: 'Maria Clara Restaurant',
    monday: 'RD',
    tuesday: '11:00 AM - 2:00 PM / 6:00 PM - 9:00 PM',
    wednesday: '11:00 AM - 2:00 PM / 4:00 PM - 10:00 PM',
    thursday: '11:00 AM - 2:00 PM / 6:00 PM - 9:00 PM',
    friday: '11:00 AM - 2:00 PM / 6:00 PM - 9:00 PM',
    saturday: '11:00 AM - 3:00 PM',
    sunday: '11:00 AM - 3:00 PM',
  },
  {
    name: 'Christian Dave Baon',
    position: 'Server',
    outlet: 'Maria Clara Restaurant',
    monday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
    tuesday: 'RD',
    wednesday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
    thursday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
    friday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
    saturday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
    sunday: '1:00 PM - 4:00 PM / 5:00 PM - 10:00 PM',
  },
  {
    name: 'Kio M.',
    position: 'Server',
    outlet: 'Maria Clara Restaurant',
    monday: '6:00 AM - 12:00 PM / 1:00 PM - 3:00 PM',
    tuesday: '6:00 AM - 12:00 PM / 1:00 PM - 3:00 PM',
    wednesday: '6:00 AM - 12:00 PM / 1:00 PM - 3:00 PM',
    thursday: '6:00 AM - 12:00 PM / 1:00 PM - 3:00 PM',
    friday: 'RD',
    saturday: 'RD',
    sunday: '6:00 AM - 12:00 PM / 1:00 PM - 3:00 PM',
  },
  {
    name: 'Cheryl Monil',
    position: 'Cashier',
    outlet: 'Maria Clara Restaurant',
    monday: 'SUSPENDED',
    tuesday: 'SUSPENDED',
    wednesday: 'SUSPENDED',
    thursday: 'SUSPENDED',
    friday: 'SUSPENDED',
    saturday: '1:30 PM - 4:00 PM',
    sunday: '1:30 PM - 12:00 AM',
  },
  {
    name: 'Jhon Lloyd Reyes',
    position: 'Leadman',
    outlet: 'Pool Bar',
    monday: '2:00 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    tuesday: '2:30 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    wednesday: '2:30 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    thursday: 'RD',
    friday: '2:30 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    saturday: '2:30 PM - 4:00 PM / 6:00 PM - 11:00 PM',
    sunday: '2:30 PM - 6:00 PM / 6:00 PM - 11:00 PM',
  },
  {
    name: 'Stephen Ker Caliston',
    position: 'Server',
    outlet: 'Pool Bar',
    monday: '11:00 AM - 2:00 PM / 5:00 PM - 9:00 PM',
    tuesday: '2:00 PM - 6:00 PM / 7:00 PM - 11:00 PM',
    wednesday: '11:30 AM - 2:00 PM / 3:00 PM - 9:00 PM',
    thursday: '2:00 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    friday: 'RD',
    saturday: '2:00 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    sunday: '9:30 PM - 5:00 AM',
  },
  {
    name: 'John Louie Del Gako',
    position: 'Server',
    outlet: 'Pool Bar',
    monday: '2:00 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    tuesday: '1:00 PM - 4:00 PM / 5:00 PM - 11:00 PM',
    wednesday: '3:00 PM - 4:00 PM / 5:00 PM - 11:00 PM',
    thursday: '2:00 PM - 6:00 PM / 6:00 PM - 11:00 PM',
    friday: '11:00 AM - 2:00 PM / 4:00 PM - 8:00 PM',
    saturday: '7:30 PM - 3:00 AM',
    sunday: 'RD',
  },
  {
    name: 'Rogie Lopez',
    position: 'Events Head',
    outlet: 'Pool Bar',
    monday: 'SUSPENDED',
    tuesday: 'SUSPENDED',
    wednesday: 'SUSPENDED',
    thursday: 'RD',
    friday: '2:00 PM - 4:00 PM / 5:00 PM - 11:00 PM',
    saturday: '2:00 PM - 4:00 PM / 6:00 PM - 11:00 PM',
    sunday: '2:00 PM - 4:00 PM / 5:00 PM - 11:00 PM',
  },
  {
    name: 'Cristen Albert',
    position: 'Cashier',
    outlet: 'Pool Bar',
    monday: 'RD',
    tuesday: '1:30 PM - 4:00 PM / 4:00 PM - 10:00 PM',
    wednesday: '8:30 PM - 4:00 AM / 4:00 PM - 11:00 PM',
    thursday: '2:00 PM - 5:00 PM / 6:00 PM - 11:00 PM',
    friday: '3:00 PM - 4:00 PM / 5:00 PM - 11:00 PM',
    saturday: 'RD',
    sunday: '1:30 PM - 6:00 PM / 6:00 PM - 11:00 PM',
  },
  {
    name: 'Jayson Onrubia',
    position: 'Reliever',
    outlet: 'Pool Bar',
    monday: '2:00 PM - 6:00 PM / 6:00 PM - 12:00 AM',
    tuesday: 'RD',
    wednesday: '9:00 AM - 3:00 PM / 5:00 PM - 9:00 PM',
    thursday: '11:30 AM - 2:00 PM',
    friday: '6:00 PM - 12:00 AM / 1:00 AM - 3:00 AM',
    saturday: '6:00 AM - 12:00 PM / 1:00 PM - 3:00 PM',
    sunday: 'RD',
  },
] as const;
const ASSIGNED_WORK_AREAS = ['Maria Clara Resort', 'Maria Clara Restaurant', 'Buenaventura Cafe'];
const normalizeWorkArea = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    normalized === 'buenaventura caf?' ||
    normalized === 'buenaventura café' ||
    normalized === 'buenaventura cafe' ||
    normalized === 'cafe buenaventura'
  ) {
    return 'buenaventura cafe';
  }
  return normalized;
};

const displayWorkArea = (value?: string | null) =>
  normalizeWorkArea(value) === 'buenaventura cafe'
    ? 'Buenaventura Cafe'
    : String(value ?? '').trim();

const normalizePersonName = (value?: string | null) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const sortSchedulesByEmployeeName = (rows: Schedule[]) =>
  [...rows].sort((a, b) =>
    String(a.employee || '').localeCompare(String(b.employee || ''), undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  );

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
  fontWeight: 700,
  px: 2,
};

const softTextFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
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

const statusChipSx = (status: Schedule['status']) => {
  const styles: Record<Schedule['status'], { bg: string; color: string; border: string }> = {
    Draft: { bg: '#f4f7f3', color: '#5f6e63', border: '#dce8da' },
    Published: { bg: '#e9f6ff', color: '#1d6f9c', border: '#b7dff7' },
    Confirmed: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    Declined: { bg: '#fdeaea', color: '#9c2f2f', border: '#efb8b8' },
  };

  const selected = styles[status] ?? styles.Draft;

  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    '& .MuiChip-label': { px: 1.25 },
  };
};

const actionChipSx = (tone: 'primary' | 'success' | 'danger' | 'neutral' = 'primary') => {
  const styles = {
    primary: { border: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bg: '#ffffff', hover: GREEN_UI.greenSoft },
    success: { border: '#a9dfb6', color: GREEN_UI.greenDark, bg: '#f4fbf5', hover: '#e5f8e9' },
    danger: { border: '#efb8b8', color: '#9c2f2f', bg: '#fffafa', hover: '#fdeaea' },
    neutral: { border: GREEN_UI.border, color: GREEN_UI.muted, bg: '#ffffff', hover: '#f4f8f2' },
  }[tone];

  return {
    minWidth: 110,
    justifyContent: 'center',
    fontWeight: 600,
    borderColor: styles.border,
    color: styles.color,
    bgcolor: styles.bg,
    '&:hover': { bgcolor: styles.hover },
  };
};

const outletChipSx = {
  fontWeight: 600,
  bgcolor: '#f8fcf5',
  borderColor: GREEN_UI.border,
  color: GREEN_UI.greenDark,
};


const getWeekRange = (offsetWeeks: number = 0): string => {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1) + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const mDay = monday.getDate(), sDay = sunday.getDate();
  const mMonth = monday.getMonth(), sMonth = sunday.getMonth();
  const year = sunday.getFullYear();
  if (mMonth === sMonth) return `${MONTHS[mMonth]} ${mDay}–${sDay}, ${year}`;
  return `${MONTHS[mMonth]} ${mDay} – ${MONTHS[sMonth]} ${sDay}, ${year}`;
};

export default function ScheduleManagement() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [filterOutlet, setFilterOutlet] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [editDialog, setEditDialog] = useState(false);
  const [editRecord, setEditRecord] = useState<Schedule | null>(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [applicableWorkdays, setApplicableWorkdays] = useState<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);

  // Employee list with position + outlet for auto-fill
  const [employeeList, setEmployeeList] = useState<{
  employeeId: string;
  name: string;
  position: string;
  outlet: string;
}[]>([]);
  const excelRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importingImage, setImportingImage] = useState(false);

  const currentRole = String((user as any)?.role ?? '').toLowerCase();
  const currentEmployeeId = String((user as any)?.employee_id ?? (user as any)?.employeeId ?? '');
  const currentUserName = String((user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.email ?? 'User');
  const canPublish = currentRole === 'hr_admin' || currentRole.includes('hr') || currentRole.includes('admin') || currentRole.includes('supervisor') || currentRole === 'general_manager';
  const canConfirm = currentRole === 'employee' || currentRole.includes('employee');

  // ── Push a schedule notification to an employee (fire-and-forget) ──────
  const pushNotification = async (
  recipientEmployeeId: string,
  title: string,
  message: string,
  type: string,
) => {
  try {
    await supabase
      .from("notifications")
      .insert({
        recipient_employee_id: recipientEmployeeId,
        title,
        message,
        type,
      });
  } catch (error) {
    console.error("Notification error:", error);
  }
};

  // ── Data fetchers ────────────────────────────────────────────────────────
  const fetchSchedules = async () => {
  setLoading(true);
  setError(null);

  try {
    const { data: scheduleData, error: scheduleError } = await supabase
      .from("schedule")
      .select("*");

    if (scheduleError) throw scheduleError;

    const { data: employeeData, error: employeeError } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet");

    if (employeeError) throw employeeError;

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

    const employeeMap = new Map<string, { name: string; position: string; outlet: string }>(
      (employeeData ?? []).map((e: any) => [
        e.employee_id,
        {
          name: `${e.first_name ?? ""} ${e.middle_name ?? ""} ${e.last_name ?? ""} ${e.suffix ?? ""}`
            .replace(/\s+/g, " ")
            .trim(),
          position: e.position ?? "",
          outlet: outletMap.get(e.employee_id) || e.outlet || "",
        },
      ])
    );

    const visibleSchedules =
    canConfirm
    ? (scheduleData ?? []).filter((s: any) => s.employee_id === currentEmployeeId)
    : (scheduleData ?? []);

    const mappedSchedules: Schedule[] = visibleSchedules.map((s: any) => ({
      id: s.schedule_id ?? "—",
      employeeId: s.employee_id ?? "",
      employee: employeeMap.get(s.employee_id)?.name ?? "—",
      position: employeeMap.get(s.employee_id)?.position || s.position || "",
      outlet: displayWorkArea(employeeMap.get(s.employee_id)?.outlet || s.outlet || ""),
      week: s.week ?? "",
      timeIn: s.time_in ?? "",
      timeOut: s.time_out ?? "",
      breakTime: s.break_time ?? "",
      monday: s.monday ?? "",
      tuesday: s.tuesday ?? "",
      wednesday: s.wednesday ?? "",
      thursday: s.thursday ?? "",
      friday: s.friday ?? "",
      saturday: s.saturday ?? "",
      sunday: s.sunday ?? "",
      status: s.status ?? "Draft",
      confirmedBy: s.confirmed_by ?? "",
      confirmedAt: s.confirmed_at ?? "",
      declinedBy: s.declined_by ?? "",
      declinedAt: s.declined_at ?? "",
    }));

    setSchedules(sortSchedulesByEmployeeName(mappedSchedules));
  } catch (e: any) {
    setError(`Could not load schedules: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => { fetchSchedules(); }, []);

   // Fetch employee list — includes position AND outlet for auto-fill
  useEffect(() => {
  const fetchEmployees = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, position, outlet, status")
      .neq("status", "Resigned")
      .order("first_name", { ascending: true });

    if (error) {
      console.error("Failed to fetch employees:", error);
      return;
    }

    const { data: userAccountsData, error: userAccountsError } = await supabase
      .from("user_accounts")
      .select("employee_id, outlet");

    if (userAccountsError) {
      console.error("Failed to fetch user account outlets:", userAccountsError);
      return;
    }

    const outletMap = new Map(
      (userAccountsData ?? []).map((u: any) => [
        u.employee_id,
        u.outlet,
      ])
    );

    const list = (data ?? []).map((e: any) => ({
      employeeId: e.employee_id,
      name: `${e.first_name ?? ""} ${e.middle_name ?? ""} ${e.last_name ?? ""}`
        .replace(/\s+/g, " ")
        .trim(),
      position: e.position ?? "",
      outlet: outletMap.get(e.employee_id) || e.outlet || "",
    }));

    setEmployeeList(list);
  };

  fetchEmployees();
}, []);

  const getEmployeeById = (employeeId: string) =>
    employeeList.find(emp => emp.employeeId === employeeId);

  const hasEmployeeOutlet = (employeeId: string) =>
    Boolean(getEmployeeById(employeeId)?.outlet);

  const applySelectedWorkdays = () => {
    const shift = form.timeIn && form.timeOut ? `${form.timeIn} - ${form.timeOut}` : '';
    if (!shift) {
      setSnackbar({ open: true, message: 'Select a schedule time before applying workdays.', severity: 'error' });
      return;
    }

    setForm(prev => {
      const next = { ...prev };
      DAYS.forEach(day => {
        (next as any)[day] = applicableWorkdays.includes(day) ? shift : 'Off';
      });
      return next;
    });
  };

  const handleSaveDraft = async () => {
  try {
    setSaving(true);
    const employeeIds = selectedEmployeeIds.length > 0 ? selectedEmployeeIds : [form.employeeId].filter(Boolean);
    if (employeeIds.length === 0) throw new Error('Please choose at least one employee.');

    const scheduleIds = await nextScheduleIds(employeeIds.length);
    const payload = employeeIds.map((employeeId, index) => {
      const selectedEmployee = getEmployeeById(employeeId);
      const employeePosition = selectedEmployee?.position || form.position || "";
      const employeeOutlet = selectedEmployee?.outlet || form.outlet || "";

      return {
        schedule_id: scheduleIds[index],
        employee_id: employeeId,
        position: employeePosition,
        outlet: employeeOutlet,
        week: form.week ?? "",
        time_in: form.timeIn || null,
        time_out: form.timeOut || null,
        break_time: form.breakTime ?? "",
        monday: form.monday ?? "",
        tuesday: form.tuesday ?? "",
        wednesday: form.wednesday ?? "",
        thursday: form.thursday ?? "",
        friday: form.friday ?? "",
        saturday: form.saturday ?? "",
        sunday: form.sunday ?? "",
        status: "Draft",
      };
    });

    const { error } = await supabase
      .from("schedule")
      .insert(payload);

    if (error) throw error;

    setSnackbar({
      open: true,
      message: "✅ Schedule saved as draft!",
      severity: "success",
    });

    setOpenDialog(false);
    setSelectedEmployeeIds([]);

    fetchSchedules();
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

  // Publish: only callable when status === 'Draft'; after success button hides until next edit
  const handlePublish = async (s: Schedule) => {
  try {
    const { error } = await supabase
      .from("schedule")
      .update({ status: "Published" })
      .eq("schedule_id", s.id);

    if (error) throw error;

    await pushNotification(
      s.employeeId,
      "New Schedule Published",
      `Your schedule for ${s.week} has been published.`,
      "schedule"
    );

    setSchedules(prev =>
      prev.map(x =>
        x.id === s.id ? { ...x, status: "Published" } : x
      )
    );

    setSnackbar({
      open: true,
      message: "✅ Schedule published — employee can now view and confirm.",
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

  const handleConfirm = async (id: string) => {
  try {
    const confirmedAt = new Date().toISOString();

    const { error } = await supabase
      .from("schedule")
      .update({
        status: "Confirmed",
        confirmed_by: currentUserName,
        confirmed_at: confirmedAt,
      })
      .eq("schedule_id", id);

    if (error) throw error;

    setSchedules(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, status: "Confirmed", confirmedBy: currentUserName, confirmedAt }
          : s
      )
    );

    setSnackbar({
      open: true,
      message: "✅ Schedule confirmed! Your schedule has been acknowledged.",
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

  const handleDecline = async (id: string) => {
  try {
    const declinedAt = new Date().toISOString();

    const { error } = await supabase
      .from("schedule")
      .update({
        status: "Declined",
        declined_by: currentUserName,
        declined_at: declinedAt,
      })
      .eq("schedule_id", id);

    if (error) throw error;

    setSchedules(prev =>
      prev.map(s =>
        s.id === id
          ? { ...s, status: "Declined", declinedBy: currentUserName, declinedAt }
          : s
      )
    );

    setSnackbar({
      open: true,
      message: "❌ Schedule declined.",
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

  const handleDelete = async (id: string) => {
  if (!window.confirm(`Delete schedule ${id}? This cannot be undone.`)) return;

  try {
    const { error } = await supabase
      .from("schedule")
      .delete()
      .eq("schedule_id", id);

    if (error) throw error;

    setSchedules(prev => prev.filter(s => s.id !== id));

    setSnackbar({
      open: true,
      message: `🗑️ Schedule ${id} deleted.`,
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

  const handleDeleteSelected = async () => {
    if (selectedScheduleIds.length === 0) {
      setSnackbar({ open: true, message: "Select at least one schedule to delete.", severity: "error" });
      return;
    }

    if (!window.confirm(`Delete ${selectedScheduleIds.length} selected schedule(s)? This cannot be undone.`)) return;

    setSaving(true);
    try {
      const idsToDelete = [...selectedScheduleIds];
      const { error } = await supabase
        .from("schedule")
        .delete()
        .in("schedule_id", idsToDelete);

      if (error) throw error;

      setSchedules(prev => prev.filter(schedule => !idsToDelete.includes(schedule.id)));
      setSelectedScheduleIds([]);
      setSnackbar({
        open: true,
        message: `Deleted ${idsToDelete.length} selected schedule(s).`,
        severity: "success",
      });
    } catch (e: any) {
      setSnackbar({
        open: true,
        message: `Delete selected schedules failed: ${e.message ?? e}`,
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (s: Schedule) => {
    const linkedEmployee = getEmployeeById(s.employeeId);
    setEditRecord(s);
    setEditForm({
      employeeId: s.employeeId,
      employee: linkedEmployee?.name || s.employee,
      position: linkedEmployee?.position || s.position,
      outlet: linkedEmployee?.outlet || s.outlet,
      week: s.week,
      timeIn: s.timeIn, timeOut: s.timeOut, breakTime: s.breakTime,
      monday: s.monday, tuesday: s.tuesday, wednesday: s.wednesday,
      thursday: s.thursday, friday: s.friday, saturday: s.saturday, sunday: s.sunday,
    });
    setEditDialog(true);
  };

  // Edit: resets status to 'Draft' → Publish button reappears; notifies employee
  const handleEditSave = async () => {
  if (!editRecord) return;

  setSaving(true);

  try {
    const linkedEmployee = getEmployeeById(editRecord.employeeId);
    const employeePosition = linkedEmployee?.position || editForm.position || "";
    const employeeOutlet = linkedEmployee?.outlet || editForm.outlet || "";

    const { error } = await supabase
      .from("schedule")
      .update({
        position: employeePosition,
        outlet: employeeOutlet,
        week: editForm.week ?? "",
        time_in: editForm.timeIn || null,
        time_out: editForm.timeOut || null,
        break_time: editForm.breakTime ?? "",
        monday: editForm.monday ?? "",
        tuesday: editForm.tuesday ?? "",
        wednesday: editForm.wednesday ?? "",
        thursday: editForm.thursday ?? "",
        friday: editForm.friday ?? "",
        saturday: editForm.saturday ?? "",
        sunday: editForm.sunday ?? "",
        status: "Draft",
      })
      .eq("schedule_id", editRecord.id);

    if (error) throw error;

    await pushNotification(
    editRecord.employeeId,
    "Schedule Updated",
    `Your schedule for ${editForm.week} has been updated.`,
    "schedule"
  );

    setEditDialog(false);
    await fetchSchedules();

    setSnackbar({
      open: true,
      message: `Schedule ${editRecord.id} updated`,
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

  const filtered = schedules.filter(s => {
    if (canConfirm) {
      if (s.employeeId !== currentEmployeeId) return false;

      if (!["Published", "Confirmed", "Declined"].includes(s.status)) {
        return false;
      }
    }

    if (filterOutlet !== "all" && normalizeWorkArea(s.outlet) !== normalizeWorkArea(filterOutlet)) return false;

    const query = search.trim().toLowerCase();
    if (!query) return true;

    return [
      s.id,
      s.employeeId,
      s.employee,
      s.position,
      s.outlet,
      s.week,
      s.status,
      s.breakTime,
      s.monday,
      s.tuesday,
      s.wednesday,
      s.thursday,
      s.friday,
      s.saturday,
      s.sunday,
    ].some(value => String(value ?? '').toLowerCase().includes(query));
  });

  const filteredIds = filtered.map(schedule => schedule.id);
  const selectedVisibleIds = selectedScheduleIds.filter(id => filteredIds.includes(id));
  const allVisibleSelected = filteredIds.length > 0 && selectedVisibleIds.length === filteredIds.length;
  const partiallyVisibleSelected = selectedVisibleIds.length > 0 && !allVisibleSelected;

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedScheduleIds(prev => {
      const hiddenSelections = prev.filter(id => !filteredIds.includes(id));
      return checked ? [...hiddenSelections, ...filteredIds] : hiddenSelections;
    });
  };

  const toggleScheduleSelection = (id: string, checked: boolean) => {
    setSelectedScheduleIds(prev =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter(selectedId => selectedId !== id)
    );
  };

  const publishSelectedSchedules = async () => {
    if (selectedScheduleIds.length === 0) {
      setSnackbar({ open: true, message: 'Select at least one schedule to update.', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('schedule')
        .update({ status: 'Published' })
        .in('schedule_id', selectedScheduleIds);

      if (error) throw error;

      const selectedRecords = schedules.filter(schedule => selectedScheduleIds.includes(schedule.id));
      await Promise.all(selectedRecords.map(schedule =>
        pushNotification(
          schedule.employeeId,
          'New Schedule Published',
          `Your schedule for ${schedule.week} has been published.`,
          'schedule'
        )
      ));

      setSchedules(prev => prev.map(schedule =>
        selectedScheduleIds.includes(schedule.id)
          ? {
              ...schedule,
              status: 'Published',
            }
          : schedule
      ));
      setSelectedScheduleIds([]);
      setSnackbar({ open: true, message: `Published ${selectedRecords.length} selected schedule(s).`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Publish selected schedules failed: ${e.message ?? e}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const nextScheduleIds = async (count: number) => {
    const year = new Date().getFullYear();
    const { data, error } = await supabase
      .from("schedule")
      .select("schedule_id")
      .like("schedule_id", `SCH-${year}-%`);

    if (error) throw error;

    const numbers = (data ?? [])
      .map((row: any) => String(row.schedule_id ?? "").match(/SCH-\d{4}-(\d+)$/)?.[1])
      .map((value: string | undefined) => Number(value || 0))
      .filter((value: number) => value > 0);

    const startNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return Array.from({ length: count }, (_, index) => `SCH-${year}-${String(startNumber + index).padStart(4, "0")}`);
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportingExcel(true);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const getCell = (row: any, ...keys: string[]) => {
        for (const key of keys) {
          const exact = row[key];
          const lower = row[key.toLowerCase()];
          const upper = row[key.toUpperCase()];
          const value = exact ?? lower ?? upper;
          if (value !== undefined && String(value).trim() !== '') return String(value).trim();
        }
        return '';
      };

      const validRows = rows.filter(row => getCell(row, 'Employee ID', 'employee_id', 'EmployeeId', 'Employee', 'Name'));
      if (validRows.length === 0) {
        throw new Error('No valid rows found. Include an Employee ID or Employee/Name column.');
      }

      const ids = await nextScheduleIds(validRows.length);
      const payloads = validRows.map((row, index) => {
        const employeeKey = getCell(row, 'Employee ID', 'employee_id', 'EmployeeId', 'ID');
        const employeeName = getCell(row, 'Employee', 'Name', 'Employee Name');
        const matchedEmployee = employeeList.find(emp =>
          emp.employeeId === employeeKey ||
          emp.name.toLowerCase() === employeeName.toLowerCase()
        );

        const employeeId = matchedEmployee?.employeeId || employeeKey;

        return {
          schedule_id: ids[index],
          employee_id: employeeId,
          position: getCell(row, 'Position', 'position') || matchedEmployee?.position || '',
          outlet: getCell(row, 'Outlet', 'outlet', 'Branch', 'branch') || matchedEmployee?.outlet || '',
          week: getCell(row, 'Week', 'week', 'Week Period', 'WeekPeriod') || getWeekRange(0),
          time_in: getCell(row, 'Time In', 'time_in', 'TimeIn') || null,
          time_out: getCell(row, 'Time Out', 'time_out', 'TimeOut') || null,
          break_time: getCell(row, 'Break Time', 'break_time', 'BreakTime', 'Break') || '1 hour',
          monday: getCell(row, 'Monday', 'Mon'),
          tuesday: getCell(row, 'Tuesday', 'Tue'),
          wednesday: getCell(row, 'Wednesday', 'Wed'),
          thursday: getCell(row, 'Thursday', 'Thu'),
          friday: getCell(row, 'Friday', 'Fri'),
          saturday: getCell(row, 'Saturday', 'Sat'),
          sunday: getCell(row, 'Sunday', 'Sun'),
          status: 'Draft',
          is_finalized: false,
        };
      });

      const missingEmployees = payloads.filter(row => !row.employee_id).length;
      if (missingEmployees > 0) {
        throw new Error(`${missingEmployees} row(s) have no employee_id. Please use Employee ID or exact employee name.`);
      }

      const { error: insertError } = await supabase.from('schedule').insert(payloads);
      if (insertError) throw insertError;

      await fetchSchedules();
      setSnackbar({
        open: true,
        message: `✅ Excel import complete — ${payloads.length} schedule(s) saved as Draft.`,
        severity: 'success',
      });
    } catch (err: any) {
      setSnackbar({ open: true, message: `Excel import failed: ${err.message}`, severity: 'error' });
    } finally {
      setImportingExcel(false);
    }
  };

  const findEmployeeForPhotoRow = (name: string) => {
    const target = normalizePersonName(name);
    const targetParts = target.split(' ').filter(Boolean);

    return employeeList.find(emp => {
      const employeeName = normalizePersonName(emp.name);
      if (!employeeName) return false;
      if (employeeName === target) return true;
      if (employeeName.includes(target) || target.includes(employeeName)) return true;
      return targetParts.length >= 2 && targetParts.every(part => employeeName.includes(part));
    });
  };

  const handleImageScheduleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setSnackbar({ open: true, message: 'Please upload a schedule image file.', severity: 'error' });
      return;
    }

    setImportingImage(true);
    try {
      const matchedRows = PHOTO_SCHEDULE_ROWS.map(row => ({
        row,
        employee: findEmployeeForPhotoRow(row.name),
      }));
      const missingNames = matchedRows
        .filter(item => !item.employee)
        .map(item => item.row.name);

      if (missingNames.length > 0) {
        throw new Error(`These employees were not found: ${missingNames.join(', ')}. Add or correct their employee records first.`);
      }

      const ids = await nextScheduleIds(matchedRows.length);
      const payloads = matchedRows.map((item, index) => ({
        schedule_id: ids[index],
        employee_id: item.employee!.employeeId,
        position: item.employee!.position || item.row.position,
        outlet: item.employee!.outlet || item.row.outlet,
        week: PHOTO_SCHEDULE_WEEK,
        time_in: null,
        time_out: null,
        break_time: '1 hour',
        monday: item.row.monday,
        tuesday: item.row.tuesday,
        wednesday: item.row.wednesday,
        thursday: item.row.thursday,
        friday: item.row.friday,
        saturday: item.row.saturday,
        sunday: item.row.sunday,
        status: 'Draft',
        is_finalized: false,
      }));

      const { error: insertError } = await supabase.from('schedule').insert(payloads);
      if (insertError) throw insertError;

      await fetchSchedules();
      setSnackbar({
        open: true,
        message: `Image schedule import complete - ${payloads.length} schedule(s) saved as Draft.`,
        severity: 'success',
      });
    } catch (err: any) {
      setSnackbar({ open: true, message: `Image import failed: ${err.message}`, severity: 'error' });
    } finally {
      setImportingImage(false);
    }
  };

  const scheduleStats = [
    {
      label: 'Total Schedules',
      value: schedules.length,
      caption: 'All loaded weekly schedule records.',
      icon: <ViewWeek fontSize="small" />,
    },
    {
      label: 'Draft',
      value: schedules.filter(s => s.status === 'Draft').length,
      caption: 'Schedules still waiting to be published.',
      icon: <EditIcon fontSize="small" />,
    },
    {
      label: 'Published',
      value: schedules.filter(s => s.status === 'Published').length,
      caption: 'Schedules visible for employee confirmation.',
      icon: <EventAvailable fontSize="small" />,
    },
    {
      label: 'Confirmed',
      value: schedules.filter(s => s.status === 'Confirmed').length,
      caption: 'Schedules already acknowledged by employees.',
      icon: <DoneAll fontSize="small" />,
    },
  ];

  return (
    <Box
      sx={{
        minHeight: '100%',
        p: { xs: 1.5, sm: 2.25, md: 3 },
        background: GREEN_UI.pageBg,
        color: GREEN_UI.text,
        borderRadius: { xs: 0, md: '24px' },
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
              icon={<CalendarMonth sx={{ fontSize: '0.9rem !important' }} />}
              label="Schedule Workspace"
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
              Employee Schedule Management
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
              {canPublish
                ? 'Create weekly schedules, publish them for employee confirmation, and manage schedule revisions in one clean workspace.'
                : 'View your published weekly schedules and confirm or decline them when needed.'}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="Refresh schedules">
              <span>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={fetchSchedules}
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
            {canPublish && (
              <Button
                variant="contained"
                startIcon={<AddCircleOutline />}
                onClick={() => { setForm(EMPTY); setOpenDialog(true); }}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.greenDark,
                  boxShadow: '0 12px 24px rgba(31, 122, 70, 0.22)',
                  '&:hover': { bgcolor: '#19693b' },
                }}
              >
                Create Schedule
              </Button>
            )}
            {canPublish && (
              <Button
                variant="outlined"
                startIcon={importingExcel ? <CircularProgress size={16} color="inherit" /> : <CloudUpload />}
                onClick={() => excelRef.current?.click()}
                disabled={importingExcel}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  borderColor: GREEN_UI.borderStrong,
                  color: GREEN_UI.greenDark,
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                }}
              >
                {importingExcel ? 'Importing…' : 'Import Excel'}
              </Button>
            )}
            {canPublish && (
              <Button
                variant="outlined"
                startIcon={importingImage ? <CircularProgress size={16} color="inherit" /> : <Image />}
                onClick={() => imageRef.current?.click()}
                disabled={importingImage}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  borderColor: GREEN_UI.borderStrong,
                  color: GREEN_UI.greenDark,
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                }}
              >
                {importingImage ? 'Importing...' : 'Import Image'}
              </Button>
            )}
            <input ref={excelRef} type="file" accept=".xlsx, .xls" style={{ display: 'none' }} onChange={handleExcelImport} />
            <input ref={imageRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageScheduleImport} />
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {scheduleStats.map(stat => (
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

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: '18px', border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={fetchSchedules} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: { xs: 'flex-start', md: 'center' }, flexWrap: 'wrap', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
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
                Schedule Directory
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Search schedules, then narrow records by outlet or branch.
              </Typography>
            </Box>
          </Box>
          <Chip
            icon={<Storefront sx={{ fontSize: '0.9rem !important' }} />}
            label={filterOutlet === 'all' ? 'All Outlets' : displayWorkArea(filterOutlet)}
            size="small"
            variant="outlined"
            sx={{ ...outletChipSx, '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
          />
        </Box>

        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Search Schedules"
              placeholder="Search by ID, employee, position, outlet, week, shift, or status..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={softTextFieldSx}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <ManageSearch sx={{ color: GREEN_UI.greenDark }} fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              select
              label="Filter by Outlet"
              value={filterOutlet}
              onChange={e => setFilterOutlet(e.target.value)}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={softTextFieldSx}
            >
              <MenuItem key="all" value="all">All Outlets</MenuItem>
              {ASSIGNED_WORK_AREAS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CancelOutlined />}
              onClick={handleDeleteSelected}
              disabled={saving || selectedScheduleIds.length === 0}
              sx={{
                ...pillButtonSx,
                height: 40,
                borderColor: '#efb8b8',
                color: '#9c2f2f',
                bgcolor: '#ffffff',
                '&:hover': { borderColor: '#d54b4b', bgcolor: '#fdeaea' },
                '&.Mui-disabled': {
                  borderColor: GREEN_UI.border,
                  color: GREEN_UI.muted,
                  bgcolor: '#ffffff',
                },
              }}
            >
              Delete Selected
            </Button>
          </Grid>
        </Grid>

        {canPublish && (
          <Grid container spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PlaylistAddCheck />}
                onClick={() => toggleSelectAllVisible(!allVisibleSelected)}
                disabled={filtered.length === 0}
                sx={{
                  ...pillButtonSx,
                  height: 40,
                  borderColor: GREEN_UI.borderStrong,
                  color: GREEN_UI.greenDark,
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                }}
              >
                {allVisibleSelected ? 'Clear Visible Selection' : `Select All Visible (${filtered.length})`}
              </Button>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <TaskAlt />}
                onClick={publishSelectedSchedules}
                disabled={saving || selectedScheduleIds.length === 0}
                sx={{
                  ...pillButtonSx,
                  height: 40,
                  bgcolor: GREEN_UI.greenDark,
                  boxShadow: '0 12px 24px rgba(31, 122, 70, 0.20)',
                  '&:hover': { bgcolor: '#19693b' },
                }}
              >
                Publish {selectedScheduleIds.length} Selected
              </Button>
            </Grid>
          </Grid>
        )}
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
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading schedules…</Typography>
          </Box>
        ) : (
          <Table sx={{ minWidth: 1180, '& th, & td': { borderColor: 'rgba(139, 184, 144, 0.16)' } }}>
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
                {canPublish && (
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={allVisibleSelected}
                      indeterminate={partiallyVisibleSelected}
                      onChange={event => toggleSelectAllVisible(event.target.checked)}
                      inputProps={{ 'aria-label': 'Select all visible schedules' }}
                    />
                  </TableCell>
                )}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>ID</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Employee</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Position</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Outlet</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Week</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Break Time</TableCell>
                {DAY_LABELS.map(d => <TableCell key={d} sx={{ whiteSpace: 'nowrap' }}>{d}</TableCell>)}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>Status</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap', minWidth: 230 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canPublish ? 16 : 15} align="center" sx={{ py: 7 }}>
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
                        <InsertDriveFile />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {schedules.length === 0 ? 'No schedules yet' : 'No schedules match your search'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        {schedules.length === 0
                          ? 'Create a weekly schedule or import an Excel file to start assigning shifts.'
                          : 'Try clearing the search or outlet filter to view more schedule records.'}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : filtered.map(s => (
                <TableRow
                  key={s.id}
                  hover
                  sx={{
                    transition: 'background 160ms ease',
                    '&:hover': { bgcolor: 'rgba(231, 247, 229, 0.52)' },
                    '& td': { py: 1.55, color: GREEN_UI.text },
                  }}
                >
                  {canPublish && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedScheduleIds.includes(s.id)}
                        onChange={event => toggleScheduleSelection(s.id, event.target.checked)}
                        inputProps={{ 'aria-label': `Select schedule ${s.id}` }}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <Chip
                      icon={<AssignmentTurnedIn sx={{ fontSize: '0.85rem !important' }} />}
                      label={s.id}
                      size="small"
                      variant="outlined"
                      sx={{fontWeight: 600, bgcolor: '#f8fcf5', borderColor: GREEN_UI.border, '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
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
                        <PersonOutline fontSize="small" />
                      </Box>
                      <Box>
                        <Typography fontWeight={600} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }}>
                          {s.employee || '—'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                          {s.employeeId || 'No employee ID'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <WorkOutline sx={{ fontSize: 17, color: GREEN_UI.greenDark }} />
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                        {s.position || '—'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Chip
                      icon={<Storefront sx={{ fontSize: '0.85rem !important' }} />}
                      label={displayWorkArea(s.outlet) || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ ...outletChipSx, '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <CalendarMonth sx={{ fontSize: 17, color: GREEN_UI.greenDark }} />
                      <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {s.week || '—'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Chip
                      icon={<AccessTime sx={{ fontSize: '0.85rem !important' }} />}
                      label={s.breakTime || '—'}
                      size="small"
                      variant="outlined"
                      sx={{ fontWeight: 600, bgcolor: '#ffffff', borderColor: GREEN_UI.border, color: GREEN_UI.muted, '& .MuiChip-icon': { color: GREEN_UI.muted } }}
                    />
                  </TableCell>
                  {DAYS.map(d => {
                    const shiftValue = (s[d as keyof Schedule] as string) || '—';
                    const isOff = shiftValue === 'Off';
                    return (
                      <TableCell key={d} sx={{ minWidth: 118 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 28,
                            px: 1.1,
                            bgcolor: isOff ? '#f4f7f3' : '#f8fcf5',
                            color: isOff ? '#9aa6a0' : GREEN_UI.text,
                            border: `1px solid ${GREEN_UI.border}`,
                            fontWeight: 600,
                            borderRadius: '8px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {shiftValue}
                        </Typography>
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <Chip label={s.status} size="small" variant="outlined" sx={statusChipSx(s.status)} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {canPublish && (
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        {s.status === 'Draft' && (
                          <Chip
                            icon={<TaskAlt sx={{ fontSize: '0.85rem !important' }} />}
                            label="Publish"
                            size="small"
                            clickable
                            variant="outlined"
                            onClick={() => handlePublish(s)}
                            sx={{ ...actionChipSx('success'), '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                          />
                        )}
                        <Chip
                          icon={<EditIcon sx={{ fontSize: '0.85rem !important' }} />}
                          label="Edit Schedule"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => openEditDialog(s)}
                          sx={{ ...actionChipSx('primary'), '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                        />
                        <Chip
                          icon={<CancelOutlined sx={{ fontSize: '0.85rem !important' }} />}
                          label="Delete"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handleDelete(s.id)}
                          sx={{ ...actionChipSx('danger'), minWidth: 78, '& .MuiChip-icon': { color: '#9c2f2f' } }}
                        />
                      </Box>
                    )}

                    {canConfirm && s.status === 'Published' && (
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip
                          icon={<CheckCircleOutline sx={{ fontSize: '0.85rem !important' }} />}
                          label="Confirm"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handleConfirm(s.id)}
                          sx={{ ...actionChipSx('success'), '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                        />
                        <Chip
                          icon={<CancelOutlined sx={{ fontSize: '0.85rem !important' }} />}
                          label="Decline"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handleDecline(s.id)}
                          sx={{ ...actionChipSx('danger'), '& .MuiChip-icon': { color: '#9c2f2f' } }}
                        />
                      </Box>
                    )}

                    {canConfirm && s.status !== 'Published' && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {s.status === 'Confirmed' && <CheckCircleOutline fontSize="small" sx={{ color: GREEN_UI.greenDark }} />}
                        {s.status === 'Declined' && <CancelOutlined fontSize="small" sx={{ color: '#9c2f2f' }} />}
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontStyle: 'italic', fontWeight: 700 }}>
                          {s.status === 'Confirmed' ? 'Confirmed' : s.status === 'Declined' ? 'Declined' : '—'}
                        </Typography>
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
              <AddCircleOutline fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Create Weekly Schedule
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Assign employee shifts and save them as draft before publishing.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          {importingExcel && <Alert severity="info" sx={{ mb: 2, borderRadius: '16px' }}>⏳ Importing from Excel…</Alert>}
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <PersonOutline sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Employee Assignment</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  multiple
                  options={employeeList}
                  getOptionLabel={(option) => option.name}
                  value={employeeList.filter(emp => selectedEmployeeIds.includes(emp.employeeId))}
                  onChange={(_, selected) => {
                    const ids = selected.map(emp => emp.employeeId);
                    const first = selected[0];
                    setSelectedEmployeeIds(ids);
                    setForm(prev => ({
                      ...prev,
                      employeeId: first?.employeeId ?? "",
                      employee: first?.name ?? "",
                      position: first?.position ?? "",
                      outlet: first?.outlet ?? "",
                    }));
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      required
                      label="Choose Employees"
                      placeholder="Select employees"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Position"
                  value={form.position}
                  size="small"
                  sx={softTextFieldSx}
                  onChange={e => setForm({ ...form, position: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem key="pos-empty" value="">Select position…</MenuItem>
                  {AVAILABLE_POSITIONS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Outlet / Branch"
                  value={form.outlet}
                  size="small"
                  sx={softTextFieldSx}
                  disabled={selectedEmployeeIds.length === 1 && hasEmployeeOutlet(form.employeeId)}
                  onChange={e => setForm(prev => ({ ...prev, outlet: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem key="outlet-empty" value="">Select outlet</MenuItem>
                  {OUTLETS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <CalendarMonth sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Week and Break Setup</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Week Period"
                  required
                  value={form.week}
                  onChange={e => setForm({ ...form, week: e.target.value })}
                  placeholder="e.g. May 12–18, 2026"
                  size="small"
                  sx={softTextFieldSx}
                />
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.9, flexWrap: 'wrap' }}>
                  <Chip
                    icon={<CalendarMonth sx={{ fontSize: '0.85rem !important' }} />}
                    label="This Week"
                    size="small"
                    variant="outlined"
                    clickable
                    onClick={() => setForm({ ...form, week: getWeekRange(0) })}
                    sx={{ ...actionChipSx('primary'), minWidth: 102, '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                  />
                  <Chip
                    icon={<CalendarMonth sx={{ fontSize: '0.85rem !important' }} />}
                    label="Next Week"
                    size="small"
                    variant="outlined"
                    clickable
                    onClick={() => setForm({ ...form, week: getWeekRange(1) })}
                    sx={{ ...actionChipSx('neutral'), minWidth: 102, '& .MuiChip-icon': { color: GREEN_UI.muted } }}
                  />
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Autocomplete
                  freeSolo
                  options={BREAK_TIME_OPTIONS}
                  value={form.breakTime}
                  onChange={(_, v) => setForm({ ...form, breakTime: v ?? '' })}
                  onInputChange={(_, v) => setForm({ ...form, breakTime: v })}
                  renderInput={(params) => (
                    <TextField {...params} fullWidth label="Break Time" placeholder="e.g. 1 hour" size="small" InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
                  )}
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <AccessTime sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Daily Schedule Assignment</Typography>
            </Box>
            <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Schedule Time In"
                  type="time"
                  value={form.timeIn}
                  onChange={e => setForm({ ...form, timeIn: e.target.value })}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  fullWidth
                  label="Schedule Time Out"
                  type="time"
                  value={form.timeOut}
                  onChange={e => setForm({ ...form, timeOut: e.target.value })}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={softTextFieldSx}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700, display: 'block', mb: 0.75 }}>
                  Applicable Workdays
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {DAYS.map(day => (
                    <Chip
                      key={day}
                      label={DAY_NAMES[day]}
                      size="small"
                      clickable
                      color={applicableWorkdays.includes(day) ? 'success' : 'default'}
                      variant={applicableWorkdays.includes(day) ? 'filled' : 'outlined'}
                      onClick={() => setApplicableWorkdays(prev =>
                        prev.includes(day) ? prev.filter(value => value !== day) : [...prev, day]
                      )}
                      sx={{ fontWeight: 700 }}
                    />
                  ))}
                  <Chip
                    label="Apply"
                    size="small"
                    clickable
                    color="primary"
                    onClick={applySelectedWorkdays}
                    sx={{ fontWeight: 700 }}
                  />
                </Box>
              </Grid>
            </Grid>
            <Grid container spacing={1.5}>
              {DAYS.map(day => (
                <Grid key={day} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Autocomplete
                    freeSolo
                    options={SHIFT_PRESETS}
                    value={form[day as keyof typeof form] || ''}
                    onChange={(_, v) => setForm({ ...form, [day]: v ?? '' })}
                    onInputChange={(_, v) => setForm({ ...form, [day]: v })}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label={day.charAt(0).toUpperCase() + day.slice(1)}
                        placeholder="e.g. 8:00 AM – 5:00 PM"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        sx={softTextFieldSx}
                      />
                    )}
                  />
                </Grid>
              ))}
            </Grid>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#fbfff9', borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button startIcon={<CancelOutlined />} onClick={() => setOpenDialog(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveDraft}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <TaskAlt />}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            {saving ? 'Saving…' : 'Save as Draft'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editDialog}
        onClose={() => setEditDialog(false)}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box sx={{ width: 40, height: 40, borderRadius: '16px', display: 'grid', placeItems: 'center', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
              <EditIcon fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Edit Schedule — {editRecord?.id}
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Updating a schedule returns it to draft and notifies the employee.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          <Alert severity="warning" icon={<EditIcon fontSize="inherit" />} sx={{ mb: 2, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}` }}>
            Saving will reset this schedule&apos;s status to <strong>Draft</strong> and notify the employee to re-confirm.
          </Alert>

          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <PersonOutline sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Employee Assignment</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Employee Name"
                  required
                  value={editForm.employee}
                  onChange={e => setEditForm({ ...editForm, employee: e.target.value })}
                  size="small"
                  sx={softTextFieldSx}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Position"
                  value={editForm.position}
                  onChange={e => setEditForm({ ...editForm, position: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                >
                  <MenuItem key="edit-pos-empty" value="">Select position…</MenuItem>
                  {AVAILABLE_POSITIONS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Outlet / Branch"
                  value={editForm.outlet}
                  disabled={hasEmployeeOutlet(editRecord?.employeeId ?? editForm.employeeId)}
                  onChange={e => setEditForm(prev => ({ ...prev, outlet: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                >
                  <MenuItem key="edit-outlet-empty" value="">Select outlet…</MenuItem>
                  {OUTLETS.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <CalendarMonth sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Week and Break Setup</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Week Period"
                  required
                  value={editForm.week}
                  onChange={e => setEditForm({ ...editForm, week: e.target.value })}
                  placeholder="e.g. May 12–18, 2026"
                  size="small"
                  sx={softTextFieldSx}
                />
                <Box sx={{ display: 'flex', gap: 0.75, mt: 0.9, flexWrap: 'wrap' }}>
                  <Chip
                    icon={<CalendarMonth sx={{ fontSize: '0.85rem !important' }} />}
                    label="This Week"
                    size="small"
                    variant="outlined"
                    clickable
                    onClick={() => setEditForm({ ...editForm, week: getWeekRange(0) })}
                    sx={{ ...actionChipSx('primary'), minWidth: 102, '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                  />
                  <Chip
                    icon={<CalendarMonth sx={{ fontSize: '0.85rem !important' }} />}
                    label="Next Week"
                    size="small"
                    variant="outlined"
                    clickable
                    onClick={() => setEditForm({ ...editForm, week: getWeekRange(1) })}
                    sx={{ ...actionChipSx('neutral'), minWidth: 102, '& .MuiChip-icon': { color: GREEN_UI.muted } }}
                  />
                </Box>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Autocomplete
                  freeSolo
                  options={BREAK_TIME_OPTIONS}
                  value={editForm.breakTime}
                  onChange={(_, v) => setEditForm({ ...editForm, breakTime: v ?? '' })}
                  onInputChange={(_, v) => setEditForm({ ...editForm, breakTime: v })}
                  renderInput={(params) => (
                    <TextField {...params} fullWidth label="Break Time" placeholder="e.g. 1 hour" size="small" InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
                  )}
                />
              </Grid>
            </Grid>
          </Paper>

          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <AccessTime sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Daily Schedule Assignment</Typography>
            </Box>
            <Grid container spacing={1.5}>
              {DAYS.map(day => (
                <Grid key={day} size={{ xs: 12, sm: 6, md: 3 }}>
                  <Autocomplete
                    freeSolo
                    options={SHIFT_PRESETS}
                    value={editForm[day as keyof typeof editForm] || ''}
                    onChange={(_, v) => setEditForm({ ...editForm, [day]: v ?? '' })}
                    onInputChange={(_, v) => setEditForm({ ...editForm, [day]: v })}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        fullWidth
                        label={day.charAt(0).toUpperCase() + day.slice(1)}
                        placeholder="e.g. 8:00 AM – 5:00 PM"
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        sx={softTextFieldSx}
                      />
                    )}
                  />
                </Grid>
              ))}
            </Grid>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#fbfff9', borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button startIcon={<CancelOutlined />} onClick={() => setEditDialog(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <TaskAlt />}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
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
