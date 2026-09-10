import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { ArrowLeft, Sparkles, RefreshCw, Loader2, FileText, AlertCircle, UploadCloud, ShieldCheck, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';
import { StudentProfile, ResumeReview as ResumeReviewRow, ReviewFixPriority, ResumeEdit } from '@/types/database';

const CATEGORY_LABELS: Record<string, string> = {
  ats_readability: 'ATS Readability',
  clarity: 'Clarity',
  impact: 'Impact',
  completeness: 'Completeness',
};

const CATEGORY_ORDER = ['ats_readability', 'clarity', 'impact', 'completeness'];

const EDIT_CATEGORY_LABELS: Record<string, string> = {
  ats_readability: 'ATS',
  clarity: 'Clarity',
  impact: 'Impact',
  completeness: 'Completeness',
  tailoring: `For you`,
};

const PRIORITY_ORDER: Record<ReviewFixPriority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL: Record<ReviewFixPriority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };

const RESUME_MAX_BYTES = 8 * 1024 * 1024; // 8MB

// Shown before a review exists — must match the backend's RUBRIC_VERSION
// constant. Once a review exists, review.rubric_version (the version that
// actually graded it) is used instead, so this is only ever a pre-review
// placeholder.
const RUBRIC_VERSION_DISPLAY = '1.0';

const SECTION_DISPLAY_LABELS: Record<string, string> = {
  education: 'Education',
  experience: 'Experience',
  skills: 'Skills',
  projects: 'Projects',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--ev-success)';
  if (score >= 60) return 'var(--ev-gold-600)';
  return 'var(--ev-danger)';
}

// --- Red-ink markup: locate each edit's exact anchor text inside the resume
// text the model actually saw, so the critique renders as marks on the
// student's own manuscript rather than a disconnected list of advice.

interface EditMatch {
  start: number;
  end: number;
  edit: ResumeEdit;
  editIndex: number;
}

type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'edit'; matchedText: string; edit: ResumeEdit; markNumber: number };

function findAnchorMatches(resumeText: string, edits: ResumeEdit[]): { matches: EditMatch[]; unmatchedIndexes: number[] } {
  const raw: EditMatch[] = [];
  const unmatchedIndexes: number[] = [];

  edits.forEach((edit, editIndex) => {
    const anchor = (edit.anchor || '').trim();
    if (!anchor) { unmatchedIndexes.push(editIndex); return; }
    let start = resumeText.indexOf(anchor);
    if (start === -1) {
      start = resumeText.toLowerCase().indexOf(anchor.toLowerCase());
    }
    if (start === -1) { unmatchedIndexes.push(editIndex); return; }
    raw.push({ start, end: start + anchor.length, edit, editIndex });
  });

  raw.sort((a, b) => a.start - b.start);

  const matches: EditMatch[] = [];
  let lastEnd = -1;
  for (const m of raw) {
    if (m.start >= lastEnd) {
      matches.push(m);
      lastEnd = m.end;
    } else {
      unmatchedIndexes.push(m.editIndex);
    }
  }
  return { matches, unmatchedIndexes };
}

function buildSegments(resumeText: string, matches: EditMatch[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    if (m.start > cursor) segments.push({ kind: 'text', content: resumeText.slice(cursor, m.start) });
    segments.push({ kind: 'edit', matchedText: resumeText.slice(m.start, m.end), edit: m.edit, markNumber: i + 1 });
    cursor = m.end;
  });
  if (cursor < resumeText.length) segments.push({ kind: 'text', content: resumeText.slice(cursor) });
  return segments;
}

