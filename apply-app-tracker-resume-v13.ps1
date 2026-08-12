# Elevaid v13 — Application tracker (Applied state) + resume-on-file
# Generated with a UTF-8 BOM on THIS script file itself (utf-8-sig) so
# Windows PowerShell 5.1 parses non-ASCII literals correctly instead of
# using the legacy system codepage. Do not resave this file without BOM.

cd "C:\Users\kdmjr\OneDrive\Desktop\auc-scholar-match"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Write-Host "Writing src\types\database.ts..."
$content_0 = @'
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AppRole = 'admin' | 'user';

export type School = 'morehouse' | 'spelman' | 'clark_atlanta' | 'morris_brown';

export interface StudentProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  school: School;
  gpa: number;
  major: string;
  graduation_year: number;
  resume_url: string | null;
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus = 'saved' | 'applied' | 'completed';

export interface StudentApplication {
  id: string;
  user_id: string;
  scholarship_id: string;
  status: ApplicationStatus;
  applied_at: string;
  created_at: string;
  updated_at: string;
}

export type PipelineStatus = 'pending' | 'approved' | 'quarantined';
export type LinkStatus = 'unchecked' | 'ok' | 'broken' | 'redirected' | 'captcha' | 'timeout' | 'aggregator';

export interface Scholarship {
  id: string;
  name: string;
  description: string;
  provider: string;
  award_amount: number;
  deadline: string;
  application_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pipeline_status: PipelineStatus | null;
  link_status: LinkStatus | null;
  link_checked_at: string | null;
  quarantine_reason: string | null;
}

export interface EligibilityRule {
  id: string;
  scholarship_id: string;
  min_gpa: number | null;
  max_gpa: number | null;
  eligible_schools: School[];
  eligible_majors: string[];
  graduation_year_min: number | null;
  graduation_year_max: number | null;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface Database {
  public: {
    Tables: {
      student_profiles: {
        Row: StudentProfile;
        Insert: Omit<StudentProfile, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string; };
        Update: Partial<StudentProfile>;
      };
      scholarships: {
        Row: Scholarship;
        Insert: Omit<Scholarship, 'id' | 'created_at' | 'updated_at' | 'is_active'> & { id?: string; created_at?: string; updated_at?: string; is_active?: boolean; };
        Update: Partial<Scholarship>;
      };
      eligibility_rules: {
        Row: EligibilityRule;
        Insert: Omit<EligibilityRule, 'id' | 'created_at' | 'updated_at'> & { id?: string; created_at?: string; updated_at?: string; };
        Update: Partial<EligibilityRule>;
      };
      user_roles: {
        Row: UserRole;
        Insert: Omit<UserRole, 'id'> & { id?: string; };
        Update: Partial<UserRole>;
      };
      student_applications: {
        Row: StudentApplication;
        Insert: Omit<StudentApplication, 'id' | 'applied_at' | 'created_at' | 'updated_at'> & { id?: string; applied_at?: string; created_at?: string; updated_at?: string; };
        Update: Partial<StudentApplication>;
      };
    };
    Enums: {
      app_role: AppRole;
      school: School;
    };
  };
}

'@
[System.IO.File]::WriteAllText("src\types\database.ts", $content_0, $utf8NoBom)

Write-Host "Writing src\pages\Profile.tsx..."
$content_1 = @'
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';
import '@/styles/elevaid.css';
import { ArrowLeft, Check, Star, User, Upload, FileText, X, Loader2 } from 'lucide-react';
import { SCHOOL_THEME, getSchoolTheme } from '@/lib/schoolTheme';

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
      }
      if (error) console.error('Error fetching profile:', error);
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

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

'@
[System.IO.File]::WriteAllText("src\pages\Profile.tsx", $content_1, $utf8NoBom)

