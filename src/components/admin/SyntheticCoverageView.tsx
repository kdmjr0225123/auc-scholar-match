import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Radar, PlayCircle, CheckCircle2, AlertTriangle, GraduationCap,
  BookOpen, Calendar, Clock,
} from 'lucide-react';
import { format } from 'date-fns';

// Threshold mirrors the synthetic-coverage-check edge function's MIN_MATCHES.
// Kept in sync manually rather than fetched, same as other admin-side
// constants in this file (e.g. SCHOOL_LABELS) that mirror DB enums.
const MIN_MATCHES = 4;

const SCHOOL_LABELS: Record<string, string> = {
  morehouse: 'Morehouse',
  spelman: 'Spelman',
  clark_atlanta: 'Clark Atlanta',
  morris_brown: 'Morris Brown',
};

interface CoverageRun {
  id: string;
  ran_at: string;
  profiles_checked: number;
  below_threshold_count: number;
  min_matches: number | null;
  max_matches: number | null;
  avg_matches: number | null;
  status: string;
  notes: string | null;
}

interface CoverageResult {
  id: string;
  match_count: number;
  passed: boolean;
  synthetic_profiles: {
    label: string;
    school: string;
    gpa: number;
    major: string;
    graduation_year: number;
  } | null;
}

export default function SyntheticCoverageView() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<CoverageRun | null>(null);
  const [results, setResults] = useState<CoverageResult[]>([]);

  useEffect(() => {
    loadLatest();
  }, []);

  const loadLatest = async () => {
    try {
      const { data: runData, error: runError } = await supabase
        .from('synthetic_coverage_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (runError) throw runError;
      setRun(runData as CoverageRun | null);

      if (runData) {
        const { data: resultsData, error: resultsError } = await supabase
          .from('synthetic_coverage_results')
          .select('id, match_count, passed, synthetic_profiles ( label, school, gpa, major, graduation_year )')
          .eq('run_id', runData.id);
        if (resultsError) throw resultsError;
        const sorted = ((resultsData || []) as unknown as CoverageResult[]).sort((a, b) => {
          if (a.passed !== b.passed) return a.passed ? 1 : -1; // failures first
          return (a.synthetic_profiles?.label || '').localeCompare(b.synthetic_profiles?.label || '');
        });
        setResults(sorted);
      } else {
        setResults([]);
      }
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error loading coverage check', description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('synthetic-coverage-check');
      if (error) throw error;
      const belowCount = data?.below_threshold_count ?? 0;
      toast({
        title: 'Coverage check complete',
        description:
          belowCount > 0
            ? `${belowCount} canary profile${belowCount === 1 ? '' : 's'} matched fewer than ${MIN_MATCHES} scholarships.`
            : `All canary profiles matched ${MIN_MATCHES}+ scholarships.`,
        ...(belowCount > 0 ? { variant: 'destructive' as const } : {}),
      });
      await loadLatest();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error running coverage check', description: error.message });
    } finally {
      setRunning(false);
    }
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never run';
    return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#8A6810' }} />
      </div>
    );
  }

  const isClean = run?.status === 'clean';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-primary flex items-center gap-2">
            <Radar className="h-5 w-5" style={{ color: '#8A6810' }} />
            Synthetic Coverage Check
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {run
              ? `Last ran ${formatTimestamp(run.ran_at)}`
              : 'Runs automatically every day, shortly after the scholarship quality check.'}
          </p>
        </div>
        <Button onClick={handleRunNow} disabled={running}>
          {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
          Run Now
        </Button>
      </div>

      {!run ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No coverage checks have run yet. Click "Run Now" to check the live inventory against all canary profiles.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className={isClean ? undefined : 'border-destructive'}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {isClean ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  )}
                  {isClean ? 'All canary profiles covered' : 'Coverage gap detected'}
                </CardTitle>
                <Badge className={isClean ? 'bg-green-100 text-green-800 border-green-200' : 'bg-red-100 text-red-800 border-red-200'}>
                  {isClean ? 'Clean' : `${run.below_threshold_count} below threshold`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-muted/50 p-3 rounded-lg">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Profiles Checked</span>
                  <p className="font-medium">{run.profiles_checked}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Below Threshold (&lt;{MIN_MATCHES})</span>
                  <p className={`font-medium ${run.below_threshold_count > 0 ? 'text-destructive' : ''}`}>
                    {run.below_threshold_count}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Min / Max Matches</span>
                  <p className="font-medium">{run.min_matches ?? '—'} / {run.max_matches ?? '—'}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Avg Matches</span>
                  <p className="font-medium">{run.avg_matches !== null ? Number(run.avg_matches).toFixed(1) : '—'}</p>
                </div>
              </div>
              {run.notes && !isClean && (
                <pre className="text-xs text-destructive mt-3 whitespace-pre-wrap font-sans">{run.notes}</pre>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <Card key={r.id} className={r.passed ? undefined : 'border-destructive'}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm leading-snug">{r.synthetic_profiles?.label ?? 'Unknown profile'}</CardTitle>
                    <Badge className={r.passed ? 'bg-green-100 text-green-800 border-green-200 shrink-0' : 'bg-red-100 text-red-800 border-red-200 shrink-0'}>
                      {r.match_count} match{r.match_count === 1 ? '' : 'es'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-lg text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <GraduationCap className="h-3 w-3" />
                      {SCHOOL_LABELS[r.synthetic_profiles?.school ?? ''] ?? r.synthetic_profiles?.school}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Class of {r.synthetic_profiles?.graduation_year}
                    </span>
                    <span>GPA {r.synthetic_profiles?.gpa?.toFixed(1)}</span>
                    <span className="flex items-center gap-1 truncate">
                      <BookOpen className="h-3 w-3" />
                      {r.synthetic_profiles?.major}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Also runs automatically every day at 8:15am UTC, a few minutes after the scholarship quality check.
          </p>
        </>
      )}
    </div>
  );
}
