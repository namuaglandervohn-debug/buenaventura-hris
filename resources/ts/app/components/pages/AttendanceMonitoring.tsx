import { formatDisplayDate } from '../../lib/displayDate';
import { pairAttendancePunches } from '../../lib/payrollPremiums';
import { attendancePunchFields, loadAttendanceCalculator } from '../../lib/loadAttendanceCalculator';
import { getWorkIntervals, type CalculatedAttendance } from '../../lib/scheduledAttendance';
import TextField from '../DateTextField';
import ProfilePhotoAvatar from '../ProfilePhotoAvatar';
import { useProfilePhotoDirectory } from '../../lib/useProfilePhotoDirectory';
import { useNavigate } from "react-router";
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
  Autocomplete,
  Stack,
  useMediaQuery,
  useTheme,
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
} from "../bootstrap";
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
  FactCheckRounded,
  CalendarMonthRounded,
  PersonRounded,
  WatchLaterRounded,
  EventBusyRounded,
  UploadFileRounded,
  AddTaskRounded,
  CloseRounded,
  VisibilityOutlined,
  BadgeOutlined,
} from "../bootstrap/icons";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import ActionSnackbar from "../ActionSnackbar";

interface Attendance {
  id: string;
  displayId?: string;
  employeeId?: string;
  biometricUserId?: string;
  employee: string;
  date: string;
  timeIn: string;
  timeOut: string;
  totalHours: string;
  workIntervals?: [number, number][] | null;
  late: string;
  undertime: string;
  overtime: string;
  status: "Present" | "Late" | "Undertime" | "Late and Undertime" | "Absent" | "On Leave";
  discrepancy: string;
  source?: string;
  validationStatus?: string;
  reviewedBy?: string;
  approvedTime?: string;
}

type AttendanceDraft = Omit<Attendance, "id" | "displayId" | "employeeId">;

type EmployeeOption = {
  employee_id: string;
  name: string;
  biometric_user_id?: string | null;
  position?: string | null;
  outlet?: string | null;
  status?: string | null;
};
type EmployeeAttendanceGroup = {
  key: string;
  employeeId?: string;
  name: string;
  records: Attendance[];
  totalHours: number;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
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

const MANUAL_PUNCHES = [
  ['morningIn', 'Morning Time In'],
  ['morningOut', 'Morning Time Out'],
  ['afternoonIn', 'Afternoon Time In'],
  ['afternoonOut', 'Afternoon Time Out'],
] as const;
const EMPTY_PUNCHES = { morningIn: '', morningOut: '', afternoonIn: '', afternoonOut: '' };

const IMPORT_CONCURRENCY = 10;
const DELETE_CONCURRENCY = 10;
const PREVIEW_ROW_LIMIT = 50;


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
    Undertime: { bg: "#fff7e0", color: "#9b6b00", border: "#f5d786" },
    "Late and Undertime": { bg: "#fff7e0", color: "#9b6b00", border: "#f5d786" },
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
  employee?: EmployeeOption | null;
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

function computeAttendanceFromPunches(punches: string[]): Partial<AttendanceDraft> {
  const minutes = punches
    .map((t) => parseClockToMinutes(t))
    .filter((m): m is number => m !== null);

  if (minutes.length === 0) return {};

  const timeIn = formatMinutesAsTime(minutes[0]);
  const timeOut =
    minutes.length >= 2 ? formatMinutesAsTime(minutes[minutes.length - 1]) : "";

  const workIntervals = pairAttendancePunches(minutes);
  let workedMinutes = workIntervals.reduce((sum, [start, end]) => sum + end - start, 0);

  if (workedMinutes === 0 && minutes.length >= 2) {
    workedMinutes = diffMinutes(minutes[0], minutes[minutes.length - 1]);
  }

  return {
    timeIn,
    timeOut,
    workIntervals: minutes.length % 2 === 0 ? workIntervals : null,
    totalHours: workedMinutes > 0 ? (workedMinutes / 60).toFixed(2) : "",
    late: "0",
    undertime: "0",
    overtime: "0",
    status: "Present",
  };


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

const MONTH_NUMBER: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function formatYmd(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseMonthNameDate(value: unknown) {
  const text = normalizeCell(value);
  const match = text.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (!match) return "";

  const month = MONTH_NUMBER[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);

  return month && day && year ? formatYmd(year, month, day) : "";
}

function extractPunchTimes(value: unknown): string[] {
  if (value === null || value === undefined) return [];

  if (typeof value === "number") {
    const timeFraction = value - Math.floor(value);
    if (timeFraction > 0) {
      return [formatMinutesAs24Hour(Math.round(timeFraction * 24 * 60))];
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

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function findCellIndex(row: SheetRow, label: string) {
  const target = label.toLowerCase();
  return row.findIndex((cell) => normalizeHeader(cell) === target);
}

function findNextNonEmptyCell(row: SheetRow, startIndex: number) {
  for (let index = startIndex; index < row.length; index++) {
    const value = normalizeCell(row[index]);
    if (value) return value;
  }
  return "";
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

      const monthNameRange = text.match(
        /(?:Attendance\s*)?date\s*:\s*([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})\s*(?:~|-|\u2013|\u2014|to)\s*([A-Za-z]+\.?\s+\d{1,2},?\s+\d{4})/i,
      );
      if (monthNameRange) {
        const start = parseMonthNameDate(monthNameRange[1]);
        const end = parseMonthNameDate(monthNameRange[2]);
        if (start && end) return { start, end };
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

  const monthNameDate = parseMonthNameDate(text);
  if (monthNameDate) return monthNameDate;

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

function firstPunchTime(value: unknown) {
  return extractPunchTimes(value)[0] ?? normalizeCell(value);
}

function parseAbnormalReportRows(rows: SheetRow[]): Partial<Attendance>[] {
  const detailHeaderIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes("name") &&
      headers.includes("date") &&
      headers.includes("remark") &&
      headers.includes("status")
    );
  });

  if (detailHeaderIndex !== -1) {
    const headerRow = rows[detailHeaderIndex] ?? [];
    const nameIndex = findCellIndex(headerRow, "name");
    const dateIndex = findCellIndex(headerRow, "date");
    const beforeNoonIndex = findCellIndex(headerRow, "before noon");
    const afterNoonIndex = findCellIndex(headerRow, "after noon");
    const remarkIndex = findCellIndex(headerRow, "remark");
    const statusIndex = findCellIndex(headerRow, "status");
    const parsedRows: Partial<Attendance>[] = [];

    for (let i = detailHeaderIndex + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const firstCell = normalizeHeader(row[0]);
      if (!normalizeCell(row[nameIndex]) || firstCell === "absence" || firstCell.startsWith("total ")) break;

      const employee = normalizeCell(row[nameIndex]);
      const date = normalizeDateValue(row[dateIndex]);
      if (!employee || !date) continue;

      const punches = [row[beforeNoonIndex], row[afterNoonIndex]].flatMap((cell) =>
        extractPunchTimes(cell),
      );
      const computed = punches.length > 0 ? computeFromReportPunches(punches) : {};
      const remark = normalizeCell(row[remarkIndex]);
      const lateMinutes =
        toNumber(remark.match(/late\s+by\s+(\d+)/i)?.[1]) ??
        toNumber(remark.match(/(\d+)\s*(?:minute|min)/i)?.[1]) ??
        0;
      const status = getStatusValue(row[statusIndex]);

      parsedRows.push({
        employee,
        date,
        timeIn: computed.timeIn ?? "",
        timeOut: computed.timeOut ?? "",
        totalHours: computed.totalHours ?? "",
        workIntervals: computed.workIntervals,
        late: String(status === "Late" ? lateMinutes : 0),
        undertime: "0",
        overtime: "0",
        status,
      });
    }

    if (parsedRows.length > 0) return parsedRows;
  }

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
    const biometricUserId = normalizeCell(row[0]);
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
      biometricUserId,
      date,
      timeIn: computed.timeIn ?? "",
      timeOut: computed.timeOut ?? "",
      workIntervals: computed.workIntervals,
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

  const dailyHeaderIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return (
      headers.includes("date") &&
      headers.includes("time in") &&
      headers.includes("time out") &&
      headers.some((header) => header.includes("worktime"))
    );
  });

  if (dailyHeaderIndex !== -1) {
    const headerRow = rows[dailyHeaderIndex] ?? [];
    const dateIndex = findCellIndex(headerRow, "date");
    const timeInIndex = findCellIndex(headerRow, "time in");
    const timeOutIndex = findCellIndex(headerRow, "time out");
    const worktimeIndex = headerRow.findIndex((cell) => normalizeHeader(cell).includes("worktime"));
    const lateIndex = headerRow.findIndex((cell) => normalizeHeader(cell).includes("late"));
    const overtimeIndex = headerRow.findIndex((cell) => normalizeHeader(cell).includes("overtime"));
    const statusIndex = findCellIndex(headerRow, "status");
    const remarksIndex = headerRow.findIndex((cell) => normalizeHeader(cell).startsWith("remarks"));
    const employeeTitle = rows
      .slice(0, dailyHeaderIndex)
      .map((row) => normalizeCell(row[0]))
      .reverse()
      .find((cell) => /employee daily time card/i.test(cell));
    const employeeFromTitle = employeeTitle?.replace(/employee daily time card\s*[-\u2013\u2014]\s*/i, "").trim();
    const summaryNameHeaderIndex = rows
      .slice(0, dailyHeaderIndex)
      .findIndex((row) => row.map(normalizeHeader).includes("name"));
    const summaryNameHeaderRow = summaryNameHeaderIndex !== -1 ? rows[summaryNameHeaderIndex] ?? [] : [];
    const summaryNameCol = summaryNameHeaderRow.map(normalizeHeader).indexOf("name");
    const employeeFromSummary =
      summaryNameHeaderIndex !== -1 && summaryNameCol !== -1
        ? normalizeCell(rows[summaryNameHeaderIndex + 1]?.[summaryNameCol])
        : "";
    const employee = normalizeCell(employeeFromSummary) || toTitleCase(employeeFromTitle ?? "");

    for (let i = dailyHeaderIndex + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const firstCell = normalizeHeader(row[dateIndex]);
      if (!firstCell || firstCell === "total" || firstCell.startsWith("prepared ")) break;

      const date = normalizeDateValue(row[dateIndex]);
      if (!employee || !date) continue;

      parsedRows.push({
        employee,
        date,
        timeIn: firstPunchTime(row[timeInIndex]),
        timeOut: firstPunchTime(row[timeOutIndex]),
        totalHours: String(toNumber(row[worktimeIndex]) ?? ""),
        late: String(toNumber(row[lateIndex]) ?? 0),
        undertime: "0",
        overtime: String(Math.round((toNumber(row[overtimeIndex]) ?? 0) * 60)),
        status: getStatusValue(row[statusIndex]),
        discrepancy: normalizeCell(row[remarksIndex]),
      });
    }

    if (parsedRows.length > 0) return parsedRows;
  }

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
    const biometricUserId = normalizeCell(rows[employeeHeaderRowIndex + 1]?.[nameIndex + 1]);
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
        biometricUserId,
        date,
        ...computeFromReportPunches(punches),
      });
    });
  });

  return parsedRows;
}