Write-Host "Writing src\pages\Dashboard.tsx..."
$content_2 = @'
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { StudentProfile, Scholarship, EligibilityRule, School } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { GraduationCap, Settings, Calendar, ExternalLink, ChevronDown, ChevronUp, Star, User, Check, Undo2, Loader2, CheckCircle2 } from 'lucide-react';
import { getSchoolTheme } from '@/lib/schoolTheme';

interface MatchedScholarship extends Scholarship {
  matchPercentage: number;
  matchReasons: string[];
  eligibilityRules: EligibilityRule;
}

interface AppliedScholarship {
  applicationId: string;
  appliedAt: string;
  scholarship: Scholarship;
}

function useCounter(target: number, duration: number, trigger: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!trigger || target === 0) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start = Math.min(start + step, target);
      setValue(Math.floor(start));
      if (start >= target) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [trigger, target, duration]);
  return value;
}

const formatSchool = (school: School): string => ({
  morehouse: 'Morehouse',
  spelman: 'Spelman',
  clark_atlanta: 'Clark Atlanta',
  morris_brown: 'Morris Brown',
}[school] || school);

export default function Dashboard() {
  const { user, signOut, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [matched, setMatched] = useState<MatchedScholarship[]>([]);
  const [applied, setApplied] = useState<AppliedScholarship[]>([]);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [view, setView] = useState<'matches' | 'applied'>('matches');
  const [revealed, setRevealed] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Applied scholarships are tracked but shouldn't clutter the "still deciding"
  // list — they live in their own Applied section instead.
  const openMatches = matched.filter(m => !appliedIds.has(m.id));
  const totalAvailable = openMatches.reduce((s, m) => s + (m.award_amount || 0), 0);
  const strongMatches = openMatches.filter(m => m.matchPercentage >= 80).length;
  const animatedTotal = useCounter(totalAvailable, 1600, revealed);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('dashboard-scholarship-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_rules' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!loading && matched.length > 0) {
      const t = setTimeout(() => setRevealed(true), 250);
      return () => clearTimeout(t);
    }
  }, [loading, matched.length]);

  const loadData = async () => {
    const timeout = setTimeout(() => setLoading(false), 5000);
    if (!user) return;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('student_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profileData) { setLoading(false); return; }
      setProfile(profileData as StudentProfile);

      const { data: scholarshipsData, error: scholarshipsError } = await supabase
        .from('scholarships').select('*, eligibility_rules (*)').eq('is_active', true);
      if (scholarshipsError) throw scholarshipsError;

      setMatched(calculateMatches(profileData as StudentProfile, scholarshipsData || []));

      const { data: appsData, error: appsError } = await supabase
        .from('student_applications')
        .select('id, applied_at, scholarships (*)')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false });
      if (appsError) throw appsError;

      const appliedList: AppliedScholarship[] = (appsData || [])
        .filter((a: any) => a.scholarships)
        .map((a: any) => ({ applicationId: a.id, appliedAt: a.applied_at, scholarship: a.scholarships as Scholarship }));
      setApplied(appliedList);
      setAppliedIds(new Set(appliedList.map(a => a.scholarship.id)));
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error loading data', description: err.message });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  const calculateMatches = (profile: StudentProfile, scholarships: any[]): MatchedScholarship[] => {
    return scholarships.map(scholarship => {
      const rules = scholarship.eligibility_rules;
      if (!rules) return null;
      const matchReasons: string[] = [];
      const failReasons: string[] = [];
      let totalCriteria = 0;
      let metCriteria = 0;

      totalCriteria++;
      const schoolMatch = !rules.eligible_schools || rules.eligible_schools.length === 0 || rules.eligible_schools.includes(profile.school);
      if (!schoolMatch) return null;
      metCriteria++;
      matchReasons.push(`School: ${formatSchool(profile.school)} is eligible`);

      totalCriteria++;
      const yearInRange =
        (!rules.graduation_year_min || profile.graduation_year >= rules.graduation_year_min) &&
        (!rules.graduation_year_max || profile.graduation_year <= rules.graduation_year_max);
      if (!yearInRange) return null;
      metCriteria++;
      if (rules.graduation_year_min && rules.graduation_year_max) {
        matchReasons.push(`Graduation Year: ${profile.graduation_year} is within ${rules.graduation_year_min}–${rules.graduation_year_max}`);
      } else {
        matchReasons.push(`Graduation Year: ${profile.graduation_year} (no restriction)`);
      }

      if (rules.min_gpa || rules.max_gpa) {
        totalCriteria++;
        const gpaMatch = (!rules.min_gpa || profile.gpa >= rules.min_gpa) && (!rules.max_gpa || profile.gpa <= rules.max_gpa);
        if (gpaMatch) {
          metCriteria++;
          if (rules.min_gpa) matchReasons.push(`GPA: ${profile.gpa.toFixed(1)} ≥ ${rules.min_gpa.toFixed(1)} minimum`);
        } else {
          if (rules.min_gpa && profile.gpa < rules.min_gpa) failReasons.push(`GPA: ${profile.gpa.toFixed(1)} below ${rules.min_gpa.toFixed(1)} minimum`);
        }
      }

      if (rules.eligible_majors?.length > 0) {
        totalCriteria++;
        const majorMatch = rules.eligible_majors.includes(profile.major);
        if (majorMatch) { metCriteria++; matchReasons.push(`Major: ${profile.major} is eligible`); }
        else failReasons.push(`Major: ${profile.major} not in eligible list`);
      }

      return {
        ...scholarship,
        matchPercentage: Math.round((metCriteria / totalCriteria) * 100),
        matchReasons: [...matchReasons.map(r => `pass:${r}`), ...failReasons.map(r => `fail:${r}`)],
        eligibilityRules: rules,
      } as MatchedScholarship;
    })
    .filter((s): s is MatchedScholarship => s !== null)
    .sort((a, b) => b.matchPercentage - a.matchPercentage);
  };

  const handleMarkApplied = async (scholarship: MatchedScholarship) => {
    if (!user) return;
    setMarkingId(scholarship.id);
    try {
      const { data, error } = await supabase
        .from('student_applications')
        .upsert(
          { user_id: user.id, scholarship_id: scholarship.id, status: 'applied' },
          { onConflict: 'user_id,scholarship_id' }
        )
        .select('id, applied_at')
        .single();
      if (error) throw error;

      setAppliedIds(prev => new Set(prev).add(scholarship.id));
      setApplied(prev => [{ applicationId: data.id, appliedAt: data.applied_at, scholarship }, ...prev]);
      toast({ title: 'Marked as applied', description: `${scholarship.name} moved to your Applied section.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating application', description: err.message });
    } finally {
      setMarkingId(null);
    }
  };

  const handleUnmarkApplied = async (scholarshipId: string) => {
    if (!user) return;
    setMarkingId(scholarshipId);
    try {
      const { error } = await supabase
        .from('student_applications')
        .delete()
        .eq('user_id', user.id)
        .eq('scholarship_id', scholarshipId);
      if (error) throw error;

      setAppliedIds(prev => { const next = new Set(prev); next.delete(scholarshipId); return next; });
      setApplied(prev => prev.filter(a => a.scholarship.id !== scholarshipId));
      toast({ title: 'Moved back to your matches' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error updating application', description: err.message });
    } finally {
      setMarkingId(null);
    }
  };

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  // Derived straight from this student's own loaded profile — null until
  // `profile` is actually fetched for the signed-in user, so there's no
  // window where a previous session's color could show through.
  const theme = getSchoolTheme(profile?.school);

  if (loading) {
    return (
      <div className="ev-reset ev-shell-light" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="ev-spinner" />
        <div style={{ fontSize: '0.88rem', color: 'var(--ev-ink-faint)' }}>Finding your matches…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .dash-nav { padding: 0 1.5rem; padding-top: env(safe-area-inset-top, 0px); height: auto; min-height: 62px; border-bottom-width: 2px; transition: border-color 0.25s ease; }
        .dash-nav-r { display: flex; align-items: center; gap: 0.4rem; }
        .dash-av { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, var(--ev-gold), var(--ev-gold-600)); display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; color: var(--ev-navy-deep); flex-shrink: 0; }

        .dash-body { padding: 1.75rem 1.5rem calc(3rem + env(safe-area-inset-bottom, 0px)); max-width: 1160px; margin: 0 auto; }

        .reveal-banner {
          background: linear-gradient(150deg, #0F1D31 0%, #14233A 60%, #0A1628 100%);
          border-radius: var(--ev-radius-lg); padding: 2rem 2.25rem; margin-bottom: 1.5rem;
          position: relative; overflow: hidden;
          opacity: 0; transform: translateY(10px);
          animation: ev-fade-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards;
          border-left: 4px solid transparent;
        }
        .reveal-glow { position: absolute; top: -40px; right: -40px; width: 260px; height: 200px; background: radial-gradient(ellipse, rgba(232,184,75,0.09) 0%, transparent 65%); pointer-events: none; }
        .reveal-school-tag { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.65rem; font-weight: 700; padding: 0.2rem 0.6rem; border-radius: var(--ev-radius-full); margin-bottom: 0.75rem; }
        .reveal-label { font-size: 0.65rem; color: var(--ev-text-faint); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.5rem; }
        .reveal-amount { font-family: var(--ev-font-display); font-size: clamp(2.25rem, 5vw, 3.25rem); font-weight: 700; color: var(--ev-gold); letter-spacing: -0.03em; line-height: 1; margin-bottom: 0.4rem; }
        .reveal-sub { font-size: 0.82rem; color: var(--ev-text-muted); margin-bottom: 1.5rem; }
        .reveal-stats { display: flex; gap: 2.5rem; flex-wrap: wrap; }
        .rev-stat-n { font-family: var(--ev-font-display); font-size: 1.3rem; font-weight: 700; color: #fff; }
        .rev-stat-l { font-size: 0.6rem; color: var(--ev-text-faint); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 0.05rem; }

        .dash-section-label { font-size: 0.65rem; color: var(--ev-ink-faint); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 1rem; }
        .dash-view-tabs { display: flex; gap: 0.4rem; margin-bottom: 1.25rem; }
        .dash-view-tab {
          background: none; border: 1px solid var(--ev-border-light); border-radius: var(--ev-radius-full);
          padding: 0.45rem 1rem; font-size: 0.78rem; font-weight: 600; color: var(--ev-ink-faint);
          cursor: pointer; transition: all 0.15s; display: inline-flex; align-items: center; gap: 0.4rem;
        }
        .dash-view-tab:hover { color: var(--ev-ink); }
        .dash-view-tab.active { background: var(--ev-ink); border-color: var(--ev-ink); color: #fff; }
        .dash-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 1rem; }
        .dc {
          padding: 1.25rem; opacity: 0; transform: translateY(8px);
          animation: ev-fade-up 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
          display: flex; flex-direction: column;
        }
        .dc.winner { border-color: var(--ev-success-soft); }
        .dc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.55rem; gap: 0.5rem; }
        .dc-name { font-size: 0.88rem; font-weight: 700; color: var(--ev-ink); line-height: 1.3; font-family: var(--ev-font-display); }
        .dc-provider { font-size: 0.72rem; color: var(--ev-ink-faint); margin-bottom: 0.6rem; }
        .dc-meta { display: flex; gap: 1rem; align-items: center; margin-bottom: 0.6rem; }
        .dc-amt { font-size: 0.88rem; font-weight: 700; color: var(--ev-gold-600); }
        .dc-date { font-size: 0.72rem; color: var(--ev-ink-faint); display: flex; align-items: center; gap: 0.3rem; }
        .dc-bar { height: 3px; background: var(--ev-border-light); border-radius: 100px; overflow: hidden; margin-bottom: 0.65rem; }
        .dc-bar-fill { height: 100%; border-radius: 100px; }
        .dc-reasons { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.75rem; flex: 1; }
        .dc-reason { font-size: 0.66rem; line-height: 1.4; }
        .dc-reason.pass { color: var(--ev-success); }
        .dc-reason.fail { color: var(--ev-danger); }
        .dc-apply { margin-top: auto; }
        .dc-view { margin-top: auto; }
        .dc-mark-applied {
          margin-top: 0.5rem; background: none; border: 1px solid var(--ev-border-light);
          border-radius: var(--ev-radius-md); padding: 0.55rem; font-size: 0.76rem; font-weight: 600;
          color: var(--ev-ink-faint); cursor: pointer; display: flex; align-items: center; justify-content: center;
          gap: 0.35rem; transition: all 0.15s; width: 100%;
        }
        .dc-mark-applied:hover:not(:disabled) { color: var(--ev-success); border-color: var(--ev-success-soft); background: var(--ev-success-soft); }
        .dc-mark-applied:disabled { opacity: 0.6; cursor: not-allowed; }

        .dc-applied-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.68rem; font-weight: 700; color: var(--ev-success); }
        .dc-applied-date { font-size: 0.72rem; color: var(--ev-ink-faint); margin-bottom: 0.75rem; }
        .dc-unmark {
          margin-top: 0.5rem; background: none; border: none; color: var(--ev-ink-faint);
          font-size: 0.72rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center;
          gap: 0.3rem; padding: 0.3rem 0; align-self: flex-start;
        }
        .dc-unmark:hover:not(:disabled) { color: var(--ev-ink); }
        .dc-unmark:disabled { opacity: 0.6; cursor: not-allowed; }

        .dash-empty { text-align: center; padding: 4rem 2rem; }
        .dash-empty h3 { font-family: var(--ev-font-display); font-size: 1.15rem; font-weight: 700; color: var(--ev-ink); margin-bottom: 0.5rem; }
        .dash-empty p { font-size: 0.85rem; color: var(--ev-ink-faint); margin-bottom: 1.5rem; }

        /* Mobile app-shell bottom tab bar. Additive only — the top nav keeps
           Sign Out / Admin exactly as-is on every screen size. This just
           gives the installed-PWA experience a native-app navigation feel. */
        .dash-tabbar { display: none; }
        @media (max-width: 680px) {
          .dash-body { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); }
          .dash-tabbar {
            display: flex;
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
            background: var(--ev-surface-light);
            border-top: 1px solid var(--ev-border-light);
            padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
            justify-content: space-around;
          }
          .dash-tab {
            display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
            font-size: 0.65rem; font-weight: 600; color: var(--ev-ink-faint);
            padding: 0.3rem 1.1rem; border-radius: var(--ev-radius-md);
            text-decoration: none; background: none; border: none; cursor: pointer;
          }
          .dash-tab.active { color: var(--ev-ink); }
        }
      `}</style>

      <div className="ev-reset ev-shell-light">
        <nav className="ev-nav ev-nav-light dash-nav" style={{ borderBottomColor: theme ? theme.border : undefined }}>
          <Link className="ev-logo" to="/" style={{ color: 'var(--ev-ink)' }}>
            <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
            <span><em className="ev-logo-em">Elev</em>aid</span>
          </Link>
          <div className="dash-nav-r">
            {userRole === 'admin' && (
              <Link className="ev-btn ev-btn-outline-light" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }} to="/admin">
                <Settings size={13} /> Admin
              </Link>
            )}
            <Link className="ev-btn ev-btn-outline-light" style={{ padding: '0.4rem 0.85rem', fontSize: '0.78rem' }} to="/profile">Profile</Link>
            <button className="ev-btn ev-btn-ghost-light" style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }} onClick={handleSignOut}>Sign Out</button>
          </div>
        </nav>

        <div className="dash-body">
          <div
            className="reveal-banner"
            ref={bannerRef}
            style={{
              background: theme ? theme.gradient : undefined,
              borderLeftColor: theme ? theme.light : 'transparent',
            }}
          >
            <div className="reveal-glow" />
            {theme && (
              <div className="reveal-school-tag" style={{ background: 'rgba(255,255,255,0.14)', color: '#fff', border: '1px solid rgba(255,255,255,0.22)' }}>
                {theme.short}
              </div>
            )}
            <div className="reveal-label">Scholarships matched to your profile</div>
            <div className="reveal-amount">${animatedTotal.toLocaleString()}</div>
            <div className="reveal-sub">
              available to you as a {profile && formatSchool(profile.school)} {profile?.major} student right now
            </div>
            <div className="reveal-stats">
              <div>
                <div className="rev-stat-n">{openMatches.length}</div>
                <div className="rev-stat-l">Total matches</div>
              </div>
              <div>
                <div className="rev-stat-n">{strongMatches}</div>
                <div className="rev-stat-l">100% match</div>
              </div>
              <div>
                <div className="rev-stat-n">{profile?.gpa.toFixed(1)}</div>
                <div className="rev-stat-l">Your GPA</div>
              </div>
            </div>
          </div>

          <div className="dash-view-tabs">
            <button className={`dash-view-tab${view === 'matches' ? ' active' : ''}`} onClick={() => setView('matches')}>
              Your Matches
            </button>
            <button className={`dash-view-tab${view === 'applied' ? ' active' : ''}`} onClick={() => setView('applied')}>
              <CheckCircle2 size={13} /> Applied{applied.length > 0 ? ` (${applied.length})` : ''}
            </button>
          </div>

          {view === 'matches' ? (
            matched.length === 0 ? (
              <div className="dash-empty">
                <h3>No matches yet</h3>
                <p>Try updating your profile — we add new scholarships regularly.</p>
                <Link to="/profile"><button className="ev-btn ev-btn-dark">Update Profile</button></Link>
              </div>
            ) : openMatches.length === 0 ? (
              <div className="dash-empty">
                <h3>You're all caught up</h3>
                <p>You've applied to every scholarship you match with right now. Check the Applied tab, or check back — we add new scholarships regularly.</p>
                <button className="ev-btn ev-btn-dark" onClick={() => setView('applied')}>View Applied</button>
              </div>
            ) : (
              <>
                <div className="dash-section-label">Your matches — sorted by best fit</div>
                <div className="dash-grid">
                  {openMatches.map((s, i) => (
                    <div
                      key={s.id}
                      className={`ev-card-light dc${s.matchPercentage >= 80 ? ' winner' : ''}`}
                      style={{ animationDelay: `${0.12 + i * 0.05}s` }}
                    >
                      <div className="dc-top">
                        <div className="dc-name">{s.name}</div>
                        <div className={`ev-badge ${s.matchPercentage >= 80 ? 'ev-badge-success' : 'ev-badge-gold'}`}>{s.matchPercentage}%</div>
                      </div>
                      <div className="dc-provider">{s.provider}</div>
                      <div className="dc-meta">
                        <span className="dc-amt">${s.award_amount?.toLocaleString()}</span>
                        <span className="dc-date">
                          <Calendar size={12} />
                          {s.deadline ? new Date(s.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'}
                        </span>
                      </div>
                      <div className="dc-bar">
                        <div className="dc-bar-fill" style={{ width: `${s.matchPercentage}%`, background: s.matchPercentage >= 80 ? 'var(--ev-success)' : 'var(--ev-gold)' }} />
                      </div>
                      <div className="dc-reasons">
                        {s.matchReasons.map((r, ri) => {
                          const pass = r.startsWith('pass:');
                          const text = r.replace(/^pass:|^fail:/, '');
                          return (
                            <div key={ri} className={`dc-reason ${pass ? 'pass' : 'fail'}`}>{pass ? '✓' : '✗'} {text}</div>
                          );
                        })}
                      </div>
                      {s.matchPercentage >= 80 ? (
                        <a className="ev-btn ev-btn-dark ev-btn-block dc-apply" href={s.application_url} target="_blank" rel="noopener noreferrer">
                          Apply on External Site <ExternalLink size={13} />
                        </a>
                      ) : (
                        <>
                          <button
                            className="ev-btn ev-btn-outline-light ev-btn-block dc-view"
                            onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                          >
                            {expandedId === s.id ? <>Hide Details <ChevronUp size={13} /></> : <>View Details <ChevronDown size={13} /></>}
                          </button>
                          {expandedId === s.id && s.application_url && (
                            <a
                              className="ev-btn ev-btn-dark ev-btn-block dc-apply"
                              href={s.application_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ marginTop: '0.5rem' }}
                            >
                              Visit Application Site <ExternalLink size={13} />
                            </a>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        className="dc-mark-applied"
                        onClick={() => handleMarkApplied(s)}
                        disabled={markingId === s.id}
                      >
                        {markingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Mark as Applied
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )
          ) : applied.length === 0 ? (
            <div className="dash-empty">
              <h3>No applications yet</h3>
              <p>When you mark a scholarship as applied, it'll show up here.</p>
              <button className="ev-btn ev-btn-dark" onClick={() => setView('matches')}>View Matches</button>
            </div>
          ) : (
            <>
              <div className="dash-section-label">Applied — {applied.length} scholarship{applied.length === 1 ? '' : 's'}</div>
              <div className="dash-grid">
                {applied.map((a, i) => (
                  <div
                    key={a.applicationId}
                    className="ev-card-light dc"
                    style={{ animationDelay: `${0.12 + i * 0.05}s` }}
                  >
                    <div className="dc-top">
                      <div className="dc-name">{a.scholarship.name}</div>
                      <div className="dc-applied-badge"><CheckCircle2 size={13} /> Applied</div>
                    </div>
                    <div className="dc-provider">{a.scholarship.provider}</div>
                    <div className="dc-meta">
                      <span className="dc-amt">${a.scholarship.award_amount?.toLocaleString()}</span>
                      <span className="dc-date">
                        <Calendar size={12} />
                        {a.scholarship.deadline ? new Date(a.scholarship.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No deadline'}
                      </span>
                    </div>
                    <div className="dc-applied-date">
                      Applied {new Date(a.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    {a.scholarship.application_url && (
                      <a className="ev-btn ev-btn-outline-light ev-btn-block dc-view" href={a.scholarship.application_url} target="_blank" rel="noopener noreferrer">
                        View Application <ExternalLink size={13} />
                      </a>
                    )}
                    <button
                      type="button"
                      className="dc-unmark"
                      onClick={() => handleUnmarkApplied(a.scholarship.id)}
                      disabled={markingId === a.scholarship.id}
                    >
                      {markingId === a.scholarship.id ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                      Move back to matches
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <nav className="dash-tabbar" aria-label="Primary">
          <Link className="dash-tab active" to="/dashboard" style={{ color: theme ? theme.deep : 'var(--ev-ink)' }}>
            <Star size={19} strokeWidth={2.25} />
            Matches
          </Link>
          <Link className="dash-tab" to="/profile">
            <User size={19} strokeWidth={2.25} />
            Profile
          </Link>
        </nav>
      </div>
    </>
  );
}

'@
[System.IO.File]::WriteAllText("src\pages\Dashboard.tsx", $content_2, $utf8NoBom)

Write-Host ""
Write-Host "All files written. Committing and pushing..."
git add .
git commit -m "Add application tracker (Applied state) and resume-on-file"
git push

Write-Host "Done."