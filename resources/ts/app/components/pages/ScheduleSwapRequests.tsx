import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '../bootstrap';
import { CheckCircleOutline, Close, EventAvailable, SwapHoriz, Sync } from '../bootstrap/icons';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
type SwapDay = typeof DAYS[number];
type ScheduleRow = {
  schedule_id: string;
  employee_id: string;
  week: string;
  outlet: string | null;
  status: string;
} & Record<SwapDay, string | null>;
type EmployeeRow = { employee_id: string; first_name: string; middle_name: string | null; last_name: string; suffix: string | null };
type SwapRequest = {
  id: string;
  request_id: string;
  requester_employee_id: string;
  recipient_employee_id: string;
  requester_schedule_id: string;
  recipient_schedule_id: string;
  swap_day: SwapDay;
  week: string;
  requester_outlet: string | null;
  recipient_outlet: string | null;
  requester_shift: string;
  recipient_shift: string;
  reason: string;
  status: 'Pending Coworker' | 'Pending HR' | 'Approved' | 'Rejected' | 'Cancelled';
  recipient_accepted: boolean | null;
  recipient_note: string | null;
  hr_note: string | null;
  created_at: string;
  requester_name?: string | null;
  recipient_name?: string | null;
  requester?: EmployeeRow | EmployeeRow[] | null;
  recipient?: EmployeeRow | EmployeeRow[] | null;
};

type ScheduleSwapRequestsProps = {
  embedded?: boolean;
  openRequestDialog?: boolean;
  onRequestDialogOpened?: () => void;
  onScheduleChanged?: () => Promise<void> | void;
};

const dayLabel = (day: SwapDay) => day.charAt(0).toUpperCase() + day.slice(1);
const isWorkingShift = (value?: string | null) => {
  const shift = String(value ?? '').trim();
  return Boolean(shift) && !/^(off|rd|rest day)$/i.test(shift);
};
const getShift = (schedule: ScheduleRow, day: SwapDay) => String(schedule[day] ?? '').trim();
const getEmployee = (value?: EmployeeRow | EmployeeRow[] | null) => Array.isArray(value) ? value[0] : value;
const employeeName = (employee?: EmployeeRow | null) => employee
  ? [employee.first_name, employee.middle_name, employee.last_name, employee.suffix].filter(Boolean).join(' ')
  : 'Employee';
const statusColor = (status: SwapRequest['status']) => status === 'Approved' ? 'success'
  : status === 'Rejected' || status === 'Cancelled' ? 'error'
    : status === 'Pending HR' ? 'info' : 'warning';

