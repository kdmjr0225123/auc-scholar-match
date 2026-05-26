import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const SCHOOLS = [
  { value: 'morehouse', label: 'Morehouse College', short: 'Morehouse', color: '#8B0000', initials: 'MC' },
  { value: 'spelman', label: 'Spelman College', short: 'Spelman', color: '#003F87', initials: 'SC' },
  { value: 'clark_atlanta', label: 'Clark Atlanta University', short: 'Clark Atlanta', color: '#CC0000', initials: 'CAU' },
  { value: 'morris_brown', label: 'Morris Brown College', short: 'Morris Brown', color: '#4B0082', initials: 'MB' },
];

const MAJORS = [
  'Computer Science', 'Business Administration', 'Biology', 'Psychology',
  'Engineering', 'Communications', 'Education', 'Pre-Med',
  'Political Science', 'Mathematics', 'Nursing', 'Economics',
  'English', 'Sociology', 'Other',
];

const YEARS = [
  { value: '2027', label: 'Class of 2027' },
  { value: '2028', label: 'Class of 2028' },
  { value: '2029', label: 'Class of 2029' },
  { value: '2030', label: 'Class of 2030' },
];

const STEPS = ['name', 'school', 'major', 'year', 'gpa', 'loading'];

export default function ProfileSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    first_name: '', last_name: '', school: '', major: '', graduation_year: '', gpa: '3.0',
  });
  const [majorSearch, setMajorSearch] = useState('');

  const currentStep = STEPS[step];
  const progress = (step / (STEPS.length - 1)) * 100;

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1));

  const select = (key: string, value: string) => {
    setForm(f => ({ ...f, [key]: value }));
    setTimeout(() => next(), 220);
  };

  const handleSubmit = async () => {
    // If no user session, send back to auth
    if (!user) {
      toast({ variant: 'destructive', title: 'Session expired', description: 'Please sign in again.' });
      navigate('/auth');
      return;
    }

    next(); // show loading screen immediately

    try {
      const profileData = {
        user_id: user.id,
        first_name: form.first_name || 'Student',
        last_name: form.last_name || '',
        email: user.email,
        school: form.school as 'morehouse' | 'spelman' | 'clark_atlanta' | 'morris_brown',
        major: form.major,
        graduation_year: parseInt(form.graduation_year),
        gpa: parseFloat(form.gpa),
      };

      // Try insert first, if duplicate then update
      const { error: insertError } = await supabase
        .from('student_profiles')
        .insert(profileData);

      if (insertError) {
        // If duplicate user_id, update instead
        if (insertError.code === '23505') {
          const { error: updateError } = await supabase
            .from('student_profiles')
            .update(profileData)
            .eq('user_id', user.id);
          if (updateError) {
            console.error('Profile update error:', updateError);
          }
        } else {
          console.error('Profile insert error:', insertError);
        }
      }
    } catch (err: any) {
      console.error('Submit error:', err);
      // Same — don't trap the user on the loading screen
    } finally {
      // Always navigate, with a short delay so the loading animation feels intentional
      setTimeout(() => navigate('/dashboard'), 1500);
    }
  };

  const filteredMajors = MAJORS.filter(m =>
    m.toLowerCase().includes(majorSearch.toLowerCase())
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .ob-bg {
          min-height: 100vh; min-height: 100dvh;
          background: #0A1628;
          display: flex; flex-direction: column;
          font-family: 'DM Sans', sans-serif;
          position: relative; overflow: hidden;
        }
        .ob-bg::before {
          content: ''; position: absolute;
          top: -100px; left: 50%; transform: translateX(-50%);
          width: 600px; height: 400px;
          background: radial-gradient(ellipse, rgba(232,184,75,0.06) 0%, transparent 65%);
          pointer-events: none;
        }
        .ob-header {
          padding: calc(env(safe-area-inset-top, 0px) + 1rem) 1.5rem 0;
          display: flex; justify-content: space-between; align-items: center;
          position: relative; z-index: 1;
        }
        .ob-logo { font-family: 'Sora', sans-serif; font-size: 1rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
        .ob-logo em { color: #E8B84B; font-style: normal; }
        .ob-step-info { font-size: 0.72rem; color: rgba(255,255,255,0.25); }
        .ob-progress { margin: 1rem 1.5rem 0; height: 2px; background: rgba(255,255,255,0.06); border-radius: 100px; overflow: hidden; }
        .ob-progress-fill { height: 100%; background: #E8B84B; border-radius: 100px; transition: width 0.4s cubic-bezier(0.16,1,0.3,1); }
        .ob-content {
          flex: 1; display: flex; flex-direction: column; justify-content: center;
          padding: 2rem 1.5rem; position: relative; z-index: 1;
          animation: stepIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        @keyframes stepIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .ob-question { font-family: 'Sora', sans-serif; font-size: clamp(1.5rem, 6vw, 2rem); font-weight: 800; color: #fff; letter-spacing: -0.025em; line-height: 1.15; margin-bottom: 0.5rem; }
        .ob-question em { color: #E8B84B; font-style: normal; }
        .ob-sub { font-size: 0.85rem; color: rgba(255,255,255,0.3); margin-bottom: 2rem; }

        .ob-school-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .ob-school-btn {
          background: #111E2E; border: 1px solid rgba(255,255,255,0.07);
          border-radius: 16px; padding: 1.25rem 1rem;
          cursor: pointer; text-align: center; transition: all 0.15s;
          display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
        }
        .ob-school-btn.selected { border-color: rgba(232,184,75,0.5); background: rgba(232,184,75,0.08); }
        .ob-school-btn:active { transform: scale(0.97); }
        .ob-school-name { font-size: 0.82rem; font-weight: 700; color: #fff; font-family: 'Sora', sans-serif; line-height: 1.2; }

        .ob-year-list { display: flex; flex-direction: column; gap: 0.65rem; }
        .ob-year-btn { background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1rem 1.25rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s; }
        .ob-year-btn.selected { background: rgba(232,184,75,0.1); border-color: rgba(232,184,75,0.4); }
        .ob-year-btn:active { transform: scale(0.98); }
        .ob-year-label { font-size: 0.92rem; font-weight: 600; color: #fff; }
        .ob-year-check { width: 20px; height: 20px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; }
        .ob-year-btn.selected .ob-year-check { background: #E8B84B; border-color: #E8B84B; }

        .ob-search { width: 100%; background: #111E2E; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.85rem 1rem; font-size: 0.88rem; color: #fff; font-family: 'DM Sans', sans-serif; outline: none; margin-bottom: 0.75rem; }
        .ob-search::placeholder { color: rgba(255,255,255,0.2); }
        .ob-search:focus { border-color: rgba(232,184,75,0.4); }
        .ob-major-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 340px; overflow-y: auto; scrollbar-width: none; }
        .ob-major-list::-webkit-scrollbar { display: none; }
        .ob-major-btn { background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 0.85rem 1rem; cursor: pointer; text-align: left; font-size: 0.88rem; font-weight: 500; color: rgba(255,255,255,0.7); font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .ob-major-btn.selected { background: rgba(232,184,75,0.1); border-color: rgba(232,184,75,0.4); color: #fff; }
        .ob-major-btn:active { transform: scale(0.99); }

        .ob-name-fields { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }
        .ob-input { width: 100%; background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 0.95rem 1rem; font-size: 0.95rem; color: #fff; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; }
        .ob-input::placeholder { color: rgba(255,255,255,0.2); }
        .ob-input:focus { border-color: rgba(232,184,75,0.4); }

        .ob-cta { width: 100%; background: #E8B84B; color: #0A1628; border: none; border-radius: 12px; padding: 1rem; font-size: 0.95rem; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; letter-spacing: 0.01em; transition: transform 0.15s, opacity 0.15s; }
        .ob-cta:disabled { opacity: 0.4; cursor: not-allowed; }
        .ob-cta:active:not(:disabled) { transform: scale(0.98); }

        .ob-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 1.5rem; padding: 2rem; text-align: center; }
        .ob-spinner { width: 48px; height: 48px; border: 3px solid rgba(232,184,75,0.15); border-top-color: #E8B84B; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ob-loading-title { font-family: 'Sora', sans-serif; font-size: 1.4rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
        .ob-loading-sub { font-size: 0.85rem; color: rgba(255,255,255,0.3); line-height: 1.6; margin-top: 0.5rem; }
        .ob-loading-dots { display: flex; gap: 0.4rem; margin-top: 1rem; justify-content: center; }
        .ob-dot { width: 6px; height: 6px; background: #E8B84B; border-radius: 50%; animation: pulse 1.2s ease-in-out infinite; }
        .ob-dot:nth-child(2) { animation-delay: 0.2s; }
        .ob-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
      `}</style>

      <div className="ob-bg">
        {currentStep !== 'loading' && (
          <>
            <div className="ob-header">
              <div className="ob-logo">🎓 <em>Elev</em>aid</div>
              <div className="ob-step-info">{step + 1} of {STEPS.length - 1}</div>
            </div>
            <div className="ob-progress">
              <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        )}

        {currentStep === 'loading' && (
          <div className="ob-loading">
            <div className="ob-spinner" />
            <div>
              <div className="ob-loading-title">Finding your matches...</div>
              <div className="ob-loading-sub">Checking every scholarship against your profile.</div>
              <div className="ob-loading-dots">
                <div className="ob-dot" /><div className="ob-dot" /><div className="ob-dot" />
              </div>
            </div>
          </div>
        )}

        {currentStep === 'name' && (
          <div className="ob-content" key="name">
            <div className="ob-question">What's your <em>name?</em></div>
            <div className="ob-sub">We'll personalize your experience.</div>
            <div className="ob-name-fields">
              <input className="ob-input" type="text" placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} autoFocus />
              <input className="ob-input" type="text" placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
            <button className="ob-cta" onClick={next} disabled={!form.first_name || !form.last_name}>Continue →</button>
          </div>
        )}

        {currentStep === 'school' && (
          <div className="ob-content" key="school">
            <div className="ob-question">What school <em>do you attend?</em></div>
            <div className="ob-sub">Tap to select.</div>
            <div className="ob-school-grid">
              {SCHOOLS.map(s => (
                <button key={s.value} className={`ob-school-btn${form.school === s.value ? ' selected' : ''}`} onClick={() => select('school', s.value)}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: s.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: s.initials.length > 2 ? '0.7rem' : '0.9rem',
                    fontWeight: 800, color: '#fff',
                    fontFamily: "'Sora', sans-serif",
                    letterSpacing: '-0.02em',
                    flexShrink: 0,
                    border: form.school === s.value ? '2px solid #E8B84B' : '2px solid rgba(255,255,255,0.1)',
                  }}>{s.initials}</div>
                  <div className="ob-school-name">{s.short}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'major' && (
          <div className="ob-content" key="major">
            <div className="ob-question">What's your <em>major?</em></div>
            <div className="ob-sub">Search or scroll to find yours.</div>
            <input className="ob-search" type="text" placeholder="Search majors..." value={majorSearch} onChange={e => setMajorSearch(e.target.value)} autoFocus />
            <div className="ob-major-list">
              {filteredMajors.map(m => (
                <button key={m} className={`ob-major-btn${form.major === m ? ' selected' : ''}`} onClick={() => select('major', m)}>{m}</button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'year' && (
          <div className="ob-content" key="year">
            <div className="ob-question">When do you <em>graduate?</em></div>
            <div className="ob-sub">Select your graduation year.</div>
            <div className="ob-year-list">
              {YEARS.map(y => (
                <button key={y.value} className={`ob-year-btn${form.graduation_year === y.value ? ' selected' : ''}`} onClick={() => select('graduation_year', y.value)}>
                  <span className="ob-year-label">{y.label}</span>
                  <div className="ob-year-check">
                    {form.graduation_year === y.value && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 'gpa' && (
          <div className="ob-content" key="gpa">
            <div className="ob-question">What's your <em>GPA?</em></div>
            <div className="ob-sub">Slide to your exact GPA.</div>

            <div style={{ textAlign: 'center', margin: '1.5rem 0' }}>
              <div style={{ fontFamily: "'Sora', sans-serif", fontSize: '4rem', fontWeight: 800, color: '#E8B84B', letterSpacing: '-0.03em', lineHeight: 1 }}>{parseFloat(form.gpa).toFixed(1)}</div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.35rem' }}>out of 4.0</div>
            </div>

            <div style={{ padding: '0 0.5rem', marginBottom: '2rem' }}>
              <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={Math.round(parseFloat(form.gpa) * 10)}
                onChange={e => setForm(f => ({ ...f, gpa: (parseInt(e.target.value) / 10).toFixed(1) }))}
                style={{ width: '100%', accentColor: '#E8B84B', height: '4px', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>0.0</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>1.0</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>2.0</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>3.0</span>
                <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>4.0</span>
              </div>
            </div>

            <button className="ob-cta" onClick={handleSubmit}>
              Find My Scholarships ⚡
            </button>
          </div>
        )}
      </div>
    </>
  );
}
