import { useAuth } from '../../context/AuthContext';
import { Alert } from '@mui/material';
import HRDashboard from './HRDashboard';
import EmployeeDashboard from './EmployeeDashboard';
import SupervisorDashboard from './SupervisorDashboard';
import GMDashboard from './GMDashboard';
import AccountingDashboard from './AccountingDashboard';

export default function DashboardRouter() {
  const { user } = useAuth();
  switch (user?.role) {
    case 'employee': return <EmployeeDashboard />;
    case 'supervisor': return <SupervisorDashboard />;
    case 'gm': return <GMDashboard />;
    case 'accounting': return <AccountingDashboard />;
    case 'hr': return <HRDashboard />;
    default: return <Alert severity="error">Your account has no supported dashboard. Please contact HR.</Alert>;
  }
}