function attendanceKeyFromParts(employeeIdOrName: unknown, dateValue: unknown) {
  return `${normalizeCell(employeeIdOrName).toLowerCase()}__${normalizeDateForFilter(dateValue)}`;
}

function attendanceKey(row: Partial<Attendance>) {
  return attendanceKeyFromParts(row.employeeId ?? row.employee, row.date);
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
  if (normalized === "undertime") return "Undertime";
  if (normalized === "lateandundertime") return "Late and Undertime";
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
  if (String(row?.remarks ?? "").toLowerCase().startsWith("on leave")) return "On Leave";
  const late = toSafeNumber(row?.late_minutes) > 0 || row?.is_late;
  const undertime = toSafeNumber(row?.undertime_minutes) > 0 || row?.is_undertime;
  if (late && undertime) return "Late and Undertime";
  if (late) return "Late";
  if (undertime) return "Undertime";
  return "Present";
}

function getAttendanceDiscrepancy(row: Partial<Attendance> & Record<string, any>) {
  const status = getStatusValue(row.status ?? attendanceStatusFromDb(row));
  if (status === "On Leave") return "On Leave";
  if (status === "Absent" || row.is_absent) return "Absent";

  const issues: string[] = [];
  const timeIn = String(row.timeIn ?? row.raw_time_in ?? row.time_in ?? "").trim();
  const timeOut = String(row.timeOut ?? row.raw_time_out ?? row.time_out ?? "").trim();
  const lateMinutes = toSafeNumber(row.late ?? row.late_minutes);
  const undertimeMinutes = toSafeNumber(row.undertime ?? row.undertime_minutes);

  if (!timeIn) issues.push("Missing time-in");
  if (!timeOut) issues.push("Missing time-out");
  if (lateMinutes > 0 || row.is_late) issues.push(`Late ${Math.round(lateMinutes)} min`);
  if (undertimeMinutes > 0 || row.is_undertime) issues.push(`Undertime ${Math.round(undertimeMinutes)} min`);
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
    workIntervals: row?.work_intervals ?? null,
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
    source: row?.source,
    validationStatus: row?.validation_status,
    reviewedBy: row?.reviewed_by_name,
    approvedTime: formatApprovedTime(row),
  };
}

function formatApprovedTime(row: Pick<CalculatedAttendance, 'paidOvertime' | 'approvedUndertime'>) {
  return [
    row.paidOvertime > 0 ? `HR-approved OT: ${row.paidOvertime} min` : '',
    row.approvedUndertime > 0 ? `HR-approved undertime: ${row.approvedUndertime} min` : '',
  ].filter(Boolean).join(' · ');
}

function getPunches(record: Attendance) {
  const pairs = record.workIntervals;
  if (!pairs?.length) {
    return { ...EMPTY_PUNCHES, morningIn: toDbTime(record.timeIn) ?? '', morningOut: toDbTime(record.timeOut) ?? '' };
  }
  const first = pairs[0];
  const second = pairs[1];
  const continuousDayShift = !second && first[0] % 1440 < 10 * 60
    && first[1] % 1440 > 14 * 60 && first[1] - first[0] >= 6 * 60;
  if (continuousDayShift) {
    return {
      morningIn: formatMinutesAs24Hour(first[0] % 1440),
      morningOut: '',
      afternoonIn: '',
      afternoonOut: formatMinutesAs24Hour(first[1] % 1440),
    };
  }
  return {
    morningIn: formatMinutesAs24Hour(first[0] % 1440),
    morningOut: formatMinutesAs24Hour(first[1] % 1440),
    afternoonIn: second ? formatMinutesAs24Hour(second[0] % 1440) : '',
    afternoonOut: second ? formatMinutesAs24Hour(pairs[pairs.length - 1][1] % 1440) : '',
  };
}

