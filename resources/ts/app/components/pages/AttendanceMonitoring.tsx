import React, { useState, useEffect, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
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
  Stack,
  useMediaQuery,
  useTheme,
  TextField,
  InputAdornment,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  CircularProgress,
  LinearProgress,
  Alert,
  Tooltip,
  IconButton,
} from "@mui/material";
import {
  UploadFile,
  AddCircleOutline,
  Sync,
  TaskAlt,
  EditNote,
  DeleteSweep,
  WarningAmber,
  ArrowBackIosNew,
  ArrowForwardIos,
  DashboardCustomizeRounded,
  FactCheckRounded,
  CalendarMonthRounded,
  TuneRounded,
  BadgeRounded,
  PersonRounded,
  AccessTimeRounded,
  TimerRounded,
  WatchLaterRounded,
  EventBusyRounded,
  UploadFileRounded,
  AddTaskRounded,
  CloseRounded,
} from "@mui/icons-material";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import ActionSnackbar from "../ActionSnackbar";

interface Attendance {
  id: string;
  displayId?: string;
  employeeId?: string;
  employee: string;
  date: string;
  timeIn: string;
  timeOut: string;
  totalHours: string;
  late: string;
  undertime: string;
  overtime: string;
  status: "Present" | "Late" | "Absent" | "On Leave";
  discrepancy: string;
}

type AttendanceDraft = Omit<Attendance, "id" | "displayId" | "employeeId">;

type EmployeeOption = {
  employee_id: string;
  name: string;
  position?: string | null;
  outlet?: string | null;
  status?: string | null;
};
type SheetRow = Array<string | number | boolean | Date | null | undefined>;

const EMPTY: AttendanceDraft = {
  employee: "",
  date: "",
  timeIn: "",
  timeOut: "",
  totalHours: "",
  late: "0",
  undertime: "0",
  overtime: "0",
  status: "Present",
  discrepancy: "Complete",
};

const IMPORT_CONCURRENCY = 10;
const DELETE_CONCURRENCY = 10;
const PREVIEW_ROW_LIMIT = 50;
const REQUIRED_DAILY_HOURS = 8;


const GREEN_UI = {
  pageBg: "radial-gradient(circle at top left, rgba(220, 246, 219, 0.95), rgba(248, 252, 245, 0.98) 34%, #f7fbf3 100%)",
  cardBg: "rgba(255, 255, 255, 0.92)",
  cardBgSoft: "rgba(245, 252, 241, 0.88)",
  border: "rgba(139, 184, 144, 0.24)",
  borderStrong: "rgba(73, 156, 92, 0.32)",
  green: "#3aa865",
  greenDark: "#1f7a46",
  greenSoft: "#e6f8e9",
  text: "#1e2d24",
  muted: "#6c7d70",
  shadow: "0 20px 55px rgba(43, 91, 55, 0.10)",
  shadowSoft: "0 12px 28px rgba(43, 91, 55, 0.08)",
};

const softCardSx = {
  borderRadius: "26px",
  border: `1px solid ${GREEN_UI.border}`,
  background: GREEN_UI.cardBg,
  boxShadow: GREEN_UI.shadow,
};

const innerCardSx = {
  borderRadius: "20px",
  border: `1px solid ${GREEN_UI.border}`,
  background: GREEN_UI.cardBgSoft,
  boxShadow: GREEN_UI.shadowSoft,
};

const iconTileSx = {
  width: 42,
  height: 42,
  borderRadius: "16px",
  display: "grid",
  placeItems: "center",
  color: GREEN_UI.greenDark,
  bgcolor: GREEN_UI.greenSoft,
  border: `1px solid ${GREEN_UI.borderStrong}`,
};

const pillButtonSx = {
  textTransform: "none",
  fontWeight: 600,
  px: 2,
};

const softTextFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "16px",
    backgroundColor: "#fbfef9",
    transition: "all 180ms ease",
    "& fieldset": { borderColor: GREEN_UI.border },
    "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
    "&.Mui-focused fieldset": { borderColor: GREEN_UI.green, borderWidth: 1.5 },
    "&.Mui-disabled": { backgroundColor: "#f6fbf4" },
  },
  "& .MuiInputLabel-root": { color: GREEN_UI.muted },
  "& .MuiInputBase-input.Mui-disabled": { WebkitTextFillColor: GREEN_UI.text },
};

const statusChipSx = (status: Attendance["status"]) => {
  const styles: Record<Attendance["status"], { bg: string; color: string; border: string }> = {
    Present: { bg: "#e5f8e9", color: "#217a43", border: "#a9dfb6" },
    Late: { bg: "#fff7e0", color: "#9b6b00", border: "#f5d786" },
    Absent: { bg: "#ffecec", color: "#b3261e", border: "#f4b6b2" },
    "On Leave": { bg: "#e9f4ff", color: "#1769aa", border: "#b9daf8" },
  };
  const selected = styles[status] ?? styles.Present;
  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    "& .MuiChip-label": { px: 1.25 },
  };
};

type SaveImportTask = {
  kind: "create" | "update";
  key: string;
  row: Partial<Attendance> & { correctedBy?: string };
  existingId?: string;
};

type ImportSaveResult =
  | {
      ok: true;
      kind: "create" | "update";
      record: Attendance;
      key: string;
    }
  | {
      ok: false;
      key: string;
      error: string;
    };

// Auto-compute attendance metrics based on time-in and time-out vs expected schedule.
// Manual entries still use the default 8:00 AM - 5:00 PM schedule.
function computeAttendance(
  timeIn: string,
  timeOut: string,
  expectedIn = "8:00 AM",
  expectedOut = "5:00 PM",
): Partial<AttendanceDraft> {
  return computeAttendanceFromPunches(
    [timeIn, timeOut],
    expectedIn,
    expectedOut,
  );
}

function computeAttendanceFromPunches(
  punches: string[],
  expectedIn?: string,
  expectedOut?: string,
): Partial<AttendanceDraft> {
  const minutes = punches
    .map((t) => parseClockToMinutes(t))
    .filter((m): m is number => m !== null);

  if (minutes.length === 0) return {};

  const timeIn = formatMinutesAsTime(minutes[0]);
  const timeOut =
    minutes.length >= 2 ? formatMinutesAsTime(minutes[minutes.length - 1]) : "";

  let workedMinutes = 0;
  for (let i = 0; i + 1 < minutes.length; i += 2) {
    workedMinutes += diffMinutes(minutes[i], minutes[i + 1]);
  }

  if (workedMinutes === 0 && minutes.length >= 2) {
    workedMinutes = diffMinutes(minutes[0], minutes[minutes.length - 1]);
  }

  const result: Partial<AttendanceDraft> = {
    timeIn,
    timeOut,
    totalHours: workedMinutes > 0 ? (workedMinutes / 60).toFixed(2) : "",
    late: "0",
    undertime: "0",
    overtime: "0",
    status: "Present",
  };

  const scheduledIn = expectedIn ? parseClockToMinutes(expectedIn) : null;
  const scheduledOut = expectedOut ? parseClockToMinutes(expectedOut) : null;

  if (scheduledIn !== null && scheduledOut !== null && minutes.length >= 2) {
    const scheduledMinutes = diffMinutes(scheduledIn, scheduledOut);
    const lateMin = Math.max(0, minutes[0] - scheduledIn);
    const undertimeMin = Math.max(
      0,
      scheduledOut - minutes[minutes.length - 1],
    );
    const overtimeMin = Math.max(0, workedMinutes - scheduledMinutes);

    result.late = String(lateMin);
    result.undertime = String(undertimeMin);
    result.overtime = String(overtimeMin);
    // Keep the attendance status as Present even when late, undertime, or overtime minutes exist.
    // The metrics are still stored separately and used by payroll computations.
    result.status = "Present";
  }

  return result;
}

function parseClockToMinutes(value: string): number | null {
  const cleaned = value.trim().replace(/\s+/g, " ");
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3]?.toUpperCase();

  if (minute > 59 || hour > 23) return null;
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function diffMinutes(start: number, end: number) {
  const diff = end - start;
  return diff >= 0 ? diff : diff + 24 * 60;
}

function formatMinutesAsTime(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatMinutesAs24Hour(totalMinutes: number) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function excelSerialToDate(serial: number) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);
  return date.toISOString().slice(0, 10);
}

function extractPunchTimes(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (typeof value === "number") {
    if (value > 0 && value < 1) {
      return [formatMinutesAs24Hour(Math.round(value * 24 * 60))];
    }
    return [];
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [formatMinutesAs24Hour(value.getHours() * 60 + value.getMinutes())];
  }

  const text = String(value).replace(/\u00a0/g, " ");
  const matches = text.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[AP]M)?\b/gi);
  return matches?.map((m) => m.replace(/\s+/g, " ").trim()) ?? [];
}

