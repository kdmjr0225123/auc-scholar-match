import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Loader2, FileText, Mail, User, GraduationCap, BookOpen, Calendar } from 'lucide-react';

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
      .createSignedUrl(resumePath, 3600); // 1 hour expiry
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <Card key={profile.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <User className="h-4 w-4 text-accent" />
                      {getFullName(profile)}
                    </CardTitle>
                    {profile.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Mail className="h-3 w-3" />
                        {profile.email}
                      </p>
                    )}
                  </div>
                  {profile.resume_url && (
                    <Badge variant="secondary" className="text-xs">
                      Resume
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <GraduationCap className="h-3 w-3" />
                    <span className="truncate">{SCHOOL_LABELS[profile.school] || profile.school}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    <span>Class of {profile.graduation_year}</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-3 w-3 text-muted-foreground" />
                  <span className="truncate">{profile.major}</span>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <Badge variant="outline">GPA: {profile.gpa.toFixed(2)}</Badge>
                  
                  {profile.resume_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadResume(profile)}
                      className="text-accent hover:text-accent/80"
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      View Resume
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
