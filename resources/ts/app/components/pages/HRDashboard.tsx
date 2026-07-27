import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  AccountBalance,
  EmojiEvents,
  EventAvailable,
  PendingActions,
  PeopleAlt,
  PersonAddAlt1,
  QueryStats,
  WarningAmber,
} from "@mui/icons-material";
import { supabase } from "../../lib/supabaseClient";

interface Stats {
  activeEmployees: number;
  pendingApplications: number;
  forInterviewCount: number;
  pendingRequests: number;
  supervisorApprovedRequests: number;
  attendanceIssues: number;
  payrollForReview: number;
  lastPayrollGenerated: string | null;
  onDutyOrOnCall: number;
  topEvaluee: string | null;
  topScore: number | null;
}

type StatusRecord = Record<string, unknown>;

const DEFAULT_STATS: Stats = {
  activeEmployees: 0,
  pendingApplications: 0,
  forInterviewCount: 0,
  pendingRequests: 0,
  supervisorApprovedRequests: 0,
  attendanceIssues: 0,
  payrollForReview: 0,
  lastPayrollGenerated: null,
  onDutyOrOnCall: 0,
  topEvaluee: null,
  topScore: null,
};

const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

const toNumber = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const parsed = Number(
    String(value ?? "")
      .replace(/[,%₱]/g, "")
      .trim(),
  );
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value);
  return normalized === "true" || normalized === "yes" || normalized === "1";
};

const isPendingApplicationStatus = (status: unknown): boolean => {
  const normalized = normalizeText(status);

  return ["submitted", "pending", "for review", "under review"].includes(
    normalized,
  );
};

const isForInterviewStatus = (status: unknown): boolean => {
  const normalized = normalizeText(status);

  return (
    normalized.includes("interview") &&
    !normalized.includes("cancelled") &&
    !normalized.includes("rejected")
  );
};

const isPendingHrValidationRequest = (request: StatusRecord): boolean => {
  const overallStatus = normalizeText(request.status);
  const supervisorStatus = normalizeText(request.supervisor_status);
  const hrStatus = normalizeText(request.hr_status);

  const alreadyClosed = [
    "approved",
    "disapproved",
    "rejected",
    "cancelled",
  ].includes(overallStatus);
  const supervisorApproved =
    overallStatus === "supervisor approved" || supervisorStatus === "approved";
  const waitingForHr = !hrStatus || hrStatus === "pending";

  return supervisorApproved && waitingForHr && !alreadyClosed;
};

const isAttendanceIssue = (row: StatusRecord): boolean => {
  const validationStatus = normalizeText(row.validation_status);

  return (
    validationStatus === "needs review" ||
    validationStatus === "invalid" ||
    toBoolean(row.is_late) ||
    toBoolean(row.is_undertime) ||
    toBoolean(row.is_absent) ||
    toBoolean(row.is_incomplete)
  );
};

const isPayrollForReview = (status: unknown): boolean => {
  const normalized = normalizeText(status);

  // Reviewed = forwarded to Accounting/Finance; Approved = processed but not yet released.
  return normalized === "reviewed" || normalized === "approved";
};

const fetchRows = async <T extends StatusRecord>(
  table: string,
  columns: string,
  orderBy?: { column: string; ascending?: boolean },
): Promise<T[]> => {
  let query = (supabase as any).from(table).select(columns);

  if (orderBy) {
    query = query.order(orderBy.column, {
      ascending: orderBy.ascending ?? false,
    });
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []) as T[];
};

const fetchActiveEmployeesCount = async (): Promise<number> => {
  const rows = await fetchRows("employees", "id, employee_id, status");

  return rows.filter((row) => normalizeText(row.status) === "active").length;
};

const fetchPendingApplicationsCount = async (): Promise<number> => {
  const rows = await fetchRows("applicants", "id, applicant_id, status");

  return rows.filter((row) => isPendingApplicationStatus(row.status)).length;
};

const fetchForInterviewCount = async (): Promise<number> => {
  const rows = await fetchRows("applicants", "id, applicant_id, status");

  return rows.filter((row) => isForInterviewStatus(row.status)).length;
};

