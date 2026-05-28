import { useState, useEffect, useRef } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { StudentProfile, Scholarship, EligibilityRule, School } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface MatchedScholarship extends Scholarship {
  matchPercentage: number;
  matchReasons: string[];
  eligibilityRules: EligibilityRule;
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
  const [revealed, setRevealed] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  const totalAvailable = matched.reduce((s, m) => s + (m.award_amount || 0), 0);
  const strongMatches = matched.filter(m => m.matchPercentage >= 80).length;
  const animatedTotal = useCounter(totalAvailable, 1800, revealed);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (!loading && matched.length > 0) {
      const t = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(t);
    }
  }, [loading, matched.length]);

  const loadData = async () => {
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
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error loading data', description: err.message });
    } finally {
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
      const schoolMatch = rules.eligible_schools?.length === 0 || rules.eligible_schools?.includes(profile.school);
      if (!schoolMatch) return null;
      metCriteria++;
      matchReasons.push(`✓ School: ${formatSchool(profile.school)} is eligible`);

      totalCriteria++;
      const yearInRange =
        (!rules.graduation_year_min || profile.graduation_year >= rules.graduation_year_min) &&
        (!rules.graduation_year_max || profile.graduation_year <= rules.graduation_year_max);
      if (!yearInRange) return null;
      metCriteria++;
      if (rules.graduation_year_min && rules.graduation_year_max) {
        matchReasons.push(`✓ Graduation Year: ${profile.graduation_year} is within ${rules.graduation_year_min}–${rules.graduation_year_max}`);
      } else {
        matchReasons.push(`✓ Graduation Year: ${profile.graduation_year} (no restriction)`);
      }

      if (rules.min_gpa || rules.max_gpa) {
        totalCriteria++;
        const gpaMatch = (!rules.min_gpa || profile.gpa >= rules.min_gpa) && (!rules.max_gpa || profile.gpa <= rules.max_gpa);
        if (gpaMatch) {
          metCriteria++;
          if (rules.min_gpa) matchReasons.push(`✓ GPA: ${profile.gpa.toFixed(1)} ≥ ${rules.min_gpa.toFixed(1)} minimum`);
        } else {
          if (rules.min_gpa && profile.gpa < rules.min_gpa) failReasons.push(`✗ GPA: ${profile.gpa.toFixed(1)} below ${rules.min_gpa.toFixed(1)} minimum`);
        }
      }

      if (rules.eligible_majors?.length > 0) {
        totalCriteria++;
        const majorMatch = rules.eligible_majors.includes(profile.major);
        if (majorMatch) { metCriteria++; matchReasons.push(`✓ Major: ${profile.major} is eligible`); }
        else failReasons.push(`✗ Major: ${profile.major} not in eligible list`);
      }

      return {
        ...scholarship,
        matchPercentage: Math.round((metCriteria / totalCriteria) * 100),
        matchReasons: [...matchReasons, ...failReasons],
        eligibilityRules: rules,
      } as MatchedScholarship;
    })
    .filter((s): s is MatchedScholarship => s !== null)
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
  };

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  if (loading) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          .load-bg { min-height: 100vh; background: #f5f6fa; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem; }
          .load-spinner { width: 36px; height: 36px; border: 3px solid rgba(232,184,75,0.2); border-top-color: #E8B84B; border-radius: 50%; animation: spin 0.8s linear infinite; }
          .load-text { font-family: 'DM Sans', sans-serif; font-size: 0.88rem; color: #999; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .skel { background: linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s infinite; border-radius: 8px; }
          @keyframes shimmer { to { background-position: -200% 0; } }
        `}</style>
        <div className="load-bg">
          <div className="load-spinner" />
          <div className="load-text">Finding your matches...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .dash-page { background: #f5f6fa; min-height: 100vh; font-family: 'DM Sans', sans-serif; }

        /* NAV */
        .dash-nav {
          background: #fff; border-bottom: 1px solid #ebebeb;
          padding: 0 2rem; height: 62px;
          display: flex; justify-content: space-between; align-items: center;
          position: sticky; top: 0; z-index: 50;
        }
        .dash-logo { font-family: 'Sora', sans-serif; font-size: 1.1rem; font-weight: 800; color: #1a1a3e; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.35rem; text-decoration: none; }
        .dash-logo em { color: #E8B84B; font-style: normal; }
        .dash-nav-r { display: flex; align-items: center; gap: 0.5rem; }
        .dash-user-chip { display: flex; align-items: center; gap: 0.55rem; }
        .dash-av { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #E8B84B, #c9952a); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: #1a1a3e; flex-shrink: 0; }
        .dash-user-name { font-size: 0.82rem; font-weight: 600; color: #111; }
        .btn-signout { background: none; border: none; font-size: 0.78rem; color: #aaa; cursor: pointer; font-family: 'DM Sans', sans-serif; padding: 0.4rem 0.7rem; border-radius: 7px; transition: color 0.15s; }
        .btn-signout:hover { color: #555; }
        .btn-admin { background: #f5f5f5; border: 1px solid #eee; font-size: 0.78rem; color: #555; cursor: pointer; font-family: 'DM Sans', sans-serif; padding: 0.4rem 0.85rem; border-radius: 7px; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; }

        /* BODY */
        .dash-body { padding: 1.75rem 2rem 3rem; max-width: 1200px; margin: 0 auto; }

        /* REVEAL BANNER */
        .reveal-banner {
          background: linear-gradient(135deg, #1a1a3e 0%, #2d1b69 55%, #1e3a6e 100%);
          border-radius: 16px; padding: 2rem 2.25rem;
          margin-bottom: 1.5rem;
          position: relative; overflow: hidden;
          opacity: 0; transform: translateY(12px);
          animation: revealIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
        }
        .reveal-glow {
          position: absolute; top: -40px; right: -40px;
          width: 280px; height: 220px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.1) 0%, transparent 65%);
          pointer-events: none;
        }
        .reveal-label { font-size: 0.65rem; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem; }
        .reveal-amount {
          font-family: 'Sora', sans-serif;
          font-size: clamp(2.5rem, 5vw, 3.5rem);
          font-weight: 800; color: #E8B84B;
          letter-spacing: -0.03em; line-height: 1;
          margin-bottom: 0.4rem;
        }
        .reveal-sub { font-size: 0.82rem; color: rgba(255,255,255,0.38); margin-bottom: 1.5rem; }
        .reveal-stats { display: flex; gap: 2.5rem; flex-wrap: wrap; }
        .rev-stat-n { font-family: 'Sora', sans-serif; font-size: 1.4rem; font-weight: 800; color: #fff; }
        .rev-stat-l { font-size: 0.6rem; color: rgba(255,255,255,0.28); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.05rem; }

        /* CARDS */
        .dash-section-label { font-size: 0.65rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 1rem; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
        .dc {
          background: #fff; border: 1px solid #ebebeb;
          border-radius: 14px; padding: 1.25rem;
          opacity: 0; transform: translateY(10px);
          animation: cardIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
          display: flex; flex-direction: column;
        }
        .dc.winner { border-color: rgba(74,222,128,0.18); background: #fcfffc; }
        .dc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.55rem; gap: 0.5rem; }
        .dc-name { font-size: 0.88rem; font-weight: 700; color: #111; line-height: 1.3; font-family: 'Sora', sans-serif; }
        .dc-pill { font-size: 0.62rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: 100px; flex-shrink: 0; }
        .p100 { background: rgba(74,222,128,0.12); color: #16a34a; }
        .p75 { background: rgba(232,184,75,0.12); color: #b45309; }
        .dc-provider { font-size: 0.72rem; color: #aaa; margin-bottom: 0.6rem; }
        .dc-meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.6rem; }
        .dc-amt { font-size: 0.88rem; font-weight: 700; color: #C9952A; }
        .dc-date { font-size: 0.72rem; color: #bbb; display: flex; align-items: center; gap: 0.3rem; }
        .dc-bar { height: 3px; background: #f0f0f0; border-radius: 100px; overflow: hidden; margin-bottom: 0.65rem; }
        .dc-bar-fill { height: 100%; border-radius: 100px; }
        .dc-reasons { display: flex; flex-direction: column; gap: 0.18rem; margin-bottom: 0.75rem; flex: 1; }
        .dc-reason { font-size: 0.64rem; line-height: 1.4; }
        .dc-reason.pass { color: #16a34a; }
        .dc-reason.fail { color: #dc2626; }
        .dc-apply {
          width: 100%; background: #1a1a3e; color: #fff;
          border: none; border-radius: 9px; padding: 0.65rem;
          font-size: 0.8rem; font-weight: 700; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s, transform 0.1s;
          display: flex; align-items: center; justify-content: center; gap: 0.4rem;
          text-decoration: none; margin-top: auto;
        }
        .dc-apply:hover { background: #2d1b69; transform: translateY(-1px); }
        .dc-view {
          width: 100%; background: #f8f8f8; color: #999;
          border: 1px solid #eee; border-radius: 9px; padding: 0.65rem;
          font-size: 0.8rem; font-weight: 600; cursor: pointer;
          font-family: 'DM Sans', sans-serif; margin-top: auto;
        }

        /* EMPTY */
        .dash-empty { text-align: center; padding: 4rem 2rem; }
        .dash-empty h3 { font-family: 'Sora', sans-serif; font-size: 1.2rem; font-weight: 700; color: #111; margin-bottom: 0.5rem; }
        .dash-empty p { font-size: 0.85rem; color: #aaa; margin-bottom: 1.5rem; }
        .btn-update { background: #1a1a3e; color: #fff; border: none; border-radius: 9px; padding: 0.65rem 1.5rem; font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; }

        @keyframes revealIn { to { opacity: 1; transform: translateY(0); } }
        @keyframes cardIn { to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="dash-page">
        <nav className="dash-nav">
          <Link className="dash-logo" to="/">🎓 <em>Elev</em>aid</Link>
          <div className="dash-nav-r">
            {userRole === 'admin' && <Link className="btn-admin" to="/admin">⚙ Admin</Link>}
            <Link className="btn-admin" to="/profile">Profile</Link>
            <button className="btn-signout" onClick={handleSignOut}>Sign Out</button>
          </div>
        </nav>

        <div className="dash-body">
          {/* REVEAL */}
          <div className="reveal-banner" ref={bannerRef}>
            <div className="reveal-glow" />
            <div className="reveal-label">Scholarships matched to your profile</div>
            <div className="reveal-amount">
              ${animatedTotal.toLocaleString()}
            </div>
            <div className="reveal-sub">
              available to you as a {profile && formatSchool(profile.school)} {profile?.major} student right now
            </div>
            <div className="reveal-stats">
              <div>
                <div className="rev-stat-n">{matched.length}</div>
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

          {matched.length === 0 ? (
            <div className="dash-empty">
              <h3>No matches yet</h3>
              <p>Try updating your profile — we add new scholarships every week.</p>
              <Link to="/profile"><button className="btn-update">Update Profile</button></Link>
            </div>
          ) : (
            <>
              <div className="dash-section-label">Your matches — sorted by best fit</div>
              <div className="dash-grid">
                {matched.map((s, i) => (
                  <div
                    key={s.id}
                    className={`dc${s.matchPercentage >= 80 ? ' winner' : ''}`}
                    style={{ animationDelay: `${0.15 + i * 0.06}s` }}
                  >
                    <div className="dc-top">
                      <div className="dc-name">{s.name}</div>
                      <div className={`dc-pill ${s.matchPercentage >= 80 ? 'p100' : 'p75'}`}>{s.matchPercentage}%</div>
                    </div>
                    <div className="dc-provider">{s.provider}</div>
                    <div className="dc-meta">
                      <span className="dc-amt">${s.award_amount?.toLocaleString()}</span>
                      <span className="dc-date">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        {s.deadline ? new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'}
                      </span>
                    </div>
                    <div className="dc-bar">
                      <div className="dc-bar-fill" style={{ width: `${s.matchPercentage}%`, background: s.matchPercentage >= 80 ? '#4ade80' : '#E8B84B' }} />
                    </div>
                    <div className="dc-reasons">
                      {s.matchReasons.map((r, ri) => (
                        <div key={ri} className={`dc-reason ${r.startsWith('✓') ? 'pass' : 'fail'}`}>{r}</div>
                      ))}
                    </div>
                    {s.matchPercentage >= 80 ? (
                      <a className="dc-apply" href={s.application_url} target="_blank" rel="noopener noreferrer">
                        Apply on External Site
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                      </a>
                    ) : (
                      <a className="dc-view" href={s.application_url} target="_blank" rel="noopener noreferrer">
                        View Details
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

