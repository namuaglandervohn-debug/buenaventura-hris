import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  AddCircleOutline,
  AccessTime,
  Delete,
  Edit,
  LocationOn,
  Work,
  TuneOutlined,
} from "@mui/icons-material";
import { supabase } from "../../lib/supabaseClient";
import ActionSnackbar from "../ActionSnackbar";

interface JobPosting {
  id: string;
  title: string | null;
  department: string | null;
  location: string | null;
  employment_type: string | null;
  salary_range?: string | null;
  description?: string | null;
  qualifications?: string | null;
  responsibilities?: string | null;
  is_active: boolean;
  created_at?: string | null;
}

type JobForm = {
  title: string;
  department: string;
  location: string;
  employment_type: string;
  salary_range: string;
  description: string;
  qualifications: string;
  responsibilities: string;
};

type SnackbarState = {
  open: boolean;
  message: string;
  severity: "success" | "error" | "info" | "warning";
};

const EMPTY_FORM: JobForm = {
  title: "",
  department: "",
  location: "",
  employment_type: "Full-Time",
  salary_range: "",
  description: "",
  qualifications: "",
  responsibilities: "",
};

const JOB_TITLES = [
  "General Manager",
  "Assistant General Manager",
  "Operations Manager",
  "Front Office & Sales Supervisor",
  "Chef/Cook",
  "Commis Chef",
  "Dispatcher/Steward",
  "Public/Room Attendant",
  "Pool Attendant",
  "Laundry Attendant",
  "Gardener",
  "HR and Admin Manager",
  "Driver/Liaison",
  "Purchaser",
  "Stockman",
  "Accounting and Finance Manager",
  "Accounting Officer",
  "Finance Officer",
  "Compliance Officer",
  "Service Crew",
  "Sales Associate",
  "Cashier",
  "HR Assistant",
  "Security Guard",
  "Maintenance Staff",
];

const DEPARTMENTS = [
  "Management",
  "Operations",
  "Human Resource and Administration",
  "Accounting and Finance",
  "Restaurant",
  "Resort",
  "Café",
];

const EMPLOYMENT_TYPES = [
  "Full-Time",
  "Part-Time",
  "Contractual",
  "Internship",
];

const REQUIRED_FIELDS: Array<keyof JobForm> = [
  "title",
  "department",
  "location",
  "employment_type",
  "salary_range",
  "description",
];

const FIELD_LABELS: Record<keyof JobForm, string> = {
  title: "Job Title",
  department: "Department",
  location: "Location",
  employment_type: "Employment Type",
  salary_range: "Daily Rate",
  description: "Description",
  qualifications: "Qualifications",
  responsibilities: "Responsibilities",
};

function normalizeForm(form: JobForm) {
  return {
    title: form.title.trim(),
    department: form.department.trim(),
    location: form.location.trim(),
    employment_type: form.employment_type.trim(),
    salary_range: normalizeSalaryValue(form.salary_range) || null,
    description: form.description.trim(),
    qualifications: form.qualifications.trim() || null,
    responsibilities: form.responsibilities.trim() || null,
  };
}

function getMissingRequiredFields(form: JobForm) {
  return REQUIRED_FIELDS.filter((field) => !form[field].trim());
}

function formatSalaryInput(value: string) {
  const cleanedValue = value.replace(/,/g, "");

  return cleanedValue.replace(/\d+(?:\.\d*)?/g, (numberPart) => {
    const [wholeNumber, decimalPart] = numberPart.split(".");
    const formattedWholeNumber = wholeNumber.replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ",",
    );

    return decimalPart !== undefined
      ? `${formattedWholeNumber}.${decimalPart}`
      : formattedWholeNumber;
  });
}

function getSalaryLabel(salary?: string | null) {
  if (!salary?.trim()) return "Salary Negotiable";

  const formattedSalary = formatSalaryInput(salary.trim());
  return formattedSalary.includes("₱")
    ? formattedSalary
    : `₱ ${formattedSalary}`;
}

function normalizeSalaryValue(value: string) {
  return value.replace(/,/g, "").trim();
}