const fetchPendingRequestsCount = async (): Promise<number> => {
  const rows = await fetchRows("employee_requests", "id, request_id, status");

  return rows.filter((row) => normalizeText(row.status) === "pending").length;
};

const fetchPendingHrValidationCount = async (): Promise<number> => {
  const rows = await fetchRows(
    "employee_requests",
    "id, request_id, status, supervisor_status, hr_status",
  );

  return rows.filter(isPendingHrValidationRequest).length;
};

const fetchAttendanceIssuesCount = async (): Promise<number> => {
  const rows = await fetchRows(
    "attendance_logs",
    "id, log_id, validation_status, is_late, is_undertime, is_absent, is_incomplete",
  );

  return rows.filter(isAttendanceIssue).length;
};

const fetchPayrollForReviewCount = async (): Promise<number> => {
  const rows = await fetchRows("payroll_summaries", "id, payroll_id, status");

  return rows.filter((row) => isPayrollForReview(row.status)).length;
};

const fetchLastPayrollGenerated = async (): Promise<string | null> => {
  const rows = await fetchRows(
    "payroll_summaries",
    "id, payroll_id, cutoff_label, period_start, period_end, created_at, updated_at",
    { column: "created_at", ascending: false },
  );
  const latest = rows[0];
  if (!latest) return null;

  const label = String(latest.cutoff_label ?? "").trim();
  if (label) return label;

  const start = String(latest.period_start ?? "").slice(0, 10);
  const end = String(latest.period_end ?? "").slice(0, 10);
  return [start, end].filter(Boolean).join(" to ") || String(latest.payroll_id ?? "");
};

const fetchOnDutyOrOnCallCount = async (): Promise<number> => {
  const today = new Date().toISOString().slice(0, 10);
  const dayKey = new Date(`${today}T00:00:00`).toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  const [attendanceRows, scheduleRows] = await Promise.all([
    fetchRows("attendance_logs", "id, employee_id, attendance_date, is_absent, remarks"),
    fetchRows("schedule", `schedule_id, employee_id, status, ${dayKey}`),
  ]);
  const employeeIds = new Set<string>();

  attendanceRows
    .filter(row => String(row.attendance_date ?? "").slice(0, 10) === today)
    .filter(row => !toBoolean(row.is_absent) && !normalizeText(row.remarks).includes("leave"))
    .forEach(row => {
      const employeeId = String(row.employee_id ?? "").trim();
      if (employeeId) employeeIds.add(employeeId);
    });

  scheduleRows
    .filter(row => ["published", "active", "on call", "on-call"].includes(normalizeText(row.status)))
    .filter(row => toBoolean(row[dayKey]) || normalizeText(row[dayKey]).includes("on call"))
    .forEach(row => {
      const employeeId = String(row.employee_id ?? "").trim();
      if (employeeId) employeeIds.add(employeeId);
    });

  return employeeIds.size;
};

const fetchTopPerformer = async (): Promise<
  Pick<Stats, "topEvaluee" | "topScore">
> => {
  const dssRows = await fetchRows(
    "dss_results",
    "id, result_id, top_employee_name, highest_score, status, result_period_end, created_at",
    { column: "result_period_end", ascending: false },
  );

  const latestPublishedDss =
    dssRows.find((row) =>
      ["approved", "exported", "reviewed"].includes(normalizeText(row.status)),
    ) ?? dssRows.find((row) => String(row.top_employee_name ?? "").trim());

  if (latestPublishedDss?.top_employee_name) {
    return {
      topEvaluee: String(latestPublishedDss.top_employee_name).trim(),
      topScore: toNumber(latestPublishedDss.highest_score),
    };
  }

  const topRankedItems = await fetchRows(
    "dss_result_items",
    "id, item_id, employee_name, final_weighted_score, rank_no, created_at",
    { column: "created_at", ascending: false },
  );

  const topRankedItem = topRankedItems.find(
    (row) =>
      toNumber(row.rank_no) === 1 && String(row.employee_name ?? "").trim(),
  );

  if (topRankedItem) {
    return {
      topEvaluee: String(topRankedItem.employee_name).trim(),
      topScore: toNumber(topRankedItem.final_weighted_score),
    };
  }

  const evaluationRows = await fetchRows(
    "employee_evaluations",
    "id, evaluation_id, employee_name, employee_id, final_weighted_score, status, updated_at",
    { column: "updated_at", ascending: false },
  );

  const rankedEvaluations = evaluationRows
    .filter((row) =>
      ["approved", "reviewed", "submitted"].includes(normalizeText(row.status)),
    )
    .sort(
      (a, b) =>
        toNumber(b.final_weighted_score) - toNumber(a.final_weighted_score),
    );

  const topEvaluation = rankedEvaluations[0];

  if (topEvaluation) {
    return {
      topEvaluee:
        String(
          topEvaluation.employee_name ?? topEvaluation.employee_id ?? "",
        ).trim() || null,
      topScore: toNumber(topEvaluation.final_weighted_score),
    };
  }

  return { topEvaluee: null, topScore: null };
};

