import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import '@/styles/elevaid.css';
import { ArrowLeft, Sparkles, RefreshCw, Loader2, FileText, AlertCircle } from 'lucide-react';
import { StudentProfile, ResumeReview as ResumeReviewRow, ReviewFixPriority } from '@/types/database';

const CATEGORY_LABELS: Record<string, string> = {
  ats_readability: 'ATS Readability',
  clarity: 'Clarity',
  impact: 'Impact',
  completeness: 'Completeness',
};

const CATEGORY_ORDER = ['ats_readability', 'clarity', 'impact', 'completeness'];

const PRIORITY_ORDER: Record<ReviewFixPriority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL: Record<ReviewFixPriority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--ev-success)';
  if (score >= 60) return 'var(--ev-gold-600)';
  return 'var(--ev-danger)';
}

export default function ResumeReview() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [review, setReview] = useState<ResumeReviewRow | null>(null);
  const [running, setRunning] = useState(false);

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

  const handleRunReview = async () => {
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
        return;
      }
      if (data?.review) {
        setReview(data.review as ResumeReviewRow);
        toast({ title: 'Review ready', description: 'Your resume feedback is in.' });
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Couldn’t review your resume', description: 'Please try again.' });
    } finally {
      setRunning(false);
    }
  };

  const sortedFixes = review?.fixes
    ? [...review.fixes].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    : [];

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

        .rr-scorecard { padding: 1.75rem; margin-bottom: 1.5rem; }
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

        .rr-actions { display: flex; justify-content: center; }
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
                    Get a scorecard and specific fixes for the resume you have on file — built for
                    scholarship and internship applications.
                  </p>
                </div>
              )}

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

                  {sortedFixes.length > 0 && (
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

              <div className="rr-actions">
                <button className="ev-btn ev-btn-dark" onClick={handleRunReview} disabled={running}>
                  {running ? <Loader2 size={15} className="animate-spin" /> : review ? <RefreshCw size={15} /> : <Sparkles size={15} />}
                  {running ? 'Reviewing your resume…' : review ? 'Re-run Review' : 'Review My Resume'}
                </button>
              </div>

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
