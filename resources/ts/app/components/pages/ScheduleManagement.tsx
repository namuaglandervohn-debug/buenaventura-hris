import { formatDisplayDate, formatDisplayDateRange, formatTypedDateDigits, parseDisplayDate, parseScheduleDateRange } from '../../lib/displayDate';
import TextField from '../DateTextField';
import ProfilePhotoAvatar from '../ProfilePhotoAvatar';
import { useProfilePhotoDirectory } from '../../lib/useProfilePhotoDirectory';
import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Dialog, DialogTitle,
  DialogContent, DialogActions, Menu, MenuItem, Chip, Grid,
  CircularProgress, Alert, Tooltip, InputAdornment,
  Checkbox,
  Autocomplete,
  Radio,
  RadioGroup,
  FormControlLabel,
} from '../bootstrap';
import {
  AccessTime,
  AddCircleOutline,
  AssignmentTurnedIn,
  CalendarMonth,
  CancelOutlined,
  CheckCircleOutline,
  CloudUpload,
  DoneAll,
  Download,
  EditOutlined as EditIcon,
  EventAvailable,
  Image,
  InsertDriveFile,
  ManageSearch,
  PersonOutline,
  PlaylistAddCheck,
  Print,
  Storefront,
  Sync,
  TaskAlt,
  ViewWeek,
  WorkOutline,
} from '../bootstrap/icons';
import * as XLSX from 'xlsx';
import { supabase } from "../../lib/supabaseClient";
import { NO_OUTLET, OUTLETS } from '../../lib/constants';
import { includeSelectedJobTitle } from '../../lib/jobTitles';
import { useJobTitleOptions } from '../../lib/useJobTitleOptions';
import { parseRegularScheduleShift, splitShiftExample } from '../../lib/regularScheduleShift';
import { normalizePhotoShift, parseSchedulePhoto, readSchedulePhotoPage, readScheduleWithCrop, UnreadableSchedulePhoto } from '../../lib/scheduleImageImport';
import { findAutomaticScheduleCrop } from '../../lib/scheduleImageCrop';
import ActionSnackbar from '../ActionSnackbar';
import ScheduleImageCropDialog from '../ScheduleImageCropDialog';
import ScheduleSwapRequests from './ScheduleSwapRequests';

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

