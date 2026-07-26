import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Grid,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  Divider,
  Paper,
  Stack,
  Container,
  useMediaQuery,
  useTheme,
  InputAdornment,
} from "@mui/material";
import {
  Work,
  LocationOn,
  Edit,
  Campaign,
  Business,
  Login,
  Search,
  AssignmentTurnedIn,
  TrackChanges,
  Groups,
  Restaurant,
  Pool,
  LocalCafe,
  ArrowForward,
  CheckCircle,
  MenuBook,
  Spa,
} from "@mui/icons-material";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import ActionSnackbar from "../ActionSnackbar";

interface JobPosting {
  id: string;
  title: string;
  department: string;
  location: string;
  employment_type: string;
  salary_range: string;
  description: string;
  qualifications: string;
  responsibilities: string;
  is_active: boolean;
  created_at?: string;
}

const EMPTY_FORM = {
  title: "",
  department: "",
  location: "",
  employment_type: "Full-Time",
  salary_range: "",
  description: "",
  qualifications: "",
  responsibilities: "",
};

const showcaseImages = [
  {
    title: "Maria Clara Restaurant",
    label: "Food & Beverage",
    url: '/images/bg1.jpg',
  },
  {
    title: "Maria Clara Resort",
    label: "Guest Experience",
    url: '/images/bg3.jpg',
  },
  {
    title: "Café Buenaventura",
    label: "Coffee & Snacks",
    url: '/images/bg2.jpg',
  },
];

const galleryImages = [
  '/images/bg1.jpg',
  '/images/bg2.jpg',
  '/images/bg3.jpg',
  '/images/bg1.jpg',
];

const brochureItems = [
  {
    icon: <Restaurant />,
    title: "Maria Clara Restaurant",
    subtitle: "A warm dining workplace built around service, teamwork, and guest care.",
  },
  {
    icon: <Pool />,
    title: "Maria Clara Resort",
    subtitle: "A hospitality environment for people who enjoy welcoming and assisting guests.",
  },
  {
    icon: <LocalCafe />,
    title: "Café Buenaventura",
    subtitle: "A cozy, modern café setting for service-oriented and detail-focused team members.",
  },
];

const cultureHighlights = [
  "Supportive team culture",
  "Growth-centered environment",
  "Professional service standards",
  "Workplace with purpose",
];

function formatSalaryInput(value: string) {
  const cleanedValue = value.replace(/,/g, "");

  return cleanedValue.replace(/\d+(?:\.\d*)?/g, (numberPart) => {
    const [wholeNumber, decimalPart] = numberPart.split(".");
    const formattedWholeNumber = wholeNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    return decimalPart !== undefined
      ? `${formattedWholeNumber}.${decimalPart}`
      : formattedWholeNumber;
  });
}

function normalizeSalaryValue(value: string) {
  return value.replace(/,/g, "").trim();
}

function getSalaryLabel(salary?: string | null) {
  if (!salary?.trim()) return "Salary Negotiable";

  const formattedSalary = formatSalaryInput(salary.trim());
  return formattedSalary.includes("₱") ? formattedSalary : `₱ ${formattedSalary}`;
}