function EditMark({ segment }: { segment: Extract<Segment, { kind: 'edit' }> }) {
  const { edit, matchedText, markNumber } = segment;
  return (
    <span className="rr-mark-wrap">
      {edit.type === 'cut' && <s className="rr-ink rr-ink-cut">{matchedText}</s>}
      {edit.type === 'rewrite' && (
        <>
          <s className="rr-ink rr-ink-cut">{matchedText}</s>
          {edit.replacement && <ins className="rr-ink rr-ink-add">{edit.replacement}</ins>}
        </>
      )}
      {edit.type === 'add' && (
        <>
          <span>{matchedText}</span>
          {edit.replacement && <ins className="rr-ink rr-ink-add">{edit.replacement}</ins>}
        </>
      )}
      {edit.type === 'note' && <span className="rr-ink rr-ink-note">{matchedText}</span>}
      <sup className="rr-marknum">{markNumber}</sup>
    </span>
  );
}

export default function ResumeReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [review, setReview] = useState<ResumeReviewRow | null>(null);
  const [running, setRunning] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    try {
      const { data: profileData, error: profileError } = await supabase
        .from('student_profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (profileError) throw profileError;
      setProfile(profileData as StudentProfile | null);

      const { data: reviewData, error: reviewError } = await supabase
        .from('resume_reviews')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reviewError) throw reviewError;
      setReview(reviewData as unknown as ResumeReviewRow | null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error loading resume review', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const runReview = async (): Promise<boolean> => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('resume-review');
      if (error) {
        // supabase-js surfaces a non-2xx function response as `error` with no
        // parsed body — the real message lives on the raw Response it wraps.
        let message = 'Please try again.';
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.clone().json();
            if (body?.message) message = body.message;
          } catch {
            // ignore — fall back to generic message
          }
        }
        toast({ variant: 'destructive', title: 'Couldn’t review your resume', description: message });
        return false;
      }
      if (data?.review) {
        setReview(data.review as ResumeReviewRow);
        toast({ title: 'Review ready', description: 'Your marked-up resume is in.' });
        return true;
      }
      return false;
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Couldn’t review your resume', description: 'Please try again.' });
      return false;
    } finally {
      setRunning(false);
    }
  };

  // Revise-and-resave: lets a student act on the critique without leaving
  // this page. Uploads straight to their profile's resume slot (same path
  // convention Profile.tsx uses) and immediately re-runs the review against
  // the new file, so the loop is upload -> fresh markup, not upload -> go
  // find the review tool again.
  const handleReplaceResume = async (file: File | undefined | null) => {
    if (!file || !user) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext !== 'pdf') {
      toast({ variant: 'destructive', title: 'PDF only', description: 'Resume review currently only reads PDF files.' });
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Resumes must be under 8MB.' });
      return;
    }

    setReplacing(true);
    try {
      const newPath = `${user.id}/resume.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('resumes')
        .upload(newPath, file, { upsert: true, contentType: file.type || 'application/pdf' });
      if (uploadError) throw uploadError;

      if (profile?.resume_url && profile.resume_url !== newPath) {
        await supabase.storage.from('resumes').remove([profile.resume_url]);
      }

      const { error: updateError } = await supabase
        .from('student_profiles')
        .update({ resume_url: newPath })
        .eq('user_id', user.id);
      if (updateError) throw updateError;

      setProfile(p => (p ? { ...p, resume_url: newPath } : p));
      toast({ title: 'Resume saved to your profile', description: 'Re-running your review…' });
      await runReview();
    } catch (err: any) {
      console.error('Resume replace error:', err);
      toast({ variant: 'destructive', title: 'Error saving resume', description: 'Please try again.' });
    } finally {
      setReplacing(false);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const { segments, unmatchedNotes, topPriority } = useMemo(() => {
    if (!review?.resume_text || !review.edits?.length) {
      return { segments: [] as Segment[], unmatchedNotes: [] as { edit: ResumeEdit; number: number }[], topPriority: [] as ResumeEdit[] };
    }
    const { matches, unmatchedIndexes } = findAnchorMatches(review.resume_text, review.edits);
    const segs = buildSegments(review.resume_text, matches);
    const matchedCount = matches.length;
    const unmatched = unmatchedIndexes.map((editIndex, i) => ({ edit: review.edits[editIndex], number: matchedCount + i + 1 }));
    const high = review.edits.filter(e => e.priority === 'high').slice(0, 4);
    const fallback = high.length > 0 ? high : review.edits.slice(0, 3);
    return { segments: segs, unmatchedNotes: unmatched, topPriority: fallback };
  }, [review]);

  const sortedFixes = review?.fixes
    ? [...review.fixes].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    : [];

  // Deterministic, code-checked facts about the resume (not LLM-judged) —
  // the "verified facts" panel below is what turns the score from a claim
  // into something a student (or a career-services partner) can check.
  const checks = (review?.checks as any) || null;
  const hasChecks = !!checks && Object.keys(checks).length > 0;

  if (loading) {
    return (
      <div className="ev-reset ev-shell-light" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div className="ev-spinner" />
        <div style={{ fontSize: '0.88rem', color: 'var(--ev-ink-faint)' }}>Loading…</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .rr-nav { padding: 0 1.5rem; padding-top: env(safe-area-inset-top, 0px); min-height: 60px; }
        .rr-back { background: none; border: none; color: var(--ev-ink-faint); cursor: pointer; font-size: 0.82rem; display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0; }
        .rr-back:hover { color: var(--ev-ink); }
        .rr-body { padding: 2rem 1.5rem calc(3rem + env(safe-area-inset-bottom, 0px)); max-width: 760px; margin: 0 auto; }

        .rr-hero { text-align: center; margin-bottom: 2rem; }
        .rr-hero-icon {
          width: 52px; height: 52px; border-radius: var(--ev-radius-lg); background: var(--ev-gold-soft);
          color: var(--ev-gold-600); display: flex; align-items: center; justify-content: center; margin: 0 auto 1rem;
        }
        .rr-title { font-family: var(--ev-font-display); font-size: 1.5rem; font-weight: 700; color: var(--ev-ink); letter-spacing: -0.02em; margin-bottom: 0.5rem; }
        .rr-sub { font-size: 0.9rem; color: var(--ev-ink-faint); max-width: 460px; margin: 0 auto; line-height: 1.55; }

        .rr-empty { text-align: center; padding: 3rem 2rem; }

        .rr-scorecard { padding: 1.75rem; margin-bottom: 1.25rem; }
        .rr-score-row { display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .rr-score-ring {
          width: 84px; height: 84px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; flex-direction: column;
          border: 4px solid var(--ev-border-light);
        }
        .rr-score-num { font-family: var(--ev-font-display); font-size: 1.55rem; font-weight: 700; line-height: 1; }
        .rr-score-of { font-size: 0.6rem; color: var(--ev-ink-faint); margin-top: 0.1rem; }
        .rr-summary { font-size: 0.88rem; color: var(--ev-ink); line-height: 1.55; flex: 1; min-width: 220px; }
        .rr-meta { font-size: 0.72rem; color: var(--ev-ink-faint); margin-top: 0.5rem; }

        .rr-cats { display: grid; gap: 0.9rem; }
        .rr-cat-row { display: grid; grid-template-columns: 130px 1fr 34px; align-items: center; gap: 0.75rem; }
        .rr-cat-label { font-size: 0.78rem; font-weight: 600; color: var(--ev-ink-muted); }
        .rr-cat-track { height: 6px; background: var(--ev-border-light); border-radius: 100px; overflow: hidden; }
        .rr-cat-fill { height: 100%; border-radius: 100px; }
        .rr-cat-score { font-size: 0.78rem; font-weight: 700; text-align: right; color: var(--ev-ink); }

        .rr-tailored {
          display: flex; gap: 0.75rem; align-items: flex-start; padding: 1rem 1.15rem; margin-bottom: 1.5rem;
          background: var(--ev-gold-soft); border: 1px solid var(--ev-gold-border); border-radius: var(--ev-radius-lg);
        }
        .rr-tailored-icon { color: var(--ev-gold-600); flex-shrink: 0; margin-top: 0.15rem; }
        .rr-tailored-label { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ev-gold-600); margin-bottom: 0.3rem; }
        .rr-tailored-text { font-size: 0.85rem; color: var(--ev-ink); line-height: 1.5; }

        /* Trust / "how this works" disclosure — reassurance layer so the
           score never feels like an unexplained black box. */
        .rr-trust { margin-bottom: 1.5rem; padding: 0; overflow: hidden; }
        .rr-trust-summary {
          list-style: none; cursor: pointer; padding: 0.9rem 1.15rem; display: flex; align-items: center;
          justify-content: space-between; gap: 0.75rem;
        }
        .rr-trust-summary::-webkit-details-marker { display: none; }
        .rr-trust-summary-left { display: flex; align-items: center; gap: 0.55rem; }
        .rr-trust-summary-left svg { color: var(--ev-gold-600); flex-shrink: 0; }
        .rr-trust-summary-text { font-size: 0.82rem; font-weight: 600; color: var(--ev-ink); }
        .rr-trust-chevron { color: var(--ev-ink-faint); transition: transform 0.15s ease; flex-shrink: 0; }
        details[open] .rr-trust-chevron { transform: rotate(180deg); }
        .rr-trust-body { padding: 0 1.15rem 1.1rem; display: flex; flex-direction: column; gap: 0.65rem; }
        .rr-trust-row { font-size: 0.8rem; color: var(--ev-ink-muted); line-height: 1.55; }
        .rr-trust-row b { color: var(--ev-ink); font-weight: 600; }
        .rr-trust-version { font-size: 0.7rem; color: var(--ev-ink-faint); padding-top: 0.4rem; border-top: 1px solid var(--ev-border-light); }

        /* Verified-facts panel — deterministic, code-checked facts about the
           resume, shown alongside the rubric score so it's part measured
           fact, not just AI judgment. */
        .rr-checks { padding: 1.25rem 1.4rem; margin-bottom: 1.5rem; }
        .rr-checks-label { font-size: 0.65rem; color: var(--ev-ink-faint); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 0.85rem; }
        .rr-check-row { display: flex; align-items: flex-start; gap: 0.6rem; font-size: 0.82rem; color: var(--ev-ink); line-height: 1.5; margin-bottom: 0.6rem; }
        .rr-check-row:last-of-type { margin-bottom: 0; }
        .rr-check-icon { flex-shrink: 0; margin-top: 0.1rem; }
        .rr-check-icon.ok { color: var(--ev-success); }
        .rr-check-icon.warn { color: var(--ev-gold-600); }
        .rr-checks-meta { font-size: 0.72rem; color: var(--ev-ink-faint); margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--ev-border-light); }

        .rr-section-label { font-size: 0.65rem; color: var(--ev-ink-faint); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; margin-bottom: 1rem; }
        .rr-fixes { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 2rem; }
        .rr-fix { padding: 1.1rem 1.25rem; }
        .rr-fix-top { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.4rem; }
        .rr-fix-pill { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.2rem 0.55rem; border-radius: var(--ev-radius-full); }
        .rr-fix-pill.high { background: var(--ev-danger-soft); color: var(--ev-danger); }
        .rr-fix-pill.medium { background: var(--ev-gold-soft); color: var(--ev-gold-600); }
        .rr-fix-pill.low { background: var(--ev-border-light); color: var(--ev-ink-faint); }
        .rr-fix-title { font-size: 0.88rem; font-weight: 700; color: var(--ev-ink); }
        .rr-fix-detail { font-size: 0.82rem; color: var(--ev-ink-muted); line-height: 1.5; }

        /* Manuscript — the red-ink markup itself */
        .rr-manuscript {
          padding: 2rem 2.25rem; margin-bottom: 1.5rem; background: #fffdf8;
          font-family: 'DM Sans', var(--ev-font-body); font-size: 0.86rem; line-height: 1.85;
          color: #2a2620; white-space: pre-wrap; word-break: break-word;
        }
        .rr-ink { color: #b91c1c; }
        .rr-ink-cut { text-decoration-color: #b91c1c; opacity: 0.75; }
        .rr-ink-add { text-decoration: underline; text-decoration-style: wavy; font-weight: 600; margin-left: 0.15em; }
        .rr-ink-note { text-decoration: underline dotted #b91c1c; text-decoration-thickness: 1.5px; }
        .rr-marknum {
          color: #b91c1c; font-weight: 700; font-size: 0.68em; margin-left: 1px;
          border: 1px solid #b91c1c; border-radius: 50%; padding: 0 3px; line-height: 1.3;
        }
        .rr-mark-wrap { position: relative; }

        .rr-notes { display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1.5rem; }
        .rr-note { padding: 0.85rem 1rem; display: flex; gap: 0.7rem; align-items: flex-start; }
        .rr-note-num {
          flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: #fef2f2; color: #b91c1c;
          border: 1px solid #fca5a5; font-size: 0.68rem; font-weight: 700; display: flex; align-items: center; justify-content: center;
        }
        .rr-note-body { flex: 1; }
        .rr-note-top { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; flex-wrap: wrap; }
        .rr-note-cat { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ev-ink-faint); }
        .rr-note-comment { font-size: 0.82rem; color: var(--ev-ink); line-height: 1.5; }

        .rr-replace-row { display: flex; justify-content: center; margin-top: 0.75rem; }
        .rr-replace-btn {
          background: none; border: none; color: var(--ev-ink-faint); font-size: 0.78rem; font-weight: 600;
          cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.6rem;
        }
        .rr-replace-btn:hover:not(:disabled) { color: var(--ev-ink); }
        .rr-replace-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .rr-actions { display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap; }
      `}</style>

      <div className="ev-reset ev-shell-light">
        <nav className="ev-nav ev-nav-light rr-nav">
          <button className="rr-back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={15} /> Back to Dashboard
          </button>
        </nav>

        <div className="rr-body">
          {!profile?.resume_url ? (
            <div className="ev-card-light rr-empty">
              <div className="rr-hero-icon" style={{ margin: '0 auto 1rem' }}><FileText size={22} /></div>
              <div className="rr-title" style={{ fontSize: '1.2rem' }}>Upload a resume first</div>
              <p className="rr-sub" style={{ marginBottom: '1.5rem' }}>
                Add a resume on your Profile page, then come back here to get feedback on it.
              </p>
              <Link to="/profile"><button className="ev-btn ev-btn-dark">Go to Profile</button></Link>
            </div>
          ) : (
            <>
              {!review && (
                <div className="rr-hero">
                  <div className="rr-hero-icon"><Sparkles size={22} /></div>
                  <div className="rr-title">Resume Review</div>
                  <p className="rr-sub">
                    Get a red-ink, line-by-line critique of the resume you have on file — tailored to your
                    major and stats, built for scholarship and internship applications.
                  </p>
                </div>
              )}

              <details className="ev-card-light rr-trust">
                <summary className="rr-trust-summary">
                  <span className="rr-trust-summary-left">
                    <ShieldCheck size={16} />
                    <span className="rr-trust-summary-text">How this review is scored</span>
                  </span>
                  <ChevronDown size={15} className="rr-trust-chevron" />
                </summary>
                <div className="rr-trust-body">
                  <div className="rr-trust-row">
                    We grade every resume the same way, on <b>four fixed categories</b> — ATS readability,
                    clarity, impact, and completeness — plus feedback tailored to your major, class year, and
                    GPA. The score isn't just an AI's opinion: it's a fixed formula over those four categories,
                    and a few checks (like whether we can find your contact info or standard section headers)
                    are pulled straight from your resume, not judged.
                  </div>
                  <div className="rr-trust-row">
                    <b>Only you can see this.</b> Your review is never shared with scholarship providers,
                    schools, or anyone else.
                  </div>
                  <div className="rr-trust-version">
                    Elevaid Resume Readiness Rubric v{review?.rubric_version || RUBRIC_VERSION_DISPLAY}
                  </div>
                </div>
              </details>

              {review && (
                <>
                  <div className="ev-card-light rr-scorecard">
                    <div className="rr-score-row">
                      <div className="rr-score-ring" style={{ borderColor: scoreColor(review.overall_score) }}>
                        <div className="rr-score-num" style={{ color: scoreColor(review.overall_score) }}>{review.overall_score}</div>
                        <div className="rr-score-of">/ 100</div>
                      </div>
                      <div>
                        <div className="rr-summary">{review.summary || 'Here’s how your resume scored.'}</div>
                        <div className="rr-meta">Reviewed {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                    </div>
                    <div className="rr-cats">
                      {CATEGORY_ORDER.map((key) => {
                        const score = (review.category_scores as any)?.[key] ?? 0;
                        return (
                          <div className="rr-cat-row" key={key}>
                            <div className="rr-cat-label">{CATEGORY_LABELS[key]}</div>
                            <div className="rr-cat-track">
                              <div className="rr-cat-fill" style={{ width: `${score}%`, background: scoreColor(score) }} />
                            </div>
                            <div className="rr-cat-score">{score}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {review.tailored_note && (
                    <div className="rr-tailored">
                      <Sparkles size={16} className="rr-tailored-icon" />
                      <div>
                        <div className="rr-tailored-label">For you, specifically</div>
                        <div className="rr-tailored-text">{review.tailored_note}</div>
                      </div>
                    </div>
                  )}

                  {hasChecks && (
                    <div className="ev-card-light rr-checks">
                      <div className="rr-checks-label">What we verified on the page</div>

                      <div className="rr-check-row">
                        {checks.has_contact_info
                          ? <CheckCircle2 size={16} className="rr-check-icon ok" />
                          : <AlertTriangle size={16} className="rr-check-icon warn" />}
                        <span>
                          {checks.has_contact_info
                            ? 'Contact info (email or phone) found.'
                            : "We couldn't find an email or phone number — add one so recruiters can reach you."}
                        </span>
                      </div>

                      {Array.isArray(checks.sections_expected) && (
                        <div className="rr-check-row">
                          {checks.sections_found?.length === checks.sections_expected?.length
                            ? <CheckCircle2 size={16} className="rr-check-icon ok" />
                            : <AlertTriangle size={16} className="rr-check-icon warn" />}
                          <span>
                            {checks.sections_found?.length || 0}/{checks.sections_expected.length} standard sections found
                            {checks.sections_found?.length > 0 && (
                              <> ({checks.sections_found.map((s: string) => SECTION_DISPLAY_LABELS[s] || s).join(', ')})</>
                            )}.
                          </span>
                        </div>
                      )}

                      {typeof checks.quantified_terms_per_100_words === 'number' && (
                        <div className="rr-check-row">
                          {checks.quantified_terms_per_100_words >= 1.5
                            ? <CheckCircle2 size={16} className="rr-check-icon ok" />
                            : <AlertTriangle size={16} className="rr-check-icon warn" />}
                          <span>
                            {checks.quantified_terms_per_100_words >= 3
                              ? 'Strong use of numbers and metrics throughout your bullets.'
                              : checks.quantified_terms_per_100_words >= 1.5
                              ? 'Some quantified results — a few more metrics would strengthen it further.'
                              : 'Very few numbers or metrics on the page — this is capping your impact score below.'}
                          </span>
                        </div>
                      )}

                      {typeof checks.anchors_total === 'number' && checks.anchors_total > 0 && (
                        <div className="rr-checks-meta">
                          Every one of the {checks.anchors_verified} edits below was checked word-for-word
                          against your resume text before we showed it to you
                          {checks.anchors_total > checks.anchors_verified
                            ? ` (${checks.anchors_total - checks.anchors_verified} unverifiable edit${checks.anchors_total - checks.anchors_verified === 1 ? '' : 's'} from the model were discarded rather than shown)`
                            : ''}.
                        </div>
                      )}
                    </div>
                  )}

                  {topPriority.length > 0 && (
                    <>
                      <div className="rr-section-label">Start here</div>
                      <div className="rr-fixes">
                        {topPriority.map((edit, i) => (
                          <div className="ev-card-light rr-fix" key={i}>
                            <div className="rr-fix-top">
                              <span className={`rr-fix-pill ${edit.priority}`}>{PRIORITY_LABEL[edit.priority]}</span>
                              <span className="rr-fix-pill" style={{ background: 'var(--ev-border-light)', color: 'var(--ev-ink-faint)' }}>{EDIT_CATEGORY_LABELS[edit.category] || edit.category}</span>
                            </div>
                            <div className="rr-fix-detail">{edit.comment}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {segments.length > 0 && (
                    <>
                      <div className="rr-section-label">Your resume, marked up</div>
                      <div className="ev-card-light rr-manuscript">
                        {segments.map((seg, i) =>
                          seg.kind === 'text'
                            ? <span key={i}>{seg.content}</span>
                            : <EditMark key={i} segment={seg} />
                        )}
                      </div>

                      <div className="rr-section-label">Coach's notes</div>
                      <div className="rr-notes">
                        {segments
                          .filter((s): s is Extract<Segment, { kind: 'edit' }> => s.kind === 'edit')
                          .map((s) => (
                            <div className="ev-card-light rr-note" key={s.markNumber}>
                              <div className="rr-note-num">{s.markNumber}</div>
                              <div className="rr-note-body">
                                <div className="rr-note-top">
                                  <span className="rr-note-cat">{EDIT_CATEGORY_LABELS[s.edit.category] || s.edit.category}</span>
                                </div>
                                <div className="rr-note-comment">{s.edit.comment}</div>
                              </div>
                            </div>
                          ))}
                        {unmatchedNotes.map(({ edit, number }) => (
                          <div className="ev-card-light rr-note" key={number}>
                            <div className="rr-note-num">{number}</div>
                            <div className="rr-note-body">
                              <div className="rr-note-top">
                                <span className="rr-note-cat">{EDIT_CATEGORY_LABELS[edit.category] || edit.category}</span>
                              </div>
                              <div className="rr-note-comment">{edit.comment}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Legacy rows from a review generated before the red-ink
                      markup existed — kept so an old review still renders
                      something useful instead of an empty page. */}
                  {segments.length === 0 && sortedFixes.length > 0 && (
                    <>
                      <div className="rr-section-label">What to fix</div>
                      <div className="rr-fixes">
                        {sortedFixes.map((fix, i) => (
                          <div className="ev-card-light rr-fix" key={i}>
                            <div className="rr-fix-top">
                              <span className={`rr-fix-pill ${fix.priority}`}>{PRIORITY_LABEL[fix.priority]}</span>
                            </div>
                            <div className="rr-fix-title">{fix.title}</div>
                            <div className="rr-fix-detail">{fix.detail}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              <input
                ref={replaceInputRef}
                type="file"
                accept=".pdf"
                className="sr-only"
                onChange={e => handleReplaceResume(e.target.files?.[0])}
              />

              <div className="rr-actions">
                <button className="ev-btn ev-btn-dark" onClick={() => runReview()} disabled={running || replacing}>
                  {running ? <Loader2 size={15} className="animate-spin" /> : review ? <RefreshCw size={15} /> : <Sparkles size={15} />}
                  {running ? 'Reviewing your resume…' : review ? 'Re-run Review' : 'Review My Resume'}
                </button>
              </div>

              {review && (
                <div className="rr-replace-row">
                  <button
                    type="button"
                    className="rr-replace-btn"
                    onClick={() => replaceInputRef.current?.click()}
                    disabled={running || replacing}
                  >
                    {replacing ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                    {replacing ? 'Saving your revised resume…' : 'Made the edits? Upload your revised resume'}
                  </button>
                </div>
              )}

              {!review && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.85rem', fontSize: '0.72rem', color: 'var(--ev-ink-faint)' }}>
                  <AlertCircle size={12} /> PDF resumes only, for now.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
