import { Outlet, useNavigate, useLocation, Navigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import {
  AppBar, Toolbar, Typography, Drawer, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Box, IconButton, Avatar, Menu, MenuItem,
  useMediaQuery, useTheme, Divider, Chip, Tooltip, Stack, Badge, Popover, Paper, Button,
  CircularProgress,
} from '@mui/material';
import {
  SpaceDashboard, PersonAddAlt1, Groups, CalendarMonth, Schedule, Assignment,
  Payments, Insights, Analytics, Logout, Menu as MenuIcon, CorporateFare,
  NotificationsNone, ManageAccounts, ReceiptLong, AccountCircle, BadgeOutlined, Work,
  KeyboardArrowDown,
} from '@mui/icons-material';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

const drawerWidth = 268;

const NAV_UI = {
  sidebarBg: 'linear-gradient(180deg, #0b4a2b 0%, #145f38 46%, #1d7a48 100%)',
  sidebarBorder: 'rgba(213, 245, 218, 0.16)',
  sidebarText: '#f7fff7',
  sidebarMuted: 'rgba(232, 249, 235, 0.68)',
  gold: '#f4bd4f',
  goldSoft: 'rgba(244, 189, 79, 0.18)',
  greenSoft: 'rgba(224, 248, 224, 0.14)',
  selectedBg: 'linear-gradient(135deg, rgba(244, 189, 79, 0.24), rgba(255, 255, 255, 0.14))',
  headerBg: 'linear-gradient(135deg, rgba(21, 117, 67, 0.96), rgba(31, 132, 75, 0.92))',
};

// Role-specific nav items — each includes which roles can see it
const ALL_MENU_ITEMS = [
  { text: 'Dashboard',         icon: <SpaceDashboard />,     path: '/dashboard',                  roles: ['hr','employee','supervisor','gm','accounting'] },
  { text: 'Recruitment',       icon: <PersonAddAlt1 />,      path: '/dashboard/recruitment',      roles: ['hr','gm'] },
  { text: 'Job Postings', icon: <Work />, path: '/dashboard/job-postings', roles: ['hr', 'gm'] },
  { text: 'User Accounts',     icon: <ManageAccounts />,     path: '/dashboard/users',            roles: ['hr'] },
  { text: 'Employees',         icon: <Groups />,             path: '/dashboard/employees',        roles: ['hr','supervisor','gm'] },
  { text: 'Schedule',          icon: <CalendarMonth />,      path: '/dashboard/schedule',         roles: ['hr','supervisor','employee'] },
  { text: 'DTR', icon: <BadgeOutlined />, path: '/dashboard/dtr', roles: ['hr','employee'] },
  { text: 'Attendance',        icon: <Schedule />,           path: '/dashboard/attendance',       roles: ['hr','supervisor'] },
  { text: 'Requests',          icon: <Assignment />,         path: '/dashboard/requests',         roles: ['hr','supervisor','employee'] },
  { text: 'Payroll',           icon: <Payments />,           path: '/dashboard/payroll',          roles: ['hr','accounting'] },
  { text: 'My Payslips',       icon: <ReceiptLong />,        path: '/dashboard/payslips',         roles: ['employee'] },
  { text: 'Evaluation',        icon: <Insights />,           path: '/dashboard/evaluation',       roles: ['hr','supervisor','gm','employee'] },
  { text: 'Reports',           icon: <Analytics />,          path: '/dashboard/reports',          roles: ['hr','gm','accounting'] },
  { text: 'My Profile',        icon: <AccountCircle />,      path: '/dashboard/profile',          roles: ['employee'] },
];

export default function RootLayout() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifCount, setNotifCount] = useState(0);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // Fetch notifications based on role — must be before any early return
  useEffect(() => {
  if (!user) return;

  const fetchNotifications = async () => {
    try {
      let query = supabase
        .from("notifications")
        .select("*")
        .eq("is_read", false)
        .order("created_at", { ascending: false });

      // Employee notifications
      if (user.role === "employee") {
        query = query.eq("recipient_employee_id", user.employeeId);
      }

      // HR notifications
      else if (user.role === "hr") {
        query = query.eq("recipient_role", "hr");
      }

      // GM notifications
      else if (user.role === "gm") {
        query = query.eq("recipient_role", "gm");
      }

      // Supervisor notifications
      else if (user.role === "supervisor") {
        query = query.eq("recipient_role", "supervisor");
      }

      const { data, error } = await query;

      if (error) throw error;

      setNotifications(data ?? []);
      setNotifCount(data?.length ?? 0);

    } catch (error) {
      console.error("Notification fetch error:", error);
    }
  };

  fetchNotifications();
}, [user]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#f2f7f3' }}>
        <CircularProgress sx={{ color: '#1F7A47' }} />
      </Box>
    );
  }

  // Early return AFTER all hooks
  if (!user) return <Navigate to="/login" replace />;

  const filteredMenuItems = ALL_MENU_ITEMS.filter(item => item.roles.includes(user.role));

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleNavigate = (path: string) => { navigate(path); if (!isDesktop) setMobileOpen(false); };

  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
  e.stopPropagation();

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);

  setNotifications(prev => prev.filter(n => n.id !== id));
};

  const handleMarkAllRead = async () => {
  const ids = notifications.map(n => n.id);

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids);

  setNotifications([]);
};

  const ROLE_LABELS: Record<string, string> = {
    hr: 'HR / Admin', employee: 'Employee', supervisor: 'Supervisor',
    gm: 'General Manager', accounting: 'Accounting & Finance',
  };

  const drawerContent = (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        color: NAV_UI.sidebarText,
        background: NAV_UI.sidebarBg,
        '& > *': { position: 'relative', zIndex: 1 },
      }}
    >
      <Box sx={{ display: { xs: 'block', md: 'none' } }}><Toolbar /></Box>

      <Box
        onClick={() => handleNavigate('/dashboard')}
        sx={{
          px: 1.5,
          py: 1.5,
          m: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.4,
          cursor: 'pointer',
          borderRadius: '22px',
          border: '1px solid transparent',
          background: 'transparent',
          boxShadow: 'none',
          transition: 'transform 0.18s ease, background 0.18s ease',
          '&:hover': { background: 'rgba(255,255,255,0.06)', transform: 'translateY(-1px)' },
        }}
      >
        <Box sx={{ width: 48, height: 48, minWidth: 48, borderRadius: '16px', background: 'linear-gradient(135deg, #f0a93f 0%, #ffd276 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 28px rgba(244,189,79,0.28)' }}>
          <CorporateFare sx={{ color: 'white' }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ color: 'white', fontWeight: 700, lineHeight: 1.1, fontSize: '0.95rem' }} noWrap>Buenaventura</Typography>
          <Typography sx={{ color: 'rgba(230,238,248,0.7)', fontSize: '0.72rem', letterSpacing: 1 }} noWrap>HRIS</Typography>
        </Box>
      </Box>

      <Divider sx={{ borderColor: NAV_UI.sidebarBorder, mx: 2 }} />

      <Box sx={{ px: 2.5, pt: 1.5, pb: 0.5 }}>
        <Chip size="small" label={ROLE_LABELS[user.role] ?? user.role.toUpperCase()}
          sx={{ bgcolor: NAV_UI.goldSoft, color: '#ffe6a7', border: '1px solid rgba(244,189,79,0.26)', fontWeight: 700, fontSize: '0.7rem', letterSpacing: 0.5 }} />
      </Box>

      <Typography sx={{ px: 3, pt: 1.5, pb: 1, fontSize: '0.7rem', letterSpacing: 1.8, color: NAV_UI.sidebarMuted, fontWeight: 700 }}>
        MAIN MENU
      </Typography>

      <Box sx={{ flexGrow: 1, overflow: 'auto', pb: 1 }}>
        <List sx={{ px: 1.2 }}>
          {filteredMenuItems.map((item) => {
            const selected = item.path === '/dashboard' ? location.pathname === '/dashboard' : location.pathname.startsWith(item.path);
            return (
              <ListItem key={item.text} disablePadding sx={{ mb: 0.45 }}>
                <ListItemButton
                  selected={selected}
                  onClick={() => handleNavigate(item.path)}
                  sx={{
                    minHeight: 48,
                    borderRadius: '14px',
                    px: 1.6,
                    color: NAV_UI.sidebarText,
                    transition: 'transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease',
                    '& .MuiListItemIcon-root': { color: selected ? '#ffe39b' : 'rgba(232,249,235,0.78)', minWidth: 38 },
                    '&.Mui-selected': {
                      background: NAV_UI.selectedBg,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 12px 26px rgba(0,0,0,0.13)',
                      color: '#fff',
                    },
                    '&.Mui-selected:hover, &:hover': {
                      background: selected ? NAV_UI.selectedBg : 'rgba(255,255,255,0.09)',
                      transform: 'translateX(3px)',
                    },
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: '0.93rem', fontWeight: selected ? 700 : 600 }} />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>

      {/* User card */}
      <Box sx={{ p: 2 }}>
        <Box sx={{ p: 1.45, borderRadius: '24px', background: 'rgba(255,255,255,0.10)', border: `1px solid ${NAV_UI.sidebarBorder}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Avatar sx={{ bgcolor: NAV_UI.gold, color: '#fff', width: 40, height: 40, fontWeight: 700 }}>{user.name.charAt(0)}</Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }} noWrap>{user.name}</Typography>
            <Typography sx={{ color: NAV_UI.sidebarMuted, fontSize: '0.7rem' }} noWrap>{ROLE_LABELS[user.role] ?? user.role}</Typography>
          </Box>
          <Tooltip title="Logout">
            <IconButton size="small" onClick={handleLogout} sx={{ color: 'rgba(230,238,248,0.85)' }}><Logout fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          background: NAV_UI.headerBg,
          borderBottom: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 18px 42px rgba(21, 86, 50, 0.18)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Toolbar sx={{ gap: 1.25, minHeight: { xs: 64, sm: 70 } }}>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(prev => !prev)} sx={{ display: { md: 'none' } }}><MenuIcon /></IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.08rem' }, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
              Human Resource Information System
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.65,
            }}
          >
            <Tooltip title="Notifications">
              <IconButton
                size="small"
                onClick={e => setNotifAnchor(e.currentTarget)}
                sx={{
                  height: 42,
                  width: 42,
                  color: '#f5fff7',
                  bgcolor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.22)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 18px rgba(8, 72, 39, 0.12)',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' },
                }}
              >
                <Badge badgeContent={unreadCount} color="error">
                  <NotificationsNone sx={{ fontSize: 21 }} />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title={`${user.name} - ${ROLE_LABELS[user.role] ?? user.role}`}>
              <Box
                component="button"
                onClick={(e) => setAnchorEl(e.currentTarget)}
                sx={{
                  p: 0,
                  m: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  minHeight: 42,
                  px: 0.75,
                  pr: 1,
                  borderRadius: '12px',
                  bgcolor: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.24)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 8px 18px rgba(8, 72, 39, 0.12)',
                  backdropFilter: 'blur(12px)',
                  cursor: 'pointer',
                  minWidth: { xs: 0, sm: 230 },
                  color: '#ffffff',
                  transition: 'background 160ms ease, transform 160ms ease',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', transform: 'translateY(-1px)' },
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: NAV_UI.gold,
                    color: '#fff',
                    width: 34,
                    height: 34,
                    fontSize: '0.88rem',
                    fontWeight: 800,
                    boxShadow: '0 7px 14px rgba(0,0,0,0.12)',
                    flexShrink: 0,
                  }}
                >
                  {user.name.charAt(0)}
                </Avatar>
                <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left', minWidth: 0, flex: 1 }}>
                  <Typography noWrap sx={{ maxWidth: { sm: 150, md: 190 }, color: '#ffffff', fontSize: '0.88rem', fontWeight: 800, lineHeight: 1.1 }}>
                    {user.name}
                  </Typography>
                  <Typography noWrap sx={{ maxWidth: { sm: 150, md: 190 }, color: 'rgba(245,255,247,0.76)', fontSize: '0.72rem', fontWeight: 600, lineHeight: 1.2, mt: 0.1 }}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </Typography>
                </Box>
                <KeyboardArrowDown sx={{ display: { xs: 'none', sm: 'block' }, color: 'rgba(245,255,247,0.78)', fontSize: 20, flexShrink: 0 }} />
              </Box>
            </Tooltip>
          </Box>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} PaperProps={{ sx: { mt: 1, minWidth: 220, borderRadius: 2 } }}>
            <MenuItem disabled><Typography fontWeight={700}>{user.name}</Typography></MenuItem>
            <MenuItem disabled><Typography variant="body2" color="text.secondary">{ROLE_LABELS[user.role]}</Typography></MenuItem>
            <Divider />
            {user.role === 'employee' && (
              <MenuItem onClick={() => { setAnchorEl(null); navigate('/dashboard/profile'); }}>
                <ListItemIcon><AccountCircle fontSize="small" /></ListItemIcon>My Profile
              </MenuItem>
            )}
            <MenuItem onClick={() => { setAnchorEl(null); handleLogout(); }}>
              <ListItemIcon><Logout fontSize="small" /></ListItemIcon>Logout
            </MenuItem>
          </Menu>

          {/* Notifications Popover */}
          <Popover
            open={Boolean(notifAnchor)}
            anchorEl={notifAnchor}
            onClose={() => setNotifAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { mt: 1, borderRadius: 2, minWidth: 320, maxWidth: 400, maxHeight: 500 } }}
          >
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography fontWeight={700}>Notifications</Typography>
              {unreadCount > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={unreadCount} size="small" color="error" />
                  <Button size="small" variant="text" onClick={handleMarkAllRead} sx={{ fontSize: '0.72rem', textTransform: 'none', p: 0.5, minWidth: 0 }}>
                    Mark all read
                  </Button>
                </Box>
              )}
            </Box>
            {notifications.length === 0 ? (
              <Paper elevation={0} sx={{ p: 3, textAlign: 'center' }}>
                <NotificationsNone sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">No new notifications at this time.</Typography>
              </Paper>
            ) : (
              <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
                {notifications.map((notif) => {
                  const isRead = readIds.has(notif.id);
                  return (
                    <Box
                      key={notif.id}
                      onClick={() => {
                        if (notif.type === "application") navigate("/dashboard/recruitment");
                        if (notif.type === "schedule") navigate("/dashboard/schedule");
                      }}
                      sx={{
                        p: 2,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        cursor: 'pointer',
                        opacity: isRead ? 0.55 : 1,
                        bgcolor: isRead ? 'transparent' : 'action.selected',
                        transition: 'background 0.2s, opacity 0.2s',
                        '&:hover': { bgcolor: 'action.hover' },
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} color={isRead ? 'text.secondary' : 'primary'}>
                            {notif.title}
                          </Typography>
                          <Typography variant="body2" color="text.primary" sx={{ mt: 0.5 }}>
                            {notif.message}
                          </Typography>
                          {notif.created_at && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                              {new Date(notif.created_at).toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                        {!isRead && (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => handleMarkRead(notif.id, e)}
                            sx={{ fontSize: '0.68rem', textTransform: 'none', whiteSpace: 'nowrap', minWidth: 0, px: 1, py: 0.25, flexShrink: 0 }}
                          >
                            Mark read
                          </Button>
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Popover>
        </Toolbar>
      </AppBar>

      <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, width: drawerWidth, flexShrink: 0, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', border: 0, boxShadow: '18px 0 44px rgba(12, 74, 43, 0.18)' } }} open>
        {drawerContent}
      </Drawer>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', border: 0 } }}>
        {drawerContent}
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, width: { md: `calc(100% - ${drawerWidth}px)` }, minHeight: '100vh', p: { xs: 1.5, sm: 2.5, md: 3 }, bgcolor: 'background.default', backgroundImage: 'radial-gradient(circle at 0% 0%, rgba(15,76,129,0.05), transparent 40%), radial-gradient(circle at 100% 100%, rgba(232,163,61,0.06), transparent 45%)' }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
