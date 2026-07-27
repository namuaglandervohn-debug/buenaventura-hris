import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Button,
  Chip,
  TextField,
} from "@mui/material";
import {
  AccessTime,
  ArticleOutlined,
  BadgeOutlined,
  CalendarMonth,
  CheckCircleOutline,
  Print,
} from "@mui/icons-material";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { COMPANY } from "../../lib/constants";

interface AttendanceLogRow {
  log_id: string;
  employee_id: string;
  attendance_date: string;
  time_in?: string | null;
  time_out?: string | null;
  raw_time_in?: string | null;
  raw_time_out?: string | null;
  total_hours?: number | string | null;
  late_minutes?: number | null;
  undertime_minutes?: number | null;
  overtime_minutes?: number | null;
  is_late?: boolean | null;
  is_undertime?: boolean | null;
  is_overtime?: boolean | null;
  is_absent?: boolean | null;
  is_incomplete?: boolean | null;
  remarks?: string | null;
  validation_status?: string | null;
}

interface DTRRecord {
  id: string;
  employee_id: string;
  attendance_date: string;
  am_arrival: string;
  am_departure: string;
  pm_arrival: string;
  pm_departure: string;
  overtime_arrival: string;
  overtime_departure: string;
  overtime: string;
  late: string;
  undertime: string;
  total_hours: string;
  official_hours: string;
  remarks: string;
}

const REQUIRED_DAILY_HOURS = 8;

interface EmployeeProfile {
  employee_id: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  department?: string | null;
  outlet?: string | null;
}

function parseClockToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match12 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (match12) {
    let hours = Number(match12[1]) % 12;
    const minutes = Number(match12[2]);
    if (match12[3].toUpperCase() === "PM") hours += 12;
    return hours * 60 + minutes;
  }

  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) return Number(match24[1]) * 60 + Number(match24[2]);

  return null;
}

