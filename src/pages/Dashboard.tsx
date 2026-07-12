import { useState, useEffect } from 'react';
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
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!trigger || target === 0) return;
    let n = 0;
    const step = target / (duration / 16);
    const t = setInterval(() => {
      n = Math.min(n + step, target);
      setV(Math.floor(n));
      if (n >= target) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [trigger, target, duration]);
  return v;
}

const formatSchool = (school: School) => ({
  morehouse: 'Morehouse', spelman: 'Spelman',
  clark_atlanta: 'Clark Atlanta', morris_brown: 'Morris Brown',
}[school] || school);

const daysUntil = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);

const ExternalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>
  </svg>
);

const CalIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);

export default function Dashboard() {
  const { user, signOut, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [matched, setMatched] = useState<MatchedScholarship[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalAvailable = matched.reduce((s, m) => s + (m.award_amount || 0), 0);
  const strongMatches = matched.filter(m => m.matchPercentage >= 80).length;
  const animatedTotal = useCounter(totalAvailable, 1800, revealed);

  useEffect(() => { if (user) loadData(); }, [user]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel('dash-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_rules' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    if (!loading && matched.length > 0) {
      const t = setTimeout(() => setRevealed(true), 200);
      return () => clearTimeout(t);
    }
  }, [loading, matched.length]);

  const loadData = async () => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    if (!user) return;
    try {
      const { data: p } = await supabase.from('student_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (!p) { setLoading(false); return; }
      setProfile(p as StudentProfile);
      const { data: s } = await supabase.from('scholarships').select('*, eligibility_rules (*)').eq('is_active', true);
      setMatched(calcMatches(p as StudentProfile, s || []));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally { clearTimeout(timeout); setLoading(false); }
  };

  const calcMatches = (p: StudentProfile, scholarships: any[]): MatchedScholarship[] =>
    scholarships.map(s => {
      const r = s.eligibility_rules;
      if (!r) return null;
      let total = 0, met = 0;
      const pass: string[] = [], fail: string[] = [];

      total++;
      if (!r.eligible_schools?.length || r.eligible_schools.includes(p.school)) {
        met++; pass.push(`${formatSchool(p.school)} is eligible`);
      } else return null;

      total++;
      const yr = (!r.graduation_year_min || p.graduation_year >= r.graduation_year_min) &&
                 (!r.graduation_year_max || p.graduation_year <= r.graduation_year_max);
      if (!yr) return null;
      met++; pass.push(`Class of ${p.graduation_year}`);

      if (r.min_gpa || r.max_gpa) {
        total++;
        const ok = (!r.min_gpa || p.gpa >= r.min_gpa) && (!r.max_gpa || p.gpa <= r.max_gpa);
        if (ok) { met++; if (r.min_gpa) pass.push(`GPA ${p.gpa.toFixed(1)} meets ${r.min_gpa.toFixed(1)} minimum`); }
        else if (r.min_gpa) fail.push(`GPA ${p.gpa.toFixed(1)} below ${r.min_gpa.toFixed(1)} required`);
      }

      if (r.eligible_majors?.length) {
        total++;
        if (r.eligible_majors.includes(p.major)) { met++; pass.push(`${p.major} qualifies`); }
        else fail.push(`${p.major} not in eligible list`);
      }

      return {
        ...s,
        matchPercentage: Math.round((met / total) * 100),
        matchReasons: [...pass, ...fail],
        eligibilityRules: r,
      } as MatchedScholarship;
    }).filter((s): s is MatchedScholarship => s !== null)
      .sort((a, b) => b.matchPercentage - a.matchPercentage);

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  if (loading) return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .dl{min-height:100dvh;background:#FAFAF8;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem}
        .dl-sp{width:32px;height:32px;border:2px solid rgba(200,169,81,0.2);border-top-color:#C8A951;border-radius:50%;animation:spin .8s linear infinite}
        .dl-t{font-family:'Inter',sans-serif;font-size:.82rem;color:#94A3B8}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>
      <div className="dl">
        <div className="dl-sp" />
        <div className="dl-t">Loading your matches...</div>
      </div>
    </>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        :root{
          --ink:#0F1923;--ink-mid:#4A5568;--ink-muted:#94A3B8;
          --gold:#C8A951;--green:#2D6A4F;--green-dim:rgba(45,106,79,0.1);
          --surface:#FFFFFF;--bg:#F5F6F9;
          --border:rgba(15,25,35,0.08);--border-mid:rgba(15,25,35,0.12);
          --radius:10px;--radius-lg:14px;
        }
        body{font-family:'Inter',system-ui,sans-serif;background:var(--bg)}

        /* ─── PAGE ─── */
        .d-page{min-height:100dvh;background:var(--bg);padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}
        @media(min-width:768px){.d-page{padding-bottom:0}}

        /* ─── NAV ─── */
        .d-nav{
          background:rgba(255,255,255,0.95);
          border-bottom:1px solid var(--border);
          padding:0 1.25rem;
          height:calc(58px + env(safe-area-inset-top,0px));
          padding-top:env(safe-area-inset-top,0);
          display:flex;justify-content:space-between;align-items:center;
          position:sticky;top:0;z-index:50;
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
        }
        @media(min-width:640px){.d-nav{padding:0 1.5rem}}
        @media(min-width:1024px){.d-nav{padding:0 2rem}}

        .d-logo{
          font-family:'Playfair Display',Georgia,serif;
          font-size:1.1rem;font-weight:700;color:var(--ink);
          letter-spacing:-0.02em;text-decoration:none;
          display:flex;align-items:center;gap:0.4rem;
        }
        .d-logo em{color:var(--gold);font-style:normal}
        .d-logo-mark{width:26px;height:26px;border-radius:6px;background:var(--ink);display:flex;align-items:center;justify-content:center;flex-shrink:0}

        .d-nav-r{display:flex;align-items:center;gap:0.4rem}
        .d-nav-link{
          background:#F5F6F9;border:1px solid var(--border-mid);
          font-size:.76rem;font-weight:500;color:var(--ink-mid);
          cursor:pointer;font-family:'Inter',sans-serif;
          padding:.38rem .8rem;border-radius:7px;
          text-decoration:none;display:none;align-items:center;gap:.3rem;
          transition:background .15s,color .15s;min-height:36px;
        }
        @media(min-width:640px){.d-nav-link{display:inline-flex}}
        .d-nav-link:hover{background:#ECEEF2;color:var(--ink)}

        .d-av{
          width:34px;height:34px;border-radius:50%;
          background:var(--ink);display:flex;align-items:center;justify-content:center;
          font-size:.62rem;font-weight:600;color:var(--gold);
          cursor:pointer;border:none;flex-shrink:0;
          font-family:'Inter',sans-serif;letter-spacing:.02em;
        }

        /* ─── BODY ─── */
        .d-body{padding:1.25rem 1rem 1.5rem;max-width:1280px;margin:0 auto}
        @media(min-width:640px){.d-body{padding:1.5rem 1.5rem 2rem}}
        @media(min-width:1024px){.d-body{padding:2rem 2rem 3rem}}

        /* ─── BANNER ─── */
        .d-banner{
          background:var(--ink);border-radius:var(--radius-lg);
          padding:1.75rem 1.5rem;margin-bottom:1.5rem;
          position:relative;overflow:hidden;
          opacity:0;transform:translateY(8px);
          animation:revealIn .6s cubic-bezier(.16,1,.3,1) .1s forwards;
        }
        @media(min-width:640px){.d-banner{padding:2rem 2.25rem}}

        .d-banner::before{
          content:'';position:absolute;inset:0;
          background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
                           linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
          background-size:32px 32px;pointer-events:none;
        }

        .d-banner-inner{position:relative;z-index:1}
        .d-banner-label{font-size:.6rem;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.5rem;font-weight:500}
        .d-banner-amount{
          font-family:'Playfair Display',Georgia,serif;
          font-size:clamp(2.2rem,7vw,3.5rem);
          font-weight:700;color:var(--gold);
          letter-spacing:-.025em;line-height:1;
          margin-bottom:.4rem;
        }
        .d-banner-sub{font-size:.78rem;color:rgba(255,255,255,.38);margin-bottom:1.5rem;line-height:1.5}
        .d-banner-stats{display:flex;gap:2rem;flex-wrap:wrap}
        .d-bs-n{font-family:'Playfair Display',Georgia,serif;font-size:1.25rem;font-weight:700;color:#fff}
        .d-bs-l{font-size:.58rem;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.07em;margin-top:.1rem}

        /* ─── SECTION LABEL ─── */
        .d-label{font-size:.6rem;color:var(--ink-muted);text-transform:uppercase;letter-spacing:.1em;font-weight:600;margin-bottom:1rem}

        /* ─── GRID ─── */
        .d-grid{display:grid;grid-template-columns:1fr;gap:1rem}
        @media(min-width:520px){.d-grid{grid-template-columns:repeat(2,1fr)}}
        @media(min-width:900px){.d-grid{grid-template-columns:repeat(3,1fr)}}
        @media(min-width:1200px){.d-grid{grid-template-columns:repeat(4,1fr)}}

        /* ─── CARD ─── */
        .d-card{
          background:var(--surface);border:1px solid var(--border);
          border-radius:var(--radius-lg);padding:1.25rem;
          display:flex;flex-direction:column;
          opacity:0;transform:translateY(6px);
          animation:cardIn .45s cubic-bezier(.16,1,.3,1) forwards;
          transition:box-shadow .2s,transform .2s;
        }
        .d-card:hover{box-shadow:0 4px 24px rgba(15,25,35,.06);transform:translateY(-1px)}
        .d-card.perfect{border-color:rgba(45,106,79,.2)}

        /* CARD HEADER */
        .d-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.35rem}
        .d-card-pct{
          font-size:.6rem;font-weight:700;flex-shrink:0;
          padding:.18rem .55rem;border-radius:100px;white-space:nowrap;
        }
        .pct-perfect{background:var(--green-dim);color:var(--green)}
        .pct-partial{background:rgba(200,169,81,.1);color:#92730A}

        /* CARD AMOUNT — typographic hero */
        .d-card-amount{
          font-family:'Playfair Display',Georgia,serif;
          font-size:1.75rem;font-weight:700;color:var(--gold);
          letter-spacing:-.02em;line-height:1;
          margin-bottom:.2rem;
        }

        .d-card-name{font-size:.82rem;font-weight:600;color:var(--ink);line-height:1.3;margin-bottom:.2rem}
        .d-card-provider{font-size:.68rem;color:var(--ink-muted);margin-bottom:.85rem}

        /* DEADLINE */
        .d-card-dl{display:flex;align-items:center;gap:.75rem;margin-bottom:.85rem;flex-wrap:wrap}
        .d-card-date{font-size:.68rem;color:var(--ink-muted);display:flex;align-items:center;gap:.3rem}
        .d-badge-urgent{font-size:.58rem;font-weight:700;padding:.15rem .5rem;border-radius:5px;background:rgba(220,38,38,.08);color:#DC2626}
        .d-badge-soon{font-size:.58rem;font-weight:700;padding:.15rem .5rem;border-radius:5px;background:rgba(234,88,12,.08);color:#EA580C}

        /* DIVIDER */
        .d-card-div{height:1px;background:var(--border);margin:.85rem 0}

        /* DESCRIPTION */
        .d-card-desc{
          font-size:.75rem;color:var(--ink-mid);line-height:1.65;
          margin-bottom:.85rem;
          display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;
        }
        .d-card-desc.open{display:block;-webkit-line-clamp:unset}

        /* REASONS */
        .d-reasons-btn{
          background:none;border:none;cursor:pointer;
          font-family:'Inter',sans-serif;font-size:.66rem;color:var(--ink-muted);
          padding:0;display:flex;align-items:center;gap:.25rem;
          margin-bottom:.65rem;-webkit-tap-highlight-color:transparent;
          transition:color .15s;
        }
        .d-reasons-btn:hover{color:var(--ink-mid)}

        .d-reasons{display:flex;flex-direction:column;gap:.18rem;margin-bottom:.75rem}
        .d-reason{font-size:.62rem;line-height:1.4;display:flex;align-items:flex-start;gap:.35rem}
        .d-reason-pass{color:var(--green)}
        .d-reason-fail{color:#DC2626}

        /* APPLY BUTTON */
        .d-apply{
          width:100%;background:var(--ink);color:#fff;
          border:none;border-radius:8px;padding:.75rem;
          font-size:.8rem;font-weight:600;cursor:pointer;
          font-family:'Inter',sans-serif;
          display:flex;align-items:center;justify-content:center;gap:.4rem;
          text-decoration:none;margin-top:auto;
          min-height:44px;-webkit-tap-highlight-color:transparent;
          transition:opacity .15s,transform .1s;
        }
        .d-apply:hover{opacity:.85;transform:translateY(-1px)}
        .d-apply:active{transform:scale(.98)}

        /* EMPTY */
        .d-empty{
          text-align:center;padding:3rem 1.5rem;
          background:var(--surface);border-radius:var(--radius-lg);
          border:1px solid var(--border);
        }
        .d-empty h3{
          font-family:'Playfair Display',Georgia,serif;
          font-size:1.1rem;font-weight:700;color:var(--ink);
          margin-bottom:.5rem;
        }
        .d-empty p{font-size:.82rem;color:var(--ink-muted);line-height:1.65;margin-bottom:1.5rem}
        .d-empty-btn{
          background:var(--ink);color:#fff;border:none;border-radius:8px;
          padding:.7rem 1.5rem;font-size:.82rem;font-weight:600;
          cursor:pointer;font-family:'Inter',sans-serif;min-height:44px;
        }

        /* BOTTOM NAV */
        .d-bnav{
          display:flex;position:fixed;bottom:0;left:0;right:0;z-index:50;
          background:rgba(255,255,255,.97);border-top:1px solid var(--border);
          padding-bottom:env(safe-area-inset-bottom,0);
          backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
        }
        @media(min-width:768px){.d-bnav{display:none}}
        .d-bnav-item{
          flex:1;display:flex;flex-direction:column;align-items:center;
          justify-content:center;gap:.2rem;padding:.55rem 0;
          background:none;border:none;cursor:pointer;
          font-family:'Inter',sans-serif;color:var(--ink-muted);
          transition:color .15s;min-height:56px;
          -webkit-tap-highlight-color:transparent;
        }
        .d-bnav-item.active{color:var(--ink)}
        .d-bnav-label{font-size:.55rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}

        @keyframes revealIn{to{opacity:1;transform:translateY(0)}}
        @keyframes cardIn{to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.d-banner,.d-card{animation:none;opacity:1;transform:none}}
      `}</style>

      <div className="d-page">
        {/* NAV */}
        <nav className="d-nav">
          <Link className="d-logo" to="/">
            <div className="d-logo-mark">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8A951" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c3 3 9 3 12 0v-5"/>
              </svg>
            </div>
            <em>Elev</em>aid
          </Link>
          <div className="d-nav-r">
            {userRole === 'admin' && <Link className="d-nav-link" to="/admin">Admin</Link>}
            <Link className="d-nav-link" to="/profile">Profile</Link>
            <button className="d-nav-link" onClick={handleSignOut} style={{ cursor: 'pointer' }}>Sign out</button>
            <button className="d-av" onClick={handleSignOut} title="Sign out">
              {profile?.first_name?.[0]}{profile?.last_name?.[0]}
            </button>
          </div>
        </nav>

        <div className="d-body">
          {/* BANNER */}
          <div className="d-banner">
            <div className="d-banner-inner">
              <div className="d-banner-label">Matched to your profile</div>
              <div className="d-banner-amount">${animatedTotal.toLocaleString()}</div>
              <div className="d-banner-sub">
                available to you as a {profile && formatSchool(profile.school)} {profile?.major} student
              </div>
              <div className="d-banner-stats">
                <div>
                  <div className="d-bs-n">{matched.length}</div>
                  <div className="d-bs-l">Matches</div>
                </div>
                <div>
                  <div className="d-bs-n">{strongMatches}</div>
                  <div className="d-bs-l">100% fit</div>
                </div>
                <div>
                  <div className="d-bs-n">{profile?.gpa.toFixed(1)}</div>
                  <div className="d-bs-l">Your GPA</div>
                </div>
              </div>
            </div>
          </div>

          {matched.length === 0 ? (
            <div className="d-empty">
              <h3>No matches yet</h3>
              <p>New scholarships are added weekly. Check back soon, or update your profile if anything has changed.</p>
              <Link to="/profile"><button className="d-empty-btn">Update profile</button></Link>
            </div>
          ) : (
            <>
              <div className="d-label">Your matches — sorted by best fit</div>
              <div className="d-grid">
                {matched.map((s, i) => {
                  const open = expandedId === s.id;
                  const days = s.deadline ? daysUntil(s.deadline) : null;
                  return (
                    <div
                      key={s.id}
                      className={`d-card${s.matchPercentage >= 80 ? ' perfect' : ''}`}
                      style={{ animationDelay: `${0.08 + i * 0.04}s` }}
                    >
                      {/* HEADER */}
                      <div className="d-card-head">
                        <span />
                        <span className={`d-card-pct ${s.matchPercentage >= 80 ? 'pct-perfect' : 'pct-partial'}`}>
                          {s.matchPercentage}% match
                        </span>
                      </div>

                      {/* AMOUNT — typographic hero */}
                      <div className="d-card-amount">${s.award_amount?.toLocaleString()}</div>

                      <div className="d-card-name">{s.name}</div>
                      <div className="d-card-provider">{s.provider}</div>

                      {/* DEADLINE */}
                      {s.deadline && (
                        <div className="d-card-dl">
                          <span className="d-card-date">
                            <CalIcon />
                            {new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {days !== null && days <= 7 && <span className="d-badge-urgent">{days}d left</span>}
                          {days !== null && days > 7 && days <= 30 && <span className="d-badge-soon">{days}d left</span>}
                        </div>
                      )}

                      <div className="d-card-div" />

                      {/* DESCRIPTION */}
                      {s.description && (
                        <div className={`d-card-desc${open ? ' open' : ''}`}>{s.description}</div>
                      )}

                      {/* WHY YOU QUALIFY */}
                      <button className="d-reasons-btn" onClick={() => setExpandedId(open ? null : s.id)}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          {open ? <path d="M18 15l-6-6-6 6"/> : <path d="M6 9l6 6 6-6"/>}
                        </svg>
                        {open ? 'Hide details' : 'Why you qualify'}
                      </button>

                      {open && (
                        <div className="d-reasons">
                          {s.matchReasons.map((r, ri) => (
                            <div key={ri} className={`d-reason ${r.startsWith('GPA') && r.includes('below') ? 'd-reason-fail' : r.includes('not in') ? 'd-reason-fail' : 'd-reason-pass'}`}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                                {(r.includes('below') || r.includes('not in')) ? <path d="M18 6L6 18M6 6l12 12"/> : <path d="M5 13l4 4L19 7"/>}
                              </svg>
                              {r}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* APPLY */}
                      <a className="d-apply" href={s.application_url} target="_blank" rel="noopener noreferrer">
                        Apply now <ExternalIcon />
                      </a>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* MOBILE BOTTOM NAV */}
        <nav className="d-bnav">
          <button className="d-bnav-item active">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
            <span className="d-bnav-label">Scholarships</span>
          </button>
          <button className="d-bnav-item" onClick={() => navigate('/profile')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0112 0v2"/>
            </svg>
            <span className="d-bnav-label">Profile</span>
          </button>
          {userRole === 'admin' && (
            <button className="d-bnav-item" onClick={() => navigate('/admin')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <span className="d-bnav-label">Admin</span>
            </button>
          )}
          <button className="d-bnav-item" onClick={handleSignOut}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            <span className="d-bnav-label">Sign out</span>
          </button>
        </nav>
      </div>
    </>
  );
}
