import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { StudentProfile, Scholarship, EligibilityRule, School } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { GraduationCap, Settings, Calendar, ExternalLink, ChevronDown, ChevronUp, Star, User, Check, Undo2, Loader2, CheckCircle2, FileText, Upload } from 'lucide-react';
import { getSchoolTheme } from '@/lib/schoolTheme';

interface MatchedScholarship extends Scholarship {
  matchPercentage: number;
  matchReasons: string[];
  eligibilityRules: EligibilityRule;
}

interface AppliedScholarship {
  applicationId: string;
  appliedAt: string;
  scholarship: Scholarship;
}

function useCounter(target: number, duration: number, trigger: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger || target === 0) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setValue(Math.floor(start));
      if (start >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [trigger, target, duration]);
  return value;
}

const formatSchool = (school: School): string => ({
  morehouse: 'Morehouse',
  spelman: 'Spelman',
  clark_atlanta: 'Clark Atlanta',
  morris_brown: 'Morris Brown',
}[school] || school);

export default function Dashboard() {
  const { user, signOut, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [matched, setMatched] = useState<MatchedScholarship[]>([]);
  const [applied, setApplied] = useState<AppliedScholarship[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [view, setView] = useState<'matches' | 'applied'>('matches');
  const [resumeBusy, setResumeBusy] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Applied scholarships are tracked but shouldn't clutter the "still deciding"
  // list — they live in their own Applied section instead.
  const openMatches = matched.filter(m => !appliedIds.has(m.id));
  const totalAvailable = openMatches.reduce((s, m) => s + (m.award_amount || 0), 0);
  const strongMatches = openMatches.filter(m => m.matchPercentage >= 80).length;
  const animatedTotal = useCounter(totalAvailable, 1600, revealed);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('dashboard-scholarship-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_rules' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!loading && matched.length > 0) {
      const t = setTimeout(() => setRevealed(true), 250);
      return () => clearTimeout(t);
    }
  }, [loading, matched.length]);

  const loadData = async () => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    if (!user) return;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('student_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profileData) { setLoading(false); return; }
      setProfile(profileData as StudentProfile);

      const { data: scholarshipsData, error: scholarshipsError } = await supabase
        .from('scholarships').select('*, eligibility_rules (*)').eq('is_active', true);
      if (scholarshipsError) throw scholarshipsError;

      setMatched(calculateMatches(profileData as StudentProfile, scholarshipsData || []));

      const { data: appsData, error: appsError } = await supabase
        .from('student_applications')
        .select('id, applied_at, scholarships (*)')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false });
      if (appsError) throw appsError;

      const appliedList: AppliedScholarship[] = (appsData || [])
        .filter((a: any) => a.scholarships)
        .map((a: any) => ({ applicationId: a.id, appliedAt: a.applied_at, scholarship: a.scholarships as Scholarship }));
      setApplied(appliedList);
      setAppliedIds(new Set(appliedList.map(a => a.scholarship.id)));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error loading data', description: err.message });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const calculateMatches = (profile: StudentProfile, scholarships: any[]): MatchedScholarship[] => {
    return scholarships.map(scholarship => {
      const rules = scholarship.eligibility_rules;
      if (!rules) return null;
      const matchReasons: string[] = [];
      const failReasons: string[] = [];
      let totalCriteria = 0;
      let metCriteria = 0;

      totalCriteria++;
      const schoolMatch = !rules.eligible_schools || rules.eligible_schools.length === 0 || rules.eligible_schools.includes(profile.school);
      if (!schoolMatch) return null;
      metCriteria++;
      matchReasons.push(`School: ${formatSchool(profile.school)} is eligible`);

      totalCriteria++;
      const yearInRange =
        (!rules.graduation_year_min || profile.graduation_year >= rules.graduation_year_min) &&
        (!rules.graduation_year_max || profile.graduation_year <= rules.graduation_year_max);
      if (!yearInRange) return null;
      metCriteria++;
      if (rules.graduation_year_min && rules.graduation_year_max) {
        matchReasons.push(`Graduation Year: ${profile.graduation_year} is within ${rules.graduation_year_min}–${rules.graduation_year_max}`);
      } else {
        matchReasons.push(`Graduation Year: ${profile.graduation_year} (no restriction)`);
      }

      if (rules.min_gpa || rules.max_gpa) {
        totalCriteria++;
        const gpaMatch = (!rules.min_gpa || profile.gpa >= rules.min_gpa) && (!rules.max_gpa || profile.gpa <= rules.max_gpa);
        if (gpaMatch) {
          metCriteria++;
          if (rules.min_gpa) matchReasons.push(`GPA: ${profile.gpa.toFixed(1)} ≥ ${rules.min_gpa.toFixed(1)} minimum`);
        } else {
          if (rules.min_gpa && profile.gpa < rules.min_gpa) failReasons.push(`GPA: ${profile.gpa.toFixed(1)} below ${rules.min_gpa.toFixed(1)} minimum`);
        }
      }

      if (rules.eligible_majors?.length > 0) {
        totalCriteria++;
        const majorMatch = rules.eligible_majors.includes(profile.major);
        if (majorMatch) { metCriteria++; matchReasons.push(`Major: ${profile.major} is eligible`); }
        else failReasons.push(`Major: ${profile.major} not in eligible list`);
      }

      return {
        ...scholarship,
        matchPercentage: Math.round((metCriteria / totalCriteria) * 100),
        matchReasons: [...matchReasons.map(r => `pass:${r}`), ...failReasons.map(r => `fail:${r}`)],
        eligibilityRules: rules,
      } as MatchedScholarship;
    })
    .filter((s): s is MatchedScholarship => s !== null)
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
  };

  const handleMarkApplied = async (scholarship: MatchedScholarship) => {
    if (!user) return;
    setMarkingId(scholarship.id);
    try {
      const { data, error } = await supabase
        .from('student_applications')
        .upsert(
          { user_id: user.id, scholarship_id: scholarship.id, status: 'applied' },
          { onConflict: 'user_id,scholarship_id' }
        )
        .select('id, applied_at')
        .single();
      if (error) throw error;

      setAppliedIds(prev => new Set(prev).add(scholarship.id));
      setApplied(prev => [{ applicationId: data.id, appliedAt: data.applied_at, scholarship }, ...prev]);
      toast({ title: 'Marked as applied', description: `${scholarship.name} moved to your Applied section.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating application', description: err.message });
    } finally {
      setMarkingId(null);
    }
  };

  const handleUnmarkApplied = async (scholarshipId: string) => {
    if (!user) return;
    setMarkingId(scholarshipId);
    try {
      const { error } = await supabase
        .from('student_applications')
        .delete()
        .eq('user_id', user.id)
        .eq('scholarship_id', scholarshipId);
      if (error) throw error;

      setAppliedIds(prev => { const next = new Set(prev); next.delete(scholarshipId); return next; });
      setApplied(prev => prev.filter(a => a.scholarship.id !== scholarshipId));
      toast({ title: 'Moved back to your matches' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating application', description: err.message });
    } finally {
      setMarkingId(null);
    }
  };

  // Quick access to the resume already on file (see Profile) right at the
  // point a student is about to apply externally, instead of making them
  // navigate to /profile first to grab it. Reuses profile.resume_url, which
  // is already loaded — no extra fetch needed.
  const handleResumeQuickAccess = async () => {
    if (!profile?.resume_url) {
      toast({ title: 'No resume on file', description: "Add one from your profile so it's ready to attach." });
      navigate('/profile');
      return;
    }
    setResumeBusy(true);
    try {
      const { data, error } = await supabase.storage.from('resumes').createSignedUrl(profile.resume_url, 3600);
      if (error || !data?.signedUrl) throw error || new Error('No signed URL returned');
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error opening resume', description: 'Please try again.' });
    } finally {
      setResumeBusy(false);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  // Derived straight from this student's own loaded profile — null until
  // `profile` is actually fetched for the signed-in user, so there's no
  // window where a previous session's color could show through.
  const theme = getSchoolTheme(profile?.school);

  if (loading) {
    return (
      <div className="ev-reset ev-shell-light" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="ev-spinner" />
        <div style={{ fontSize: '0.88rem', color: 'var(--ev-ink-faint)' }}>Finding your matches…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .dash-nav { padding: 0 1.5rem; padding-top: env(safe-area-inset-top, 0px); height: auto; min-height: 62px; border-bottom-width: 2px; transition: border-color 0.25s ease; }
        .dash-nav-r { display: flex; align-items: center; gap: 0.4rem; }
        .dash-av { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--ev-gold), var(--ev-gold-600)); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: var(--ev-navy-deep); flex-shrink: 0; }

        .dash-body { padding: 1.75rem 1.5rem calc(3rem + env(safe-area-inset-bottom, 0px)); max-width: 1160px; margin: 0 auto; }

        .reveal-banner {
          background: linear-gradient(150deg, #0F1D31 0%, #14233A 60%, #0A1628 100%);
          border-radius: var(--ev-radius-lg); padding: 2rem 2.25rem; margin-bottom: 1.5rem;
          position: relative; overflow: hidden;
          opacity: 0; transform: translateY(10px);
          animation: ev-fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
          border-left: 4px solid transparent;
        }
        .reveal-glow { position: absolute; top: -40px; right: -40px; width: 260px; height: 200px; background: radial-gradient(ellipse, rgba(232,184,75,0.09) 0%, transparent 65%); pointer-events: none; }
        .reveal-school-tag { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--ev-radius-full); margin-bottom: 0.75rem; }
        .reveal-label { font-size: 0.65rem; color: var(--ev-text-faint); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem; }
        .reveal-amount { font-family: var(--ev-font-display); font-size: clamp(2.25rem, 5vw, 3.25rem); font-weight: 700; color: var(--ev-gold); letter-spacing: -0.03em; line-height: 1; margin-bottom: 0.4rem; }
        .reveal-sub { font-size: 0.82rem; color: var(--ev-text-muted); margin-bottom: 1.5rem; }
        .reveal-stats { display: flex; gap: 2.5rem; flex-wrap: wrap; }
        .rev-stat-n { font-family: var(--ev-font-display); font-size: 1.3rem; font-weight: 700; color: #fff; }
        .rev-stat-l { font-size: 0.6rem; color: var(--ev-text-faint); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.05rem; }

        .dash-section-label { font-size: 0.65rem; color: var(--ev-ink-faint); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 1rem; }
        .dash-view-tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; }
        .dash-view-tab {
          background: none; border: 1px solid var(--ev-border-light); border-radius: var(--ev-radius-full);
          padding: 0.45rem 1rem; font-size: 0.78rem; font-weight: 600; color: var(--ev-ink-faint);
          cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 0.4rem;
        }
        .dash-view-tab:hover { color: var(--ev-ink); }
        .dash-view-tab.active { background: var(--ev-ink); border-color: var(--ev-ink); color: #fff; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1rem; }
        .dc {
          padding: 1.25rem; opacity: 0; transform: translateY(8px);
          animation: ev-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
          display: flex; flex-direction: column;
        }
        .dc.winner { border-color: var(--ev-success-soft); }
        .dc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.55rem; gap: 0.5rem; }
        .dc-name { font-size: 0.88rem; font-weight: 700; color: var(--ev-ink); line-height: 1.3; font-family: var(--ev-font-display); }
        .dc-provider { font-size: 0.72rem; color: var(--ev-ink-faint); margin-bottom: 0.6rem; }
        .dc-meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.6rem; }
        .dc-amt { font-size: 0.88rem; font-weight: 700; color: var(--ev-gold-600); }
        .dc-date { font-size: 0.72rem; color: var(--ev-ink-faint); display: flex; align-items: center; gap: 0.3rem; }
        .dc-bar { height: 3px; background: var(--ev-border-light); border-radius: 100px; overflow: hidden; margin-bottom: 0.65rem; }
        .dc-bar-fill { height: 100%; border-radius: 100px; }
        .dc-reasons { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.75rem; flex: 1; }
        .dc-reason { font-size: 0.66rem; line-height: 1.4; }
        .dc-reason.pass { color: var(--ev-success); }
        .dc-reason.fail { color: var(--ev-danger); }
        .dc-apply { margin-top: auto; }
        .dc-view { margin-top: auto; }
        .dc-apply-row { display: flex; gap: 0.5rem; margin-top: auto; }
        .dc-apply-row .dc-apply, .dc-apply-row .dc-view { margin-top: 0; flex: 1; }
        .dc-resume-btn {
          flex-shrink: 0; width: 42px; border-radius: var(--ev-radius-md);
          border: 1px solid var(--ev-border-light); background: var(--ev-surface-light);
          color: var(--ev-ink-faint); display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s;
        }
        .dc-resume-btn:hover:not(:disabled) { color: var(--ev-gold-600); border-color: var(--ev-gold-border); background: var(--ev-gold-soft); }
        .dc-resume-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .dc-mark-applied {
          margin-top: 0.5rem; background: none; border: 1px solid var(--ev-border-light);
          border-radius: var(--ev-radius-md); padding: 0.55rem; font-size: 0.76rem; font-weight: 600;
          color: var(--ev-ink-faint); cursor: pointer; display: flex; align-items: center; justify-content: center;
          gap: 0.35rem; transition: all 0.15s; width: 100%;
        }
        .dc-mark-applied:hover:not(:disabled) { color: var(--ev-success); border-color: var(--ev-success-soft); background: var(--ev-success-soft); }
        .dc-mark-applied:disabled { opacity: 0.6; cursor: not-allowed; }

        .dc-applied-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; font-weight: 700; color: var(--ev-success); }
        .dc-applied-date { font-size: 0.72rem; color: var(--ev-ink-faint); margin-bottom: 0.75rem; }
        .dc-unmark {
          margin-top: 0.5rem; background: none; border: none; color: var(--ev-ink-faint);
          font-size: 0.72rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center;
          gap: 0.3rem; padding: 0.3rem 0; align-self: flex-start;
        }
        .dc-unmark:hover:not(:disabled) { color: var(--ev-ink); }
        .dc-unmark:disabled { opacity: 0.6; cursor: not-allowed; }

        .dash-empty { text-align: center; padding: 4rem 2rem; }
        .dash-empty h3 { font-family: var(--ev-font-display); font-size: 1.15rem; font-weight: 700; color: var(--ev-ink); margin-bottom: 0.5rem; }
        .dash-empty p { font-size: 0.85rem; color: var(--ev-ink-faint); margin-bottom: 1.5rem; }

        /* Mobile app-shell bottom tab bar. Additive only — the top nav keeps
           Sign Out / Admin exactly as-is on every screen size. This just
           gives the installed-PWA experience a native-app navigation feel. */
        .dash-tabbar { display: none; }
        @media (max-width: 680px) {
          .dash-body { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); }
          .dash-tabbar {
            display: flex;
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
            background: var(--ev-surface-light);
            border-top: 1px solid var(--ev-border-light);
            padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
            justify-content: space-around;
          }
          .dash-tab {
            display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
            font-size: 0.65rem; font-weight: 600; color: var(--ev-ink-faint);
            padding: 0.3rem 1.1rem; border-radius: var(--ev-radius-md);
            text-decoration: none; background: none; border: none; cursor: pointer;
          }
          .dash-tab.active { color: var(--ev-ink); }
        }
      `}</style>

      <div className="ev-reset ev-shell-light">
        <nav className="ev-nav ev-nav-light dash-nav" style={{ borderBottomColor: theme ? theme.border : undefined }}>
          <Link className="ev-logo" to="/" style={{ color: 'var(--ev-ink)' }}>
            <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
            <span><em className="ev-logo-em">Elev</em>aid</span>
          </Link>
          <div className="dash-nav-r">
            {userRole === 'admin' && (
              <Link className="ev-btn ev-btn-outline-light" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }} to="/admin">
                <Settings size={13} /> Admin
              </Link>
            )}
            <Link className="ev-btn ev-btn-outline-light" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }} to="/profile">Profile</Link>
            <button className="ev-btn ev-btn-ghost-light" style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }} onClick={handleSignOut}>Sign Out</button>
          </div>
        </nav>

        <div className="dash-body">
          <div
            className="reveal-banner"
            ref={bannerRef}
            style={{
              background: theme ? theme.gradient : undefined,
              borderLeftColor: theme ? theme.light : 'transparent',
            }}
          >
            <div className="reveal-glow" />
            {theme && (
              <div className="reveal-school-tag" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}>
                {theme.short}
              </div>
            )}
            <div className="reveal-label">Scholarships matched to your profile</div>
            <div className="reveal-amount">${animatedTotal.toLocaleString()}</div>
            <div className="reveal-sub">
              available to you as a {profile && formatSchool(profile.school)} {profile?.major} student right now
            </div>
            <div className="reveal-stats">
              <div>
                <div className="rev-stat-n">{openMatches.length}</div>
                <div className="rev-stat-l">Total matches</div>
              </div>
              <div>
                <div className="rev-stat-n">{strongMatches}</div>
                <div className="rev-stat-l">100% match</div>
              </div>
              <div>
                <div className="rev-stat-n">{profile?.gpa.toFixed(1)}</div>
                <div className="rev-stat-l">Your GPA</div>
              </div>
            </div>
          </div>

          <div className="dash-view-tabs">
            <button className={`dash-view-tab${view === 'matches' ? ' active' : ''}`} onClick={() => setView('matches')}>
              Your Matches
            </button>
            <button className={`dash-view-tab${view === 'applied' ? ' active' : ''}`} onClick={() => setView('applied')}>
              <CheckCircle2 size={13} /> Applied{applied.length > 0 ? ` (${applied.length})` : ''}
            </button>
          </div>

          {view === 'matches' ? (
            matched.length === 0 ? (
              <div className="dash-empty">
                <h3>No matches yet</h3>
                <p>Try updating your profile — we add new scholarships regularly.</p>
                <Link to="/profile"><button className="ev-btn ev-btn-dark">Update Profile</button></Link>
              </div>
            ) : openMatches.length === 0 ? (
              <div className="dash-empty">
                <h3>You're all caught up</h3>
                <p>You've applied to every scholarship you match with right now. Check the Applied tab, or check back — we add new scholarships regularly.</p>
                <button className="ev-btn ev-btn-dark" onClick={() => setView('applied')}>View Applied</button>
              </div>
            ) : (
              <>
                <div className="dash-section-label">Your matches — sorted by best fit</div>
                <div className="dash-grid">
                  {openMatches.map((s, i) => (
                    <div
                      key={s.id}
                      className={`ev-card-light dc${s.matchPercentage >= 80 ? ' winner' : ''}`}
                      style={{ animationDelay: `${0.12 + i * 0.05}s` }}
                    >
                      <div className="dc-top">
                        <div className="dc-name">{s.name}</div>
                        <div className={`ev-badge ${s.matchPercentage >= 80 ? 'ev-badge-success' : 'ev-badge-gold'}`}>{s.matchPercentage}%</div>
                      </div>
                      <div className="dc-provider">{s.provider}</div>
                      <div className="dc-meta">
                        <span className="dc-amt">${s.award_amount?.toLocaleString()}</span>
                        <span className="dc-date">
                          <Calendar size={12} />
                          {s.deadline ? new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'}
                        </span>
                      </div>
                      <div className="dc-bar">
                        <div className="dc-bar-fill" style={{ width: `${s.matchPercentage}%`, background: s.matchPercentage >= 80 ? 'var(--ev-success)' : 'var(--ev-gold)' }} />
                      </div>
                      <div className="dc-reasons">
                        {s.matchReasons.map((r, ri) => {
                          const pass = r.startsWith('pass:');
                          const text = r.replace(/^pass:|^fail:/, '');
                          return (
                            <div key={ri} className={`dc-reason ${pass ? 'pass' : 'fail'}`}>{pass ? '✓' : '✗'} {text}</div>
                          );
                        })}
                      </div>
                      {s.matchPercentage >= 80 ? (
                        <div className="dc-apply-row">
                          <a className="ev-btn ev-btn-dark dc-apply" href={s.application_url} target="_blank" rel="noopener noreferrer">
                            Apply on External Site <ExternalLink size={13} />
                          </a>
                          <button
                            type="button"
                            className="dc-resume-btn"
                            onClick={handleResumeQuickAccess}
                            disabled={resumeBusy}
                            title={profile?.resume_url ? 'View your resume' : 'Add a resume'}
                            aria-label={profile?.resume_url ? 'View your resume' : 'Add a resume'}
                          >
                            {resumeBusy ? <Loader2 size={14} className="animate-spin" /> : profile?.resume_url ? <FileText size={14} /> : <Upload size={14} />}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            className="ev-btn ev-btn-outline-light ev-btn-block dc-view"
                            onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                          >
                            {expandedId === s.id ? <>Hide Details <ChevronUp size={13} /></> : <>View Details <ChevronDown size={13} /></>}
                          </button>
                          {expandedId === s.id && s.application_url && (
                            <div className="dc-apply-row" style={{ marginTop: '0.5rem' }}>
                              <a
                                className="ev-btn ev-btn-dark dc-apply"
                                href={s.application_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Visit Application Site <ExternalLink size={13} />
                              </a>
                              <button
                                type="button"
                                className="dc-resume-btn"
                                onClick={handleResumeQuickAccess}
                                disabled={resumeBusy}
                                title={profile?.resume_url ? 'View your resume' : 'Add a resume'}
                                aria-label={profile?.resume_url ? 'View your resume' : 'Add a resume'}
                              >
                                {resumeBusy ? <Loader2 size={14} className="animate-spin" /> : profile?.resume_url ? <FileText size={14} /> : <Upload size={14} />}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        className="dc-mark-applied"
                        onClick={() => handleMarkApplied(s)}
                        disabled={markingId === s.id}
                      >
                        {markingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Mark as Applied
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : applied.length === 0 ? (
            <div className="dash-empty">
              <h3>No applications yet</h3>
              <p>When you mark a scholarship as applied, it'll show up here.</p>
              <button className="ev-btn ev-btn-dark" onClick={() => setView('matches')}>View Matches</button>
            </div>
          ) : (
            <>
              <div className="dash-section-label">Applied — {applied.length} scholarship{applied.length === 1 ? '' : 's'}</div>
              <div className="dash-grid">
                {applied.map((a, i) => (
                  <div
                    key={a.applicationId}
                    className="ev-card-light dc"
                    style={{ animationDelay: `${0.12 + i * 0.05}s` }}
                  >
                    <div className="dc-top">
                      <div className="dc-name">{a.scholarship.name}</div>
                      <div className="dc-applied-badge"><CheckCircle2 size={13} /> Applied</div>
                    </div>
                    <div className="dc-provider">{a.scholarship.provider}</div>
                    <div className="dc-meta">
                      <span className="dc-amt">${a.scholarship.award_amount?.toLocaleString()}</span>
                      <span className="dc-date">
                        <Calendar size={12} />
                        {a.scholarship.deadline ? new Date(a.scholarship.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'}
                      </span>
                    </div>
                    <div className="dc-applied-date">
                      Applied {new Date(a.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {a.scholarship.application_url && (
                      <div className="dc-apply-row">
                        <a className="ev-btn ev-btn-outline-light dc-view" href={a.scholarship.application_url} target="_blank" rel="noopener noreferrer">
                          View Application <ExternalLink size={13} />
                        </a>
                        <button
                          type="button"
                          className="dc-resume-btn"
                          onClick={handleResumeQuickAccess}
                          disabled={resumeBusy}
                          title={profile?.resume_url ? 'View your resume' : 'Add a resume'}
                          aria-label={profile?.resume_url ? 'View your resume' : 'Add a resume'}
                        >
                          {resumeBusy ? <Loader2 size={14} className="animate-spin" /> : profile?.resume_url ? <FileText size={14} /> : <Upload size={14} />}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="dc-unmark"
                      onClick={() => handleUnmarkApplied(a.scholarship.id)}
                      disabled={markingId === a.scholarship.id}
                    >
                      {markingId === a.scholarship.id ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                      Move back to matches
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <nav className="dash-tabbar" aria-label="Primary">
          <Link className="dash-tab active" to="/dashboard" style={{ color: theme ? theme.deep : 'var(--ev-ink)' }}>
            <Star size={19} strokeWidth={2.25} />
            Matches
          </Link>
          <Link className="dash-tab" to="/profile">
            <User size={19} strokeWidth={2.25} />
            Profile
          </Link>
        </nav>
      </div>
    </>
  );
}