function attendanceFromPunches(
  calculator: Awaited<ReturnType<typeof loadAttendanceCalculator>> | null,
  employeeId: string, date: string, punches: typeof EMPTY_PUNCHES,
  existing?: Attendance | null,
) {
  if (!calculator || !employeeId || !date) return null;
  const { morningIn, morningOut, afternoonIn, afternoonOut } = punches;
  const continuousThroughBreak = Boolean(morningIn && afternoonOut && !morningOut && !afternoonIn);
  if ((Boolean(morningIn) !== Boolean(morningOut) || Boolean(afternoonIn) !== Boolean(afternoonOut))
      && !continuousThroughBreak) return null;
  const times = continuousThroughBreak
    ? [morningIn, afternoonOut]
    : [morningIn, morningOut, afternoonIn, afternoonOut].filter(Boolean);
  const unchanged = existing && Object.values(getPunches(existing)).every((time, index) => time === Object.values(punches)[index]);
  const intervals = (unchanged ? existing?.workIntervals : null) ?? getWorkIntervals(times);
  const noWork = !times.length && (existing?.status === 'Absent' || existing?.status === 'On Leave');
  if (!intervals && !noWork) return null;
  const timeIn = intervals ? formatMinutesAsTime(intervals[0][0]) : '';
  const timeOut = intervals ? formatMinutesAsTime(intervals[intervals.length - 1][1]) : '';
  const calculated = calculator({
    employee_id: employeeId, attendance_date: date,
    time_in: timeIn, time_out: timeOut, work_intervals: intervals, is_absent: noWork && existing?.status === 'Absent',
  }, true);
  return {
    timeIn, timeOut, workIntervals: intervals,
    totalHours: calculated.total_hours.toFixed(2),
    late: String(calculated.late_minutes),
    undertime: String(calculated.undertime_minutes),
    overtime: String(calculated.overtime_minutes),
    status: noWork && existing?.status === 'On Leave' ? existing.status : attendanceStatusFromDb(calculated),
    scheduleLabel: calculated.scheduleLabel,
    approvedTime: formatApprovedTime(calculated),
  };
}