function formatSalary(salary?: string | null) {
  if (!salary?.trim()) return "Salary not set";
  const formattedSalary = formatSalaryInput(salary.trim());
  return formattedSalary.includes("₱")
    ? formattedSalary
    : `₱ ${formattedSalary}`;
}

function formatDate(date?: string | null) {
  if (!date) return "Recently added";

  try {
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(new Date(date));
  } catch {
    return "Recently added";
  }
}

const GREEN_UI = {
  pageBg:
    "radial-gradient(circle at top left, rgba(220, 246, 219, 0.95), rgba(248, 252, 245, 0.98) 34%, #f7fbf3 100%)",
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

const pageShellSx = {
  minHeight: "100%",
  p: { xs: 1.5, sm: 2.25, md: 3 },
  background: GREEN_UI.pageBg,
  color: GREEN_UI.text,
  borderRadius: { xs: 0, md: "32px" },
};

const heroCardSx = {
  ...softCardSx,
  position: "relative",
  overflow: "hidden",
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(239,250,235,0.96) 60%, rgba(225,248,224,0.94) 100%)",
  "&::before": {
    content: '""',
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: "50%",
    right: -90,
    top: -110,
    background: "rgba(76, 175, 80, 0.12)",
  },
  "&::after": {
    content: '""',
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: "50%",
    left: { xs: "70%", md: "44%" },
    bottom: -95,
    background: "rgba(174, 222, 144, 0.18)",
  },
};

const statGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    sm: "repeat(2, minmax(0, 1fr))",
    lg: "repeat(4, minmax(0, 1fr))",
  },
  gap: 1.5,
};

const statCardSx = {
  ...softCardSx,
  minHeight: 126,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  transition: "transform 180ms ease, box-shadow 180ms ease",
  "&:hover": {
    transform: "translateY(-3px)",
    boxShadow: "0 22px 48px rgba(43, 91, 55, 0.13)",
  },
};

const cardGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "repeat(2, minmax(0, 1fr))",
    xl: "repeat(3, minmax(0, 1fr))",
  },
  gap: { xs: 2, md: 2.5 },
  alignItems: "stretch",
};

const dialogGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "repeat(2, minmax(0, 1fr))",
  },
  gap: { xs: 2, sm: 2.5 },
  alignItems: "start",
};

const fullRowSx = {
  gridColumn: { xs: "1", md: "1 / -1" },
};

const dialogSectionSx = {
  p: { xs: 1.5, sm: 2 },
  borderRadius: "22px",
  border: `1px solid ${GREEN_UI.border}`,
  background:
    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(244,251,241,0.92))",
  boxShadow: "0 12px 28px rgba(43, 91, 55, 0.06)",
};

const dialogSectionTitleSx = {
  mb: 1.6,
  color: GREEN_UI.greenDark,
  fontWeight: 700,
  fontSize: "0.88rem",
  letterSpacing: "0.02em",
  textTransform: "uppercase",
};

const textFieldSx = {
  minWidth: 0,
  "& .MuiOutlinedInput-root": {
    borderRadius: "16px",
    backgroundColor: "#fbfef9",
    transition: "all 180ms ease",
    "& fieldset": { borderColor: GREEN_UI.border },
    "&:hover fieldset": { borderColor: GREEN_UI.borderStrong },
    "&.Mui-focused fieldset": { borderColor: GREEN_UI.green, borderWidth: 1.5 },
    "&.Mui-disabled": { backgroundColor: "#f6fbf4" },
  },
  "& .MuiInputLabel-root": { color: GREEN_UI.muted, fontWeight: 400 },
  "& .MuiInputLabel-root.Mui-focused": { color: GREEN_UI.greenDark },
  "& .MuiInputBase-input, & .MuiSelect-select": {
    color: GREEN_UI.text,
    fontWeight: 400,
  },
  "& .MuiInputBase-input::placeholder": { fontWeight: 400 },
  "& .MuiFormHelperText-root": { fontWeight: 400, lineHeight: 1.35 },
  "& .MuiInputBase-input.Mui-disabled": { WebkitTextFillColor: GREEN_UI.text },
};

const pillButtonSx = {
  textTransform: "none",
  fontWeight: 700,
  px: 2,
};

