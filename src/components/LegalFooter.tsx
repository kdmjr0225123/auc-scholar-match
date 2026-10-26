import { Link } from 'react-router-dom';

// Dark-theme legal footer: Privacy · Terms · support email · copyright.
// Self-contained styles so it can drop into any page.
export default function LegalFooter() {
  return (
    <footer className="ev-legal-foot">
      <style>{`
        .ev-legal-foot {
          background: #0A1628;
          border-top: 1px solid rgba(255, 255, 255, 0.09);
          padding: 1.25rem 16px calc(1.25rem + env(safe-area-inset-bottom, 0px));
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 0.78rem;
          color: rgba(255, 255, 255, 0.72);
        }
        .ev-legal-foot-inner {
          max-width: 1120px; margin: 0 auto;
          display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
          gap: 0.6rem 1.5rem;
        }
        .ev-legal-foot nav { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 0.6rem; }
        .ev-legal-foot a { color: rgba(255, 255, 255, 0.85); text-decoration: none; }
        .ev-legal-foot a:hover { color: #E8B84B; text-decoration: underline; }
        .ev-legal-foot-sep { color: rgba(255, 255, 255, 0.35); }
      `}</style>
      <div className="ev-legal-foot-inner">
        <nav aria-label="Legal">
          <Link to="/privacy">Privacy</Link>
          <span className="ev-legal-foot-sep" aria-hidden="true">·</span>
          <Link to="/terms">Terms</Link>
          <span className="ev-legal-foot-sep" aria-hidden="true">·</span>
          <a href="mailto:support@elevaid.pro">support@elevaid.pro</a>
        </nav>
        <div>© 2026 Elevaid</div>
      </div>
    </footer>
  );
}
