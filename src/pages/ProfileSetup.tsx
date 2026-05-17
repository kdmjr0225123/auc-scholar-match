import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const SCHOOLS = [
  { value: 'morehouse', label: 'Morehouse College' },
  { value: 'spelman', label: 'Spelman College' },
  { value: 'clark_atlanta', label: 'Clark Atlanta University' },
  { value: 'morris_brown', label: 'Morris Brown College' },
];

const MAJORS = [
  'Computer Science', 'Business Administration', 'Biology', 'Psychology',
  'Engineering', 'Communications', 'Education', 'Pre-Med',
  'Political Science', 'Mathematics', 'Nursing', 'Economics',
  'English', 'Sociology', 'Other',
];

const YEARS = [2025, 2026, 2027, 2028, 2029];

const GPA_OPTIONS = ['2.0', '2.3', '2.5', '2.7', '3.0', '3.2', '3.3', '3.5', '3.7', '3.8', '3.9', '4.0'];

const StepNode = ({ icon, state, label }: { icon: string; state: 'active' | 'done' | 'idle'; label: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: state === 'done' ? '#E8B84B' : state === 'active' ? '#1E3A5F' : '#162030',
      border: state === 'active' ? '2px solid #E8B84B' : state === 'done' ? 'none' : '2px solid rgba(255,255,255,0.07)',
      fontSize: '1rem', flexShrink: 0,
    }}>
      {state === 'done'
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2.5"><path d="M5 13l4 4L19 7"/></svg>
        : <span style={{ filter: state === 'idle' ? 'grayscale(1) opacity(0.25)' : 'none' }}>{icon}</span>
      }
    </div>
    <span style={{
      fontSize: '0.62rem', fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
      color: state === 'active' ? '#E8B84B' : state === 'done' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.18)',
    }}>{label}</span>
  </div>
);