function AttendancePunchFields({ punches, setPunches, metrics }: {
  punches: typeof EMPTY_PUNCHES;
  setPunches: (punches: typeof EMPTY_PUNCHES) => void;
  metrics: ReturnType<typeof attendanceFromPunches>;
}) {
  return (
    <>
      <Grid container spacing={2}>
        {MANUAL_PUNCHES.map(([field, label]) => (
          <Grid key={field} size={6}>
            <TextField label={label} type="time" fullWidth value={punches[field]}
              onChange={event => setPunches({ ...punches, [field]: event.target.value })}
              InputLabelProps={{ shrink: true }} />
          </Grid>
        ))}
      </Grid>
      <Typography variant="caption" color="text.secondary">
        If no break punches were recorded, leave Morning Time Out and Afternoon Time In blank. The time between Morning Time In and Afternoon Time Out will count as continuous work.
      </Typography>
      <TextField label="Total Hours" fullWidth value={metrics?.totalHours ?? ''} InputProps={{ readOnly: true }}
        InputLabelProps={{ shrink: true }}
        helperText={metrics && (metrics.scheduleLabel ? `Assigned shift for this date: ${metrics.scheduleLabel}` : 'No timed shift was assigned for this date.')} />
      <Grid container spacing={2}>
        {([['late', 'Late (min)'], ['undertime', 'Undertime (min)'], ['overtime', 'Overtime (min)']] as const).map(([key, label]) => (
          <Grid key={key} size={4}>
            <TextField label={label} fullWidth value={metrics?.[key] ?? ''} InputLabelProps={{ shrink: true }} InputProps={{ readOnly: true }} />
          </Grid>
        ))}
      </Grid>
      <TextField label="Status" fullWidth value={metrics?.status ?? 'Awaiting complete punches'} InputProps={{ readOnly: true }}
        InputLabelProps={{ shrink: true }} helperText={metrics?.approvedTime} />
    </>
  );
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

async function resolveEmployeeForAttendance(
  employeeValue: unknown,
  biometricUserId?: unknown,
): Promise<EmployeeOption | null> {
  const clean = normalizeCell(employeeValue);
  const biometricId = normalizeCell(biometricUserId);
  if (!clean) return null;

  if (biometricId) {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status, biometric_user_id")
      .eq("biometric_user_id", biometricId)
      .maybeSingle();
    if (error) throw error;
    if (data) return { ...data, name: formatEmployeeName(data) || data.employee_id };
  }

  if (/^EMP-?\d+(?:-\d+)?$/i.test(clean)) {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status, biometric_user_id")
      .eq("employee_id", clean)
      .maybeSingle();
    if (error) throw error;
    return data ? { ...data, name: formatEmployeeName(data) || data.employee_id } : null;
  }

  const { data, error } = await supabase
    .from("employees")
    .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status, biometric_user_id")
    .limit(1000);

  if (error) throw error;

  const normalizedNeedle = clean.toLowerCase().replace(/\s+/g, " ").trim();
  const match = (data ?? []).find((row: any) => {
    const name = formatEmployeeName(row).toLowerCase().replace(/\s+/g, " ").trim();
    return name === normalizedNeedle || name.includes(normalizedNeedle) || normalizedNeedle.includes(name);
  });

  return match ? { ...match, name: formatEmployeeName(match) || match.employee_id } : null;
}

function mapEmployeeOption(row: any): EmployeeOption {
  return {
    employee_id: row.employee_id,
    name: formatEmployeeName(row) || row.employee_id,
    biometric_user_id: row.biometric_user_id,
    position: row.position,
    outlet: row.outlet,
    status: row.status,
  };
}

function normalizeEmployeeLookupValue(value: unknown) {
  return normalizeCell(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function findEmployeeOptionForAttendance(
  employees: EmployeeOption[],
  employeeValue: unknown,
  biometricUserId?: unknown,
) {
  const clean = normalizeCell(employeeValue);
  const biometricId = normalizeCell(biometricUserId);
  if (!clean && !biometricId) return null;

  if (biometricId) {
    const biometricMatch = employees.find(
      (employee) => normalizeCell(employee.biometric_user_id) === biometricId,
    );
    if (biometricMatch) return biometricMatch;
  }

  if (/^EMP-?\d+(?:-\d+)?$/i.test(clean)) {
    const idMatch = employees.find(
      (employee) => normalizeCell(employee.employee_id).toLowerCase() === clean.toLowerCase(),
    );
    return idMatch ?? null;
  }

  const normalizedNeedle = normalizeEmployeeLookupValue(clean);
  return employees.find((employee) => {
    const name = normalizeEmployeeLookupValue(employee.name);
    return name === normalizedNeedle || name.includes(normalizedNeedle) || normalizedNeedle.includes(name);
  }) ?? null;
}

function buildAttendancePayload(row: Partial<Attendance>, employee: EmployeeOption, logId?: string) {
  const status = getStatusValue(row.status);
  const lateMinutes = Math.round(toSafeNumber(row.late));
  const undertimeMinutes = Math.round(toSafeNumber(row.undertime));
  const overtimeMinutes = Math.round(toSafeNumber(row.overtime));
  const isAbsent = status === "Absent";
  const isOnLeave = status === "On Leave";
  const discrepancy = getAttendanceDiscrepancy({
    ...row,
    status,
    late: String(lateMinutes),
    undertime: String(undertimeMinutes),
    overtime: String(overtimeMinutes),
    is_absent: isAbsent,
  });
  const needsReview = needsAttendanceReview(discrepancy);

  return {
    ...(logId ? { log_id: logId } : {}),
    employee_id: employee.employee_id,
    employee_name: employee.name,
    attendance_date: normalizeDateForFilter(row.date),
    time_in: toDbTime(String(row.timeIn ?? "")),
    time_out: toDbTime(String(row.timeOut ?? "")),
    raw_time_in: String(row.timeIn ?? ""),
    raw_time_out: String(row.timeOut ?? ""),
    total_hours: toSafeNumber(row.totalHours),
    work_intervals: row.workIntervals ?? null,
    late_minutes: lateMinutes,
    undertime_minutes: undertimeMinutes,
    overtime_minutes: overtimeMinutes,
    is_late: lateMinutes > 0 || status === "Late",
    is_undertime: undertimeMinutes > 0,
    is_overtime: overtimeMinutes > 0,
    is_absent: isAbsent,
    is_incomplete: !isAbsent && !isOnLeave && (
      !row.timeIn || !row.timeOut || (row.workIntervals === null && Boolean(row.timeIn && row.timeOut))
    ),
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
        ...computeAttendanceFromPunches(punches),
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
        ? findNextNonEmptyCell(currentRow, nameIndex + 1)
        : normalizeCell(currentRow[userIdIndex + 1]);

    const employee =
      employeeName || `User ${normalizeCell(currentRow[userIdIndex + 1])}`;
    const biometricUserId = normalizeCell(currentRow[userIdIndex + 1]);
    const dateRow = rows[i + 1] ?? [];

    let j = i + 2;
    while (j < rows.length && !rowHasUserId(rows[j] ?? [])) {
      j++;
    }

    const blockRows = rows.slice(i + 2, j);
    const getBlockRow = (label: string) =>
      blockRows.find((row) => normalizeHeader(row[0]) === label.toLowerCase()) ?? [];
    const timeInRow = getBlockRow("time in");
    const timeOutRow = getBlockRow("time out");
    const statusRow = getBlockRow("status");
    const remarksRow = getBlockRow("remarks");
    const lateMinutesRow = getBlockRow("late minutes");
    const overtimeHoursRow = getBlockRow("overtime hours");
    const workHoursRow = getBlockRow("work hours");

    dateRow.forEach((dayValue, colIndex) => {
      const day = Number(normalizeCell(dayValue));
      if (!Number.isInteger(day) || day < 1 || day > 31) return;

      const labeledPunches = [
        ...extractPunchTimes(timeInRow[colIndex]),
        ...extractPunchTimes(timeOutRow[colIndex]),
      ];
      const blockPunches = blockRows.flatMap((row) =>
        extractPunchTimes(row[colIndex]),
      );
      const punches = labeledPunches.length > 0 ? labeledPunches : blockPunches;
      if (punches.length === 0) return;

      const computed = computeAttendanceFromPunches(punches);
      const workHours = toNumber(workHoursRow[colIndex]);
      const overtimeHours = toNumber(overtimeHoursRow[colIndex]) ?? 0;
      const statusText = normalizeCell(statusRow[colIndex]);
      const status = getStatusValue(statusText);

      parsedRows.push({
        employee,
        biometricUserId,
        date: buildDateFromDay(day, dateRange),
        ...computed,
        totalHours: workHours !== null ? String(Number(workHours.toFixed(2))) : computed.totalHours,
        late: String(toNumber(lateMinutesRow[colIndex]) ?? computed.late ?? 0),
        overtime: String(Math.round(overtimeHours * 60)),
        undertime: computed.undertime ?? "0",
        status,
        discrepancy: normalizeCell(remarksRow[colIndex]),
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
      (reportText.includes("employee attendance table") ||
        reportText.includes("employee attendance report") ||
        reportText.includes("employee daily time card")) &&
      !reportText.includes("shift setting table") &&
      (reportText.includes("time in") || reportText.includes("time card"));

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

async function saveImportTask(task: SaveImportTask, calculate: Awaited<ReturnType<typeof loadAttendanceCalculator>> | null): Promise<ImportSaveResult> {
  const employee = task.employee ?? await resolveEmployeeForAttendance(task.row.employee, task.row.biometricUserId);
  if (!employee) return { ok: false, key: task.key, error: 'The employee could not be verified.' };
  const date = normalizeDateForFilter(task.row.date);

  // For imports, let the database generate the raw log_id to avoid duplicate IDs during concurrent batch saves.
  // The UI still displays the friendly ATT-YYYY-0001 format through displayId.
  const logId = undefined;
  const payload = buildAttendancePayload(task.row, employee, logId);
  payload.source = "Biometric Import";
  if (task.kind === "update" && payload.validation_status === "Validated") payload.validation_status = "Corrected";

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
    record: mapAttendanceLogToRow(calculate ? calculate(data) : data),
    key: task.key,
  };
}


export default function AttendanceMonitoring() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down("md"));
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialog, setImportDialog] = useState(false);
  const [importPreview, setImportPreview] = useState<Partial<Attendance>[]>([]);
  const [skippedImportRows, setSkippedImportRows] = useState<{ employee: string; date: string; reason: string }[]>([]);
  const [importFormat, setImportFormat] = useState("");
  const [parsingImport, setParsingImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [manualPunches, setManualPunches] = useState(EMPTY_PUNCHES);
  const [calculator, setCalculator] = useState<Awaited<ReturnType<typeof loadAttendanceCalculator>> | null>(null);
  const manualMetrics = attendanceFromPunches(calculator, form.employee, form.date, manualPunches);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success" as "success" | "error",
  });
  const [filterDate, setFilterDate] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [deleteAllDialog, setDeleteAllDialog] = useState(false);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState("");
  const [detailsRecord, setDetailsRecord] = useState<Attendance | null>(null);
  const [selectedEmployeeGroup, setSelectedEmployeeGroup] = useState<EmployeeAttendanceGroup | null>(null);
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
  const [employeeDirectory, setEmployeeDirectory] = useState<EmployeeOption[]>([]);
  const employeeOptions = useMemo(() => employeeDirectory.filter(employee =>
    String(employee.status ?? 'Active').toLowerCase() === 'active'), [employeeDirectory]);
  const employeeNames = useMemo(() => new Map(employeeDirectory.map(employee =>
    [employee.employee_id.toLowerCase(), employee.name])), [employeeDirectory]);
  const attendanceName = (record: Attendance) => employeeNames.get((record.employeeId || record.employee).trim().toLowerCase()) || record.employee;

  const normalizedUserRole = String(user?.role ?? "").toLowerCase();
  const canManageAttendance = ["hr", "hr_admin", "general_manager", "admin"].includes(normalizedUserRole) || normalizedUserRole.includes("hr") || normalizedUserRole.includes("admin");
  const canReviewAttendance = canManageAttendance || normalizedUserRole.includes("supervisor");

  const fetchEmployeeOptions = async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status, biometric_user_id")
      .order("last_name", { ascending: true });

    if (error) {
      console.warn("Could not load active employees:", error.message);
      setEmployeeDirectory([]);
      return;
    }

    setEmployeeDirectory((data ?? []).map(mapEmployeeOption));
  };

  const fetchAttendance = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data, error }, calculate] = await Promise.all([
        supabase.from("attendance_logs")
          .select(`${attendancePunchFields},log_id,employee_name,validation_status,reviewed_by_name,created_at`)
          .order("attendance_date", { ascending: false }).order("created_at", { ascending: false }),
        loadAttendanceCalculator(),
      ]);
      if (error) throw error;
      setCalculator(() => calculate);
      setAttendances((data ?? []).map((row, index) => mapAttendanceLogToRow(calculate(row), index)));
    } catch (e: any) {
      setCalculator(null);
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
  }, [filterDate, filterEmployee, filterStatus]);

  const handleSave = async () => {
    if (!form.employee || !form.date) {
      setSnackbar({ open: true, message: "Please select an employee and date.", severity: "error" });
      return;
    }
    if (!manualMetrics?.workIntervals?.length) {
      setSnackbar({ open: true, message: 'Enter a complete Time In and Time Out pair for each worked session. Check that the sessions do not overlap.', severity: 'error' });
      return;
    }
    setSaving(true);
    try {
      const employee = employeeOptions.find((emp) => emp.employee_id === form.employee);
      if (!employee?.employee_id) throw new Error("Selected employee was not found in the employees table.");

      const [logId, calculate] = await Promise.all([getNextAttendanceLogId(form.date), loadAttendanceCalculator(employee.employee_id, form.date, form.date)]);
      const metrics = attendanceFromPunches(calculate, employee.employee_id, form.date, manualPunches);
      if (!metrics?.workIntervals?.length) throw new Error('Enter complete attendance punches.');
      const payload = buildAttendancePayload({ ...form, ...metrics }, employee, logId);

      const { data, error } = await supabase
        .from("attendance_logs")
        .insert(payload)
        .select()
        .single();

      if (error?.code === '23505' && error.message.includes('attendance_logs_employee_date_key')) {
        throw new Error('Attendance already exists for this employee on this date. Open the existing entry to make a correction.');
      }
      if (error) throw error;

      const savedRecord = mapAttendanceLogToRow(calculate(data));
      setAttendances((prev) => [savedRecord, ...prev]);
      setDialogOpen(false);
      setForm(EMPTY);
      setManualPunches(EMPTY_PUNCHES);
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

  const handleImport = async () => {
    if (importPreview.length === 0 || importing || parsingImport) return;

    setImporting(true);
    setSkippedImportRows([]);
    setImportProgress({ current: 0, total: importPreview.length, failed: 0 });

    let successCount = 0;
    let updatedCount = 0;
    const skippedRows: typeof skippedImportRows = [];
    let failedCount = 0;

    const newRecords: Attendance[] = [];
    const updatedRecords: Attendance[] = [];
    const failedMessages: string[] = [];
    const existingByKey = new Map<string, Attendance>(
      attendances.map(
        (record) => [attendanceKey(record), record] as [string, Attendance],
      ),
    );
    const importedKeys = new Set<string>();
    const normalizedImportFormat = importFormat.toLowerCase();
    const isRawAttendanceImport = normalizedImportFormat.includes("employee attendance record");
    const isAbnormalImport = normalizedImportFormat.includes("abnormal");
    const isVerificationImport = normalizedImportFormat.includes("attendance report");
    const tasks: SaveImportTask[] = [];
    const resolvedRows: Array<{
      key: string;
      row: Partial<Attendance> & { biometricUserId?: string };
      employee: EmployeeOption;
      date: string;
    }> = [];

    try {
      let importEmployees = employeeOptions;

      if (importEmployees.length === 0) {
        const { data, error } = await supabase
          .from("employees")
          .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status, biometric_user_id")
          .limit(2000);

        if (error) throw error;
        importEmployees = (data ?? []).map(mapEmployeeOption);
      }

      for (let rowIndex = 0; rowIndex < importPreview.length; rowIndex++) {
        const row = importPreview[rowIndex];
        const date = normalizeDateForFilter(row.date);
        const employee = findEmployeeOptionForAttendance(importEmployees, row.employee, row.biometricUserId);
        const key = employee && date ? attendanceKeyFromParts(employee.employee_id, date) : "";

        if (!employee || !date || importedKeys.has(key)) {
          skippedRows.push({
            employee: employee?.name || row.employee || row.biometricUserId || "Unknown employee",
            date,
            reason: !employee ? "Employee could not be matched" : !date ? "Invalid date" : "Repeated employee and date in this file",
          });
        } else {
          importedKeys.add(key);
          resolvedRows.push({
            key,
            row: {
              ...row,
              employee: employee.name,
              employeeId: employee.employee_id,
              date,
            },
            employee,
            date,
          });
        }

        if (rowIndex % 50 === 0 || rowIndex === importPreview.length - 1) {
          setImportProgress({
            current: rowIndex + 1,
            total: importPreview.length,
            failed: 0,
          });
          await waitForBrowserPaint();
        }
      }

      const employeeIds = [...new Set(resolvedRows.map((row) => row.employee.employee_id))];
      const dates = [...new Set(resolvedRows.map((row) => row.date))];
      const employeeIdSet = new Set(employeeIds);
      const employeeNameToId = new Map<string, string>();

      resolvedRows.forEach((row) => {
        [
          row.employee.name,
          row.row.employee,
          row.employee.employee_id,
        ].forEach((value) => {
          const normalizedName = normalizeCell(value).toLowerCase().replace(/\s+/g, " ").trim();
          if (normalizedName) employeeNameToId.set(normalizedName, row.employee.employee_id);
        });
      });

      if (employeeIds.length > 0 && dates.length > 0) {
        const { data, error } = await supabase
          .from("attendance_logs")
          .select("log_id, employee_id, employee_name, attendance_date, time_in, time_out, work_intervals, total_hours, late_minutes, undertime_minutes, overtime_minutes, is_late, is_absent, is_undertime, is_overtime, is_incomplete, remarks, source, validation_status, reviewed_by_name, created_at")
          .in("attendance_date", dates);

        if (error) throw error;

        (data ?? []).forEach((record: any, index: number) => {
          const recordEmployeeId = normalizeCell(record.employee_id);
          const recordEmployeeName = normalizeCell(record.employee_name)
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
          const matchedEmployeeId = recordEmployeeId || employeeNameToId.get(recordEmployeeName);
          if (!matchedEmployeeId || !employeeIdSet.has(matchedEmployeeId)) return;

          const key = attendanceKeyFromParts(matchedEmployeeId, record.attendance_date);
          if (recordEmployeeId || !existingByKey.has(key)) {
            existingByKey.set(key, mapAttendanceLogToRow(record, index));
          }
        });
      }

      for (const resolved of resolvedRows) {
        const existing = existingByKey.get(resolved.key);

        if (existing && !existing.employeeId) {
          skippedRows.push({ employee: resolved.employee.name, date: resolved.date, reason: 'An unlinked entry exists for this date. Link the correct entry in Attendance first.' });
        } else if (existing && !isRawAttendanceImport && (isAbnormalImport || isVerificationImport)) {
          tasks.push({
            kind: "update",
            key: resolved.key,
            existingId: existing.id,
            employee: resolved.employee,
            row: {
              ...existing,
              ...resolved.row,
              ...(isAbnormalImport ? { correctedBy: user?.name ?? "HR Admin" } : {}),
            },
          });
        } else if (existing) {
          skippedRows.push({ employee: resolved.employee.name, date: resolved.date, reason: "Attendance already exists for this date" });
        } else {
          tasks.push({
            kind: "create",
            key: resolved.key,
            employee: resolved.employee,
            row: resolved.row,
          });
        }
      }
    } catch (err: any) {
      setImporting(false);
      setImportProgress({ current: 0, total: 0, failed: 0 });
      setSnackbar({
        open: true,
        message: `Failed to check existing attendance records before import: ${err?.message ?? "Unknown error"}`,
        severity: "error",
      });
      return;
    }

    setSkippedImportRows(skippedRows);
    const duplicateCount = skippedRows.length;
    if (tasks.length === 0) {
      if (duplicateCount) setImportDialog(false);
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
              return await saveImportTask(task, calculator);
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
            if (failedMessages.length < 2) failedMessages.push(result.error);
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
      setImportFormat("");
      setSnackbar({
        open: true,
        message: `✅ Imported ${successCount} new record(s), updated ${updatedCount} existing record(s), skipped ${duplicateCount} duplicate/invalid row(s)${
          failedCount > 0 ? `, and failed to save ${failedCount} row(s): ${failedMessages.join(" | ")}` : ""
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
    const employeeNeedle = filterEmployee.toLowerCase().replace(/\s+/g, " ").trim();

    return attendances.filter((a) => {
      const recordDate = normalizeDateForFilter(a.date);
      const dateMatch = !selectedDate || recordDate === selectedDate;
      const knownName = employeeNames.get((a.employeeId || a.employee).trim().toLowerCase());
      const employeeHaystack = `${knownName ?? ''} ${a.employee} ${a.employeeId ?? ""}`
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const employeeMatch = !employeeNeedle || employeeHaystack.includes(employeeNeedle);
      const hasLateMetric = toSafeNumber(a.late) > 0;
      const statusMatch =
        filterStatus === "all" ||
        (filterStatus === "late"
          ? hasLateMetric || normalizeStatusForFilter(a.status) === "late"
          : normalizeStatusForFilter(a.status) === filterStatus);

      const reviewMatch = filterStatus === "review" && (!a.employeeId || ["Needs Review", "Invalid", "Unprocessed", "Corrected"].includes(a.validationStatus ?? ""));
      return dateMatch && employeeMatch && (statusMatch || reviewMatch);
    });
  }, [attendances, employeeNames, filterDate, filterEmployee, filterStatus]);

  const employeeGroups = useMemo(() => {
    const grouped = new Map<string, Attendance[]>();
    filtered.forEach(record => {
      const employeeId = String(record.employeeId ?? "").trim();
      const name = attendanceName(record);
      const key = employeeId ? `id:${employeeId.toLowerCase()}` : `name:${name.toLowerCase().replace(/\s+/g, " ").trim()}`;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    });

    return [...grouped.entries()].map(([key, records]) => {
      const sortedRecords = [...records].sort((a, b) => normalizeDateForFilter(b.date).localeCompare(normalizeDateForFilter(a.date)));
      const first = sortedRecords[0];
      return {
        key,
        employeeId: first.employeeId,
        name: attendanceName(first),
        records: sortedRecords,
        totalHours: sortedRecords.reduce((sum, record) => sum + toSafeNumber(record.totalHours), 0),
        lateMinutes: sortedRecords.reduce((sum, record) => sum + toSafeNumber(record.late), 0),
        undertimeMinutes: sortedRecords.reduce((sum, record) => sum + toSafeNumber(record.undertime), 0),
        overtimeMinutes: sortedRecords.reduce((sum, record) => sum + toSafeNumber(record.overtime), 0),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered, employeeNames]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(employeeGroups.length / rowsPerPage)),
    [employeeGroups.length, rowsPerPage],
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages - 1));
  }, [totalPages]);

  const paginatedFiltered = useMemo(() => {
    const start = page * rowsPerPage;
    return employeeGroups.slice(start, start + rowsPerPage);
  }, [employeeGroups, page, rowsPerPage]);
  const employeePhotos = useProfilePhotoDirectory('employee', paginatedFiltered.map(group => group.employeeId));

  const pageStart = employeeGroups.length === 0 ? 0 : page * rowsPerPage + 1;
  const pageEnd = Math.min((page + 1) * rowsPerPage, employeeGroups.length);
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
      if (!["Absent", "On Leave"].includes(record.status)) {
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
  const [linkEmployeeId, setLinkEmployeeId] = useState('');
  const [editPunches, setEditPunches] = useState(EMPTY_PUNCHES);
  const editMetrics = attendanceFromPunches(calculator, editRecord?.employeeId || linkEmployeeId,
    editRecord?.date ?? '', editPunches, editRecord);

  const handleEditSave = async () => {
    if (!editRecord) return;
    setSaving(true);
    try {
      const targetEmployeeId = editRecord.employeeId || linkEmployeeId;
      const employee = employeeDirectory.find(entry => entry.employee_id === targetEmployeeId);
      if (!employee) throw new Error('Select the correct employee before saving this attendance entry.');
      const calculate = await loadAttendanceCalculator(employee.employee_id, editRecord.date, editRecord.date);
      const metrics = attendanceFromPunches(calculate, employee.employee_id, editRecord.date, editPunches, editRecord);
      if (!metrics) throw new Error('Enter a complete Time In and Time Out pair for each worked session.');
      const payload = buildAttendancePayload({ ...editRecord, ...metrics }, employee);

      const { data, error } = await supabase
        .from("attendance_logs")
        .update({ ...payload, source: editRecord.source || payload.source, validation_status: "Corrected" })
        .eq("log_id", editRecord.id)
        .select()
        .single();

      if (error?.code === '23505' && error.message.includes('attendance_logs_employee_date_key')) {
        throw new Error('This employee already has a linked entry for this date. Review the existing entry before linking this one.');
      }
      if (error) throw error;
      const correctedRecord = mapAttendanceLogToRow(calculate(data));
      setAttendances((prev) =>
        prev.map((a) => (a.id === editRecord.id ? correctedRecord : a)),
      );
      setEditDialog(false);
      setSnackbar({
        open: true,
        message: "Attendance corrected. Review it before payroll.",
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


  const reviewAttendance = async (att: Attendance) => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from("attendance_logs")
        .update({ validation_status: "Validated" })
        .eq("log_id", att.id).eq("validation_status", att.validationStatus ?? "").select().maybeSingle();
      if (error || !data) throw error || new Error("The entry changed. Refresh the attendance list.");
      setAttendances(previous => previous.map(record => record.id === att.id ? mapAttendanceLogToRow(calculator ? calculator(data) : data) : record));
      setSnackbar({ open: true, message: "Attendance marked as reviewed.", severity: "success" });
    } catch (error) {
      setSnackbar({ open: true, message: error instanceof Error ? error.message : "Could not review attendance.", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (att: Attendance) => {
    setEditRecord(att);
    setLinkEmployeeId('');
    setEditPunches(getPunches(att));
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
              Attendance Management
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
            icon: <FactCheckRounded />,
          },
          {
            label: "Present",
            value: summary.present,
            icon: <AddTaskRounded />,
          },
          {
            label: "Late Entries",
            value: summary.late,
            icon: <WatchLaterRounded />,
          },
          {
            label: "Absent / Leave",
            value: summary.absent + summary.onLeave,
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

      {skippedImportRows.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setSkippedImportRows([])}>
          <Box component="details">
            <Box component="summary" sx={{ cursor: "pointer", fontWeight: 700 }}>
              Review {skippedImportRows.length} skipped import rows
            </Box>
            <Box component="ul" sx={{ pl: 3, maxHeight: 200, overflowY: "auto" }}>
              {skippedImportRows.map((row, index) => (
                <li key={index}>{row.employee} · {formatDisplayDate(row.date, "No valid date")} · {row.reason}</li>
              ))}
            </Box>
          </Box>
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 1.5, sm: 2 }, mb: 2 }}>
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
            <Autocomplete
              freeSolo
              options={[...new Set(employeeDirectory.map(employee => employee.name).filter(Boolean))]}
              inputValue={filterEmployee}
              onInputChange={(_, value) => {
                setFilterEmployee(value);
                setPage(0);
              }}
              onChange={(_, value) => {
                setFilterEmployee(typeof value === 'string' ? value : value ?? '');
                setPage(0);
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  fullWidth
                  label="Search Employee"
                  placeholder="Type or select a name / ID"
                  InputLabelProps={{ ...params.InputLabelProps, shrink: true }}
                  sx={softTextFieldSx}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <PersonRounded sx={{ color: GREEN_UI.greenDark }} />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                  }}
                />
              )}
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
              <MenuItem value="review">Needs Payroll Review</MenuItem>
              <MenuItem key="present" value="present">Present</MenuItem>
              <MenuItem key="late" value="late">Late</MenuItem>
              <MenuItem value="undertime">Undertime</MenuItem>
              <MenuItem value="lateandundertime">Late and Undertime</MenuItem>
              <MenuItem key="absent" value="absent">Absent</MenuItem>
              <MenuItem key="onleave" value="onleave">On Leave</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }} sx={{ alignSelf: 'flex-end' }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<CloseRounded />}
              sx={{ ...pillButtonSx, height: "56px", borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark }}
              onClick={() => {
                setFilterDate("");
                setFilterEmployee("");
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
          {employeeGroups.length === 0 ? (
            <Paper elevation={0} sx={{ ...softCardSx, p: 3, textAlign: "center", color: GREEN_UI.muted }}>
              {attendances.length === 0
                ? "No attendance records yet. Use Manual Entry or Import Biometric Data."
                : "No results match your filters."}
            </Paper>
          ) : paginatedFiltered.map(group => (
            <Paper key={group.key} elevation={0} sx={{ ...softCardSx, p: 2 }}>
              <Stack spacing={1.5}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                  <Box sx={{ minWidth: 0, display: "flex", alignItems: "center", gap: 1 }}>
                    <ProfilePhotoAvatar photo={group.employeeId ? employeePhotos.get(group.employeeId) : undefined} name={group.name}
                      sx={{ ...iconTileSx, width: 38, height: 38, fontSize: "0.82rem" }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography fontWeight={750} noWrap sx={{ color: GREEN_UI.text }}>{group.name}</Typography>
                      <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>{group.employeeId || "Employee link needed"}</Typography>
                    </Box>
                  </Box>
                  <Chip size="small" label={`${group.records.length} record${group.records.length === 1 ? "" : "s"}`} variant="outlined" />
                </Box>
                <Grid container spacing={1.25}>
                  {[["Total Hours", group.totalHours.toFixed(2)], ["Late", `${group.lateMinutes} min`], ["Undertime", `${group.undertimeMinutes} min`], ["Overtime", `${group.overtimeMinutes} min`]]
                    .map(([label, value]) => (
                      <Grid key={label} size={{ xs: 6 }}>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>{label}</Typography>
                        <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>{value}</Typography>
                      </Grid>
                    ))}
                </Grid>
                <Button variant="outlined" startIcon={<VisibilityOutlined />} onClick={() => setSelectedEmployeeGroup(group)} sx={pillButtonSx}>
                  View Attendance
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ ...softCardSx, overflowX: "auto", "&::-webkit-scrollbar": { height: 10 }, "&::-webkit-scrollbar-thumb": { bgcolor: "#cfe8d1" } }}>
          <Table sx={{ minWidth: 900, "& th, & td": { borderColor: "rgba(139, 184, 144, 0.16)" } }}>
            <TableHead>
              <TableRow sx={{ background: "linear-gradient(90deg, #eff8eb 0%, #f8fcf5 100%)", "& th": { color: GREEN_UI.greenDark, fontWeight: 700, fontSize: "0.78rem", letterSpacing: "0.02em", textTransform: "uppercase", py: 1.7, whiteSpace: "nowrap" } }}>
                <TableCell>Employee</TableCell>
                <TableCell>Attendance Records</TableCell>
                <TableCell>Total Hours</TableCell>
                <TableCell>Late (min)</TableCell>
                <TableCell>Undertime (min)</TableCell>
                <TableCell>Overtime (min)</TableCell>
                <TableCell>Latest Record</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {employeeGroups.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 7, color: GREEN_UI.muted }}>
                  {attendances.length === 0 ? "No attendance records yet. Use Manual Entry or Import Biometric Data." : "No results match your filters."}
                </TableCell></TableRow>
              ) : paginatedFiltered.map(group => (
                <TableRow key={group.key} hover sx={{ "&:hover": { backgroundColor: "rgba(230, 248, 233, 0.36) !important" } }}>
                  <TableCell sx={{ minWidth: 230 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <ProfilePhotoAvatar photo={group.employeeId ? employeePhotos.get(group.employeeId) : undefined} name={group.name}
                        sx={{ ...iconTileSx, width: 38, height: 38, fontSize: "0.82rem" }} />
                      <Box>
                        <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>{group.name}</Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>{group.employeeId || "Employee link needed"}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>{group.records.length}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{group.totalHours.toFixed(2)}</TableCell>
                  <TableCell sx={{ color: group.lateMinutes ? "warning.main" : "inherit" }}>{group.lateMinutes}</TableCell>
                  <TableCell sx={{ color: group.undertimeMinutes ? "warning.main" : "inherit" }}>{group.undertimeMinutes}</TableCell>
                  <TableCell sx={{ color: group.overtimeMinutes ? "success.main" : "inherit" }}>{group.overtimeMinutes}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDisplayDate(normalizeDateForFilter(group.records[0].date))}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" startIcon={<VisibilityOutlined />} onClick={() => setSelectedEmployeeGroup(group)} sx={pillButtonSx}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {!loading && employeeGroups.length > 0 && (
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
              {pageStart}-{pageEnd} of {employeeGroups.length} employees
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
            </Box>
          </Box>
          <Grid container spacing={1.5}>
            {[
              ["Present", summary.present, "success"],
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

      <Dialog
        open={Boolean(selectedEmployeeGroup)}
        onClose={() => setSelectedEmployeeGroup(null)}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { borderRadius: { xs: 3, sm: 4 }, border: `1px solid ${GREEN_UI.border}`, boxShadow: GREEN_UI.shadow, bgcolor: GREEN_UI.cardBg } }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
            <Box sx={{ ...iconTileSx, width: 40, height: 40 }}><FactCheckRounded fontSize="small" /></Box>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ color: GREEN_UI.text }}>
                {selectedEmployeeGroup?.name} · Attendance Details
              </Typography>
              <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
                {selectedEmployeeGroup?.employeeId || "Employee link needed"} · {selectedEmployeeGroup?.records.length ?? 0} attendance record(s) in the current view
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          <TableContainer sx={{ border: `1px solid ${GREEN_UI.border}`, borderRadius: 2, overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 1050 }}>
              <TableHead>
                <TableRow sx={{ background: "linear-gradient(90deg, #eff8eb 0%, #f8fcf5 100%)", "& th": { color: GREEN_UI.greenDark, fontWeight: 800, whiteSpace: "nowrap" } }}>
                  <TableCell>Date</TableCell>
                  <TableCell>Time In</TableCell>
                  <TableCell>Time Out</TableCell>
                  <TableCell>Total Hours</TableCell>
                  <TableCell>Late</TableCell>
                  <TableCell>Undertime</TableCell>
                  <TableCell>Overtime</TableCell>
                  <TableCell>Status / Validation</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(selectedEmployeeGroup?.records ?? []).map(record => (
                  <TableRow key={record.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDisplayDate(normalizeDateForFilter(record.date))}</TableCell>
                    <TableCell>{record.timeIn || "—"}</TableCell>
                    <TableCell>{record.timeOut || "—"}</TableCell>
                    <TableCell>{record.totalHours || "0"}</TableCell>
                    <TableCell>{record.late || "0"} min</TableCell>
                    <TableCell>{record.undertime || "0"} min</TableCell>
                    <TableCell>{record.overtime || "0"} min</TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <Chip size="small" label={record.status} variant="outlined" sx={statusChipSx(record.status)} />
                      <Typography variant="caption" display="block" sx={{ color: GREEN_UI.muted }}>
                        {record.validationStatus || "Unprocessed"} · {record.source || "Unknown source"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
                        <Tooltip title="View record details">
                          <IconButton size="small" aria-label={`View attendance details for ${formatDisplayDate(normalizeDateForFilter(record.date))}`} onClick={() => setDetailsRecord(record)} sx={{ color: GREEN_UI.greenDark }}>
                            <VisibilityOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {canReviewAttendance && record.employeeId && ["Needs Review", "Unprocessed", "Corrected"].includes(record.validationStatus ?? "") && (
                          <Button size="small" className="hris-button-review" disabled={saving} onClick={() => reviewAttendance(record)}>Review</Button>
                        )}
                        {canManageAttendance && <>
                          <Tooltip title="Correct record">
                            <IconButton size="small" aria-label="Correct attendance record" onClick={() => { setSelectedEmployeeGroup(null); openEdit(record); }} sx={{ color: GREEN_UI.warningDark }}>
                              <EditNote fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete record">
                            <IconButton size="small" aria-label="Delete attendance record" onClick={() => { setSelectedEmployeeGroup(null); void handleDelete(record.id); }} sx={{ color: GREEN_UI.dangerDark }}>
                              <DeleteSweep fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
                {!selectedEmployeeGroup?.records.length && (
                  <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: GREEN_UI.muted }}>No attendance records match the current filters.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSelectedEmployeeGroup(null)} sx={pillButtonSx}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(detailsRecord)}
        onClose={() => setDetailsRecord(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: { xs: 3, sm: 4 },
            border: `1px solid ${GREEN_UI.border}`,
            boxShadow: GREEN_UI.shadow,
            bgcolor: GREEN_UI.cardBg,
          },
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ ...iconTileSx, width: 40, height: 40 }}><VisibilityOutlined fontSize="small" /></Box>
            <Box>
              <Typography variant="h6" fontWeight={800} sx={{ color: GREEN_UI.text }}>Attendance Record Details</Typography>
              <Typography variant="body2" sx={{ color: GREEN_UI.muted }}>
                {detailsRecord ? `${attendanceName(detailsRecord)} · ${detailsRecord.displayId ?? detailsRecord.id}` : ''}
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          {detailsRecord && (
            <Grid container spacing={1.25}>
              {([
                ['Employee', attendanceName(detailsRecord)],
                ['Employee ID', detailsRecord.employeeId || 'Not linked'],
                ['Attendance Date', formatDisplayDate(normalizeDateForFilter(detailsRecord.date))],
                ['Status', detailsRecord.status],
                ['Time In', detailsRecord.timeIn || '—'],
                ['Time Out', detailsRecord.timeOut || '—'],
                ['Total Hours', detailsRecord.totalHours || '0'],
                ['Late', `${detailsRecord.late || 0} minutes`],
                ['Undertime', `${detailsRecord.undertime || 0} minutes`],
                ['Overtime', `${detailsRecord.overtime || 0} minutes`],
                ['Payroll Review', detailsRecord.discrepancy || '—'],
                ['Validation', detailsRecord.validationStatus || 'Unprocessed'],
                ['Source', detailsRecord.source || 'Unknown'],
                ['Reviewed By', detailsRecord.reviewedBy || 'Not reviewed'],
                ['Approved Time Adjustments', detailsRecord.approvedTime || 'None'],
              ] as const).map(([label, value]) => (
                <Grid key={label} size={{ xs: 12, sm: 6, md: 4 }}>
                  <Paper elevation={0} sx={{ p: 1.25, height: '100%', borderRadius: 2, border: `1px solid ${GREEN_UI.border}`, bgcolor: GREEN_UI.cardBgSoft }}>
                    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', color: GREEN_UI.muted }}>{label}</Typography>
                    <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text, overflowWrap: 'anywhere' }}>{value}</Typography>
                  </Paper>
                </Grid>
              ))}
              {detailsRecord.workIntervals?.length ? (
                <Grid size={12}>
                  <Paper elevation={0} sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${GREEN_UI.border}`, bgcolor: GREEN_UI.cardBgSoft }}>
                    <Typography variant="caption" fontWeight={700} sx={{ display: 'block', color: GREEN_UI.muted, mb: 0.5 }}>Recorded Work Sessions</Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {detailsRecord.workIntervals.map(([start, end], index) => (
                        <Chip key={`${start}-${end}-${index}`} size="small" variant="outlined"
                          label={`${formatMinutesAsTime(start)} – ${formatMinutesAsTime(end)}`}
                          sx={{ borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, fontWeight: 700 }} />
                      ))}
                    </Box>
                  </Paper>
                </Grid>
              ) : null}
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDetailsRecord(null)} sx={pillButtonSx}>Close</Button>
          {detailsRecord?.employeeId && canManageAttendance && (
            <Button
              variant="outlined"
              startIcon={<BadgeOutlined />}
              onClick={() => {
                const record = detailsRecord;
                setDetailsRecord(null);
                const month = normalizeDateForFilter(record.date).slice(0, 7);
                navigate(`/dashboard/attendance?view=dtr&employeeId=${encodeURIComponent(record.employeeId!)}${month ? `&month=${encodeURIComponent(month)}` : ""}`);
              }}
              sx={pillButtonSx}
            >
              View Employee DTR
            </Button>
          )}
          {detailsRecord && canManageAttendance && (
            <Button variant="contained" color="warning" startIcon={<EditNote />} onClick={() => { const record = detailsRecord; setDetailsRecord(null); openEdit(record); }} sx={pillButtonSx}>
              Correct Record
            </Button>
          )}
        </DialogActions>
      </Dialog>

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
          <AttendancePunchFields punches={manualPunches} setPunches={setManualPunches} metrics={manualMetrics} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={pillButtonSx}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !manualMetrics}
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
          </Box>

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
                        <TableCell>{formatDisplayDate(row.date)}</TableCell>
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
            {editRecord && attendanceName(editRecord)} ({formatDisplayDate(editRecord?.date)})
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
          {editRecord && !editRecord.employeeId && (
            <TextField select fullWidth label="Link employee" value={linkEmployeeId}
              onChange={event => setLinkEmployeeId(event.target.value)}
              helperText={`Recorded as ${editRecord.employee}. Select the employee whose DTR should include this entry.`}>
              {employeeDirectory.map(employee => <MenuItem key={employee.employee_id} value={employee.employee_id}>
                {employee.name} — {employee.employee_id}
              </MenuItem>)}
            </TextField>
          )}
          <AttendancePunchFields punches={editPunches} setPunches={setEditPunches} metrics={editMetrics} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditDialog(false)} sx={pillButtonSx}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleEditSave}
            disabled={saving || !editMetrics}
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
