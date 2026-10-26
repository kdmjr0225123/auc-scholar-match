import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import '@/styles/elevaid.css';
import { ArrowLeft, Check, Star, User, Upload, FileText, X, Loader2 } from 'lucide-react';
import { SCHOOL_THEME, getSchoolTheme } from '@/lib/schoolTheme';
import { US_STATES, GREEK_ORGS, toTri, fromTri, type TriState } from '@/constants/profileOptions';

const RESUME_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const RESUME_ACCEPT_EXT = ['pdf', 'doc', 'docx'];

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

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [majorSearch, setMajorSearch] = useState('');
  const [form, setForm] = useState({
    first_name: '', last_name: '', school: '', major: '', graduation_year: '', gpa: '3.0',
  });
  // Optional details that sharpen matching. Blank = not answered (never a "no").
  const [about, setAbout] = useState<{ first_gen: TriState; pell_eligible: TriState; home_state: string; greek_org: string }>({
    first_gen: '', pell_eligible: '', home_state: '', greek_org: '',
  });
  const [emailsOn, setEmailsOn] = useState(true);
  const [resumePath, setResumePath] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const resumeInputRef = useRef<HTMLInputElement>(null);

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
        setResumePath(data.resume_url || null);
        setAbout({
          first_gen: toTri(data.first_gen),
          pell_eligible: toTri(data.pell_eligible),
          home_state: data.home_state || '',
          greek_org: data.greek_org || '',
        });
        setEmailsOn(!data.email_opt_out);
      }
      if (error) console.error('Error fetching profile:', error);
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  // Deep link from the dashboard ("Confirm N more matches") lands on the
  // optional questions.
  useEffect(() => {
    if (loading || window.location.hash !== '#about') return;
    document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading]);

  // Resume-on-file: stored at a stable path per user (`{user_id}/resume.<ext>`)
  // so re-uploading naturally replaces the old file via `upsert`, and the
  // student never has to re-attach a resume for each individual application.
  // This is also the groundwork for the upcoming resume-review tool, which
  // will read from this same stored file.
  const handleResumeSelect = async (file: File | undefined | null) => {
    if (!file || !user) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!RESUME_ACCEPT_EXT.includes(ext)) {
      toast({ variant: 'destructive', title: 'Unsupported file type', description: 'Please upload a PDF, DOC, or DOCX file.' });
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Resumes must be under 8MB.' });
      return;
    }

    setResumeBusy(true);
    try {
      const newPath = `${user.id}/resume.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(newPath, file, { upsert: true, contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      // Best-effort cleanup if the previous resume had a different extension
      // (upsert only overwrites when the path matches exactly).
      if (resumePath && resumePath !== newPath) {
        await supabase.storage.from('resumes').remove([resumePath]);
      }

      const { error: updateError } = await supabase
        .from('student_profiles')
        .update({ resume_url: newPath })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      setResumePath(newPath);
      toast({ title: 'Resume saved', description: 'It’s now on file for every application.' });
    } catch (err: any) {
      console.error('Resume upload error:', err);
      toast({ variant: 'destructive', title: 'Error uploading resume', description: 'Please try again.' });
    } finally {
      setResumeBusy(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  const handleResumeView = async () => {
    if (!resumePath) return;
    const { data, error } = await supabase.storage.from('resumes').createSignedUrl(resumePath, 3600);
    if (error || !data?.signedUrl) {
      toast({ variant: 'destructive', title: 'Error opening resume', description: 'Please try again.' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const handleResumeRemove = async () => {
    if (!user || !resumePath) return;
    setResumeBusy(true);
    try {
      await supabase.storage.from('resumes').remove([resumePath]);
      const { error } = await supabase
        .from('student_profiles')
        .update({ resume_url: null })
        .eq('user_id', user.id);
      if (error) throw error;
      setResumePath(null);
      toast({ title: 'Resume removed' });
    } catch (err: any) {
      console.error('Resume remove error:', err);
      toast({ variant: 'destructive', title: 'Error removing resume', description: 'Please try again.' });
    } finally {
      setResumeBusy(false);
    }
  };

  const resumeExt = resumePath ? (resumePath.split('.').pop() || '').toUpperCase() : null;

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
          first_gen: fromTri(about.first_gen),
          pell_eligible: fromTri(about.pell_eligible),
          home_state: about.home_state || null,
          greek_org: about.greek_org || null,
          email_opt_out: !emailsOn,
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

  // Derived straight from this student's own selected school — never cached,
  // never shared across sessions. Falls back to the neutral gold/navy theme
  // until a school is actually chosen.
  const theme = getSchoolTheme(form.school as any);

  if (loading) {
    return (
      <div className="ev-reset ev-shell-dark" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="ev-spinner" style={{ borderTopColor: 'var(--ev-gold)' }} />
      </div>
    );
  }

  return (
    <>
      <style>{`
        .pr-bg { padding-bottom: 3rem; }
        .pr-header { padding: calc(env(safe-area-inset-top, 0px) + 1rem) 1.5rem 1rem; display: flex; align-items: center; gap: 1rem; border-bottom: 2px solid var(--ev-border); transition: background 0.25s ease, border-color 0.25s ease; }
        .pr-school-tag { font-size: 0.68rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--ev-radius-full); margin-left: 0.25rem; }
        .pr-back { background: none; border: none; color: var(--ev-text-faint); cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0; }
        .pr-back:hover { color: #fff; }
        .pr-title { font-family: var(--ev-font-display); font-size: 1.05rem; font-weight: 700; color: #fff; letter-spacing: -0.02em; }
        .pr-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem; max-width: 560px; margin: 0 auto; }
        .pr-section { display: flex; flex-direction: column; gap: 0.5rem; }
        .pr-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
        .pr-school-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
        .pr-school-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-lg); padding: 1rem 0.75rem; cursor: pointer; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; transition: all 0.15s; background: var(--ev-surface); }
        .pr-school-btn.selected { border-color: var(--ev-gold-border); background: var(--ev-gold-soft); }
        .pr-school-name { font-size: 0.78rem; font-weight: 700; color: #fff; font-family: var(--ev-font-display); }
        .pr-major-list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 260px; overflow-y: auto; scrollbar-width: none; margin-top: 0.5rem; }
        .pr-major-list::-webkit-scrollbar { display: none; }
        .pr-major-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-sm); padding: 0.75rem 1rem; cursor: pointer; text-align: left; font-size: 0.88rem; font-weight: 500; color: var(--ev-text-muted); background: var(--ev-surface); transition: all 0.15s; }
        .pr-major-btn.selected { background: var(--ev-gold-soft); border-color: var(--ev-gold-border); color: #fff; }
        .pr-year-list { display: flex; flex-direction: column; gap: 0.5rem; }
        .pr-year-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-md); padding: 0.9rem 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: space-between; transition: all 0.15s; background: var(--ev-surface); }
        .pr-year-btn.selected { background: var(--ev-gold-soft); border-color: var(--ev-gold-border); }
        .pr-year-label { font-size: 0.88rem; font-weight: 600; color: #fff; }
        .pr-year-check { width: 18px; height: 18px; border-radius: 50%; background: var(--ev-surface-2); border: 1.5px solid var(--ev-border); display: flex; align-items: center; justify-content: center; }
        .pr-year-btn.selected .pr-year-check { background: var(--ev-gold); border-color: var(--ev-gold); }
        .pr-gpa-display { text-align: center; margin: 0.5rem 0 1rem; }
        .pr-gpa-number { font-family: var(--ev-font-display); font-size: 2.75rem; font-weight: 700; color: var(--ev-gold); letter-spacing: -0.03em; line-height: 1; }
        .pr-gpa-sub { font-size: 0.75rem; color: var(--ev-text-faint); margin-top: 0.25rem; }

        .pr-resume-hint { font-size: 0.78rem; color: var(--ev-text-faint); line-height: 1.5; }
        .pr-resume-drop {
          border: 1.5px dashed var(--ev-border-strong); border-radius: var(--ev-radius-lg);
          padding: 1.5rem 1rem; text-align: center; cursor: pointer; background: var(--ev-surface);
          display: flex; flex-direction: column; align-items: center; gap: 0.5rem; transition: all 0.15s;
        }
        .pr-resume-drop:hover { border-color: var(--ev-gold-border); background: var(--ev-gold-soft); }
        .pr-resume-drop-label { font-size: 0.85rem; font-weight: 600; color: #fff; }
        .pr-resume-drop-sub { font-size: 0.72rem; color: var(--ev-text-faint); }
        .pr-resume-file {
          display: flex; align-items: center; gap: 0.75rem; border: 1px solid var(--ev-border);
          background: var(--ev-surface); border-radius: var(--ev-radius-lg); padding: 0.9rem 1rem;
        }
        .pr-resume-icon {
          width: 38px; height: 38px; border-radius: var(--ev-radius-md); background: var(--ev-gold-soft);
          color: var(--ev-gold); display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .pr-resume-name { font-size: 0.85rem; font-weight: 700; color: #fff; }
        .pr-resume-status { font-size: 0.72rem; color: var(--ev-success); }
        .pr-resume-actions { display: flex; gap: 0.5rem; margin-left: auto; flex-shrink: 0; }
        .pr-resume-action {
          background: none; border: 1px solid var(--ev-border); border-radius: var(--ev-radius-sm);
          padding: 0.4rem 0.6rem; cursor: pointer; color: var(--ev-text-muted); display: inline-flex;
          align-items: center; gap: 0.3rem; font-size: 0.72rem; font-weight: 600; transition: all 0.15s;
        }
        .pr-resume-action:hover { color: #fff; border-color: var(--ev-border-strong); }
        .pr-resume-action.danger:hover { color: var(--ev-danger); border-color: var(--ev-danger); }

        .pr-hint { font-size: 0.78rem; color: var(--ev-text-muted); line-height: 1.5; }
        .pr-q { display: flex; flex-direction: column; gap: 0.45rem; }
        .pr-q-label { font-size: 0.85rem; font-weight: 600; color: #fff; }
        .pr-seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
        .pr-seg-btn { border: 1px solid var(--ev-border); border-radius: var(--ev-radius-sm); padding: 0.6rem 0.5rem; cursor: pointer; font-size: 0.8rem; font-weight: 600; color: var(--ev-text-muted); background: var(--ev-surface); transition: all 0.15s; }
        .pr-seg-btn.selected { background: var(--ev-gold-soft); border-color: var(--ev-gold-border); color: #fff; }
        .pr-select { appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, rgba(255,255,255,0.6) 50%), linear-gradient(135deg, rgba(255,255,255,0.6) 50%, transparent 50%); background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%; background-size: 5px 5px; background-repeat: no-repeat; padding-right: 2rem; }
        .pr-select option { color: #0A1628; }
        .pr-toggle { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid var(--ev-border); border-radius: var(--ev-radius-md); padding: 0.9rem 1rem; background: var(--ev-surface); cursor: pointer; }
        .pr-toggle-text { font-size: 0.85rem; font-weight: 600; color: #fff; }
        .pr-toggle-sub { font-size: 0.72rem; color: var(--ev-text-muted); margin-top: 0.15rem; line-height: 1.45; }
        .pr-switch { position: relative; width: 42px; height: 24px; flex-shrink: 0; border-radius: 999px; background: var(--ev-surface-2); border: 1px solid var(--ev-border-strong); transition: background 0.15s; }
        .pr-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.15s; }
        .pr-switch.on { background: var(--ev-gold); border-color: var(--ev-gold); }
        .pr-switch.on::after { transform: translateX(18px); }
        .pr-legal { display: flex; justify-content: center; gap: 1rem; font-size: 0.72rem; padding: 0.5rem 0 1rem; }
        .pr-legal a { color: var(--ev-text-muted); text-decoration: none; }
        .pr-legal a:hover { color: #fff; }

        .pr-tabbar { display: none; }
        @media (max-width: 680px) {
          .pr-bg { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); }
          .pr-tabbar {
            display: flex;
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
            background: var(--ev-surface);
            border-top: 1px solid var(--ev-border);
            padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
            justify-content: space-around;
          }
          .pr-tab {
            display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
            font-size: 0.65rem; font-weight: 600; color: var(--ev-text-faint);
            padding: 0.3rem 1.1rem; border-radius: var(--ev-radius-md);
            text-decoration: none; background: none; border: none; cursor: pointer;
          }
          .pr-tab.active { color: #fff; }
        }
      `}</style>

      <div className="ev-reset ev-shell-dark pr-bg">
        <div
          className="pr-header"
          style={{
            background: theme ? theme.gradient : undefined,
            borderBottomColor: theme ? theme.light : 'var(--ev-border)',
          }}
        >
          <button className="pr-back" onClick={() => { window.location.href = '/dashboard'; }}>
            <ArrowLeft size={15} /> Back
          </button>
          <div className="pr-title">
            Edit Profile
            {theme && (
              <span className="pr-school-tag" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}>
                {theme.short}
              </span>
            )}
          </div>
          <button className="ev-btn ev-btn-primary" style={{ marginLeft: 'auto', padding: '0.55rem 1.1rem', fontSize: '0.85rem' }} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="pr-body">
          <div className="pr-section">
            <div className="ev-label">Name</div>
            <div className="pr-row">
              <div className="ev-field">
                <label className="sr-only" htmlFor="p-first">First name</label>
                <input id="p-first" className="ev-input" type="text" placeholder="First name" value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="ev-field">
                <label className="sr-only" htmlFor="p-last">Last name</label>
                <input id="p-last" className="ev-input" type="text" placeholder="Last name" value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section">
            <div className="ev-label">School</div>
            <div className="pr-school-grid">
              {SCHOOLS.map(s => (
                <button key={s.school} className={`pr-school-btn${form.school === s.school ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, school: s.school }))}>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: s.hex, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: s.initials.length > 2 ? '0.65rem' : '0.85rem', fontWeight: 700, color: s.onFill, fontFamily: 'var(--ev-font-display)', border: form.school === s.school ? '2px solid var(--ev-gold)' : '2px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>{s.initials}</div>
                  <div className="pr-school-name">{s.short}</div>
                </button>
              ))}
            </div>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section">
            <div className="ev-label">Major</div>
            <label className="sr-only" htmlFor="p-major-search">Search majors</label>
            <input id="p-major-search" className="ev-input" type="text" placeholder="Search majors…" value={majorSearch} onChange={e => setMajorSearch(e.target.value)} />
            <div className="pr-major-list">
              {filteredMajors.map(m => (
                <button key={m} className={`pr-major-btn${form.major === m ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, major: m }))}>{m}</button>
              ))}
            </div>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section">
            <div className="ev-label">Graduation Year</div>
            <div className="pr-year-list">
              {YEARS.map(y => (
                <button key={y.value} className={`pr-year-btn${form.graduation_year === y.value ? ' selected' : ''}`} onClick={() => setForm(f => ({ ...f, graduation_year: y.value }))}>
                  <span className="pr-year-label">{y.label}</span>
                  <div className="pr-year-check">
                    {form.graduation_year === y.value && <Check size={11} color="var(--ev-navy-deep)" strokeWidth={3} />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section">
            <div className="ev-label">GPA</div>
            <div className="pr-gpa-display">
              <div className="pr-gpa-number">{parseFloat(form.gpa).toFixed(1)}</div>
              <div className="pr-gpa-sub">out of 4.0</div>
            </div>
            <label className="sr-only" htmlFor="p-gpa">GPA</label>
            <div style={{ padding: '0 0.5rem' }}>
              <input id="p-gpa" type="range" min="0" max="40" step="1" value={Math.round(parseFloat(form.gpa) * 10)} onChange={e => setForm(f => ({ ...f, gpa: (parseInt(e.target.value) / 10).toFixed(1) }))} style={{ width: '100%', accentColor: 'var(--ev-gold)', height: '4px', cursor: 'pointer' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                {['0.0', '1.0', '2.0', '3.0', '4.0'].map(v => <span key={v} style={{ fontSize: '0.7rem', color: 'var(--ev-text-faint)' }}>{v}</span>)}
              </div>
            </div>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section" id="about" style={{ scrollMarginTop: '1rem' }}>
            <div className="ev-label">About you (optional)</div>
            <div className="pr-hint">
              Some scholarships are only for first-generation students, Pell Grant recipients, Georgia residents or members of a specific organization. Answering lets us confirm those matches. Skip anything you'd rather not share.
            </div>
            <div className="pr-q">
              <div className="pr-q-label" id="q-first-gen">Are you the first in your family to go to college?</div>
              <div className="pr-seg" role="radiogroup" aria-labelledby="q-first-gen">
                {([['yes', 'Yes'], ['no', 'No'], ['', 'Skip']] as [TriState, string][]).map(([v, label]) => (
                  <button key={label} type="button" role="radio" aria-checked={about.first_gen === v} className={`pr-seg-btn${about.first_gen === v ? ' selected' : ''}`} onClick={() => setAbout(a => ({ ...a, first_gen: v }))}>{label}</button>
                ))}
              </div>
            </div>
            <div className="pr-q">
              <div className="pr-q-label" id="q-pell">Do you receive a Pell Grant?</div>
              <div className="pr-seg" role="radiogroup" aria-labelledby="q-pell">
                {([['yes', 'Yes'], ['no', 'No'], ['', 'Not sure']] as [TriState, string][]).map(([v, label]) => (
                  <button key={label} type="button" role="radio" aria-checked={about.pell_eligible === v} className={`pr-seg-btn${about.pell_eligible === v ? ' selected' : ''}`} onClick={() => setAbout(a => ({ ...a, pell_eligible: v }))}>{label}</button>
                ))}
              </div>
            </div>
            <div className="pr-q">
              <label className="pr-q-label" htmlFor="p-state">Home state</label>
              <select id="p-state" className="ev-input pr-select" value={about.home_state} onChange={e => setAbout(a => ({ ...a, home_state: e.target.value }))}>
                <option value="">Prefer not to say</option>
                {US_STATES.map(st => <option key={st.code} value={st.code}>{st.name}</option>)}
              </select>
            </div>
            <div className="pr-q">
              <label className="pr-q-label" htmlFor="p-greek">Fraternity or sorority</label>
              <select id="p-greek" className="ev-input pr-select" value={about.greek_org} onChange={e => setAbout(a => ({ ...a, greek_org: e.target.value }))}>
                <option value="">Prefer not to say</option>
                <option value="none">Not a member</option>
                {GREEK_ORGS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section">
            <div className="ev-label">Emails</div>
            <button type="button" className="pr-toggle" role="switch" aria-checked={emailsOn} onClick={() => setEmailsOn(v => !v)}>
              <div style={{ textAlign: 'left' }}>
                <div className="pr-toggle-text">Scholarship emails</div>
                <div className="pr-toggle-sub">New matches (at most one email a day) and reminders before your deadlines.</div>
              </div>
              <span className={`pr-switch${emailsOn ? ' on' : ''}`} aria-hidden="true" />
            </button>
          </div>

          <hr className="ev-divider-dark" />

          <div className="pr-section">
            <div className="ev-label">Resume</div>
            <div className="pr-resume-hint">
              Keep one resume on file so you don't have to attach it every time you apply. We'll also use this for the upcoming resume review tool.
            </div>
            <input
              ref={resumeInputRef}
              id="p-resume"
              type="file"
              accept=".pdf,.doc,.docx"
              className="sr-only"
              onChange={e => handleResumeSelect(e.target.files?.[0])}
            />
            {resumePath ? (
              <div className="pr-resume-file">
                <div className="pr-resume-icon"><FileText size={18} /></div>
                <div>
                  <div className="pr-resume-name">Resume{resumeExt ? `.${resumeExt.toLowerCase()}` : ''}</div>
                  <div className="pr-resume-status">On file</div>
                </div>
                <div className="pr-resume-actions">
                  <button type="button" className="pr-resume-action" onClick={handleResumeView} disabled={resumeBusy}>View</button>
                  <button type="button" className="pr-resume-action" onClick={() => resumeInputRef.current?.click()} disabled={resumeBusy}>
                    {resumeBusy ? <Loader2 size={12} className="animate-spin" /> : 'Replace'}
                  </button>
                  <button type="button" className="pr-resume-action danger" onClick={handleResumeRemove} disabled={resumeBusy}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ) : (
              <label htmlFor="p-resume" className="pr-resume-drop">
                {resumeBusy ? <Loader2 size={20} className="animate-spin" style={{ color: 'var(--ev-gold)' }} /> : <Upload size={20} style={{ color: 'var(--ev-gold)' }} />}
                <div className="pr-resume-drop-label">{resumeBusy ? 'Uploading…' : 'Upload your resume'}</div>
                <div className="pr-resume-drop-sub">PDF, DOC, or DOCX — up to 8MB</div>
              </label>
            )}
          </div>

          <div className="pr-legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <a href="mailto:support@elevaid.pro">support@elevaid.pro</a>
          </div>
        </div>

        <nav className="pr-tabbar" aria-label="Primary">
          <Link className="pr-tab" to="/dashboard">
            <Star size={19} strokeWidth={2.25} />
            Matches
          </Link>
          <Link className="pr-tab active" to="/profile" style={{ color: theme ? theme.light : '#fff' }}>
            <User size={19} strokeWidth={2.25} />
            Profile
          </Link>
        </nav>
      </div>
    </>
  );
}
