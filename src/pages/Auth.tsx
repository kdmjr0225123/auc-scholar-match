import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
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


