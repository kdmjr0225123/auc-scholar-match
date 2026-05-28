import { useState, useEffect } from 'react';
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

export default function Profile() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [majorSearch, setMajorSearch] = useState('');
  const [form, setForm] = useState({
    first_name: '', last_name: '', school: '', major: '', graduation_year: '', gpa: '3.0',
  });

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setForm({
          first_name: data.first_name || '',
          last_name: data.last_name || '',
          school: data.school || '',
          major: data.major || '',
          graduation_year: data.graduation_year?.toString() || '',
          gpa: data.gpa?.toString() || '3.0',
        });
      }
      if (error) console.error('Error fetching profile:', error);
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('student_profiles')
        .update({
          first_name: form.first_name,
          last_name: form.last_name,
          school: form.school as 'morehouse' | 'spelman' | 'clark_atlanta' | 'morris_brown',
          major: form.major,
          graduation_year: parseInt(form.graduation_year),
          gpa: parseFloat(form.gpa),
        })
        .eq('user_id', user.id);
      if (error) throw error;
      toast({ title: 'Profile updated', description: 'Your matches have been refreshed.' });
      window.location.href = '/dashboard';
    } catch (err: any) {
      console.error('Save error:', err);
      toast({ variant: 'destructive', title: 'Error saving profile', description: 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const filteredMajors = MAJORS.filter(m =>
    m.toLowerCase().includes(majorSearch.toLowerCase())
  );

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, border: '3px solid rgba(232,184,75,0.15)', borderTopColor: '#E8B84B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .pr-bg { min-height: 100vh; min-height: 100dvh; background: #0A1628; font-family: 'DM Sans', sans-serif; padding-bottom: 3rem; }
        .pr-header { padding: calc(env(safe-area-inset-top, 0px) + 1rem) 1.5rem 1rem; display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .pr-back { background: none; border: none; color: rgba(255,255,255,0.4); cursor: pointer; font-size: 1.4rem; line-height: 1; padding: 0; }
        .pr-back:hover { color: #fff; }
        .pr-title { font-family: 'Sora', sans-serif; font-size: 1.1rem; font-weight: 800; color: #fff; letter-spacing: -0.02em; }
        .pr-save { margin-left: auto; background: #E8B84B; color: #0A1628; border: none; border-radius: 10px; padding: 0.55rem 1.1rem; font-size: 0.85rem; font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: opacity 0.15s; }
        .pr-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .pr-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; }
        .pr-section { display: flex; flex-direction: column; gap: 0.5rem; }
        .pr-label { font-size: 0.75rem; font-weight: 600; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.06em; }
        .pr-input { width: 100%; background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 0.95rem 1rem; font-size: 0.95rem; color: #fff; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; }
        .pr-input:focus { border-color: rgba(232,184,75,0.4); }
        .pr-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .pr-school-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
        .pr-school-btn { background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 14px; padding: 1rem 0.75rem; cursor: pointer; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; transition: all 0.15s; }
        .pr-school-btn.selected { border-color: rgba(232,184,75,0.5); background: rgba(232,184,75,0.08); }
        .pr-school-name { font-size: 0.78rem; font-weight: 700; color: #fff; font-family: 'Sora', sans-serif; }
        .pr-search { width: 100%; background: #111E2E; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 0.85rem 1rem; font-size: 0.88rem; color: #fff; font-family: 'DM Sans', sans-serif; outline: none; margin-bottom: 0.5rem; }
        .pr-search::placeholder { color: rgba(255,255,255,0.2); }
        .pr-search:focus { border-color: rgba(232,184,75,0.4); }
        .pr-major-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 260px; overflow-y: auto; scrollbar-width: none; }
        .pr-major-list::-webkit-scrollbar { display: none; }
        .pr-major-btn { background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 0.75rem 1rem; cursor: pointer; text-align: left; font-size: 0.88rem; font-weight: 500; color: rgba(255,255,255,0.7); font-family: 'DM Sans', sans-serif; transition: all 0.15s; }
        .pr-major-btn.selected { background: rgba(232,184,75,0.1); border-color: rgba(232,184,75,0.4); color: #fff; }
        .pr-year-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .pr-year-btn { background: #111E2E; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 0.9rem 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s; }
        .pr-year-btn.selected { background: rgba(232,184,75,0.1); border-color: rgba(232,184,75,0.4); }
        .pr-year-label { font-size: 0.88rem; font-weight: 600; color: #fff; }
        .pr-year-check { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; }
        .pr-year-btn.selected .pr-year-check { background: #E8B84B; border-color: #E8B84B; }
        .pr-gpa-display { text-align: center; margin: 0.5rem 0 1rem; }
        .pr-gpa-number { font-family: 'Sora', sans-serif; font-size: 3rem; font-weight: 800; color: #E8B84B; letter-spacing: -0.03em; line-height: 1; }
        .pr-gpa-sub { font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-top: 0.25rem; }
        .pr-divider { height: 1px; background: rgba(255,255,255,0.06); }
      `}</style>

      <div className="pr-bg">
        <div className="pr-header">
          <button className="pr-back" onClick={() => { window.location.href = '/dashboard'; }}>?</button>
          <div className="pr-title">Edit Profile</div>
          <button className="pr-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        <div className="pr-body">
          <div className="pr-section">
            <div className="pr-label">Name</div>
            <div className="pr-row">
              <input className="pr-input" type="text" placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              <input className="pr-input" type="text" placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="pr-divider" />
          <div className="pr-section">
            <div className="pr-label">School</div>
            <div className="pr-school-grid">
              {SCHOOLS.map(s => (
                <button key={s.value} className={`pr-school-btn${form.school === s.value ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, school: s.value }))}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s.initials.length > 2 ? '0.65rem' : '0.85rem', fontWeight: 800, color: '#fff', fontFamily: "'Sora', sans-serif", border: form.school === s.value ? '2px solid #E8B84B' : '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>{s.initials}</div>
                  <div className="pr-school-name">{s.short}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="pr-divider" />
          <div className="pr-section">
            <div className="pr-label">Major</div>
            <input className="pr-search" type="text" placeholder="Search majors..." value={majorSearch} onChange={e => setMajorSearch(e.target.value)} />
            <div className="pr-major-list">
              {filteredMajors.map(m => (
                <button key={m} className={`pr-major-btn${form.major === m ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, major: m }))}>{m}</button>
              ))}
            </div>
          </div>
          <div className="pr-divider" />
          <div className="pr-section">
            <div className="pr-label">Graduation Year</div>
            <div className="pr-year-list">
              {YEARS.map(y => (
                <button key={y.value} className={`pr-year-btn${form.graduation_year === y.value ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, graduation_year: y.value }))}>
                  <span className="pr-year-label">{y.label}</span>
                  <div className="pr-year-check">
                    {form.graduation_year === y.value && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="3"><path d="M5 13l4 4L19 7"/></svg>}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="pr-divider" />
          <div className="pr-section">
            <div className="pr-label">GPA</div>
            <div className="pr-gpa-display">
              <div className="pr-gpa-number">{parseFloat(form.gpa).toFixed(1)}</div>
              <div className="pr-gpa-sub">out of 4.0</div>
            </div>
            <div style={{ padding: '0 0.5rem' }}>
              <input type="range" min="0" max="40" step="1" value={Math.round(parseFloat(form.gpa) * 10)} onChange={e => setForm(f => ({ ...f, gpa: (parseInt(e.target.value) / 10).toFixed(1) }))} style={{ width: '100%', accentColor: '#E8B84B', height: '4px', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                {['0.0','1.0','2.0','3.0','4.0'].map(v => <span key={v} style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' }}>{v}</span>)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


