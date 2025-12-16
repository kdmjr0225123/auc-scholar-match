import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { School } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Loader2, Upload, ArrowLeft } from 'lucide-react';

const SCHOOLS: { value: School; label: string }[] = [
  { value: 'morehouse', label: 'Morehouse College' },
  { value: 'spelman', label: 'Spelman College' },
  { value: 'clark_atlanta', label: 'Clark Atlanta University' },
  { value: 'morris_brown', label: 'Morris Brown College' },
];

const GRADUATION_YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + i);

export default function ProfileSetup() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [school, setSchool] = useState<School | ''>('');
  const [gpa, setGpa] = useState('');
  const [major, setMajor] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [existingProfile, setExistingProfile] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      loadExistingProfile();
    }
  }, [user]);

  const loadExistingProfile = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data && !error) {
      setExistingProfile(true);
      setSchool(data.school as School);
      setGpa(data.gpa.toString());
      setMajor(data.major);
      setGraduationYear(data.graduation_year.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !school) return;

    const gpaNum = parseFloat(gpa);
    if (isNaN(gpaNum) || gpaNum < 0 || gpaNum > 4) {
      toast({
        variant: 'destructive',
        title: 'Invalid GPA',
        description: 'Please enter a GPA between 0.00 and 4.00',
      });
      return;
    }

    setLoading(true);

    try {
      let resumeUrl = null;
      
      // Upload resume if provided
      if (resumeFile) {
        const fileExt = resumeFile.name.split('.').pop();
        if (fileExt?.toLowerCase() !== 'pdf') {
          toast({
            variant: 'destructive',
            title: 'Invalid file type',
            description: 'Please upload a PDF file only',
          });
          setLoading(false);
          return;
        }

        const filePath = `${user.id}/resume.pdf`;
        const { error: uploadError } = await supabase.storage
          .from('resumes')
          .upload(filePath, resumeFile, { upsert: true });

        if (uploadError) {
          console.error('Resume upload error:', uploadError);
        } else {
          resumeUrl = filePath;
        }
      }

      const profileData = {
        user_id: user.id,
        school: school as School,
        gpa: gpaNum,
        major,
        graduation_year: parseInt(graduationYear),
        resume_url: resumeUrl,
      };

      if (existingProfile) {
        const { error } = await supabase
          .from('student_profiles')
          .update(profileData)
          .eq('user_id', user.id);

        if (error) throw error;
        
        toast({
          title: 'Profile updated!',
          description: 'Your profile has been successfully updated.',
        });
      } else {
        const { error } = await supabase
          .from('student_profiles')
          .insert(profileData);

        if (error) throw error;
        
        toast({
          title: 'Profile created!',
          description: 'Your profile has been successfully created.',
        });
      }

      navigate('/dashboard');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save profile',
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-md mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>
        
        <div className="flex items-center justify-center gap-2 mb-8">
          <GraduationCap className="h-10 w-10 text-accent" />
          <span className="font-display text-3xl font-bold text-primary">Elevaid</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              {existingProfile ? 'Edit Your Profile' : 'Complete Your Profile'}
            </CardTitle>
            <CardDescription>
              Tell us about yourself so we can match you with scholarships.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="school">School *</Label>
                <Select value={school} onValueChange={(v) => setSchool(v as School)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your school" />
                  </SelectTrigger>
                  <SelectContent>
                    {SCHOOLS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gpa">GPA (0.00 - 4.00) *</Label>
                <Input
                  id="gpa"
                  type="number"
                  step="0.01"
                  min="0"
                  max="4"
                  placeholder="3.50"
                  value={gpa}
                  onChange={(e) => setGpa(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="major">Major *</Label>
                <Input
                  id="major"
                  type="text"
                  placeholder="Computer Science"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="graduationYear">Graduation Year *</Label>
                <Select value={graduationYear} onValueChange={setGraduationYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADUATION_YEARS.map((year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resume">Resume (PDF, optional)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="resume"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                    className="file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-accent file:text-accent-foreground hover:file:bg-accent/90"
                  />
                </div>
                {resumeFile && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    {resumeFile.name}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading || !school || !gpa || !major || !graduationYear}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {existingProfile ? 'Update Profile' : 'Complete Setup'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
