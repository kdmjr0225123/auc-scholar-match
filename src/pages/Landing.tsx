import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Helpers ──────────────────────────────────────────────────────────────────

function useCounter(target: number, duration: number, trigger: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger) return;
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

// ── Data ─────────────────────────────────────────────────────────────────────

const CARDS = [
  {
    icon: '🎓',
    label: 'Your Matches',
    color: 'rgba(232,184,75,0.12)',
    content: (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#E8B84B,#c9952a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700, color: '#0A1628', flexShrink: 0 }}>KM</div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fff' }}>Khalil M.</div>
            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)' }}>Morehouse · CS · 3.7</div>
          </div>
        </div>
        {[['Ron Brown Scholar Program', '$40,000', 100], ['Google Generation Scholarship', '$10,000', 100]].map(([name, amt, score]) => (
          <div key={String(name)} style={{ marginBottom: '0.5rem' }}>
            <div style={{ fontSize: '0.64rem', fontWeight: 600, color: '#fff', marginBottom: '0.18rem' }}>{name}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#E8B84B' }}>{amt}</span>
              <span style={{ fontSize: '0.54rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '100px', background: 'rgba(74,222,128,0.12)', color: '#4ade80' }}>{score}%</span>
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 100, marginTop: '0.25rem', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${score}%`, background: '#4ade80', borderRadius: 100 }} />
            </div>
          </div>
        ))}
        <div style={{ background: 'rgba(232,184,75,0.07)', border: '1px solid rgba(232,184,75,0.14)', borderRadius: 9, padding: '0.55rem 0.7rem', marginTop: '0.6rem' }}>
          <div style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.1rem', fontWeight: 800, color: '#E8B84B' }}>$127K+</div>
          <div style={{ fontSize: '0.55rem', color: 'rgba(232,184,75,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total matched</div>
        </div>
      </div>
    )
  },
  {
    icon: '✅',
    label: 'Why You Qualify',
    color: 'rgba(74,222,128,0.1)',
    content: (
      <div>
        <div style={{ fontSize: '0.64rem', fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>Morgan Stanley HBCU Scholars</div>
        {['School: Morehouse is eligible', 'Grad Year: 2027 in range', 'GPA: 3.7 ≥ 3.0 minimum'].map(r => (
          <div key={r} style={{ fontSize: '0.58rem', color: 'rgba(74,222,128,0.72)', marginBottom: '0.12rem' }}>✓ {r}</div>
        ))}
        <div style={{ marginTop: '0.65rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.64rem', fontWeight: 600, color: '#fff', marginBottom: '0.4rem' }}>TMCF McDonald's Scholarship</div>
          {['School: Morehouse is eligible', 'GPA: 3.7 ≥ 2.5 minimum', 'All majors eligible'].map(r => (
            <div key={r} style={{ fontSize: '0.58rem', color: 'rgba(74,222,128,0.72)', marginBottom: '0.12rem' }}>✓ {r}</div>
          ))}
        </div>
      </div>
    )
  },
  {
    icon: '⚡',
    label: 'Instant Match',
    color: 'rgba(100,150,255,0.1)',
    content: (
      <div>
        <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.55rem' }}>Your profile</div>
        {['🏫 Morehouse College', '📚 Computer Science', '⭐ GPA 3.7 · Class of 2027'].map(tag => (
          <div key={tag} style={{ background: 'rgba(232,184,75,0.07)', border: '1px solid rgba(232,184,75,0.14)', borderRadius: 6, padding: '0.32rem 0.55rem', fontSize: '0.62rem', color: '#E8B84B', marginBottom: '0.35rem' }}>{tag}</div>
        ))}
        <div style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.14)', borderRadius: 6, padding: '0.4rem 0.55rem', fontSize: '0.63rem', color: '#4ade80', fontWeight: 600, textAlign: 'center', marginTop: '0.5rem' }}>
          14 scholarships matched →
        </div>
      </div>
    )
  },
];

const FEATURES = [
  { icon: '📋', title: 'Build your profile', body: 'School, GPA, major, graduation year. Under 2 minutes — no essay, no guesswork.' },
  { icon: '⚡', title: 'Matched instantly', body: 'Every active scholarship checked against your exact qualifications in real time.' },
  { icon: '✅', title: 'See why you qualify', body: 'Full eligibility breakdown on every match. GPA, school, major — explained before you apply.' },
  { icon: '🔄', title: 'Always current', body: 'New scholarships sourced weekly by AI. Expired ones removed automatically overnight.' },
];

const PROOF = [
  { quote: 'I had no idea I qualified for this many. I thought I missed everything.', name: 'Morehouse Junior', major: 'Computer Science' },
  { quote: "The eligibility breakdown is the thing. No other tool tells you exactly why you qualify.", name: 'Spelman Sophomore', major: 'Biology' },
  { quote: 'Found $15K I would have never searched for on my own. Took me under 5 minutes.', name: 'Clark Atlanta Senior', major: 'Business Administration' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Landing() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const count = useCounter(127000, 2000, visible);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  const go = () => navigate('/auth');

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --gold: #E8B84B;
          --gold-dim: rgba(232,184,75,0.1);
          --gold-border: rgba(232,184,75,0.18);
          --navy: #1a1a3e;
          --purple: #2d1b69;
          --blue: #1e3a6e;
          --dark: #0A1628;
          --card-bg: #111E2E;
          --surface: #162030;
          --border: rgba(255,255,255,0.07);
          --muted: rgba(255,255,255,0.38);
        }
        html { scroll-behavior: smooth; }
        body { font-family: 'DM Sans', sans-serif; }
        .elevaid-page { background: #fff; color: #111; overflow-x: hidden; }

        /* NAV */
        .e-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          padding: 0.75rem 2rem;
          padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
          min-height: 64px;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .e-logo {
          font-family: 'Sora', sans-serif;
          font-size: 1.2rem; font-weight: 800;
          color: #1a1a3e; letter-spacing: -0.025em;
          display: flex; align-items: center; gap: 0.4rem;
          text-decoration: none;
        }
        .e-logo-em { color: var(--gold); }
        .e-nav-r { display: flex; gap: 0.5rem; align-items: center; }
        .btn-ghost-nav {
          background: none; border: none; color: #555;
          font-size: 0.85rem; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          padding: 0.45rem 0.9rem; border-radius: 8px;
          transition: color 0.15s;
        }
        .btn-ghost-nav:hover { color: #111; }
        .btn-nav-cta {
          background: #1a1a3e; color: #fff;
          font-size: 0.82rem; font-weight: 600;
          padding: 0.52rem 1.25rem; border-radius: 9px;
          border: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s, transform 0.1s;
          letter-spacing: 0.01em;
        }
        .btn-nav-cta:hover { background: #2d1b69; transform: translateY(-1px); }

        /* HERO */
        .e-hero {
          background: linear-gradient(158deg, #1a1a3e 0%, #2d1b69 36%, #1e3a6e 68%, #0f2d4a 100%);
          padding: 3.5rem 1.5rem 4rem;
          text-align: center;
          position: relative; overflow: hidden;
        }
        .e-hero-g1 {
          position: absolute; top: -80px; left: 28%;
          width: 600px; height: 400px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.08) 0%, transparent 65%);
          pointer-events: none;
        }
        .e-hero-g2 {
          position: absolute; bottom: -60px; right: 8%;
          width: 400px; height: 320px;
          background: radial-gradient(ellipse, rgba(80,130,255,0.07) 0%, transparent 65%);
          pointer-events: none;
        }
        .e-hero-badge {
          display: inline-flex; align-items: center; gap: 0.45rem;
          background: var(--gold-dim); border: 1px solid var(--gold-border);
          border-radius: 100px; padding: 0.32rem 1rem;
          margin-bottom: 2rem;
          opacity: 0; transform: translateY(10px);
          animation: fadeUp 0.6s ease 0.1s forwards;
        }
        .e-hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--gold); }
        .e-hero-badge span { font-size: 0.68rem; color: var(--gold); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; font-family: 'DM Sans', sans-serif; }
        .e-hero h1 {
          font-family: 'Sora', sans-serif;
          font-size: clamp(2.6rem, 5vw, 4rem);
          font-weight: 800; line-height: 1.04;
          letter-spacing: -0.03em; color: #fff;
          margin-bottom: 1.25rem;
          max-width: 640px; margin-left: auto; margin-right: auto;
          opacity: 0; transform: translateY(16px);
          animation: fadeUp 0.7s ease 0.2s forwards;
        }
        .e-hero h1 em { color: var(--gold); font-style: normal; }
        .e-hero-sub {
          font-size: 1rem; color: rgba(255,255,255,0.5);
          line-height: 1.72; max-width: 460px;
          margin: 0 auto 2.25rem;
          opacity: 0; transform: translateY(12px);
          animation: fadeUp 0.7s ease 0.3s forwards;
        }
        .e-hero-btns {
          display: flex; gap: 0.85rem;
          justify-content: center; flex-wrap: wrap;
          margin-bottom: 3rem;
          opacity: 0;
          animation: fadeUp 0.7s ease 0.4s forwards;
        }
        .btn-hero-main {
          background: var(--gold); color: #1a1a3e;
          font-size: 0.95rem; font-weight: 700;
          padding: 0.9rem 2.2rem; border-radius: 10px;
          border: none; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.01em;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 20px rgba(232,184,75,0.3);
        }
        .btn-hero-main:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(232,184,75,0.4); }
        .btn-hero-sec {
          background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7);
          font-size: 0.95rem; padding: 0.9rem 2rem;
          border-radius: 10px; border: 1px solid rgba(255,255,255,0.14);
          cursor: pointer; font-family: 'DM Sans', sans-serif;
          transition: background 0.15s;
        }
        .btn-hero-sec:hover { background: rgba(255,255,255,0.12); }

        /* PRODUCT STRIP */
        .e-strip-wrap {
          background: linear-gradient(180deg, #0f2d4a 0%, #fff 100%);
          padding: 0 2rem;
          opacity: 0; animation: fadeUp 0.8s ease 0.5s forwards;
        }
        .e-strip {
          display: flex; gap: 1rem;
          padding: 2.25rem 0 0;
          overflow-x: auto; scrollbar-width: none;
          max-width: 1100px; margin: 0 auto;
          justify-content: center;
        }
        .e-strip::-webkit-scrollbar { display: none; }
        .e-pcard {
          flex-shrink: 0; width: 210px;
          background: #1a2035;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px; overflow: hidden;
        }
        .e-pcard-head {
          padding: 0.85rem 1rem 0.65rem;
          display: flex; align-items: center; gap: 0.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .e-pcard-icon { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; }
        .e-pcard-label { font-size: 0.72rem; font-weight: 700; color: #fff; font-family: 'Sora', sans-serif; }
        .e-pcard-body { padding: 0.9rem 1rem; }

        /* STATS */
        .e-stats {
          display: flex; justify-content: space-around;
          padding: 1.5rem 2rem;
          background: #f8f8f8;
          border-top: 1px solid #ebebeb;
          border-bottom: 1px solid #ebebeb;
        }
        .e-stat { text-align: center; }
        .e-stat-n { font-family: 'Sora', sans-serif; font-size: 1.5rem; font-weight: 800; color: #1a1a3e; }
        .e-stat-l { font-size: 0.62rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.07em; margin-top: 0.1rem; }

        /* SECTIONS */
        .e-section { padding: 4rem 2rem; max-width: 1100px; margin: 0 auto; }
        .e-eyebrow { font-size: 0.65rem; color: #C9952A; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 0.5rem; font-family: 'DM Sans', sans-serif; }
        .e-sec-h { font-family: 'Sora', sans-serif; font-size: clamp(1.6rem, 3vw, 2.2rem); font-weight: 800; color: #111; letter-spacing: -0.022em; line-height: 1.1; margin-bottom: 0.65rem; }
        .e-sec-p { font-size: 0.9rem; color: #777; max-width: 400px; line-height: 1.7; margin-bottom: 2.5rem; }

        /* FEATURES */
        .e-feat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.1rem; }
        @media (min-width: 768px) { .e-feat-grid { grid-template-columns: repeat(4, 1fr); } }
        .e-feat { padding: 1.4rem; border: 1px solid #ececec; border-radius: 14px; background: #fafafa; }
        .e-feat-icon { font-size: 1.25rem; margin-bottom: 0.7rem; }
        .e-feat-t { font-size: 0.88rem; font-weight: 700; color: #111; margin-bottom: 0.35rem; font-family: 'Sora', sans-serif; }
        .e-feat-b { font-size: 0.78rem; color: #777; line-height: 1.6; }

        /* PROOF */
        .e-proof-grid { display: grid; grid-template-columns: repeat(1, 1fr); gap: 1rem; }
        @media (min-width: 640px) { .e-proof-grid { grid-template-columns: repeat(3, 1fr); } }
        .e-pcard2 { border: 1px solid #ececec; border-radius: 14px; padding: 1.35rem; background: #fff; }
        .e-pq { font-size: 0.88rem; color: #333; line-height: 1.65; margin-bottom: 1rem; font-style: italic; }
        .e-pw { font-size: 0.68rem; color: #aaa; }
        .e-pw strong { color: #C9952A; font-style: normal; font-weight: 600; }

        /* CTA BOTTOM */
        .e-cta-bottom {
          background: linear-gradient(135deg, #1a1a3e 0%, #2d1b69 55%, #1e3a6e 100%);
          padding: 5rem 2rem; text-align: center;
          position: relative; overflow: hidden;
        }
        .e-cta-g {
          position: absolute; top: 0; left: 50%; transform: translateX(-50%);
          width: 600px; height: 250px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.07) 0%, transparent 65%);
          pointer-events: none;
        }
        .e-cta-bottom h2 {
          font-family: 'Sora', sans-serif;
          font-size: clamp(2rem, 4vw, 3rem);
          font-weight: 800; color: #fff;
          letter-spacing: -0.025em; line-height: 1.08;
          margin-bottom: 0.8rem;
        }
        .e-cta-bottom h2 em { color: var(--gold); font-style: normal; }
        .e-cta-bottom p { font-size: 0.9rem; color: rgba(255,255,255,0.4); margin-bottom: 2.25rem; line-height: 1.7; max-width: 420px; margin-left: auto; margin-right: auto; }
        .e-cta-note { font-size: 0.68rem; color: rgba(255,255,255,0.2); margin-top: 0.85rem; }

        /* FOOTER */
        .e-foot {
          display: flex; justify-content: space-between; align-items: center;
          padding: 1.25rem 2.5rem;
          background: #fff; border-top: 1px solid #ebebeb;
        }
        .e-foot-logo { font-family: 'Sora', sans-serif; font-size: 1rem; font-weight: 800; color: #1a1a3e; }
        .e-foot-logo em { color: var(--gold); font-style: normal; }
        .e-foot-copy { font-size: 0.68rem; color: #ccc; }

        @keyframes fadeUp {
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="elevaid-page">

        {/* NAV */}
        <nav className="e-nav">
          <a className="e-logo" href="/">🎓 <span style={{whiteSpace:"nowrap"}}><em className="e-logo-em">Elev</em>aid</span></a>
          <div className="e-nav-r">
            <button className="btn-ghost-nav" onClick={go}>Sign In</button>
            <button className="btn-nav-cta" onClick={go}>Get Started →</button>
          </div>
        </nav>

        {/* HERO */}
        <div className="e-hero" ref={heroRef}>
          <div className="e-hero-g1" />
          <div className="e-hero-g2" />
          <div className="e-hero-badge">
            <div className="e-hero-badge-dot" />
            <span>Exclusively for AUC Students</span>
          </div>
          <h1>The scholarships<br />that fit you<br /><em>were always there.</em></h1>
          <p className="e-hero-sub">
            Elevaid matches Morehouse, Spelman, Clark Atlanta, and Morris Brown students to money they qualify for — and shows exactly why. Two minutes. No guessing.
          </p>
          <div className="e-hero-btns">
            <button className="btn-hero-main" onClick={go}>Find My Scholarships →</button>
            <button className="btn-hero-sec" onClick={go}>Sign In</button>
          </div>
        </div>

        {/* PRODUCT CARDS */}
        <div className="e-strip-wrap">
          <div className="e-strip">
            {CARDS.map((card) => (
              <div className="e-pcard" key={card.label} style={{ opacity: card.locked ? 0.4 : 1 }}>
                <div className="e-pcard-head">
                  <div className="e-pcard-icon" style={{ background: card.color }}>{card.icon}</div>
                  <div className="e-pcard-label" style={{ color: card.locked ? 'rgba(255,255,255,0.2)' : '#fff' }}>{card.label}</div>
                </div>
                <div className="e-pcard-body">{card.content}</div>
              </div>
            ))}
          </div>
        </div>

        {/* STATS */}
        <div className="e-stats">
          {[['14+', 'Active scholarships'], ['$46K', 'Avg matched per student'], ['2 min', 'To see your matches'], ['Free', 'Always']].map(([n, l]) => (
            <div className="e-stat" key={l}>
              <div className="e-stat-n">{n}</div>
              <div className="e-stat-l">{l}</div>
            </div>
          ))}
        </div>

        {/* HOW IT WORKS */}
        <div style={{ background: '#fff' }}>
          <div className="e-section">
            <div className="e-eyebrow">How it works</div>
            <div className="e-sec-h">Not a search engine.<br />A matching system.</div>
            <p className="e-sec-p">Every major institution has people whose job is finding money for their clients. AUC students never had that. Until now.</p>
            <div className="e-feat-grid">
              {FEATURES.map(f => (
                <div className="e-feat" key={f.title}>
                  <div className="e-feat-icon">{f.icon}</div>
                  <div className="e-feat-t">{f.title}</div>
                  <div className="e-feat-b">{f.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* PROOF */}
        <div style={{ background: '#f8f8f8', borderTop: '1px solid #ebebeb', borderBottom: '1px solid #ebebeb' }}>
          <div className="e-section">
            <div className="e-eyebrow" style={{ marginBottom: '1.25rem' }}>From AUC students</div>
            <div className="e-proof-grid">
              {PROOF.map(p => (
                <div className="e-pcard2" key={p.name}>
                  <div className="e-pq">"{p.quote}"</div>
                  <div className="e-pw"><strong>{p.name}</strong> · {p.major}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="e-cta-bottom">
          <div className="e-cta-g" />
          <h2>Your money is<br /><em>already out there.</em></h2>
          <p>$100 million in scholarships go unclaimed every year. The students who find it aren't smarter — they just had access.</p>
          <button className="btn-hero-main" onClick={go} style={{ fontSize: '0.95rem', padding: '0.95rem 2.4rem' }}>
            Find My Scholarships — It's Free →
          </button>
          <div className="e-cta-note">Exclusively for Morehouse, Spelman, Clark Atlanta & Morris Brown students.</div>
        </div>

        {/* FOOTER */}
        <div className="e-foot">
          <div className="e-foot-logo">🎓 <em>Elev</em>aid</div>
          <div className="e-foot-copy">Built for AUC students · © 2026 Elevaid</div>
        </div>

      </div>
    </>
  );
}