const cardSx = { borderRadius: 3, border: '1px solid rgba(76, 150, 89, 0.2)', bgcolor: '#fff', boxShadow: '0 10px 30px rgba(44, 91, 51, 0.06)' } as const;
const fieldSx = { '& .MuiOutlinedInput-root': { bgcolor: '#fbfff9' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(76, 150, 89, 0.32)' } } as const;

export default function ScheduleSwapRequests({ embedded = false, openRequestDialog = false, onRequestDialogOpened, onScheduleChanged }: ScheduleSwapRequestsProps) {
  const { user } = useAuth();
  const role = String(user?.role ?? '').toLowerCase();
  const employeeId = role === 'employee' ? String(user?.employeeId ?? '') : '';
  const isEmployee = role === 'employee';
  const isHr = role === 'hr' || role === 'hr_admin';
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [requests, setRequests] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requesterScheduleId, setRequesterScheduleId] = useState('');
  const [swapDay, setSwapDay] = useState<SwapDay | ''>('');
  const [recipientEmployeeId, setRecipientEmployeeId] = useState('');
  const [reason, setReason] = useState('');

  const refresh = useCallback(async () => {
    if (!isEmployee && !isHr) return;
    setLoading(true);
    setError('');
    try {
      if (isEmployee && !employeeId) throw new Error('Your account is not linked to an employee record. Please contact HR.');
      const schedulePromise = isEmployee
        ? supabase.rpc('get_employee_schedule_overview')
        : supabase.from('schedule')
          .select('schedule_id,employee_id,week,outlet,status,monday,tuesday,wednesday,thursday,friday,saturday,sunday')
          .in('status', ['Published', 'Confirmed']);
      const employeePromise = isEmployee
        ? Promise.resolve({ data: null, error: null } as any)
        : supabase.from('employees')
          .select('employee_id,first_name,middle_name,last_name,suffix')
          .eq('status', 'Active')
          .order('first_name');
      const [scheduleResult, employeeResult, requestResult] = await Promise.all([
        schedulePromise,
        employeePromise,
        supabase.rpc('list_schedule_swap_requests'),
      ]);
      if (scheduleResult.error) throw scheduleResult.error;
      if (employeeResult.error) throw employeeResult.error;
      if (requestResult.error) throw requestResult.error;
      const scheduleRows = (scheduleResult.data ?? []) as any[];
      const normalizedSchedules: ScheduleRow[] = scheduleRows.map(row => ({
        ...row,
        schedule_id: String(row.schedule_id ?? ''),
        employee_id: String(row.employee_id ?? ''),
        week: String(row.week ?? ''),
        outlet: row.outlet ?? null,
        status: String(row.status ?? ''),
      } as ScheduleRow));
      setSchedules(normalizedSchedules);
      const rosterEmployees = isEmployee
        ? scheduleRows.map(row => {
          const parts = String(row.employee_name ?? '').trim().split(/\s+/);
          return {
            employee_id: String(row.employee_id ?? ''),
            first_name: parts[0] ?? '',
            middle_name: null,
            last_name: parts.slice(1).join(' '),
            suffix: null,
          } as EmployeeRow;
        })
        : (employeeResult.data ?? []) as EmployeeRow[];
      setEmployees(rosterEmployees);
      setRequests((requestResult.data ?? []) as SwapRequest[]);
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not load schedule swap requests.');
    } finally {
      setLoading(false);
    }
  }, [employeeId, isEmployee, isHr]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const channel = supabase.channel('schedule-swap-request-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_swap_requests' }, () => {
        void refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  useEffect(() => {
    if (!openRequestDialog || !isEmployee) return;
    setDialogOpen(true);
    onRequestDialogOpened?.();
  }, [isEmployee, onRequestDialogOpened, openRequestDialog]);

  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.employee_id, employee])), [employees]);
  const ownSchedules = useMemo(() => schedules.filter(schedule => schedule.employee_id === employeeId), [employeeId, schedules]);
  const selectedOwnSchedule = ownSchedules.find(schedule => schedule.schedule_id === requesterScheduleId);

  const eligibleRecipientsForDay = useCallback((schedule: ScheduleRow | undefined, day: SwapDay) => {
    if (!schedule) return [] as { employeeId: string; name: string; schedule: ScheduleRow }[];
    const found = new Map<string, { employeeId: string; name: string; schedule: ScheduleRow }>();
    schedules.forEach(candidate => {
      if (candidate.employee_id === employeeId || candidate.week !== schedule.week
        || candidate.week.includes('Special Duty:')
        || String(candidate.outlet ?? '').trim().toLowerCase() !== String(schedule.outlet ?? '').trim().toLowerCase()
        || !isWorkingShift(candidate[day])) return;
      const employee = employeeById.get(candidate.employee_id);
      if (!employee || found.has(candidate.employee_id)) return;
      found.set(candidate.employee_id, { employeeId: candidate.employee_id, name: employeeName(employee), schedule: candidate });
    });
    return [...found.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [employeeById, employeeId, schedules]);

  const availableDays = useMemo(() => selectedOwnSchedule
    ? DAYS.filter(day => isWorkingShift(selectedOwnSchedule[day]) && eligibleRecipientsForDay(selectedOwnSchedule, day).length > 0)
    : [], [eligibleRecipientsForDay, selectedOwnSchedule]);
  const availableRecipients = useMemo(() => swapDay
    ? eligibleRecipientsForDay(selectedOwnSchedule, swapDay)
    : [], [eligibleRecipientsForDay, selectedOwnSchedule, swapDay]);
  const selectedRecipient = availableRecipients.find(option => option.employeeId === recipientEmployeeId);

  const submitRequest = async () => {
    if (!selectedOwnSchedule || !swapDay || !selectedRecipient) return;
    setBusyId('submit');
    setMessage('');
    try {
      const { error: submitError } = await supabase.rpc('submit_schedule_swap_request', {
        p_recipient_employee_id: selectedRecipient.employeeId,
        p_requester_schedule_id: selectedOwnSchedule.schedule_id,
        p_recipient_schedule_id: selectedRecipient.schedule.schedule_id,
        p_swap_day: swapDay,
        p_reason: reason.trim(),
      });
      if (submitError) throw submitError;
      setDialogOpen(false);
      setRequesterScheduleId(''); setSwapDay(''); setRecipientEmployeeId(''); setReason('');
      setMessage('Swap request sent. The other employee must accept it before HR can review it.');
      await refresh();
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not submit the schedule swap request.');
    } finally {
      setBusyId('');
    }
  };

  const respond = async (request: SwapRequest, accept: boolean) => {
    setBusyId(request.id); setError(''); setMessage('');
    try {
      const { error: responseError } = await supabase.rpc('respond_to_schedule_swap_request', {
        p_request_id: request.id, p_accept: accept, p_note: '',
      });
      if (responseError) throw responseError;
      setMessage(accept ? 'You accepted the swap. It is now waiting for HR confirmation.' : 'You rejected the swap request.');
      await refresh();
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not record your response.');
    } finally {
      setBusyId('');
    }
  };

  const review = async (request: SwapRequest, approve: boolean) => {
    setBusyId(request.id); setError(''); setMessage('');
    try {
      const { error: reviewError } = await supabase.rpc('review_schedule_swap_request', {
        p_request_id: request.id, p_approve: approve, p_note: '',
      });
      if (reviewError) throw reviewError;
      if (approve) await onScheduleChanged?.();
      setMessage(approve ? 'HR confirmed the swap and both schedules were updated.' : 'HR rejected the schedule swap.');
      await refresh();
    } catch (cause: any) {
      setError(cause?.message ?? 'Could not review the schedule swap.');
    } finally {
      setBusyId('');
    }
  };

  if (!isEmployee && !isHr) return null;

  return (
    <Paper elevation={0} sx={{ ...cardSx, p: { xs: 1.5, sm: 2.25 }, mb: 2.5, mt: embedded ? 2.5 : 0 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SwapHoriz sx={{ color: '#1b7546' }} />
          <Box>
            <Typography variant="h6" fontWeight={800} color="#173421">Schedule Swap Requests</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {isEmployee && !embedded && (
            <Button variant="contained" startIcon={<SwapHoriz />} onClick={() => setDialogOpen(true)} disabled={loading || ownSchedules.length === 0}
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, bgcolor: '#20834f', '&:hover': { bgcolor: '#176a3e' } }}>
              Request a Swap
            </Button>
          )}
          <Button variant="outlined" startIcon={loading ? <CircularProgress size={16} /> : <Sync />} onClick={() => void refresh()} disabled={loading}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: '#acd0b3', color: '#176a3e' }}>
            Refresh
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      {message && <Alert severity="success" sx={{ mb: 1.5 }}>{message}</Alert>}
      {isEmployee && !loading && ownSchedules.length === 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>You need a published or confirmed schedule before you can request a swap.</Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={26} sx={{ color: '#20834f' }} /></Box>
      ) : requests.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>There are no schedule swap requests to show.</Typography>
      ) : (
        <Grid container spacing={1.25}>
          {requests.map(request => {
            const requester = request.requester_name || employeeName(getEmployee(request.requester));
            const recipient = request.recipient_name || employeeName(getEmployee(request.recipient));
            const incomingForMe = isEmployee && request.recipient_employee_id === employeeId && request.status === 'Pending Coworker';
            const needsHrReview = isHr && request.status === 'Pending HR';
            return (
              <Grid key={request.id} size={{ xs: 12, lg: 6 }}>
                <Paper variant="outlined" sx={{ p: 1.5, height: '100%', borderRadius: 2.5, borderColor: 'rgba(76, 150, 89, 0.25)', bgcolor: '#fbfff9' }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                    <Box>
                      <Typography fontWeight={800} color="#173421">{request.request_id}</Typography>
                      <Typography variant="caption" color="text.secondary">{new Date(request.created_at).toLocaleString()}</Typography>
                    </Box>
                    <Chip size="small" label={request.status} color={statusColor(request.status)} variant="outlined" />
                  </Box>
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 0.6 }}>
                    {requester} ↔ {recipient} · {dayLabel(request.swap_day)} · {request.week}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {requester}: <strong>{request.requester_shift}</strong> ({request.requester_outlet || 'No outlet'})
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {recipient}: <strong>{request.recipient_shift}</strong> ({request.recipient_outlet || 'No outlet'})
                  </Typography>
                  {request.reason && <Typography variant="body2" sx={{ mt: 0.75 }}>Reason: {request.reason}</Typography>}
                  {request.recipient_note && <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>Coworker note: {request.recipient_note}</Typography>}
                  {request.hr_note && <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>HR note: {request.hr_note}</Typography>}
                  {(incomingForMe || needsHrReview) && (
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
                      {incomingForMe && <>
                        <Button size="small" variant="contained" startIcon={<CheckCircleOutline />} disabled={Boolean(busyId)} onClick={() => void respond(request, true)}
                          sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#20834f' }}>Accept</Button>
                        <Button size="small" variant="outlined" startIcon={<Close />} disabled={Boolean(busyId)} onClick={() => void respond(request, false)}
                          sx={{ borderRadius: 2, textTransform: 'none', color: '#a33', borderColor: '#d9a3a3' }}>Reject</Button>
                      </>}
                      {needsHrReview && <>
                        <Button size="small" variant="contained" startIcon={<EventAvailable />} disabled={Boolean(busyId)} onClick={() => void review(request, true)}
                          sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#20834f' }}>Confirm and swap shifts</Button>
                        <Button size="small" variant="outlined" startIcon={<Close />} disabled={Boolean(busyId)} onClick={() => void review(request, false)}
                          sx={{ borderRadius: 2, textTransform: 'none', color: '#a33', borderColor: '#d9a3a3' }}>Reject</Button>
                      </>}
                    </Box>
                  )}
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle fontWeight={800}>Request a Schedule Swap</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose one of your scheduled days and a coworker who is also scheduled that same day and week.
          </Typography>
          <Grid container spacing={1.5}>
            <Grid size={12}>
              <TextField fullWidth select label="Your Schedule" value={requesterScheduleId}
                onChange={event => { setRequesterScheduleId(event.target.value); setSwapDay(''); setRecipientEmployeeId(''); }}
                InputLabelProps={{ shrink: true }} sx={fieldSx}>
                {ownSchedules.map(schedule => (
                  <MenuItem key={schedule.schedule_id} value={schedule.schedule_id}>
                    {schedule.week} · {schedule.outlet || 'No outlet'}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label="Workday to Swap" value={swapDay}
                onChange={event => { setSwapDay(event.target.value as SwapDay); setRecipientEmployeeId(''); }}
                disabled={!selectedOwnSchedule} InputLabelProps={{ shrink: true }} sx={fieldSx}>
                {availableDays.map(day => <MenuItem key={day} value={day}>{dayLabel(day)} · {getShift(selectedOwnSchedule!, day)}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth select label="Coworker" value={recipientEmployeeId}
                onChange={event => setRecipientEmployeeId(event.target.value)} disabled={!swapDay}
                InputLabelProps={{ shrink: true }} sx={fieldSx}>
                {availableRecipients.map(option => (
                  <MenuItem key={option.employeeId} value={option.employeeId}>
                    {option.name} · {getShift(option.schedule, swapDay as SwapDay)}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={12}>
              <TextField fullWidth multiline minRows={2} label="Reason (optional)" value={reason}
                onChange={event => setReason(event.target.value)} InputLabelProps={{ shrink: true }} sx={fieldSx} />
            </Grid>
            {selectedRecipient && selectedOwnSchedule && swapDay && (
              <Grid size={12}>
                <Alert severity="info">
                  If approved, {dayLabel(swapDay)} shifts will switch: {getShift(selectedOwnSchedule, swapDay)} ↔ {getShift(selectedRecipient.schedule, swapDay)}.
                  The coworker must accept first, then HR confirms.
                </Alert>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button variant="contained" onClick={() => void submitRequest()} disabled={!selectedOwnSchedule || !swapDay || !selectedRecipient || Boolean(busyId)}
            sx={{ textTransform: 'none', borderRadius: 2, bgcolor: '#20834f' }}>
            {busyId === 'submit' ? <CircularProgress size={18} color="inherit" /> : 'Send Swap Request'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
