import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../../context/AuthContext";
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  MenuItem,
  Divider,
  InputAdornment,
  IconButton,
  Stack,
  Chip,
} from "@mui/material";
import {
  Lock,
  Search,
  Business,
  Visibility,
  VisibilityOff,
  Email,
  VpnKey,
} from "@mui/icons-material";
import AuthBackground from "../AuthBackground";
import { COMPANY } from "../../lib/constants";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [selectedDemo, setSelectedDemo] = useState("");
  const { login, user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const freshLogin = searchParams.get("fresh") === "1";

  useEffect(() => {
    if (freshLogin) {
      logout();
      setSearchParams({}, { replace: true });
      return;
    }

    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [freshLogin, loading, logout, navigate, setSearchParams, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid email or password");
    }
  };

  const demoAccounts = [
    {
      email: "hr@company.com",
      password: "password",
      role: "HR Personnel/Admin",
    },
    {
      email: "employee@company.com",
      password: "password",
      role: "Employee",
    },
    {
      email: "supervisor@company.com",
      password: "password",
      role: "Supervisor",
    },
    {
      email: "gm@company.com",
      password: "password",
      role: "General Manager",
    },
    {
      email: "accounting@company.com",
      password: "password",
      role: "Accounting & Finance",
    },
  ];

  const fieldSx = {
    mt: 1.4,
    mb: 0.8,
    "& .MuiInputLabel-root": {
      color: "#6F7E73",
      fontSize: "0.9rem",
      fontWeight: 700,
    },
    "& .MuiInputLabel-root.Mui-focused": {
      color: "#087443",
    },
    "& .MuiOutlinedInput-root": {
      minHeight: 54,
      borderRadius: "16px",
      backgroundColor: "rgba(255,255,255,0.92)",
      boxShadow: "0 10px 24px rgba(26, 83, 55, 0.06)",
      transition: "all 180ms ease",
      "& fieldset": {
        borderColor: "rgba(56, 116, 77, 0.16)",
      },
      "&:hover": {
        backgroundColor: "#FFFFFF",
        boxShadow: "0 14px 30px rgba(26, 83, 55, 0.10)",
        transform: "translateY(-1px)",
      },
      "&:hover fieldset": {
        borderColor: "rgba(8, 116, 67, 0.34)",
      },
      "&.Mui-focused": {
        backgroundColor: "#FFFFFF",
        boxShadow: "0 16px 34px rgba(8, 116, 67, 0.14)",
      },
      "&.Mui-focused fieldset": {
        borderColor: "#2DA861",
        borderWidth: "1.5px",
      },
    },
    "& .MuiInputBase-input": {
      color: "#11221A",
      fontSize: "0.94rem",
    },
    "& .MuiFormHelperText-root": {
      color: "#7C8D80",
      fontSize: "0.76rem",
      fontWeight: 600,
      ml: 1.2,
    },
  };

  return (
    <AuthBackground>
      <Container maxWidth="sm" sx={{ position: "relative", zIndex: 1 }}>
        <Paper
          elevation={0}
          sx={{
            position: "relative",
            overflow: "hidden",
            p: { xs: 2.7, sm: 4, md: 4.6 },
            borderRadius: "28px",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(248,253,247,0.94) 48%, rgba(239,250,238,0.92) 100%)",
            backdropFilter: "blur(22px)",
            border: "1px solid rgba(255,255,255,0.78)",
            boxShadow:
              "0 32px 70px rgba(10, 34, 24, 0.28), inset 0 1px 0 rgba(255,255,255,0.85)",
            "&::before": {
              content: '""',
              position: "absolute",
              width: 220,
              height: 220,
              top: -95,
              right: -85,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(68,185,111,0.24) 0%, rgba(68,185,111,0.08) 52%, rgba(68,185,111,0) 72%)",
              pointerEvents: "none",
            },
            "&::after": {
              content: '""',
              position: "absolute",
              width: 180,
              height: 180,
              left: -90,
              bottom: -82,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(217,164,65,0.18) 0%, rgba(217,164,65,0.06) 55%, rgba(217,164,65,0) 74%)",
              pointerEvents: "none",
            },
          }}
        >
          <Box sx={{ position: "relative", zIndex: 1 }}>
            {/* Brand header */}
            <Stack alignItems="center" spacing={1.25} sx={{ mb: 3 }}>
              <Box
                sx={{
                  width: { xs: 66, sm: 76 },
                  height: { xs: 66, sm: 76 },
                  borderRadius: "24px",
                  background:
                    "linear-gradient(145deg, #0A7A43 0%, #36B96E 64%, #8BD98F 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 20px 34px rgba(8, 116, 67, 0.34), inset 0 1px 0 rgba(255,255,255,0.45)",
                  border: "1px solid rgba(255,255,255,0.58)",
                }}
              >
                <Business sx={{ fontSize: { xs: 33, sm: 38 }, color: "white" }} />
              </Box>

              <Chip
                size="small"
                label="BUENAVENTURA ESTATE"
                sx={{
                  height: 28,
                  px: 0.5,
                  letterSpacing: 1.6,
                  bgcolor: "#DDF5E5",
                  color: "#006B3C",
                  border: "1px solid rgba(45,168,97,0.20)",
                  fontSize: "0.68rem",
                  fontWeight: 700,
                  "& .MuiChip-label": { px: 1.2 },
                }}
              />

              <Typography
                align="center"
                sx={{
                  maxWidth: 430,
                  fontSize: { xs: "1.38rem", sm: "1.72rem" },
                  fontWeight: 700,
                  color: "#122019",
                  lineHeight: 1.15,
                  letterSpacing: "-0.04em",
                }}
              >
                Human Resource Information System
              </Typography>

              <Typography
                align="center"
                sx={{
                  color: "#65766A",
                  fontSize: { xs: "0.86rem", sm: "0.96rem" },
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                Employee Management System
              </Typography>

              <Typography
                align="center"
                variant="caption"
                sx={{
                  maxWidth: 420,
                  color: "#8A978D",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: 0.25,
                  lineHeight: 1.45,
                }}
              >
                {COMPANY.address}
              </Typography>
            </Stack>

            <Divider
              sx={{
                mb: 3,
                borderColor: "rgba(46, 125, 50, 0.12)",
                "&::before, &::after": {
                  borderColor: "rgba(46, 125, 50, 0.12)",
                },
              }}
            >
              <Chip
                icon={<Lock sx={{ fontSize: 15, color: "#006B3C !important" }} />}
                label="Employee Sign In"
                size="small"
                sx={{
                  height: 30,
                  bgcolor: "rgba(221,245,229,0.95)",
                  color: "#006B3C",
                  border: "1px solid rgba(45,168,97,0.22)",
                  fontSize: "0.74rem",
                  fontWeight: 700,
                  "& .MuiChip-label": { px: 1.1 },
                }}
              />
            </Divider>

            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 2,
                  borderRadius: "16px",
                  border: "1px solid rgba(211, 47, 47, 0.14)",
                  fontWeight: 700,
                  "& .MuiAlert-message": { fontSize: "0.88rem" },
                }}
              >
                {error}
              </Alert>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <TextField
                select
                fullWidth
                label="Quick Demo Account"
                value={selectedDemo}
                onChange={(e) => {
                  const val = e.target.value;
                  const acc = demoAccounts.find((a) => a.email === val);
                  setSelectedDemo(val);
                  if (acc) {
                    setEmail(acc.email);
                    setPassword(acc.password);
                  }
                }}
                margin="normal"
                size="medium"
                helperText="Choose a role to auto-fill credentials"
                InputLabelProps={{ shrink: true }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search sx={{ fontSize: 19, color: "#0A7A43" }} />
                    </InputAdornment>
                  ),
                }}
                SelectProps={{
                  displayEmpty: true,
                  MenuProps: {
                    PaperProps: {
                      sx: {
                        mt: 1,
                        borderRadius: "18px",
                        border: "1px solid rgba(45,168,97,0.14)",
                        boxShadow: "0 18px 40px rgba(17, 48, 34, 0.18)",
                        "& .MuiMenuItem-root": {
                          fontSize: "0.9rem",
                          borderRadius: "12px",
                          mx: 1,
                          my: 0.4,
                        },
                        "& .MuiMenuItem-root.Mui-selected": {
                          bgcolor: "#DDF5E5",
                          color: "#006B3C",
                        },
                      },
                    },
                  },
                }}
                sx={fieldSx}
              >
                <MenuItem key="demo-placeholder" value="" disabled>
                  <em style={{ color: "#8A978D", fontStyle: "normal", fontWeight: 700 }}>
                    — Select a demo role —
                  </em>
                </MenuItem>
                {demoAccounts.map((account) => (
                  <MenuItem key={account.email} value={account.email}>
                    {account.role}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                fullWidth
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ fontSize: 19, color: "#0A7A43" }} />
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx}
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                helperText="Use the password configured in Supabase Auth"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <VpnKey sx={{ fontSize: 19, color: "#0A7A43" }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((s) => !s)}
                        edge="end"
                        size="small"
                        sx={{
                          color: "#557261",
                          bgcolor: "rgba(221,245,229,0.55)",
                          border: "1px solid rgba(45,168,97,0.12)",
                          "&:hover": {
                            bgcolor: "#DDF5E5",
                            color: "#006B3C",
                          },
                        }}
                      >
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={fieldSx}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                sx={{
                  mt: 3,
                  mb: 2,
                  py: 1.45,
                  borderRadius: "16px",
                  textTransform: "none",
                  fontSize: "0.98rem",
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                  color: "#FFFFFF",
                  background:
                    "linear-gradient(135deg, #087443 0%, #2DA861 56%, #61C982 100%)",
                  boxShadow: "0 18px 32px rgba(8,116,67,0.28)",
                  "&:hover": {
                    background:
                      "linear-gradient(135deg, #006B3C 0%, #229756 56%, #4FBC73 100%)",
                    boxShadow: "0 22px 38px rgba(8,116,67,0.34)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 180ms ease",
                }}
              >
                Sign In to HRIS
              </Button>
            </form>

            <Box
              sx={{
                mt: 3,
                p: { xs: 1.7, sm: 2 },
                borderRadius: "20px",
                background:
                  "linear-gradient(135deg, rgba(221,245,229,0.72) 0%, rgba(255,255,255,0.86) 58%, rgba(255,247,226,0.64) 100%)",
                border: "1px solid rgba(45,168,97,0.16)",
                boxShadow: "0 14px 32px rgba(26,83,55,0.07)",
              }}
            >
              <Typography
                variant="caption"
                display="block"
                gutterBottom
                sx={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  color: "#006B3C",
                  textTransform: "uppercase",
                  mb: 1.15,
                }}
              >
                Quick Access — Demo Roles
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                {demoAccounts.map((a) => (
                  <Chip
                    key={a.email}
                    label={a.role}
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword(a.password);
                    }}
                    sx={{
                      mb: 0.5,
                      height: 29,
                      cursor: "pointer",
                      borderRadius: "999px",
                      borderColor: "rgba(8,116,67,0.18)",
                      bgcolor: "rgba(255,255,255,0.74)",
                      color: "#1D5D3A",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      boxShadow: "0 8px 16px rgba(26,83,55,0.05)",
                      "&:hover": {
                        borderColor: "rgba(8,116,67,0.36)",
                        bgcolor: "#DDF5E5",
                        color: "#006B3C",
                        transform: "translateY(-1px)",
                      },
                      transition: "all 160ms ease",
                    }}
                  />
                ))}
              </Stack>
            </Box>
          </Box>
        </Paper>

        <Typography
          align="center"
          sx={{
            mt: 2.5,
            color: "rgba(255,255,255,0.92)",
            fontSize: "0.78rem",
            fontWeight: 700,
            textShadow: "0 2px 12px rgba(0,0,0,0.22)",
          }}
        >
          © {new Date().getFullYear()} {COMPANY.name} · Est. {COMPANY.established} · HRIS Capstone
        </Typography>
      </Container>
    </AuthBackground>
  );
}
