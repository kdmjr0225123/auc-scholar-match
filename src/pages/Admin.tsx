import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Activity, AlertTriangle, ArrowUpRight, Check, CheckCircle2, ChevronDown, CircleDollarSign,
  Clock3, Download, ExternalLink, FileCheck2, GraduationCap, HeartPulse, LayoutDashboard,
  Loader2, LockKeyhole, LogOut, Play, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  Users, X,
} from 'lucide-react';

type ViewKey = 'overview' | 'pipeline' | 'review' | 'scholarships' | 'students' | 'health';
type GateState = 'loading' | 'pin' | 'setup' | 'open';
type PinEntryMode = 'setup' | 'change';

type ProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  school: string | null;
  major: string | null;
  gpa: number | null;
  graduation_year: number | null;
  resume_url: string | null;
  created_at: string | null;
};

type ScholarshipRow = {
  id: string;
  name: string;
  provider: string | null;
  description: string | null;
  award_amount: number | null;
  deadline: string | null;
  application_url: string | null;
  is_active: boolean | null;
  pipeline_status?: string | null;
  link_status?: string | null;
  link_checked_at?: string | null;
  quarantine_reason?: string | null;
};

type StageRow = Record<string, unknown> & {
  id: string;
  status?: string;
  name?: string;
  provider?: string | null;
  description?: string | null;
  award_amount?: number | null;
  deadline?: string | null;
  application_url?: string | null;
  source?: string | null;
  eligibility_raw?: string | null;
  audit_criteria?: unknown;
};

type PipelineLog = Record<string, unknown> & {
  id: string;
  ran_at?: string | null;
  status?: string | null;
  notes?: string | null;
};

type ApplicationValue = { user_id: string; status?: string; scholarship?: { award_amount?: number | null } | null };
type MetricValues = { totalUsers: number; signupsLast7Days: number; signupsLast30Days: number };

const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'pipeline', label: 'Pipeline', icon: Activity },
  { key: 'review', label: 'Review queue', icon: FileCheck2 },
  { key: 'scholarships', label: 'Live scholarships', icon: GraduationCap },
  { key: 'students', label: 'Students', icon: Users },
  { key: 'health', label: 'System health', icon: HeartPulse },
];

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return 'No deadline';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleDateString();
}

function shortDate(value: unknown): string {
  return typeof value === 'string' ? dateLabel(value) : 'Not recorded';
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return email;
  return `${name.slice(0, 1)}***@${domain}`;
}

function csvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function ConsoleStyles() {
  return <style>{`
    .console-root { min-height: 100dvh; background: #f3f5f7; color: #182432; font-family: var(--ev-font-body, 'DM Sans', sans-serif); }
    .console-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 20; width: 238px; display: flex; flex-direction: column; background: #0A1628; color: #fff; padding: 22px 14px; }
    .console-brand { display: flex; align-items: center; gap: 10px; padding: 2px 12px 25px; color: #fff; text-decoration: none; font: 700 17px var(--ev-font-display, 'Sora', sans-serif); }
    .console-brand-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: #0A1628; background: #E8B84B; }
    .console-nav { display: grid; gap: 5px; }
    .console-nav button { display: flex; align-items: center; gap: 11px; width: 100%; border: 0; border-radius: 6px; padding: 11px 12px; background: transparent; color: #b5c0cd; text-align: left; font: 600 13px var(--ev-font-body, 'DM Sans', sans-serif); cursor: pointer; }
    .console-nav button:hover { background: #17263b; color: #fff; }
    .console-nav button.active { background: #1b2b40; color: #E8B84B; }
    .console-side-bottom { margin-top: auto; display: grid; gap: 9px; border-top: 1px solid #263449; padding: 15px 8px 0; }
    .console-side-bottom a, .console-side-bottom button { display: flex; justify-content: flex-start; align-items: center; gap: 9px; border: 0; padding: 8px 5px; background: none; color: #c1cad5; text-decoration: none; font: 600 12px var(--ev-font-body, 'DM Sans', sans-serif); cursor: pointer; }
    .console-main { margin-left: 238px; min-width: 0; }
    .console-header { min-height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 28px; border-bottom: 1px solid #e0e5ea; background: #fff; }
    .console-header h1 { margin: 0; color: #0A1628; font: 700 18px var(--ev-font-display, 'Sora', sans-serif); }
    .console-header-actions { display: flex; align-items: center; gap: 8px; }
    .console-content { max-width: 1440px; margin: 0 auto; padding: 25px 28px 48px; }
    .console-eyebrow { color: #778494; font-size: 11px; font-weight: 700; letter-spacing: 0; text-transform: uppercase; }
    .console-title { margin: 4px 0 5px; color: #0A1628; font: 700 24px var(--ev-font-display, 'Sora', sans-serif); }
    .console-subtitle { margin: 0; color: #677585; font-size: 13px; }
    .console-grid { display: grid; gap: 14px; }
    .console-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 22px 0; }
    .console-panel { min-width: 0; border: 1px solid #e0e5e9; border-radius: 6px; background: #fff; }
    .console-kpi { padding: 17px 18px; }
    .console-kpi-label { display: flex; align-items: center; justify-content: space-between; color: #6a7887; font-size: 12px; font-weight: 600; }
    .console-kpi-value { margin-top: 12px; color: #0A1628; font: 700 25px var(--ev-font-display, 'Sora', sans-serif); }
    .console-kpi-note { margin-top: 4px; color: #83909c; font-size: 11px; }
    .console-two-col { grid-template-columns: minmax(0, 1.15fr) minmax(280px, .85fr); }
    .console-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #edf0f2; padding: 14px 17px; }
    .console-panel-head h2 { margin: 0; color: #172536; font: 700 14px var(--ev-font-display, 'Sora', sans-serif); }
    .console-panel-body { padding: 15px 17px; }
    .console-list { display: grid; gap: 0; }
    .console-list-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid #eff1f3; padding: 11px 0; font-size: 12px; }
    .console-list-row:last-child { border-bottom: 0; }
    .console-muted { color: #748190; }
    .console-table-wrap { width: 100%; overflow-x: auto; }
    .console-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .console-table th { padding: 10px 12px; background: #f7f8f9; color: #647281; font-size: 10px; text-align: left; text-transform: uppercase; white-space: nowrap; }
    .console-table td { padding: 11px 12px; border-top: 1px solid #edf0f2; vertical-align: top; }
    .console-table tr:hover td { background: #fbfcfc; }
    .console-status { display: inline-flex; align-items: center; border: 1px solid #dce2e6; border-radius: 99px; padding: 3px 8px; color: #536170; font-size: 10px; font-weight: 700; white-space: nowrap; }
    .console-status.warn { border-color: #f2d79b; background: #fff8e6; color: #8a6213; }
    .console-status.good { border-color: #bfdfd0; background: #eef8f2; color: #23724d; }
    .console-status.bad { border-color: #f0c3c3; background: #fff2f2; color: #a73939; }
    .console-button { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; border: 1px solid #d7dde2; border-radius: 5px; padding: 7px 10px; background: #fff; color: #263747; font: 600 12px var(--ev-font-body, 'DM Sans', sans-serif); cursor: pointer; }
    .console-button:hover { border-color: #aab6c1; background: #f8f9fa; }
    .console-button:disabled { opacity: .45; cursor: not-allowed; }
    .console-button.primary { border-color: #0A1628; background: #0A1628; color: #fff; }
    .console-button.gold { border-color: #d6a92f; background: #E8B84B; color: #0A1628; }
    .console-button.danger { color: #9d3434; }
    .console-field { width: 100%; min-width: 80px; border: 1px solid #d9dfe4; border-radius: 4px; padding: 7px 8px; color: #172536; background: #fff; font: 12px var(--ev-font-body, 'DM Sans', sans-serif); }
    .console-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .console-empty { padding: 25px 14px; color: #778493; text-align: center; font-size: 12px; }
    .console-alert { display: flex; gap: 8px; align-items: flex-start; border: 1px solid #efd49a; border-radius: 5px; padding: 10px 12px; background: #fff9ec; color: #755516; font-size: 12px; }
    .console-mobile-nav { display: none; }
    .console-gate { display: grid; place-items: center; min-height: 100dvh; padding: 22px; background: #0A1628; color: #fff; }
    .console-gate-box { width: min(100%, 370px); text-align: center; }
    .console-gate-logo { display: flex; justify-content: center; align-items: center; gap: 10px; margin-bottom: 38px; font: 700 19px var(--ev-font-display, 'Sora', sans-serif); }
    .console-gate-box h1 { margin: 0 0 8px; font: 700 22px var(--ev-font-display, 'Sora', sans-serif); }
    .console-gate-box p { margin: 0 auto 22px; max-width: 300px; color: #aeb9c7; font-size: 13px; line-height: 1.5; }
    .console-dots { display: flex; justify-content: center; gap: 13px; margin: 27px 0 24px; }
    .console-dot { width: 12px; height: 12px; border: 1px solid #8b99a8; border-radius: 50%; }
    .console-dot.filled { border-color: #E8B84B; background: #E8B84B; }
    .console-keypad { display: grid; grid-template-columns: repeat(3, 62px); justify-content: center; gap: 9px; }
    .console-key { width: 62px; height: 52px; border: 1px solid #304156; border-radius: 5px; background: #13233a; color: #fff; font: 600 18px var(--ev-font-body, 'DM Sans', sans-serif); cursor: pointer; }
    .console-key:hover { border-color: #E8B84B; color: #E8B84B; }
    .console-shake { animation: console-shake .28s linear; }
    @keyframes console-shake { 25% { transform: translateX(-7px); } 50% { transform: translateX(7px); } 75% { transform: translateX(-4px); } }
    .console-pin-form { display: grid; gap: 11px; margin-top: 18px; text-align: left; }
    .console-pin-form label { color: #c1cad5; font-size: 11px; font-weight: 700; }
    .console-pin-input { width: 100%; box-sizing: border-box; border: 1px solid #405066; border-radius: 5px; padding: 11px; background: #13233a; color: #fff; font-size: 18px; letter-spacing: 8px; text-align: center; }
    @media (max-width: 1000px) { .console-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 720px) {
      .console-sidebar { display: none; }
      .console-main { margin-left: 0; }
      .console-header { min-height: 58px; padding: 10px 14px; }
      .console-header h1 { font-size: 16px; }
      .console-content { padding: 19px 13px 35px; }
      .console-mobile-nav { position: sticky; top: 0; z-index: 15; display: flex; gap: 5px; overflow-x: auto; padding: 8px 10px; border-bottom: 1px solid #dfe4e8; background: #fff; }
      .console-mobile-nav button { display: flex; flex: 0 0 auto; align-items: center; gap: 6px; border: 0; border-radius: 4px; padding: 8px 10px; background: transparent; color: #5e6b78; font: 600 11px var(--ev-font-body, 'DM Sans', sans-serif); }
      .console-mobile-nav button.active { background: #0A1628; color: #E8B84B; }
      .console-two-col { grid-template-columns: minmax(0, 1fr); }
      .console-header-actions .console-button .button-label { display: none; }
      .console-kpi { padding: 13px; }
      .console-kpi-value { font-size: 21px; }
    }
  `}</style>;
}

