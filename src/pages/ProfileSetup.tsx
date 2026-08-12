import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { GraduationCap, Check, Loader2 } from 'lucide-react';
import { SCHOOL_THEME } from '@/lib/schoolTheme';

const SCHOOLS = Object.values(SCHOOL_THEME);

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

  const selectingRef = useRef(false);
  const select = (key: string, value: string) => {
    if (selectingRef.current) return;
    selectingRef.current = true;
    setForm(f => ({ ...f, [key]: value }));
    setTimeout(() => {
      next();
      selectingRef.current = false;
    }, 260);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Session expired', description: 'Please sign in again.' });
      navigate('/auth');
      return;
    }

    next(); // show loading screen immediately
    const startTime = Date.now();

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

      const { error: insertError } = await supabase
        .from('student_profiles')
        .insert(profileData);

      if (insertError) {
        if (insertError.code === '23505') {
          const { error: updateError } = await supabase
            .from('student_profiles')
            .update(profileData)
            .eq('user_id', user.id);
          if (updateError) throw updateError;
        } else {
          throw insertError;
        }
      }

      // Ensure loading screen shows for at least 1.5s before redirect
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1500 - elapsed);
      await new Promise(resolve => setTimeout(resolve, remaining));

      navigate('/dashboard');
    } catch (err: any) {
      console.error('Submit error:', err);
      toast({ variant: 'destructive', title: 'Something went wrong', description: 'Could not save your profile. Please try again.' });
      setStep(STEPS.indexOf('gpa'));
    }
  };

  const filteredMajors = MAJORS.filter(m =>
    m.toLowerCase().includes(majorSearch.toLowerCase())
  );

  return (
    <>
      <style>{`
        .ob-header { padding: calc(env(safe-area-inset-top, 0px) + 1rem) 1.5rem 0; display: flex; justify-content: space-between; align-items: center; position: relative; z-index: 1; }
        .ob-step-info { font-size: 0.72rem; color: var(--ev-text-faint); }
        .ob-progress { margin: 1rem 1.5rem 0; height: 3px; background: var(--ev-border); border-radius: 100px; overflow: hidden; }
        .ob-progress-fill { height: 100%; background: var(--ev-gold); border-radius: 100px; transition: width 0.4s cubic-bezier(0.16,1,0.3,1); }
        .ob-content { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 2rem 1.5rem; position: relative; z-index: 1; max-width: 440px; margin: 0 auto; width: 100%; }
        .ob-question { font-family: var(--ev-font-display); font-size: clamp(1.4rem, 6vw, 1.9rem); font-weight: 700; color: #fff; letter-spacing: -0.02em; line-height: 1.15; margin-bottom: 0.5rem; }
        .ob-question em { color: var(--ev-gold); font-style: normal; }
        .ob-sub { font-size: 0.85rem; color: var(--ev-text-faint); margin-bottom: 2rem; }

        .ob-school-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .ob-school-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-lg); padding: 1.25rem 1rem; cursor: pointer; text-align: center; transition: all 0.15s; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; background: var(--ev-surface); }
        .ob-school-btn.selected { border-color: var(--ev-gold-border); background: var(--ev-gold-soft); }
        .ob-school-btn:active { transform: scale(0.97); }
        .ob-school-name { font-size: 0.82rem; font-weight: 700; color: #fff; font-family: var(--ev-font-display); line-height: 1.2; }
        .ob-school-avatar { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; font-family: var(--ev-font-display); flex-shrink: 0; }

        .ob-year-list { display: flex; flex-direction: column; gap: 0.65rem; }
        .ob-year-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-md); padding: 1rem 1.25rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s; background: var(--ev-surface); }
        .ob-year-btn.selected { background: var(--ev-gold-soft); border-color: var(--ev-gold-border); }
        .ob-year-btn:active { transform: scale(0.98); }
        .ob-year-label { font-size: 0.92rem; font-weight: 600; color: #fff; }
        .ob-year-check { width: 20px; height: 20px; border-radius: 50%; background: var(--ev-surface-2); border: 1.5px solid var(--ev-border); display: flex; align-items: center; justify-content: center; }
        .ob-year-btn.selected .ob-year-check { background: var(--ev-gold); border-color: var(--ev-gold); }

        .ob-major-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 320px; overflow-y: auto; scrollbar-width: none; }
        .ob-major-list::-webkit-scrollbar { display: none; }
        .ob-major-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-md); padding: 0.85rem 1rem; cursor: pointer; text-align: left; font-size: 0.88rem; font-weight: 500; color: var(--ev-text-muted); font-family: var(--ev-font-body); transition: all 0.15s; background: var(--ev-surface); }
        .ob-major-btn.selected { background: var(--ev-gold-soft); border-color: var(--ev-gold-border); color: #fff; }
        .ob-major-btn:active { transform: scale(0.99); }

        .ob-name-fields { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem; }

        .ob-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 1.5rem; padding: 2rem; text-align: center; }
        .ob-loading-title { font-family: var(--ev-font-display); font-size: 1.3rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
        .ob-loading-sub { font-size: 0.85rem; color: var(--ev-text-faint); line-height: 1.6; margin-top: 0.5rem; }
        .spin { animation: ev-spin 1s linear infinite; }
      `}</style>

      <div className="ev-reset ev-shell-dark" style={{ display: 'flex', flexDirection: 'column' }}>
        {currentStep !== 'loading' && (
          <>
            <div className="ob-header">
              <span className="ev-logo" style={{ color: '#fff' }}>
                <span className="ev-logo-mark"><GraduationCap size={14} strokeWidth={2.25} /></span>
                <span><em className="ev-logo-em">Elev</em>aid</span>
              </span>
              <div className="ob-step-info">{step + 1} of {STEPS.length - 1}</div>
            </div>
            <div className="ob-progress">
              <div className="ob-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </>
        )}

        {currentStep === 'loading' && (
          <div className="ob-loading">
            <Loader2 size={40} className="spin" color="var(--ev-gold)" strokeWidth={2.25} />
            <div>
              <div className="ob-loading-title">Finding your matchesâ€¦</div>
              <div className="ob-loading-sub">Checking every scholarship against your profile.</div>
            </div>
          </div>
        )}

        {currentStep === 'name' && (
          <div className="ob-content" key="name">
            <div className="ob-question">What's your <em>name?</em></div>
            <div className="ob-sub">We'll personalize your experience.</div>
            <div className="ob-name-fields">
              <div className="ev-field">
                <label className="sr-only" htmlFor="first_name">First name</label>
                <input id="first_name" className="ev-input" type="text" placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} autoFocus />
              </div>
              <div className="ev-field">
                <label className="sr-only" htmlFor="last_name">Last name</label>
                <input id="last_name" className="ev-input" type="text" placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <button className="ev-btn ev-btn-primary ev-btn-block" style={{ padding: '0.9rem' }} onClick={next} disabled={!form.first_name || !form.last_name}>Continue â†’</button>
          </div>
        )}

        {currentStep === 'school' && (
          <div className="ob-content" key="school">
            <div className="ob-question">What school <em>do you attend?</em></div>
            <div className="ob-sub">Tap to select.</div>
            <div className="ob-school-grid">
              {SCHOOLS.map(s => (
                <button key={s.school} className={`ob-school-btn${form.school === s.school ? ' selected' : ''}`} onClick={() => select('school', s.school)}>
                  <div className="ob-school-avatar" style={{ background: s.hex, color: s.onFill, fontSize: s.initials.length > 2 ? '0.7rem' : '0.9rem', border: form.school === s.school ? '2px solid var(--ev-gold)' : '2px solid rgba(255,255,255,0.1)' }}>{s.initials}</div>
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
            <div className="ev-field" style={{ marginBottom: '0.75rem' }}>
              <label className="sr-only" htmlFor="major-search">Search majors</label>
              <input id="major-search" className="ev-input" type="text" placeholder="Search majorsâ€¦" value={majorSearch} onChange={e => setMajorSearch(e.target.value)} autoFocus />
            </div>
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
                    {form.graduation_year === y.value && <Check size={12} color="var(--ev-navy-deep)" strokeWidth={3} />}
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
              <div style={{ fontFamily: "var(--ev-font-display)", fontSize: '3.5rem', fontWeight: 700, color: 'var(--ev-gold)', letterSpacing: '-0.03em', lineHeight: 1 }}>{parseFloat(form.gpa).toFixed(1)}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--ev-text-faint)', marginTop: '0.35rem' }}>out of 4.0</div>
            </div>

            <div style={{ padding: '0 0.5rem', marginBottom: '2rem' }}>
              <label className="sr-only" htmlFor="gpa-slider">GPA</label>
              <input
                id="gpa-slider"
                type="range"
                min="0"
                max="40"
                step="1"
                value={Math.round(parseFloat(form.gpa) * 10)}
                onChange={e => setForm(f => ({ ...f, gpa: (parseInt(e.target.value) / 10).toFixed(1) }))}
                style={{ width: '100%', accentColor: 'var(--ev-gold)', height: '4px', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                {['0.0', '1.0', '2.0', '3.0', '4.0'].map(v => (
                  <span key={v} style={{ fontSize: '0.7rem', color: 'var(--ev-text-faint)' }}>{v}</span>
                ))}
              </div>
            </div>

            <button className="ev-btn ev-btn-primary ev-btn-block" style={{ padding: '1rem' }} onClick={handleSubmit}>
              Find My Scholarships
            </button>
          </div>
        )}
      </div>
    </>
  );
}
