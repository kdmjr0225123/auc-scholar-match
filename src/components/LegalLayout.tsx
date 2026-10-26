import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import '@/styles/elevaid.css';
import LegalFooter from '@/components/LegalFooter';

interface LegalLayoutProps {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}

// Shared shell for /privacy and /terms: dark student-facing theme, ~680px
// reading column, 16px side gutter on mobile.
export default function LegalLayout({ title, effectiveDate, children }: LegalLayoutProps) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Elevaid`;
    window.scrollTo(0, 0);
    return () => { document.title = prev; };
  }, [title]);

  return (
    <div className="ev-reset ev-shell-dark lg-shell">
      <style>{`
        .lg-shell { display: flex; flex-direction: column; }
        .lg-header {
          display: flex; align-items: center; justify-content: space-between;
          max-width: 1120px; width: 100%; margin: 0 auto;
          padding: calc(1rem + env(safe-area-inset-top, 0px)) 16px 1rem;
        }
        .lg-main { flex: 1; width: 100%; max-width: calc(680px + 32px); margin: 0 auto; padding: 1.5rem 16px 4rem; }
        .lg-card {
          background: #111E2E; border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 16px; padding: 2rem 1.25rem;
        }
        @media (min-width: 640px) { .lg-card { padding: 2.5rem 2.5rem; } .lg-main { padding-top: 2.5rem; } }
        .lg-eyebrow { font-size: 0.7rem; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #E8B84B; }
        .lg-title {
          font-family: 'Sora', system-ui, sans-serif; font-weight: 700; letter-spacing: -0.02em;
          font-size: clamp(1.7rem, 5vw, 2.2rem); line-height: 1.15; color: #fff; margin: 0.5rem 0 0.4rem;
        }
        .lg-date { font-size: 0.85rem; color: rgba(255, 255, 255, 0.72); margin-bottom: 1.75rem; }
        .lg-body { font-size: 0.97rem; line-height: 1.72; color: rgba(255, 255, 255, 0.84); overflow-wrap: anywhere; }
        .lg-body h2 {
          font-family: 'Sora', system-ui, sans-serif; font-size: 1.12rem; font-weight: 700;
          letter-spacing: -0.01em; color: #fff; margin: 2.1rem 0 0.6rem;
        }
        .lg-body h2:first-child { margin-top: 0; }
        .lg-body p { margin: 0 0 0.9rem; }
        .lg-body ul { margin: 0 0 0.9rem; padding-left: 1.2rem; list-style: disc; }
        .lg-body li { margin-bottom: 0.45rem; }
        .lg-body li::marker { color: #E8B84B; }
        .lg-body strong { color: #fff; font-weight: 600; }
        .lg-body a { color: #E8B84B; text-decoration: underline; text-underline-offset: 2px; }
        .lg-body a:hover { color: #EFC565; }
        .lg-nav-link { font-size: 0.85rem; color: rgba(255, 255, 255, 0.8); text-decoration: none; }
        .lg-nav-link:hover { color: #E8B84B; }
      `}</style>

      <header className="lg-header">
        <Link className="ev-logo" to="/" style={{ color: '#fff' }} aria-label="Elevaid home">
          <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
          <span><em className="ev-logo-em">Elev</em>aid</span>
        </Link>
        <Link className="lg-nav-link" to="/auth?mode=signin">Sign in</Link>
      </header>

      <main className="lg-main">
        <article className="lg-card">
          <div className="lg-eyebrow">Legal</div>
          <h1 className="lg-title">{title}</h1>
          <div className="lg-date">Effective {effectiveDate}</div>
          <div className="lg-body">{children}</div>
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