export default function Admin() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [gate, setGate] = useState<GateState>('loading');
  const [activeView, setActiveView] = useState<ViewKey>('overview');
  const [pin, setPin] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [pinEntryMode, setPinEntryMode] = useState<PinEntryMode | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [dataLoading, setDataLoading] = useState(true);
  const [profileRows, setProfileRows] = useState<ProfileRow[]>([]);
  const [scholarships, setScholarships] = useState<ScholarshipRow[]>([]);
  const [stagingRows, setStagingRows] = useState<StageRow[]>([]);
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLog[]>([]);
  const [applications, setApplications] = useState<ApplicationValue[]>([]);
  const [accountMetrics, setAccountMetrics] = useState<MetricValues | null>(null);
  const [stagingUnavailable, setStagingUnavailable] = useState(false);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState('');
  const [studentPage, setStudentPage] = useState(0);
  const [revealEmails, setRevealEmails] = useState<Set<string>>(new Set());
  const [pipelineConfigured, setPipelineConfigured] = useState<boolean | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [scholarshipDraft, setScholarshipDraft] = useState<ScholarshipRow | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const lastActivity = useRef(Date.now());
  const lastRefresh = useRef(0);
  const pageSize = 12;

  const handleLock = useCallback(async () => {
    await supabase.functions.invoke('admin-verify-pin', { body: { action: 'lock' } });
    setPin('');
    setGate('pin');
  }, []);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('admin-verify-pin', { body: { action: 'refresh' } });
    if (error || objectValue(data).ok !== true) {
      setGate('pin');
      setPin('');
      toast({ title: 'Console locked', description: 'Your PIN session expired. Enter your PIN to continue.' });
      return false;
    }
    setSessionExpiresAt(Date.parse(stringValue(objectValue(data).expires_at)) || Date.now() + 30 * 60 * 1000);
    return true;
  }, [toast]);

  useEffect(() => {
    let alive = true;
    const loadGate = async () => {
      const { data, error } = await supabase.functions.invoke('admin-verify-pin', { body: { action: 'status' } });
      if (!alive) return;
      if (error) {
        setGate('pin');
        return;
      }
      const status = objectValue(data);
      setLockedUntil(typeof status.locked_until === 'string' ? status.locked_until : null);
      if (status.session_active === true) {
        setSessionExpiresAt(Date.parse(stringValue(status.expires_at)) || null);
        const { data: refreshed, error: refreshError } = await supabase.functions.invoke('admin-verify-pin', { body: { action: 'refresh' } });
        if (!alive) return;
        if (!refreshError && objectValue(refreshed).ok === true) {
          setSessionExpiresAt(Date.parse(stringValue(objectValue(refreshed).expires_at)) || Date.now() + 30 * 60 * 1000);
          setGate('open');
        } else setGate('pin');
      } else {
        setGate(status.setup_required === true ? 'setup' : 'pin');
      }
    };
    void loadGate();
    return () => { alive = false; };
  }, []);

  const submitPin = useCallback(async (enteredPin: string) => {
    if (enteredPin.length !== 4 || pinBusy) return;
    setPinBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-verify-pin', { body: { pin: enteredPin } });
    setPinBusy(false);
    if (error) {
      setPin('');
      toast({ variant: 'destructive', title: 'Could not verify PIN', description: error.message });
      return;
    }
    const result = objectValue(data);
    if (result.ok === true) {
      setPin('');
      setRemainingAttempts(null);
      setLockedUntil(null);
      setSessionExpiresAt(Date.parse(stringValue(result.expires_at)) || Date.now() + 30 * 60 * 1000);
      lastActivity.current = Date.now();
      setGate('open');
      return;
    }
    setPin('');
    setRemainingAttempts(typeof result.remaining_attempts === 'number' ? result.remaining_attempts : 0);
    setLockedUntil(typeof result.locked_until === 'string' ? result.locked_until : null);
    setShake(true);
    window.setTimeout(() => setShake(false), 320);
  }, [pinBusy, toast]);

  const enterDigit = useCallback((digit: string) => {
    if (!/^\d$/.test(digit) || pinBusy || gate !== 'pin' || Boolean(lockedUntil)) return;
    setPin((current) => {
      if (current.length >= 3) {
        const complete = current + digit;
        window.setTimeout(() => { void submitPin(complete); }, 0);
        return complete;
      }
      return current + digit;
    });
  }, [gate, lockedUntil, pinBusy, submitPin]);

  useEffect(() => {
    if (gate !== 'pin') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) enterDigit(event.key);
      else if (event.key === 'Backspace') setPin((value) => value.slice(0, -1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enterDigit, gate]);

  useEffect(() => {
    if (!lockedUntil) return;
    const remaining = Date.parse(lockedUntil) - Date.now();
    if (remaining <= 0) {
      setLockedUntil(null);
      setRemainingAttempts(5);
      return;
    }
    const timer = window.setTimeout(() => {
      setLockedUntil(null);
      setRemainingAttempts(5);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [lockedUntil]);

  useEffect(() => {
    if (gate !== 'open' || sessionExpiresAt === null) return;
    const remaining = sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      setGate('pin');
      setPin('');
      toast({ title: 'Console locked', description: 'Your PIN session expired. Enter your PIN to continue.' });
      return;
    }
    const timer = window.setTimeout(() => {
      setGate('pin');
      setPin('');
      toast({ title: 'Console locked', description: 'Your PIN session expired. Enter your PIN to continue.' });
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [gate, sessionExpiresAt, toast]);

  useEffect(() => {
    if (gate !== 'open') return;
    const activity = () => {
      lastActivity.current = Date.now();
      if (Date.now() - lastRefresh.current > 3 * 60 * 1000) {
        lastRefresh.current = Date.now();
        void refreshSession();
      }
    };
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity.current < 5 * 60 * 1000 && Date.now() - lastRefresh.current > 3 * 60 * 1000) {
        lastRefresh.current = Date.now();
        void refreshSession();
      }
    }, 60 * 1000);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('scroll', activity);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('scroll', activity);
    };
  }, [gate, refreshSession]);

  const loadConsoleData = useCallback(async () => {
    setDataLoading(true);
    const [profilesResult, scholarshipsResult, stagesResult, logsResult, applicationsResult, metricsResult] = await Promise.all([
      supabase.from('student_profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('scholarships').select('*').order('deadline', { ascending: true, nullsFirst: false }),
      supabase.from('scholarship_staging').select('*'),
      supabase.from('pipeline_logs').select('*').order('ran_at', { ascending: false }).limit(100),
      supabase.from('student_applications').select('user_id, status, scholarship:scholarships(award_amount)'),
      supabase.functions.invoke('admin-metrics', { body: {} }),
    ]);
    setProfileRows((profilesResult.data ?? []) as unknown as ProfileRow[]);
    setScholarships((scholarshipsResult.data ?? []) as unknown as ScholarshipRow[]);
    if (stagesResult.error) {
      setStagingUnavailable(true);
      setStagingRows([]);
    } else {
      setStagingUnavailable(false);
      setStagingRows((stagesResult.data ?? []) as unknown as StageRow[]);
    }
    setPipelineLogs((logsResult.data ?? []) as unknown as PipelineLog[]);
    setApplications((applicationsResult.data ?? []) as unknown as ApplicationValue[]);
    const metrics = objectValue(metricsResult.data);
    if (!metricsResult.error && typeof metrics.totalUsers === 'number') {
      setAccountMetrics({
        totalUsers: metrics.totalUsers,
        signupsLast7Days: numberValue(metrics.signupsLast7Days),
        signupsLast30Days: numberValue(metrics.signupsLast30Days),
      });
    } else {
      setAccountMetrics(null);
    }
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (gate !== 'open') return;
    void loadConsoleData();
    const channel = supabase.channel('admin-console-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarship_staging' }, () => { void loadConsoleData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_logs' }, () => { void loadConsoleData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, () => { void loadConsoleData(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [gate, loadConsoleData]);

  useEffect(() => {
    if (gate === 'open' && pipelineConfigured === null) {
      void supabase.functions.invoke('admin-run-pipeline', { body: { action: 'status' } }).then(({ data, error }) => {
        setPipelineConfigured(!error && objectValue(data).configured === true);
      });
    }
  }, [gate, pipelineConfigured]);

  const activeStages = useMemo(() => stagingRows.filter((row) => stringValue(row.status) === 'needs_review'), [stagingRows]);
  const profileComplete = useMemo(() => profileRows.filter((row) => Boolean(row.first_name && row.last_name && row.school && row.major && row.graduation_year && row.gpa !== null)).length, [profileRows]);
  const percentComplete = profileRows.length ? Math.round(profileComplete / profileRows.length * 100) : 0;
  const activeScholarships = scholarships.filter((row) => row.is_active === true);
  const availableDollars = activeScholarships.reduce((sum, row) => sum + numberValue(row.award_amount), 0);
  const matchedDollars = applications.filter((row) => row.status === 'applied' || row.status === 'completed').reduce((sum, row) => sum + numberValue(row.scholarship?.award_amount), 0);
  const now = new Date();
  const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const closingSoon = scholarships.filter((row) => row.is_active && row.deadline && new Date(row.deadline) >= now && new Date(row.deadline) <= twoWeeks);
  const stageCounts = stagingRows.reduce((counts, row) => {
    const status = stringValue(row.status, 'needs_review');
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const inventoryRun = pipelineLogs.find((row) => row.status === 'inventory_monitor');
  const schoolCounts = profileRows.reduce((counts, row) => {
    const school = row.school || 'Unknown';
    counts[school] = (counts[school] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const applicationCounts = applications.reduce((counts, row) => {
    counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const yearCounts = profileRows.reduce((counts, row) => {
    const year = row.graduation_year ? String(row.graduation_year) : 'Unknown';
    counts[year] = (counts[year] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const attentionItems = [
    ...activeStages.filter((row) => row.deadline && new Date(row.deadline) >= now && new Date(row.deadline) <= twoWeeks).map((row) => `${stringValue(row.name, 'Scholarship')} closes ${dateLabel(stringValue(row.deadline))} and needs review`),
    ...closingSoon.filter((row) => stringValue(row.pipeline_status) === 'pending').map((row) => `${row.name} closes ${dateLabel(row.deadline)} and is pending review`),
    ...scholarships.filter((row) => row.pipeline_status === 'quarantined' || row.link_status === 'broken').map((row) => `${row.name}: ${row.quarantine_reason || row.link_status || 'quarantined'}`),
    ...pipelineLogs.filter((row) => row.status === 'failed' || row.status === 'error').slice(0, 5).map((row) => `Pipeline run failed at ${shortDate(row.ran_at)}`),
  ];

  const runPipeline = async () => {
    if (pipelineBusy) return;
    setPipelineBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-run-pipeline', { body: {} });
    setPipelineBusy(false);
    if (error) {
      const detail = await error.context?.json?.().catch(() => null) as Record<string, unknown> | null;
      if (detail?.workflow_not_configured === true) setPipelineConfigured(false);
      toast({ variant: 'destructive', title: 'Pipeline was not started', description: stringValue(detail?.error, error.message) });
      return;
    }
    const result = objectValue(data);
    toast({ title: 'Audit finished', description: stringValue(result.notes, 'The audit gate ran. See run history for details.') });
    await loadConsoleData();
  };

  const savePin = async () => {
    if (newPin.length !== 4 || confirmPin !== newPin) {
      toast({ variant: 'destructive', title: 'PINs do not match', description: 'Enter and confirm the same four-digit PIN.' });
      return;
    }
    setPinBusy(true);
    const { data, error } = await supabase.functions.invoke('admin-set-pin', {
      body: { currentPin: pinEntryMode === 'change' ? currentPin : null, newPin },
    });
    setPinBusy(false);
    if (error || objectValue(data).ok !== true) {
      toast({ variant: 'destructive', title: 'PIN was not changed', description: error?.message || stringValue(objectValue(data).error, 'Check the current PIN and try again.') });
      return;
    }
    setPinEntryMode(null);
    setCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setSessionExpiresAt(Date.parse(stringValue(objectValue(data).expires_at)) || Date.now() + 30 * 60 * 1000);
    setGate('open');
    toast({ title: 'PIN saved', description: 'Your console session is active for 30 minutes.' });
  };

  const updateStageValue = (id: string, field: string, value: string) => {
    setStagingRows((rows) => rows.map((row) => row.id === id ? { ...row, [field]: value } : row));
  };

  const updateStageClassYears = (id: string, value: string) => {
    setStagingRows((rows) => rows.map((row) => row.id === id ? { ...row, allowed_class_years: value } : row));
  };

  // Owner "Approve" never publishes directly: it saves the edits and sends
  // the row back through the same pre-publish gate the daily audit uses (rules,
  // page checks, AI run-through), so nothing reaches students unchecked.
  const publishStage = async (row: StageRow, runNow = true) => {
    const name = stringValue(row.name).trim();
    const url = stringValue(row.application_url).trim();
    if (!name || !url) {
      toast({ variant: 'destructive', title: 'Missing required fields', description: 'Name and application URL are required.' });
      return false;
    }
    const amount = numberValue(row.award_amount);
    const deadline = stringValue(row.deadline).trim();
    const classNames = ['freshman', 'sophomore', 'junior', 'senior'];
    const rawYears = Array.isArray(row.allowed_class_years) ? row.allowed_class_years : stringValue(row.allowed_class_years).split(',');
    const classYears = rawYears.map((y) => String(y).trim().toLowerCase()).filter((y) => classNames.includes(y));
    const { error } = await supabase.from('scholarship_staging').update({
      name,
      title: name,
      provider: stringValue(row.provider) || null,
      description: stringValue(row.description) || null,
      award_amount: amount ? String(amount) : null,
      deadline: deadline || null,
      application_url: url,
      allowed_class_years: classYears.length ? classYears : null,
      status: 'needs_review',
      audit_passed: null,
      audit_failure: 'OWNER: sent to the gate from the console',
      // Restart the 14-day hold clock so a row the owner just fixed can't
      // expire on its first pass through the gate.
      created_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not send to the gate', description: error.message });
      return false;
    }
    if (runNow) {
      toast({ title: 'Sent to the gate', description: 'Running the audit now; it publishes only if every check passes.' });
      await runPipeline();
    }
    return true;
  };

  const rejectStage = async (row: StageRow, reason: string) => {
    const { error } = await supabase.from('scholarship_staging')
      .update({ status: 'rejected', audit_passed: false, audit_failure: `OWNER REJECTED: ${reason}`.slice(0, 1000) })
      .eq('id', row.id);
    if (error) toast({ variant: 'destructive', title: 'Could not reject row', description: error.message });
    else {
      toast({ title: 'Scholarship rejected' });
      await loadConsoleData();
    }
  };

  const bulkStageAction = async (action: 'approve' | 'reject') => {
    const rows = activeStages.filter((row) => selectedStage.has(row.id));
    if (!rows.length) return;
    if (action === 'reject') {
      const reason = window.prompt('Reason for rejecting selected scholarships:');
      if (!reason) return;
      for (const row of rows) await rejectStage(row, reason);
    } else {
      let sent = 0;
      for (const row of rows) if (await publishStage(row, false)) sent++;
      if (sent) {
        toast({ title: `Sent ${sent} to the gate`, description: 'Running the audit now.' });
        await runPipeline();
      }
    }
    setSelectedStage(new Set());
  };

  const saveScholarship = async () => {
    if (!scholarshipDraft) return;
    const { id, ...values } = scholarshipDraft;
    const { error } = await supabase.from('scholarships').update(values).eq('id', id);
    if (error) toast({ variant: 'destructive', title: 'Could not update scholarship', description: error.message });
    else {
      setScholarshipDraft(null);
      toast({ title: 'Scholarship updated' });
      await loadConsoleData();
    }
  };

  const recheckLink = async (id: string) => {
    const { error } = await supabase.functions.invoke('score-and-validate', { body: { scholarship_id: id, run_type: 'admin' } });
    if (error) toast({ variant: 'destructive', title: 'Link re-check failed', description: error.message });
    else {
      toast({ title: 'Link re-check started' });
      await loadConsoleData();
    }
  };

  const exportStudents = () => {
    const headers = ['name', 'email', 'school', 'major', 'gpa', 'graduation_year', 'created_at', 'profile_complete', 'resume_uploaded', 'application_count'];
    const lines = profileRows.map((row) => [
      `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(), row.email, row.school, row.major,
      row.gpa, row.graduation_year, row.created_at,
      Boolean(row.first_name && row.last_name && row.school && row.major && row.graduation_year && row.gpa !== null), Boolean(row.resume_url), applicationCounts[row.user_id] ?? 0,
    ].map(csvValue).join(','));
    const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'elevaid-students.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const filteredProfiles = profileRows.filter((row) => {
    const search = studentSearch.toLowerCase().trim();
    if (!search) return true;
    return [row.first_name, row.last_name, row.email, row.school, row.major, row.graduation_year]
      .some((value) => String(value ?? '').toLowerCase().includes(search));
  });
  const pagedProfiles = filteredProfiles.slice(studentPage * pageSize, (studentPage + 1) * pageSize);

  if (gate === 'loading') {
    return <><ConsoleStyles /><div className="console-gate"><Loader2 className="animate-spin" /></div></>;
  }

  if (gate === 'pin' || gate === 'setup') {
    const isSetup = gate === 'setup';
    const onPadKey = (key: string) => {
      if (key === 'clear') setPin('');
      else if (key === 'delete') setPin((value) => value.slice(0, -1));
      else enterDigit(key);
    };
    return <><ConsoleStyles /><main className="console-gate">
      <section className={`console-gate-box${shake ? ' console-shake' : ''}`}>
        <div className="console-gate-logo"><span className="console-brand-mark"><GraduationCap size={18} /></span>Elevaid Console</div>
        <h1>{isSetup ? 'Set your console PIN' : 'Enter your PIN'}</h1>
        <p>{isSetup ? 'Create a four-digit PIN to protect this admin session.' : 'A PIN is required before any admin data can be loaded.'}</p>
        {isSetup ? (
          <div className="console-pin-form">
            <label htmlFor="new-console-pin">Four-digit PIN</label>
            <input id="new-console-pin" className="console-pin-input" type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            <label htmlFor="confirm-console-pin">Confirm PIN</label>
            <input id="confirm-console-pin" className="console-pin-input" type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            <button className="console-button gold" disabled={pinBusy || newPin.length !== 4 || confirmPin.length !== 4} onClick={() => { setPinEntryMode('setup'); void savePin(); }}>
              {pinBusy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save PIN
            </button>
          </div>
        ) : (
          <>
            <div className="console-dots" aria-label={`${pin.length} of 4 digits entered`}>
              {[0, 1, 2, 3].map((index) => <span key={index} className={`console-dot${pin.length > index ? ' filled' : ''}`} />)}
            </div>
            {lockedUntil && <p>PIN locked until {new Date(lockedUntil).toLocaleTimeString()}.</p>}
            {remainingAttempts !== null && !lockedUntil && <p>{remainingAttempts} attempt{remainingAttempts === 1 ? '' : 's'} remaining.</p>}
            <div className="console-keypad">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'].map((key) => (
                <button key={key} className="console-key" aria-label={key === 'delete' ? 'Delete digit' : key === 'clear' ? 'Clear PIN' : key} onClick={() => onPadKey(key)} disabled={pinBusy || Boolean(lockedUntil)}>
                  {key === 'delete' ? '⌫' : key === 'clear' ? 'C' : key}
                </button>
              ))}
            </div>
          </>
        )}
        <button className="console-side-bottom" style={{ margin: '25px auto 0', border: 0, background: 'transparent' }} onClick={() => { void signOut(); }}>
          <LogOut size={14} /> Sign out
        </button>
      </section>
    </main></>;
  }

  if (pinEntryMode) {
    return <><ConsoleStyles /><main className="console-gate"><section className="console-gate-box">
      <div className="console-gate-logo"><span className="console-brand-mark"><GraduationCap size={18} /></span>Elevaid Console</div>
      <h1>{pinEntryMode === 'setup' ? 'Set your console PIN' : 'Change your PIN'}</h1>
      <p>PINs are four digits. Your PIN is stored as a password hash.</p>
      {pinEntryMode === 'change' && <div className="console-pin-form"><label htmlFor="current-console-pin">Current PIN</label><input id="current-console-pin" className="console-pin-input" type="password" inputMode="numeric" maxLength={4} value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>}
      <div className="console-pin-form"><label htmlFor="change-console-pin">New PIN</label><input id="change-console-pin" className="console-pin-input" type="password" inputMode="numeric" maxLength={4} value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /><label htmlFor="change-console-pin-confirm">Confirm new PIN</label><input id="change-console-pin-confirm" className="console-pin-input" type="password" inputMode="numeric" maxLength={4} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 4))} /></div>
      <div className="console-tools" style={{ justifyContent: 'center', marginTop: 16 }}><button className="console-button gold" disabled={pinBusy || (pinEntryMode === 'change' && currentPin.length !== 4) || newPin.length !== 4 || confirmPin.length !== 4} onClick={() => void savePin()}>{pinBusy ? 'Saving…' : 'Save PIN'}</button><button className="console-button" onClick={() => { setPinEntryMode(null); setCurrentPin(''); setNewPin(''); setConfirmPin(''); }}>Cancel</button></div>
    </section></main></>;
  }

  const currentTitle = NAV_ITEMS.find((item) => item.key === activeView)?.label ?? 'Overview';
  const stageStatusBadge = (status: string) => <span className={`console-status ${status === 'needs_review' ? 'warn' : status === 'published' || status === 'ready' ? 'good' : status === 'rejected' ? 'bad' : ''}`}>{status.replace(/_/g, ' ')}</span>;

  return <><ConsoleStyles />
    <div className="console-root">
      <aside className="console-sidebar">
        <Link className="console-brand" to="/console"><span className="console-brand-mark"><GraduationCap size={18} /></span><span>Elevaid Console</span></Link>
        <nav className="console-nav" aria-label="Console sections">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => <button key={key} className={activeView === key ? 'active' : ''} onClick={() => setActiveView(key)}><Icon size={17} />{label}</button>)}
        </nav>
        <div className="console-side-bottom">
          <Link to="/dashboard?preview=1"><ArrowUpRight size={15} />View as student</Link>
          <button onClick={() => { setPinEntryMode('change'); setNewPin(''); setConfirmPin(''); }}><LockKeyhole size={15} />Set PIN</button>
          <button onClick={() => void handleLock()}><LockKeyhole size={15} />Lock console</button>
          <button onClick={() => { void signOut(); }}><LogOut size={15} />Sign out</button>
        </div>
      </aside>
      <div className="console-main">
        <header className="console-header">
          <h1>{currentTitle}</h1>
          <div className="console-header-actions">
            <span className="console-status good"><ShieldCheck size={12} style={{ marginRight: 4 }} />PIN session active</span>
            <button className="console-button" onClick={() => void loadConsoleData()} disabled={dataLoading}><RefreshCw size={14} className={dataLoading ? 'animate-spin' : ''} /><span className="button-label">Refresh</span></button>
            <button className="console-button" onClick={() => void handleLock()}><LockKeyhole size={14} /><span className="button-label">Lock</span></button>
          </div>
        </header>
        <nav className="console-mobile-nav" aria-label="Console sections">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => <button key={key} className={activeView === key ? 'active' : ''} onClick={() => setActiveView(key)}><Icon size={14} />{label}</button>)}
        </nav>
        <main className="console-content">
          {activeView === 'overview' && <>
            <div className="console-eyebrow">Elevaid / Console</div><h2 className="console-title">Overview</h2><p className="console-subtitle">A live read on students, scholarship inventory, and pipeline activity.</p>
            {dataLoading && <div className="console-alert" style={{ marginTop: 14 }}><Loader2 size={15} className="animate-spin" />Refreshing live data…</div>}
            <div className="console-grid console-kpis">
              <article className="console-panel console-kpi"><div className="console-kpi-label">Total users <Users size={15} /></div><div className="console-kpi-value">{accountMetrics?.totalUsers ?? '—'}</div><div className="console-kpi-note">7 days: {accountMetrics?.signupsLast7Days ?? '—'} · 30 days: {accountMetrics?.signupsLast30Days ?? '—'} signups</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Completed profiles <CheckCircle2 size={15} /></div><div className="console-kpi-value">{profileComplete} <small style={{ color: '#778493', fontSize: 13 }}>{percentComplete}%</small></div><div className="console-kpi-note">{profileRows.length} profiles on record</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Active scholarships <GraduationCap size={15} /></div><div className="console-kpi-value">{activeScholarships.length}</div><div className="console-kpi-note">{money(availableDollars)} total listed value</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Applications tracked <CircleDollarSign size={15} /></div><div className="console-kpi-value">{money(matchedDollars)}</div><div className="console-kpi-note">Award value on applied/completed items</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Needs review <FileCheck2 size={15} /></div><div className="console-kpi-value">{stageCounts.needs_review ?? 0}</div><div className="console-kpi-note">{stageCounts.ready ?? 0} ready · {stageCounts.rejected ?? 0} rejected</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Closing in 14 days <Clock3 size={15} /></div><div className="console-kpi-value">{closingSoon.length}</div><div className="console-kpi-note">Active scholarships with approaching deadlines</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Students by school <Users size={15} /></div><div className="console-kpi-value">{profileRows.length}</div><div className="console-kpi-note">{Object.entries(schoolCounts).map(([school, count]) => `${school.replace(/_/g, ' ')} ${count}`).join(' · ') || 'No profile data'}</div></article>
              <article className="console-panel console-kpi"><div className="console-kpi-label">Class years <GraduationCap size={15} /></div><div className="console-kpi-value">{Object.keys(yearCounts).filter((year) => year !== 'Unknown').length}</div><div className="console-kpi-note">{Object.entries(yearCounts).map(([year, count]) => `${year}: ${count}`).join(' · ') || 'No profile data'}</div></article>
            </div>
            <div className="console-grid console-two-col">
              <section className="console-panel"><div className="console-panel-head"><h2>Attention</h2><AlertTriangle size={16} color="#b27a16" /></div><div className="console-panel-body">
                {attentionItems.length ? <div className="console-list">{attentionItems.map((item, index) => <div className="console-list-row" key={`${item}-${index}`}><span>{item}</span><span className="console-status warn">Review</span></div>)}</div> : <div className="console-empty">No urgent items found.</div>}
              </div></section>
              <section className="console-panel"><div className="console-panel-head"><h2>Last inventory monitor</h2><Activity size={16} color="#637387" /></div><div className="console-panel-body">
                {inventoryRun ? <><div className="console-list-row"><span className="console-muted">Run time</span><strong>{shortDate(inventoryRun.ran_at)}</strong></div><div className="console-list-row"><span className="console-muted">Staged</span><strong>{numberValue(inventoryRun.scholarships_staged)}</strong></div><div className="console-list-row"><span className="console-muted">Skipped</span><strong>{numberValue(inventoryRun.scholarships_skipped)}</strong></div><button className="console-button" style={{ marginTop: 10 }} onClick={() => setNotesExpanded((value) => !value)}><ChevronDown size={14} />{notesExpanded ? 'Hide notes' : 'Expand notes'}</button>{notesExpanded && <p className="console-muted" style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{stringValue(inventoryRun.notes, 'No notes recorded.')}</p>}</> : <div className="console-empty">No inventory monitor telemetry recorded.</div>}
              </div></section>
            </div>
            {stagingUnavailable && <div className="console-alert" style={{ marginTop: 14 }}><AlertTriangle size={15} />The staging table is unavailable to this project API, or its read policy is not deployed.</div>}
          </>}

          {activeView === 'pipeline' && <>
            <div className="console-eyebrow">Operations</div><h2 className="console-title">Pipeline</h2><p className="console-subtitle">Dispatch and inspect automated scholarship pipeline runs.</p>
            <section className="console-panel" style={{ marginTop: 20 }}><div className="console-panel-head"><h2>Run audit now</h2><button className="console-button primary" disabled={pipelineBusy || pipelineConfigured !== true} title={pipelineConfigured === false ? 'Audit not configured' : undefined} onClick={() => void runPipeline()}>{pipelineBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{pipelineConfigured === false ? 'Audit not configured' : 'Run audit now'}</button></div><div className="console-panel-body"><p className="console-muted" style={{ margin: 0, fontSize: 12 }}>{pipelineConfigured === null ? 'Checking configuration…' : pipelineConfigured ? 'Runs the 7:30am audit gate immediately: re-checks live scholarships and promotes, holds or rejects everything waiting in staging. New scholarships are found by the 6:47am monitor, not this button. Takes up to 2 minutes.' : 'Audit not configured.'}</p></div></section>
            <section className="console-panel" style={{ marginTop: 14 }}><div className="console-panel-head"><h2>Run history</h2><span className="console-status">{pipelineLogs.length} runs</span></div><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Time</th><th>Type</th><th>Checked</th><th>Staged / approved</th><th>Quarantined</th><th>Deactivated</th><th>Notes</th></tr></thead><tbody>{pipelineLogs.map((row) => <tr key={row.id}><td>{shortDate(row.ran_at)}</td><td>{stringValue(row.status, 'pipeline')}</td><td>{numberValue(row.scholarships_checked)}</td><td>{numberValue(row.scholarships_approved)} / {numberValue(row.scholarships_staged)}</td><td>{numberValue(row.scholarships_quarantined)}</td><td>{numberValue(row.scholarships_deactivated)}</td><td><details><summary style={{ cursor: 'pointer' }}>View</summary><p style={{ maxWidth: 360, whiteSpace: 'pre-wrap' }}>{stringValue(row.notes, 'No notes.')}</p></details></td></tr>)}</tbody></table>{!pipelineLogs.length && <div className="console-empty">No pipeline runs have been logged.</div>}</div></section>
          </>}

          {activeView === 'review' && <>
            <div className="console-eyebrow">Scholarship intake</div><h2 className="console-title">Review queue</h2><p className="console-subtitle">Review incoming scholarships before publishing to the live inventory.</p>
            {stagingUnavailable ? <div className="console-alert" style={{ marginTop: 18 }}><AlertTriangle size={15} />Staging data is unavailable. Confirm the table is exposed and has an admin-session RLS policy.</div> : <>
              <div className="console-tools" style={{ margin: '18px 0 10px' }}><button className="console-button" disabled={!selectedStage.size || pipelineBusy} onClick={() => void bulkStageAction('approve')}><Check size={14} />Send selected to gate</button><button className="console-button danger" disabled={!selectedStage.size} onClick={() => void bulkStageAction('reject')}><X size={14} />Reject selected</button><span className="console-muted" style={{ fontSize: 12 }}>{selectedStage.size} selected</span></div>
              <div className="console-panel console-table-wrap"><table className="console-table"><thead><tr><th><input aria-label="Select all" type="checkbox" checked={activeStages.length > 0 && activeStages.every((row) => selectedStage.has(row.id))} onChange={(event) => setSelectedStage(event.target.checked ? new Set(activeStages.map((row) => row.id)) : new Set())} /></th><th>Scholarship</th><th>Amount</th><th>Deadline</th><th>Class years</th><th>Status</th><th>Source</th><th>Actions</th></tr></thead><tbody>
                {activeStages.sort((left, right) => stringValue(left.deadline, '9999-12-31').localeCompare(stringValue(right.deadline, '9999-12-31'))).map((row) => {
                  const closing = row.deadline && new Date(row.deadline) >= now && new Date(row.deadline) <= twoWeeks;
                  return <tr key={row.id}><td><input aria-label={`Select ${row.name ?? 'scholarship'}`} type="checkbox" checked={selectedStage.has(row.id)} onChange={(event) => setSelectedStage((current) => { const next = new Set(current); if (event.target.checked) next.add(row.id); else next.delete(row.id); return next; })} /></td>
                    <td><button style={{ border: 0, padding: 0, background: 'none', color: '#16324a', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }} onClick={() => setExpandedStage(expandedStage === row.id ? null : row.id)}>{row.name || 'Untitled'} <ChevronDown size={12} /></button>{expandedStage === row.id && <div style={{ marginTop: 10, minWidth: 240, maxWidth: 420, color: '#667584', fontSize: 11 }}><p><strong>Raw eligibility:</strong> {stringValue(row.eligibility_raw, 'Not provided')}</p><p><strong>Application:</strong> <a href={stringValue(row.application_url, '#')} target="_blank" rel="noreferrer">{stringValue(row.application_url, 'No URL')}</a></p><p><strong>Audit criteria:</strong> {typeof row.audit_criteria === 'string' ? row.audit_criteria : JSON.stringify(row.audit_criteria ?? 'Not provided')}</p></div>}</td>
                    <td><input className="console-field" type="number" min="0" value={stringValue(String(row.award_amount ?? ''))} onChange={(event) => updateStageValue(row.id, 'award_amount', event.target.value)} /></td>
                    <td><input className="console-field" type="date" value={stringValue(row.deadline)} onChange={(event) => updateStageValue(row.id, 'deadline', event.target.value)} />{closing && <div style={{ marginTop: 5 }}><span className="console-status warn">Closing soon</span></div>}</td>
                    <td><input className="console-field" aria-label="Eligible class years, comma separated" placeholder="junior, senior" value={Array.isArray(row.allowed_class_years) ? row.allowed_class_years.join(', ') : stringValue(row.allowed_class_years)} onChange={(event) => updateStageClassYears(row.id, event.target.value)} /></td>
                    <td>{stageStatusBadge(stringValue(row.status, 'needs_review'))}</td><td>{stringValue(row.source, 'Unknown')}</td><td><div className="console-tools"><button className="console-button primary" disabled={pipelineBusy} title="Re-runs the pre-publish gate on this row; it goes live only if every check passes" onClick={() => void publishStage(row)}>Send to gate</button><button className="console-button danger" onClick={() => { const reason = window.prompt('Reason for rejection:'); if (reason) void rejectStage(row, reason); }}>Reject</button></div></td></tr>;
                })}
              </tbody></table>{!activeStages.length && <div className="console-empty">The review queue is clear.</div>}</div>
            </>}
          </>}

          {activeView === 'scholarships' && <>
            <div className="console-eyebrow">Inventory</div><h2 className="console-title">Live scholarships</h2><p className="console-subtitle">Track availability, link checks, and quarantine status.</p>
            <section className="console-panel" style={{ marginTop: 18 }}><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Scholarship</th><th>Amount</th><th>Deadline</th><th>Link status</th><th>Last checked</th><th>Active</th><th>Actions</th></tr></thead><tbody>
              {scholarships.map((row) => <tr key={row.id}><td><strong>{row.name}</strong><div className="console-muted">{row.provider}</div>{row.quarantine_reason && <div className="console-status bad" style={{ marginTop: 5 }}>{row.quarantine_reason}</div>}</td>
                <td>{scholarshipDraft?.id === row.id ? <input className="console-field" type="number" value={scholarshipDraft.award_amount ?? 0} onChange={(event) => setScholarshipDraft({ ...scholarshipDraft, award_amount: Number(event.target.value) })} /> : money(numberValue(row.award_amount))}</td>
                <td>{scholarshipDraft?.id === row.id ? <input className="console-field" type="date" value={scholarshipDraft.deadline ?? ''} onChange={(event) => setScholarshipDraft({ ...scholarshipDraft, deadline: event.target.value })} /> : dateLabel(row.deadline)}</td>
                <td><span className={`console-status ${row.link_status === 'ok' || row.link_status === 'active' ? 'good' : row.link_status === 'broken' ? 'bad' : 'warn'}`}>{row.link_status ?? 'unchecked'}</span></td><td>{shortDate(row.link_checked_at)}</td>
                <td><input type="checkbox" aria-label={`Active ${row.name}`} checked={row.is_active === true} onChange={async (event) => { const { error } = await supabase.from('scholarships').update({ is_active: event.target.checked }).eq('id', row.id); if (error) toast({ variant: 'destructive', title: 'Could not update status', description: error.message }); else await loadConsoleData(); }} /></td>
                <td><div className="console-tools">{scholarshipDraft?.id === row.id ? <><button className="console-button primary" onClick={() => void saveScholarship()}>Save</button><button className="console-button" onClick={() => setScholarshipDraft(null)}>Cancel</button></> : <><button className="console-button" onClick={() => setScholarshipDraft({ ...row })}>Edit</button><button className="console-button" onClick={() => void recheckLink(row.id)}><RefreshCw size={13} />Re-check</button>{row.application_url && <a className="console-button" href={row.application_url} target="_blank" rel="noreferrer"><ExternalLink size={13} /></a>}</>}</div></td>
              </tr>)}
            </tbody></table>{!scholarships.length && <div className="console-empty">No scholarship records found.</div>}</div></section>
          </>}

          {activeView === 'students' && <>
            <div className="console-eyebrow">Student records</div><h2 className="console-title">Students</h2><p className="console-subtitle">Search and export student profile records.</p>
            <div className="console-tools" style={{ margin: '18px 0 10px' }}><div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 400 }}><Search size={14} style={{ position: 'absolute', left: 9, top: 10, color: '#8794a0' }} /><input className="console-field" style={{ paddingLeft: 30 }} value={studentSearch} placeholder="Search name, email, school, major" onChange={(event) => { setStudentPage(0); setStudentSearch(event.target.value); }} /></div><button className="console-button" onClick={() => setRevealEmails((current) => current.size ? new Set() : new Set(profileRows.map((row) => row.user_id)))}><SlidersHorizontal size={14} />{revealEmails.size ? 'Mask emails' : 'Reveal emails'}</button><button className="console-button" onClick={exportStudents}><Download size={14} />Export CSV</button></div>
            <section className="console-panel"><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Student</th><th>Email</th><th>School</th><th>Major</th><th>GPA</th><th>Class</th><th>Created</th><th>Profile</th><th>Resume</th></tr></thead><tbody>{pagedProfiles.map((row) => <tr key={row.user_id}><td>{`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Student'}</td><td>{row.email ? revealEmails.has(row.user_id) ? row.email : maskEmail(row.email) : '—'}{row.email && <button aria-label="Toggle email visibility" onClick={() => setRevealEmails((current) => { const next = new Set(current); if (next.has(row.user_id)) next.delete(row.user_id); else next.add(row.user_id); return next; })} style={{ marginLeft: 5, border: 0, background: 'none', color: '#47718e', cursor: 'pointer' }}>◉</button>}</td><td>{row.school?.replace(/_/g, ' ') ?? '—'}</td><td>{row.major ?? '—'}</td><td>{row.gpa ?? '—'}</td><td>{row.graduation_year ?? '—'}</td><td>{shortDate(row.created_at)}</td><td>{row.first_name && row.last_name && row.school && row.major && row.graduation_year && row.gpa !== null ? <span className="console-status good">Complete</span> : <span className="console-status warn">Incomplete</span>}</td><td>{row.resume_url ? 'Yes' : 'No'}</td></tr>)}</tbody></table>{!pagedProfiles.length && <div className="console-empty">No student records match this search.</div>}</div><div className="console-panel-head"><span className="console-muted">{filteredProfiles.length} students</span><div className="console-tools"><button className="console-button" disabled={studentPage === 0} onClick={() => setStudentPage((page) => Math.max(0, page - 1))}>Previous</button><span className="console-muted" style={{ fontSize: 11 }}>Page {studentPage + 1} of {Math.max(1, Math.ceil(filteredProfiles.length / pageSize))}</span><button className="console-button" disabled={(studentPage + 1) * pageSize >= filteredProfiles.length} onClick={() => setStudentPage((page) => page + 1)}>Next</button></div></div></section>
          </>}

          {activeView === 'students' && <section className="console-panel" style={{ marginTop: 14 }}><div className="console-panel-head"><h2>Application tracker counts</h2><span className="console-muted">{applications.length} tracked applications</span></div><div className="console-list" style={{ padding: '4px 17px' }}>{filteredProfiles.map((row) => <div className="console-list-row" key={row.user_id}><span>{`${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || row.email || 'Student'}</span><strong>{applicationCounts[row.user_id] ?? 0}</strong></div>)}{!filteredProfiles.length && <div className="console-empty">No tracker records to show.</div>}</div></section>}

          {activeView === 'health' && <>
            <div className="console-eyebrow">Automations</div><h2 className="console-title">System health</h2><p className="console-subtitle">Latest telemetry available to this project.</p>
            <section className="console-panel" style={{ marginTop: 18 }}><div className="console-panel-head"><h2>Automated jobs</h2><HeartPulse size={16} /></div><div className="console-table-wrap"><table className="console-table"><thead><tr><th>Job</th><th>Latest status</th><th>Last event</th><th>Telemetry</th></tr></thead><tbody>{[
              { name: 'Midnight deactivation', status: pipelineLogs.find((row) => row.status === 'maintenance')?.status, at: pipelineLogs.find((row) => row.status === 'maintenance')?.ran_at },
              { name: '9am scholarship reminders', status: null, at: null },
              { name: 'Monday quality check', status: pipelineLogs.find((row) => row.status === 'quality_check' || row.status === 'clean' || row.status === 'issues_found')?.status, at: pipelineLogs.find((row) => row.status === 'quality_check' || row.status === 'clean' || row.status === 'issues_found')?.ran_at },
              { name: 'New-scholarship trigger', status: null, at: null },
            ].map((job) => <tr key={job.name}><td>{job.name}</td><td>{job.status ?? 'no telemetry'}</td><td>{shortDate(job.at)}</td><td>{job.status ? <span className="console-status good">pipeline_logs</span> : <span className="console-status">no telemetry</span>}</td></tr>)}</tbody></table></div></section>
            <div className="console-grid console-two-col" style={{ marginTop: 14 }}><section className="console-panel"><div className="console-panel-head"><h2>Edge functions</h2><Activity size={16} /></div><div className="console-panel-body"><div className="console-list">{['admin-verify-pin', 'admin-set-pin', 'admin-run-pipeline', 'admin-metrics', 'maintenance-runner', 'scholarship-reminders', 'scholarship-quality-check', 'notify-new-scholarship', 'score-and-validate'].map((name) => <div className="console-list-row" key={name}><span>{name}</span><span className="console-status">Deployed status unavailable</span></div>)}</div></div></section><section className="console-panel"><div className="console-panel-head"><h2>Email delivery</h2><Activity size={16} /></div><div className="console-panel-body"><div className="console-empty">no telemetry. Resend send logs are not stored in the project schema.</div></div></section></div>
          </>}
        </main>
      </div>
    </div>
  </>;
}
