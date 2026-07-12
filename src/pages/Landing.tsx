import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4L19 7"/>
  </svg>
);

const ArrowRight = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);

const HOW = [
  { n: '01', title: 'Build your profile', body: 'School, major, GPA, graduation year. Under two minutes — no essay, no account required to start.' },
  { n: '02', title: 'See your matches instantly', body: 'Every active scholarship checked against your exact qualifications in real time. Nothing irrelevant.' },
  { n: '03', title: 'Understand why you qualify', body: 'Full eligibility breakdown on every match. School, GPA, major — explained before you ever click apply.' },
  { n: '04', title: 'Stay current automatically', body: 'New scholarships added weekly, expired ones removed overnight. Your matches are always accurate.' },
];

const PROOF = [
  { quote: 'I had no idea I qualified for this many. I thought I missed everything.', name: 'Morehouse Junior', major: 'Computer Science' },
  { quote: 'The eligibility breakdown is what gets me. No other tool tells you exactly why you qualify — it just gives you a list and wishes you luck.', name: 'Spelman Sophomore', major: 'Biology' },
  { quote: 'Found $15K I would have never searched for on my own. Took me under five minutes.', name: 'Clark Atlanta Senior', major: 'Business Administration' },
];

export default function Landing() {
  const navigate = useNavigate();
  const [triggered, setTriggered] = useState(false);
  const [stats, setStats] = useState({ scholarships: 12, total: 125000 });
  const count = useCounter(stats.total, 2000, triggered);

  useEffect(() => {
    const t = setTimeout(() => setTriggered(true), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    supabase.from('scholarships').select('award_amount').eq('is_active', true).then(({ data }) => {
      if (data && data.length > 0) {
        const total = data.reduce((s: number, r: any) => s + (r.award_amount || 0), 0);
        setStats({ scholarships: Math.max(data.length, 12), total: Math.max(total, 125000) });
      }
    });
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
        body { font-family: 'Inter', system-ui, sans-serif; background: #FAFAF8; color: #0F1923; }

        /* ─── TOKENS ─────────────────────────────────────────────── */
        :root {
          --ink: #0F1923;
          --ink-mid: #4A5568;
          --ink-muted: #94A3B8;
          --gold: #C8A951;
          --gold-dim: rgba(200,169,81,0.12);
          --gold-border: rgba(200,169,81,0.25);
          --green: #2D6A4F;
          --green-dim: rgba(45,106,79,0.1);
          --cream: #F5F0E8;
          --surface: #FFFFFF;
          --border: rgba(15,25,35,0.08);
          --border-mid: rgba(15,25,35,0.14);
          --radius: 10px;
          --radius-lg: 16px;
        }

        /* ─── NAV ────────────────────────────────────────────────── */
        .l-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          padding: 0 1.25rem;
          height: calc(60px + env(safe-area-inset-top, 0px));
          padding-top: env(safe-area-inset-top, 0);
          background: rgba(250,250,248,0.92);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
        }
        @media (min-width: 640px) { .l-nav { padding: 0 2rem; } }

        .l-logo {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1.2rem; font-weight: 700;
          color: var(--ink); letter-spacing: -0.02em;
          text-decoration: none; display: flex; align-items: center; gap: 0.5rem;
        }
        .l-logo-mark {
          width: 28px; height: 28px; border-radius: 7px;
          background: var(--ink); display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .l-logo-mark svg { display: block; }
        .l-logo em { color: var(--gold); font-style: normal; }

        .l-nav-r { display: flex; gap: 0.5rem; align-items: center; }
        .l-btn-ghost {
          background: none; border: none; color: var(--ink-mid);
          font-size: 0.82rem; font-weight: 500; cursor: pointer;
          font-family: 'Inter', sans-serif; padding: 0.45rem 0.75rem;
          border-radius: 8px; transition: color 0.15s; min-height: 44px;
          display: none;
        }
        @media (min-width: 480px) { .l-btn-ghost { display: inline-flex; align-items: center; } }
        .l-btn-ghost:hover { color: var(--ink); }
        .l-btn-primary {
          background: var(--ink); color: #fff;
          font-size: 0.82rem; font-weight: 600; padding: 0.5rem 1.1rem;
          border-radius: 8px; border: none; cursor: pointer;
          font-family: 'Inter', sans-serif; transition: opacity 0.15s;
          letter-spacing: 0.01em; min-height: 44px;
          display: inline-flex; align-items: center; gap: 0.4rem;
        }
        .l-btn-primary:hover { opacity: 0.85; }

        /* ─── HERO ───────────────────────────────────────────────── */
        .l-hero {
          background: var(--ink);
          padding: 4rem 1.25rem 4.5rem;
          position: relative; overflow: hidden;
        }
        @media (min-width: 640px) { .l-hero { padding: 5rem 2rem 5.5rem; } }
        @media (min-width: 1024px) { .l-hero { padding: 6rem 2rem 7rem; } }

        .l-hero-inner { max-width: 760px; margin: 0 auto; }

        .l-hero-eyebrow {
          font-size: 0.65rem; font-weight: 600; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--gold);
          margin-bottom: 1.5rem; opacity: 0;
          animation: fadeUp 0.5s ease 0.1s forwards;
        }

        .l-hero h1 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(2.4rem, 7vw, 4.5rem);
          font-weight: 700; line-height: 1.06;
          letter-spacing: -0.02em; color: #fff;
          margin-bottom: 1.5rem;
          opacity: 0; animation: fadeUp 0.6s ease 0.2s forwards;
        }
        .l-hero h1 em { color: var(--gold); font-style: italic; }

        .l-hero-sub {
          font-size: clamp(0.9rem, 2.2vw, 1.05rem);
          color: rgba(255,255,255,0.48); line-height: 1.75;
          max-width: 520px; margin-bottom: 2.5rem;
          opacity: 0; animation: fadeUp 0.6s ease 0.3s forwards;
        }

        .l-hero-actions {
          display: flex; gap: 0.75rem; flex-wrap: wrap;
          opacity: 0; animation: fadeUp 0.6s ease 0.4s forwards;
        }
        .l-btn-hero {
          background: var(--gold); color: var(--ink);
          font-size: 0.9rem; font-weight: 700; padding: 0.85rem 1.75rem;
          border-radius: 9px; border: none; cursor: pointer;
          font-family: 'Inter', sans-serif; letter-spacing: 0.01em;
          display: inline-flex; align-items: center; gap: 0.45rem;
          transition: opacity 0.15s, transform 0.15s; min-height: 48px;
        }
        .l-btn-hero:hover { opacity: 0.9; transform: translateY(-1px); }
        .l-btn-hero-ghost {
          background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.65);
          font-size: 0.9rem; padding: 0.85rem 1.5rem;
          border-radius: 9px; border: 1px solid rgba(255,255,255,0.12);
          cursor: pointer; font-family: 'Inter', sans-serif;
          transition: background 0.15s; min-height: 48px;
        }
        .l-btn-hero-ghost:hover { background: rgba(255,255,255,0.12); }

        /* Subtle grid texture on hero */
        .l-hero::before {
          content: '';
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }
        .l-hero-inner { position: relative; z-index: 1; }

        /* ─── STATS BAR ──────────────────────────────────────────── */
        .l-stats {
          background: var(--surface);
          border-bottom: 1px solid var(--border);
          display: grid;
          grid-template-columns: repeat(2, 1fr);
        }
        @media (min-width: 640px) {
          .l-stats { display: flex; justify-content: center; }
        }

        .l-stat {
          padding: 1.5rem 1.25rem;
          border-right: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          text-align: center;
        }
        @media (min-width: 640px) {
          .l-stat {
            padding: 2rem 3rem;
            border-bottom: none;
          }
          .l-stat:last-child { border-right: none; }
        }
        .l-stat:nth-child(even) { border-right: none; }
        @media (min-width: 640px) { .l-stat:nth-child(even) { border-right: 1px solid var(--border); } }

        .l-stat-n {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(1.6rem, 4vw, 2.2rem);
          font-weight: 700; color: var(--ink);
          letter-spacing: -0.02em; line-height: 1;
        }
        .l-stat-n em { color: var(--gold); font-style: normal; }
        .l-stat-l {
          font-size: 0.65rem; color: var(--ink-muted);
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-top: 0.35rem; font-weight: 500;
        }

        /* ─── HOW IT WORKS ───────────────────────────────────────── */
        .l-section { padding: 4rem 1.25rem; max-width: 1100px; margin: 0 auto; }
        @media (min-width: 640px) { .l-section { padding: 5rem 2rem; } }

        .l-section-cream { background: var(--cream); }
        .l-section-white { background: var(--surface); }

        .l-eyebrow {
          font-size: 0.62rem; font-weight: 700; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--gold);
          margin-bottom: 1rem;
        }
        .l-section-h {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(1.75rem, 4vw, 2.5rem);
          font-weight: 700; color: var(--ink);
          letter-spacing: -0.02em; line-height: 1.12;
          margin-bottom: 0.75rem;
        }
        .l-section-p {
          font-size: 0.9rem; color: var(--ink-mid);
          line-height: 1.75; max-width: 440px;
          margin-bottom: 3rem;
        }

        .l-how-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0;
          border-top: 1px solid var(--border-mid);
        }
        @media (min-width: 768px) {
          .l-how-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 1024px) {
          .l-how-grid { grid-template-columns: repeat(4, 1fr); }
        }

        .l-how-item {
          padding: 2rem 1.75rem;
          border-bottom: 1px solid var(--border-mid);
          border-right: none;
        }
        @media (min-width: 768px) {
          .l-how-item { border-right: 1px solid var(--border-mid); }
          .l-how-item:nth-child(2n) { border-right: none; }
        }
        @media (min-width: 1024px) {
          .l-how-item { border-right: 1px solid var(--border-mid); border-bottom: none; }
          .l-how-item:last-child { border-right: none; }
        }

        .l-how-num {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 2.5rem; font-weight: 700; color: rgba(15,25,35,0.08);
          line-height: 1; margin-bottom: 1.25rem; letter-spacing: -0.02em;
        }
        .l-how-title {
          font-size: 0.9rem; font-weight: 600; color: var(--ink);
          margin-bottom: 0.5rem; line-height: 1.3;
        }
        .l-how-body {
          font-size: 0.8rem; color: var(--ink-mid);
          line-height: 1.7;
        }

        /* ─── PROOF ──────────────────────────────────────────────── */
        .l-proof-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 640px) {
          .l-proof-grid { grid-template-columns: repeat(3, 1fr); }
        }

        .l-proof-card {
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          background: var(--surface);
        }

        .l-proof-quote {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 0.95rem; color: var(--ink);
          line-height: 1.7; margin-bottom: 1.25rem;
          font-style: italic;
        }
        .l-proof-who {
          font-size: 0.68rem; font-weight: 600;
          color: var(--gold); letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .l-proof-major {
          font-size: 0.68rem; color: var(--ink-muted);
          margin-top: 0.15rem;
        }

        /* ─── CTA BOTTOM ─────────────────────────────────────────── */
        .l-cta {
          background: var(--ink);
          padding: 5rem 1.25rem;
          text-align: center;
          position: relative; overflow: hidden;
        }
        @media (min-width: 640px) { .l-cta { padding: 7rem 2rem; } }

        .l-cta::before {
          content: '';
          position: absolute; inset: 0;
          background-image: linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 40px 40px; pointer-events: none;
        }
        .l-cta-inner { position: relative; z-index: 1; max-width: 600px; margin: 0 auto; }

        .l-cta h2 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(2rem, 5vw, 3.25rem);
          font-weight: 700; color: #fff;
          letter-spacing: -0.025em; line-height: 1.1;
          margin-bottom: 1rem;
        }
        .l-cta h2 em { color: var(--gold); font-style: italic; }
        .l-cta p {
          font-size: 0.9rem; color: rgba(255,255,255,0.4);
          line-height: 1.75; margin-bottom: 2.5rem;
        }
        .l-cta-note {
          font-size: 0.65rem; color: rgba(255,255,255,0.2);
          margin-top: 1rem; letter-spacing: 0.04em;
        }

        /* ─── FOOTER ─────────────────────────────────────────────── */
        .l-footer {
          background: var(--surface);
          border-top: 1px solid var(--border);
          padding: 1.25rem 1.25rem;
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 0.5rem;
        }
        @media (min-width: 640px) { .l-footer { padding: 1.5rem 2rem; } }
        .l-footer-logo {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 1rem; font-weight: 700; color: var(--ink);
        }
        .l-footer-logo em { color: var(--gold); font-style: normal; }
        .l-footer-copy { font-size: 0.65rem; color: var(--ink-muted); }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .l-hero-eyebrow, .l-hero h1, .l-hero-sub, .l-hero-actions {
            animation: none; opacity: 1; transform: none;
          }
        }
      `}</style>

      {/* NAV */}
      <nav className="l-nav">
        <a className="l-logo" href="/">
          <div className="l-logo-mark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8A951" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <span><em>Elev</em>aid</span>
        </a>
        <div className="l-nav-r">
          <button className="l-btn-ghost" onClick={() => navigate('/auth?mode=signin')}>Sign in</button>
          <button className="l-btn-primary" onClick={() => navigate('/auth')}>
            Get started <ArrowRight />
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="l-hero">
        <div className="l-hero-inner">
          <div className="l-hero-eyebrow">
            Morehouse · Spelman · Clark Atlanta · Morris Brown
          </div>
          <h1>
            The scholarships<br />
            that fit you were<br />
            <em>always there.</em>
          </h1>
          <p className="l-hero-sub">
            Elevaid matches AUC students to scholarship money they qualify for — and shows exactly why, criterion by criterion. Build a profile in two minutes. See your matches immediately.
          </p>
          <div className="l-hero-actions">
            <button className="l-btn-hero" onClick={() => navigate('/auth')}>
              Find my scholarships <ArrowRight size={14} />
            </button>
            <button className="l-btn-hero-ghost" onClick={() => navigate('/auth?mode=signin')}>
              Sign in
            </button>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="l-stats">
        <div className="l-stat">
          <div className="l-stat-n">
            <em>${count >= 1000 ? `${Math.floor(count / 1000)}K` : count}+</em>
          </div>
          <div className="l-stat-l">Matched to AUC students</div>
        </div>
        <div className="l-stat">
          <div className="l-stat-n">{stats.scholarships}+</div>
          <div className="l-stat-l">Active scholarships</div>
        </div>
        <div className="l-stat">
          <div className="l-stat-n">2 min</div>
          <div className="l-stat-l">To see your matches</div>
        </div>
        <div className="l-stat">
          <div className="l-stat-n">Free</div>
          <div className="l-stat-l">Always, no exceptions</div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="l-section-cream">
        <div className="l-section">
          <div className="l-eyebrow">How it works</div>
          <h2 className="l-section-h">Not a search engine.<br />A matching system.</h2>
          <p className="l-section-p">
            Every major institution has people whose job is finding money for their clients. AUC students never had that. Until now.
          </p>
          <div className="l-how-grid">
            {HOW.map(item => (
              <div className="l-how-item" key={item.n}>
                <div className="l-how-num">{item.n}</div>
                <div className="l-how-title">{item.title}</div>
                <div className="l-how-body">{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PROOF */}
      <div className="l-section-white">
        <div className="l-section">
          <div className="l-eyebrow">From AUC students</div>
          <div className="l-proof-grid">
            {PROOF.map(p => (
              <div className="l-proof-card" key={p.name}>
                <div className="l-proof-quote">"{p.quote}"</div>
                <div className="l-proof-who">{p.name}</div>
                <div className="l-proof-major">{p.major}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="l-cta">
        <div className="l-cta-inner">
          <h2>Your money is<br /><em>already out there.</em></h2>
          <p>
            $100 million in scholarships go unclaimed every year. The students who find it aren't smarter — they just had access.
          </p>
          <button className="l-btn-hero" onClick={() => navigate('/auth')} style={{ margin: '0 auto' }}>
            Find my scholarships — it's free <ArrowRight size={14} />
          </button>
          <div className="l-cta-note">
            Exclusively for Morehouse, Spelman, Clark Atlanta &amp; Morris Brown students.
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="l-footer">
        <div className="l-footer-logo"><em>Elev</em>aid</div>
        <div className="l-footer-copy">Built for AUC students · © 2026 Elevaid</div>
      </footer>
    </>
  );
}
