import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import '@/styles/elevaid.css';
import { SCHOOL_THEME } from '@/lib/schoolTheme';
import {
  GraduationCap,
  ClipboardList,
  Zap,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

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

// The four schools this actually serves — reusing the exact same theme data
// (gradient, hex) that drives the post-login personalization, so the
// marketing page visually foreshadows the real product instead of running
// its own disconnected color scheme.
const SCHOOLS = Object.values(SCHOOL_THEME);

const STEPS = [
  { n: '01', Icon: ClipboardList, title: 'Build your profile', body: 'School, GPA, major, graduation year. Under 2 minutes — no essay, no guesswork.' },
  { n: '02', Icon: Zap, title: 'Matched instantly', body: 'Every active scholarship checked against your exact qualifications in real time.' },
  { n: '03', Icon: CheckCircle2, title: 'See why you qualify', body: 'Full eligibility breakdown on every match — GPA, school, major — explained before you apply.' },
  { n: '04', Icon: RefreshCw, title: 'Always current', body: 'New scholarships added regularly. Expired listings are removed automatically overnight, so you never chase a dead link.' },
];

interface PreviewScholarship {
  name: string;
  award_amount: number;
  min_gpa: number | null;
}

export default function Landing() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [stats, setStats] = useState({ scholarships: 0, totalMatched: 0, students: 0 });
  const [preview, setPreview] = useState<PreviewScholarship[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);
  const count = useCounter(stats.totalMatched, 1800, visible);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const [{ data: schData }, { count: studentCount }, { data: previewData }] = await Promise.all([
        supabase.from('scholarships').select('award_amount').eq('is_active', true),
        supabase.from('student_profiles').select('id', { count: 'exact', head: true }),
        supabase
          .from('scholarships')
          .select('name, award_amount, eligibility_rules(min_gpa)')
          .eq('is_active', true)
          .order('award_amount', { ascending: false })
          .limit(2),
      ]);
      if (schData) {
        const total = schData.reduce((s: number, r: any) => s + (r.award_amount || 0), 0);
        setStats(prev => ({
          ...prev,
          scholarships: schData.length,
          totalMatched: total,
          students: studentCount ?? prev.students,
        }));
      }
      if (previewData) {
        setPreview(
          previewData.map((s: any) => ({
            name: s.name,
            award_amount: s.award_amount,
            min_gpa: s.eligibility_rules?.[0]?.min_gpa ?? s.eligibility_rules?.min_gpa ?? null,
          }))
        );
      }
    };
    fetchData();
  }, []);

  const go = () => navigate('/auth');
  const goSignIn = () => navigate('/auth?mode=signin');

  return (
    <>
      <style>{`
        .ev-hero-wrap {
          background: linear-gradient(165deg, #0F1D31 0%, #14233A 55%, #0A1628 100%);
          position: relative;
          overflow: hidden;
        }
        .ev-hero-glow {
          position: absolute; top: -160px; left: 8%;
          width: 560px; height: 420px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.08) 0%, transparent 68%);
          pointer-events: none;
        }
        .ev-hero-grid {
          position: relative;
          display: grid;
          grid-template-columns: 1fr;
          gap: 2.5rem;
          max-width: 1160px;
          margin: 0 auto;
          padding: 3rem 1.5rem 0;
        }
        @media (min-width: 900px) {
          .ev-hero-grid { grid-template-columns: 1.05fr 0.95fr; align-items: center; gap: 2rem; padding: 4rem 2rem 0; min-height: 560px; }
        }

        .ev-kicker {
          font-family: var(--ev-font-body);
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ev-gold);
          margin-bottom: 1.1rem;
        }
        .ev-kicker span { color: var(--ev-text-faint); font-weight: 500; }

        .ev-hero-grid h1 {
          font-family: var(--ev-font-display);
          font-size: clamp(2.6rem, 6.2vw, 4.6rem);
          font-weight: 700;
          line-height: 1.01;
          letter-spacing: -0.035em;
          color: #fff;
          margin: 0 0 1.4rem;
        }
        .ev-hero-grid h1 em { color: var(--ev-gold); font-style: normal; }
        .ev-hero-sub {
          font-size: 1.02rem;
          color: var(--ev-text-muted);
          line-height: 1.7;
          max-width: 460px;
          margin: 0 0 2rem;
        }
        .ev-hero-cta-row { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; }
        .ev-hero-signin { font-size: 0.85rem; color: var(--ev-text-muted); background: none; border: none; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; padding: 0; font-family: var(--ev-font-body); }
        .ev-hero-signin:hover { color: #fff; }

        /* ---- signature visual: four campus "spines", one per school,
               using the exact same gradients that color the real dashboard
               banners — this is the one graphic idea a template can't
               generate, because it only exists once you know who you serve. */
        .ev-spines {
          position: relative;
          display: flex;
          height: 300px;
          clip-path: polygon(0 6%, 100% 0%, 100% 94%, 0% 100%);
        }
        @media (min-width: 900px) {
          .ev-spines { height: 400px; }
        }
        .ev-spine {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding: 1rem 0.4rem 1.5rem;
          text-align: center;
          transition: flex-grow 0.35s ease;
        }
        .ev-spine:hover { flex-grow: 1.35; }
        /* Crest-style pairing: a bold monogram anchors each band, a thin
           rule separates it from a lighter, wider-tracked caption below —
           two tiers of weight instead of two stacked lines that read the
           same, which was the flat/heavy part of the first pass. */
        .ev-spine-mark {
          font-family: var(--ev-font-display);
          font-weight: 700;
          font-size: 1.7rem;
          letter-spacing: 0.01em;
          color: #fff;
          line-height: 1;
        }
        .ev-spine-rule {
          width: 20px;
          height: 1.5px;
          background: rgba(255,255,255,0.4);
          margin: 0.55rem 0 0.5rem;
        }
        .ev-spine-label {
          font-family: var(--ev-font-body);
          font-weight: 600;
          font-size: 0.66rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.78);
          line-height: 1.35;
        }

        .ev-preview-wrap { background: linear-gradient(180deg, #0A1628 0%, var(--ev-bg-light) 100%); padding: 4rem 1.5rem 0; }
        .ev-preview-label { text-align: center; font-size: 0.7rem; color: var(--ev-text-faint); text-transform: uppercase; letter-spacing: 0.09em; margin-bottom: 1.25rem; }
        .ev-preview-grid { display: flex; gap: 0.85rem; overflow-x: auto; max-width: 760px; margin: 0 auto; justify-content: center; scrollbar-width: none; padding-bottom: 0.25rem; }
        .ev-preview-grid::-webkit-scrollbar { display: none; }
        .ev-preview-card { flex-shrink: 0; width: 240px; text-align: left; padding: 1.1rem 1.15rem; clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%); }
        .ev-preview-name { font-size: 0.78rem; font-weight: 600; color: var(--ev-text); margin-bottom: 0.6rem; line-height: 1.35; min-height: 2.1em; }
        .ev-preview-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; }
        .ev-preview-amt { font-family: var(--ev-font-display); font-size: 1.05rem; font-weight: 700; color: var(--ev-gold); }
        .ev-preview-reason { display: flex; align-items: center; gap: 0.4rem; font-size: 0.68rem; color: var(--ev-success); margin-top: 0.5rem; }

        /* ---- stats: one dominant figure, not four equal boxes ---- */
        .ev-stats-wrap { background: var(--ev-bg-light); border-top: 1px solid var(--ev-border-light); border-bottom: 1px solid var(--ev-border-light); padding: 3rem 1.5rem; }
        .ev-stats-inner { max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
        @media (min-width: 760px) {
          .ev-stats-inner { flex-direction: row; align-items: flex-end; justify-content: space-between; }
        }
        .ev-stat-hero-n { font-family: var(--ev-font-display); font-size: clamp(2.8rem, 7vw, 4.5rem); font-weight: 700; letter-spacing: -0.03em; color: var(--ev-ink); line-height: 1; }
        .ev-stat-hero-l { font-size: 0.82rem; color: var(--ev-ink-muted); margin-top: 0.4rem; }
        .ev-stat-list { display: flex; flex-direction: column; gap: 0.9rem; }
        .ev-stat-list-row { display: flex; align-items: baseline; gap: 0.6rem; }
        .ev-stat-list-n { font-family: var(--ev-font-display); font-size: 1.2rem; font-weight: 700; color: var(--ev-ink); min-width: 3ch; }
        .ev-stat-list-l { font-size: 0.78rem; color: var(--ev-ink-faint); }

        .ev-section { padding: 5rem 1.5rem; }

        /* ---- how it works: numbered steps, not an icon grid ---- */
        .ev-steps { max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; }
        .ev-step { display: grid; grid-template-columns: auto 1fr; gap: 1.5rem; padding: 2rem 0; border-top: 1px solid var(--ev-border-light); align-items: flex-start; }
        .ev-step:last-child { border-bottom: 1px solid var(--ev-border-light); }
        /* Solid pale-gold fill, not a WebKit-only text-stroke trick — that
           renders invisible in Firefox since transparent fill has no fallback. */
        .ev-step-n { font-family: var(--ev-font-display); font-size: 2.75rem; font-weight: 700; color: #E7CE9B; line-height: 1; }
        .ev-step-body { padding-top: 0.3rem; }
        .ev-step-t { font-family: var(--ev-font-display); font-size: 1.05rem; font-weight: 700; color: var(--ev-ink); margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.55rem; }
        .ev-step-b { font-size: 0.88rem; color: var(--ev-ink-muted); line-height: 1.65; max-width: 520px; }

        .ev-cta-bottom { background: linear-gradient(165deg, #0F1D31 0%, #14233A 100%); padding: 5rem 1.5rem; text-align: center; }
        .ev-cta-bottom h2 { font-family: var(--ev-font-display); font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 700; color: #fff; letter-spacing: -0.025em; line-height: 1.12; margin-bottom: 0.85rem; }
        .ev-cta-bottom h2 em { color: var(--ev-gold); font-style: normal; }
        .ev-cta-bottom p { font-size: 0.9rem; color: var(--ev-text-muted); margin-bottom: 2.25rem; line-height: 1.7; max-width: 440px; margin-left: auto; margin-right: auto; }
        .ev-cta-note { font-size: 0.7rem; color: var(--ev-text-faint); margin-top: 1rem; }

        .ev-foot { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem 1.5rem calc(1.5rem + env(safe-area-inset-bottom, 0px)); background: var(--ev-surface-light); border-top: 1px solid var(--ev-border-light); flex-wrap: wrap; gap: 0.75rem; }
        .ev-foot-copy { font-size: 0.72rem; color: var(--ev-ink-faint); }
      `}</style>

      <div className="ev-reset ev-shell-light">
        <nav className="ev-nav ev-nav-light">
          <a className="ev-logo" href="/" style={{ color: 'var(--ev-ink)' }}>
            <span className="ev-logo-mark"><GraduationCap size={16} strokeWidth={2.25} /></span>
            <span><em className="ev-logo-em">Elev</em>aid</span>
          </a>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="ev-btn ev-btn-ghost-light" onClick={goSignIn}>Sign In</button>
            <button className="ev-btn ev-btn-dark" onClick={go}>Get Started <ArrowRight size={14} /></button>
          </div>
        </nav>

        <div className="ev-hero-wrap" ref={heroRef}>
          <div className="ev-hero-glow" />
          <div className="ev-hero-grid">
            <div className="ev-animate-fade-up">
              <div className="ev-kicker">Morehouse <span>·</span> Spelman <span>·</span> Clark Atlanta <span>·</span> Morris Brown</div>
              <h1>
                The scholarships<br />that fit you<br /><em>were always there.</em>
              </h1>
              <p className="ev-hero-sub">
                Elevaid matches AUC students to scholarships they actually qualify for — and shows exactly why. Two minutes. No guessing.
              </p>
              <div className="ev-hero-cta-row">
                <button className="ev-btn ev-btn-primary" onClick={go} style={{ padding: '0.9rem 1.75rem', fontSize: '0.95rem' }}>
                  Find My Scholarships <ArrowRight size={15} />
                </button>
                <button className="ev-hero-signin" onClick={goSignIn}>Already have an account? Sign in</button>
              </div>
            </div>

            <div className="ev-spines ev-animate-fade-up" style={{ animationDelay: '0.12s' }}>
              {SCHOOLS.map(s => (
                <div key={s.school} className="ev-spine" style={{ background: s.gradient }}>
                  <span className="ev-spine-mark">{s.initials}</span>
                  <span className="ev-spine-rule" />
                  <span className="ev-spine-label">{s.short}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="ev-preview-wrap">
            <div className="ev-preview-label">How a match looks — real scholarships currently live</div>
            <div className="ev-preview-grid">
              {preview.map(s => (
                <div className="ev-card-dark ev-preview-card" key={s.name}>
                  <div className="ev-preview-name">{s.name}</div>
                  <div className="ev-preview-row">
                    <span className="ev-preview-amt">${s.award_amount.toLocaleString()}</span>
                    <span className="ev-badge ev-badge-success"><CheckCircle2 size={11} /> Eligible</span>
                  </div>
                  <div className="ev-preview-reason">
                    <CheckCircle2 size={12} />
                    {s.min_gpa ? `GPA ≥ ${Number(s.min_gpa).toFixed(1)} required — you qualify` : 'Open to all AUC schools and majors'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="ev-stats-wrap">
          <div className="ev-stats-inner">
            <div>
              <div className="ev-stat-hero-n">${count.toLocaleString()}+</div>
              <div className="ev-stat-hero-l">Currently matched and waiting to be claimed</div>
            </div>
            <div className="ev-stat-list">
              <div className="ev-stat-list-row"><span className="ev-stat-list-n">{stats.scholarships}</span><span className="ev-stat-list-l">Active scholarships</span></div>
              <div className="ev-stat-list-row"><span className="ev-stat-list-n">2 min</span><span className="ev-stat-list-l">To see your matches</span></div>
              <div className="ev-stat-list-row"><span className="ev-stat-list-n">Free</span><span className="ev-stat-list-l">Always, for students</span></div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--ev-surface-light)' }}>
          <div className="ev-section ev-container" style={{ padding: '5rem 0' }}>
            <div style={{ margin: '0 0 3rem', maxWidth: 520 }}>
              <div className="ev-eyebrow">How it works</div>
              <div className="ev-heading" style={{ fontSize: 'clamp(1.6rem, 3.2vw, 2.1rem)', margin: '0.4rem 0 0.6rem' }}>Not a search engine.<br />A matching system.</div>
              <p className="ev-sub" style={{ fontSize: '0.9rem' }}>Every major institution has people whose job is finding money for their clients. AUC students never had that. Until now.</p>
            </div>
            <div className="ev-steps">
              {STEPS.map(s => (
                <div className="ev-step" key={s.n}>
                  <div className="ev-step-n">{s.n}</div>
                  <div className="ev-step-body">
                    <div className="ev-step-t"><s.Icon size={16} strokeWidth={2.25} color="var(--ev-gold-600)" />{s.title}</div>
                    <div className="ev-step-b">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="ev-cta-bottom">
          <h2>Your money is<br /><em>already out there.</em></h2>
          <p>Millions in scholarship money goes unclaimed every year. The students who find it aren't smarter — they just had access.</p>
          <button className="ev-btn ev-btn-primary" onClick={go} style={{ padding: '0.9rem 2.1rem', fontSize: '0.95rem' }}>
            Find My Scholarships — It's Free <ArrowRight size={15} />
          </button>
          <div className="ev-cta-note">Exclusively for Morehouse, Spelman, Clark Atlanta & Morris Brown students.</div>
        </div>

        <div className="ev-foot">
          <div className="ev-logo" style={{ color: 'var(--ev-ink)' }}>
            <span className="ev-logo-mark"><GraduationCap size={14} strokeWidth={2.25} /></span>
            <span><em className="ev-logo-em">Elev</em>aid</span>
          </div>
          <div className="ev-foot-copy">Built for AUC students · © 2026 Elevaid</div>
        </div>
      </div>
    </>
  );
}