function formatMinutesAsTime(totalMinutes: number) {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function addMinutesToClock(value: string, minutesToAdd: number) {
  const minutes = parseClockToMinutes(value);
  if (minutes === null) return "";
  return formatMinutesAsTime(minutes + minutesToAdd);
}

function formatDurationHours(minutes: number) {
  return (Math.max(0, minutes) / 60).toFixed(2);
}

function formatDbTime(value: unknown) {
  if (!value) return "";
  const text = String(value).slice(0, 8);
  const minutes = parseClockToMinutes(text);
  return minutes === null ? String(value) : formatMinutesAsTime(minutes);
}

function getDayName(year: number, month: number, day: number) {
  return new Date(year, month, day).toLocaleDateString("en-US", { weekday: "short" });
}

function mapAttendanceLogToDTR(row: AttendanceLogRow): DTRRecord {
  const timeIn = String(row.raw_time_in ?? "").trim() || formatDbTime(row.time_in);
  const timeOut = String(row.raw_time_out ?? "").trim() || formatDbTime(row.time_out);
  const overtimeMinutes = Number(row.overtime_minutes ?? 0);
  const lateMinutes = Number(row.late_minutes ?? 0);
  const undertimeMinutes = Number(row.undertime_minutes ?? 0);
  const totalHours = Number(row.total_hours ?? 0);
  const derivedOvertimeMinutes =
    overtimeMinutes > 0
      ? overtimeMinutes
      : Number.isFinite(totalHours) && totalHours > REQUIRED_DAILY_HOURS
        ? Math.round((totalHours - REQUIRED_DAILY_HOURS) * 60)
        : 0;
  const derivedUndertimeMinutes =
    undertimeMinutes > 0
      ? undertimeMinutes
      : Number.isFinite(totalHours) && totalHours > 0 && totalHours < REQUIRED_DAILY_HOURS
        ? Math.round((REQUIRED_DAILY_HOURS - totalHours) * 60)
        : 0;
  const breakOut = timeIn && timeOut ? addMinutesToClock(timeIn, 4 * 60) : "";
  const breakIn = breakOut ? addMinutesToClock(breakOut, 60) : "";
  const regularOut =
    timeOut && derivedOvertimeMinutes > 0
      ? addMinutesToClock(timeOut, -derivedOvertimeMinutes)
      : timeOut;

  return {
    id: row.log_id,
    employee_id: row.employee_id,
    attendance_date: row.attendance_date,
    am_arrival: timeIn,
    am_departure: breakOut || (timeIn ? "—" : ""),
    pm_arrival: breakIn || (timeIn ? "—" : ""),
    pm_departure: regularOut,
    overtime_arrival:
      timeOut && derivedOvertimeMinutes > 0 ? regularOut : timeOut ? "—" : "",
    overtime_departure:
      timeOut && derivedOvertimeMinutes > 0 ? timeOut : timeOut ? "—" : "",
    overtime: timeIn || timeOut ? formatDurationHours(derivedOvertimeMinutes) : "",
    late: timeIn || timeOut ? formatDurationHours(lateMinutes) : "",
    undertime: timeIn || timeOut ? formatDurationHours(derivedUndertimeMinutes) : "",
    total_hours: Number.isFinite(totalHours) && totalHours > 0 ? totalHours.toFixed(2) : "",
    official_hours: timeIn || timeOut ? REQUIRED_DAILY_HOURS.toFixed(2) : "",
    remarks: "",
  };
}

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


const pillButtonSx = {
  borderRadius: '12px',
  textTransform: "none",
  fontWeight: 600,
  px: 2,
};

const tableCellSx = {
  border: "1px solid rgba(92, 118, 101, 0.28)",
  padding: "5px 6px",
  fontSize: 12,
  lineHeight: 1.2,
  color: "#26352d",
};

const tableHeaderCellSx = {
  ...tableCellSx,
  background: "#edf7ef",
  color: "#0f6d3c",
  fontWeight: 800,
};

const tableSubHeaderCellSx = {
  ...tableCellSx,
  background: "#f8fcf8",
  color: "#0f6d3c",
  fontWeight: 700,
};

const printPaperSx = {
  p: { xs: 1.25, sm: 1.5 },
  border: `1px solid ${GREEN_UI.borderStrong}`,
  borderRadius: "18px",
  width: "100%",
  maxWidth: "none",
  mx: "auto",
  background: "#fff",
  boxShadow: "0 18px 45px rgba(43, 91, 55, 0.08)",
  overflow: "hidden",

  "@media print": {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    maxWidth: "none",
    m: 0,
    p: "4mm",
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
    background: "#fff",
  },
};

const printStyles = `
  @media print {
    @page {
      size: A4 portrait;
      margin: 6mm;
    }

    body * {
      visibility: hidden !important;
    }

    .dtr-print-area,
    .dtr-print-area * {
      visibility: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .no-print {
      display: none !important;
    }

    .dtr-table th,
    .dtr-table td {
      padding: 3px 4px !important;
      font-size: 10.5px !important;
      line-height: 1.05 !important;
    }
  }
`;

export default function EmployeeDTR() {
  const { user } = useAuth();

  const [records, setRecords] = useState<DTRRecord[]>([]);
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentMonthValue = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [loadedLatestMonth, setLoadedLatestMonth] = useState(false);

  const [selectedYear, selectedMonthNumber] = selectedMonth.split("-").map(Number);
  const year = selectedYear || new Date().getFullYear();
  const month = Number.isFinite(selectedMonthNumber) ? selectedMonthNumber - 1 : new Date().getMonth();
  const monthName = new Date(year, month, 1).toLocaleString("default", { month: "long" });
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const periodStart = useMemo(
    () => `${year}-${String(month + 1).padStart(2, "0")}-01`,
    [year, month]
  );
  const periodEnd = useMemo(
    () => `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`,
    [year, month, daysInMonth]
  );

  useEffect(() => {
    if (!user?.employeeId || loadedLatestMonth) return;

    let cancelled = false;

    supabase
      .from("attendance_logs")
      .select("attendance_date")
      .eq("employee_id", user.employeeId)
      .order("attendance_date", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;

        const latestMonth = String(data?.attendance_date ?? "").slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(latestMonth)) {
          setSelectedMonth(latestMonth);
        }
        setLoadedLatestMonth(true);
      });

    return () => {
      cancelled = true;
    };
  }, [loadedLatestMonth, user?.employeeId]);

  const fetchDTR = useCallback(async () => {
    if (!user?.employeeId) {
      setRecords([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [{ data: employeeData }, { data, error }] = await Promise.all([
      supabase
        .from("employees")
        .select("employee_id, first_name, last_name, position, department, outlet")
        .eq("employee_id", user.employeeId)
        .maybeSingle(),
      supabase
      .from("attendance_logs")
      .select(
        "log_id, employee_id, attendance_date, time_in, time_out, raw_time_in, raw_time_out, total_hours, late_minutes, undertime_minutes, overtime_minutes, is_late, is_undertime, is_overtime, is_absent, is_incomplete, remarks, validation_status"
      )
      .eq("employee_id", user.employeeId)
      .gte("attendance_date", periodStart)
      .lte("attendance_date", periodEnd)
        .order("attendance_date", { ascending: true }),
    ]);

    setEmployeeProfile((employeeData as EmployeeProfile | null) ?? null);

    if (error) {
      console.error("DTR fetch error:", error);
      setRecords([]);
    } else {
      setRecords((data ?? []).map((row) => mapAttendanceLogToDTR(row as AttendanceLogRow)));
    }

    setLoading(false);
  }, [periodEnd, periodStart, user?.employeeId]);

  useEffect(() => {
    fetchDTR();
  }, [fetchDTR]);

  const recordMap = useMemo(() => {
    const map = new Map<number, DTRRecord>();

    records.forEach((record) => {
      const day = new Date(record.attendance_date).getDate();
      map.set(day, record);
    });

    return map;
  }, [records]);

  const totalHours = useMemo(
    () =>
      records.reduce((sum, record) => {
        const value = Number(record.total_hours ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [records]
  );

  const latestRecordDate = records.length
    ? new Date(records[records.length - 1].attendance_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No record yet";

  const displayName =
    employeeProfile?.first_name || employeeProfile?.last_name
      ? `${employeeProfile.first_name ?? ""} ${employeeProfile.last_name ?? ""}`.trim()
      : user?.name ?? "";

  const summaryCards = [
    {
      label: "Employee ID",
      value: user?.employeeId ?? "—",
      caption: "Linked employee account",
      icon: <BadgeOutlined fontSize="small" />,
    },
    {
      label: "Month Covered",
      value: `${monthName} ${year}`,
      caption: `${daysInMonth} calendar days included`,
      icon: <CalendarMonth fontSize="small" />,
    },
    {
      label: "Recorded Days",
      value: records.length,
      caption: `Latest: ${latestRecordDate}`,
      icon: <CheckCircleOutline fontSize="small" />,
    },
    {
      label: "Total Hours",
      value: totalHours.toFixed(2),
      caption: "Based on attendance records",
      icon: <AccessTime fontSize="small" />,
    },
  ];

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
      <Box className="no-print">
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
                icon={<ArticleOutlined />}
                label="Employee DTR Workspace"
                size="small"
                sx={{
                  mb: 1.2,
                  bgcolor: GREEN_UI.greenSoft,
                  color: GREEN_UI.greenDark,
                  fontWeight: 700,
                  "& .MuiChip-icon": { color: GREEN_UI.greenDark },
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
                My Daily Time Record
              </Typography>
              <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
                View your monthly Daily Time Record for {monthName} {year}, review attendance entries, and print a clean copy for submission.
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap", alignItems: "center" }}>
              <TextField
                type="month"
                label="Month Covered"
                size="small"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value || currentMonthValue)}
                sx={{
                  minWidth: 185,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: "12px",
                    bgcolor: "#fff",
                    "& fieldset": { borderColor: GREEN_UI.border },
                    "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
                    "&.Mui-focused fieldset": { borderColor: GREEN_UI.green },
                  },
                }}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                variant="contained"
                startIcon={<Print />}
                onClick={() => window.print()}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.green,
                  boxShadow: "0 12px 24px rgba(58, 168, 101, 0.25)",
                  "&:hover": { bgcolor: GREEN_UI.greenDark, boxShadow: "0 16px 28px rgba(31, 122, 70, 0.28)" },
                }}
              >
                Print DTR
              </Button>
            </Box>
          </Box>
        </Paper>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
            gap: 1.5,
            mb: 2.5,
          }}
        >
          {summaryCards.map((stat) => (
            <Paper
              key={stat.label}
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
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                    {stat.label}
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={700}
                    sx={{
                      color: GREEN_UI.text,
                      mt: 0.5,
                      letterSpacing: "-0.04em",
                      fontSize: { xs: "1.45rem", sm: "1.65rem" },
                      overflowWrap: "anywhere",
                    }}
                  >
                    {stat.value}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "16px",
                    display: "grid",
                    placeItems: "center",
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
          ))}
        </Box>
      </Box>

      <Paper
        elevation={0}
        sx={{
          ...softCardSx,
          p: { xs: 0.75, sm: 1 },
          overflow: "hidden",
        }}
      >
        <Paper className="dtr-print-area" elevation={0} sx={printPaperSx}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 7, gap: 2 }}>
              <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
              <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading DTR…</Typography>
            </Box>
          ) : (
            <>
              <Box
                className="no-print"
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: "minmax(240px, 1fr) auto" },
                  alignItems: "end",
                  gap: 1.25,
                  p: 1.25,
                  mb: 1.5,
                  borderRadius: "10px",
                  border: `1px solid ${GREEN_UI.border}`,
                  bgcolor: "#f8fcf8",
                }}
              >
                <TextField
                  type="month"
                  label="Month"
                  size="small"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value || currentMonthValue)}
                  sx={{
                    maxWidth: { xs: "100%", sm: 320 },
                    "& .MuiOutlinedInput-root": {
                      borderRadius: "8px",
                      bgcolor: "#fff",
                      "& fieldset": { borderColor: "rgba(31, 122, 70, 0.24)" },
                    },
                  }}
                  InputLabelProps={{ shrink: true }}
                />
                <Box sx={{ display: "flex", gap: 1, justifyContent: { xs: "stretch", md: "flex-end" } }}>
                  <Button
                    variant="contained"
                    startIcon={<Print />}
                    onClick={() => window.print()}
                    sx={{
                      ...pillButtonSx,
                      borderRadius: "6px",
                      minWidth: 98,
                      bgcolor: GREEN_UI.greenDark,
                      "&:hover": { bgcolor: "#145c35" },
                    }}
                  >
                    Print
                  </Button>
                </Box>
              </Box>

              <Box
                sx={{
                  borderTop: `5px solid ${GREEN_UI.greenDark}`,
                  pt: 1.25,
                  mb: 1,
                }}
              >
                <Typography align="center" sx={{ fontSize: 16, fontWeight: 900, color: GREEN_UI.greenDark }}>
                  DAILY TIME RECORD
                </Typography>
                <Typography align="center" sx={{ mt: 0.25, fontSize: 13, fontWeight: 800, color: GREEN_UI.text }}>
                  {COMPANY.name.toUpperCase()}
                </Typography>
                <Typography align="center" sx={{ mt: 0.15, mb: 1, fontSize: 11, color: GREEN_UI.muted }}>
                  {COMPANY.address}
                </Typography>
                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: { xs: 0.75, sm: 2.25 },
                    py: 0.75,
                    borderTop: "1px solid rgba(92, 118, 101, 0.22)",
                    borderBottom: "1px solid rgba(92, 118, 101, 0.22)",
                    color: GREEN_UI.text,
                  }}
                >
                  {[
                    "AHW - Actual Hours Worked",
                    "OHW - Official Hours Worked",
                    "OT - Overtime",
                    "LT - Lates",
                    "UT - Undertime",
                  ].map((item) => (
                    <Typography key={item} sx={{ fontSize: 11, fontWeight: 700 }}>
                      {item}
                    </Typography>
                  ))}
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    gap: { xs: 0.5, sm: 2 },
                    mt: 1,
                    mb: 1,
                    px: { xs: 0, sm: 1 },
                  }}
                >
                  {[
                    ["Employee No.", user?.employeeId ?? ""],
                    ["Name", displayName],
                    ["Position", employeeProfile?.position ?? ""],
                    ["Month", `${monthName} ${year}`],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ display: "grid", gridTemplateColumns: "92px 1fr", alignItems: "end", gap: 0.75 }}>
                      <Typography sx={{ fontSize: 11.5, color: GREEN_UI.muted, fontWeight: 700 }}>
                        {label}:
                      </Typography>
                      <Typography sx={{ borderBottom: "1px solid rgba(38, 53, 45, 0.55)", fontSize: 12, fontWeight: 800, minHeight: 18 }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              <TableContainer sx={{ overflowX: "auto" }}>
                <Table
                  size="small"
                  className="dtr-table"
                  sx={{
                    border: "1px solid rgba(92, 118, 101, 0.35)",
                    minWidth: 1180,
                    width: "100%",
                    tableLayout: "fixed",
                    borderCollapse: "collapse",
                    backgroundColor: "#fff",
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        Date
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        Day
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        In
                      </TableCell>
                      <TableCell colSpan={2} align="center" sx={tableHeaderCellSx}>
                        Break
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        Out
                      </TableCell>
                      <TableCell colSpan={2} align="center" sx={tableHeaderCellSx}>
                        Overtime
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        AHW
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        OHW
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        OT
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        LT
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        UT
                      </TableCell>
                      <TableCell rowSpan={2} align="center" sx={tableHeaderCellSx}>
                        Remarks
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      {["Out", "In", "In", "Out"].map((label, index) => (
                        <TableCell key={`${label}-${index}`} align="center" sx={tableSubHeaderCellSx}>
                          {label}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const record = recordMap.get(day);

                      return (
                        <TableRow key={day} sx={{ bgcolor: day % 2 === 0 ? "rgba(247, 252, 248, 0.75)" : "#fff" }}>
                          <TableCell align="center" sx={tableCellSx}>{day}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{getDayName(year, month, day)}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.am_arrival ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.am_departure ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.pm_arrival ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.pm_departure ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.overtime_arrival ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.overtime_departure ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.total_hours ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.official_hours ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.overtime ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.late ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.undertime ?? ""}</TableCell>
                          <TableCell align="center" sx={tableCellSx}>{record?.remarks ?? ""}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1.5fr 1fr" },
                  gap: 1,
                  mt: 1.25,
                  alignItems: "stretch",
                }}
              >
                <Box
                  sx={{
                    border: `1px solid ${GREEN_UI.border}`,
                    borderRadius: "10px",
                    bgcolor: "rgba(246, 252, 247, 0.9)",
                    px: 1,
                    py: 0.8,
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: GREEN_UI.text }}>
                    I certify on my honor that the above is a true and correct report of the hours of work performed.
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 0.75,
                  }}
                >
                  {[
                    ["Recorded Days", records.length],
                    ["Total Hours", totalHours.toFixed(2)],
                  ].map(([label, value]) => (
                    <Box
                      key={label}
                      sx={{
                        border: `1px solid ${GREEN_UI.border}`,
                        borderRadius: "10px",
                        bgcolor: "#fff",
                        px: 1,
                        py: 0.8,
                      }}
                    >
                      <Typography sx={{ fontSize: 11, color: GREEN_UI.muted, fontWeight: 800, textTransform: "uppercase" }}>
                        {label}
                      </Typography>
                      <Typography sx={{ fontSize: 14, color: GREEN_UI.greenDark, fontWeight: 900 }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>

              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, mt: 4 }}>
                {["Employee Signature", "Verified by / In-Charge"].map(label => (
                  <Typography
                    key={label}
                    align="center"
                    sx={{
                      borderTop: `1px solid ${GREEN_UI.greenDark}`,
                      fontSize: 12,
                      pt: 0.35,
                      color: GREEN_UI.text,
                      fontWeight: 700,
                    }}
                  >
                    {label}
                  </Typography>
                ))}
              </Box>
            </>
          )}
        </Paper>
      </Paper>

      <style>{printStyles}</style>
    </Box>
  );
}
