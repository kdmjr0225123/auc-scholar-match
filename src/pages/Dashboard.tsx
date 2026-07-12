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

const daysUntil = (deadline: string): number => {
  const diff = new Date(deadline).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const deadlineBadge = (deadline: string | null): { label: string; color: string } | null => {
  if (!deadline) return null;
  const days = daysUntil(deadline);
  if (days <= 7) return { label: `${days}d left`, color: '#ef4444' };
  if (days <= 30) return { label: `${days}d left`, color: '#f97316' };
  return null;
};

export default function Dashboard() {
  const { user, signOut, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [matched, setMatched] = useState<MatchedScholarship[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'scholarships' | 'profile' | 'admin'>('scholarships');

  const totalAvailable = matched.reduce((s, m) => s + (m.award_amount || 0), 0);
  const strongMatches = matched.filter(m => m.matchPercentage >= 80).length;
  const animatedTotal = useCounter(totalAvailable, 1800, revealed);

  useEffect(() => { if (user) loadData(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('dashboard-scholarship-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_rules' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    if (!loading && matched.length > 0) {
      const t = setTimeout(() => setRevealed(true), 300);
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
      matchReasons.push(`✓ ${formatSchool(profile.school)} is eligible`);

      totalCriteria++;
      const yearInRange =
        (!rules.graduation_year_min || profile.graduation_year >= rules.graduation_year_min) &&
        (!rules.graduation_year_max || profile.graduation_year <= rules.graduation_year_max);
      if (!yearInRange) return null;
      metCriteria++;
      matchReasons.push(`✓ Class of ${profile.graduation_year}`);

      if (rules.min_gpa || rules.max_gpa) {
        totalCriteria++;
        const gpaMatch = (!rules.min_gpa || profile.gpa >= rules.min_gpa) && (!rules.max_gpa || profile.gpa <= rules.max_gpa);
        if (gpaMatch) {
          metCriteria++;
          if (rules.min_gpa) matchReasons.push(`✓ GPA ${profile.gpa.toFixed(1)} meets ${rules.min_gpa.toFixed(1)} minimum`);
        } else {
          if (rules.min_gpa && profile.gpa < rules.min_gpa) failReasons.push(`✗ GPA ${profile.gpa.toFixed(1)} below ${rules.min_gpa.toFixed(1)} required`);
        }
      }

      if (rules.eligible_majors?.length > 0) {
        totalCriteria++;
        const majorMatch = rules.eligible_majors.includes(profile.major);
        if (majorMatch) { metCriteria++; matchReasons.push(`✓ ${profile.major} qualifies`); }
        else failReasons.push(`✗ ${profile.major} not in eligible majors`);
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
          *{box-sizing:border-box;margin:0;padding:0}
          .load-bg{min-height:100dvh;background:#f5f6fa;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem}
          .load-spinner{width:36px;height:36px;border:3px solid rgba(232,184,75,0.2);border-top-color:#E8B84B;border-radius:50%;animation:spin 0.8s linear infinite}
          .load-text{font-family:'DM Sans',sans-serif;font-size:0.88rem;color:#999}
          @keyframes spin{to{transform:rotate(360deg)}}
        `}</style>
        <div className="load-bg">
          <div className="load-spinner" />
          <div className="load-text">Loading your matches...</div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}

        .dash-page{background:#f5f6fa;min-height:100dvh;font-family:'DM Sans',sans-serif;padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}
        @media(min-width:768px){.dash-page{padding-bottom:0}}

        /* TOP NAV */
        .dash-nav{background:#fff;border-bottom:1px solid #ebebeb;padding:0 1.25rem;height:58px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:50;padding-top:env(safe-area-inset-top,0)}
        @media(min-width:768px){.dash-nav{padding:0 2rem;height:62px}}
        .dash-logo{font-family:'Sora',sans-serif;font-size:1.05rem;font-weight:800;color:#1a1a3e;letter-spacing:-0.02em;display:flex;align-items:center;gap:0.3rem;text-decoration:none}
        .dash-logo em{color:#E8B84B;font-style:normal}
        .dash-nav-r{display:flex;align-items:center;gap:0.5rem}
        .dash-av{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#E8B84B,#c9952a);display:flex;align-items:center;justify-content:center;font-size:0.62rem;font-weight:700;color:#1a1a3e;flex-shrink:0;cursor:pointer;border:none}
        .dash-user-name{font-size:0.82rem;font-weight:600;color:#111;display:none}
        @media(min-width:640px){.dash-user-name{display:block}}
        .btn-nav-text{background:none;border:none;font-size:0.78rem;color:#aaa;cursor:pointer;font-family:'DM Sans',sans-serif;padding:0.4rem 0.7rem;border-radius:7px;transition:color 0.15s;display:none}
        .btn-nav-text:hover{color:#555}
        @media(min-width:768px){.btn-nav-text{display:inline-flex}}
        .btn-nav-pill{background:#f5f5f5;border:1px solid #eee;font-size:0.78rem;color:#555;cursor:pointer;font-family:'DM Sans',sans-serif;padding:0.38rem 0.85rem;border-radius:8px;text-decoration:none;display:none;align-items:center;gap:0.3rem}
        @media(min-width:768px){.btn-nav-pill{display:inline-flex}}

        /* BOTTOM NAV — mobile only */
        .dash-bottom-nav{display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;background:#fff;border-top:1px solid #ebebeb;padding-bottom:env(safe-area-inset-bottom,0)}
        @media(min-width:768px){.dash-bottom-nav{display:none}}
        .dash-bnav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.22rem;padding:0.6rem 0;background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;color:#bbb;transition:color 0.15s;min-height:56px;-webkit-tap-highlight-color:transparent}
        .dash-bnav-item.active{color:#1a1a3e}
        .dash-bnav-icon{font-size:1.2rem;line-height:1}
        .dash-bnav-label{font-size:0.58rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}

        /* BODY */
        .dash-body{padding:1rem 1rem 1.5rem;max-width:1200px;margin:0 auto}
        @media(min-width:640px){.dash-body{padding:1.5rem 1.5rem 2rem}}
        @media(min-width:1024px){.dash-body{padding:1.75rem 2rem 3rem}}

        /* REVEAL BANNER */
        .reveal-banner{background:linear-gradient(135deg,#1a1a3e 0%,#2d1b69 55%,#1e3a6e 100%);border-radius:14px;padding:1.5rem 1.5rem;margin-bottom:1.25rem;position:relative;overflow:hidden;opacity:0;transform:translateY(10px);animation:revealIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s forwards}
        @media(min-width:640px){.reveal-banner{border-radius:16px;padding:2rem 2.25rem;margin-bottom:1.5rem}}
        .reveal-glow{position:absolute;top:-40px;right:-40px;width:280px;height:220px;background:radial-gradient(ellipse,rgba(232,184,75,0.1) 0%,transparent 65%);pointer-events:none}
        .reveal-label{font-size:0.62rem;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem}
        .reveal-amount{font-family:'Sora',sans-serif;font-size:clamp(2rem,8vw,3.5rem);font-weight:800;color:#E8B84B;letter-spacing:-0.03em;line-height:1;margin-bottom:0.35rem}
        .reveal-sub{font-size:0.78rem;color:rgba(255,255,255,0.38);margin-bottom:1.25rem;line-height:1.5}
        @media(min-width:640px){.reveal-sub{font-size:0.82rem;margin-bottom:1.5rem}}
        .reveal-stats{display:flex;gap:1.5rem;flex-wrap:wrap}
        @media(min-width:640px){.reveal-stats{gap:2.5rem}}
        .rev-stat-n{font-family:'Sora',sans-serif;font-size:1.25rem;font-weight:800;color:#fff}
        @media(min-width:640px){.rev-stat-n{font-size:1.4rem}}
        .rev-stat-l{font-size:0.58rem;color:rgba(255,255,255,0.28);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.05rem}

        /* SECTION LABEL */
        .dash-section-label{font-size:0.62rem;color:#aaa;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;margin-bottom:0.85rem}

        /* SCHOLARSHIP CARDS */
        .dash-grid{display:grid;grid-template-columns:1fr;gap:0.85rem}
        @media(min-width:560px){.dash-grid{grid-template-columns:repeat(2,1fr)}}
        @media(min-width:960px){.dash-grid{grid-template-columns:repeat(3,1fr)}}
        @media(min-width:1200px){.dash-grid{grid-template-columns:repeat(4,1fr)}}

        .dc{background:#fff;border:1px solid #ebebeb;border-radius:13px;padding:1.1rem;opacity:0;transform:translateY(8px);animation:cardIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;display:flex;flex-direction:column;gap:0;transition:box-shadow 0.2s,transform 0.2s}
        .dc:hover{box-shadow:0 4px 20px rgba(0,0,0,0.07);transform:translateY(-1px)}
        .dc.winner{border-color:rgba(74,222,128,0.2);background:#fcfffc}

        .dc-top{display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;margin-bottom:0.35rem}
        .dc-name{font-size:0.875rem;font-weight:700;color:#111;line-height:1.3;font-family:'Sora',sans-serif}
        .dc-pill{font-size:0.6rem;font-weight:700;padding:0.18rem 0.55rem;border-radius:100px;flex-shrink:0;white-space:nowrap}
        .p100{background:rgba(74,222,128,0.12);color:#16a34a}
        .p75{background:rgba(232,184,75,0.12);color:#b45309}

        .dc-provider{font-size:0.7rem;color:#bbb;margin-bottom:0.65rem}

        .dc-meta{display:flex;align-items:center;gap:0.65rem;margin-bottom:0.65rem;flex-wrap:wrap}
        .dc-amt{font-size:0.95rem;font-weight:700;color:#C9952A;font-family:'Sora',sans-serif}
        .dc-date{font-size:0.68rem;color:#ccc;display:flex;align-items:center;gap:0.25rem}
        .dc-urgent{font-size:0.62rem;font-weight:700;padding:0.15rem 0.5rem;border-radius:6px;background:rgba(239,68,68,0.1);color:#ef4444}

        .dc-bar{height:2px;background:#f0f0f0;border-radius:100px;overflow:hidden;margin-bottom:0.65rem}
        .dc-bar-fill{height:100%;border-radius:100px}

        /* DESCRIPTION */
        .dc-desc{font-size:0.75rem;color:#555;line-height:1.6;margin-bottom:0.65rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
        .dc-desc.expanded{display:block;-webkit-line-clamp:unset}

        /* MATCH REASONS */
        .dc-reasons-toggle{font-size:0.68rem;color:#aaa;cursor:pointer;background:none;border:none;font-family:'DM Sans',sans-serif;padding:0;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.25rem;-webkit-tap-highlight-color:transparent}
        .dc-reasons-toggle:hover{color:#777}
        .dc-reasons{display:flex;flex-direction:column;gap:0.15rem;margin-bottom:0.65rem}
        .dc-reason{font-size:0.63rem;line-height:1.4}
        .dc-reason.pass{color:#16a34a}
        .dc-reason.fail{color:#dc2626}

        /* BUTTONS */
        .dc-apply{width:100%;background:#1a1a3e;color:#fff;border:none;border-radius:9px;padding:0.7rem;font-size:0.8rem;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:background 0.15s,transform 0.1s;display:flex;align-items:center;justify-content:center;gap:0.4rem;text-decoration:none;margin-top:auto;min-height:44px;-webkit-tap-highlight-color:transparent}
        .dc-apply:hover{background:#2d1b69;transform:translateY(-1px)}
        .dc-apply:active{transform:scale(0.98)}

        /* EMPTY */
        .dash-empty{text-align:center;padding:3rem 1.5rem;background:#fff;border-radius:14px;border:1px solid #ebebeb}
        .dash-empty h3{font-family:'Sora',sans-serif;font-size:1.1rem;font-weight:700;color:#111;margin-bottom:0.5rem}
        .dash-empty p{font-size:0.82rem;color:#aaa;margin-bottom:1.5rem;line-height:1.6}
        .btn-update{background:#1a1a3e;color:#fff;border:none;border-radius:9px;padding:0.7rem 1.5rem;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;min-height:44px}

        @keyframes revealIn{to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.reveal-banner,.dc{animation:none;opacity:1;transform:none}}
      `}</style>

      <div className="dash-page">
        {/* TOP NAV */}
        <nav className="dash-nav">
          <Link className="dash-logo" to="/">🎓 <em>Elev</em>aid</Link>
          <div className="dash-nav-r">
            {userRole === 'admin' && <Link className="btn-nav-pill" to="/admin">⚙ Admin</Link>}
            <Link className="btn-nav-pill" to="/profile">Profile</Link>
            <span className="dash-user-name">{profile?.first_name}</span>
            <button className="btn-nav-text" onClick={handleSignOut}>Sign out</button>
            <button
              className="dash-av"
              onClick={handleSignOut}
              title="Sign out"
              style={{ display: 'flex' }}
            >
              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
            </button>
          </div>
        </nav>

        {/* DASHBOARD BODY */}
        <div className="dash-body">
          {/* REVEAL BANNER */}
          <div className="reveal-banner">
            <div className="reveal-glow" />
            <div className="reveal-label">Matched to your profile</div>
            <div className="reveal-amount">${animatedTotal.toLocaleString()}</div>
            <div className="reveal-sub">
              available to you as a {profile && formatSchool(profile.school)} {profile?.major} student
            </div>
            <div className="reveal-stats">
              <div>
                <div className="rev-stat-n">{matched.length}</div>
                <div className="rev-stat-l">Matches</div>
              </div>
              <div>
                <div className="rev-stat-n">{strongMatches}</div>
                <div className="rev-stat-l">100% fit</div>
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
              <p>New scholarships are added weekly. Check back soon — or update your profile if anything has changed.</p>
              <Link to="/profile"><button className="btn-update">Update Profile</button></Link>
            </div>
          ) : (
            <>
              <div className="dash-section-label">Your matches — sorted by best fit</div>
              <div className="dash-grid">
                {matched.map((s, i) => {
                  const isExpanded = expandedId === s.id;
                  const badge = deadlineBadge(s.deadline);
                  return (
                    <div
                      key={s.id}
                      className={`dc${s.matchPercentage >= 80 ? ' winner' : ''}`}
                      style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                    >
                      <div className="dc-top">
                        <div className="dc-name">{s.name}</div>
                        <div className={`dc-pill ${s.matchPercentage >= 80 ? 'p100' : 'p75'}`}>
                          {s.matchPercentage}%
                        </div>
                      </div>

                      <div className="dc-provider">{s.provider}</div>

                      <div className="dc-meta">
                        <span className="dc-amt">${s.award_amount?.toLocaleString()}</span>
                        {s.deadline && (
                          <span className="dc-date">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                            {new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                        {badge && <span className="dc-urgent">{badge.label}</span>}
                      </div>

                      <div className="dc-bar">
                        <div className="dc-bar-fill" style={{ width: `${s.matchPercentage}%`, background: s.matchPercentage >= 80 ? '#4ade80' : '#E8B84B' }} />
                      </div>

                      {/* DESCRIPTION */}
                      {s.description && (
                        <div className={`dc-desc${isExpanded ? ' expanded' : ''}`}>
                          {s.description}
                        </div>
                      )}

                      {/* MATCH REASONS — collapsible */}
                      <button
                        className="dc-reasons-toggle"
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      >
                        {isExpanded ? '▲ Hide details' : '▼ Why you qualify'}
                      </button>

                      {isExpanded && (
                        <div className="dc-reasons">
                          {s.matchReasons.map((r, ri) => (
                            <div key={ri} className={`dc-reason ${r.startsWith('✓') ? 'pass' : 'fail'}`}>{r}</div>
                          ))}
                        </div>
                      )}

                      <a
                        className="dc-apply"
                        href={s.application_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Apply Now
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                      </a>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* MOBILE BOTTOM NAV */}
        <nav className="dash-bottom-nav">
          <button
            className={`dash-bnav-item${activeTab === 'scholarships' ? ' active' : ''}`}
            onClick={() => setActiveTab('scholarships')}
          >
            <span className="dash-bnav-icon">🏠</span>
            <span className="dash-bnav-label">Scholarships</span>
          </button>
          <button
            className={`dash-bnav-item${activeTab === 'profile' ? ' active' : ''}`}
            onClick={() => { setActiveTab('profile'); navigate('/profile'); }}
          >
            <span className="dash-bnav-icon">👤</span>
            <span className="dash-bnav-label">Profile</span>
          </button>
          {userRole === 'admin' && (
            <button
              className={`dash-bnav-item${activeTab === 'admin' ? ' active' : ''}`}
              onClick={() => { setActiveTab('admin'); navigate('/admin'); }}
            >
              <span className="dash-bnav-icon">⚙️</span>
              <span className="dash-bnav-label">Admin</span>
            </button>
          )}
          <button
            className="dash-bnav-item"
            onClick={handleSignOut}
          >
            <span className="dash-bnav-icon">↩</span>
            <span className="dash-bnav-label">Sign Out</span>
          </button>
        </nav>
      </div>
    </>
  );
}
