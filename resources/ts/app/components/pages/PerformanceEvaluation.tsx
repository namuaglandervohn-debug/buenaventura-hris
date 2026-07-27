import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  AddCircleOutline,
  AssignmentTurnedIn,
  DeleteOutline,
  Edit,
  EmojiEvents,
  Grade,
  Groups,
  Insights,
  Save,
  Sync,
  TaskAlt,
} from "@mui/icons-material";
import { supabase } from "../../lib/supabaseClient";
import { OUTLETS, POSITIONS } from "../../lib/constants";
import { useAuth } from "../../context/AuthContext";
import ActionSnackbar from "../ActionSnackbar";

const AVAILABLE_POSITIONS = POSITIONS.filter((position) => position !== "Payroll Staff");

/* ── Types ─────────────────────────────────────────────────────────────── */
type EvaluationStatus = "Draft" | "Submitted" | "Reviewed" | "Approved" | "Returned" | "Cancelled";

interface CriterionDef {
  criteria_id: string;
  criteria_name: string;
  description: string | null;
  category: string | null;
  weight: number; // stored as percent, e.g. 25 = 25%
  max_score: number;
  is_active: boolean;
}

interface EmployeeRecord {
  employee_id: string;
  name: string;
  position: string;
  outlet: string;
  status: string;
}

interface SupervisorAccount {
  user_id: string;
  name: string;
  email: string;
  employee_id: string;
}

interface EvaluationScoreRow {
  criteria_id: string;
  criteria_name: string;
  criteria_weight: number;
  max_score: number;
  raw_score: number;
  weighted_score: number;
}

interface EvaluationResult {
  evaluation_id: string;
  employee_id: string;
  employee_name: string;
  position: string;
  outlet: string;
  evaluation_period_start: string;
  evaluation_period_end: string;
  evaluation_period_label: string | null;
  evaluator_user_id: string | null;
  evaluator_name: string | null;
  evaluator_role: string | null;
  total_raw_score: number;
  final_weighted_score: number;
  rating_label: string | null;
  status: EvaluationStatus;
  remarks: string | null;
  scores: Record<string, EvaluationScoreRow>;
}

interface DssResult {
  result_id: string;
  result_period_start: string;
  result_period_end: string;
  result_period_label: string | null;
  total_employees: number;
  highest_score: number;
  average_score: number;
  lowest_score: number;
  top_employee_id: string | null;
  top_employee_name: string | null;
  status: string;
  generated_at: string | null;
}

interface DssResultItem {
  result_id: string;
  evaluation_id: string;
  employee_id: string;
  employee_name: string;
  position: string;
  outlet: string;
  final_weighted_score: number;
  rating_label: string | null;
  rank_no: number;
  recommendation: string | null;
}

interface FormState {
  evaluation_id: string;
  employee_id: string;
  employee_name: string;
  position: string;
  outlet: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  scores: Record<string, number>;
  remarks: string;
}

interface CriteriaEditorRow {
  criteria_id: string;
  criteria_name: string;
  description: string;
  category: string;
  weight: number;
  max_score: number;
  isNew?: boolean;
}

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const monthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
};

const fullName = (row: any) =>
  [row.first_name, row.middle_name, row.last_name, row.suffix].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

const formatPeriod = (r: Pick<EvaluationResult, "evaluation_period_start" | "evaluation_period_end" | "evaluation_period_label">) =>
  r.evaluation_period_label || `${r.evaluation_period_start} — ${r.evaluation_period_end}`;

const money = (n: number | null | undefined) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function buildEmptyForm(criteria: CriterionDef[]): FormState {
  const scores: Record<string, number> = {};
  criteria.forEach((c) => {
    scores[c.criteria_id] = 85;
  });

  return {
    evaluation_id: "",
    employee_id: "",
    employee_name: "",
    position: "",
    outlet: "",
    periodStart: monthStart(),
    periodEnd: monthEnd(),
    periodLabel: "",
    scores,
    remarks: "",
  };
}

function computePreviewScore(scores: Record<string, number>, criteria: CriterionDef[]): number {
  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (totalWeight <= 0) return 0;

  return criteria.reduce((sum, c) => {
    const raw = Number(scores[c.criteria_id] ?? 0);
    const max = Number(c.max_score || 100);
    const weighted = max > 0 ? (raw / max) * Number(c.weight || 0) : 0;
    return sum + weighted;
  }, 0);
}

function labelForScore(score: number) {
  if (score >= 90) return "Outstanding";
  if (score >= 85) return "Very Satisfactory";
  if (score >= 80) return "Satisfactory";
  if (score >= 75) return "Fair";
  return "Needs Improvement";
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
  warningSoft: "#fff7e0",
  warningDark: "#9b6b00",
  dangerSoft: "#fdeaea",
  dangerDark: "#9c2f2f",
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
  borderRadius: '12px',
  textTransform: "none",
  fontWeight: 700,
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

const tableSx = {
  minWidth: 980,
  "& th, & td": { borderColor: "rgba(139, 184, 144, 0.16)" },
  "& tbody tr": { transition: "background 160ms ease" },
  "& tbody tr:hover": { bgcolor: "rgba(231, 247, 229, 0.52)" },
  "& tbody td": { py: 1.55, color: GREEN_UI.text },
};

const tableHeadRowSx = {
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
};

const dialogPaperSx = {
  borderRadius: { xs: "22px", sm: "30px" },
  overflow: "hidden",
  border: `1px solid ${GREEN_UI.border}`,
  background: "#fbfff9",
  boxShadow: "0 28px 70px rgba(27, 73, 37, 0.18)",
};

const dialogTitleSx = {
  px: { xs: 2, sm: 3 },
  py: 2.25,
  background: "linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)",
  borderBottom: `1px solid ${GREEN_UI.border}`,
};

const statusChipSx = (status: EvaluationStatus | string) => {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    Draft: { bg: "#f4f7f3", color: "#5f6e63", border: "#dce8da" },
    Submitted: { bg: "#fff7e0", color: "#9b6b00", border: "#f5d786" },
    Reviewed: { bg: "#e9f6ff", color: "#1d6f9c", border: "#b7dff7" },
    Approved: { bg: "#e5f8e9", color: "#217a43", border: "#a9dfb6" },
    Returned: { bg: "#fff7e0", color: "#9b6b00", border: "#f5d786" },
    Cancelled: { bg: "#fdeaea", color: "#9c2f2f", border: "#efb8b8" },
    Active: { bg: '#e5f8e9', color: '#217a43', border: '#a9dfb6' },
    "Under Review": { bg: "#fff7e0", color: "#9b6b00", border: "#f5d786" },
  };
  const selected = styles[status] ?? styles.Draft;
  return {
    bgcolor: selected.bg,
    color: selected.color,
    borderColor: selected.border,
    fontWeight: 600,
    "& .MuiChip-label": { px: 1.25 },
  };
};

const ratingChipSx = (score: number) => {
  if (score >= 90) {
    return { bgcolor: "#fff7e0", color: "#9b6b00", borderColor: "#f5d786", fontWeight: 600};
  }
  if (score >= 85) {
    return { bgcolor: "#e5f8e9", color: "#217a43", borderColor: "#a9dfb6", fontWeight: 600};
  }
  if (score >= 75) {
    return { bgcolor: "#eef9ea", color: GREEN_UI.greenDark, borderColor: GREEN_UI.borderStrong, fontWeight: 600};
  }
  return { bgcolor: GREEN_UI.dangerSoft, color: GREEN_UI.dangerDark, borderColor: "#efb8b8", fontWeight: 600};
};