function normalizeCell(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeHeader(value: unknown) {
  return normalizeCell(value).toLowerCase().replace(/\s+/g, " ");
}

function findCellIndex(row: SheetRow, label: string) {
  const target = label.toLowerCase();
  return row.findIndex((cell) => normalizeHeader(cell) === target);
}

function rowHasUserId(row: SheetRow) {
  return findCellIndex(row, "user id:") !== -1;
}

function parseReportDateRange(rows: SheetRow[]) {
  for (const row of rows.slice(0, 10)) {
    for (const cell of row) {
      const text = normalizeCell(cell);
      const match = text.match(
        /(?:Attendance\s*)?date\s*:\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/i,
      );
      if (match) {
        return { start: match[1], end: match[2] };
      }
    }
  }
  return null;
}

function buildDateFromDay(
  day: number,
  range: { start: string; end: string } | null,
) {
  if (!range) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const [startYear, startMonth, startDay] = range.start.split("-").map(Number);
  const [endYear, endMonth] = range.end.split("-").map(Number);

  let year = startYear;
  let month = startMonth;

  if ((endYear > startYear || endMonth > startMonth) && day < startDay) {
    year = endYear;
    month = endMonth;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeDateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && value > 20000) {
    return excelSerialToDate(value);
  }

  const text = normalizeCell(value);
  if (!text) return "";

  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return text;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = normalizeCell(value);
  if (!text || /^none$/i.test(text)) return null;

  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getReportText(rows: SheetRow[]) {
  return rows
    .slice(0, 20)
    .flatMap((row) => row.map((cell) => normalizeCell(cell)))
    .join(" ")
    .toLowerCase();
}

function buildDateFromAttendanceReportCell(
  value: unknown,
  range: { start: string; end: string } | null,
) {
  const normalized = normalizeDateValue(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;

  const dayMatch = normalizeCell(value).match(/^(\d{1,2})\b/);
  if (!dayMatch) return "";

  return buildDateFromDay(Number(dayMatch[1]), range);
}

function computeFromReportPunches(punches: string[]): Partial<AttendanceDraft> {
  // Summary/time-card imports do not have the employee's finalized schedule,
  // so this only derives Time In, Time Out, Total Hours, and Present status.
  // Late/undertime/overtime should still come from the Abnormal Report or
  // from the finalized Schedule module once connected.
  return computeAttendanceFromPunches(punches);
}

function parseAbnormalReportRows(rows: SheetRow[]): Partial<Attendance>[] {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes("user id") &&
      headers.includes("name") &&
      headers.includes("department") &&
      headers.includes("date")
    );
  });

  if (headerIndex === -1) return [];

  const parsedRows: Partial<Attendance>[] = [];

  rows.slice(headerIndex + 2).forEach((row) => {
    const employee = normalizeCell(row[1]);
    const date = normalizeDateValue(row[3]);
    if (!employee || !date) return;

    const rowText = row.map((cell) => normalizeCell(cell)).join(" ");
    const punches = [row[4], row[5], row[6], row[7]].flatMap((cell) =>
      extractPunchTimes(cell),
    );
    const computed =
      punches.length > 0 ? computeFromReportPunches(punches) : {};

    const lateMinutes = toNumber(row[8]) ?? 0;
    const earlyMinutes = toNumber(row[9]) ?? 0;
    const totalMinutes = toNumber(row[10]);

    let status: Attendance["status"] = "Present";
    if (/absence/i.test(rowText)) {
      status = "Absent";
    } else if (lateMinutes > 0) {
      status = "Late";
    }

    parsedRows.push({
      employee,
      date,
      timeIn: computed.timeIn ?? "",
      timeOut: computed.timeOut ?? "",
      totalHours:
        computed.totalHours ??
        (totalMinutes !== null ? (totalMinutes / 60).toFixed(2) : "0"),
      late: String(lateMinutes),
      undertime: String(earlyMinutes),
      overtime: "0",
      status,
    });
  });

  return parsedRows;
}

function parseAttendanceReportDetailRows(
  rows: SheetRow[],
): Partial<Attendance>[] {
  const dateRange = parseReportDateRange(rows);
  const parsedRows: Partial<Attendance>[] = [];

  const employeeHeaderRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell) === "name"),
  );
  const timeCardRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes("time card")),
  );

  if (employeeHeaderRowIndex === -1 || timeCardRowIndex === -1) return [];

  const employeeHeaderRow = rows[employeeHeaderRowIndex] ?? [];
  const blockStarts = employeeHeaderRow
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => normalizeHeader(cell) === "name")
    .map(({ index }) => Math.max(0, index - 8));

  blockStarts.forEach((startCol) => {
    const nameIndex = startCol + 8;
    const employee = normalizeCell(employeeHeaderRow[nameIndex + 1]);
    if (!employee) return;

    const dataRows = rows.slice(timeCardRowIndex + 3);

    dataRows.forEach((row) => {
      const date = buildDateFromAttendanceReportCell(row[startCol], dateRange);
      if (!date) return;

      const punches = [
        row[startCol + 1],
        row[startCol + 3],
        row[startCol + 6],
        row[startCol + 8],
        row[startCol + 10],
        row[startCol + 12],
      ].flatMap((cell) => extractPunchTimes(cell));

      if (punches.length === 0) return;

      parsedRows.push({
        employee,
        date,
        ...computeFromReportPunches(punches),
      });
    });
  });

  return parsedRows;
}

function attendanceKey(row: Partial<Attendance>) {
  return `${normalizeCell(row.employee).toLowerCase()}__${normalizeCell(row.date)}`;
}

function normalizeDateForFilter(value: unknown) {
  const normalized = normalizeDateValue(value);
  const iso = normalized.match(/\d{4}-\d{2}-\d{2}/);
  return iso ? iso[0] : normalized;
}

function normalizeStatusForFilter(value: unknown) {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "");
}

function getStatusValue(value: unknown): Attendance["status"] {
  const normalized = normalizeStatusForFilter(value);

  if (normalized === "late") return "Late";
  if (normalized === "absent") return "Absent";
  if (normalized === "onleave" || normalized === "leave") return "On Leave";

  return "Present";
}

