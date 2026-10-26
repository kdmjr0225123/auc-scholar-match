import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { GraduationCap, User, ClipboardList, Star, ArrowRight, AlertCircle, MailCheck } from 'lucide-react';
import LegalFooter from '@/components/LegalFooter';
import { track } from '@/lib/analytics';

type Mode = 'signup' | 'signin';

const STEP_ICONS = [User, ClipboardList, Star];
const STEP_LABELS = ['Account', 'Profile', 'Matches'];

function ProgressDots() {
  return (
    <div className="auth-prog" aria-hidden="true">
      {STEP_ICONS.map((Icon, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <div className="auth-prog-node">
            <div className={`auth-step-icon${i === 0 ? ' active' : ''}`}>
              <Icon size={16} strokeWidth={2.25} />
            </div>
            <div className={`auth-prog-label${i === 0 ? ' active' : ''}`}>{STEP_LABELS[i]}</div>
          </div>
          {i < STEP_ICONS.length - 1 && <div className="auth-prog-line" />}
        </div>
      ))}
    </div>
  );
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'signin' ? 'signin' : 'signup');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [forgot, setForgot] = useState<{ open: boolean; email: string; loading: boolean; sent: boolean; error: string | null }>(
    { open: false, email: '', loading: false, sent: false, error: null },
  );
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const ownerEmail = import.meta.env.VITE_OWNER_EMAIL?.toLowerCase();
        if (ownerEmail && session.user.email?.toLowerCase() === ownerEmail) {
          const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', session.user.id)
            .maybeSingle();
          if (role?.role === 'admin') {
            navigate('/console', { replace: true });
            return;
          }
        }
        const { data: profile } = await supabase
          .from('student_profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        navigate(profile ? '/dashboard' : '/profile-setup');
      }
    };
    checkSession();
  }, [navigate]);

  const switchMode = () => {
    setMode(m => m === 'signup' ? 'signin' : 'signup');
    setForgot(f => ({ ...f, open: false, sent: false, error: null }));
  };

  const openForgot = () =>
    setForgot({ open: true, email: form.email, loading: false, sent: false, error: null });

  const handleForgot = async () => {
    const email = forgot.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setForgot(f => ({ ...f, error: 'Enter the email you signed up with.' }));
      return;
    }
    setForgot(f => ({ ...f, loading: true, error: null }));
    track('password_reset_requested');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Same confirmation whether or not the account exists. Only surface
      // failures that say nothing about the account: rate limits and the
      // request never reaching Supabase.
      if (error && error.status === 429) {
        setForgot(f => ({ ...f, loading: false, error: 'Too many reset requests. Wait a minute and try again.' }));
        return;
      }
      if (error && !error.status) throw error;
      setForgot(f => ({ ...f, loading: false, sent: true }));
    } catch {
      setForgot(f => ({ ...f, loading: false, error: "We couldn't reach the server. Check your connection and try again." }));
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.email || !form.password) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in all fields.' });
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { first_name: form.firstName, last_name: form.lastName } }
        });
        if (error) throw error;
        if (data.user) {
          track('signup_completed');
          navigate('/profile-setup');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        track('login');
        const ownerEmail = import.meta.env.VITE_OWNER_EMAIL?.toLowerCase();
        if (ownerEmail && data.user.email?.toLowerCase() === ownerEmail) {
          const { data: role } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', data.user.id)
            .maybeSingle();
          if (role?.role === 'admin') {
            navigate('/console', { replace: true });
            return;
          }
        }
        const { data: profile } = await supabase
          .from('student_profiles')
          .select('id')
          .eq('user_id', data.user.id)
          .maybeSingle();
        navigate(profile ? '/dashboard' : '/profile-setup', { replace: true });
      }
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .auth-shell { display: flex; flex-direction: column; }
        .auth-bg {
          flex: 1;
          display: flex; align-items: center; justify-content: center;
          padding: 2rem; position: relative; overflow: hidden;
        }
        .auth-bg::before {
          content: ''; position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
          width: 640px; height: 380px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.06) 0%, transparent 65%);
          pointer-events: none;
        }
        .auth-card {
          padding: 2.5rem 2.25rem 2.25rem;
          width: 100%; max-width: 420px;
          position: relative; z-index: 1;
          box-shadow: var(--ev-shadow-dark-md);
        }
        .auth-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .auth-prog { display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; }
        .auth-prog-node { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
        .auth-step-icon {
          width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: var(--ev-surface-2); border: 2px solid var(--ev-border);
          color: var(--ev-text-faint);
        }
        .auth-step-icon.active { background: var(--ev-gold-soft); border-color: var(--ev-gold-border); color: var(--ev-gold); }
        .auth-prog-label { font-size: 0.62rem; font-weight: 600; color: var(--ev-text-faint); }
        .auth-prog-label.active { color: var(--ev-gold); }
        .auth-prog-line { width: 48px; height: 2px; background: var(--ev-border); margin-bottom: 1.5rem; }
        .auth-h { font-family: var(--ev-font-display); font-size: 1.5rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; margin-bottom: 0.3rem; }
        .auth-sub { font-size: 0.82rem; color: var(--ev-text-faint); margin-bottom: 1.5rem; }
        .auth-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
        .auth-switch { text-align: center; font-size: 0.75rem; color: var(--ev-text-faint); margin-top: 1.25rem; }
        .auth-switch button { color: var(--ev-gold); cursor: pointer; font-weight: 600; background: none; border: none; font-family: var(--ev-font-body); font-size: 0.75rem; }
        .auth-switch button:hover { text-decoration: underline; }
        .auth-forgot-row { display: flex; justify-content: flex-end; margin-top: 0.55rem; }
        .auth-link-btn { color: var(--ev-gold); cursor: pointer; font-weight: 600; background: none; border: none; padding: 0; font-family: var(--ev-font-body); font-size: 0.75rem; }
        .auth-link-btn:hover { text-decoration: underline; }
        .auth-legal { text-align: center; font-size: 0.72rem; line-height: 1.5; color: rgba(255,255,255,0.72); margin-top: 0.75rem; }
        .auth-legal a { color: rgba(255,255,255,0.9); text-decoration: underline; text-underline-offset: 2px; }
        .auth-legal a:hover { color: var(--ev-gold); }
        .auth-note {
          display: flex; gap: 0.55rem; align-items: flex-start; font-size: 0.82rem; line-height: 1.55;
          border-radius: 10px; padding: 0.75rem 0.85rem; margin-top: 0.9rem;
        }
        .auth-note svg { flex-shrink: 0; margin-top: 2px; }
        .auth-note-ok { color: rgba(255,255,255,0.88); background: var(--ev-gold-soft); border: 1px solid var(--ev-gold-border); }
        .auth-note-ok svg { color: var(--ev-gold); }
        .auth-note-err { color: #F3B4A6; background: var(--ev-danger-soft); border: 1px solid rgba(229,100,75,0.3); }
      `}</style>

      <div className="ev-reset ev-shell-dark auth-shell">
      <div className="auth-bg">
        <div className="ev-card-dark auth-card">
          <div className="auth-top">
            <a className="ev-logo" href="/" style={{ color: '#fff' }}>
              <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
              <span><em className="ev-logo-em">Elev</em>aid</span>
            </a>
            <button className="ev-btn ev-btn-ghost-dark" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }} onClick={switchMode}>
              {mode === 'signup' ? 'Log in' : 'Sign up'}
            </button>
          </div>

          {mode === 'signup' && <ProgressDots />}

          {mode === 'signin' && forgot.open ? (
            <>
              <div className="auth-h">Reset your password.</div>
              <div className="auth-sub">Enter your account email and we'll send you a link to choose a new password.</div>
              <form onSubmit={e => { e.preventDefault(); void handleForgot(); }} noValidate>
                <div className="ev-field">
                  <label className="sr-only" htmlFor="forgot-email">Email address</label>
                  <input
                    id="forgot-email" className="ev-input" type="email" placeholder="Email address"
                    value={forgot.email} onChange={e => setForgot(f => ({ ...f, email: e.target.value, error: null }))}
                    autoComplete="email" disabled={forgot.loading} autoFocus
                  />
                </div>
                {forgot.sent && (
                  <div className="auth-note auth-note-ok" role="status">
                    <MailCheck size={15} />
                    <span>If an account exists for that email, a reset link is on its way. Check your inbox and spam folder.</span>
                  </div>
                )}
                {forgot.error && (
                  <div className="auth-note auth-note-err" role="alert">
                    <AlertCircle size={15} />
                    <span>{forgot.error}</span>
                  </div>
                )}
                <button type="submit" className="ev-btn ev-btn-primary ev-btn-block" disabled={forgot.loading} style={{ marginTop: '1.1rem', padding: '0.9rem' }}>
                  {forgot.loading ? 'Sending…' : forgot.sent ? 'Send again' : <>Send reset link <ArrowRight size={15} /></>}
                </button>
              </form>
              <div className="auth-switch">
                Remembered it?{' '}
                <button onClick={() => setForgot(f => ({ ...f, open: false, sent: false, error: null }))}>Back to sign in</button>
              </div>
            </>
          ) : (
          <>
          <div className="auth-h">{mode === 'signup' ? "Let's get started." : 'Welcome back.'}</div>
          <div className="auth-sub">{mode === 'signup' ? 'Create your account to unlock your matches.' : 'Sign in to see your scholarship matches.'}</div>

          <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
            {mode === 'signup' && (
              <div className="auth-row" style={{ marginBottom: '0.65rem' }}>
                <div className="ev-field">
                  <label className="sr-only" htmlFor="firstName">First name</label>
                  <input id="firstName" className="ev-input" type="text" placeholder="First name" value={form.firstName} onChange={set('firstName')} autoComplete="given-name" />
                </div>
                <div className="ev-field">
                  <label className="sr-only" htmlFor="lastName">Last name</label>
                  <input id="lastName" className="ev-input" type="text" placeholder="Last name" value={form.lastName} onChange={set('lastName')} autoComplete="family-name" />
                </div>
              </div>
            )}
            <div className="ev-field" style={{ marginBottom: '0.65rem' }}>
              <label className="sr-only" htmlFor="email">Email address</label>
              <input id="email" className="ev-input" type="email" placeholder="Email address" value={form.email} onChange={set('email')} autoComplete="email" />
            </div>
            <div className="ev-field">
              <label className="sr-only" htmlFor="password">Password</label>
              <input id="password" className="ev-input" type="password" placeholder="Password" value={form.password} onChange={set('password')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
            </div>
            {mode === 'signin' && (
              <div className="auth-forgot-row">
                <button type="button" className="auth-link-btn" onClick={openForgot}>Forgot password?</button>
              </div>
            )}

            <button type="submit" className="ev-btn ev-btn-primary ev-btn-block" disabled={loading} style={{ marginTop: '1.1rem', padding: '0.9rem' }}>
              {loading ? 'Loading…' : mode === 'signup' ? <>Continue <ArrowRight size={15} /></> : <>Sign In <ArrowRight size={15} /></>}
            </button>
            {mode === 'signup' && (
              <div className="auth-legal">
                By creating an account you agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
              </div>
            )}
          </form>

          <div className="auth-switch">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={switchMode}>
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
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