interface ScheduleEmployeeOption {
  employeeId: string;
  name: string;
  aliases: string[];
  position: string;
  outlet: string;
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type ScheduleDay = (typeof DAYS)[number];
type ImageScheduleDraftRow = { detectedName: string; employeeId: string; shifts: Record<ScheduleDay, string>; uncertainDays: ScheduleDay[] };
const DEFAULT_WORKDAYS: ScheduleDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const REST_DAY = 'Rest Day';
const REST_DAY_OPTIONS: readonly ScheduleDay[] = ['sunday', ...DAYS.slice(0, -1)];
const DAY_NAMES: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function scheduleDays(draft: Record<ScheduleDay, string>, existing?: Schedule) {
  return Object.fromEntries(DAYS.map(day => {
    if (draft[day] === existing?.[day]) return [day, draft[day]];
    const value = draft[day].trim();
    if (!value) return [day, ''];
    if (/^off$/i.test(value)) return [day, 'Off'];
    if (/^leave$/i.test(value)) return [day, 'Leave'];
    if (/^(rd|rest day)$/i.test(value)) return [day, REST_DAY];
    if (/^(flex|suspended)$/i.test(value)) return [day, value.toUpperCase()];

    const shift = parseRegularScheduleShift(value);
    if (!shift) throw new Error(`${DAY_NAMES[day]} needs valid, non-overlapping times such as ${splitShiftExample}.`);
    return [day, shift.label];
  }));
}

const BULK_TIME_FIELDS = [
  ['morningIn', 'Morning Time In'],
  ['morningOut', 'Morning Time Out'],
  ['afternoonIn', 'Afternoon Time In'],
  ['afternoonOut', 'Afternoon Time Out'],
] as const;
const EMPTY_BULK_TIMES = { morningIn: '', morningOut: '', afternoonIn: '', afternoonOut: '' };

const EMPTY = {
  employeeId: '',
  employee: '',
  position: '',
  outlet: '',
  week: '',
  timeIn: '',
  timeOut: '',
  bulkTimes: EMPTY_BULK_TIMES,
  lastAppliedShift: '',
  breakTime: '1 hour',
  monday: '',
  tuesday: '',
  wednesday: '',
  thursday: '',
  friday: '',
  saturday: '',
  sunday: '',
};

const EMPTY_SPECIAL_DUTY = {
  employeeIds: [] as string[],
  position: '',
  outlet: '',
  dutyDate: '',
  shift: '',
  breakTime: '1 hour',
  reason: '',
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
const SPECIAL_DUTY_SEPARATOR = ' | Special Duty: ';
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
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DATE_DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const parseDateInput = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const stripSpecialDutyReason = (week: string) => String(week ?? '').split(SPECIAL_DUTY_SEPARATOR)[0].trim();
const getSpecialDutyReason = (week: string) => String(week ?? '').split(SPECIAL_DUTY_SEPARATOR)[1]?.trim() ?? '';

const formatWeekRangeFromDate = (value: string) => {
  const selected = parseDateInput(value);
  if (!selected) return '';

  const day = selected.getDay();
  const monday = new Date(selected);
  monday.setDate(selected.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mDay = monday.getDate(), sDay = sunday.getDate();
  const mMonth = monday.getMonth(), sMonth = sunday.getMonth();
  const year = sunday.getFullYear();
  if (mMonth === sMonth) return `${MONTHS[mMonth]} ${mDay}–${sDay}, ${year}`;
  return `${MONTHS[mMonth]} ${mDay} – ${MONTHS[sMonth]} ${sDay}, ${year}`;
};

const normalizeWeekInput = (value: string) => {
  const match = /^(\d{1,2}\/\d{1,2}\/\d{4})\s*[-–—]\s*(\d{1,2}\/\d{1,2}\/\d{4})$/.exec(value);
  if (!match) return value;
  const start = parseDateInput(parseDisplayDate(match[1]));
  const end = parseDateInput(parseDisplayDate(match[2]));
  if (!start || !end || start > end) return value;
  const startLabel = MONTHS[start.getMonth()] + ' ' + start.getDate();
  const endLabel = start.getMonth() === end.getMonth() ? end.getDate() : MONTHS[end.getMonth()] + ' ' + end.getDate();
  return startLabel + ' – ' + endLabel + ', ' + end.getFullYear();
};

const updateWeekInput = (value: string) => {
  const range = /^(\d{2}\/\d{2}\/\d{4})(?:\s*[-–—]\s*)?(\d[\d/]*)$/.exec(value);
  if (range) {
    const end = /^(?:\d+|\d{2}\/\d{3,6})$/.test(range[2]) ? formatTypedDateDigits(range[2].replace(/\//g, '')) : range[2];
    return normalizeWeekInput(`${range[1]} – ${end}`);
  }
  if (/^\d{1,16}$/.test(value)) {
    const start = formatTypedDateDigits(value);
    return value.length > 8 ? normalizeWeekInput(`${start} – ${formatTypedDateDigits(value.slice(8))}`) : start;
  }
  if (/^\d{2}\/\d{3,6}$/.test(value)) return formatTypedDateDigits(value.replace(/\//g, ''));
  return normalizeWeekInput(value);
};

const parseWeekRange = (week: string) => {
  const range = parseScheduleDateRange(week);
  return range ? { start: new Date(range.start + 'T00:00:00'), end: new Date(range.end + 'T00:00:00') } : null;
};

const isDateInScheduleWeek = (week: string, value: string) => {
  const selected = parseDateInput(value);
  const range = parseWeekRange(week);
  if (!selected || !range) return stripSpecialDutyReason(week) === formatWeekRangeFromDate(value);
  return selected >= range.start && selected <= range.end;
};

const hasScheduledShift = (value?: string | null) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return Boolean(normalized) && !['-', '—', 'off', 'rd', 'rest day', 'suspended'].includes(normalized);
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
  fontWeight: 700,
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
  const mDay = monday.getDate(), sDay = sunday.getDate();
  const mMonth = monday.getMonth(), sMonth = sunday.getMonth();
  const year = sunday.getFullYear();
  if (mMonth === sMonth) return `${MONTHS[mMonth]} ${mDay}–${sDay}, ${year}`;
  return `${MONTHS[mMonth]} ${mDay} – ${MONTHS[sMonth]} ${sDay}, ${year}`;
};

function WeeklySchedule({ schedules, onRequestSwap, showSwapRequest = false }: {
  schedules: Schedule[];
  onRequestSwap?: () => void;
  showSwapRequest?: boolean;
}) {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState('All Outlets');
  const tableRef = useRef<HTMLTableElement>(null);
  const weeks = new Map<string, { label: string; start: Date | undefined; rows: Schedule[] }>();
  for (const schedule of schedules) {
    const week = stripSpecialDutyReason(schedule.week);
    const range = parseWeekRange(week);
    const start = range ? new Date(range.start) : undefined;
    let label = formatDisplayDateRange(normalizeWeekInput(week)) || 'Unspecified week';
    if (start && range && +range.start === +range.end) {
      start.setDate(start.getDate() - (start.getDay() + 6) % 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const dateLabel = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
      label = `${dateLabel.format(start)} – ${dateLabel.format(end)}`;
    }
    const key = start ? String(+start) : `label:${week}`;
    const existing = weeks.get(key);
    if (existing) {
      existing.rows.push(schedule);
    } else {
      weeks.set(key, {
        label,
        start,
        rows: [schedule],
      });
    }
  }
  const options = [...weeks].sort(([, left], [, right]) =>
    (right.start?.getTime() ?? -Infinity) - (left.start?.getTime() ?? -Infinity)
      || left.label.localeCompare(right.label));
  const activeWeek = selectedWeek !== null && weeks.has(selectedWeek) ? selectedWeek : options[0]?.[0];
  const roster = activeWeek === undefined ? undefined : weeks.get(activeWeek);
  if (!roster) return null;

  const groups = new Map<string, Schedule[]>();
  for (const schedule of roster.rows) {
    const outlet = displayWorkArea(schedule.outlet) || 'No Outlet';
    const group = groups.get(outlet) ?? [];
    group.push(schedule);
    groups.set(outlet, group);
  }
  const weekDates = DAYS.map((_, index) => {
    if (!roster.start) return '';
    const date = new Date(roster.start);
    date.setDate(date.getDate() + index);
    return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(date);
  });
  const outletGroups = [...groups].sort(([left], [right]) => left.localeCompare(right));
  for (const [, rows] of outletGroups) {
    rows.sort((left, right) => left.employee.localeCompare(right.employee));
  }
  const outletOptions = ['All Outlets', ...outletGroups.map(([outlet]) => outlet)];
  const activeOutlet = outletOptions.includes(selectedOutlet) ? selectedOutlet : 'All Outlets';
  const visibleOutletGroups = activeOutlet === 'All Outlets'
    ? outletGroups
    : outletGroups.filter(([outlet]) => outlet === activeOutlet);

  const downloadCsv = () => {
    const header = ['Outlet', 'Name', 'Position', ...DAY_LABELS.map((day, index) =>
      weekDates[index] ? `${day} ${weekDates[index]}` : day), 'Schedule Status', 'Special Duty'];
    const rows = visibleOutletGroups.flatMap(([outlet, schedules]) => schedules.map(schedule => [
      outlet, schedule.employee, schedule.position,
      ...DAYS.map(day => {
        const shift = schedule[day].trim();
        return /^(rd|rest day)$/i.test(shift) ? REST_DAY : shift;
      }),
      schedule.status,
      getSpecialDutyReason(schedule.week),
    ]));
    const csv = [header, ...rows].map(row => row.map(value => {
      const cell = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
      return `"${cell.replace(/"/g, '""')}"`;
    }).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `weekly-employee-schedule-${roster.label.replace(/[^a-z0-9]+/gi, '-')}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printSchedule = () => {
    const table = tableRef.current;
    if (!table) return;
    const printWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!printWindow) return;

    const doc = printWindow.document;
    doc.title = 'Weekly Employee Schedule';
    const style = doc.createElement('style');
    style.textContent = `
      @page { size: A4 landscape; margin: 12mm; }
      body { font: 11px Arial, sans-serif; color: #173421; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      p { margin: 0 0 12px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th, td { border: 1px solid #b7d5be; padding: 6px; overflow-wrap: anywhere; }
      thead th { background: #e6f8e9; }
      th[scope="rowgroup"] { background: #e6f8e9; text-align: left; }
      th[scope="row"] { text-align: left; }
      th span { display: block; font-size: 10px; }
      td[align="center"] { white-space: pre-line; }
      tr { break-inside: avoid; }
    `;
    doc.head.append(style);
    const title = doc.createElement('h1');
    title.textContent = 'Weekly Employee Schedule';
    const period = doc.createElement('p');
    period.textContent = roster.label;
    doc.body.append(title, period, doc.importNode(table, true));
    printWindow.focus();
    printWindow.print();
  };

  return (
    <Paper component="section" aria-labelledby="weekly-schedule-title" elevation={0}
      sx={{ mt: 3, overflow: 'hidden', borderRadius: { xs: 3, sm: 4 }, border: `1px solid ${GREEN_UI.border}`, bgcolor: '#fbfff9' }}>
      <Box sx={{
        bgcolor: GREEN_UI.greenDark, color: '#fff', px: { xs: 1.5, sm: 2.5 }, py: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2,
      }}>
        <Box>
          <Typography id="weekly-schedule-title" component="h2" variant="h6" fontWeight={800}>
            Weekly Employee Schedule
          </Typography>
          <Typography variant="body2">{roster.label}</Typography>
        </Box>
        <Box sx={{ ml: 'auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
          {options.length > 1 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 210 }}>
              <Typography variant="caption" sx={{ color: '#fff', pl: 0.5, lineHeight: 1.2, mb: 0.35 }}>Schedule week</Typography>
              <TextField select size="small" value={activeWeek}
                onChange={event => setSelectedWeek(event.target.value)}
                inputProps={{ 'aria-label': 'Schedule week' }}
                sx={{
                  ...softTextFieldSx,
                  minWidth: 210,
                  '& .MuiInputBase-root, & .hris-field, & .form-select': { height: 36, minHeight: 36 },
                  '& .form-select': { padding: '0 12px' },
                }}>
                {options.map(([key, option]) => <MenuItem key={key} value={key}>{option.label}</MenuItem>)}
              </TextField>
            </Box>
          )}
          {outletOptions.length > 2 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 170 }}>
              <Typography variant="caption" sx={{ color: '#fff', pl: 0.5, lineHeight: 1.2, mb: 0.35 }}>Filter outlet</Typography>
              <TextField select size="small" value={activeOutlet}
                onChange={event => setSelectedOutlet(event.target.value)}
                inputProps={{ 'aria-label': 'Filter outlet' }}
                sx={{
                  ...softTextFieldSx,
                  minWidth: 170,
                  '& .MuiInputBase-root, & .hris-field, & .form-select': { height: 36, minHeight: 36 },
                  '& .form-select': { padding: '0 12px' },
                }}>
                {outletOptions.map(outlet => <MenuItem key={outlet} value={outlet}>{outlet}</MenuItem>)}
              </TextField>
            </Box>
          )}
          <Button variant="outlined" className="hris-toolbar-action" size="small" startIcon={<Print />} onClick={printSchedule}>
            Print
          </Button>
          <Button variant="outlined" className="hris-toolbar-action" size="small" startIcon={<Download />} onClick={downloadCsv}>
            Download CSV
          </Button>
          {showSwapRequest && onRequestSwap && (
            <Button variant="outlined" className="hris-toolbar-action" size="small" startIcon={<Sync />} onClick={onRequestSwap}>
              Request Schedule Swap
            </Button>
          )}
        </Box>
      </Box>
      <Box sx={{ p: { xs: 1.5, sm: 2.5 } }}>
        <TableContainer tabIndex={0} role="region" aria-label="Weekly roster"
          sx={{ border: `1px solid ${GREEN_UI.borderStrong}`, borderRadius: 2 }}>
          <Table ref={tableRef} size="small" aria-label="Employee shifts by outlet and weekday" sx={{
            minWidth: 1080,
            tableLayout: 'fixed',
            '& .MuiTableCell-root': { py: 1, px: 1.25, borderBottom: `1px solid ${GREEN_UI.border}`, borderRight: `1px solid ${GREEN_UI.border}` },
            '& .MuiTableCell-head': { bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark, fontWeight: 800 },
          }}>
            <TableHead>
              <TableRow>
                <TableCell scope="col" sx={{ width: 160 }}>Name</TableCell>
                <TableCell scope="col" sx={{ width: 116 }}>Position</TableCell>
                {DAYS.map((day, index) => (
                  <TableCell key={day} scope="col" align="center">
                    {DAY_LABELS[index]}
                    {weekDates[index] && <Typography variant="caption" component="span" sx={{ display: 'block' }}>{weekDates[index]}</Typography>}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            {visibleOutletGroups.map(([outlet, rows]) => (
              <TableBody key={outlet}>
                <TableRow>
                  <TableCell component="th" scope="rowgroup" colSpan={10}
                    sx={{ bgcolor: GREEN_UI.greenDark, color: '#fff', fontWeight: 800 }}>{outlet}</TableCell>
                </TableRow>
                {rows.map(schedule => {
                  const specialDuty = getSpecialDutyReason(schedule.week);
                  return (
                    <TableRow key={schedule.id} sx={{ bgcolor: GREEN_UI.cardBg }}>
                      <TableCell component="th" scope="row" sx={{ fontWeight: 700 }}>
                        {schedule.employee}
                        {specialDuty && <Typography variant="caption" component="span" sx={{ display: 'block', color: GREEN_UI.muted }}>Special Duty · {specialDuty}</Typography>}
                      </TableCell>
                      <TableCell>{schedule.position || '—'}</TableCell>
                      {DAYS.map(day => {
                        const shift = schedule[day].trim();
                        const restDay = /^(rd|rest day)$/i.test(shift);
                        return (
                          <TableCell key={day} align="center" sx={{
                            bgcolor: restDay ? GREEN_UI.greenSoft : GREEN_UI.cardBgSoft,
                            color: restDay ? GREEN_UI.greenDark : GREEN_UI.text,
                            fontWeight: restDay ? 700 : 500,
                            whiteSpace: 'pre-line',
                            fontSize: '0.75rem',
                          }}>
                            {restDay ? REST_DAY : shift.replace(/\s*\/\s*/g, '\n') || '—'}
                          </TableCell>
                        );
                      })}
                  <TableCell>
                    <Chip size="small" variant="outlined" label={schedule.status}
                      color={schedule.status === 'Confirmed' ? 'success' : 'info'} />
                  </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            ))}
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  );
}

export default function ScheduleManagement() {
  const { user } = useAuth();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [overviewSchedules, setOverviewSchedules] = useState<Schedule[]>([]);
  const [openSwapRequest, setOpenSwapRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [filterOutlet, setFilterOutlet] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<string[]>([]);
  const [editDialog, setEditDialog] = useState(false);
  const jobTitleOptions = useJobTitleOptions(openDialog || editDialog);
  const [editRecord, setEditRecord] = useState<Schedule | null>(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [applicableWorkdays, setApplicableWorkdays] = useState(DEFAULT_WORKDAYS);
  const [restDayAnchor, setRestDayAnchor] = useState<HTMLElement | null>(null);
  const [scheduleType, setScheduleType] = useState<'regular' | 'special'>('regular');
  const [specialDutyForm, setSpecialDutyForm] = useState(EMPTY_SPECIAL_DUTY);

  // Employee list with position + outlet for auto-fill
  const [employeeList, setEmployeeList] = useState<ScheduleEmployeeOption[]>([]);
  const excelRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importingImage, setImportingImage] = useState(false);
  const [imageCropFile, setImageCropFile] = useState<File | null>(null);
  const [imageCropError, setImageCropError] = useState('');
  const [imageReviewOpen, setImageReviewOpen] = useState(false);
  const [imageReviewRows, setImageReviewRows] = useState<ImageScheduleDraftRow[]>([]);
  const [imageReviewWeek, setImageReviewWeek] = useState('');
  const [imageReviewError, setImageReviewError] = useState('');

  const currentRole = String((user as any)?.role ?? '').toLowerCase();
  const currentEmployeeId = String((user as any)?.employee_id ?? (user as any)?.employeeId ?? '');
  const currentUserName = String((user as any)?.name ?? (user as any)?.full_name ?? (user as any)?.email ?? 'User');
  const canManageSchedule = currentRole === 'supervisor' || currentRole.includes('supervisor');
  const canValidateSchedule = currentRole === 'hr' || currentRole === 'hr_admin' || currentRole.includes('hr_admin');
  const canSelectSchedule = canManageSchedule || canValidateSchedule;
  const canSeeScheduleRoster = canSelectSchedule || currentRole === 'employee' || currentRole.includes('employee');
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

    let employeeOverviewRows: any[] = [];
    if (canConfirm) {
      const { data, error } = await supabase.rpc('get_employee_schedule_overview');
      if (error) throw error;
      employeeOverviewRows = data ?? [];
    }

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
      // A schedule may assign the employee to a different work outlet than their home outlet.
      outlet: displayWorkArea(s.outlet || employeeMap.get(s.employee_id)?.outlet || ""),
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
    if (canConfirm) {
      const mappedOverview: Schedule[] = employeeOverviewRows.map((row: any) => ({
        id: String(row.schedule_id ?? ''),
        employeeId: String(row.employee_id ?? ''),
        employee: String(row.employee_name ?? '—'),
        position: String(row.position ?? ''),
        outlet: displayWorkArea(String(row.outlet ?? '')),
        week: String(row.week ?? ''),
        timeIn: String(row.time_in ?? ''),
        timeOut: String(row.time_out ?? ''),
        breakTime: String(row.break_time ?? ''),
        monday: String(row.monday ?? ''),
        tuesday: String(row.tuesday ?? ''),
        wednesday: String(row.wednesday ?? ''),
        thursday: String(row.thursday ?? ''),
        friday: String(row.friday ?? ''),
        saturday: String(row.saturday ?? ''),
        sunday: String(row.sunday ?? ''),
        status: row.status === 'Confirmed' ? 'Confirmed' : 'Published',
      }));
      setOverviewSchedules(sortSchedulesByEmployeeName(mappedOverview));
    } else {
      setOverviewSchedules([]);
    }
  } catch (e: any) {
    setError(`Could not load schedules: ${e.message}`);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    void fetchSchedules();
    const channel = supabase.channel('schedule-management-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule' }, () => {
        void fetchSchedules();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  const loadScheduleEmployees = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status")
      .neq("status", "Resigned")
      .order("first_name", { ascending: true });

    if (error) throw error;

    const { data: userAccountsData, error: userAccountsError } = await supabase
      .from("user_accounts")
      .select("employee_id, full_name, outlet");

    if (userAccountsError) throw userAccountsError;

    const accountsByEmployee = new Map<string, any[]>();
    (userAccountsData ?? []).forEach((account: any) => {
      const rows = accountsByEmployee.get(String(account.employee_id ?? '')) ?? [];
      rows.push(account);
      accountsByEmployee.set(String(account.employee_id ?? ''), rows);
    });

    return (data ?? []).map((e: any): ScheduleEmployeeOption => {
      const employeeId = String(e.employee_id ?? '');
      const name = `${e.first_name ?? ""} ${e.middle_name ?? ""} ${e.last_name ?? ""} ${e.suffix ?? ""}`
        .replace(/\s+/g, " ")
        .trim();
      const accounts = accountsByEmployee.get(employeeId) ?? [];
      return {
        employeeId,
        name,
        aliases: Array.from(new Set([name, String(e.last_name ?? '').trim(), ...accounts.map((account: any) => String(account.full_name ?? '').trim())].filter(Boolean))),
        position: e.position ?? "",
        outlet: accounts.find((account: any) => account.outlet)?.outlet || e.outlet || "",
      };
    });
  };

  // Fetch employee list — includes names, aliases, position, and outlet.
  useEffect(() => {
    void loadScheduleEmployees().then(setEmployeeList).catch(error => console.error("Failed to fetch schedule employees:", error));
  }, []);

  const getEmployeeById = (employeeId: string) =>
    employeeList.find(emp => emp.employeeId === employeeId);

  const { morningIn, morningOut, afternoonIn, afternoonOut } = form.bulkTimes;
  const morning = `${morningIn} - ${morningOut}`;
  const hasCompleteBulkTimes = Boolean(morningIn && morningOut && Boolean(afternoonIn) === Boolean(afternoonOut));
  const bulkShift = hasCompleteBulkTimes ? parseRegularScheduleShift(afternoonIn
    ? `${morning} / ${afternoonIn} - ${afternoonOut}`
    : morning) : null;
  const isAvailableForBulk = (day: ScheduleDay) => /^(off)?$/i.test(form[day].trim());
  const workdaysToApply = applicableWorkdays.filter(isAvailableForBulk);
  const canApplyBulkShift = Boolean(bulkShift && bulkShift.label !== form.lastAppliedShift && workdaysToApply.length);

  const applySelectedWorkdays = () => {
    if (!bulkShift || !canApplyBulkShift) return;
    setForm(prev => {
      const next = {
        ...prev,
        timeIn: bulkShift.timeIn,
        timeOut: bulkShift.timeOut,
        lastAppliedShift: bulkShift.label,
      };
      for (const day of workdaysToApply) next[day] = bulkShift.label;
      return next;
    });
    setApplicableWorkdays([]);
  };

  const markRestDay = (day: ScheduleDay) => {
    setForm(prev => ({ ...prev, [day]: REST_DAY }));
    setApplicableWorkdays(prev => prev.filter(workday => workday !== day));
    setRestDayAnchor(null);
  };

  const renderScheduleDays = (draft: typeof EMPTY, setDraft: typeof setForm) => (
    <Grid container spacing={1.5}>
      <Grid size={12}>
        <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
          Enter morning and afternoon time ranges, for example {splitShiftExample}. Enter Off for a day off.
        </Typography>
      </Grid>
      {DAYS.map(day => (
        <Grid key={day} size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label={DAY_NAMES[day]}
            placeholder={splitShiftExample}
            value={draft[day]}
            onChange={event => setDraft(prev => ({ ...prev, [day]: event.target.value }))}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={softTextFieldSx}
          />
        </Grid>
      ))}
    </Grid>
  );

  const handleSaveDraft = async () => {
  try {
    if (!canManageSchedule) throw new Error('Only Supervisors can create employee schedules.');
    setSaving(true);
    const employeeIds = selectedEmployeeIds.length > 0 ? selectedEmployeeIds : [form.employeeId].filter(Boolean);
    if (employeeIds.length === 0) throw new Error('Please choose at least one employee.');

    const days = scheduleDays(form);
    const scheduleIds = await nextScheduleIds(employeeIds.length);
    const payload = employeeIds.map((employeeId, index) => {
      const selectedEmployee = getEmployeeById(employeeId);
      const employeePosition = selectedEmployee?.position || form.position || "";
      const scheduleOutlet = form.outlet === NO_OUTLET ? "" : form.outlet || "";

      return {
        schedule_id: scheduleIds[index],
        employee_id: employeeId,
        position: employeePosition,
        outlet: scheduleOutlet,
        week: form.week ?? "",
        time_in: form.timeIn || null,
        time_out: form.timeOut || null,
        break_time: form.breakTime ?? "",
        ...days,
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

  const resetSpecialDutyForm = () => {
    setSpecialDutyForm(EMPTY_SPECIAL_DUTY);
  };

  const handleSaveSpecialDuty = async () => {
    if (!canManageSchedule) {
      setSnackbar({ open: true, message: 'Only Supervisors can create special duty schedules.', severity: 'error' });
      return;
    }
    const selectedEmployees = specialDutyForm.employeeIds
      .map(employeeId => getEmployeeById(employeeId))
      .filter(Boolean) as NonNullable<ReturnType<typeof getEmployeeById>>[];
    const dutyDate = specialDutyForm.dutyDate;
    const selectedDate = parseDateInput(dutyDate);
    const dayKey = selectedDate ? DATE_DAY_KEYS[selectedDate.getDay()] : '';
    const enteredShift = specialDutyForm.shift.trim();
    const namedShift = /^.+\((.+)\)$/.exec(enteredShift)?.[1]?.trim();
    const parsedShift = parseRegularScheduleShift(namedShift || enteredShift);
    const reason = specialDutyForm.reason.trim();
    const weekRange = formatWeekRangeFromDate(dutyDate);

    if (selectedEmployees.length === 0) {
      setSnackbar({ open: true, message: 'Choose at least one employee for the special duty assignment.', severity: 'error' });
      return;
    }

    if (!selectedDate || !dayKey || !weekRange) {
      setSnackbar({ open: true, message: 'Choose a valid additional duty date.', severity: 'error' });
      return;
    }

    if (!parsedShift) {
      setSnackbar({ open: true, message: `Select or enter a valid duty shift, such as ${splitShiftExample}.`, severity: 'error' });
      return;
    }

    if (!reason) {
      setSnackbar({ open: true, message: 'Enter the reason for this additional duty assignment.', severity: 'error' });
      return;
    }

    const conflict = schedules.find(schedule => {
      const isSelectedEmployee = selectedEmployees.some(employee => employee.employeeId === schedule.employeeId);
      return isSelectedEmployee &&
        isDateInScheduleWeek(schedule.week, dutyDate) &&
        hasScheduledShift(schedule[dayKey as keyof Schedule] as string);
    });

    if (conflict) {
      const conflictEmployee = selectedEmployees.find(employee => employee.employeeId === conflict.employeeId);
      setSnackbar({
        open: true,
        message: `Conflict found: ${conflictEmployee?.name ?? conflict.employee} already has ${conflict[dayKey as keyof Schedule]} on ${formatDisplayDate(dutyDate)} in ${formatDisplayDateRange(stripSpecialDutyReason(conflict.week))}.`,
        severity: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const scheduleIds = await nextScheduleIds(selectedEmployees.length);
      const dayAssignments = DAYS.reduce((acc, day) => ({
        ...acc,
        [day]: day === dayKey ? parsedShift.label : 'Off',
      }), {} as Record<string, string>);

      const payload = selectedEmployees.map((employee, index) => ({
        schedule_id: scheduleIds[index],
        employee_id: employee.employeeId,
        position: employee.position || specialDutyForm.position || '',
        outlet: specialDutyForm.outlet === NO_OUTLET ? '' : specialDutyForm.outlet || '',
        week: `${weekRange}${SPECIAL_DUTY_SEPARATOR}${reason}`,
        time_in: parsedShift.timeIn,
        time_out: parsedShift.timeOut,
        break_time: specialDutyForm.breakTime || '',
        ...dayAssignments,
        status: 'Draft',
      }));

      const { error } = await supabase.from('schedule').insert(payload);
      if (error) throw error;

      setOpenDialog(false);
      setSpecialDutyForm(EMPTY_SPECIAL_DUTY);
      setScheduleType('regular');
      await fetchSchedules();
      setSnackbar({ open: true, message: `Special duty assignment saved as draft for ${selectedEmployees.length} employee(s).`, severity: 'success' });
    } catch (e: any) {
      setSnackbar({ open: true, message: `Failed: ${e.message ?? e}`, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // HR validates a Supervisor's draft by publishing it for employee confirmation.
  const handlePublish = async (s: Schedule) => {
  try {
    if (!canValidateSchedule || s.status !== 'Draft') throw new Error('Only HR can validate schedules that are saved as drafts.');
    const { data: updatedSchedule, error } = await supabase
      .from("schedule")
      .update({ status: "Published" })
      .eq("schedule_id", s.id)
      .eq("status", "Draft")
      .select('schedule_id')
      .maybeSingle();

    if (error) throw error;
    if (!updatedSchedule) throw new Error('This draft was already changed. Refresh the schedule list and try again.');

    await pushNotification(
      s.employeeId,
      "New Schedule Published",
      `Your schedule for ${formatDisplayDateRange(stripSpecialDutyReason(s.week))} has been published.`,
      "schedule"
    );

    setSchedules(prev =>
      prev.map(x =>
        x.id === s.id ? { ...x, status: "Published" } : x
      )
    );

    setSnackbar({
      open: true,
      message: "✅ Schedule validated and published — the employee can now view and confirm it.",
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
  if (!canManageSchedule) {
    setSnackbar({ open: true, message: 'Only Supervisors can delete schedules.', severity: 'error' });
    return;
  }
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
    if (!canManageSchedule) {
      setSnackbar({ open: true, message: 'Only Supervisors can delete schedules.', severity: 'error' });
      return;
    }
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
      outlet: s.outlet || linkedEmployee?.outlet || NO_OUTLET,
      week: s.week,
      timeIn: s.timeIn, timeOut: s.timeOut, breakTime: s.breakTime,
      bulkTimes: EMPTY_BULK_TIMES,
      lastAppliedShift: '',
      monday: s.monday, tuesday: s.tuesday, wednesday: s.wednesday,
      thursday: s.thursday, friday: s.friday, saturday: s.saturday, sunday: s.sunday,
    });
    setEditDialog(true);
  };

  // Editing returns the schedule to Draft; HR publishes it after validation.
  const handleEditSave = async () => {
  if (!editRecord) return;
  if (!canManageSchedule) {
    setSnackbar({ open: true, message: 'Only Supervisors can edit schedules.', severity: 'error' });
    return;
  }

  setSaving(true);

  try {
    const linkedEmployee = getEmployeeById(editRecord.employeeId);
    const employeePosition = linkedEmployee?.position || editForm.position || "";
    const scheduleOutlet = editForm.outlet === NO_OUTLET ? "" : editForm.outlet || "";

    const { error } = await supabase
      .from("schedule")
      .update({
        position: employeePosition,
        outlet: scheduleOutlet,
        week: editForm.week ?? "",
        time_in: editForm.timeIn || null,
        time_out: editForm.timeOut || null,
        break_time: editForm.breakTime ?? "",
        ...scheduleDays(editForm, editRecord),
        status: "Draft",
      })
      .eq("schedule_id", editRecord.id);

    if (error) throw error;

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

    if (filterOutlet.length > 0 && !filterOutlet.some(outlet =>
      outlet === NO_OUTLET ? !String(s.outlet ?? '').trim() : normalizeWorkArea(s.outlet) === normalizeWorkArea(outlet)
    )) return false;

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
  const employeePhotos = useProfilePhotoDirectory('employee', filtered.map(schedule => schedule.employeeId));
  const selectableFilteredIds = canValidateSchedule
    ? filtered.filter(schedule => schedule.status === 'Draft').map(schedule => schedule.id)
    : filteredIds;
  const selectedVisibleIds = selectedScheduleIds.filter(id => selectableFilteredIds.includes(id));
  const selectedDraftCount = selectedScheduleIds.filter(id => schedules.some(schedule => schedule.id === id && schedule.status === 'Draft')).length;
  const allVisibleSelected = selectableFilteredIds.length > 0 && selectedVisibleIds.length === selectableFilteredIds.length;
  const partiallyVisibleSelected = selectedVisibleIds.length > 0 && !allVisibleSelected;

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedScheduleIds(prev => {
      const hiddenSelections = prev.filter(id => !selectableFilteredIds.includes(id));
      return checked ? [...hiddenSelections, ...selectableFilteredIds] : hiddenSelections;
    });
  };

  const toggleScheduleSelection = (id: string, checked: boolean) => {
    setSelectedScheduleIds(prev =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter(selectedId => selectedId !== id)
    );
  };

  const publishSelectedSchedules = async () => {
    if (!canValidateSchedule) {
      setSnackbar({ open: true, message: 'Only HR can validate schedules.', severity: 'error' });
      return;
    }
    const draftIds = selectedScheduleIds.filter(id => schedules.some(schedule => schedule.id === id && schedule.status === 'Draft'));
    if (draftIds.length === 0) {
      setSnackbar({ open: true, message: 'Select at least one draft schedule to validate.', severity: 'error' });
      return;
    }

    setSaving(true);
    try {
      const { data: updatedSchedules, error } = await supabase
        .from('schedule')
        .update({ status: 'Published' })
        .in('schedule_id', draftIds)
        .eq('status', 'Draft')
        .select('schedule_id');

      if (error) throw error;
      const updatedIds = (updatedSchedules ?? []).map((schedule: any) => schedule.schedule_id);
      if (updatedIds.length === 0) throw new Error('The selected drafts were already changed. Refresh the schedule list and try again.');

      const selectedRecords = schedules.filter(schedule => updatedIds.includes(schedule.id));
      await Promise.all(selectedRecords.map(schedule =>
        pushNotification(
          schedule.employeeId,
          'New Schedule Published',
          `Your schedule for ${formatDisplayDateRange(stripSpecialDutyReason(schedule.week))} has been published.`,
          'schedule'
        )
      ));

      setSchedules(prev => prev.map(schedule =>
        updatedIds.includes(schedule.id)
          ? {
              ...schedule,
              status: 'Published',
            }
          : schedule
      ));
      setSelectedScheduleIds([]);
      setSnackbar({ open: true, message: `Validated and published ${selectedRecords.length} schedule(s).`, severity: 'success' });
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

  const findEmployeeForPhotoRow = (name: string, employees = employeeList) => {
    const target = normalizePersonName(name);
    const targetParts = target.split(' ').filter(Boolean);
    if (!target || !targetParts.length) return undefined;
    const distance = (left: string, right: string) => {
      const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
      for (let i = 1; i <= left.length; i += 1) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= right.length; j += 1) {
          const above = previous[j];
          previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
          diagonal = above;
        }
      }
      return previous[right.length];
    };
    const ranked = employees.map(employee => {
      const aliases = employee.aliases?.length ? employee.aliases : [employee.name];
      const score = Math.max(0, ...aliases.map(aliasValue => {
        const alias = normalizePersonName(aliasValue);
        const aliasParts = alias.split(' ').filter(Boolean);
        if (!alias) return 0;
        if (alias === target) return 1;
        if (targetParts.length === 1 && target.length >= 4 && aliasParts.includes(target)) return 0.98;
        if (aliasParts.length === 1 && alias.length >= 4 && targetParts.includes(alias)) return 0.98;
        if (alias.length >= 5 && (target.includes(alias) || alias.includes(target))) return 0.97;
        const overlap = aliasParts.filter(part => targetParts.some(word => word === part || (word.length >= 3 && part.startsWith(word)))).length;
        if (overlap >= 2 && overlap / Math.min(aliasParts.length, targetParts.length) >= 0.75) return 0.88 + Math.min(.08, overlap / aliasParts.length * .08);
        return 1 - distance(alias.replace(/ /g, ''), target.replace(/ /g, '')) / Math.max(alias.length, target.length);
      }));
      return { employee, score };
    }).sort((a, b) => b.score - a.score);
    if (!ranked[0] || ranked[0].score < 0.82) return undefined;
    if (ranked[1] && ranked[0].score - ranked[1].score < 0.06) return undefined;
    return ranked[0].employee;
  };

  type SchedulePhotoReader = (image: File | HTMLCanvasElement) => Promise<ReturnType<typeof parseSchedulePhoto>>;

  const readImageSchedule = async (
    employees: ScheduleEmployeeOption[],
    readPhoto: (read: SchedulePhotoReader) => Promise<ReturnType<typeof parseSchedulePhoto> | null>,
  ) => {
    const { createWorker, PSM } = await import('tesseract.js');
    const assets = new URL(`${import.meta.env.BASE_URL}ocr/`, window.location.origin).href;
    const worker = await createWorker('eng', 1, {
      workerPath: `${assets}worker.min.js`, corePath: assets, langPath: assets.replace(/\/$/, ''),
      workerBlobURL: false,
    });
    try {
      return await readPhoto(async image => {
        const pages = [];
        for (const mode of [PSM.AUTO, PSM.SPARSE_TEXT]) {
          await worker.setParameters({ tessedit_pageseg_mode: mode });
          const { data } = await worker.recognize(image, {}, { blocks: true });
          pages.push(readSchedulePhotoPage(data));
        }
        return parseSchedulePhoto(pages, name => findEmployeeForPhotoRow(name, employees)?.employeeId);
      });
    } finally {
      await worker.terminate();
    }
  };

  const showImageReview = ({ rows, week }: ReturnType<typeof parseSchedulePhoto>) => {
    setImageCropFile(null);
    setImageReviewRows(rows);
    setImageReviewWeek(week);
    setImageReviewError('');
    setImageReviewOpen(true);
  };

  const handleImageScheduleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)) {
      setSnackbar({ open: true, message: 'Please upload a schedule image file.', severity: 'error' });
      return;
    }

    setImportingImage(true);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose an image smaller than 20 MB.');
      const currentEmployees = await loadScheduleEmployees();
      setEmployeeList(currentEmployees);
      const result = await readImageSchedule(currentEmployees, read =>
        readScheduleWithCrop(file, read, findAutomaticScheduleCrop));
      if (result) {
        showImageReview(result);
      } else {
        setImageCropError('The schedule could not be read automatically. Adjust the crop and try again.');
        setImageCropFile(file);
      }
    } catch (err) {
      setSnackbar({
        open: true,
        message: err instanceof Error ? `Image import failed: ${err.message}` : 'Image import failed.',
        severity: 'error',
      });
    } finally {
      setImportingImage(false);
    }
  };

  const retryImageScheduleCrop = async (canvas: HTMLCanvasElement) => {
    setImportingImage(true);
    setImageCropError('');
    try {
      const result = await readImageSchedule(employeeList, read => read(canvas));
      if (result) showImageReview(result);
    } catch (err) {
      setImageCropError(err instanceof UnreadableSchedulePhoto
        ? `${err.message} Adjust the crop to include every weekday heading or try a clearer photo.`
        : 'The cropped photo could not be read. Try again or upload a clearer photo.');
    } finally {
      setImportingImage(false);
    }
  };

  const confirmImageScheduleImport = async () => {
    setImageReviewError('');
    if (!parseScheduleDateRange(imageReviewWeek)) {
      setImageReviewError('Enter a valid schedule week, for example November 9–15, 2026.');
      return;
    }
    const employeeById = new Map(employeeList.map(employee => [employee.employeeId, employee]));
    const unmatched = imageReviewRows.filter(row => !employeeById.has(row.employeeId));
    if (unmatched.length) {
      setImageReviewError(`Choose an employee for each unmatched row: ${unmatched.map(row => row.detectedName).join(', ')}.`);
      return;
    }
    if (new Set(imageReviewRows.map(row => row.employeeId)).size !== imageReviewRows.length) {
      setImageReviewError('An employee appears more than once. Correct the employee selections before importing.');
      return;
    }
    if (imageReviewRows.some(row => !DAYS.some(day => row.shifts[day].trim()))) {
      setImageReviewError('Each schedule needs at least one day or shift.');
      return;
    }

    setSaving(true);
    try {
      const normalizedRows = imageReviewRows.map(row => {
        const employee = employeeById.get(row.employeeId)!;
        const reviewed = { ...row.shifts };
        for (const day of DAYS) {
          if (!reviewed[day].trim()) continue;
          const shift = normalizePhotoShift(reviewed[day]);
          if (!shift) throw new Error(`${employee.name}: check the ${DAY_NAMES[day]} shift against the photo.`);
          reviewed[day] = shift;
        }
        return { employee, shifts: scheduleDays(reviewed) };
      });
      const ids = await nextScheduleIds(normalizedRows.length);
      const payloads = normalizedRows.map(({ employee, shifts }, index) => ({
        schedule_id: ids[index],
        employee_id: employee.employeeId,
        position: employee.position,
        outlet: employee.outlet,
        week: imageReviewWeek.trim(),
        time_in: null,
        time_out: null,
        break_time: '1 hour',
        monday: shifts.monday,
        tuesday: shifts.tuesday,
        wednesday: shifts.wednesday,
        thursday: shifts.thursday,
        friday: shifts.friday,
        saturday: shifts.saturday,
        sunday: shifts.sunday,
        status: 'Draft',
        is_finalized: false,
      }));
      const { error: insertError } = await supabase.from('schedule').insert(payloads);
      if (insertError) throw insertError;
      await fetchSchedules();
      setImageReviewOpen(false);
      setImageReviewRows([]);
      setSnackbar({ open: true, message: `Image import complete — ${payloads.length} schedule(s) saved as Draft.`, severity: 'success' });
    } catch (err: any) {
      setImageReviewError(err.message ?? 'Could not save the imported schedules.');
    } finally {
      setSaving(false);
    }
  };

  const scheduleStats = [
    {
      label: 'Total Schedules',
      value: schedules.length,
      icon: <ViewWeek fontSize="small" />,
    },
    {
      label: 'Draft',
      value: schedules.filter(s => s.status === 'Draft').length,
      icon: <EditIcon fontSize="small" />,
    },
    {
      label: 'Published',
      value: schedules.filter(s => s.status === 'Published').length,
      icon: <EventAvailable fontSize="small" />,
    },
    {
      label: 'Confirmed',
      value: schedules.filter(s => s.status === 'Confirmed').length,
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
            {canManageSchedule && (
              <Button
                variant="contained"
                startIcon={<AddCircleOutline />}
                onClick={() => {
                  setForm(EMPTY);
                  setApplicableWorkdays(DEFAULT_WORKDAYS);
                  setSelectedEmployeeIds([]);
                  setScheduleType('regular');
                  resetSpecialDutyForm();
                  setOpenDialog(true);
                }}
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
            {canManageSchedule && (
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
            {canManageSchedule && (
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
          <Chip
            icon={<Storefront sx={{ fontSize: '0.9rem !important' }} />}
            label={filterOutlet.length === 0 ? 'All Outlets' : filterOutlet.map(outlet => outlet === NO_OUTLET ? 'No Outlet' : displayWorkArea(outlet)).join(', ')}
            size="small"
            variant="outlined"
            sx={{ ...outletChipSx, '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
          />
        </Box>

        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 12, md: canManageSchedule ? 4 : 6 }}>
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
          <Grid size={{ xs: 12, md: canManageSchedule ? 4 : 6 }}>
            <Autocomplete
              multiple
              disableCloseOnSelect
              options={[...ASSIGNED_WORK_AREAS, NO_OUTLET]}
              value={filterOutlet}
              onChange={(_, selected) => setFilterOutlet(selected)}
              getOptionLabel={outlet => outlet === NO_OUTLET ? 'No Outlet' : outlet}
              isOptionEqualToValue={(option, value) => option === value}
              renderOption={(props, outlet, { selected }) => (
                <li {...props}>
                  <Checkbox
                    size="small"
                    checked={selected}
                    sx={{ mr: 1, color: GREEN_UI.greenDark, '&.Mui-checked': { color: GREEN_UI.greenDark } }}
                  />
                  {outlet === NO_OUTLET ? 'No Outlet' : outlet}
                </li>
              )}
              renderInput={params => (
                <TextField
                  {...params}
                  fullWidth
                  label="Filter by Outlet"
                  placeholder={filterOutlet.length ? 'Add another outlet' : 'All outlets'}
                  InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                />
              )}
            />
          </Grid>
          {canManageSchedule && (
          <Grid size={{ xs: 12, md: 4 }} sx={{ alignSelf: 'flex-end' }}>
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
          )}
        </Grid>

        {canManageSchedule && (
          <Grid container spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 12 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PlaylistAddCheck />}
                onClick={() => toggleSelectAllVisible(!allVisibleSelected)}
                disabled={selectableFilteredIds.length === 0}
                sx={{
                  ...pillButtonSx,
                  height: 40,
                  borderColor: GREEN_UI.borderStrong,
                  color: GREEN_UI.greenDark,
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                }}
              >
                {allVisibleSelected ? 'Clear Visible Selection' : `Select All Visible (${selectableFilteredIds.length})`}
              </Button>
            </Grid>
          </Grid>
        )}

        {canValidateSchedule && (
          <Grid container spacing={1.5} alignItems="center" sx={{ mt: 1.5 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Button
                fullWidth
                variant="outlined"
                startIcon={<PlaylistAddCheck />}
                onClick={() => toggleSelectAllVisible(!allVisibleSelected)}
                disabled={selectableFilteredIds.length === 0}
                sx={{
                  ...pillButtonSx,
                  height: 40,
                  borderColor: GREEN_UI.borderStrong,
                  color: GREEN_UI.greenDark,
                  bgcolor: '#ffffff',
                  '&:hover': { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
                }}
              >
                {allVisibleSelected ? 'Clear Visible Selection' : `Select Draft Schedules (${selectableFilteredIds.length})`}
              </Button>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Button
                fullWidth
                variant="contained"
                startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <TaskAlt />}
                onClick={publishSelectedSchedules}
                disabled={saving || selectedDraftCount === 0}
                sx={{
                  ...pillButtonSx,
                  height: 40,
                  bgcolor: GREEN_UI.greenDark,
                  boxShadow: '0 12px 24px rgba(31, 122, 70, 0.20)',
                  '&:hover': { bgcolor: '#19693b' },
                }}
              >
                Validate & Publish {selectedDraftCount} Selected
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
                  {canSelectSchedule && (
                  <TableCell padding="checkbox">
                    {selectableFilteredIds.length > 0 && <Checkbox
                      size="small"
                      checked={allVisibleSelected}
                      indeterminate={partiallyVisibleSelected}
                      onChange={event => toggleSelectAllVisible(event.target.checked)}
                      inputProps={{ 'aria-label': 'Select schedules available for your action' }}
                    />}
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
                  <TableCell colSpan={canSelectSchedule ? 16 : 15} align="center" sx={{ py: 7 }}>
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
                          ? 'A Supervisor can create a weekly schedule or import an Excel file. HR can validate schedules after they are saved as drafts.'
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
                  {canSelectSchedule && (
                    <TableCell padding="checkbox">
                      {(canManageSchedule || s.status === 'Draft') && <Checkbox
                        size="small"
                        checked={selectedScheduleIds.includes(s.id)}
                        onChange={event => toggleScheduleSelection(s.id, event.target.checked)}
                        inputProps={{ 'aria-label': `Select schedule ${s.id}` }}
                      />}
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
                      <ProfilePhotoAvatar photo={employeePhotos.get(s.employeeId)} name={s.employee}
                        sx={{ width: 34, height: 34, borderRadius: '14px', bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark, fontSize: '0.82rem' }} />
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <CalendarMonth sx={{ fontSize: 17, color: GREEN_UI.greenDark }} />
                      <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        {formatDisplayDateRange(stripSpecialDutyReason(s.week)) || '—'}
                      </Typography>
                      {getSpecialDutyReason(s.week) && (
                        <Chip
                          label={`Special Duty: ${getSpecialDutyReason(s.week)}`}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 700, bgcolor: '#fff8e4', borderColor: '#f1d487', color: '#765a12' }}
                        />
                      )}
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
                    const isOff = /^(off|rd|rest day)$/i.test(shiftValue);
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
                    {canManageSchedule && (
                      <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
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
                          className="hris-chip-danger"
                          size="small"
                          clickable
                          variant="outlined"
                          onClick={() => handleDelete(s.id)}
                          sx={{ ...actionChipSx('danger'), minWidth: 78, '& .MuiChip-icon': { color: '#9c2f2f' } }}
                        />
                      </Box>
                    )}

                    {canValidateSchedule && s.status === 'Draft' && (
                      <Chip
                        icon={<TaskAlt sx={{ fontSize: '0.85rem !important' }} />}
                        label="Validate & Publish"
                        size="small"
                        clickable
                        variant="outlined"
                        onClick={() => handlePublish(s)}
                        sx={{ ...actionChipSx('success'), '& .MuiChip-icon': { color: GREEN_UI.greenDark } }}
                      />
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

      {!loading && canSeeScheduleRoster && (
        <WeeklySchedule
          schedules={canConfirm
            ? overviewSchedules
            : filtered}
          showSwapRequest={canConfirm}
          onRequestSwap={() => setOpenSwapRequest(true)}
        />
      )}
      {(canConfirm || canValidateSchedule) && (
        <ScheduleSwapRequests
          embedded
          openRequestDialog={openSwapRequest}
          onRequestDialogOpened={() => setOpenSwapRequest(false)}
          onScheduleChanged={fetchSchedules}
        />
      )}

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
                Create Schedule
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Create a regular weekly schedule or assign an employee for special duty.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#fbfff9' }}>
          {importingExcel && <Alert severity="info" sx={{ mb: 2, borderRadius: '16px' }}>⏳ Importing from Excel…</Alert>}
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text, mb: 0.75, textAlign: 'center' }}>
              Schedule Type
            </Typography>
            <RadioGroup
              row
              value={scheduleType}
              onChange={event => {
                const nextType = event.target.value as 'regular' | 'special';
                setScheduleType(nextType);
                if (nextType === 'regular') resetSpecialDutyForm();
                if (nextType === 'special') {
                  setSelectedEmployeeIds([]);
                  setForm(EMPTY);
                  setApplicableWorkdays(DEFAULT_WORKDAYS);
                }
              }}
              sx={{ justifyContent: 'center', gap: { xs: 1.5, sm: 4 }, flexWrap: 'wrap' }}
            >
              <FormControlLabel value="regular" control={<Radio size="small" sx={{ color: GREEN_UI.greenDark, '&.Mui-checked': { color: GREEN_UI.greenDark } }} />} label="Regular Schedule" />
              <FormControlLabel value="special" control={<Radio size="small" sx={{ color: GREEN_UI.greenDark, '&.Mui-checked': { color: GREEN_UI.greenDark } }} />} label="Special Duty" />
            </RadioGroup>
          </Paper>

          {scheduleType === 'regular' ? (
          <>
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <PersonOutline sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Employee Assignment</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  multiple
                  disableCloseOnSelect
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
                  renderOption={(props, option, { selected }) => (
                    <li {...props}>
                      <Checkbox
                        size="small"
                        checked={selected}
                        sx={{ mr: 1, color: GREEN_UI.greenDark, '&.Mui-checked': { color: GREEN_UI.greenDark } }}
                      />
                      <Box>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                          {option.employeeId}{option.position ? ` · ${option.position}` : ''}
                        </Typography>
                      </Box>
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      required
                      label="Choose Employees (select one or more)"
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
                  {includeSelectedJobTitle(jobTitleOptions, form.position).map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Schedule Outlet / Branch"
                  value={form.outlet}
                  size="small"
                  sx={softTextFieldSx}
                  onChange={e => setForm(prev => ({ ...prev, outlet: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                >
                  <MenuItem key="outlet-empty" value="">Select outlet</MenuItem>
                  <MenuItem value={NO_OUTLET}>No Outlet</MenuItem>
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
                  value={formatDisplayDateRange(form.week)}
                  onChange={e => setForm({ ...form, week: updateWeekInput(e.target.value) })}
                  placeholder="MM/DD/YYYY – MM/DD/YYYY"
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
              {BULK_TIME_FIELDS.map(([field, label]) => (
                <Grid key={field} size={{ xs: 6, sm: 3 }}>
                  <TextField
                    fullWidth
                    label={label}
                    type="time"
                    value={form.bulkTimes[field]}
                    onChange={event => setForm(prev => ({
                      ...prev,
                      bulkTimes: { ...prev.bulkTimes, [field]: event.target.value },
                    }))}
                    size="small"
                    InputLabelProps={{ shrink: true }}
                    sx={softTextFieldSx}
                  />
                </Grid>
              ))}
              {hasCompleteBulkTimes && !bulkShift && (
                <Grid size={12}>
                  <Typography variant="body2" color="error" role="alert">
                    Check that the time ranges are valid and do not overlap.
                  </Typography>
                </Grid>
              )}
              <Grid size={12}>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700, display: 'block', mb: 0.75 }}>
                  Select workdays to apply this shift to
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                  {DAYS.map(day => (
                    <FormControlLabel
                      key={day}
                      label={DAY_NAMES[day]}
                      control={(
                        <Checkbox
                          size="small"
                          checked={applicableWorkdays.includes(day)}
                          disabled={!isAvailableForBulk(day)}
                          onChange={() => setApplicableWorkdays(prev =>
                            prev.includes(day) ? prev.filter(value => value !== day) : [...prev, day]
                          )}
                          sx={{ color: GREEN_UI.greenDark, '&.Mui-checked': { color: GREEN_UI.greenDark } }}
                        />
                      )}
                      sx={{
                        mr: 0.5,
                        px: 1,
                        border: `1px solid ${GREEN_UI.border}`,
                        borderRadius: '10px',
                        backgroundColor: applicableWorkdays.includes(day) ? 'rgba(25, 135, 84, 0.08)' : 'transparent',
                        '& .MuiFormControlLabel-label': { fontSize: '0.875rem', fontWeight: 600 },
                      }}
                    />
                  ))}
                  <Chip
                    label="Apply"
                    size="small"
                    clickable
                    disabled={!canApplyBulkShift}
                    color="primary"
                    onClick={applySelectedWorkdays}
                    className="hris-chip-action"
                    sx={{ fontWeight: 700 }}
                  />
                  <Chip
                    id="rest-day-button"
                    label="Rest Day (RD)"
                    size="small"
                    clickable
                    color="primary"
                    aria-haspopup="menu"
                    aria-expanded={Boolean(restDayAnchor)}
                    aria-controls={restDayAnchor ? 'rest-day-menu' : undefined}
                    onClick={event => setRestDayAnchor(event.currentTarget)}
                    className="hris-chip-action"
                    sx={{ fontWeight: 700 }}
                  />
                  <Menu
                    id="rest-day-menu"
                    anchorEl={restDayAnchor}
                    open={Boolean(restDayAnchor)}
                    onClose={() => setRestDayAnchor(null)}
                    MenuListProps={{ 'aria-labelledby': 'rest-day-button' }}
                  >
                    {REST_DAY_OPTIONS.map(day => (
                      <MenuItem key={day} onClick={() => markRestDay(day)}>{DAY_NAMES[day]}</MenuItem>
                    ))}
                  </Menu>
                </Box>
              </Grid>
            </Grid>
            {renderScheduleDays(form, setForm)}
          </Paper>
          </>
          ) : (
          <>
          <Alert severity="info" sx={{ mb: 2, borderRadius: '16px', border: `1px solid ${GREEN_UI.border}` }}>
            The system checks the selected employee&apos;s existing schedule for that date before saving.
          </Alert>
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <PersonOutline sx={{ color: GREEN_UI.greenDark }} />
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>Special Duty Assignment</Typography>
            </Box>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <Autocomplete
                  multiple
                  disableCloseOnSelect
                  options={employeeList}
                  getOptionLabel={(option) => `${option.name} (${option.employeeId})`}
                  value={employeeList.filter(emp => specialDutyForm.employeeIds.includes(emp.employeeId))}
                  onChange={(_, selected) => {
                    setSpecialDutyForm(prev => ({
                      ...prev,
                      employeeIds: selected.map(employee => employee.employeeId),
                      position: selected[0]?.position ?? '',
                      outlet: selected[0]?.outlet ?? '',
                    }));
                  }}
                  renderOption={(props, option, { selected }) => (
                    <li {...props}>
                      <Checkbox
                        size="small"
                        checked={selected}
                        sx={{ mr: 1, color: GREEN_UI.greenDark, '&.Mui-checked': { color: GREEN_UI.greenDark } }}
                      />
                      {option.name} ({option.employeeId})
                    </li>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      required
                      label="Employees"
                      placeholder="Choose employees"
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                    />
                  )}
                />
                <Typography variant="caption" sx={{ color: GREEN_UI.muted, mt: 0.75, display: 'block' }}>
                  For special duty, select one or more employees who need the same additional duty assignment.
                </Typography>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  select
                  label="Schedule Outlet / Branch"
                  value={specialDutyForm.outlet}
                  onChange={event => setSpecialDutyForm(prev => ({ ...prev, outlet: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                >
                  <MenuItem value="">Select outlet</MenuItem>
                  <MenuItem value={NO_OUTLET}>No Outlet</MenuItem>
                  {OUTLETS.map(outlet => <MenuItem key={outlet} value={outlet}>{outlet}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Duty Date"
                  type="date"
                  required
                  value={specialDutyForm.dutyDate}
                  onChange={event => setSpecialDutyForm(prev => ({ ...prev, dutyDate: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                  helperText={specialDutyForm.dutyDate ? formatDisplayDateRange(formatWeekRangeFromDate(specialDutyForm.dutyDate)) : 'Select the added duty date.'}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Autocomplete
                  freeSolo
                  options={SHIFT_PRESETS.filter(shift => shift !== 'Off')}
                  value={specialDutyForm.shift}
                  onChange={(_, value) => setSpecialDutyForm(prev => ({ ...prev, shift: value ?? '' }))}
                  onInputChange={(_, value) => setSpecialDutyForm(prev => ({ ...prev, shift: value }))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      fullWidth
                      required
                      label="Duty Shift"
                      placeholder="e.g. 8:00 AM - 5:00 PM"
                      helperText="Attendance uses this shift; start and end times are derived automatically."
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      sx={softTextFieldSx}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Autocomplete
                  freeSolo
                  options={BREAK_TIME_OPTIONS}
                  value={specialDutyForm.breakTime}
                  onChange={(_, value) => setSpecialDutyForm(prev => ({ ...prev, breakTime: value ?? '' }))}
                  onInputChange={(_, value) => setSpecialDutyForm(prev => ({ ...prev, breakTime: value }))}
                  renderInput={(params) => (
                    <TextField {...params} fullWidth label="Break Time" size="small" InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  required
                  multiline
                  minRows={3}
                  label="Reason for Special Duty"
                  placeholder="Example: Peak season additional coverage"
                  value={specialDutyForm.reason}
                  onChange={event => setSpecialDutyForm(prev => ({ ...prev, reason: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                />
              </Grid>
            </Grid>
          </Paper>
          <Paper elevation={0} sx={{ ...innerCardSx, p: { xs: 1.5, sm: 2 } }}>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text, mb: 1 }}>
              Form Preview
            </Typography>
            <Typography variant="body2" fontWeight={800} sx={{ color: GREEN_UI.greenDark }}>
              Special Duty Assignment
            </Typography>
            {[
              ['Employees', specialDutyForm.employeeIds.length > 0
                ? employeeList
                    .filter(employee => specialDutyForm.employeeIds.includes(employee.employeeId))
                    .map(employee => employee.name)
                    .join(', ')
                : 'Not selected'],
              ['Schedule outlet', displayWorkArea(specialDutyForm.outlet) || 'Not selected'],
              ['Date', specialDutyForm.dutyDate || 'Not selected'],
              ['Time', specialDutyForm.shift || 'Not selected'],
              ['Reason', specialDutyForm.reason || 'Not provided'],
            ].map(([label, value]) => (
              <Typography key={label} variant="caption" sx={{ display: 'block', color: GREEN_UI.muted, lineHeight: 1.7 }}>
                <strong>{label}:</strong> {value}
              </Typography>
            ))}
          </Paper>
          </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#fbfff9', borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button startIcon={<CancelOutlined />} onClick={() => setOpenDialog(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={scheduleType === 'regular' ? handleSaveDraft : handleSaveSpecialDuty}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <TaskAlt />}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}
          >
            {saving ? (scheduleType === 'regular' ? 'Saving…' : 'Checking…') : (scheduleType === 'regular' ? 'Save as Draft' : 'Save Special Duty')}
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
                  {includeSelectedJobTitle(jobTitleOptions, editForm.position).map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Schedule Outlet / Branch"
                  value={editForm.outlet}
                  onChange={e => setEditForm(prev => ({ ...prev, outlet: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={softTextFieldSx}
                >
                  <MenuItem key="edit-outlet-empty" value="">Select outlet…</MenuItem>
                  <MenuItem value={NO_OUTLET}>No Outlet</MenuItem>
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
                  value={formatDisplayDateRange(editForm.week)}
                  onChange={e => setEditForm({ ...editForm, week: updateWeekInput(e.target.value) })}
                  placeholder="MM/DD/YYYY – MM/DD/YYYY"
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
            {renderScheduleDays(editForm, setEditForm)}
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

      {imageCropFile && (
        <ScheduleImageCropDialog
          file={imageCropFile}
          busy={importingImage}
          error={imageCropError}
          onClose={() => setImageCropFile(null)}
          onRetry={retryImageScheduleCrop}
        />
      )}
      <Dialog open={imageReviewOpen} onClose={() => !saving && setImageReviewOpen(false)} maxWidth="xl" fullWidth>
        <DialogTitle sx={{ bgcolor: '#f3fbf2', color: GREEN_UI.text, fontWeight: 800 }}>Review imported schedule image</DialogTitle>
        <DialogContent sx={{ bgcolor: '#fbfff9', pt: 2.5 }}>
          <Typography variant="body2" sx={{ color: GREEN_UI.muted, mb: 2 }}>
            Compare the week, employee matches, and shifts with the photo. Review the highlighted cells and fill in any missed shifts.
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="Schedule week"
            value={imageReviewWeek}
            onChange={event => setImageReviewWeek(event.target.value)}
            sx={{ ...softTextFieldSx, mb: 2 }}
          />
          {imageReviewError && <Alert severity="error" sx={{ mb: 2 }}>{imageReviewError}</Alert>}
          <TableContainer sx={{ maxHeight: '58vh', border: `1px solid ${GREEN_UI.border}`, borderRadius: 2 }}>
            <Table stickyHeader size="small" sx={{ minWidth: 1500 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 180 }}>Name read from image</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>Match employee record</TableCell>
                  {DAYS.map((day, index) => <TableCell key={day} sx={{ minWidth: 150 }}>{DAY_NAMES[day]}</TableCell>)}
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {imageReviewRows.map((row, rowIndex) => (
                  <TableRow key={`${row.detectedName}-${rowIndex}`}>
                    <TableCell sx={{ verticalAlign: 'top', fontWeight: 650 }}>{row.detectedName || 'Name not clear'}</TableCell>
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <Autocomplete
                        size="small"
                        options={employeeList}
                        value={employeeList.find(employee => employee.employeeId === row.employeeId) ?? null}
                        getOptionLabel={employee => `${employee.name} (${employee.employeeId})`}
                        isOptionEqualToValue={(option, value) => option.employeeId === value.employeeId}
                        onChange={(_, value) => setImageReviewRows(current => current.map((item, index) => index === rowIndex ? { ...item, employeeId: value?.employeeId ?? '' } : item))}
                        renderInput={params => <TextField {...params} label="Employee" sx={softTextFieldSx} />}
                      />
                    </TableCell>
                    {DAYS.map(day => <TableCell key={day} sx={{ verticalAlign: 'top' }}>
                      <TextField
                        size="small"
                        value={row.shifts[day]}
                        error={row.uncertainDays.includes(day)}
                        placeholder="Shift, RD, or Leave"
                        inputProps={{ 'aria-label': `${row.detectedName} — ${DAY_NAMES[day]}` }}
                        onChange={event => setImageReviewRows(current => current.map((item, index) => index === rowIndex ? {
                          ...item,
                          shifts: { ...item.shifts, [day]: event.target.value },
                          uncertainDays: item.uncertainDays.filter(uncertain => uncertain !== day),
                        } : item))}
                        sx={softTextFieldSx}
                      />
                    </TableCell>)}
                    <TableCell sx={{ verticalAlign: 'top' }}>
                      <Button size="small" color="error" onClick={() => setImageReviewRows(current => current.filter((_, index) => index !== rowIndex))}>
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, bgcolor: '#fbfff9', borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button onClick={() => setImageReviewOpen(false)} disabled={saving} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>Cancel</Button>
          <Button variant="contained" onClick={() => void confirmImageScheduleImport()} disabled={saving || !imageReviewRows.length} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <TaskAlt />} sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, '&:hover': { bgcolor: GREEN_UI.greenDark } }}>
            {saving ? 'Saving…' : 'Save as Draft'}
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