function toSafeNumber(value: unknown): number {
  const n = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toDbTime(value: string) {
  const minutes = parseClockToMinutes(value || "");
  if (minutes === null) return null;
  return formatMinutesAs24Hour(minutes);
}

function fromDbTime(value: unknown) {
  if (!value) return "";
  const text = String(value).slice(0, 5);
  const minutes = parseClockToMinutes(text);
  return minutes === null ? String(value) : formatMinutesAsTime(minutes);
}

function formatEmployeeName(row: any) {
  return [row?.first_name, row?.middle_name, row?.last_name, row?.suffix]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function getAttendanceYear(date?: string | null) {
  return String(date || new Date().toISOString().slice(0, 10)).slice(0, 4);
}

function formatAttendanceDisplayId(logId?: string | null, date?: string | null, fallbackIndex = 1) {
  const year = getAttendanceYear(date);
  const raw = String(logId ?? "").trim();
  const formattedMatch = raw.match(/^ATT-(\d{4})-(\d+)$/i);
  if (formattedMatch) {
    return `ATT-${formattedMatch[1]}-${String(Number(formattedMatch[2])).padStart(4, "0")}`;
  }
  const numberMatch = raw.match(/(\d+)$/);
  const seq = numberMatch ? Number(numberMatch[1]) : fallbackIndex;
  return `ATT-${year}-${String(seq || fallbackIndex).padStart(4, "0")}`;
}

function attendanceStatusFromDb(row: any): Attendance["status"] {
  if (row?.is_absent) return "Absent";
  if (String(row?.remarks ?? "").toLowerCase().includes("leave")) return "On Leave";
  // Late, undertime, and overtime are payroll/attendance metrics, not the main status.
  // A record can still be marked Present while keeping non-zero late/undertime/overtime values.
  return "Present";
}

function getAttendanceDiscrepancy(row: Partial<Attendance> & Record<string, any>) {
  const status = getStatusValue(row.status ?? attendanceStatusFromDb(row));
  if (status === "On Leave") return "On Leave";
  if (status === "Absent" || row.is_absent) return "Absent";

  const issues: string[] = [];
  const timeIn = String(row.timeIn ?? row.raw_time_in ?? row.time_in ?? "").trim();
  const timeOut = String(row.timeOut ?? row.raw_time_out ?? row.time_out ?? "").trim();
  const totalHours = toSafeNumber(row.totalHours ?? row.total_hours);
  const lateMinutes = toSafeNumber(row.late ?? row.late_minutes);
  const undertimeMinutes = toSafeNumber(row.undertime ?? row.undertime_minutes);

  if (!timeIn) issues.push("Missing time-in");
  if (!timeOut) issues.push("Missing time-out");
  if (lateMinutes > 0 || row.is_late) issues.push(`Late ${Math.round(lateMinutes)} min`);
  if (undertimeMinutes > 0 || row.is_undertime) issues.push(`Undertime ${Math.round(undertimeMinutes)} min`);
  if (totalHours > 0 && totalHours < REQUIRED_DAILY_HOURS) issues.push("Incomplete required hours");
  if (row.is_incomplete && !issues.some((issue) => issue.startsWith("Missing"))) issues.push("Incomplete punches");

  return issues.length > 0 ? issues.join("; ") : "Complete";
}

function needsAttendanceReview(discrepancy: string) {
  return discrepancy !== "Complete" && discrepancy !== "On Leave";
}

function mapAttendanceLogToRow(row: any, index = 0): Attendance {
  const date = normalizeDateForFilter(row?.attendance_date ?? row?.date);
  const logId = String(row?.log_id ?? row?.id ?? "");
  const mapped = {
    timeIn: fromDbTime(row?.time_in ?? row?.timeIn),
    timeOut: fromDbTime(row?.time_out ?? row?.timeOut),
    totalHours: String(row?.total_hours ?? row?.totalHours ?? "0"),
    late: String(row?.late_minutes ?? row?.late ?? "0"),
    undertime: String(row?.undertime_minutes ?? row?.undertime ?? "0"),
    overtime: String(row?.overtime_minutes ?? row?.overtime ?? "0"),
    status: getStatusValue(row?.status ?? attendanceStatusFromDb(row)),
  };
  return {
    id: logId,
    displayId: formatAttendanceDisplayId(logId, date, index + 1),
    employeeId: row?.employee_id ?? undefined,
    employee: row?.employee_name || row?.employee || row?.employee_id || "Unknown Employee",
    date,
    ...mapped,
    discrepancy: getAttendanceDiscrepancy({ ...row, ...mapped }),
  };
}

async function getNextAttendanceLogId(dateValue: string) {
  const year = getAttendanceYear(dateValue);
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("log_id")
    .ilike("log_id", `ATT-${year}-%`);

  if (error) throw error;

  const maxSeq = (data ?? []).reduce((max: number, row: any) => {
    const match = String(row?.log_id ?? "").match(new RegExp(`^ATT-${year}-(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `ATT-${year}-${String(maxSeq + 1).padStart(4, "0")}`;
}

async function resolveEmployeeForAttendance(employeeValue: unknown): Promise<EmployeeOption | null> {
  const clean = normalizeCell(employeeValue);
  if (!clean) return null;

  if (/^EMP-\d{4}-\d+$/i.test(clean)) {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status")
      .eq("employee_id", clean)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...data, name: formatEmployeeName(data) || data.employee_id } : null;
  }

  const { data, error } = await supabase
    .from("employees")
    .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status")
    .limit(1000);

  if (error) throw error;

  const normalizedNeedle = clean.toLowerCase().replace(/\s+/g, " ").trim();
  const match = (data ?? []).find((row: any) => {
    const name = formatEmployeeName(row).toLowerCase().replace(/\s+/g, " ").trim();
    return name === normalizedNeedle || name.includes(normalizedNeedle) || normalizedNeedle.includes(name);
  });

  return match ? { ...match, name: formatEmployeeName(match) || match.employee_id } : null;
}

function buildAttendancePayload(row: Partial<Attendance>, employee: EmployeeOption | null, logId?: string) {
  const status = getStatusValue(row.status);
  const lateMinutes = Math.round(toSafeNumber(row.late));
  const undertimeMinutes = Math.round(toSafeNumber(row.undertime));
  const overtimeMinutes = Math.round(toSafeNumber(row.overtime));
  const isAbsent = status === "Absent";
  const isOnLeave = status === "On Leave";
  const discrepancy = getAttendanceDiscrepancy({
    ...row,
    status,
    late: lateMinutes,
    undertime: undertimeMinutes,
    overtime: overtimeMinutes,
    is_absent: isAbsent,
  });
  const needsReview = needsAttendanceReview(discrepancy);

  return {
    ...(logId ? { log_id: logId } : {}),
    employee_id: employee?.employee_id ?? (String(row.employee ?? "").match(/^EMP-/i) ? String(row.employee) : null),
    employee_name: employee?.name ?? String(row.employee ?? ""),
    attendance_date: normalizeDateForFilter(row.date),
    time_in: toDbTime(String(row.timeIn ?? "")),
    time_out: toDbTime(String(row.timeOut ?? "")),
    raw_time_in: String(row.timeIn ?? ""),
    raw_time_out: String(row.timeOut ?? ""),
    total_hours: toSafeNumber(row.totalHours),
    late_minutes: lateMinutes,
    undertime_minutes: undertimeMinutes,
    overtime_minutes: overtimeMinutes,
    is_late: lateMinutes > 0 || status === "Late",
    is_undertime: undertimeMinutes > 0,
    is_overtime: overtimeMinutes > 0,
    is_absent: isAbsent,
    is_incomplete: needsReview && !isAbsent && !isOnLeave,
    source: "Manual Encoding",
    validation_status: needsReview ? "Needs Review" : "Validated",
    remarks: isOnLeave ? "On Leave" : discrepancy === "Complete" ? null : discrepancy,
    updated_at: new Date().toISOString(),
  };
}

function parseSimpleAttendanceRows(rows: SheetRow[]): Partial<Attendance>[] {
  const headerIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    const hasEmployee = headers.some(
      (h) => h.includes("employee") || h === "name",
    );
    const hasDate = headers.some((h) => h === "date" || h.includes("date"));
    const hasIn = headers.some((h) => h.includes("time in") || h === "in");
    const hasOut = headers.some((h) => h.includes("time out") || h === "out");
    return hasEmployee && hasDate && hasIn && hasOut;
  });

  if (headerIndex === -1) return [];

  const headers = rows[headerIndex].map(normalizeHeader);
  const employeeIndex = headers.findIndex(
    (h) => h.includes("employee") || h === "name",
  );
  const dateIndex = headers.findIndex(
    (h) => h === "date" || h.includes("date"),
  );
  const timeInIndex = headers.findIndex(
    (h) => h.includes("time in") || h === "in",
  );
  const timeOutIndex = headers.findIndex(
    (h) => h.includes("time out") || h === "out",
  );

  return rows
    .slice(headerIndex + 1)
    .map((row) => {
      const employee = normalizeCell(row[employeeIndex]);
      const date = normalizeDateValue(row[dateIndex]);
      const inTimes = extractPunchTimes(row[timeInIndex]);
      const outTimes = extractPunchTimes(row[timeOutIndex]);
      const punches = [...inTimes, ...outTimes];

      if (!employee || !date || punches.length === 0) return null;

      return {
        employee,
        date,
        ...computeAttendanceFromPunches(punches, "8:00 AM", "5:00 PM"),
      } as Partial<Attendance>;
    })
    .filter((row): row is Partial<Attendance> => row !== null);
}

function parseEmployeeAttendanceRecordRows(
  rows: SheetRow[],
): Partial<Attendance>[] {
  const dateRange = parseReportDateRange(rows);
  const parsedRows: Partial<Attendance>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const currentRow = rows[i] ?? [];
    const userIdIndex = findCellIndex(currentRow, "user id:");
    if (userIdIndex === -1) continue;

    const nameIndex = findCellIndex(currentRow, "name:");
    const employeeName =
      nameIndex !== -1
        ? normalizeCell(currentRow[nameIndex + 1])
        : normalizeCell(currentRow[userIdIndex + 1]);

    const employee =
      employeeName || `User ${normalizeCell(currentRow[userIdIndex + 1])}`;
    const dateRow = rows[i + 1] ?? [];
    const punchRows: SheetRow[] = [];

    let j = i + 2;
    while (j < rows.length && !rowHasUserId(rows[j] ?? [])) {
      punchRows.push(rows[j] ?? []);
      j++;
    }

    dateRow.forEach((dayValue, colIndex) => {
      const day = Number(normalizeCell(dayValue));
      if (!Number.isInteger(day) || day < 1 || day > 31) return;

      const punches = punchRows.flatMap((row) =>
        extractPunchTimes(row[colIndex]),
      );
      if (punches.length === 0) return;

      parsedRows.push({
        employee,
        date: buildDateFromDay(day, dateRange),
        ...computeAttendanceFromPunches(punches),
      });
    });

    i = j - 1;
  }

  return parsedRows;
}

function worksheetRows(sheet: XLSX.WorkSheet): SheetRow[] {
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  }) as SheetRow[];
}

function parseWorkbookForAttendance(workbook: XLSX.WorkBook) {
  const records: Partial<Attendance>[] = [];
  const formats = new Set<string>();
  const simpleRows: Partial<Attendance>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = worksheetRows(sheet);
    const reportText = `${sheetName} ${getReportText(rows)}`.toLowerCase();

    const hasEmployeeAttendanceRecord = rows.some((row) =>
      row.some((cell) =>
        normalizeCell(cell)
          .toLowerCase()
          .includes("employee attendance record"),
      ),
    );
    const hasUserBlocks = rows.some(rowHasUserId);
    const hasAbnormalReport = reportText.includes("abnormal report");
    const hasEmployeeAttendanceTable =
      reportText.includes("employee attendance table") &&
      !reportText.includes("shift setting table") &&
      !reportText.includes("attendance statistic table");

    if (hasEmployeeAttendanceRecord || hasUserBlocks) {
      const parsed = parseEmployeeAttendanceRecordRows(rows);
      records.push(...parsed);
      if (parsed.length > 0) formats.add("Employee Attendance Record");
      continue;
    }

    if (hasAbnormalReport) {
      const parsed = parseAbnormalReportRows(rows);
      records.push(...parsed);
      if (parsed.length > 0) formats.add("Abnormal Report");
      continue;
    }

    if (hasEmployeeAttendanceTable) {
      const parsed = parseAttendanceReportDetailRows(rows);
      records.push(...parsed);
      if (parsed.length > 0) formats.add("Attendance Report Time Card");
      continue;
    }

    simpleRows.push(...parseSimpleAttendanceRows(rows));
  }

  if (records.length > 0) {
    return {
      records,
      format: Array.from(formats).join(" + "),
    };
  }

  return {
    records: simpleRows,
    format: simpleRows.length > 0 ? "Simple CSV/Table" : "Unsupported report",
  };
}

function parseTextForAttendance(text: string) {
  try {
    const workbook = XLSX.read(text, { type: "string", cellDates: false });
    return parseWorkbookForAttendance(workbook);
  } catch {
    const rows = text
      .split("\n")
      .map((line) => line.split(",").map((cell) => cell.trim()));
    const records = parseSimpleAttendanceRows(rows);
    return {
      records,
      format:
        records.length > 0 ? "Simple CSV/Table" : "Unsupported text format",
    };
  }
}

function waitForBrowserPaint() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

async function readErrorMessage(res: Response, fallback: string) {
  try {
    const data = await res.json();
    return data?.error ?? data?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function saveImportTask(task: SaveImportTask): Promise<ImportSaveResult> {
  const employee = await resolveEmployeeForAttendance(task.row.employee);
  const date = normalizeDateForFilter(task.row.date);
  // For imports, let the database generate the raw log_id to avoid duplicate IDs during concurrent batch saves.
  // The UI still displays the friendly ATT-YYYY-0001 format through displayId.
  const logId = undefined;
  const payload = buildAttendancePayload(task.row, employee, logId);

  const query = task.kind === "update" && task.existingId
    ? supabase.from("attendance_logs").update(payload).eq("log_id", task.existingId).select().single()
    : supabase.from("attendance_logs").insert(payload).select().single();

  const { data, error } = await query;

  if (error) {
    return { ok: false, key: task.key, error: error.message };
  }

  if (!data?.log_id) {
    return { ok: false, key: task.key, error: "Saved the row but did not return a valid attendance log." };
  }

  return {
    ok: true,
    kind: task.kind,
    record: mapAttendanceLogToRow(data),
    key: task.key,
  };
}


export default function AttendanceMonitoring() {
  const { user } = useAuth();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<Partial<Attendance>[]>([]);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState("");
  const [parsingImport, setParsingImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success" as "success" | "error",
  });
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [deleteAllDialog, setDeleteAllDialog] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState("");
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({
    current: 0,
    total: 0,
    failed: 0,
  });
  const [importProgress, setImportProgress] = useState({
    current: 0,
    total: 0,
    failed: 0,
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);

  const normalizedUserRole = String(user?.role ?? "").toLowerCase();
  const canManageAttendance = ["hr", "hr_admin", "general_manager", "admin"].includes(normalizedUserRole) || normalizedUserRole.includes("hr") || normalizedUserRole.includes("admin");

  const fetchEmployeeOptions = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status")
      .order("last_name", { ascending: true });

    if (error) {
      console.warn("Could not load active employees:", error.message);
      setEmployeeOptions([]);
      return;
    }

    setEmployeeOptions((data ?? [])
      .filter((row: any) => String(row.status ?? "Active").toLowerCase() === "active")
      .map((row: any) => ({
        employee_id: row.employee_id,
        name: formatEmployeeName(row) || row.employee_id,
        position: row.position,
        outlet: row.outlet,
        status: row.status,
      })));
  };

  const fetchAttendance = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select("log_id, employee_id, employee_name, attendance_date, time_in, time_out, total_hours, late_minutes, undertime_minutes, overtime_minutes, is_late, is_absent, is_undertime, is_overtime, is_incomplete, remarks, validation_status, created_at")
        .order("attendance_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAttendances((data ?? []).map((row: any, index: number) => mapAttendanceLogToRow(row, index)));
    } catch (e: any) {
      setError(`Could not load attendance: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeeOptions();
    fetchAttendance();
  }, []);

  useEffect(() => {
    setPage(0);
  }, [filterDate, filterStatus]);

  // Auto-compute when time changes
  const handleTimeChange = (field: "timeIn" | "timeOut", val: string) => {
    const updated = { ...form, [field]: val };
    const computed = computeAttendance(
      field === "timeIn" ? val : form.timeIn,
      field === "timeOut" ? val : form.timeOut,
    );
    setForm({ ...updated, ...computed });
  };

  const handleSave = async () => {
    if (!form.employee || !form.date) {
      setSnackbar({ open: true, message: "Please select an employee and date.", severity: "error" });
      return;
    }
    setSaving(true);
    try {
      const employee = employeeOptions.find((emp) => emp.employee_id === form.employee) ?? await resolveEmployeeForAttendance(form.employee);
      if (!employee?.employee_id) throw new Error("Selected employee was not found in the employees table.");

      const logId = await getNextAttendanceLogId(form.date);
      const payload = buildAttendancePayload(form, employee, logId);

      const { data, error } = await supabase
        .from("attendance_logs")
        .insert(payload)
        .select()
        .single();

      if (error) throw error;

      const savedRecord = mapAttendanceLogToRow(data);
      setAttendances((prev) => [savedRecord, ...prev]);
      setDialogOpen(false);
      setForm(EMPTY);
      setSnackbar({
        open: true,
        message: `Attendance record ${savedRecord.displayId ?? savedRecord.id} saved.`,
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

  const applyImportResult = (
    records: Partial<Attendance>[],
    format: string,
  ) => {
    setImportPreview(records);
    setImportFormat(format);

    if (records.length === 0) {
      setSnackbar({
        open: true,
        message:
          "No importable rows were found. Please upload Employee Attendance Record first, Abnormal Report second, then Attendance Report third.",
        severity: "error",
      });
    } else {
      setSnackbar({
        open: true,
        message: `Parsed ${records.length} record(s) from ${format}.`,
        severity: "success",
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isTextOnly = /\.(txt|csv)$/i.test(file.name);
    const reader = new FileReader();

    setParsingImport(true);
    setImportPreview([]);
    setImportFormat("");
    setImportProgress({ current: 0, total: 0, failed: 0 });

    reader.onerror = () => {
      setParsingImport(false);
      if (fileRef.current) fileRef.current.value = "";
      setSnackbar({
        open: true,
        message: "Failed to read file. Please try uploading it again.",
        severity: "error",
      });
    };

    reader.onload = async (ev) => {
      try {
        // Allows the loading indicator to render before XLSX starts parsing.
        await waitForBrowserPaint();

        if (isTextOnly) {
          const text = String(ev.target?.result ?? "");
          setImportText(text);
          const result = parseTextForAttendance(text);
          applyImportResult(result.records, result.format);
          return;
        }

        const data = ev.target?.result;
        const workbook = XLSX.read(data, {
          type: "array",
          cellDates: false,
          dense: true,
        });
        const result = parseWorkbookForAttendance(workbook);
        setImportText("");
        applyImportResult(result.records, result.format);
      } catch (err: any) {
        setImportPreview([]);
        setImportFormat("");
        setSnackbar({
          open: true,
          message: `Failed to read file: ${err.message}`,
          severity: "error",
        });
      } finally {
        setParsingImport(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    };

    if (isTextOnly) {
      reader.readAsText(file);
    } else {
      reader.readAsArrayBuffer(file);
    }
  };

  const handleParseTextInput = async () => {
    if (!importText.trim()) return;

    setParsingImport(true);
    setImportPreview([]);
    setImportFormat("");

    try {
      await waitForBrowserPaint();
      const result = parseTextForAttendance(importText);
      applyImportResult(result.records, result.format);
    } finally {
      setParsingImport(false);
    }
  };

  const handleImport = async () => {
    if (importPreview.length === 0 || importing || parsingImport) return;

    setImporting(true);
    setImportProgress({ current: 0, total: importPreview.length, failed: 0 });

    let successCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;

    const newRecords: Attendance[] = [];
    const updatedRecords: Attendance[] = [];
    const existingByKey = new Map<string, Attendance>(
      attendances.map(
        (record) => [attendanceKey(record), record] as [string, Attendance],
      ),
    );
    const importedKeys = new Set<string>();
    const isAbnormalImport = importFormat.toLowerCase().includes("abnormal");
    const tasks: SaveImportTask[] = [];

    for (const row of importPreview) {
      const employee = normalizeCell(row.employee);
      const date = normalizeCell(row.date);
      const key = attendanceKey(row);

      if (!employee || !date || importedKeys.has(key)) {
        duplicateCount++;
        continue;
      }

      importedKeys.add(key);

      const existing = existingByKey.get(key);

      if (existing && isAbnormalImport) {
        tasks.push({
          kind: "update",
          key,
          existingId: existing.id,
          row: {
            ...existing,
            ...row,
            correctedBy: user?.name ?? "HR Admin",
          },
        });
      } else if (existing) {
        duplicateCount++;
      } else {
        tasks.push({
          kind: "create",
          key,
          row,
        });
      }
    }

    if (tasks.length === 0) {
      setImporting(false);
      setImportProgress({
        current: importPreview.length,
        total: importPreview.length,
        failed: 0,
      });
      setSnackbar({
        open: true,
        message: `No new records to import. Skipped ${duplicateCount} duplicate/invalid row(s).`,
        severity: "success",
      });
      return;
    }

    let completedTasks = 0;

    try {
      for (let start = 0; start < tasks.length; start += IMPORT_CONCURRENCY) {
        const batch = tasks.slice(start, start + IMPORT_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (task) => {
            try {
              return await saveImportTask(task);
            } catch (err: any) {
              return {
                ok: false,
                key: task.key,
                error: err?.message ?? "Network error",
              } as ImportSaveResult;
            }
          }),
        );

        for (const result of results) {
          if (!result.ok) {
            failedCount++;
            continue;
          }

          if (result.kind === "update") {
            updatedRecords.push({
              ...result.record,
              date: normalizeDateForFilter(result.record.date),
              status: getStatusValue(result.record.status),
            });
            updatedCount++;
          } else {
            newRecords.push({
              ...result.record,
              date: normalizeDateForFilter(result.record.date),
              status: getStatusValue(result.record.status),
            });
            successCount++;
          }
        }

        completedTasks += batch.length;
        setImportProgress({
          current: Math.min(
            duplicateCount + completedTasks,
            importPreview.length,
          ),
          total: importPreview.length,
          failed: failedCount,
        });

        // Gives React one small break between batches so the progress bar stays responsive.
        await waitForBrowserPaint();
      }

      if (newRecords.length > 0 || updatedRecords.length > 0) {
        setAttendances((prev) => {
          const updatesById = new Map(
            updatedRecords.map(
              (record) => [record.id, record] as [string, Attendance],
            ),
          );
          const next = prev.map(
            (record) => updatesById.get(record.id) ?? record,
          );
          const existingIds = new Set(next.map((record) => record.id));
          const uniqueNewRecords = newRecords.filter(
            (record) => record?.id && !existingIds.has(record.id),
          );
          return [...next, ...uniqueNewRecords];
        });
      }

      setImportDialog(false);
      setImportPreview([]);
      setImportText("");
      setImportFormat("");
      setSnackbar({
        open: true,
        message: `✅ Imported ${successCount} new record(s), updated ${updatedCount} abnormal record(s), skipped ${duplicateCount} duplicate/invalid row(s)${
          failedCount > 0 ? `, and failed to save ${failedCount} row(s)` : ""
        }.`,
        severity: failedCount > 0 ? "error" : "success",
      });
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0, failed: 0 });
    }
  };

  const filtered = useMemo(() => {
    const selectedDate = normalizeDateForFilter(filterDate);

    return attendances.filter((a) => {
      const recordDate = normalizeDateForFilter(a.date);
      const dateMatch = !selectedDate || recordDate === selectedDate;
      const hasLateMetric = toSafeNumber(a.late) > 0;
      const statusMatch =
        filterStatus === "all" ||
        (filterStatus === "late"
          ? hasLateMetric || normalizeStatusForFilter(a.status) === "late"
          : normalizeStatusForFilter(a.status) === filterStatus);

      return dateMatch && statusMatch;
    });
  }, [attendances, filterDate, filterStatus]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / rowsPerPage)),
    [filtered.length, rowsPerPage],
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages - 1));
  }, [totalPages]);

  const paginatedFiltered = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const pageStart = filtered.length === 0 ? 0 : page * rowsPerPage + 1;
  const pageEnd = Math.min((page + 1) * rowsPerPage, filtered.length);
  const canGoPrevious = page > 0;
  const canGoNext = page < totalPages - 1;

  const handlePreviousPage = () => {
    setPage((currentPage) => Math.max(0, currentPage - 1));
  };

  const handleNextPage = () => {
    setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1));
  };

  const importPreviewRows = useMemo(
    () => importPreview.slice(0, PREVIEW_ROW_LIMIT),
    [importPreview],
  );

  const summary = useMemo(() => {
    const totals = {
      present: 0,
      late: 0,
      undertime: 0,
      absent: 0,
      onLeave: 0,
      discrepancies: 0,
    };

    for (const record of filtered) {
      if (record.status === "Present" || record.status === "Late") {
        totals.present++;
      }

      if (record.status === "Late" || toSafeNumber(record.late) > 0) totals.late++;
      if (toSafeNumber(record.undertime) > 0) totals.undertime++;
      if (record.status === "Absent") totals.absent++;
      if (record.status === "On Leave") totals.onLeave++;
      if (needsAttendanceReview(record.discrepancy)) totals.discrepancies++;
    }

    return totals;
  }, [filtered]);

  const [editDialog, setEditDialog] = useState(false);
  const [editRecord, setEditRecord] = useState<Attendance | null>(null);
  const [editForm, setEditForm] = useState({
    timeIn: "",
    timeOut: "",
    totalHours: "",
    late: "0",
    undertime: "0",
    overtime: "0",
    status: "Present" as Attendance["status"],
  });

  const handleEditSave = async () => {
    if (!editRecord) return;
    setSaving(true);
    try {
      const employee = editRecord.employeeId
        ? await resolveEmployeeForAttendance(editRecord.employeeId)
        : await resolveEmployeeForAttendance(editRecord.employee);
      const payload = buildAttendancePayload(
        { ...editRecord, ...editForm, employee: editRecord.employeeId ?? editRecord.employee },
        employee,
      );

      const { data, error } = await supabase
        .from("attendance_logs")
        .update({ ...payload, validation_status: "Corrected" })
        .eq("log_id", editRecord.id)
        .select()
        .single();

      if (error) throw error;
      const correctedRecord = mapAttendanceLogToRow(data);
      setAttendances((prev) =>
        prev.map((a) => (a.id === editRecord.id ? correctedRecord : a)),
      );
      setEditDialog(false);
      setSnackbar({
        open: true,
        message: "✅ Attendance record corrected and reprocessed!",
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


  const openEdit = (att: Attendance) => {
    setEditRecord(att);
    setEditForm({
      timeIn: att.timeIn,
      timeOut: att.timeOut,
      totalHours: att.totalHours,
      late: att.late,
      undertime: att.undertime,
      overtime: att.overtime,
      status: att.status,
    });
    setEditDialog(true);
  };

  const handleDelete = async (id: string) => {
    const target = attendances.find((record) => record.id === id);
    const label = target?.displayId ?? id;
    if (!window.confirm(`Delete attendance record ${label}? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from("attendance_logs")
        .delete()
        .eq("log_id", id);

      if (error) throw error;
      setAttendances((prev) => prev.filter((a) => a.id !== id));
      setSnackbar({
        open: true,
        message: `🗑️ Record ${label} deleted.`,
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


  const handleDeleteAll = async () => {
    if (deleteAllConfirm.trim().toLowerCase() !== "delete" || deletingAll)
      return;

    const recordsToDelete = [...attendances];
    const totalRecords = recordsToDelete.length;
    const deletedIds = new Set<string>();
    let failedCount = 0;
    let completedCount = 0;

    setDeletingAll(true);
    setDeleteProgress({ current: 0, total: totalRecords, failed: 0 });

    try {
      for (
        let start = 0;
        start < recordsToDelete.length;
        start += DELETE_CONCURRENCY
      ) {
        const batch = recordsToDelete.slice(start, start + DELETE_CONCURRENCY);

        const results = await Promise.all(
          batch.map(async (record) => {
            try {
              const { error } = await supabase
                .from("attendance_logs")
                .delete()
                .eq("log_id", record.id);

              return {
                id: record.id,
                ok: !error,
              };
            } catch {
              return {
                id: record.id,
                ok: false,
              };
            }
          }),
        );

        for (const result of results) {
          if (result.ok) {
            deletedIds.add(result.id);
          } else {
            failedCount++;
          }
        }

        completedCount += batch.length;
        setDeleteProgress({
          current: completedCount,
          total: totalRecords,
          failed: failedCount,
        });

        await waitForBrowserPaint();
      }

      if (deletedIds.size > 0) {
        setAttendances((prev) =>
          prev.filter((record) => !deletedIds.has(record.id)),
        );
      }

      setDeleteAllDialog(false);
      setDeleteAllConfirm("");
      setSnackbar({
        open: true,
        message: `🗑️ Deleted ${deletedIds.size}/${totalRecords} attendance record(s)${
          failedCount > 0 ? `; ${failedCount} failed` : ""
        }.`,
        severity: failedCount > 0 ? "error" : "success",
      });
    } finally {
      setDeletingAll(false);
      setDeleteProgress({ current: 0, total: 0, failed: 0 });
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100%",
        p: { xs: 1.5, sm: 2.25, md: 3 },
        background: GREEN_UI.pageBg,
        color: GREEN_UI.text,
        borderRadius: { xs: 0, md: "32px" },
      }}
    >
      <Paper
        elevation={0}
        sx={{
          ...softCardSx,
          p: { xs: 2, sm: 2.75, md: 3.25 },
          mb: 2.5,
          position: "relative",
          overflow: "hidden",
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,250,235,0.96) 60%, rgba(225,248,224,0.94) 100%)",
          "&:before": {
            content: '""',
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: "50%",
            right: -90,
            top: -110,
            background: "rgba(76, 175, 80, 0.12)",
          },
          "&:after": {
            content: '""',
            position: "absolute",
            width: 160,
            height: 160,
            borderRadius: "50%",
            left: { xs: "70%", md: "44%" },
            bottom: -95,
            background: "rgba(174, 222, 144, 0.18)",
          },
        }}
      >
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            justifyContent: "space-between",
            alignItems: { xs: "flex-start", md: "center" },
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          <Box sx={{ maxWidth: 720 }}>
            <Chip
              icon={<DashboardCustomizeRounded sx={{ fontSize: "16px !important" }} />}
              label="Attendance Workspace"
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
                fontSize: { xs: "1.55rem", sm: "2rem", md: "2.35rem" },
                color: GREEN_UI.text,
                letterSpacing: "-0.04em",
                lineHeight: 1.08,
                mb: 0.75,
              }}
            >
              Attendance Monitoring
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 680, lineHeight: 1.7 }}>
              Track biometric and manual attendance, review payroll metrics, and validate daily records against finalized schedules.
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "center",
              flexWrap: "wrap",
              width: { xs: "100%", md: "auto" },
              "& .MuiButton-root": { width: { xs: "100%", sm: "auto" } },
            }}
          >
            <Tooltip title="Refresh attendance records">
              <span>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={fetchAttendance}
                  disabled={loading}
                  sx={{
                    ...pillButtonSx,
                    py: 1.1,
                    bgcolor: GREEN_UI.green,
                    boxShadow: "0 12px 24px rgba(58, 168, 101, 0.25)",
                    "&:hover": { bgcolor: GREEN_UI.greenDark, boxShadow: "0 16px 28px rgba(31, 122, 70, 0.28)" },
                  }}
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </Button>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddCircleOutline />}
              onClick={() => setDialogOpen(true)}
              sx={{
                ...pillButtonSx,
                py: 1.1,
                bgcolor: GREEN_UI.greenDark,
                boxShadow: "0 12px 24px rgba(31, 122, 70, 0.22)",
                "&:hover": { bgcolor: "#176238", boxShadow: "0 16px 28px rgba(31, 122, 70, 0.28)" },
              }}
            >
              Manual Entry
            </Button>
            <Button
              variant="outlined"
              startIcon={<UploadFile />}
              onClick={() => setImportDialog(true)}
              sx={{
                ...pillButtonSx,
                py: 1.1,
                bgcolor: "rgba(255,255,255,0.7)",
                borderColor: GREEN_UI.borderStrong,
                color: GREEN_UI.greenDark,
                "&:hover": { borderColor: GREEN_UI.green, bgcolor: GREEN_UI.greenSoft },
              }}
            >
              Import Biometric Data
            </Button>
            {canManageAttendance && (
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteSweep />}
                onClick={() => setDeleteAllDialog(true)}
                disabled={attendances.length === 0 || deletingAll}
                sx={{ ...pillButtonSx, py: 1.1 }}
              >
                Delete All Data
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {[
          {
            label: "Visible Records",
            value: filtered.length,
            caption: filterDate || filterStatus !== "all" ? "Records matching your filters" : "Currently displayed attendance logs",
            icon: <FactCheckRounded />,
          },
          {
            label: "Present",
            value: summary.present,
            caption: "Present records, including entries with late minutes",
            icon: <AddTaskRounded />,
          },
          {
            label: "Late Entries",
            value: summary.late,
            caption: "Records with late minutes for payroll review",
            icon: <WatchLaterRounded />,
          },
          {
            label: "Absent / Leave",
            value: summary.absent + summary.onLeave,
            caption: "Combined absent and approved leave records",
            icon: <EventBusyRounded />,
          },
        ].map((stat) => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, md: 3 }}>
            <Paper
              elevation={0}
              sx={{
                ...softCardSx,
                p: 2,
                minHeight: 126,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                transition: "transform 180ms ease, box-shadow 180ms ease",
                "&:hover": { transform: "translateY(-3px)", boxShadow: "0 22px 48px rgba(43, 91, 55, 0.13)" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                    {stat.label}
                  </Typography>
                  <Typography variant="h4" fontWeight={700} sx={{ color: GREEN_UI.text, mt: 0.5, letterSpacing: "-0.04em" }}>
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

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2, borderRadius: "18px", border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={fetchAttendance} sx={pillButtonSx}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
          <Box sx={{ ...iconTileSx, width: 38, height: 38}}>
            <TuneRounded fontSize="small" />
          </Box>
          <Box>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }}>
              Attendance Filters
            </Typography>
            <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
              Narrow records by date and attendance status without changing saved data.
            </Typography>
          </Box>
        </Box>
        <Grid container spacing={2} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              label="Filter by Date"
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setPage(0);
              }}
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
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              select
              label="Status"
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                setPage(0);
              }}
              InputLabelProps={{ shrink: true }}
              sx={softTextFieldSx}
            >
              <MenuItem key="all" value="all">All Status</MenuItem>
              <MenuItem key="present" value="present">Present</MenuItem>
              <MenuItem key="late" value="late">Late</MenuItem>
              <MenuItem key="absent" value="absent">Absent</MenuItem>
              <MenuItem key="onleave" value="onleave">On Leave</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CloseRounded />}
              sx={{ ...pillButtonSx, height: "56px", borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
              onClick={() => {
                setFilterDate("");
                setFilterStatus("all");
                setPage(0);
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Paper
          elevation={0}
          sx={{
            ...softCardSx,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            py: 7,
            gap: 2,
          }}
        >
          <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
          <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading attendance records…</Typography>
        </Paper>
      ) : isSmallScreen ? (
        <Stack spacing={1.25}>
          {filtered.length === 0 ? (
            <Paper elevation={0} sx={{ ...softCardSx, p: 3, textAlign: "center", color: GREEN_UI.muted }}>
              {attendances.length === 0
                ? "No attendance records yet. Use Manual Entry or Import Biometric Data."
                : "No results match your filters."}
            </Paper>
          ) : (
            paginatedFiltered.map((att) => (
              <Paper key={att.id} elevation={0} sx={{ ...softCardSx, p: 2 }}>
                <Stack spacing={1.5}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={700} noWrap sx={{ color: GREEN_UI.text }}>
                        {att.employee}
                      </Typography>
                      <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                        {normalizeDateForFilter(att.date)}
                      </Typography>
                    </Box>
                    <Chip
                      label={att.status}
                      size="small"
                      variant="outlined"
                      sx={statusChipSx(att.status)}
                    />
                  </Box>

                  <Grid container spacing={1.5}>
                    {[
                      ["Time In", att.timeIn || "—"],
                      ["Time Out", att.timeOut || "—"],
                      ["Total Hours", att.totalHours || "—"],
                      ["Late", `${att.late || 0} min`],
                      ["Undertime", `${att.undertime || 0} min`],
                      ["Overtime", `${att.overtime || 0} min`],
                    ].map(([label, value]) => (
                      <Grid key={label} size={{ xs: 6 }}>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                          {label}
                        </Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ color: GREEN_UI.text }}>
                          {value}
                        </Typography>
                      </Grid>
                    ))}
                  </Grid>

                  {canManageAttendance && (
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      <Chip
                        label="Correct"
                        size="small"
                        clickable
                        variant="outlined"
                        color="warning"
                        onClick={() => openEdit(att)}
                        sx={{ ...pillButtonSx, minWidth: 104 }}
                      />
                      <Chip
                        label="Delete"
                        size="small"
                        clickable
                        variant="outlined"
                        color="error"
                        onClick={() => handleDelete(att.id)}
                        sx={{ ...pillButtonSx, minWidth: 96 }}
                      />
                    </Box>
                  )}
                </Stack>
              </Paper>
            ))
          )}
        </Stack>
      ) : (
        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            ...softCardSx,
            overflowX: "auto",
            "&::-webkit-scrollbar": { height: 10 },
            "&::-webkit-scrollbar-thumb": { bgcolor: "#cfe8d1"},
          }}
        >
          <Table sx={{ minWidth: 960, "& th, & td": { borderColor: "rgba(139, 184, 144, 0.16)" } }}>
            <TableHead>
              <TableRow
                sx={{
                  background: "linear-gradient(90deg, #eff8eb 0%, #f8fcf5 100%)",
                  "& th": {
                    color: GREEN_UI.greenDark,
                    fontWeight: 700,
                    fontSize: "0.78rem",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                    py: 1.7,
                    whiteSpace: "nowrap",
                  },
                }}
              >
                <TableCell>ID</TableCell>
                <TableCell>Employee</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Time In</TableCell>
                <TableCell>Time Out</TableCell>
                <TableCell>Total Hours</TableCell>
                <TableCell>Late (min)</TableCell>
                <TableCell>Undertime (min)</TableCell>
                <TableCell>Overtime (min)</TableCell>
                <TableCell>Discrepancy</TableCell>
                <TableCell>Status</TableCell>
                {canManageAttendance && <TableCell>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManageAttendance ? 12 : 11}
                    align="center"
                    sx={{ py: 7, color: GREEN_UI.muted }}
                  >
                    {attendances.length === 0
                      ? "No attendance records yet. Use Manual Entry or Import Biometric Data."
                      : "No results match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedFiltered.map((att) => (
                  <TableRow
                    key={att.id}
                    hover
                    sx={{
                      transition: "background 160ms ease",
                      "&:hover": { backgroundColor: "rgba(230, 248, 233, 0.36) !important" },
                    }}
                  >
                    <TableCell>
                      <Chip
                        icon={<BadgeRounded sx={{ fontSize: "15px !important" }} />}
                        label={att.displayId ?? att.id}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontWeight: 600,
                          color: GREEN_UI.greenDark,
                          borderColor: GREEN_UI.borderStrong,
                          bgcolor: GREEN_UI.greenSoft,
                        }}
                      />
                    </TableCell>
                    <TableCell sx={{ minWidth: 190 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box sx={{ ...iconTileSx, width: 34, height: 34}}>
                          <PersonRounded fontSize="small" />
                        </Box>
                        <Typography fontWeight={600} sx={{ color: GREEN_UI.text, whiteSpace: "nowrap" }}>{att.employee}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: GREEN_UI.text }}>
                        <CalendarMonthRounded sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" fontWeight={700}>{normalizeDateForFilter(att.date)}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <AccessTimeRounded sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" fontWeight={700}>{att.timeIn || "—"}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <TimerRounded sx={{ fontSize: 18, color: GREEN_UI.greenDark }} />
                        <Typography variant="body2" fontWeight={700}>{att.timeOut || "—"}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, color: GREEN_UI.text }}>{att.totalHours}</TableCell>
                    <TableCell
                      sx={{
                        color:
                          Number(att.late) > 0 ? "warning.main" : "inherit",
                      }}
                    >
                      {att.late}
                    </TableCell>
                    <TableCell
                      sx={{
                        color:
                          Number(att.undertime) > 0
                            ? "warning.main"
                            : "inherit",
                      }}
                    >
                      {att.undertime}
                    </TableCell>
                    <TableCell
                      sx={{
                        color:
                          Number(att.overtime) > 0 ? "success.main" : "inherit",
                      }}
                    >
                      {att.overtime}
                    </TableCell>
                    <TableCell sx={{ minWidth: 210 }}>
                      <Chip
                        label={att.discrepancy}
                        size="small"
                        variant="outlined"
                        sx={{
                          maxWidth: 260,
                          bgcolor: needsAttendanceReview(att.discrepancy) ? "#fff7e0" : GREEN_UI.greenSoft,
                          color: needsAttendanceReview(att.discrepancy) ? "#9b6b00" : GREEN_UI.greenDark,
                          borderColor: needsAttendanceReview(att.discrepancy) ? "#f5d786" : GREEN_UI.borderStrong,
                          fontWeight: 600,
                          "& .MuiChip-label": {
                            display: "block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          },
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={att.status}
                        size="small"
                        variant="outlined"
                        sx={statusChipSx(att.status)}
                      />
                    </TableCell>
                    {canManageAttendance && (
                      <TableCell>
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                            alignItems: "flex-start",
                          }}
                        >
                          <Chip
                            label="Correct"
                            size="small"
                            clickable
                            variant="outlined"
                            color="warning"
                            onClick={() => openEdit(att)}
                            sx={{ ...pillButtonSx, minWidth: 110 }}
                          />
                          <Chip
                            label="Delete"
                            size="small"
                            clickable
                            variant="outlined"
                            color="error"
                            onClick={() => handleDelete(att.id)}
                            sx={{ ...pillButtonSx, minWidth: 110 }}
                          />
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && filtered.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            ...softCardSx,
            mt: 1.5,
            p: { xs: 1.25, sm: 1.5 },
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "stretch", sm: "center" },
            justifyContent: "space-between",
            gap: 1.5,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
              Rows per page:
            </Typography>
            <TextField
              select
              size="small"
              value={rowsPerPage}
              onChange={(event) => {
                setRowsPerPage(Number(event.target.value));
                setPage(0);
              }}
              sx={{ ...softTextFieldSx, width: 96 }}
            >
              {[25, 50, 100, 250].map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: { xs: "space-between", sm: "flex-end" },
              gap: 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{ minWidth: 135, color: GREEN_UI.muted, fontWeight: 600 }}
            >
              {pageStart}-{pageEnd} of {filtered.length}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Tooltip title="Previous page">
                <span>
                  <IconButton
                    type="button"
                    size="small"
                    onClick={handlePreviousPage}
                    disabled={!canGoPrevious}
                    sx={{ bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark, "&:hover": { bgcolor: "#d7f2dd" } }}
                  >
                    <ArrowBackIosNew fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography
                variant="body2"
                sx={{ px: 1, minWidth: 84, textAlign: "center", color: GREEN_UI.text, fontWeight: 600 }}
              >
                Page {page + 1} / {totalPages}
              </Typography>
              <Tooltip title="Next page">
                <span>
                  <IconButton
                    type="button"
                    size="small"
                    onClick={handleNextPage}
                    disabled={!canGoNext}
                    sx={{ bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark, "&:hover": { bgcolor: "#d7f2dd" } }}
                  >
                    <ArrowForwardIos fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          </Box>
        </Paper>
      )}

      {!loading && (
        <Paper elevation={0} sx={{ ...softCardSx, p: 2, mt: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.5 }}>
            <Box sx={{ ...iconTileSx, width: 38, height: 38}}>
              <FactCheckRounded fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ color: GREEN_UI.text, lineHeight: 1.2 }}>
            Summary {filterDate ? `for ${filterDate}` : "(All Records)"}
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>Discrepancy Review: automatic counts for filtered attendance records.</Typography>
            </Box>
          </Box>
          <Grid container spacing={1.5}>
            {[
              ["Present (incl. Late)", summary.present, "success"],
              ["Late", summary.late, "warning"],
              ["Undertime", summary.undertime, "warning"],
              ["Needs Review", summary.discrepancies, "warning"],
              ["Absent", summary.absent, "error"],
              ["On Leave", summary.onLeave, "info"],
            ].map(([label, val]) => (
              <Grid key={String(label)} size={{ xs: 6, md: 2 }}>
                <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                  {label}
                </Typography>
                <Typography variant="h5" fontWeight={700} sx={{ color: GREEN_UI.text }}>{val}</Typography>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Manual Entry Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "26px",
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: GREEN_UI.shadow,
            background: GREEN_UI.cardBg,
            overflow: "hidden",
            "& .MuiDialogTitle-root": { color: GREEN_UI.text },
            "& .MuiOutlinedInput-root": {
              borderRadius: "16px",
              backgroundColor: "#fbfef9",
              "& fieldset": { borderColor: GREEN_UI.border },
              "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
              "&.Mui-focused fieldset": { borderColor: GREEN_UI.green, borderWidth: 1.5 },
            },
          },
        }}
      >
        <DialogTitle fontWeight={700} sx={{ px: 3, pt: 2.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ ...iconTileSx, width: 38, height: 38}}>
              <AddCircleOutline fontSize="small" />
            </Box>
            Manual Attendance Entry
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "12px !important",
          }}
        >
          <TextField
            label="Employee Name"
            select
            fullWidth
            required
            value={form.employee}
            onChange={(e) => setForm({ ...form, employee: e.target.value })}
            helperText={
              form.employee
                ? `Employee ID saved: ${form.employee}`
                : employeeOptions.length === 0
                  ? "No active employees found in employees table."
                  : "Display shows the name; backend saves the Employee ID."
            }
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">Select employee…</MenuItem>
            {employeeOptions.map((emp) => (
              <MenuItem key={emp.employee_id} value={emp.employee_id}>
                {emp.name} — {emp.employee_id}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Date"
            type="date"
            fullWidth
            required
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            InputLabelProps={{ shrink: true }}
          />
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                label="Time In"
                fullWidth
                value={form.timeIn}
                onChange={(e) => handleTimeChange("timeIn", e.target.value)}
                placeholder="e.g. 8:00 AM"
                helperText="Auto-computes metrics"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Time Out"
                fullWidth
                value={form.timeOut}
                onChange={(e) => handleTimeChange("timeOut", e.target.value)}
                placeholder="e.g. 5:00 PM"
              />
            </Grid>
          </Grid>
          <TextField
            label="Total Hours"
            fullWidth
            value={form.totalHours}
            onChange={(e) => setForm({ ...form, totalHours: e.target.value })}
            placeholder="Auto-computed"
          />
          <Grid container spacing={2}>
            <Grid size={4}>
              <TextField
                label="Late (min)"
                fullWidth
                value={form.late}
                onChange={(e) => setForm({ ...form, late: e.target.value })}
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Undertime (min)"
                fullWidth
                value={form.undertime}
                onChange={(e) =>
                  setForm({
                    ...form,
                    undertime: e.target.value,
                  })
                }
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Overtime (min)"
                fullWidth
                value={form.overtime}
                onChange={(e) => setForm({ ...form, overtime: e.target.value })}
              />
            </Grid>
          </Grid>
          <TextField
            label="Status"
            select
            fullWidth
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as any,
              })
            }
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem key="status-empty" value="">
              Select Status…
            </MenuItem>
            {["Present", "Late", "Absent", "On Leave"].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={pillButtonSx}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.greenDark, "&:hover": { bgcolor: "#176238" } }}
            startIcon={
              saving ? (
                <CircularProgress size={16} color="inherit" />
              ) : undefined
            }
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Biometric Import Dialog */}
      <Dialog
        open={importDialog}
        onClose={() => {
          if (importing || parsingImport) return;
          setImportDialog(false);
          setImportPreview([]);
          setImportText("");
          setImportFormat("");
        }}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "26px",
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: GREEN_UI.shadow,
            background: GREEN_UI.cardBg,
            overflow: "hidden",
            "& .MuiDialogTitle-root": { color: GREEN_UI.text },
            "& .MuiOutlinedInput-root": {
              borderRadius: "16px",
              backgroundColor: "#fbfef9",
              "& fieldset": { borderColor: GREEN_UI.border },
              "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
              "&.Mui-focused fieldset": { borderColor: GREEN_UI.green, borderWidth: 1.5 },
            },
          },
        }}
      >
        <DialogTitle fontWeight={700} sx={{ px: 3, pt: 2.5 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Box sx={{ ...iconTileSx, width: 38, height: 38}}>
              <UploadFileRounded fontSize="small" />
            </Box>
            Import Biometric Data
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          <Alert severity="info" sx={{ mb: 2, borderRadius: "18px" }}>
            <strong>Import order:</strong>
            <br />
            <strong>1)</strong> Upload <code>Employee Attendance Record</code>{" "}
            first to create the raw daily time-in/time-out rows.
            <br />
            <strong>2)</strong> Upload <code>Abnormal Report</code> second to
            add absences, missing punches, late, and early-out exceptions.
            <br />
            <strong>3)</strong> Upload <code>Attendance Report</code> third for
            time-card verification and missing daily rows. Duplicate
            employee/date records are skipped automatically.
          </Alert>
          <Box
            sx={{
              mb: 2,
              display: "flex",
              gap: 2,
              flexWrap: "wrap",
            }}
          >
            <Button
              variant="outlined"
              startIcon={
                parsingImport ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <UploadFile />
                )
              }
              component="label"
              disabled={parsingImport || importing}
            >
              {parsingImport ? "Reading File…" : "Upload Report File"}
              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".xls,.xlsx,.csv,.txt"
                onChange={handleFileUpload}
              />
            </Button>
            <Button
              variant="outlined"
              onClick={handleParseTextInput}
              disabled={!importText.trim() || parsingImport || importing}
            >
              {parsingImport ? "Parsing…" : "Parse Pasted Data"}
            </Button>
          </Box>
          <TextField
            fullWidth
            multiline
            rows={6}
            label="Paste biometric data here (optional CSV/text import)"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="You may still paste a simple CSV here, but the Upload Report File button now supports the biometric Employee Attendance Record export directly."
            disabled={importing}
          />

          {parsingImport && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                Reading and preparing attendance records…
              </Typography>
              <LinearProgress />
            </Box>
          )}

          {importPreview.length > 0 && !parsingImport && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom fontWeight={700}>
                Preview {importFormat ? `(${importFormat})` : ""} — showing{" "}
                {importPreviewRows.length} of {importPreview.length} record(s):
              </Typography>
              <TableContainer
                component={Paper}
                variant="outlined"
                sx={{ maxHeight: 220, overflow: "auto" }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Employee</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>In</TableCell>
                      <TableCell>Out</TableCell>
                      <TableCell>Hours</TableCell>
                      <TableCell>Late</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importPreviewRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.employee}</TableCell>
                        <TableCell>{row.date}</TableCell>
                        <TableCell>{row.timeIn}</TableCell>
                        <TableCell>{row.timeOut}</TableCell>
                        <TableCell>{row.totalHours}</TableCell>
                        <TableCell
                          sx={{
                            color:
                              Number(row.late) > 0 ? "warning.main" : "inherit",
                          }}
                        >
                          {row.late} min
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={row.status}
                            size="small"
                            color={
                              row.status === "Present" ? "success" : "warning"
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {importPreview.length > importPreviewRows.length && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 1 }}
                >
                  Only the first 50 rows are displayed to keep the page smooth.
                  All {importPreview.length} parsed records will still be
                  imported.
                </Typography>
              )}
            </Box>
          )}

          {importing && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                Importing records: {importProgress.current}/
                {importProgress.total}
                {importProgress.failed > 0
                  ? ` • Failed: ${importProgress.failed}`
                  : ""}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={
                  importProgress.total > 0
                    ? Math.round(
                        (importProgress.current / importProgress.total) * 100,
                      )
                    : 0
                }
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            disabled={importing || parsingImport}
            sx={pillButtonSx}
            onClick={() => {
              setImportDialog(false);
              setImportPreview([]);
              setImportText("");
              setImportFormat("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            startIcon={
              importing ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <TaskAlt />
              )
            }
            onClick={handleImport}
            disabled={importing || parsingImport || importPreview.length === 0}
            sx={{ ...pillButtonSx }}
          >
            {importing
              ? `Importing ${importProgress.current}/${importProgress.total}…`
              : `Import ${importPreview.length} Record(s)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Attendance Correction Dialog */}
      <Dialog
        open={editDialog}
        onClose={() => setEditDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "26px",
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: GREEN_UI.shadow,
            background: GREEN_UI.cardBg,
            overflow: "hidden",
            "& .MuiDialogTitle-root": { color: GREEN_UI.text },
            "& .MuiOutlinedInput-root": {
              borderRadius: "16px",
              backgroundColor: "#fbfef9",
              "& fieldset": { borderColor: GREEN_UI.border },
              "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
              "&.Mui-focused fieldset": { borderColor: GREEN_UI.green, borderWidth: 1.5 },
            },
          },
        }}
      >
        <DialogTitle fontWeight={700}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <EditNote color="warning" /> Correct & Reprocess Attendance —{" "}
            {editRecord?.employee} ({editRecord?.date})
          </Box>
        </DialogTitle>
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            pt: "12px !important",
          }}
        >
          <Alert severity="warning">
            Editing this record will mark it as corrected by HR. The original
            data will be overwritten.
          </Alert>
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                label="Time In"
                fullWidth
                value={editForm.timeIn}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    timeIn: e.target.value,
                  })
                }
              />
            </Grid>
            <Grid size={6}>
              <TextField
                label="Time Out"
                fullWidth
                value={editForm.timeOut}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    timeOut: e.target.value,
                  })
                }
              />
            </Grid>
          </Grid>
          <TextField
            label="Total Hours"
            fullWidth
            value={editForm.totalHours}
            onChange={(e) =>
              setEditForm({
                ...editForm,
                totalHours: e.target.value,
              })
            }
          />
          <Grid container spacing={2}>
            <Grid size={4}>
              <TextField
                label="Late (min)"
                fullWidth
                value={editForm.late}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    late: e.target.value,
                  })
                }
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Undertime (min)"
                fullWidth
                value={editForm.undertime}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    undertime: e.target.value,
                  })
                }
              />
            </Grid>
            <Grid size={4}>
              <TextField
                label="Overtime (min)"
                fullWidth
                value={editForm.overtime}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    overtime: e.target.value,
                  })
                }
              />
            </Grid>
          </Grid>
          <TextField
            select
            fullWidth
            label="Status"
            value={editForm.status}
            onChange={(e) =>
              setEditForm({
                ...editForm,
                status: e.target.value as any,
              })
            }
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem key="edit-status-empty" value="">
              Select Status…
            </MenuItem>
            {["Present", "Late", "Absent", "On Leave"].map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDialog(false)} sx={pillButtonSx}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleEditSave}
            disabled={saving}
            sx={{ ...pillButtonSx }}
            startIcon={
              saving ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <TaskAlt />
              )
            }
          >
            {saving ? "Saving…" : "Save Correction"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete All Attendance Records Dialog */}
      <Dialog
        open={deleteAllDialog}
        onClose={() => {
          if (!deletingAll) {
            setDeleteAllDialog(false);
            setDeleteAllConfirm("");
          }
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: "26px",
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: GREEN_UI.shadow,
            background: GREEN_UI.cardBg,
            overflow: "hidden",
            "& .MuiDialogTitle-root": { color: GREEN_UI.text },
            "& .MuiOutlinedInput-root": {
              borderRadius: "16px",
              backgroundColor: "#fbfef9",
              "& fieldset": { borderColor: GREEN_UI.border },
              "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
              "&.Mui-focused fieldset": { borderColor: GREEN_UI.green, borderWidth: 1.5 },
            },
          },
        }}
      >
        <DialogTitle fontWeight={700}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WarningAmber color="error" /> Delete All Attendance Data
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            This will delete all {attendances.length} attendance record(s)
            currently saved in Attendance Monitoring. This action cannot be
            undone.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Type <strong>delete</strong> to confirm.
          </Typography>
          <TextField
            fullWidth
            value={deleteAllConfirm}
            onChange={(e) => setDeleteAllConfirm(e.target.value)}
            placeholder="delete"
            disabled={deletingAll}
          />
          {deletingAll && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>
                Deleting records: {deleteProgress.current}/
                {deleteProgress.total}
                {deleteProgress.failed > 0
                  ? ` • Failed: ${deleteProgress.failed}`
                  : ""}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={
                  deleteProgress.total > 0
                    ? Math.round(
                        (deleteProgress.current / deleteProgress.total) * 100,
                      )
                    : 0
                }
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteAllDialog(false);
              setDeleteAllConfirm("");
            }}
            disabled={deletingAll}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={
              deletingAll ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <DeleteSweep />
              )
            }
            onClick={handleDeleteAll}
            disabled={
              deletingAll || deleteAllConfirm.trim().toLowerCase() !== "delete"
            }
            sx={{ ...pillButtonSx }}
          >
            {deletingAll
              ? `Deleting ${deleteProgress.current}/${deleteProgress.total}…`
              : "Delete All Data"}
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