const resolveLiveDashboardStats = async (): Promise<{
  stats: Stats;
  failedSources: string[];
}> => {
  const failedSources: string[] = [];

  const safe = async <T,>(
    label: string,
    fallback: T,
    task: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await task();
    } catch (error) {
      console.error(`${label} dashboard stat failed:`, error);
      failedSources.push(label);
      return fallback;
    }
  };

  const [
    activeEmployees,
    pendingApplications,
    forInterviewCount,
    pendingRequests,
    supervisorApprovedRequests,
    attendanceIssues,
    payrollForReview,
    lastPayrollGenerated,
    onDutyOrOnCall,
    topPerformer,
  ] = await Promise.all([
    safe("Active Employees", 0, fetchActiveEmployeesCount),
    safe("Pending Applications", 0, fetchPendingApplicationsCount),
    safe("For Interview", 0, fetchForInterviewCount),
    safe("Pending Requests", 0, fetchPendingRequestsCount),
    safe("Pending HR Validation", 0, fetchPendingHrValidationCount),
    safe("Attendance Issues", 0, fetchAttendanceIssuesCount),
    safe("Payroll For Review", 0, fetchPayrollForReviewCount),
    safe("Last Payroll Generated", null, fetchLastPayrollGenerated),
    safe("On Duty / On-Call", 0, fetchOnDutyOrOnCallCount),
    safe(
      "Top Performer",
      { topEvaluee: null, topScore: null },
      fetchTopPerformer,
    ),
  ]);

  return {
    stats: {
      activeEmployees,
      pendingApplications,
      forInterviewCount,
      pendingRequests,
      supervisorApprovedRequests,
      attendanceIssues,
      payrollForReview,
      lastPayrollGenerated,
      onDutyOrOnCall,
      topEvaluee: topPerformer.topEvaluee,
      topScore: topPerformer.topScore,
    },
    failedSources,
  };
};

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

const pillButtonSx = {
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 700,
  px: 2,
};