const actionChipSx = (tone: "primary" | "success" | "danger" | "warning" = "primary") => {
  const styles = {
    primary: { bg: "#ffffff", color: GREEN_UI.greenDark, border: GREEN_UI.borderStrong, hover: GREEN_UI.greenSoft },
    success: { bg: "#f4fbf5", color: GREEN_UI.greenDark, border: "#a9dfb6", hover: "#e5f8e9" },
    danger: { bg: "#fffafa", color: GREEN_UI.dangerDark, border: "#efb8b8", hover: GREEN_UI.dangerSoft },
    warning: { bg: "#fffdf5", color: GREEN_UI.warningDark, border: "#f5d786", hover: GREEN_UI.warningSoft },
  }[tone];

  return {
    minWidth: 92,
    justifyContent: "center",
    fontWeight: 600,
    borderColor: styles.border,
    color: styles.color,
    bgcolor: styles.bg,
    "&:hover": { bgcolor: styles.hover },
  };
};

export default function PerformanceEvaluation() {
  const { user } = useAuth();
  const role = String((user as any)?.role || "").toLowerCase();
  const isHR = role === "hr_admin" || role.includes("hr") || role.includes("admin");
  const isSupervisor = role.includes("supervisor");
  const isGM = role === "general_manager" || role.includes("gm") || role.includes("general");
  const isEmployee = role.includes("employee");
  const currentUserId = String((user as any)?.id || (user as any)?.user_id || "");
  const currentUserName = String((user as any)?.name || (user as any)?.full_name || "Current User");
  const currentEmployeeId = String((user as any)?.employeeId || (user as any)?.employee_id || "");

  const [criteria, setCriteria] = useState<CriterionDef[]>([]);
  const [criteriaReady, setCriteriaReady] = useState<{ total_weight: number; is_ready: boolean; message: string } | null>(null);

  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [supervisors, setSupervisors] = useState<SupervisorAccount[]>([]);
  const [latestDss, setLatestDss] = useState<DssResult | null>(null);
  const [ranking, setRanking] = useState<DssResultItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [evalDialogOpen, setEvalDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => buildEmptyForm([]));
  const selectedFormEmployee = form.employee_id
    ? employees.find((emp) => emp.employee_id === form.employee_id)
    : null;
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    employee_id: "",
    periodStart: monthStart(),
    periodEnd: monthEnd(),
    periodLabel: "",
  });

  const [criteriaDialogOpen, setCriteriaDialogOpen] = useState(false);
  const [criteriaDraft, setCriteriaDraft] = useState<CriteriaEditorRow[]>([]);

  const [dssDialogOpen, setDssDialogOpen] = useState(false);
  const [dssPeriodStart, setDssPeriodStart] = useState(monthStart());
  const [dssPeriodEnd, setDssPeriodEnd] = useState(monthEnd());
  const [dssPeriodLabel, setDssPeriodLabel] = useState("");

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success" as "success" | "error" | "info" | "warning",
  });

  const showMessage = (message: string, severity: "success" | "error" | "info" | "warning" = "success") => {
    setSnackbar({ open: true, message, severity });
  };

  /* ── Fetch helpers ─────────────────────────────────────────────────── */
  const fetchCriteria = async () => {
    const { data, error: err } = await supabase
      .from("evaluation_criteria")
      .select("criteria_id, criteria_name, description, category, weight, max_score, is_active")
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("criteria_name", { ascending: true });

    if (err) throw err;

    const active = (data || []).filter((c: any) => c.criteria_id && c.criteria_name) as CriterionDef[];
    setCriteria(active);
    setForm((prev) => {
      const nextScores = { ...prev.scores };
      active.forEach((c) => {
        if (typeof nextScores[c.criteria_id] !== "number") nextScores[c.criteria_id] = 85;
      });
      return { ...prev, scores: nextScores };
    });

    const { data: readyData } = await supabase.rpc("check_active_evaluation_criteria_weights");
    if (Array.isArray(readyData) && readyData.length > 0) {
      setCriteriaReady({
        total_weight: Number(readyData[0].total_weight || 0),
        is_ready: Boolean(readyData[0].is_ready),
        message: String(readyData[0].message || ""),
      });
    }
  };

  const fetchEmployees = async () => {
    setEmployeesLoading(true);
    try {
      const { data, error: err } = await supabase
        .from("employees")
        .select("employee_id, first_name, middle_name, last_name, suffix, position, outlet, status")
        .order("last_name", { ascending: true });

      if (err) throw err;

      const { data: userAccountsData, error: userAccountsErr } = await supabase
        .from("user_accounts")
        .select("employee_id, outlet");

      if (userAccountsErr) throw userAccountsErr;

      const outletMap = new Map(
        (userAccountsData ?? []).map((u: any) => [
          u.employee_id,
          u.outlet,
        ])
      );

      setEmployees(
        (data || []).map((e: any) => ({
          employee_id: e.employee_id,
          name: fullName(e) || e.employee_id,
          position: e.position || "",
          outlet: outletMap.get(e.employee_id) || e.outlet || "",
          status: e.status || "Active",
        }))
      );
    } catch (err) {
      console.error(err);
      showMessage("Could not load employees.", "error");
    } finally {
      setEmployeesLoading(false);
    }
  };

  const fetchSupervisors = async () => {
    const { data, error: err } = await supabase
      .from("user_accounts")
      .select("user_id, employee_id, full_name, first_name, middle_name, last_name, suffix, email, role, is_active")
      .order("full_name", { ascending: true });

    if (err) throw err;

    setSupervisors(
      (data || [])
        .filter((row: any) => row.is_active !== false && String(row.role || "").toLowerCase().includes("supervisor"))
        .map((row: any) => ({
          user_id: row.user_id,
          employee_id: row.employee_id || "",
          name: row.full_name || fullName(row) || row.email || row.user_id,
          email: row.email || "",
        }))
    );
  };

  const fetchEvaluations = async () => {
    const { data: evalRows, error: evalErr } = await supabase
      .from("employee_evaluations")
      .select("*")
      .order("final_weighted_score", { ascending: false })
      .order("created_at", { ascending: false });

    if (evalErr) throw evalErr;

    const ids = (evalRows || []).map((r: any) => r.evaluation_id).filter(Boolean);
    let scoresByEvaluation: Record<string, Record<string, EvaluationScoreRow>> = {};

    if (ids.length > 0) {
      const { data: scoreRows, error: scoreErr } = await supabase
        .from("employee_evaluation_scores")
        .select("evaluation_id, criteria_id, criteria_name, criteria_weight, max_score, raw_score, weighted_score")
        .in("evaluation_id", ids);

      if (scoreErr) throw scoreErr;

      scoresByEvaluation = (scoreRows || []).reduce((acc: Record<string, Record<string, EvaluationScoreRow>>, row: any) => {
        if (!acc[row.evaluation_id]) acc[row.evaluation_id] = {};
        acc[row.evaluation_id][row.criteria_id] = {
          criteria_id: row.criteria_id,
          criteria_name: row.criteria_name,
          criteria_weight: Number(row.criteria_weight || 0),
          max_score: Number(row.max_score || 100),
          raw_score: Number(row.raw_score || 0),
          weighted_score: Number(row.weighted_score || 0),
        };
        return acc;
      }, {});
    }

    setEvaluations(
      (evalRows || []).map((row: any) => ({
        evaluation_id: row.evaluation_id,
        employee_id: row.employee_id,
        employee_name: row.employee_name || row.employee_id,
        position: row.position || "",
        outlet: row.outlet || "",
        evaluation_period_start: row.evaluation_period_start,
        evaluation_period_end: row.evaluation_period_end,
        evaluation_period_label: row.evaluation_period_label,
        evaluator_user_id: row.evaluator_user_id || null,
        evaluator_name: row.evaluator_name,
        evaluator_role: row.evaluator_role,
        total_raw_score: Number(row.total_raw_score || 0),
        final_weighted_score: Number(row.final_weighted_score || 0),
        rating_label: row.rating_label,
        status: row.status || "Draft",
        remarks: row.remarks,
        scores: scoresByEvaluation[row.evaluation_id] || {},
      }))
    );
  };

  const fetchLatestDss = async () => {
    const { data: dssRows, error: dssErr } = await supabase
      .from("dss_results")
      .select("*")
      .order("generated_at", { ascending: false })
      .limit(1);

    if (dssErr) throw dssErr;

    const current = (dssRows || [])[0] as DssResult | undefined;
    setLatestDss(current || null);

    if (!current?.result_id) {
      setRanking([]);
      return;
    }

    const { data: items, error: itemErr } = await supabase
      .from("dss_result_items")
      .select("*")
      .eq("result_id", current.result_id)
      .order("rank_no", { ascending: true });

    if (itemErr) throw itemErr;

    setRanking((items || []) as DssResultItem[]);
  };

  const refreshAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchCriteria(), fetchEmployees(), fetchSupervisors(), fetchEvaluations(), fetchLatestDss()]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not load performance evaluation data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Derived values ────────────────────────────────────────────────── */
  const displayedEvaluations = useMemo(() => {
    if (isEmployee) {
      return evaluations.filter((e) => {
        if (currentEmployeeId) return e.employee_id === currentEmployeeId;
        return e.employee_name === currentUserName;
      });
    }

    if (isSupervisor) {
      return evaluations.filter((e) => {
        if (currentUserId && e.evaluator_user_id === currentUserId) return true;
        return String(e.evaluator_role || "").toLowerCase().includes("supervisor");
      });
    }

    return evaluations;
  }, [currentEmployeeId, currentUserId, currentUserName, evaluations, isEmployee, isSupervisor]);

  const previewScore = computePreviewScore(form.scores, criteria);
  const topDssItem = ranking.find((r) => (r.recommendation || "").includes("Employee of the Month")) || ranking[0] || null;
  const assignedDraftEvaluations = useMemo(
    () => displayedEvaluations.filter((evaluation) => evaluation.status === "Draft"),
    [displayedEvaluations]
  );
  const showEvaluationScores = !isHR || displayedEvaluations.some((evaluation) => evaluation.status !== "Draft");
  const evaluationScoreColumnCount = showEvaluationScores ? criteria.length + 2 : 0;

  /* ── Evaluation actions ────────────────────────────────────────────── */
  const openEvaluateForEmployee = (emp?: EmployeeRecord) => {
    setForm({
      ...buildEmptyForm(criteria),
      employee_id: emp?.employee_id || "",
      employee_name: emp?.name || "",
      position: emp?.position || "",
      outlet: emp?.outlet || "",
      periodLabel: `${new Date().toLocaleString("default", { month: "long" })} ${new Date().getFullYear()} Evaluation`,
    });
    setEvalDialogOpen(true);
  };

  const openAssignedEvaluation = (evaluation: EvaluationResult) => {
    const scores = { ...buildEmptyForm(criteria).scores };
    criteria.forEach((criterion) => {
      const existingScore = evaluation.scores[criterion.criteria_id];
      if (existingScore) scores[criterion.criteria_id] = Number(existingScore.raw_score || 0);
    });

    setForm({
      evaluation_id: evaluation.evaluation_id,
      employee_id: evaluation.employee_id,
      employee_name: evaluation.employee_name,
      position: evaluation.position,
      outlet: evaluation.outlet,
      periodStart: evaluation.evaluation_period_start,
      periodEnd: evaluation.evaluation_period_end,
      periodLabel: evaluation.evaluation_period_label || "",
      scores,
      remarks: evaluation.remarks || "",
    });
    setEvalDialogOpen(true);
  };

  const openAssignDialog = () => {
    setAssignForm({
      employee_id: "",
      periodStart: monthStart(),
      periodEnd: monthEnd(),
      periodLabel: `${new Date().toLocaleString("default", { month: "long" })} ${new Date().getFullYear()} Evaluation`,
    });
    setAssignDialogOpen(true);
  };

  const handleAssignEvaluation = async () => {
    if (!assignForm.employee_id) {
      showMessage("Please select an employee to assign.", "warning");
      return;
    }
    if (!assignForm.periodStart || !assignForm.periodEnd) {
      showMessage("Please select the evaluation period.", "warning");
      return;
    }

    const employee = employees.find((emp) => emp.employee_id === assignForm.employee_id);
    if (!employee) {
      showMessage("Selected employee could not be found.", "error");
      return;
    }

    setSaving(true);
    try {
      const { data: evalId, error: templateErr } = await supabase.rpc("create_employee_evaluation_template", {
        p_employee_id: employee.employee_id,
        p_period_start: assignForm.periodStart,
        p_period_end: assignForm.periodEnd,
        p_period_label: assignForm.periodLabel || null,
        p_evaluator_user_id: null,
        p_evaluator_name: "Supervisor",
        p_evaluator_role: "supervisor",
      });

      if (templateErr) throw templateErr;
      const evaluationId = String(evalId);

      const { error: updateErr } = await supabase
        .from("employee_evaluations")
        .update({
          employee_name: employee.name,
          position: employee.position,
          outlet: employee.outlet,
          evaluator_user_id: null,
          evaluator_name: "Supervisor",
          evaluator_role: "supervisor",
          status: "Draft",
          remarks: `Assigned by ${currentUserName}.`,
          updated_at: new Date().toISOString(),
        })
        .eq("evaluation_id", evaluationId);

      if (updateErr) throw updateErr;

      const { error: notificationError } = await supabase.from("notifications").insert({
        recipient_role: "supervisor",
        title: "Employee Assigned for Evaluation",
        message: `${currentUserName} submitted ${employee.name} for performance evaluation.`,
        type: "performance_evaluation",
      });
      if (notificationError) console.warn("Evaluation assignment notification failed:", notificationError.message);

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "ASSIGN_EVALUATION",
        p_module: "Performance Evaluation",
        p_record_id: evaluationId,
        p_record_table: "employee_evaluations",
        p_description: `Submitted ${employee.name} to Supervisor for evaluation.`,
        p_old_data: null,
        p_new_data: { employee_id: employee.employee_id, evaluator_role: "supervisor" },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      setAssignDialogOpen(false);
      showMessage(`${employee.name} was submitted to Supervisor for evaluation.`, "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not assign evaluation."}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!form.employee_id) {
      showMessage("Please select an employee to evaluate.", "warning");
      return;
    }

    if (!form.periodStart || !form.periodEnd) {
      showMessage("Please select the evaluation period.", "warning");
      return;
    }

    if (!criteriaReady?.is_ready) {
      showMessage(criteriaReady?.message || "Criteria weights must total 100% before evaluation.", "error");
      return;
    }

    setSaving(true);
    try {
      const linkedEmployee = employees.find((emp) => emp.employee_id === form.employee_id);
      const employeePosition = linkedEmployee?.position || form.position || "";
      const employeeOutlet = linkedEmployee?.outlet || form.outlet || "";

      let evaluationId = form.evaluation_id;
      if (!evaluationId) {
        const { data: evalId, error: templateErr } = await supabase.rpc("create_employee_evaluation_template", {
          p_employee_id: form.employee_id,
          p_period_start: form.periodStart,
          p_period_end: form.periodEnd,
          p_period_label: form.periodLabel || null,
          p_evaluator_user_id: null, // kept null to avoid FK errors if custom login user_id is not in user_accounts
          p_evaluator_name: currentUserName,
          p_evaluator_role: (user as any)?.role || "Supervisor",
        });

        if (templateErr) throw templateErr;
        evaluationId = String(evalId);
      }
      const updatePromises = criteria.map((c) =>
        supabase
          .from("employee_evaluation_scores")
          .update({ raw_score: Number(form.scores[c.criteria_id] ?? 0), updated_at: new Date().toISOString() })
          .eq("evaluation_id", evaluationId)
          .eq("criteria_id", c.criteria_id)
      );

      const updateResults = await Promise.all(updatePromises);
      const failedUpdate = updateResults.find((r) => r.error);
      if (failedUpdate?.error) throw failedUpdate.error;

      const { error: recalcErr } = await supabase.rpc("recalculate_employee_evaluation", {
        p_evaluation_id: evaluationId,
      });
      if (recalcErr) throw recalcErr;

      const { error: evalUpdateErr } = await supabase
        .from("employee_evaluations")
        .update({
          position: employeePosition,
          outlet: employeeOutlet,
          status: "Submitted",
          remarks: form.remarks || null,
          submitted_at: new Date().toISOString(),
          evaluator_user_id: null,
          evaluator_name: currentUserName,
          evaluator_role: (user as any)?.role || "Supervisor",
        })
        .eq("evaluation_id", evaluationId);

      if (evalUpdateErr) throw evalUpdateErr;

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "SUBMIT_EVALUATION",
        p_module: "Performance Evaluation",
        p_record_id: evaluationId,
        p_record_table: "employee_evaluations",
        p_description: `Submitted evaluation for ${form.employee_name || form.employee_id}.`,
        p_old_data: null,
        p_new_data: { employee_id: form.employee_id, final_preview_score: previewScore },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      setEvalDialogOpen(false);
      showMessage(`Evaluation submitted. Final score: ${previewScore.toFixed(2)}%.`, "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not submit evaluation."}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (evaluationId: string) => {
    try {
      const { error: err } = await supabase
        .from("employee_evaluations")
        .update({
          status: "Approved",
          approved_at: new Date().toISOString(),
        })
        .eq("evaluation_id", evaluationId);

      if (err) throw err;

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "APPROVE_EVALUATION",
        p_module: "Performance Evaluation",
        p_record_id: evaluationId,
        p_record_table: "employee_evaluations",
        p_description: "Approved employee evaluation.",
        p_old_data: null,
        p_new_data: { status: "Approved" },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      showMessage("Evaluation approved.", "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not approve evaluation."}`, "error");
    }
  };

  const handleDelete = async (evaluationId: string) => {
    if (!window.confirm(`Delete evaluation ${evaluationId}? This cannot be undone.`)) return;

    try {
      const { error: err } = await supabase.from("employee_evaluations").delete().eq("evaluation_id", evaluationId);
      if (err) throw err;

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "DELETE_EVALUATION",
        p_module: "Performance Evaluation",
        p_record_id: evaluationId,
        p_record_table: "employee_evaluations",
        p_description: "Deleted employee evaluation.",
        p_old_data: null,
        p_new_data: null,
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      showMessage("Evaluation deleted.", "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not delete evaluation."}`, "error");
    }
  };

  const handleGenerateDss = async () => {
    if (!dssPeriodStart || !dssPeriodEnd) {
      showMessage("Please select ranking period start and end dates.", "warning");
      return;
    }

    setSaving(true);
    try {
      const { data: resultId, error: err } = await supabase.rpc("generate_dss_results_from_evaluations", {
        p_period_start: dssPeriodStart,
        p_period_end: dssPeriodEnd,
        p_period_label: dssPeriodLabel || `${dssPeriodStart} — ${dssPeriodEnd}`,
        p_generated_by_user_id: null,
      });

      if (err) throw err;

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "GENERATE_PERFORMANCE_RANKING",
        p_module: "Performance Evaluation",
        p_record_id: String(resultId),
        p_record_table: "dss_results",
        p_description: `Generated automated performance ranking for ${dssPeriodStart} to ${dssPeriodEnd}.`,
        p_old_data: null,
        p_new_data: { result_id: resultId },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      setDssDialogOpen(false);
      showMessage("Automated ranking generated successfully.", "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not generate automated ranking."}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkEOTM = async (item: DssResultItem) => {
    try {
      const { error: err } = await supabase
        .from("dss_result_items")
        .update({ recommendation: "Employee of the Month", remarks: "Manually marked by management." })
        .eq("result_id", item.result_id)
        .eq("evaluation_id", item.evaluation_id);

      if (err) throw err;

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "MARK_EMPLOYEE_OF_THE_MONTH",
        p_module: "Performance Evaluation",
        p_record_id: item.evaluation_id,
        p_record_table: "dss_result_items",
        p_description: `${item.employee_name} was marked as Employee of the Month.`,
        p_old_data: null,
        p_new_data: { recommendation: "Employee of the Month" },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      showMessage("Employee of the Month saved.", "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not mark Employee of the Month."}`, "error");
    }
  };

  /* ── Criteria actions ──────────────────────────────────────────────── */
  const openCriteriaDialog = () => {
    setCriteriaDraft(
      criteria.map((c) => ({
        criteria_id: c.criteria_id,
        criteria_name: c.criteria_name,
        description: c.description || "",
        category: c.category || "",
        weight: Number(c.weight || 0),
        max_score: Number(c.max_score || 100),
      }))
    );
    setCriteriaDialogOpen(true);
  };

  const addNewCriterion = () => {
    setCriteriaDraft((prev) => [
      ...prev,
      {
        criteria_id: `NEW-${Date.now()}`,
        criteria_name: "New Criterion",
        description: "Describe this criterion.",
        category: "Custom",
        weight: 0,
        max_score: 100,
        isNew: true,
      },
    ]);
  };

  const removeCriterion = (idx: number) => {
    setCriteriaDraft((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveCriteria = async () => {
    const total = criteriaDraft.reduce((sum, c) => sum + Number(c.weight || 0), 0);
    if (Math.round(total * 100) / 100 !== 100) {
      showMessage(`Criteria weights must total exactly 100%. Current total: ${total}%.`, "error");
      return;
    }

    setSaving(true);
    try {
      const keptExistingIds = criteriaDraft.filter((c) => !c.isNew).map((c) => c.criteria_id);
      const activeExistingIds = criteria.map((c) => c.criteria_id);
      const toDeactivate = activeExistingIds.filter((id) => !keptExistingIds.includes(id));

      if (toDeactivate.length > 0) {
        const { error: deactivateErr } = await supabase
          .from("evaluation_criteria")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .in("criteria_id", toDeactivate);

        if (deactivateErr) throw deactivateErr;
      }

      for (const row of criteriaDraft) {
        const payload = {
          criteria_name: row.criteria_name,
          description: row.description || null,
          category: row.category || null,
          weight: Number(row.weight || 0),
          max_score: Number(row.max_score || 100),
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        if (row.isNew) {
          const { error: insertErr } = await supabase.from("evaluation_criteria").insert(payload);
          if (insertErr) throw insertErr;
        } else {
          const { error: updateErr } = await supabase
            .from("evaluation_criteria")
            .update(payload)
            .eq("criteria_id", row.criteria_id);

          if (updateErr) throw updateErr;
        }
      }

      await supabase.rpc("create_system_log", {
        p_user_id: null,
        p_user_name: currentUserName,
        p_user_role: (user as any)?.role || null,
        p_action: "UPDATE_EVALUATION_CRITERIA",
        p_module: "Performance Evaluation",
        p_record_id: null,
        p_record_table: "evaluation_criteria",
        p_description: "Updated evaluation criteria and weights.",
        p_old_data: null,
        p_new_data: { total_weight: total, criteria_count: criteriaDraft.length },
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
      });

      setCriteriaDialogOpen(false);
      showMessage("Evaluation criteria updated successfully.", "success");
      await refreshAll();
    } catch (err: any) {
      console.error(err);
      showMessage(`Failed: ${err?.message || "Could not save criteria."}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const performanceStats = [
    {
      label: "Total Evaluations",
      value: displayedEvaluations.length,
      caption: isEmployee ? "Evaluations assigned to your employee profile." : "Visible evaluation records in this workspace.",
      icon: <TaskAlt fontSize="small" />,
    },
    {
      label: "Submitted / Pending",
      value: evaluations.filter((r) => r.status === "Submitted" || r.status === "Reviewed").length,
      caption: "Records waiting for review or approval.",
      icon: <Insights fontSize="small" />,
    },
    {
      label: "Latest Ranking Average",
      value: latestDss ? `${Number(latestDss.average_score || 0).toFixed(2)}%` : "—",
      caption: latestDss ? latestDss.result_period_label || "Most recent generated ranking." : "Generate a ranking to calculate average score.",
      icon: <Grade fontSize="small" />,
    },
    {
      label: "Employee of the Month",
      value: topDssItem ? topDssItem.employee_name : "Not yet generated",
      caption: topDssItem ? `${Number(topDssItem.final_weighted_score || 0).toFixed(2)}% final weighted score.` : "Top employee will appear after ranking.",
      icon: <EmojiEvents fontSize="small" />,
      featured: true,
    },
  ];

  /* ═══════════════════════════════════════════════════════════════════ */
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
          background: "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,250,235,0.96) 60%, rgba(225,248,224,0.94) 100%)",
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
          <Box sx={{ maxWidth: 760 }}>
            <Chip
              icon={<EmojiEvents sx={{ fontSize: 16 }} />}
              label="Performance Workspace"
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
              Performance Evaluation
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 680, lineHeight: 1.7 }}>
              Connected criteria management, employee scoring, automated ranking, and Employee of the Month support in one clean workspace.
            </Typography>
          </Box>

          <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
            <Tooltip title="Refresh performance data">
              <span>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                  onClick={refreshAll}
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

            {isHR && (
              <Button
                variant="outlined"
                startIcon={<Edit />}
                onClick={openCriteriaDialog}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  borderColor: GREEN_UI.borderStrong,
                  color: GREEN_UI.greenDark,
                  bgcolor: "#ffffff",
                  "&:hover": { bgcolor: GREEN_UI.greenSoft, borderColor: GREEN_UI.green },
                }}
              >
                Manage Criteria
              </Button>
            )}

            {isHR && (
              <Button
                variant="contained"
                startIcon={<AddCircleOutline />}
                onClick={openAssignDialog}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: GREEN_UI.greenDark,
                  boxShadow: "0 12px 24px rgba(31, 122, 70, 0.20)",
                  "&:hover": { bgcolor: "#17633a" },
                }}
              >
                Assign Evaluation
              </Button>
            )}

            {(isHR || isGM) && (
              <Button
                variant="contained"
                startIcon={<Insights />}
                onClick={() => setDssDialogOpen(true)}
                sx={{
                  ...pillButtonSx,
                  py: 1.1,
                  bgcolor: "#9b6b00",
                  boxShadow: "0 12px 24px rgba(155, 107, 0, 0.18)",
                  "&:hover": { bgcolor: "#7b5600" },
                }}
              >
                Generate Ranking
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {performanceStats.map((stat) => (
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
                background: stat.featured
                  ? "linear-gradient(135deg, #fffaf0 0%, #ffffff 58%, #f1faed 100%)"
                  : GREEN_UI.cardBg,
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
                    variant={stat.featured ? "subtitle1" : "h4"}
                    fontWeight={700}
                    sx={{
                      color: GREEN_UI.text,
                      mt: 0.5,
                      letterSpacing: "-0.04em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
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
                    bgcolor: stat.featured ? GREEN_UI.warningSoft : GREEN_UI.greenSoft,
                    color: stat.featured ? GREEN_UI.warningDark : GREEN_UI.greenDark,
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
          sx={{ mb: 2, borderRadius: "18px", border: `1px solid ${GREEN_UI.border}` }}
          action={
            <Button size="small" onClick={refreshAll} sx={{ ...pillButtonSx }}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {criteriaReady && (
        <Alert
          severity={criteriaReady.is_ready ? "success" : "error"}
          icon={criteriaReady.is_ready ? <TaskAlt /> : undefined}
          sx={{ mb: 2, borderRadius: "18px", border: `1px solid ${GREEN_UI.border}` }}
        >
          Criteria Weight Check: <strong>{money(criteriaReady.total_weight)}%</strong> — {criteriaReady.message}
        </Alert>
      )}

      <Paper elevation={0} sx={{ ...softCardSx, p: { xs: 2, md: 2.4 }, mb: 2.5 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "16px",
              display: "grid",
              placeItems: "center",
              bgcolor: GREEN_UI.greenSoft,
              color: GREEN_UI.greenDark,
              flexShrink: 0,
            }}
          >
            <Insights />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={700} sx={{ color: GREEN_UI.text, mb: 0.5 }}>
              Weighted Scoring Formula
            </Typography>
            <Typography variant="body2" sx={{ color: GREEN_UI.muted, lineHeight: 1.8 }}>
              Final Score ={" "}
              {criteria.length > 0
                ? criteria.map((c) => `(${c.criteria_name} × ${Number(c.weight || 0)}%)`).join(" + ")
                : "No active criteria found."}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {isSupervisor && (
        <Paper elevation={0} sx={{ ...softCardSx, mb: 2.5, overflow: "hidden" }}>
          <Box
            sx={{
              px: { xs: 2, sm: 2.5 },
              py: 2,
              borderBottom: `1px solid ${GREEN_UI.border}`,
              background: "linear-gradient(90deg, #ffffff 0%, #f1faed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1.5,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
              <Box sx={{ width: 38, height: 38, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
                <Groups fontSize="small" />
              </Box>
              <Box>
                <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                  Assigned Evaluations
                </Typography>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                  Evaluate only employees assigned to you by HR/Admin.
                </Typography>
              </Box>
            </Box>
          </Box>

          <TableContainer sx={{ overflowX: "auto", "&::-webkit-scrollbar": { height: 10 }, "&::-webkit-scrollbar-thumb": { bgcolor: "#cfe8d1"} }}>
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 7, gap: 2 }}>
                <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
                <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading assigned evaluations...</Typography>
              </Box>
            ) : (
              <Table sx={{ ...tableSx, minWidth: 860 }}>
                <TableHead>
                  <TableRow sx={tableHeadRowSx}>
                    {[
                      "Evaluation ID",
                      "Employee",
                      "Position",
                      "Outlet",
                      "Period",
                      "Action",
                    ].map((h) => (
                      <TableCell key={h}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {assignedDraftEvaluations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 7 }}>
                        <Box sx={{ maxWidth: 360, mx: "auto" }}>
                          <Box sx={{ width: 54, height: 54, borderRadius: "20px", display: "grid", placeItems: "center", mx: "auto", mb: 1.5, bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
                            <Groups />
                          </Box>
                          <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                            No assigned evaluations
                          </Typography>
                          <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                            HR/Admin assignments will appear here when they are ready for evaluation.
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ) : (
                    assignedDraftEvaluations.map((emp) => (
                      <TableRow key={emp.evaluation_id} hover>
                        <TableCell>
                          <Chip label={emp.evaluation_id} size="small" variant="outlined" sx={{ fontWeight: 600, bgcolor: "#f8fcf5", borderColor: GREEN_UI.border }} />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>
                            {emp.employee_name}
                          </Typography>
                          <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                            {emp.employee_id}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                            {emp.position || "—"}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{emp.outlet || "—"}</TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>{formatPeriod(emp)}</TableCell>
                        <TableCell>
                          <Chip
                            label="Evaluate"
                            size="small"
                            clickable
                            variant="outlined"
                            icon={<AddCircleOutline />}
                            onClick={() => openAssignedEvaluation(emp)}
                            sx={actionChipSx("primary")}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        </Paper>
      )}

      <TableContainer
        component={Paper}
        elevation={0}
        sx={{
          ...softCardSx,
          overflowX: "auto",
          mb: 2.5,
          "&::-webkit-scrollbar": { height: 10 },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#cfe8d1"},
        }}
      >
        {loading ? (
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 7, gap: 2 }}>
            <CircularProgress size={28} sx={{ color: GREEN_UI.green }} />
            <Typography sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>Loading evaluations…</Typography>
          </Box>
        ) : (
          <Table sx={{ ...tableSx, minWidth: 1180 }}>
            <TableHead>
              <TableRow sx={tableHeadRowSx}>
                {[
                  "Employee",
                  "Position",
                  "Outlet",
                  "Period",
                  ...(showEvaluationScores
                    ? [
                        ...criteria.map((c) => `${c.criteria_name} (${Number(c.weight || 0)}%)`),
                        "Final Score",
                        "Rating",
                      ]
                    : []),
                  "Status",
                  ...(isHR || isGM ? ["Actions"] : []),
                ].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {displayedEvaluations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5 + evaluationScoreColumnCount + (isHR || isGM ? 1 : 0)} align="center" sx={{ py: 7 }}>
                    <Box sx={{ maxWidth: 380, mx: "auto" }}>
                      <Box sx={{ width: 54, height: 54, borderRadius: "20px", display: "grid", placeItems: "center", mx: "auto", mb: 1.5, bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
                        <TaskAlt />
                      </Box>
                      <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                        No evaluations found
                      </Typography>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                        Submitted performance evaluations will automatically appear in this table.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                displayedEvaluations.map((r, i) => (
                  <TableRow key={r.evaluation_id} hover sx={{ bgcolor: i === 0 ? "rgba(255, 255, 255, 0.36)" : "inherit" }}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>
                        {r.employee_name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                        {r.employee_id}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 700 }}>
                        {r.position || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{r.outlet || "—"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatPeriod(r)}</TableCell>
                    {showEvaluationScores && (
                      r.status === "Draft" ? (
                        <TableCell colSpan={evaluationScoreColumnCount} align="center" sx={{ whiteSpace: "nowrap" }}>
                          <Chip
                            label="Pending supervisor evaluation"
                            size="small"
                            variant="outlined"
                            sx={statusChipSx("Draft")}
                          />
                        </TableCell>
                      ) : (
                        <>
                    {criteria.map((c) => {
                      const s = r.scores[c.criteria_id];
                      return (
                        <TableCell key={`${r.evaluation_id}-${c.criteria_id}`} align="center" sx={{ whiteSpace: "nowrap" }}>
                          <Chip
                            label={s ? `${Number(s.raw_score || 0).toFixed(0)}%` : "—"}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, bgcolor: "#ffffff", borderColor: GREEN_UI.border }}
                          />
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Typography fontWeight={700} sx={{ whiteSpace: "nowrap", color: GREEN_UI.greenDark }}>
                        {Number(r.final_weighted_score || 0).toFixed(2)}%
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={r.rating_label || labelForScore(Number(r.final_weighted_score || 0))}
                        size="small"
                        variant="outlined"
                        sx={ratingChipSx(Number(r.final_weighted_score || 0))}
                      />
                    </TableCell>
                        </>
                      )
                    )}
                    <TableCell>
                      <Chip
                        label={isEmployee && r.status === "Submitted" ? "Under Review" : r.status}
                        size="small"
                        variant="outlined"
                        sx={statusChipSx(isEmployee && r.status === "Submitted" ? "Under Review" : r.status)}
                      />
                    </TableCell>
                    {(isHR || isGM) && (
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
                          {(r.status === "Submitted" || r.status === "Reviewed") && (
                            <Chip
                              icon={<TaskAlt />}
                              label="Approve"
                              size="small"
                              clickable
                              variant="outlined"
                              sx={actionChipSx("success")}
                              onClick={() => handleApprove(r.evaluation_id)}
                            />
                          )}
                          <Chip
                            icon={<DeleteOutline />}
                            label="Delete"
                            size="small"
                            clickable
                            variant="outlined"
                            sx={actionChipSx("danger")}
                            onClick={() => handleDelete(r.evaluation_id)}
                          />
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      {(isHR || isGM || ranking.length > 0) && (
        <Paper elevation={0} sx={{ ...softCardSx, mb: 2.5, overflow: "hidden" }}>
          <Box
            sx={{
              px: { xs: 2, sm: 2.5 },
              py: 2,
              borderBottom: `1px solid ${GREEN_UI.border}`,
              background: "linear-gradient(90deg, #ffffff 0%, #f1faed 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1.5,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
              <Box sx={{ width: 38, height: 38, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: GREEN_UI.warningSoft, color: GREEN_UI.warningDark }}>
                <EmojiEvents fontSize="small" />
              </Box>
              <Box>
                <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                  Automated Ranking Results
                </Typography>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                  {latestDss
                    ? `${latestDss.result_period_label || "Latest Ranking Result"} • ${latestDss.result_period_start} to ${latestDss.result_period_end}`
                    : "Generate a ranking to view employee recommendations."}
                </Typography>
              </Box>
            </Box>
            {(isHR || isGM) && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<Insights />}
                onClick={() => setDssDialogOpen(true)}
                sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: "#ffffff", "&:hover": { bgcolor: GREEN_UI.greenSoft } }}
              >
                Generate Ranking
              </Button>
            )}
          </Box>

          <TableContainer sx={{ overflowX: "auto", "&::-webkit-scrollbar": { height: 10 }, "&::-webkit-scrollbar-thumb": { bgcolor: "#cfe8d1"} }}>
            <Table sx={{ ...tableSx, minWidth: 900 }}>
              <TableHead>
                <TableRow sx={tableHeadRowSx}>
                  {["Rank", "Employee", "Position", "Outlet", "Score", "Rating", "Recommendation", ...(isGM ? ["Action"] : [])].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {ranking.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7 + (isGM ? 1 : 0)} align="center" sx={{ py: 7 }}>
                      <Box sx={{ maxWidth: 380, mx: "auto" }}>
                        <Box sx={{ width: 54, height: 54, borderRadius: "20px", display: "grid", placeItems: "center", mx: "auto", mb: 1.5, bgcolor: GREEN_UI.warningSoft, color: GREEN_UI.warningDark }}>
                          <EmojiEvents />
                        </Box>
                        <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                          No ranking generated yet
                        </Typography>
                        <Typography variant="body2" sx={{ color: GREEN_UI.muted, mt: 0.5 }}>
                          Ranking results will appear here after generating a period.
                        </Typography>
                      </Box>
                    </TableCell>
                  </TableRow>
                ) : (
                  ranking.map((item) => (
                    <TableRow key={`${item.result_id}-${item.evaluation_id}`} hover sx={{ bgcolor: item.rank_no === 1 ? "rgba(255, 255, 255, 0.55)" : "inherit" }}>
                      <TableCell>
                        <Chip
                          icon={item.rank_no === 1 ? <EmojiEvents /> : undefined}
                          label={item.rank_no === 1 ? "#1" : `#${item.rank_no}`}
                          size="small"
                          variant="outlined"
                          sx={item.rank_no === 1 ? ratingChipSx(90) : { fontWeight: 600, bgcolor: "#f8fcf5", borderColor: GREEN_UI.border }}
                        />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Typography fontWeight={600} sx={{ color: GREEN_UI.text }}>
                          {item.employee_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                          {item.employee_id}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{item.position || "—"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{item.outlet || "—"}</TableCell>
                      <TableCell>
                        <Typography fontWeight={700} sx={{ color: GREEN_UI.greenDark }}>
                          {Number(item.final_weighted_score || 0).toFixed(2)}%
                        </Typography>
                      </TableCell>
                      <TableCell>{item.rating_label || "—"}</TableCell>
                      <TableCell>
                        <Chip
                          label={item.recommendation || "—"}
                          size="small"
                          variant="outlined"
                          sx={(item.recommendation || "").includes("Employee of the Month") ? ratingChipSx(90) : item.rank_no === 1 ? statusChipSx("Approved") : statusChipSx("Draft")}
                        />
                      </TableCell>
                      {isGM && (
                        <TableCell>
                          <Chip
                            icon={<EmojiEvents />}
                            label="Mark EOTM"
                            size="small"
                            clickable
                            variant="outlined"
                            sx={actionChipSx("warning")}
                            onClick={() => handleMarkEOTM(item)}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
              <AssignmentTurnedIn fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Assign Employee for Evaluation
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Choose the employee and evaluation period. The supervisor is assigned automatically.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: "#fbfff9" }}>
          <Grid container spacing={2} sx={{ mt: 2.25 }}>
            <Grid size={12}>
              <TextField
                fullWidth
                select
                label="Employee"
                value={assignForm.employee_id}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, employee_id: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem value="">Select employee...</MenuItem>
                {employees.map((emp) => (
                  <MenuItem key={emp.employee_id} value={emp.employee_id}>
                    {emp.employee_id} - {emp.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Period Start"
                type="date"
                value={assignForm.periodStart}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, periodStart: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                label="Period End"
                type="date"
                value={assignForm.periodEnd}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, periodEnd: e.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              />
            </Grid>

            <Grid size={12}>
              <TextField
                fullWidth
                label="Period Label"
                value={assignForm.periodLabel}
                onChange={(e) => setAssignForm((prev) => ({ ...prev, periodLabel: e.target.value }))}
                placeholder="Example: May 2026 Evaluation"
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: "#fbfff9", borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button onClick={() => setAssignDialogOpen(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAssignEvaluation}
            disabled={saving || !assignForm.employee_id}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <AssignmentTurnedIn />}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, "&:hover": { bgcolor: GREEN_UI.greenDark } }}
          >
            {saving ? "Assigning..." : "Assign to Supervisor"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={evalDialogOpen} onClose={() => setEvalDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
              <Grade fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Employee Performance Evaluation
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Input criteria scores and submit the evaluation record.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: "#fbfff9" }}>
          <Grid container spacing={2} sx={{ mt: 2.25 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Employee ID"
                value={form.employee_id}
                onChange={(e) => {
                  const selected = employees.find((emp) => emp.employee_id === e.target.value);
                  setForm({
                    ...form,
                    employee_id: selected?.employee_id || "",
                    employee_name: selected?.name || "",
                    position: selected?.position || "",
                    outlet: selected?.outlet || "",
                  });
                }}
                disabled={Boolean(form.evaluation_id) || isSupervisor}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem value="">Select employee…</MenuItem>
                {(form.evaluation_id ? employees.filter((emp) => emp.employee_id === form.employee_id) : employees).map((emp) => (
                  <MenuItem key={emp.employee_id} value={emp.employee_id}>
                    {emp.employee_id}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Employee Name" value={form.employee_name} disabled InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Position"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                disabled={Boolean(form.evaluation_id) || isSupervisor}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem value="">Select position…</MenuItem>
                {AVAILABLE_POSITIONS.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                fullWidth
                select
                label="Outlet / Branch"
                value={form.outlet}
                disabled={Boolean(form.evaluation_id) || Boolean(selectedFormEmployee?.outlet)}
                onChange={(e) => setForm({ ...form, outlet: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={softTextFieldSx}
              >
                <MenuItem value="">Select outlet…</MenuItem>
                {OUTLETS.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
              </TextField>
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Period Start" type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} disabled={Boolean(form.evaluation_id) || isSupervisor} InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Period End" type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} disabled={Boolean(form.evaluation_id) || isSupervisor} InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>

            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Period Label" value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} disabled={Boolean(form.evaluation_id) || isSupervisor} InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>
          </Grid>

          <Divider sx={{ my: 3, borderColor: GREEN_UI.border }}>
            <Chip label="Criteria Scores" size="small" variant="outlined" sx={{ fontWeight: 700, color: GREEN_UI.greenDark, borderColor: GREEN_UI.borderStrong, bgcolor: "#ffffff" }} />
          </Divider>

          <Grid container spacing={1.5}>
            {criteria.map((c) => (
              <Grid key={c.criteria_id} size={{ xs: 12, md: 6 }}>
                <Paper elevation={0} sx={{ ...innerCardSx, p: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, mb: 1 }}>
                    <Box>
                      <Typography variant="body2" fontWeight={700} sx={{ color: GREEN_UI.text }}>{c.criteria_name}</Typography>
                      <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>Weight: {Number(c.weight || 0)}%</Typography>
                    </Box>
                    <Chip label={`${form.scores[c.criteria_id] ?? 0}%`} size="small" variant="outlined" sx={ratingChipSx(Number(form.scores[c.criteria_id] ?? 0))} />
                  </Box>
                  <Slider
                    value={form.scores[c.criteria_id] ?? 0}
                    onChange={(_, v) => setForm({ ...form, scores: { ...form.scores, [c.criteria_id]: v as number } })}
                    valueLabelDisplay="auto"
                    min={0}
                    max={Number(c.max_score || 100)}
                    size="small"
                    sx={{ color: (form.scores[c.criteria_id] ?? 0) >= 75 ? GREEN_UI.green : GREEN_UI.warningDark }}
                  />
                  <Typography variant="caption" sx={{ color: GREEN_UI.muted, lineHeight: 1.6 }}>{c.description}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <TextField
            fullWidth
            label="Remarks"
            multiline
            rows={3}
            value={form.remarks}
            onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            sx={{ ...softTextFieldSx, mt: 3 }}
          />

          <Paper
            elevation={0}
            sx={{
              ...innerCardSx,
              p: 2.5,
              mt: 3,
              background: previewScore >= 90 ? "linear-gradient(135deg, #fff7e0 0%, #ffffff 100%)" : "linear-gradient(135deg, #e8f8ea 0%, #ffffff 100%)",
            }}
          >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
              <Box>
                <Typography variant="body2" sx={{ color: GREEN_UI.muted, fontWeight: 600 }}>
                  Projected Final Score
                </Typography>
                <Typography variant="h4" fontWeight={700} sx={{ color: previewScore >= 90 ? GREEN_UI.warningDark : GREEN_UI.greenDark, letterSpacing: "-0.04em" }}>
                  {previewScore.toFixed(2)}%
                </Typography>
              </Box>
              <Chip label={labelForScore(previewScore)} icon={previewScore >= 90 ? <EmojiEvents /> : <Grade />} variant="outlined" sx={ratingChipSx(previewScore)} />
            </Box>
          </Paper>
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: "#fbfff9", borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button onClick={() => setEvalDialogOpen(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitEvaluation}
            disabled={saving || !form.employee_id || criteria.length === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
            sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, "&:hover": { bgcolor: GREEN_UI.greenDark } }}
          >
            {saving ? "Submitting…" : "Submit Evaluation"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={criteriaDialogOpen} onClose={() => setCriteriaDialogOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
              <Box sx={{ width: 38, height: 38, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: GREEN_UI.greenSoft, color: GREEN_UI.greenDark }}>
                <Edit fontSize="small" />
              </Box>
              <Box>
                <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                  Manage Criteria
                </Typography>
                <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                  Update criteria weights and active scoring factors.
                </Typography>
              </Box>
            </Box>
            <Button size="small" variant="outlined" startIcon={<Add />} onClick={addNewCriterion} sx={{ ...pillButtonSx, borderColor: GREEN_UI.borderStrong, color: GREEN_UI.greenDark, bgcolor: "#ffffff", "&:hover": { bgcolor: GREEN_UI.greenSoft } }}>
              Add Criterion
            </Button>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: "#fbfff9" }}>
          <Alert severity="info" sx={{ mb: 2, borderRadius: "18px", border: `1px solid ${GREEN_UI.border}` }}>
            Current draft total weight: <strong>{criteriaDraft.reduce((s, c) => s + Number(c.weight || 0), 0).toFixed(2)}%</strong>. It must equal <strong>100%</strong>.
          </Alert>

          {criteriaDraft.map((c, i) => (
            <Paper key={c.criteria_id} elevation={0} sx={{ ...innerCardSx, p: 2, mb: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <Chip label={`#${i + 1}`} size="small" variant="outlined" sx={{ fontWeight: 600, bgcolor: "#ffffff", borderColor: GREEN_UI.border }} />
                <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1, color: GREEN_UI.text }}>{c.criteria_name}</Typography>
                <Tooltip title="Remove criterion">
                  <IconButton size="small" onClick={() => removeCriterion(i)} sx={{ color: GREEN_UI.dangerDark, bgcolor: "#fffafa", "&:hover": { bgcolor: GREEN_UI.dangerSoft } }}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField fullWidth label="Criterion Name" size="small" value={c.criteria_name} onChange={(e) => setCriteriaDraft((prev) => prev.map((x, j) => (j === i ? { ...x, criteria_name: e.target.value } : x)))} sx={softTextFieldSx} />
                </Grid>

                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField fullWidth label="Category" size="small" value={c.category} onChange={(e) => setCriteriaDraft((prev) => prev.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} sx={softTextFieldSx} />
                </Grid>

                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField
                    fullWidth
                    label="Weight (%)"
                    size="small"
                    type="number"
                    value={c.weight}
                    inputProps={{ min: 0, max: 100, step: 1 }}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                      setCriteriaDraft((prev) => prev.map((x, j) => (j === i ? { ...x, weight: v } : x)));
                    }}
                    sx={softTextFieldSx}
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField
                    fullWidth
                    label="Max Score"
                    size="small"
                    type="number"
                    value={c.max_score}
                    inputProps={{ min: 1, max: 100, step: 1 }}
                    onChange={(e) => {
                      const v = Math.max(1, Math.min(100, Number(e.target.value) || 100));
                      setCriteriaDraft((prev) => prev.map((x, j) => (j === i ? { ...x, max_score: v } : x)));
                    }}
                    sx={softTextFieldSx}
                  />
                </Grid>

                <Grid size={{ xs: 12, md: 9 }}>
                  <TextField fullWidth label="Description" size="small" multiline rows={2} value={c.description} onChange={(e) => setCriteriaDraft((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} sx={softTextFieldSx} />
                </Grid>
              </Grid>
            </Paper>
          ))}
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: "#fbfff9", borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button onClick={() => setCriteriaDialogOpen(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button variant="contained" startIcon={<Save />} onClick={saveCriteria} disabled={saving} sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, "&:hover": { bgcolor: GREEN_UI.greenDark } }}>
            Save Criteria
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dssDialogOpen} onClose={() => setDssDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle fontWeight={700} sx={dialogTitleSx}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: "14px", display: "grid", placeItems: "center", bgcolor: GREEN_UI.warningSoft, color: GREEN_UI.warningDark }}>
              <Insights fontSize="small" />
            </Box>
            <Box>
              <Typography fontWeight={700} sx={{ color: GREEN_UI.text }}>
                Generate Automated Ranking
              </Typography>
              <Typography variant="caption" sx={{ color: GREEN_UI.muted }}>
                Rank employees using submitted and approved evaluations.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: "#fbfff9" }}>
          <Alert severity="info" sx={{ mb: 2, borderRadius: "18px", border: `1px solid ${GREEN_UI.border}` }}>
            This will rank employees based on approved/submitted evaluations for the selected period.
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Period Start" type="date" value={dssPeriodStart} onChange={(e) => setDssPeriodStart(e.target.value)} InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Period End" type="date" value={dssPeriodEnd} onChange={(e) => setDssPeriodEnd(e.target.value)} InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>

            <Grid size={12}>
              <TextField fullWidth label="Period Label" value={dssPeriodLabel} onChange={(e) => setDssPeriodLabel(e.target.value)} placeholder="Example: May 2026 Performance Ranking" InputLabelProps={{ shrink: true }} sx={softTextFieldSx} />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: "#fbfff9", borderTop: `1px solid ${GREEN_UI.border}` }}>
          <Button onClick={() => setDssDialogOpen(false)} sx={{ ...pillButtonSx, color: GREEN_UI.muted }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleGenerateDss} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Insights />} sx={{ ...pillButtonSx, bgcolor: GREEN_UI.green, "&:hover": { bgcolor: GREEN_UI.greenDark } }}>
            {saving ? "Generating…" : "Generate"}
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
