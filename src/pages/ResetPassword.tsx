import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { track } from '@/lib/analytics';
import LegalFooter from '@/components/LegalFooter';
import '@/styles/elevaid.css';

type Phase = 'checking' | 'ready' | 'invalid' | 'saving';

// How long to wait for Supabase to turn the link's tokens into a recovery
// session before calling the link dead.
const RECOVERY_WAIT_MS = 4000;

const MIN_LENGTH = 8;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Supabase puts error details in the hash for expired/used links; read it
  // on first render, before anything else can rewrite the URL.
  const linkError = useRef(
    /(^#|&)error(_code)?=/.test(window.location.hash) || /[?&]error(_code)?=/.test(window.location.search),
  );

  useEffect(() => {
    let settled = false;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setPhase('ready');
    };

    if (linkError.current) {
      setPhase('invalid');
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) {
        markReady();
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      setPhase('invalid');
    }, RECOVERY_WAIT_MS);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setPhase('saving');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      track('password_reset_completed');
      navigate('/dashboard', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(
        /session|jwt|expired/i.test(message)
          ? 'Your reset link expired. Request a new one from the sign-in page.'
          : message || "We couldn't update your password. Please try again.",
      );
      setPhase('ready');
    }
  };

  const saving = phase === 'saving';

  return (
    <>
      <style>{`
        .rp-shell { display: flex; flex-direction: column; }
        .rp-bg {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 2rem 16px; position: relative; overflow: hidden;
        }
        .rp-bg::before {
          content: ''; position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
          width: 640px; max-width: 100%; height: 380px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.06) 0%, transparent 65%);
          pointer-events: none;
        }
        .rp-card {
          padding: 2.25rem 1.5rem 2rem; width: 100%; max-width: 420px;
          position: relative; z-index: 1; box-shadow: var(--ev-shadow-dark-md);
        }
        @media (min-width: 480px) { .rp-card { padding: 2.5rem 2.25rem 2.25rem; } }
        .rp-top { margin-bottom: 2rem; }
        .rp-h { font-family: var(--ev-font-display); font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; margin-bottom: 0.3rem; }
        .rp-sub { font-size: 0.85rem; color: rgba(255,255,255,0.8); margin-bottom: 1.5rem; line-height: 1.6; }
        .rp-err {
          display: flex; gap: 0.5rem; align-items: flex-start;
          font-size: 0.82rem; color: #F3B4A6; background: var(--ev-danger-soft);
          border: 1px solid rgba(229,100,75,0.3); border-radius: 10px; padding: 0.65rem 0.8rem; margin-top: 0.9rem;
        }
        .rp-err svg { flex-shrink: 0; margin-top: 2px; }
        .rp-hint { font-size: 0.75rem; color: rgba(255,255,255,0.72); margin-top: 0.5rem; }
        .rp-center { display: flex; flex-direction: column; align-items: center; gap: 0.9rem; padding: 1rem 0; color: rgba(255,255,255,0.8); font-size: 0.88rem; }
        .rp-link { color: var(--ev-gold); font-weight: 600; text-decoration: none; }
        .rp-link:hover { text-decoration: underline; }
      `}</style>

      <div className="ev-reset ev-shell-dark rp-shell">
        <div className="rp-bg">
          <div className="ev-card-dark rp-card">
            <div className="rp-top">
              <Link className="ev-logo" to="/" style={{ color: '#fff' }}>
                <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
                <span><em className="ev-logo-em">Elev</em>aid</span>
              </Link>
            </div>

            {phase === 'checking' && (
              <div className="rp-center" role="status">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--ev-gold)' }} />
                Checking your reset link…
              </div>
            )}

            {phase === 'invalid' && (
              <>
                <div className="rp-h">This reset link is invalid or expired.</div>
                <div className="rp-sub">Reset links work once and expire after a short time. Request a new one and use the latest email.</div>
                <Link to="/auth?mode=signin" className="ev-btn ev-btn-primary ev-btn-block" style={{ padding: '0.9rem' }}>
                  Back to sign in <ArrowRight size={15} />
                </Link>
              </>
            )}

            {(phase === 'ready' || phase === 'saving') && (
              <>
                <div className="rp-h">Choose a new password.</div>
                <div className="rp-sub">You'll be signed in once it's saved.</div>
                <form onSubmit={handleSubmit} noValidate>
                  <div className="ev-field" style={{ marginBottom: '0.65rem' }}>
                    <label className="sr-only" htmlFor="new-password">New password</label>
                    <input
                      id="new-password" className="ev-input" type="password" placeholder="New password"
                      value={password} onChange={e => setPassword(e.target.value)}
                      autoComplete="new-password" minLength={MIN_LENGTH} disabled={saving} autoFocus
                    />
                  </div>
                  <div className="ev-field">
                    <label className="sr-only" htmlFor="confirm-password">Confirm new password</label>
                    <input
                      id="confirm-password" className="ev-input" type="password" placeholder="Confirm new password"
                      value={confirm} onChange={e => setConfirm(e.target.value)}
                      autoComplete="new-password" minLength={MIN_LENGTH} disabled={saving}
                    />
                  </div>
                  <div className="rp-hint">At least {MIN_LENGTH} characters.</div>

                  {error && (
                    <div className="rp-err" role="alert"><AlertCircle size={14} />{error}</div>
                  )}

                  <button type="submit" className="ev-btn ev-btn-primary ev-btn-block" disabled={saving} style={{ marginTop: '1.1rem', padding: '0.9rem' }}>
                    {saving ? 'Saving…' : <>Save password <ArrowRight size={15} /></>}
                  </button>
                </form>
                <div className="rp-hint" style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link to="/auth?mode=signin" className="rp-link">Back to sign in</Link>
                </div>
              </>
            )}
          </div>
        </div>
        <LegalFooter />
      </div>
    </>
  );
}
