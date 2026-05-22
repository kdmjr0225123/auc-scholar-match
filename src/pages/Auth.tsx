import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Mode = 'signup' | 'signin';

const StepIcon = ({ icon, state }: { icon: string; state: 'active' | 'done' | 'idle' }) => (
  <div style={{
    width: 48, height: 48, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: state === 'done' ? '#E8B84B' : state === 'active' ? '#1E3A5F' : '#162030',
    border: state === 'active' ? '2px solid #E8B84B' : state === 'done' ? 'none' : '2px solid rgba(255,255,255,0.07)',
    fontSize: state === 'done' ? '1rem' : '1.1rem',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  }}>
    {state === 'done' ? (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
    ) : (
      <span style={{ filter: state === 'idle' ? 'grayscale(1) opacity(0.3)' : 'none' }}>{icon}</span>
    )}
  </div>
);

const StepLine = ({ done }: { done: boolean }) => (
  <div style={{ width: 56, height: 2, background: done ? '#E8B84B' : 'rgba(255,255,255,0.06)', flexShrink: 0, marginBottom: '1.55rem', transition: 'background 0.3s ease' }} />
);

export default function Auth() {
  const [mode, setMode] = useState<Mode>('signup');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const { toast } = useToast();
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { first_name: form.firstName, last_name: form.lastName } }
        });
        if (error) throw error;
        navigate('/profile');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
        navigate('/dashboard');
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) toast({ variant: 'destructive', title: 'Error', description: error.message });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .auth-bg {
          min-height: 100vh;
          background: #0A1628;
          display: flex; align-items: center; justify-content: center;
          padding: 2rem;
          position: relative; overflow: hidden;
        }
        .auth-bg::before {
          content: '';
          position: absolute; top: -100px; left: 50%; transform: translateX(-50%);
          width: 700px; height: 400px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.06) 0%, transparent 65%);
          pointer-events: none;
        }
        .auth-bg::after {
          content: '';
          position: absolute; bottom: -80px; right: 10%;
          width: 400px; height: 300px;
          background: radial-gradient(ellipse, rgba(30,58,110,0.4) 0%, transparent 65%);
          pointer-events: none;
        }
        .auth-card {
          background: #111E2E;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          padding: 2.5rem 2.5rem 2.25rem;
          width: 100%; max-width: 440px;
          position: relative; z-index: 1;
          box-shadow: 0 32px 80px rgba(0,0,0,0.5);
          animation: cardIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .auth-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.25rem; }
        .auth-logo { font-family: 'Sora', sans-serif; font-size: 1.1rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.35rem; }
        .auth-logo em { color: #E8B84B; font-style: normal; }
        .auth-login-link { font-size: 0.8rem; color: #E8B84B; cursor: pointer; font-weight: 500; font-family: 'DM Sans', sans-serif; background: none; border: none; }
        .auth-login-link:hover { text-decoration: underline; }
        .prog { display: flex; align-items: center; justify-content: center; margin-bottom: 2.25rem; }
        .prog-node { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
        .prog-label { font-size: 0.62rem; font-weight: 500; white-space: nowrap; font-family: 'DM Sans', sans-serif; }
        .prog-label.active { color: #E8B84B; }
        .prog-label.done { color: rgba(255,255,255,0.4); }
        .prog-label.idle { color: rgba(255,255,255,0.18); }
        .auth-h { font-family: 'Sora', sans-serif; font-size: 1.6rem; font-weight: 800; color: #fff; letter-spacing: -0.025em; margin-bottom: 0.3rem; }
        .auth-sub { font-size: 0.8rem; color: rgba(255,255,255,0.28); margin-bottom: 1.75rem; font-family: 'DM Sans', sans-serif; }
        .f-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; margin-bottom: 0.65rem; }
        .f-input {
          width: 100%;
          background: #162030;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          font-size: 0.85rem; color: #fff;
          font-family: 'DM Sans', sans-serif;
          outline: none; display: block;
          margin-bottom: 0.65rem;
          transition: border-color 0.2s;
        }
        .f-input:focus { border-color: rgba(232,184,75,0.4); }
        .f-input::placeholder { color: rgba(255,255,255,0.18); }
        .f-input:last-child { margin-bottom: 0; }
        .auth-cta {
          width: 100%; background: #E8B84B; color: #0A1628;
          border: none; border-radius: 12px; padding: 0.95rem;
          font-size: 0.9rem; font-weight: 700; cursor: pointer;
          font-family: 'DM Sans', sans-serif; margin-top: 0.9rem;
          letter-spacing: 0.01em;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(232,184,75,0.25);
        }
        .auth-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(232,184,75,0.35); }
        .auth-cta:disabled { opacity: 0.6; cursor: not-allowed; }
        .auth-div {
          text-align: center; font-size: 0.7rem; color: rgba(255,255,255,0.14);
          margin: 1rem 0; position: relative;
          font-family: 'DM Sans', sans-serif;
        }
        .auth-div::before, .auth-div::after {
          content: ''; position: absolute; top: 50%;
          width: 43%; height: 1px; background: rgba(255,255,255,0.06);
        }
        .auth-div::before { left: 0; }
        .auth-div::after { right: 0; }
        .google-btn {
          width: 100%; background: #162030;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px; padding: 0.85rem;
          font-size: 0.85rem; color: rgba(255,255,255,0.55);
          cursor: pointer; font-family: 'DM Sans', sans-serif;
          display: flex; align-items: center; justify-content: center; gap: 0.6rem;
          transition: background 0.15s, border-color 0.15s;
        }
        .google-btn:hover { background: #1c2d42; border-color: rgba(255,255,255,0.12); }
        .auth-switch {
          text-align: center; font-size: 0.73rem;
          color: rgba(255,255,255,0.22); margin-top: 1.15rem;
          font-family: 'DM Sans', sans-serif;
        }
        .auth-switch button { color: #E8B84B; cursor: pointer; font-weight: 500; background: none; border: none; font-family: 'DM Sans', sans-serif; font-size: 0.73rem; }
        .auth-switch button:hover { text-decoration: underline; }
      `}</style>

      <div className="auth-bg">
        <div className="auth-card">
          <div className="auth-top">
            <div className="auth-logo">🎓 <em>Elev</em>aid</div>
            <button className="auth-login-link" onClick={() => setMode(m => m === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Log in' : 'Sign up'}
            </button>
          </div>

          {mode === 'signup' && (
            <div className="prog">
              <div className="prog-node">
                <StepIcon icon="👤" state="active" />
                <div className="prog-label active">Account</div>
              </div>
              <StepLine done={false} />
              <div className="prog-node">
                <StepIcon icon="📋" state="idle" />
                <div className="prog-label idle">Profile</div>
              </div>
              <StepLine done={false} />
              <div className="prog-node">
                <StepIcon icon="⭐" state="idle" />
                <div className="prog-label idle">Matches</div>
              </div>
            </div>
          )}

          <div className="auth-h">{mode === 'signup' ? "Let's get started." : 'Welcome back.'}</div>
          <div className="auth-sub">{mode === 'signup' ? 'Create your account to unlock your matches.' : 'Sign in to see your scholarship matches.'}</div>

          {mode === 'signup' && (
            <div className="f-row">
              <input className="f-input" style={{ marginBottom: 0 }} type="text" placeholder="First name" value={form.firstName} onChange={set('firstName')} />
              <input className="f-input" style={{ marginBottom: 0 }} type="text" placeholder="Last name" value={form.lastName} onChange={set('lastName')} />
            </div>
          )}
          <input className="f-input" type="email" placeholder="Email address" value={form.email} onChange={set('email')} />
          <input className="f-input" type="password" placeholder="Password" value={form.password} onChange={set('password')} style={{ marginBottom: 0 }} />

          <button className="auth-cta" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Loading...' : mode === 'signup' ? 'Continue →' : 'Sign In →'}
          </button>

          

          <button className="google-btn" onClick={handleGoogle}>
            <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>

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