export default function HRDashboard() {
  const navigate = useNavigate();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const loadDashboardStats = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setErrorMessage(null);
    } else {
      setRefreshing(true);
    }

    try {
      const { stats: liveStats, failedSources } =
        await resolveLiveDashboardStats();

      if (!isMountedRef.current) return;

      setStats(liveStats);
      setLastUpdatedAt(new Date());

      if (failedSources.length > 0) {
        setErrorMessage(
          `Some live indicators could not be loaded: ${failedSources.join(", ")}.`,
        );
      } else {
        setErrorMessage(null);
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      console.error("Dashboard live stats error:", error);
      setStats(DEFAULT_STATS);
      setErrorMessage(
        "Unable to load live dashboard indicators.",
      );
    } finally {
      if (!isMountedRef.current) return;

      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadDashboardStats(false);

    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, [loadDashboardStats]);

  useEffect(() => {
    const scheduleSilentRefresh = () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

      refreshTimerRef.current = setTimeout(() => {
        void loadDashboardStats(true);
      }, 450);
    };

    const channel = supabase
      .channel("hr-dashboard-live-indicators")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "applicants" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_requests" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payroll_summaries" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dss_results" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dss_result_items" },
        scheduleSilentRefresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employee_evaluations" },
        scheduleSilentRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [loadDashboardStats]);

  const statCards = useMemo(
    () => [
      {
        title: "Active Employees",
        value: loading ? "…" : String(stats.activeEmployees),
        icon: <PeopleAlt />,
        color: "#2F9E5E",
        softColor: "#E5F7EA",
        helper: "Currently employed personnel",
      },
      {
        title: "Pending Applications",
        value: loading ? "…" : String(stats.pendingApplications),
        icon: <PersonAddAlt1 />,
        color: "#ED8A1F",
        softColor: "#FFF1DE",
        helper: "Applicants awaiting review",
      },
      {
        title: "For Interview",
        value: loading ? "…" : String(stats.forInterviewCount),
        icon: <EventAvailable />,
        color: "#2B9C95",
        softColor: "#DFF7F5",
        helper: "Candidates ready for interview",
      },
      {
        title: "Pending HR Validation",
        value: loading ? "…" : String(stats.supervisorApprovedRequests),
        icon: <PendingActions />,
        color: "#8B5AD8",
        softColor: "#F0E9FF",
        helper: "Requests waiting for HR action",
      },
      {
        title: "On Duty / On-Call",
        value: loading ? "..." : String(stats.onDutyOrOnCall),
        icon: <EventAvailable />,
        color: "#2B9C95",
        softColor: "#DFF7F5",
        helper: "Employees scheduled or logged today",
      },
      {
        title: "Attendance Issues",
        value: loading ? "…" : String(stats.attendanceIssues),
        icon: <WarningAmber />,
        color: "#D85C5C",
        softColor: "#FFEAEA",
        helper: "Logs that need checking",
      },
      {
        title: "Last Payroll Generated",
        value: loading ? "..." : (stats.lastPayrollGenerated ?? "No payroll yet"),
        icon: <AccountBalance />,
        color: "#2E7BCF",
        softColor: "#E7F0FF",
        helper: `${stats.payrollForReview} payroll summary/s for review`,
      },
      {
        title: "Top Performer",
        value: loading
          ? "…"
          : stats.topEvaluee
            ? `${stats.topEvaluee} (${stats.topScore?.toFixed(1) ?? "0.0"}%)`
            : "No data",
        icon: <EmojiEvents />,
        color: "#B98913",
        softColor: "#FFF4D8",
        helper: "Latest performance ranking result",
      },
    ],
    [loading, stats],
  );


  const lastUpdatedLabel = lastUpdatedAt
    ? `Last updated ${lastUpdatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : "Waiting for live data";

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
          position: "relative",
          overflow: "hidden",
          mb: 2.5,
          p: { xs: 2, sm: 2.75, md: 3.25 },
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,250,235,0.96) 60%, rgba(225,248,224,0.94) 100%)",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: -80,
            right: -60,
            width: 220,
            height: 220,
            borderRadius: "50%",
            background: "rgba(89, 188, 121, 0.16)",
            filter: "blur(2px)",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            bottom: -95,
            right: 90,
            width: 190,
            height: 190,
            borderRadius: "50%",
            background: "rgba(185, 230, 162, 0.20)",
          }}
        />

        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 2, md: 3 }}
          alignItems={{ xs: "flex-start", md: "center" }}
          justifyContent="space-between"
          sx={{ position: "relative", zIndex: 1 }}
        >
          <Box sx={{ maxWidth: 720 }}>
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 1.4,
                py: 0.65,
                mb: 1.5,
                borderRadius: 0.8,
                bgcolor: GREEN_UI.greenSoft,
                color: GREEN_UI.greenDark,
                border: `1px solid ${GREEN_UI.borderStrong}`,
                fontSize: "0.78rem",
                fontWeight: 600,
                letterSpacing: "0.02em",
              }}
            >
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  bgcolor: GREEN_UI.green,
                }}
              />
              Live HR/Admin Workspace
            </Box>

            <Typography
              variant="h4"
              fontWeight={700}
              sx={{
                color: GREEN_UI.text,
                lineHeight: 1.08,
                letterSpacing: "-0.045em",
                fontSize: { xs: "1.55rem", sm: "2rem", md: "2.35rem" },
              }}
            >
              HR / Admin Dashboard
            </Typography>
            <Typography
              sx={{
                mt: 1.25,
                color: GREEN_UI.muted,
                maxWidth: 620,
                fontSize: { xs: "0.92rem", md: "1rem" },
              }}
            >
              Welcome to Buenaventura Estate HRIS. Monitor employees,
              applications, requests, attendance, payroll, and performance rankings
              in one clean workspace.
            </Typography>
          </Box>

          <Paper
            elevation={0}
            sx={{
              width: { xs: "100%", md: 260 },
              ...innerCardSx,
              p: 2,
            }}
          >
            <Typography
              sx={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: GREEN_UI.muted,
                mb: 1,
              }}
            >
              SYSTEM STATUS
            </Typography>
            <Stack direction="row" spacing={1.3} alignItems="center">
              {(loading || refreshing) && (
                <CircularProgress
                  size={22}
                  thickness={4}
                  sx={{ color: GREEN_UI.green }}
                />
              )}
              {!(loading || refreshing) && (
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    bgcolor: GREEN_UI.greenSoft,
                    border: `6px solid ${GREEN_UI.green}`,
                  }}
                />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    color: GREEN_UI.text,
                    fontWeight: 700,
                    fontSize: "0.95rem",
                  }}
                >
                  {loading
                    ? "Loading live stats…"
                    : refreshing
                      ? "Refreshing live stats…"
                      : "Live data synced"}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      </Paper>

      {errorMessage && !loading && (
        <Alert
          severity="warning"
          sx={{
            mb: 2.5,
            borderRadius: "18px",
            border: "1px solid rgba(237, 138, 31, 0.22)",
            bgcolor: "#FFF8EC",
            color: "#5F431F",
            "& .MuiAlert-icon": { color: "#ED8A1F" },
          }}
          action={
            <Button
              color="inherit"
              size="small"
              sx={pillButtonSx}
              onClick={() => void loadDashboardStats(false)}
            >
              Retry
            </Button>
          }
        >
          {errorMessage}
        </Alert>
      )}

      <Grid
        container
        spacing={{ xs: 2, md: 2.5 }}
        sx={{ mb: { xs: 2.5, md: 3 } }}
      >
        {statCards.map((stat, index) => (
          <Grid
            key={stat.title}
            size={{
              xs: 12,
              sm: 6,
              md: index === 6 ? 6 : 4,
              lg: index === 6 ? 6 : 3,
            }}
            sx={{ display: "flex" }}
          >
            <Card
              elevation={0}
              sx={{
                position: "relative",
                overflow: "hidden",
                width: "100%",
                minHeight: 126,
                ...softCardSx,
                transition:
                  "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  bgcolor: stat.color,
                  opacity: 0.86,
                },
                "&:hover": {
                  transform: "translateY(-3px)",
                  boxShadow: "0 22px 48px rgba(43, 91, 55, 0.13)",
                  borderColor: GREEN_UI.borderStrong,
                },
              }}
            >
              <CardContent sx={{ p: { xs: 2, md: 2.25 }, height: "100%" }}>
                <Stack
                  direction="row"
                  spacing={1.6}
                  alignItems="flex-start"
                  justifyContent="space-between"
                >
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                      sx={{
                        color: GREEN_UI.muted,
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        mb: 1.1,
                      }}
                    >
                      {stat.title}
                    </Typography>
                    <Typography
                      fontWeight={700}
                      sx={{
                        color: GREEN_UI.text,
                        fontSize: {
                          xs: index === 6 ? "1.25rem" : "2rem",
                          md: index === 6 ? "1.45rem" : "2.25rem",
                        },
                        lineHeight: 1.04,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stat.value}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 1.2,
                        color: GREEN_UI.muted,
                        fontSize: "0.83rem",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stat.helper}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      width: 50,
                      height: 50,
                      borderRadius: "16px",
                      display: "grid",
                      placeItems: "center",
                      color: stat.color,
                      bgcolor: stat.softColor,
                      flexShrink: 0,
                      boxShadow: `0 10px 26px ${stat.color}24`,
                      "& svg": { fontSize: 27 },
                    }}
                  >
                    {stat.icon}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {false && (
      <Grid container spacing={{ xs: 2, md: 2.5 }}>
        <Grid size={{ xs: 12 }}>
          <Stack spacing={2} sx={{ height: "100%" }}>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 2, sm: 2.5 },
                ...softCardSx,
                background: "linear-gradient(135deg, #EAF9EA 0%, #FFFFFF 100%)",
              }}
            >
              <Stack
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                sx={{ mb: 2 }}
              >
                <Box>
                  <Typography
                    sx={{
                      color: GREEN_UI.text,
                      fontSize: "1.05rem",
                      fontWeight: 700,
                    }}
                  >
                    Today’s Snapshot
                  </Typography>
                  <Typography sx={{ color: GREEN_UI.muted, fontSize: "0.8rem" }}>
                    Key workload indicators
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "16px",
                    display: "grid",
                    placeItems: "center",
                    color: "#2F9E5E",
                    bgcolor: "#E1F6E7",
                  }}
                >
                  <QueryStats />
                </Box>
              </Stack>

              <Stack spacing={1.7}>
                {([] as Array<{ label: string; value: string | number; color: string }>).map((item) => (
                  <Box key={item.label}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 0.7 }}
                    >
                      <Typography
                        sx={{
                          color: "#506352",
                          fontSize: "0.82rem",
                          fontWeight: 600,
                        }}
                      >
                        {item.label}
                      </Typography>
                      <Typography
                        sx={{
                          color: GREEN_UI.text,
                          fontSize: "0.85rem",
                          fontWeight: 700,
                        }}
                      >
                        {item.value}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={
                        loading ? 18 : Math.min(100, Number(item.value) * 10)
                      }
                      sx={{
                        height: 8,
                        borderRadius: 999,
                        bgcolor: "rgba(143, 183, 141, 0.16)",
                        "& .MuiLinearProgress-bar": {
                          borderRadius: 999,
                          bgcolor: item.color,
                        },
                      }}
                    />
                  </Box>
                ))}
              </Stack>
            </Paper>

            <Paper
              elevation={0}
              sx={{
                flex: 1,
                p: { xs: 2, sm: 2.5 },
                ...softCardSx,
                background:
                  "linear-gradient(145deg, rgba(47,158,94,0.14) 0%, rgba(255,255,255,0.94) 46%, rgba(229,247,234,0.9) 100%)",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  right: -46,
                  bottom: -46,
                  width: 150,
                  height: 150,
                  borderRadius: "50%",
                  bgcolor: "rgba(47, 158, 94, 0.12)",
                }}
              />
              <Box sx={{ position: "relative", zIndex: 1 }}>
                <Box
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: "16px",
                    display: "grid",
                    placeItems: "center",
                    color: "#2F9E5E",
                    bgcolor: "#FFFFFF",
                    boxShadow: "0 12px 26px rgba(47, 158, 94, 0.16)",
                    mb: 1.5,
                  }}
                >
                  <EmojiEvents />
                </Box>
                <Typography
                  sx={{
                    color: GREEN_UI.text,
                    fontSize: "1.05rem",
                    fontWeight: 700,
                  }}
                >
                  Performance Highlight
                </Typography>
                <Typography
                  sx={{
                    color: GREEN_UI.muted,
                    fontSize: "0.84rem",
                    mt: 0.5,
                    mb: 1.5,
                  }}
                >
                  Latest top performer from approved or reviewed evaluation records.
                </Typography>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: "20px",
                    bgcolor: "rgba(255,255,255,0.82)",
                    border: "1px solid rgba(143, 183, 141, 0.18)",
                  }}
                >
                  <Typography noWrap sx={{ color: GREEN_UI.text, fontWeight: 700 }}>
                    {loading ? "Loading…" : (stats.topEvaluee ?? "No data yet")}
                  </Typography>
                  <Typography
                    sx={{ color: GREEN_UI.muted, fontSize: "0.8rem", mt: 0.25 }}
                  >
                    {loading
                      ? "Fetching score"
                      : stats.topScore !== null
                        ? `${stats.topScore!.toFixed(1)}% final score`
                        : "No published score available"}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Stack>
        </Grid>
      </Grid>
      )}
    </Box>
  );
}
