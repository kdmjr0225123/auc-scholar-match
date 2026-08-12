import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { GraduationCap, User, ClipboardList, Star, ArrowRight } from 'lucide-react';

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
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from('student_profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .maybeSingle();
        navigate(profile ? '/dashboard' : '/profile-setup');
      }
    };
    checkSession();
  }, []);

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
        if (data.user) navigate('/profile-setup');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (error) throw error;
        navigate('/dashboard');
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .auth-bg {
          min-height: 100vh; min-height: 100dvh;
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
      `}</style>

      <div className="ev-reset ev-shell-dark auth-bg">
        <div className="ev-card-dark auth-card">
          <div className="auth-top">
            <a className="ev-logo" href="/" style={{ color: '#fff' }}>
              <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
              <span><em className="ev-logo-em">Elev</em>aid</span>
            </a>
            <button className="ev-btn ev-btn-ghost-dark" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }} onClick={() => setMode(m => m === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Log in' : 'Sign up'}
            </button>
          </div>

          {mode === 'signup' && <ProgressDots />}

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

            <button type="submit" className="ev-btn ev-btn-primary ev-btn-block" disabled={loading} style={{ marginTop: '1.1rem', padding: '0.9rem' }}>
              {loading ? 'Loadingâ€¦' : mode === 'signup' ? <>Continue <ArrowRight size={15} /></> : <>Sign In <ArrowRight size={15} /></>}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button onClick={() => setMode(m => m === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
