import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { StudentProfile, Scholarship, EligibilityRule, School } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Loader2, ExternalLink, Calendar, DollarSign, LogOut, User, Settings } from 'lucide-react';

interface MatchedScholarship extends Scholarship {
  matchPercentage: number;
  matchReasons: string[];
  eligibilityRules: EligibilityRule;
}

export default function Dashboard() {
  const { user, signOut, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [matchedScholarships, setMatchedScholarships] = useState<MatchedScholarship[]>([]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);


  const loadData = async () => {
    if (!user) return;

    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profileData) {
        navigate('/profile');
        return;
      }

      setProfile(profileData as StudentProfile);

      // Load scholarships with eligibility rules
      const { data: scholarshipsData, error: scholarshipsError } = await supabase
        .from('scholarships')
        .select(`
          *,
          eligibility_rules (*)
        `)
        .eq('is_active', true);

      if (scholarshipsError) throw scholarshipsError;

      // Calculate matches
      const matched = calculateMatches(profileData as StudentProfile, scholarshipsData || []);
      setMatchedScholarships(matched);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading data',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateMatches = (
    profile: StudentProfile,
    scholarships: any[]
  ): MatchedScholarship[] => {
    return scholarships
      .map((scholarship) => {
        const rules = scholarship.eligibility_rules;
        if (!rules) return null;

        const matchReasons: string[] = [];
        const failReasons: string[] = [];
        let totalCriteria = 0;
        let metCriteria = 0;

        // School match - REQUIRED
        totalCriteria++;
        const schoolMatch = rules.eligible_schools?.length === 0 || 
          rules.eligible_schools?.includes(profile.school);
        if (!schoolMatch) {
          return null; // Hard requirement
        }
        metCriteria++;
        matchReasons.push(`✓ School: ${formatSchool(profile.school)} is eligible`);

        // Graduation year - REQUIRED
        totalCriteria++;
        const yearInRange = 
          (!rules.graduation_year_min || profile.graduation_year >= rules.graduation_year_min) &&
          (!rules.graduation_year_max || profile.graduation_year <= rules.graduation_year_max);
        if (!yearInRange) {
          return null; // Hard requirement
        }
        metCriteria++;
        if (rules.graduation_year_min && rules.graduation_year_max) {
          matchReasons.push(`✓ Graduation Year: ${profile.graduation_year} is within ${rules.graduation_year_min}-${rules.graduation_year_max}`);
        } else if (rules.graduation_year_min) {
          matchReasons.push(`✓ Graduation Year: ${profile.graduation_year} ≥ ${rules.graduation_year_min}`);
        } else if (rules.graduation_year_max) {
          matchReasons.push(`✓ Graduation Year: ${profile.graduation_year} ≤ ${rules.graduation_year_max}`);
        } else {
          matchReasons.push(`✓ Graduation Year: ${profile.graduation_year} (no restriction)`);
        }

        // GPA check
        if (rules.min_gpa || rules.max_gpa) {
          totalCriteria++;
          const gpaMatch = 
            (!rules.min_gpa || profile.gpa >= rules.min_gpa) &&
            (!rules.max_gpa || profile.gpa <= rules.max_gpa);
          if (gpaMatch) {
            metCriteria++;
            if (rules.min_gpa && rules.max_gpa) {
              matchReasons.push(`✓ GPA: ${profile.gpa.toFixed(2)} is within ${rules.min_gpa}-${rules.max_gpa}`);
            } else if (rules.min_gpa) {
              matchReasons.push(`✓ GPA: ${profile.gpa.toFixed(2)} ≥ ${rules.min_gpa} minimum`);
            } else {
              matchReasons.push(`✓ GPA: ${profile.gpa.toFixed(2)} ≤ ${rules.max_gpa} maximum`);
            }
          } else {
            if (rules.min_gpa && profile.gpa < rules.min_gpa) {
              failReasons.push(`✗ GPA: ${profile.gpa.toFixed(2)} below ${rules.min_gpa} minimum`);
            }
            if (rules.max_gpa && profile.gpa > rules.max_gpa) {
              failReasons.push(`✗ GPA: ${profile.gpa.toFixed(2)} above ${rules.max_gpa} maximum`);
            }
          }
        }

        // Major match - exact match from structured list
        if (rules.eligible_majors?.length > 0) {
          totalCriteria++;
          const majorMatch = rules.eligible_majors.includes(profile.major);
          if (majorMatch) {
            metCriteria++;
            matchReasons.push(`✓ Major: ${profile.major} is eligible`);
          } else {
            failReasons.push(`✗ Major: ${profile.major} not in eligible list`);
          }
        }

        // Calculate match percentage based on criteria met
        const matchPercentage = Math.round((metCriteria / totalCriteria) * 100);

        return {
          ...scholarship,
          matchPercentage,
          matchReasons: [...matchReasons, ...failReasons],
          eligibilityRules: rules,
        } as MatchedScholarship;
      })
      .filter((s): s is MatchedScholarship => s !== null)
      .sort((a, b) => b.matchPercentage - a.matchPercentage);
  };

  const formatSchool = (school: School): string => {
    const names: Record<School, string> = {
      morehouse: 'Morehouse',
      spelman: 'Spelman',
      clark_atlanta: 'Clark Atlanta',
      morris_brown: 'Morris Brown',
    };
    return names[school];
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-accent" />
            <span className="font-display text-2xl font-bold text-primary">Elevaid</span>
          </Link>
          <nav className="flex items-center gap-2">
            {userRole === 'admin' && (
              <Link to="/admin">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-1" />
                  Admin
                </Button>
              </Link>
            )}
            <Link to="/profile">
              <Button variant="ghost" size="sm">
                <User className="h-4 w-4 mr-1" />
                Profile
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" />
              Sign Out
            </Button>
          </nav>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-primary mb-2">
            Your Scholarship Matches
          </h1>
          <p className="text-muted-foreground">
            Based on your profile at {profile && formatSchool(profile.school)}, we found{' '}
            <span className="font-semibold text-accent">{matchedScholarships.length}</span> scholarships for you.
          </p>
        </div>

        {/* Scholarships Grid */}
        {matchedScholarships.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">
                No scholarships match your profile right now. Check back later!
              </p>
              <Link to="/profile">
                <Button variant="outline">Update Your Profile</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {matchedScholarships.map((scholarship) => (
              <Card key={scholarship.id} className="flex flex-col hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display text-lg leading-tight">
                      {scholarship.name}
                    </CardTitle>
                    <Badge 
                      variant={scholarship.matchPercentage >= 80 ? 'default' : 'secondary'}
                      className={scholarship.matchPercentage >= 80 ? 'bg-success' : ''}
                    >
                      {scholarship.matchPercentage}%
                    </Badge>
                  </div>
                  <CardDescription className="text-sm">
                    {scholarship.provider}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                    {scholarship.description}
                  </p>

                  <div className="flex items-center gap-4 text-sm mb-4">
                    <div className="flex items-center gap-1 text-accent">
                      <DollarSign className="h-4 w-4" />
                      <span className="font-semibold">
                        ${scholarship.award_amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(scholarship.deadline).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Match Score</span>
                      <span className="font-medium">{scholarship.matchPercentage}%</span>
                    </div>
                    <Progress value={scholarship.matchPercentage} className="h-2" />
                  </div>

                  <div className="mb-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Eligibility breakdown:</p>
                    <ul className="text-xs space-y-1">
                      {scholarship.matchReasons.map((reason, i) => (
                        <li 
                          key={i} 
                          className={reason.startsWith('✓') ? 'text-success' : 'text-destructive'}
                        >
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto">
                    <a
                      href={scholarship.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button className="w-full" size="sm">
                        Apply on External Site
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </a>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Opens scholarship website in new tab
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