export default function LandingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<JobPosting | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState("");
  const [heroSlide, setHeroSlide] = useState(0);

  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "success" as "success" | "error",
  });

  const fetchJobs = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("job_postings")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setJobs(data ?? []);

    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroSlide((current) => (current + 1) % showcaseImages.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  const filteredJobs = jobs.filter((job) =>
    `${job.title} ${job.department} ${job.location} ${job.employment_type}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingJob(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setOpenDialog(true);
  };

  const handleEdit = (job: JobPosting) => {
    setEditingJob(job);
    setForm({
      title: job.title,
      department: job.department,
      location: job.location,
      employment_type: job.employment_type,
      salary_range: formatSalaryInput(job.salary_range ?? ""),
      description: job.description,
      qualifications: job.qualifications,
      responsibilities: job.responsibilities,
    });
    setOpenDialog(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const payload = {
        ...form,
        salary_range: normalizeSalaryValue(form.salary_range),
      };

      if (editingJob) {
        const { error } = await supabase
          .from("job_postings")
          .update(payload)
          .eq("id", editingJob.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("job_postings")
          .insert({ ...payload, is_active: true });

        if (error) throw error;
      }

      setSnackbar({
        open: true,
        message: editingJob ? "Job posting updated successfully!" : "Job posting created successfully!",
        severity: "success",
      });

      setOpenDialog(false);
      resetForm();
      fetchJobs();
    } catch (e: any) {
      setSnackbar({ open: true, message: e.message, severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm("Deactivate this job posting?")) return;

    const { error } = await supabase
      .from("job_postings")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      setSnackbar({ open: true, message: error.message, severity: "error" });
      return;
    }

    setSnackbar({
      open: true,
      message: "Job posting removed successfully!",
      severity: "success",
    });

    fetchJobs();
  };

  const handleApplyForPosition = (job: JobPosting) => {
    const selectedPosition = encodeURIComponent(job.title.trim());
    navigate(`/apply?position=${selectedPosition}`);
  };

  const handleEmployeeLogin = () => {
    if (user) logout();
    navigate("/login?fresh=1");
  };

  const navButtonSx = {
    color: "#23372b",
    fontWeight: 800,
    textTransform: "none",
    borderRadius: '12px',
    px: 2,
    "&:hover": {
      bgcolor: "rgba(31,122,71,0.08)",
      color: "#1F7A47",
    },
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(63,164,106,0.18) 0, transparent 32%), linear-gradient(180deg, #f7fbf6 0%, #eef8f0 44%, #ffffff 100%)",
        color: "#102016",
        overflowX: "hidden",
      }}
    >
      {/* NAVBAR */}
      <Box
        component="nav"
        sx={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1300,
          background: "rgba(255,255,255,0.86)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(31,122,71,0.12)",
          boxShadow: "0 14px 40px rgba(15,23,42,0.08)",
        }}
      >
        <Container maxWidth="xl">
          <Box
            sx={{
              height: { xs: 72, md: 82 },
              py: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: { xs: 44, sm: 50 },
                  height: { xs: 44, sm: 50 },
                  borderRadius: "18px",
                  background:
                    "linear-gradient(145deg, #1F7A47 0%, #58b97a 52%, #d8b86f 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 16px 34px rgba(31,122,71,0.28)",
                  flexShrink: 0,
                }}
              >
                <Business sx={{ color: "#fff" }} />
              </Box>

              <Box sx={{ minWidth: 0 }}>
                <Typography
                  fontWeight={950}
                  sx={{
                    color: "#174f32",
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                    fontSize: { xs: "0.95rem", sm: "1.08rem" },
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  Buenaventura Estate
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "#6b7a70", display: { xs: "none", sm: "block" } }}
                >
                  Careers • HRIS Applicant Portal
                </Typography>
              </Box>
            </Stack>

            <Stack
              direction="row"
              spacing={0.75}
              sx={{
                display: { xs: "none", md: "flex" },
                bgcolor: "rgba(255,255,255,0.66)",
                border: "1px solid rgba(31,122,71,0.10)",
                borderRadius: '12px',
                p: 0.5,
              }}
            >
              <Button sx={navButtonSx} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                Home
              </Button>
              <Button sx={navButtonSx} onClick={() => document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth" })}>
                Jobs
              </Button>
              <Button sx={navButtonSx} onClick={() => document.getElementById("experience")?.scrollIntoView({ behavior: "smooth" })}>
                Experience
              </Button>
              <Button sx={navButtonSx} onClick={() => navigate("/apply")}>
                Apply
              </Button>
              <Button sx={navButtonSx} onClick={() => navigate("/track")}>
                Track
              </Button>
            </Stack>

            <Button
              variant="contained"
              startIcon={<Login />}
              onClick={handleEmployeeLogin}
              sx={{
                px: { xs: 1.8, sm: 3 },
                py: 1.15,
                fontWeight: 900,
                textTransform: "none",
                background: "linear-gradient(135deg, #154f31 0%, #1F7A47 55%, #41a767 100%)",
                boxShadow: "0 14px 30px rgba(31,122,71,0.28)",
                whiteSpace: "nowrap",
                fontSize: { xs: "0.76rem", sm: "0.875rem" },
                "&:hover": {
                  boxShadow: "0 18px 34px rgba(31,122,71,0.34)",
                },
              }}
            >
              Employee Login
            </Button>
          </Box>
        </Container>
      </Box>

      <Box aria-hidden="true" sx={{ height: { xs: 72, md: 82 } }} />

      {/* HERO */}
      <Box
        sx={{
          position: "relative",
          pt: { xs: 5, sm: 7, md: 10 },
          pb: { xs: 8, md: 12 },
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(18,85,48,0.08), transparent 35%), radial-gradient(circle at 86% 14%, rgba(216,184,111,0.34), transparent 24%)",
            pointerEvents: "none",
          }}
        />
        <Container maxWidth="xl" sx={{ position: "relative" }}>
          <Grid container spacing={{ xs: 5, md: 7 }} alignItems="center">
            <Grid size={{ xs: 12, md: 6.5 }}>
              <Chip
                icon={<Campaign />}
                label="Now Hiring • Build your future with us"
                sx={{
                  mb: 3,
                  bgcolor: "rgba(31,122,71,0.10)",
                  color: "#1F7A47",
                  border: "1px solid rgba(31,122,71,0.16)",
                  fontWeight: 900,
                  px: 1,
                }}
              />

              <Typography
                sx={{
                  fontSize: { xs: "2.5rem", sm: "3.8rem", md: "5.4rem" },
                  lineHeight: { xs: 1.02, md: 0.95 },
                  fontWeight: 950,
                  letterSpacing: "-0.07em",
                  mb: 3,
                  maxWidth: 860,
                  color: "#102016",
                }}
              >
                A workplace that feels like a place to growww.
              </Typography>

              <Typography
                sx={{
                  maxWidth: 690,
                  fontSize: { xs: "1rem", md: "1.18rem" },
                  lineHeight: 1.9,
                  color: "#53645a",
                  mb: 4,
                }}
              >
                Discover career opportunities at Buenaventura Estate, submit your application online,
                and track your status.
              </Typography>

              <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 4 }}>
                
                <Button
                  size="large"
                  variant="contained"
                  startIcon={<AssignmentTurnedIn />}
                  endIcon={<ArrowForward />}
                  onClick={() => navigate("/apply")}
                  fullWidth={isMobile}
                  sx={{
                    px: 4,
                    py: 1.55,
                    fontWeight: 950,
                    textTransform: "none",
                    background: "linear-gradient(135deg, #154f31 0%, #1F7A47 60%, #4fb474 100%)",
                    boxShadow: "0 18px 36px rgba(31,122,71,0.28)",
                  }}
                >
                  Click here to Apply for Job
                </Button>

                <Button
                  size="large"
                  variant="outlined"
                  startIcon={<TrackChanges />}
                  onClick={() => navigate("/track")}
                  fullWidth={isMobile}
                  sx={{
                    px: 4,
                    py: 1.55,
                    fontWeight: 950,
                    textTransform: "none",
                    color: "#174f32",
                    borderColor: "rgba(31,122,71,0.28)",
                    bgcolor: "rgba(255,255,255,0.70)",
                    "&:hover": {
                      borderColor: "#1F7A47",
                      bgcolor: "rgba(31,122,71,0.07)",
                    },
                  }}
                >
                  Track Application
                </Button>
              </Stack>

              <Grid
                container
                spacing={1.5}
                justifyContent="center"
                sx={{ maxWidth: 720, mx: "auto" }}
              >
                {[
                  { value: jobs.length || "Open", label: "Active postings" },
                  { value: "3", label: "Workplace areas" },
                  { value: "Fast", label: "Online process" },
                ].map((stat) => (
                  <Grid key={stat.label} size={{ xs: 12, sm: 4 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        p: 2,
                        borderRadius: 2,
                        bgcolor: "rgba(255,255,255,0.72)",
                        border: "1px solid rgba(31,122,71,0.10)",
                        boxShadow: "0 16px 34px rgba(15,23,42,0.06)",
                      }}
                    >
                      <Typography fontWeight={950} sx={{ color: "#1F7A47", fontSize: "1.35rem" }}>
                        {stat.value}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#68786f", fontWeight: 700 }}>
                        {stat.label}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Grid>

            <Grid size={{ xs: 12, md: 5.5 }}>
              <Box
                sx={{
                  position: "relative",
                  minHeight: { xs: 430, sm: 520, md: 620 },
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  perspective: 1200,
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    width: { xs: 280, sm: 390, md: 460 },
                    height: { xs: 330, sm: 430, md: 520 },
                    borderRadius: { xs: "34px", md: "54px" },
                    background:
                      "radial-gradient(circle at 50% 12%, rgba(216,184,111,0.34), transparent 42%), rgba(31,122,71,0.08)",
                    filter: "blur(2px)",
                    transform: "translateY(18px)",
                  }}
                />

                {showcaseImages.map((item, index) => {
                  const position = (index - heroSlide + showcaseImages.length) % showcaseImages.length;
                  const isCenter = position === 0;
                  const isRight = position === 1;

                  return (
                    <Paper
                      key={item.title}
                      elevation={0}
                      sx={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: { xs: 255, sm: 350, md: 410 },
                        height: { xs: 320, sm: 420, md: 500 },
                        borderRadius: { xs: "32px", md: "48px" },
                        overflow: "hidden",
                        border: { xs: "7px solid rgba(255,255,255,0.92)", md: "10px solid rgba(255,255,255,0.92)" },
                        boxShadow: isCenter
                          ? "0 42px 110px rgba(16,32,22,0.30)"
                          : "0 24px 72px rgba(16,32,22,0.16)",
                        zIndex: isCenter ? 5 : isRight ? 2 : 1,
                        opacity: isCenter ? 1 : 0.88,
                        filter: isCenter ? "brightness(1) saturate(1.04)" : "brightness(0.9) saturate(0.92)",
                        transform: isCenter
                          ? "translate(-50%, -50%) translate3d(0, -10px, 0) scale(1) rotate(0deg)"
                          : isRight
                            ? "translate(-50%, -50%) translate3d(37%, 28px, 0) scale(0.94) rotate(4deg)"
                            : "translate(-50%, -50%) translate3d(-37%, 28px, 0) scale(0.94) rotate(-4deg)",
                        transformOrigin: "center",
                        transition:
                          "transform 1650ms cubic-bezier(0.16, 1, 0.3, 1), opacity 1650ms cubic-bezier(0.16, 1, 0.3, 1), filter 1650ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 1650ms cubic-bezier(0.16, 1, 0.3, 1)",
                        willChange: "transform, opacity, filter",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        "&::after": {
                          content: '""',
                          position: "absolute",
                          inset: 0,
                          background:
                            "linear-gradient(180deg, rgba(0,0,0,0.04) 0%, transparent 38%, rgba(16,32,22,0.74) 100%)",
                          zIndex: 1,
                          pointerEvents: "none",
                        },
                      }}
                    >
                      <Box
                        sx={{
                          position: "absolute",
                          inset: 0,
                          backgroundImage: `url(${item.url})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                          transform: "translate3d(0, 0, 0) scale(1.035)",
                          animation: "showcaseImageBreath 16s cubic-bezier(0.37, 0, 0.63, 1) infinite",
                          willChange: "transform",
                          backfaceVisibility: "hidden",
                          WebkitBackfaceVisibility: "hidden",
                          "@keyframes showcaseImageBreath": {
                            "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1.035)" },
                            "50%": { transform: "translate3d(0, -5px, 0) scale(1.07)" },
                          },
                        }}
                      />

                      <Box
                        sx={{
                          position: "absolute",
                          left: { xs: 18, md: 24 },
                          right: { xs: 18, md: 24 },
                          bottom: { xs: 18, md: 24 },
                          color: "#fff",
                          zIndex: 2,
                          opacity: isCenter ? 1 : 0.88,
                          transform: isCenter ? "translateY(0)" : "translateY(6px)",
                          transition: "opacity 1200ms cubic-bezier(0.16, 1, 0.3, 1), transform 1200ms cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                      >
                        <Chip
                          label={item.label}
                          size="small"
                          sx={{
                            bgcolor: "rgba(255,255,255,0.22)",
                            color: "#fff",
                            fontWeight: 900,
                            mb: 1.2,
                            backdropFilter: "blur(10px)",
                          }}
                        />
                        <Typography
                          fontWeight={950}
                          sx={{
                            letterSpacing: "-0.045em",
                            fontSize: { xs: "1.35rem", sm: "1.65rem", md: "2rem" },
                            lineHeight: 1.05,
                            textShadow: "0 8px 26px rgba(0,0,0,0.35)",
                          }}
                        >
                          {item.title}
                        </Typography>
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* JOB POSTINGS */}
      <Box id="jobs" sx={{ py: { md: 5 }, scrollMarginTop: { xs: 86, md: 100 }}}>
        <Container maxWidth="xl">
          <Box
            sx={{
              mb: 4,
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "stretch", md: "center" },
              flexDirection: { xs: "column", md: "row" },
              gap: 2,
              flexWrap: "wrap",
            }}
          >

            {/* SEARCH / QUICK ACTIONS */}
      <Container maxWidth="xl">
        <Paper
          elevation={0}
          sx={{
            mt: { xs: -4, md: -6 },
            p: { xs: 1.5, sm: 2 },
            display: "flex",
            gap: 2,
            flexDirection: { xs: "column", md: "row" },
            alignItems: "center",
            position: "relative",
            zIndex: 4,
            boxShadow: "0 24px 60px rgba(31,122,71,0.16)",
            border: "1px solid rgba(31,122,71,0.12)",
            borderRadius: { xs: 2, md: 2.5 },
            bgcolor: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(18px)",
          }}
        >
          <TextField
            fullWidth
            placeholder="Search job title, department, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: "#1F7A47" }} />
                </InputAdornment>
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 1.5,
                bgcolor: "#f8fbf8",
                fontWeight: 700,
              },
            }}
          />

          <Button
            variant="contained"
            onClick={() => document.getElementById("jobs")?.scrollIntoView({ behavior: "smooth" })}
            fullWidth={isMobile}
            endIcon={<ArrowForward />}
            sx={{
              px: 4,
              py: 1.7,
              borderRadius: 1.5,
              fontWeight: 950,
              whiteSpace: "nowrap",
              textTransform: "none",
              background: "linear-gradient(135deg, #154f31 0%, #1F7A47 65%, #4caf70 100%)",
            }}
          >
            Search Jobs
          </Button>
        </Paper>
      </Container>
            <Box>
              <Chip
                icon={<Work />}
                label={`${filteredJobs.length} available ${filteredJobs.length === 1 ? "role" : "roles"}`}
                sx={{ mb: 1.5, bgcolor: "rgba(31,122,71,0.10)", color: "#1F7A47", fontWeight: 900 }}
              />
              <Typography
                variant="h4"
                fontWeight={950}
                sx={{
                  color: "#102016",
                  fontSize: { xs: "2rem", sm: "2.4rem", md: "3rem" },
                  letterSpacing: "-0.055em",
                  lineHeight: 1,
                }}
              >
                Open Positions
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Review current opportunities and apply directly from the portal.
              </Typography>
            </Box>

          </Box>

          {loading ? (
            <Paper
              elevation={0}
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 9,
                borderRadius: 2.5,
                border: "1px solid rgba(31,122,71,0.10)",
                bgcolor: "rgba(255,255,255,0.85)",
              }}
            >
              <Stack alignItems="center" spacing={2}>
                <CircularProgress />
                <Typography color="text.secondary" fontWeight={800}>
                  Loading career opportunities...
                </Typography>
              </Stack>
            </Paper>
          ) : filteredJobs.length === 0 ? (
            <Paper
              elevation={0}
              sx={{
                p: { xs: 4, md: 7 },
                textAlign: "center",
                border: "1px solid rgba(31,122,71,0.12)",
                borderRadius: 2.5,
                bgcolor: "rgba(255,255,255,0.86)",
              }}
            >
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  mx: "auto",
                  mb: 2,
                  borderRadius: "26px",
                  bgcolor: "rgba(31,122,71,0.10)",
                  color: "#1F7A47",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Search fontSize="large" />
              </Box>
              <Typography variant="h5" fontWeight={950} sx={{ mb: 1 }}>
                No matching job postings found
              </Typography>
              <Typography color="text.secondary">
                Try a different search keyword or check again when new openings are posted.
              </Typography>
            </Paper>
          ) : (
            <Grid container spacing={{ xs: 2.5, md: 3 }}>
              {filteredJobs.map((job) => (
                <Grid key={job.id} size={{ xs: 12, sm: 12, md: 6, lg: 4 }}>
                  <Card
                    sx={{
                      height: "100%",
                      borderRadius: 2.5,
                      boxShadow: "0 20px 52px rgba(15,23,42,0.08)",
                      border: "1px solid rgba(31,122,71,0.11)",
                      background: "linear-gradient(180deg, #ffffff 0%, #f8fbf8 100%)",
                      transition: "transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease",
                      "&:hover": {
                        transform: "translateY(-6px)",
                        boxShadow: "0 28px 70px rgba(31,122,71,0.16)",
                        borderColor: "rgba(31,122,71,0.26)",
                      },
                    }}
                  >
                    <CardContent
                      sx={{
                        p: { xs: 2.7, sm: 3.4 },
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        justifyContent="space-between"
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        spacing={1.5}
                        sx={{ mb: 2.2 }}
                      >
                        <Box
                          sx={{
                            width: 54,
                            height: 54,
                            borderRadius: "20px",
                            bgcolor: "rgba(31,122,71,0.10)",
                            color: "#1F7A47",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                          }}
                        >
                          <Work />
                        </Box>
                        <Chip
                          label={job.employment_type}
                          size="small"
                          sx={{
                            bgcolor: "rgba(31,122,71,0.10)",
                            color: "#1F7A47",
                            fontWeight: 900,
                            alignSelf: { xs: "flex-start", sm: "center" },
                          }}
                        />
                      </Stack>

                      <Typography
                        variant="h5"
                        fontWeight={950}
                        sx={{
                          fontSize: { xs: "1.28rem", sm: "1.48rem" },
                          letterSpacing: "-0.035em",
                          wordBreak: "break-word",
                          color: "#102016",
                          mb: 2,
                        }}
                      >
                        {job.title}
                      </Typography>

                      <Stack spacing={1.25} sx={{ mb: 2.2 }}>
                        <Typography
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            color: "#5d6d63",
                            wordBreak: "break-word",
                          }}
                        >
                          <Groups fontSize="small" sx={{ color: "#1F7A47" }} />
                          <strong>Department:</strong> {job.department}
                        </Typography>

                        <Typography
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            color: "#5d6d63",
                            wordBreak: "break-word",
                          }}
                        >
                          <LocationOn fontSize="small" sx={{ color: "#1F7A47" }} />
                          <strong>Location:</strong> {job.location}
                        </Typography>

                        <Typography
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            color: "#166534",
                            fontWeight: 850,
                            wordBreak: "break-word",
                          }}
                        >
                          <strong>Salary:</strong> {getSalaryLabel(job.salary_range)}
                        </Typography>
                      </Stack>

                      <Divider sx={{ my: 2, borderColor: "rgba(31,122,71,0.12)" }} />

                      <Typography fontWeight={950} sx={{ mb: 1, color: "#102016" }}>
                        Job Description
                      </Typography>
                      <Typography
                        color="text.secondary"
                        sx={{
                          mb: 3,
                          flexGrow: 1,
                          wordBreak: "break-word",
                          lineHeight: 1.75,
                          display: "-webkit-box",
                          WebkitLineClamp: 5,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {job.description || "No description provided."}
                      </Typography>

                      <Button
                        fullWidth
                        variant="contained"
                        endIcon={<ArrowForward />}
                        onClick={() => handleApplyForPosition(job)}
                        sx={{
                          py: 1.35,
                          borderRadius: 1,
                          fontWeight: 950,
                          textTransform: "none",
                          background: "linear-gradient(135deg, #154f31 0%, #1F7A47 65%, #4caf70 100%)",
                          boxShadow: "0 14px 28px rgba(31,122,71,0.20)",
                        }}
                      >
                        Apply for this Position
                      </Button>
                      
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Container>
        </Box>

      {/* FINAL CTA */}
      <Box sx={{ py: { xs: 7, md: 5 }, scrollMarginTop: { xs: 86, md: 100 }}}>
      <Container maxWidth="xl">
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, md: 5 },
            borderRadius: { xs: 2.5, md: 3.5 },
            color: "#fff",
            overflow: "hidden",
            position: "relative",
            background:
              "linear-gradient(135deg, rgba(16,32,22,0.96), rgba(31,122,71,0.94)), url(https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: "0 30px 80px rgba(16,32,22,0.22)",
          }}
        >
          <Grid container spacing={3} alignItems="center">
            <Grid size={{ xs: 12, md: 8 }}>
              <Chip
                icon={<MenuBook />}
                label="Applicant Portal"
                sx={{ bgcolor: "rgba(255,255,255,0.13)", color: "#fff", fontWeight: 900, mb: 2 }}
              />
              <Typography
                sx={{
                  fontSize: { xs: "1.9rem", md: "3rem" },
                  lineHeight: 1.05,
                  fontWeight: 950,
                  letterSpacing: "-0.055em",
                  mb: 1.5,
                }}
              >
                Ready to become part of Buenaventura Estate?
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.8, maxWidth: 760 }}>
                Send your application, monitor your progress, and take the next step toward a workplace that values service and growth.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack direction={{ xs: "column", sm: "row", md: "column" }} spacing={1.5} justifyContent="flex-end">
                <Button
                  size="large"
                  startIcon={<AssignmentTurnedIn />}
                  onClick={() => navigate("/apply")}
                  sx={{
                    bgcolor: "#fff",
                    color: "#1F7A47",
                    py: 1.45,
                    fontWeight: 950,
                    textTransform: "none",
                    "&:hover": { bgcolor: "#edf7ef" },
                  }}
                >
                  Start Application
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  startIcon={<TrackChanges />}
                  onClick={() => navigate("/track")}
                  sx={{
                    borderColor: "rgba(255,255,255,0.55)",
                    color: "#fff",
                    py: 1.45,
                    fontWeight: 950,
                    textTransform: "none",
                    "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.09)" },
                  }}
                >
                  Track Status
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      </Container>
      </Box>

      {/* EXPERIENCE SECTION */}
      <Box id="experience" sx={{ py: { xs: 3.5, md: 11 }, scrollMarginTop: { xs: 86, md: 100 } }}>
        <Container maxWidth="xl">
          <Grid container spacing={{ xs: 4, md: 5 }} alignItems="stretch">
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography
                sx={{
                  fontSize: { xs: "2rem", md: "3.15rem" },
                  lineHeight: 1,
                  fontWeight: 950,
                  letterSpacing: "-0.055em",
                  color: "#102016",
                  mb: 2,
                }}
              >
                Designed to make applicants feel welcome.
              </Typography>
              <Typography sx={{ color: "#5d6d63", lineHeight: 1.85, mb: 3 }}>
                The landing page now presents the company like a destination: polished, warm,
                professional, and easy to explore from any device.
              </Typography>

              <Stack spacing={1.3}>
                {cultureHighlights.map((item) => (
                  <Stack key={item} direction="row" spacing={1.2} alignItems="center">
                    <CheckCircle sx={{ color: "#1F7A47" }} fontSize="small" />
                    <Typography fontWeight={800} sx={{ color: "#23372b" }}>
                      {item}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Grid>

            <Grid size={{ xs: 12, md: 8 }}>
              <Grid container spacing={2.5}>
                {brochureItems.map((item, index) => (
                  <Grid key={item.title} size={{ xs: 12, sm: 6, lg: 4 }}>
                    <Card
                      sx={{
                        height: "100%",
                        borderRadius: 2.5,
                        border: "1px solid rgba(31,122,71,0.11)",
                        boxShadow: "0 18px 44px rgba(16,32,22,0.08)",
                        background:
                          index === 0
                            ? "linear-gradient(180deg, #ffffff 0%, #f0f8f1 100%)"
                            : "rgba(255,255,255,0.86)",
                        overflow: "hidden",
                      }}
                    >
                      <CardContent sx={{ p: 3.2 }}>
                        <Box
                          sx={{
                            width: 58,
                            height: 58,
                            borderRadius: "22px",
                            bgcolor: "rgba(31,122,71,0.10)",
                            color: "#1F7A47",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            mb: 2.5,
                            boxShadow: "inset 0 0 0 1px rgba(31,122,71,0.08)",
                          }}
                        >
                          {item.icon}
                        </Box>
                        <Typography variant="h5" fontWeight={950} sx={{ letterSpacing: "-0.035em", mb: 1 }}>
                          {item.title}
                        </Typography>
                        <Typography sx={{ color: "#64746b", lineHeight: 1.8 }}>{item.subtitle}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* GALLERY / BROCHURE VISUALS */}
      <Box sx={{ py: { xs: 4, md: 8 }, background: "linear-gradient(135deg, #154f31 0%, #1F7A47 65%, #4caf70 100%)", color: "#fff" }}>
        <Container maxWidth="xl">
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "flex-end" }}
            spacing={2}
            sx={{ mb: 4 }}
          >
            <Box>
              <Typography
                sx={{
                  fontSize: { xs: "2rem", md: "3.4rem" },
                  lineHeight: 1,
                  fontWeight: 950,
                  letterSpacing: "-0.06em",
                }}
              >
                A glimpse of the place applicants will want to join.
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={2}>
            {galleryImages.map((image, index) => (
              <Grid key={image} size={{ xs: 12, sm: 6, md: index === 0 ? 5 : index === 1 ? 3 : 2 }}>
                <Paper
                  elevation={0}
                  sx={{
                    minHeight: { xs: 260, md: index === 0 ? 420 : 300 },
                    borderRadius: { xs: 2, md: 2.5 },
                    overflow: "hidden",
                    backgroundImage: `linear-gradient(180deg, transparent 42%, rgba(0,0,0,0.52)), url(${image})`,
                    backgroundSize: { xs: "cover", md: "112%" },
                    backgroundPosition: "center",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 26px 70px rgba(0,0,0,0.22)",
                    position: "relative",
                    transform: "translate3d(0,0,0)",
                    transformOrigin: "center",
                    willChange: "transform, background-position",
                    animation: `${index % 2 === 0 ? "galleryFloatA" : "galleryFloatB"} ${index === 0 ? 8 : 6.8 + index}s ease-in-out infinite`,
                    animationDelay: `${index * 0.35}s`,
                    "@keyframes galleryFloatA": {
                      "0%, 100%": {
                        transform: "translate3d(0, 0, 0) rotate(0deg)",
                        backgroundPosition: "center center",
                      },
                      "50%": {
                        transform: "translate3d(0, -14px, 0) rotate(-0.6deg)",
                        backgroundPosition: "center 45%",
                      },
                    },
                    "@keyframes galleryFloatB": {
                      "0%, 100%": {
                        transform: "translate3d(0, 0, 0) rotate(0deg)",
                        backgroundPosition: "center center",
                      },
                      "50%": {
                        transform: "translate3d(0, 12px, 0) rotate(0.6deg)",
                        backgroundPosition: "center 55%",
                      },
                    },
                  }}
                >
                  <Typography
                    fontWeight={950}
                    sx={{ position: "absolute", left: 22, bottom: 18, color: "#fff" }}
                  >
                    {index === 0 ? "Guest Experience" : index === 1 ? "Sip Coffee" : index === 2 ? "Relax & Swimming" : "Restaurant"}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FOOTER */}
      <Box sx={{ py: 4, borderTop: "1px solid rgba(31,122,71,0.10)", bgcolor: "rgba(255,255,255,0.70)" }}>
        <Container maxWidth="xl">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
          >
            <Stack direction="row" spacing={1.2} alignItems="center">
              <Spa sx={{ color: "#1F7A47" }} />
              <Typography fontWeight={950} sx={{ color: "#174f32" }}>
                Buenaventura Estate Careers
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: "#6b7a70" }}>
              HRIS Applicant Portal • Designed for smooth recruitment experience
            </Typography>
          </Stack>
        </Container>
      </Box>

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            borderRadius: { xs: 0, sm: 5 },
            overflow: "hidden",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: 950,
            color: "#102016",
            letterSpacing: "-0.03em",
            pb: 1,
          }}
        >
          {editingJob ? "Edit Job Posting" : "Create Job Posting"}
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: "#f8fbf8" }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Job Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Department" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Employment Type" value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth label="Salary Range" value={form.salary_range} onChange={(e) => setForm({ ...form, salary_range: formatSalaryInput(e.target.value) })} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline minRows={4} label="Job Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline minRows={4} label="Qualifications" value={form.qualifications} onChange={(e) => setForm({ ...form, qualifications: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline minRows={4} label="Responsibilities" value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} />
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions
          sx={{
            flexDirection: { xs: "column-reverse", sm: "row" },
            gap: 1,
            p: 2,
          }}
        >
          <Button fullWidth={isMobile} onClick={() => setOpenDialog(false)} sx={{ borderRadius: 3, fontWeight: 850 }}>
            Cancel
          </Button>
          <Button
            fullWidth={isMobile}
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            sx={{
              borderRadius: 3,
              fontWeight: 950,
              background: "linear-gradient(135deg, #154f31 0%, #1F7A47 65%, #4caf70 100%)",
            }}
          >
            {saving ? "Saving..." : editingJob ? "Save Changes" : "Create Posting"}
          </Button>
        </DialogActions>
      </Dialog>

      <ActionSnackbar
        open={snackbar.open}
        message={snackbar.message}
        severity={snackbar.severity}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      />
    </Box>
  );
}