export default function ProfileSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    first_name: '', last_name: '', school: '', major: '', graduation_year: '', gpa: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!user) return;
    const required = ['first_name', 'last_name', 'school', 'major', 'graduation_year', 'gpa'];
    if (required.some(k => !form[k as keyof typeof form])) {
      toast({ variant: 'destructive', title: 'Missing fields', description: 'Please fill in all fields.' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.from('student_profiles').upsert({
        user_id: user.id,
        first_name: form.first_name,
        last_name: form.last_name,
        email: user.email,
        school: form.school,
        major: form.major,
        graduation_year: parseInt(form.graduation_year),
        gpa: parseFloat(form.gpa),
      });
      if (error) throw error;
      navigate('/dashboard');
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
        .profile-bg {
          min-height: 100vh;
          background: #0A1628;
          display: flex; align-items: center; justify-content: center;
          padding: 2rem;
          position: relative; overflow: hidden;
        }
        .profile-bg::before {
          content: '';
          position: absolute; top: -100px; right: 10%;
          width: 500px; height: 400px;
          background: radial-gradient(ellipse, rgba(30,58,110,0.5) 0%, transparent 65%);
          pointer-events: none;
        }
        .profile-card {
          background: #111E2E;
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 24px;
          padding: 2.5rem 2.5rem 2.25rem;
          width: 100%; max-width: 460px;
          position: relative; z-index: 1;
          box-shadow: 0 32px 80px rgba(0,0,0,0.5);
          animation: cardIn 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .p-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2.25rem; }
        .p-logo { font-family: 'Sora', sans-serif; font-size: 1.1rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; display: flex; align-items: center; gap: 0.35rem; }
        .p-logo em { color: #E8B84B; font-style: normal; }
        .p-step-info { font-size: 0.72rem; color: rgba(255,255,255,0.25); font-family: 'DM Sans', sans-serif; }
        .prog { display: flex; align-items: center; justify-content: center; margin-bottom: 2rem; }
        .prog-line { width: 56px; height: 2px; flexShrink: 0; margin-bottom: 1.55rem; }
        .pbar-wrap { height: 3px; background: rgba(255,255,255,0.06); border-radius: 100px; margin-bottom: 2rem; overflow: hidden; }
        .pbar-fill { height: 100%; border-radius: 100px; background: #E8B84B; width: 50%; transition: width 0.5s ease; }
        .p-h { font-family: 'Sora', sans-serif; font-size: 1.55rem; font-weight: 800; color: #fff; letter-spacing: -0.025em; margin-bottom: 0.3rem; }
        .p-sub { font-size: 0.8rem; color: rgba(255,255,255,0.28); margin-bottom: 1.75rem; font-family: 'DM Sans', sans-serif; }
        .f-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; margin-bottom: 0.65rem; }
        .f-field {
          width: 100%;
          background: #162030;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 0.85rem 1rem;
          font-size: 0.85rem; color: rgba(255,255,255,0.6);
          font-family: 'DM Sans', sans-serif;
          outline: none; display: block;
          margin-bottom: 0.65rem;
          appearance: none; -webkit-appearance: none;
          transition: border-color 0.2s;
        }
        .f-field:focus { border-color: rgba(232,184,75,0.4); }
        .f-field::placeholder { color: rgba(255,255,255,0.18); }
        .f-field option { background: #162030; color: #fff; }
        .f-field:last-child { margin-bottom: 0; }
        .f-row .f-field { margin-bottom: 0; }
        .p-cta {
          width: 100%; background: #E8B84B; color: #0A1628;
          border: none; border-radius: 12px; padding: 1rem;
          font-size: 0.92rem; font-weight: 700; cursor: pointer;
          font-family: 'DM Sans', sans-serif; margin-top: 0.9rem;
          letter-spacing: 0.01em;
          transition: transform 0.15s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(232,184,75,0.25);
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
        }
        .p-cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(232,184,75,0.35); }
        .p-cta:disabled { opacity: 0.6; cursor: not-allowed; }
        .f-input-white { color: #fff !important; }
      `}</style>

      <div className="profile-bg">
        <div className="profile-card">
          <div className="p-top">
            <div className="p-logo">🎓 <em>Elev</em>aid</div>
            <div className="p-step-info">Step 2 of 3</div>
          </div>

          <div className="prog">
            <StepNode icon="👤" state="done" label="Account" />
            <div className="prog-line" style={{ background: '#E8B84B' }} />
            <StepNode icon="📋" state="active" label="Profile" />
            <div className="prog-line" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <StepNode icon="⭐" state="idle" label="Matches" />
          </div>

          <div className="pbar-wrap"><div className="pbar-fill" /></div>

          <div className="p-h">Tell us about yourself.</div>
          <div className="p-sub">This is how we match you. Under 60 seconds.</div>

          <div className="f-row">
            <input className="f-field f-input-white" type="text" placeholder="First name" value={form.first_name} onChange={set('first_name')} style={{ marginBottom: 0 }} />
            <input className="f-field f-input-white" type="text" placeholder="Last name" value={form.last_name} onChange={set('last_name')} style={{ marginBottom: 0 }} />
          </div>

          <select className="f-field" value={form.school} onChange={set('school')}>
            <option value="" disabled>Select your school</option>
            {SCHOOLS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <div className="f-row">
            <select className="f-field" value={form.major} onChange={set('major')} style={{ marginBottom: 0 }}>
              <option value="" disabled>Major</option>
              {MAJORS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="f-field" value={form.graduation_year} onChange={set('graduation_year')} style={{ marginBottom: 0 }}>
              <option value="" disabled>Grad Year</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <select className="f-field" value={form.gpa} onChange={set('gpa')} style={{ marginBottom: 0 }}>
            <option value="" disabled>GPA</option>
            {GPA_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          <button className="p-cta" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Setting up...' : <>Find My Scholarships <span>⚡</span></>}
          </button>
        </div>
      </div>
    </>
  );
}