const greenButtonSx = {
  ...pillButtonSx,
  py: 1.1,
  bgcolor: GREEN_UI.green,
  boxShadow: "0 12px 24px rgba(58, 168, 101, 0.25)",
  "&:hover": {
    bgcolor: GREEN_UI.greenDark,
    boxShadow: "0 16px 28px rgba(31, 122, 70, 0.28)",
  },
  "&.Mui-disabled": {
    background: "rgba(0, 0, 0, 0.12)",
    boxShadow: "none",
  },
};

const outlineButtonSx = {
  ...pillButtonSx,
  borderColor: GREEN_UI.borderStrong,
  color: GREEN_UI.greenDark,
  bgcolor: "#ffffff",
  "&:hover": {
    borderColor: GREEN_UI.green,
    backgroundColor: GREEN_UI.greenSoft,
  },
};

export default function JobPostingManagement() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [form, setForm] = useState<JobForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [snackbar, setSnackbar] = useState<SnackbarState>({
    open: false,
    message: "",
    severity: "success",
  });

  const missingFields = useMemo(() => getMissingRequiredFields(form), [form]);

  const jobStats = useMemo(() => {
    const active = jobs.filter((job) => job.is_active).length;
    const inactive = jobs.length - active;
    const departments = new Set(
      jobs
        .map((job) => job.department?.trim())
        .filter((department): department is string => Boolean(department)),
    ).size;

    return {
      total: jobs.length,
      active,
      inactive,
      departments,
    };
  }, [jobs]);

  const showSnackbar = useCallback(
    (message: string, severity: SnackbarState["severity"] = "success") => {
      setSnackbar({ open: true, message, severity });
    },
    [],
  );

  const fetchJobs = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("job_postings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setJobs((data as JobPosting[]) || []);
    } catch (error: any) {
      showSnackbar(error?.message || "Failed to load job postings.", "error");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [showSnackbar]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handleOpenCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSubmitted(false);
    setOpen(true);
  };

  const handleCloseDialog = () => {
    if (saving) return;
    setOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setSubmitted(false);
  };

  const handleEdit = (job: JobPosting) => {
    setEditing(job);
    setSubmitted(false);

    setForm({
      title: job.title ?? "",
      department: job.department ?? "",
      location: job.location ?? "",
      employment_type: job.employment_type ?? "Full-Time",
      salary_range: formatSalaryInput(job.salary_range ?? ""),
      description: job.description ?? "",
      qualifications: job.qualifications ?? "",
      responsibilities: job.responsibilities ?? "",
    });

    setOpen(true);
  };

  const updateFormField = (field: keyof JobForm, value: string) => {
    const nextValue =
      field === "salary_range" ? formatSalaryInput(value) : value;
    setForm((prev) => ({ ...prev, [field]: nextValue }));
  };

  const hasFieldError = (field: keyof JobForm) =>
    submitted && REQUIRED_FIELDS.includes(field) && !form[field].trim();

  const handleSave = async () => {
    setSubmitted(true);

    const missing = getMissingRequiredFields(form);
    if (missing.length > 0) {
      showSnackbar(
        `Please complete: ${missing.map((field) => FIELD_LABELS[field]).join(", ")}.`,
        "warning",
      );
      return;
    }

    setSaving(true);

    try {
      const payload = normalizeForm(form);

      if (editing) {
        const { data, error } = await supabase
          .from("job_postings")
          .update(payload)
          .eq("id", editing.id)
          .select("*")
          .single();

        if (error) throw error;

        setJobs((prev) =>
          prev.map((job) =>
            job.id === editing.id ? (data as JobPosting) : job,
          ),
        );

        showSnackbar("Job posting updated successfully.");
      } else {
        const { data, error } = await supabase
          .from("job_postings")
          .insert({
            ...payload,
            is_active: true,
          })
          .select("*")
          .single();

        if (error) throw error;

        setJobs((prev) => [data as JobPosting, ...prev]);
        showSnackbar("Job posting created successfully.");
      }

      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setSubmitted(false);
    } catch (error: any) {
      showSnackbar(error?.message || "Failed to save job posting.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        "Permanently delete this job posting? This cannot be undone.",
      )
    ) {
      return;
    }

    setBusyJobId(id);

    try {
      const { error } = await supabase
        .from("job_postings")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setJobs((prev) => prev.filter((job) => job.id !== id));
      showSnackbar("Job posting deleted permanently.");
    } catch (error: any) {
      showSnackbar(error?.message || "Failed to delete job posting.", "error");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleToggleActive = async (job: JobPosting) => {
    const newStatus = !job.is_active;
    setBusyJobId(job.id);

    try {
      const { data, error } = await supabase
        .from("job_postings")
        .update({ is_active: newStatus })
        .eq("id", job.id)
        .select("*")
        .single();

      if (error) throw error;

      setJobs((prev) =>
        prev.map((item) => (item.id === job.id ? (data as JobPosting) : item)),
      );

      showSnackbar(
        `Job posting ${newStatus ? "activated" : "deactivated"} successfully.`,
      );
    } catch (error: any) {
      showSnackbar(
        error?.message || "Failed to update job posting status.",
        "error",
      );
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <Box sx={pageShellSx}>
      <Stack spacing={{ xs: 2.2, md: 3 }}>
        <Card sx={heroCardSx} elevation={0}>
          <CardContent
            sx={{
              position: "relative",
              zIndex: 1,
              p: { xs: 2, sm: 2.75, md: 3.25 },
            }}
          >
            <Stack
              direction={{ xs: "column", md: "row" }}
              alignItems={{ xs: "stretch", md: "center" }}
              justifyContent="space-between"
              spacing={2.5}
            >
              <Box sx={{ maxWidth: 680 }}>
                <Chip
                  icon={<TuneOutlined fontSize="small" />}
                  label="Recruitment Control Panel"
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
                    color: GREEN_UI.text,
                    letterSpacing: "-0.04em",
                    fontSize: { xs: "1.55rem", sm: "2rem", md: "2.35rem" },
                    lineHeight: 1.05,
                  }}
                >
                  Job Posting Management
                </Typography>

                <Typography variant="body2" sx={{ color: GREEN_UI.muted, maxWidth: 650, lineHeight: 1.7 }}>
                  Create, update, and publish open positions using a clean
                  career-board layout inspired by the soft green dashboard
                  design.
                </Typography>
              </Box>

              <Button
                variant="contained"
                startIcon={<AddCircleOutline />}
                onClick={handleOpenCreate}
                sx={{
                  ...greenButtonSx,
                  borderRadius: "12px",
                  width: { xs: "100%", sm: "auto" },
                  minHeight: 46,
                  whiteSpace: "nowrap",
                }}
              >
                Create New Job Posting
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Box sx={statGridSx}>
          {[
            {
              label: "Total Postings",
              value: jobStats.total,
              helper: "All saved job posts",
            },
            {
              label: "Active Openings",
              value: jobStats.active,
              helper: "Visible to applicants",
            },
            {
              label: "Inactive Posts",
              value: jobStats.inactive,
              helper: "Hidden or paused",
            },
            {
              label: "Departments",
              value: jobStats.departments,
              helper: "With available roles",
            },
          ].map((stat) => (
            <Card key={stat.label} sx={statCardSx} elevation={0}>
              <CardContent sx={{ p: { xs: 2, sm: 2.4 } }}>
                <Stack direction="row" alignItems="center" spacing={1.4}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      borderRadius: "16px",
                      display: "grid",
                      placeItems: "center",
                      color: GREEN_UI.greenDark,
                      background:
                        "linear-gradient(135deg, rgba(216, 247, 222, 0.95), rgba(240, 250, 237, 0.95))",
                      boxShadow: "inset 0 0 0 1px rgba(109, 190, 126, 0.18)",
                    }}
                  >
                    <Work fontSize="small" />
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        color: GREEN_UI.muted,
                        fontWeight: 600,
                        fontSize: "0.78rem",
                      }}
                    >
                      {stat.label}
                    </Typography>
                    <Typography
                      variant="h4"
                      fontWeight={600}
                      sx={{
                        color: GREEN_UI.text,
                        lineHeight: 1.05,
                        letterSpacing: "-0.04em",
                      }}
                    >
                      {loading ? "—" : stat.value}
                    </Typography>
                    <Typography
                      sx={{ color: GREEN_UI.muted, fontSize: "0.82rem" }}
                    >
                      {stat.helper}
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Box>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={1.5}
          sx={{
            px: { xs: 0.4, sm: 0.6 },
          }}
        >
          <Box>
            <Typography
              fontWeight={600}
              sx={{
                color: "#1E2B22",
                fontSize: { xs: "1.15rem", sm: "1.35rem" },
              }}
            >
              Available Career Posts
            </Typography>
            <Typography sx={{ color: "#7F907F", fontSize: "0.92rem" }}>
              Review each listing, then edit, delete, activate, or pause when
              needed.
            </Typography>
          </Box>
        </Stack>

        {loading ? (
          <Box sx={cardGridSx}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Card
                key={index}
                sx={{
                  borderRadius: "26px",
                  height: "100%",
                  border: "1px solid rgba(214, 233, 213, 0.9)",
                  background: "rgba(255,255,255,0.86)",
                  boxShadow: "0 18px 38px rgba(53, 113, 74, 0.08)",
                }}
                elevation={0}
              >
                <CardContent sx={{ p: { xs: 2.2, sm: 3 } }}>
                  <Stack spacing={1.5}>
                    <Skeleton
                      variant="rounded"
                      width={90}
                      height={28}
                      sx={{ borderRadius: 4 }}
                    />
                    <Skeleton variant="text" width="75%" height={38} />
                    <Skeleton
                      variant="rounded"
                      width="100%"
                      height={86}
                      sx={{ borderRadius: 2 }}
                    />
                    <Divider sx={{ my: 1 }} />
                    <Skeleton variant="text" width="95%" />
                    <Skeleton variant="text" width="85%" />
                    <Stack direction="row" spacing={1}>
                      <Skeleton
                        variant="rounded"
                        width={72}
                        height={36}
                        sx={{ borderRadius: 5 }}
                      />
                      <Skeleton
                        variant="rounded"
                        width={72}
                        height={36}
                        sx={{ borderRadius: 5 }}
                      />
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : jobs.length === 0 ? (
          <Card
            sx={{
              borderRadius: "26px",
              border: `1px solid ${GREEN_UI.border}`,
              background:
                "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(240,250,237,0.94))",
              boxShadow: "0 20px 44px rgba(53, 113, 74, 0.09)",
            }}
            elevation={0}
          >
            <CardContent sx={{ p: { xs: 3, sm: 5 }, textAlign: "center" }}>
              <Box
                sx={{
                  width: 74,
                  height: 74,
                  mx: "auto",
                  mb: 2,
                  borderRadius: 25,
                  display: "grid",
                  placeItems: "center",
                  color: "#27824D",
                  background: "rgba(218, 246, 224, 0.9)",
                  boxShadow: "inset 0 0 0 1px rgba(87, 177, 105, 0.18)",
                }}
              >
                <Work />
              </Box>

              <Typography
                variant="h6"
                fontWeight={600}
                sx={{ color: "#1E2B22" }}
              >
                No job postings found
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.8, mb: 3 }}>
                Create your first job posting to display available career
                opportunities.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          <Box sx={cardGridSx}>
            {jobs.map((job) => {
              const isBusy = busyJobId === job.id;

              return (
                <Card
                  key={job.id}
                  elevation={0}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    position: "relative",
                    overflow: "hidden",
                    borderRadius: 2,
                    border: "1px solid rgba(214, 233, 213, 0.95)",
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,252,247,0.96) 100%)",
                    boxShadow: "0 20px 45px rgba(53, 113, 74, 0.10)",
                    transition:
                      "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      inset: "0 0 auto 0",
                      height: 6,
                      background: job.is_active
                        ? "linear-gradient(90deg, #32A860, #A3E5AA)"
                        : "linear-gradient(90deg, #AAB5AA, #E6ECE3)",
                    },
                    "&:hover": {
                      transform: "translateY(-4px)",
                      boxShadow: "0 26px 58px rgba(53, 113, 74, 0.16)",
                      borderColor: "rgba(142, 209, 151, 0.8)",
                    },
                  }}
                >
                  <CardContent
                    sx={{
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      p: { xs: 2.2, sm: 2.7 },
                      minWidth: 0,
                    }}
                  >
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="flex-start"
                      spacing={1.2}
                      sx={{ mb: 2 }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Chip
                          label={job.is_active ? "Active" : "Inactive"}
                          size="small"
                          sx={{
                            mb: 1.2,
                            fontWeight: 700,
                            color: job.is_active ? "#1E7B45" : "#6D786D",
                            backgroundColor: job.is_active
                              ? "rgba(216, 247, 222, 0.95)"
                              : "rgba(235, 239, 234, 0.95)",
                          }}
                        />

                        <Typography
                          variant="h5"
                          fontWeight={600}
                          sx={{
                            color: GREEN_UI.text,
                            fontSize: { xs: "1.18rem", sm: "1.35rem" },
                            letterSpacing: "-0.025em",
                            lineHeight: 1.16,
                            wordBreak: "break-word",
                          }}
                        >
                          {job.title || "Untitled Job"}
                        </Typography>

                        <Typography
                          sx={{
                            mt: 0.8,
                            color: "#899889",
                            fontSize: "0.85rem",
                            fontWeight: 700,
                          }}
                        >
                          Posted {formatDate(job.created_at)}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          width: 44,
                          height: 44,
                          flex: "0 0 auto",
                          borderRadius: "16px",
                          display: "grid",
                          placeItems: "center",
                          color: "#2D8650",
                          background:
                            "linear-gradient(135deg, rgba(221, 248, 226, 0.95), rgba(244, 251, 241, 0.95))",
                          boxShadow: "inset 0 0 0 1px rgba(91, 180, 108, 0.18)",
                        }}
                      >
                        <Work fontSize="small" />
                      </Box>
                    </Stack>

                    <Stack
                      spacing={1}
                      sx={{
                        p: 1.4,
                        mb: 2,
                        borderRadius: 1.5,
                        backgroundColor: "rgba(244, 250, 242, 0.9)",
                        border: "1px solid rgba(223, 236, 222, 0.9)",
                      }}
                    >
                      <Typography
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          color: "#627363",
                          wordBreak: "break-word",
                        }}
                      >
                        <Work fontSize="small" sx={{ color: "#3B9C5E" }} />
                        <Box component="span">
                          <strong>Department:</strong>{" "}
                          {job.department || "Not specified"}
                        </Box>
                      </Typography>

                      <Typography
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          color: "#627363",
                          wordBreak: "break-word",
                        }}
                      >
                        <LocationOn
                          fontSize="small"
                          sx={{ color: "#3B9C5E" }}
                        />
                        <Box component="span">
                          <strong>Location:</strong>{" "}
                          {job.location || "Not specified"}
                        </Box>
                      </Typography>

                      <Typography
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          color: "#627363",
                          wordBreak: "break-word",
                        }}
                      >
                        <AccessTime
                          fontSize="small"
                          sx={{ color: "#3B9C5E" }}
                        />
                        <Box component="span">
                          <strong>Type:</strong>{" "}
                          {job.employment_type || "Not specified"}
                        </Box>
                      </Typography>
                    </Stack>

                    <Stack
                      direction="row"
                      flexWrap="wrap"
                      gap={1}
                      sx={{ mb: 2 }}
                    >
                      <Typography
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          color: "#166534",
                          fontWeight: 600,
                          wordBreak: "break-word",
                        }}
                      >
                        <strong>Salary:</strong>
                      </Typography>
                      <Chip
                        label={formatSalary(job.salary_range)}
                        size="small"
                        sx={{
                          fontWeight: 700,
                          color: "#166534",
                          backgroundColor: "rgba(220, 247, 226, 0.9)",
                          border: "1px solid rgba(86, 188, 112, 0.22)",
                        }}
                      />

                      {job.employment_type && (
                        <Chip
                          label={job.employment_type}
                          size="small"
                          variant="outlined"
                          sx={{
                            color: "#55705A",
                            fontWeight: 600,
                            borderColor: "rgba(135, 174, 140, 0.45)",
                          }}
                        />
                      )}
                    </Stack>

                    <Divider
                      sx={{ borderColor: "rgba(214, 233, 213, 0.85)", mb: 2 }}
                    />

                    <Typography
                      fontWeight={600}
                      sx={{
                        mb: 0.8,
                        color: "#1F2F23",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      Job Description
                    </Typography>
                    <Typography
                      sx={{
                        mb: 2.5,
                        flexGrow: 1,
                        color: "#6E806F",
                        wordBreak: "break-word",
                        lineHeight: 1.72,
                        display: "-webkit-box",
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {job.description || "No description provided."}
                    </Typography>

                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      sx={{ mt: "auto", pt: 1 }}
                    >
                      <Button
                        fullWidth={isMobile}
                        variant="outlined"
                        startIcon={<Edit />}
                        onClick={() => handleEdit(job)}
                        disabled={isBusy}
                        sx={outlineButtonSx}
                      >
                        Edit
                      </Button>

                      <Button
                        fullWidth={isMobile}
                        color="error"
                        variant="outlined"
                        startIcon={<Delete />}
                        onClick={() => handleDelete(job.id)}
                        disabled={isBusy}
                        sx={{
                          ...pillButtonSx,
                          borderColor: "rgba(211, 80, 80, 0.34)",
                          "&:hover": {
                            borderColor: "#D34F4F",
                            backgroundColor: "rgba(255, 235, 235, 0.65)",
                          },
                        }}
                      >
                        Delete
                      </Button>

                      <Button
                        fullWidth={isMobile}
                        color={job.is_active ? "warning" : "success"}
                        variant="outlined"
                        onClick={() => handleToggleActive(job)}
                        disabled={isBusy}
                        sx={{
                          ...pillButtonSx,
                          whiteSpace: "nowrap",
                          borderColor: job.is_active
                            ? "rgba(214, 151, 63, 0.42)"
                            : "rgba(73, 168, 96, 0.42)",
                          backgroundColor: isBusy
                            ? "transparent"
                            : job.is_active
                              ? "rgba(255, 248, 226, 0.48)"
                              : "rgba(229, 249, 233, 0.48)",
                        }}
                      >
                        {isBusy
                          ? "Updating..."
                          : job.is_active
                            ? "Set Inactive"
                            : "Set Active"}
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        )}
      </Stack>

      <Dialog
        open={open}
        onClose={handleCloseDialog}
        maxWidth="lg"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: "30px" },
            width: { xs: "100%", sm: "min(920px, calc(100% - 48px))" },
            m: { xs: 0, sm: 2 },
            overflow: "hidden",
            border: `1px solid ${GREEN_UI.border}`,
            background: "#fbfff9",
            boxShadow: "0 28px 70px rgba(27, 73, 37, 0.18)",
          },
        }}
      >
        <DialogTitle
          sx={{
            px: { xs: 2.5, sm: 3.2 },
            py: 2.4,
            borderBottom: `1px solid ${GREEN_UI.border}`,
            background: "linear-gradient(135deg, #ffffff 0%, #eef9ea 100%)",
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1.4}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: "16px",
                display: "grid",
                placeItems: "center",
                color: "#27824D",
                backgroundColor: "rgba(218, 246, 224, 0.9)",
              }}
            >
              <Work fontSize="small" />
            </Box>

            <Box>
              <Typography
                fontWeight={600}
                sx={{ color: "#1E2B22", fontSize: "1.2rem" }}
              >
                {editing ? "Edit Job Posting" : "Create Job Posting"}
              </Typography>
              <Typography sx={{ color: "#7F907F", fontSize: "0.86rem" }}>
                Keep the listing clear, complete, and ready for applicants.
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent
          dividers
          sx={{ px: { xs: 2.5, sm: 3.2 }, py: { xs: 2.5, sm: 3 } }}
        >
          <Stack spacing={2.2}>
            <Box sx={dialogSectionSx}>
              <Typography sx={dialogSectionTitleSx}>
                I. Job Information
              </Typography>
              <Box sx={dialogGridSx}>
                <TextField
                  fullWidth
                  required
                  select
                  label="Job Title"
                  value={form.title}
                  error={hasFieldError("title")}
                  helperText={
                    hasFieldError("title") ? "Job title is required." : " "
                  }
                  onChange={(e) => updateFormField("title", e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={textFieldSx}
                >
                  <MenuItem value="" sx={{ fontWeight: 400 }}>
                    Select Job Title...
                  </MenuItem>
                  {JOB_TITLES.map((title) => (
                    <MenuItem
                      key={title}
                      value={title}
                      sx={{ fontWeight: 400 }}
                    >
                      {title}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  fullWidth
                  required
                  select
                  label="Department"
                  value={form.department}
                  error={hasFieldError("department")}
                  helperText={
                    hasFieldError("department")
                      ? "Department is required."
                      : " "
                  }
                  onChange={(e) =>
                    updateFormField("department", e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={textFieldSx}
                >
                  <MenuItem value="" sx={{ fontWeight: 400 }}>
                    Select Department...
                  </MenuItem>
                  {DEPARTMENTS.map((dept) => (
                    <MenuItem key={dept} value={dept} sx={{ fontWeight: 400 }}>
                      {dept}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  fullWidth
                  required
                  label="Location"
                  value={form.location}
                  error={hasFieldError("location")}
                  helperText={
                    hasFieldError("location") ? "Location is required." : " "
                  }
                  onChange={(e) => updateFormField("location", e.target.value)}
                  sx={textFieldSx}
                />

                <TextField
                  fullWidth
                  required
                  select
                  label="Employment Type"
                  value={form.employment_type}
                  error={hasFieldError("employment_type")}
                  helperText={
                    hasFieldError("employment_type")
                      ? "Employment type is required."
                      : " "
                  }
                  onChange={(e) =>
                    updateFormField("employment_type", e.target.value)
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={textFieldSx}
                >
                  <MenuItem value="" sx={{ fontWeight: 400 }}>
                    Select Employment Type...
                  </MenuItem>
                  {EMPLOYMENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type} sx={{ fontWeight: 400 }}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  fullWidth
                  required
                  label="Daily Rate"
                  value={form.salary_range}
                  error={hasFieldError("salary_range")}
                  helperText={
                    hasFieldError("salary_range")
                      ? "Salary rate is required for payroll computation."
                      : ""
                  }
                  onChange={(e) =>
                    updateFormField("salary_range", e.target.value)
                  }
                  sx={{ ...textFieldSx}}
                />
              </Box>
            </Box>

            <Box sx={dialogSectionSx}>
              <Typography sx={dialogSectionTitleSx}>II. Job Details</Typography>
              <Box sx={dialogGridSx}>
                <TextField
                  fullWidth
                  required
                  multiline
                  minRows={3}
                  label="Description"
                  value={form.description}
                  error={hasFieldError("description")}
                  helperText={
                    hasFieldError("description")
                      ? "Description is required."
                      : " "
                  }
                  onChange={(e) =>
                    updateFormField("description", e.target.value)
                  }
                  sx={{ ...textFieldSx, ...fullRowSx }}
                />
              </Box>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions
          sx={{
            flexDirection: { xs: "column-reverse", sm: "row" },
            gap: 1,
            px: { xs: 2.5, sm: 3.2 },
            py: 2.2,
            borderTop: `1px solid ${GREEN_UI.border}`,
            backgroundColor: "#fbfff9",
          }}
        >
          <Button
            fullWidth={isMobile}
            onClick={handleCloseDialog}
            disabled={saving}
            sx={{
              ...outlineButtonSx,
              borderColor: "transparent",
            }}
          >
            Cancel
          </Button>

          <Button
            fullWidth={isMobile}
            variant="contained"
            onClick={handleSave}
            disabled={saving || (submitted && missingFields.length > 0)}
            startIcon={
              saving ? <CircularProgress color="inherit" size={16} /> : null
            }
            sx={{
              ...greenButtonSx,
              minWidth: 116,
              minHeight: 42,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      />
    </Box>
  );
}
