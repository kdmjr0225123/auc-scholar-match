import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Mail, User, GraduationCap, BookOpen, Calendar, Clock, Hash } from 'lucide-react';
import { format } from 'date-fns';

interface StudentProfile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  school: string;
  gpa: number;
  major: string;
  graduation_year: number;
  resume_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

const SCHOOL_LABELS: Record<string, string> = {
  morehouse: 'Morehouse College',
  spelman: 'Spelman College',
  clark_atlanta: 'Clark Atlanta University',
  morris_brown: 'Morris Brown College',
};

export default function StudentProfilesView() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<StudentProfile[]>([]);

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('student_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error loading profiles',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const getResumeUrl = async (resumePath: string) => {
    const { data } = await supabase.storage
      .from('resumes')
      .createSignedUrl(resumePath, 3600);
    return data?.signedUrl;
  };

  const handleDownloadResume = async (profile: StudentProfile) => {
    if (!profile.resume_url) return;
    
    try {
      const signedUrl = await getResumeUrl(profile.resume_url);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error downloading resume',
        description: error.message,
      });
    }
  };

  const getFullName = (profile: StudentProfile) => {
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile.first_name) return profile.first_name;
    if (profile.last_name) return profile.last_name;
    return 'No name provided';
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'N/A';
    return format(new Date(timestamp), 'MMM d, yyyy h:mm a');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-primary">
          Student Profiles ({profiles.length})
        </h2>
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No student profiles yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {profiles.map((profile) => (
            <Card key={profile.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-4 w-4 text-accent" />
                      {getFullName(profile)}
                    </CardTitle>
                    {profile.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {profile.email}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                      <Hash className="h-3 w-3" />
                      {profile.user_id}
                    </p>
                  </div>
                  {profile.resume_url && (
                    <Badge variant="secondary" className="text-xs">
                      Has Resume
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Profile Filters Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Profile Filters (Used for Matching)</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm bg-muted/50 p-3 rounded-lg">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <GraduationCap className="h-3 w-3" />
                        School
                      </span>
                      <p className="font-medium truncate">{SCHOOL_LABELS[profile.school] || profile.school}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Graduation Year
                      </span>
                      <p className="font-medium">{profile.graduation_year}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">GPA</span>
                      <p className="font-medium">{profile.gpa.toFixed(1)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        Major
                      </span>
                      <p className="font-medium truncate">{profile.major}</p>
                    </div>
                  </div>
                </div>

                {/* Timestamps Section */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">Timestamps</h4>
                  <div className="grid grid-cols-2 gap-3 text-xs bg-muted/30 p-3 rounded-lg">
                    <div className="space-y-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created
                      </span>
                      <p className="font-medium">{formatTimestamp(profile.created_at)}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last Updated
                      </span>
                      <p className="font-medium">{formatTimestamp(profile.updated_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Resume Section */}
                {profile.resume_url && (
                  <div className="pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        <p className="font-medium text-foreground mb-1">Resume Available</p>
                        <p>{getFullName(profile)} • {profile.email || 'No email'}</p>
                        <p className="font-mono text-[10px]">{profile.user_id}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadResume(profile)}
                        className="text-accent hover:text-accent/80"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}