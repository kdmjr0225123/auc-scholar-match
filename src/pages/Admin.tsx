import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Scholarship, EligibilityRule, School } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  GraduationCap, Loader2, Plus, Pencil, Trash2, ArrowLeft, Save, X 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';

const SCHOOLS: { value: School; label: string }[] = [
  { value: 'morehouse', label: 'Morehouse' },
  { value: 'spelman', label: 'Spelman' },
  { value: 'clark_atlanta', label: 'Clark Atlanta' },
  { value: 'morris_brown', label: 'Morris Brown' },
];

interface ScholarshipWithRules extends Scholarship {
  eligibility_rules: EligibilityRule | null;
}

export default function Admin() {
  const { user, loading: authLoading, userRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [scholarships, setScholarships] = useState<ScholarshipWithRules[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    provider: '',
    award_amount: '',
    deadline: '',
    application_url: '',
    is_active: true,
    // Eligibility rules
    min_gpa: '',
    max_gpa: '',
    eligible_schools: [] as School[],
    eligible_majors: '',
    graduation_year_min: '',
    graduation_year_max: '',
    keywords: '',
  });

  useEffect(() => {
    if (!authLoading) {
      if (!user) {
        navigate('/auth');
      } else if (userRole !== 'admin') {
        toast({
          variant: 'destructive',
          title: 'Access denied',
          description: 'You do not have admin permissions.',
        });
        navigate('/dashboard');
      }
    }
  }, [user, authLoading, userRole, navigate]);

  useEffect(() => {
    if (userRole === 'admin') {
      loadScholarships();
    }
  }, [userRole]);

  const loadScholarships = async () => {
    try {
      const { data, error } = await supabase
        .from('scholarships')
        .select(`*, eligibility_rules (*)`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScholarships(data as ScholarshipWithRules[]);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      provider: '',
      award_amount: '',
      deadline: '',
      application_url: '',
      is_active: true,
      min_gpa: '',
      max_gpa: '',
      eligible_schools: [],
      eligible_majors: '',
      graduation_year_min: '',
      graduation_year_max: '',
      keywords: '',
    });
    setEditingId(null);
  };

  const handleEdit = (scholarship: ScholarshipWithRules) => {
    const rules = scholarship.eligibility_rules;
    setFormData({
      name: scholarship.name,
      description: scholarship.description,
      provider: scholarship.provider,
      award_amount: scholarship.award_amount.toString(),
      deadline: scholarship.deadline,
      application_url: scholarship.application_url,
      is_active: scholarship.is_active,
      min_gpa: rules?.min_gpa?.toString() || '',
      max_gpa: rules?.max_gpa?.toString() || '',
      eligible_schools: (rules?.eligible_schools as School[]) || [],
      eligible_majors: rules?.eligible_majors?.join(', ') || '',
      graduation_year_min: rules?.graduation_year_min?.toString() || '',
      graduation_year_max: rules?.graduation_year_max?.toString() || '',
      keywords: rules?.keywords?.join(', ') || '',
    });
    setEditingId(scholarship.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const scholarshipData = {
        name: formData.name,
        description: formData.description,
        provider: formData.provider,
        award_amount: parseFloat(formData.award_amount),
        deadline: formData.deadline,
        application_url: formData.application_url,
        is_active: formData.is_active,
      };

      let scholarshipId = editingId;

      if (editingId) {
        const { error } = await supabase
          .from('scholarships')
          .update(scholarshipData)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('scholarships')
          .insert(scholarshipData)
          .select()
          .single();
        if (error) throw error;
        scholarshipId = data.id;
      }

      // Upsert eligibility rules
      const rulesData = {
        scholarship_id: scholarshipId,
        min_gpa: formData.min_gpa ? parseFloat(formData.min_gpa) : null,
        max_gpa: formData.max_gpa ? parseFloat(formData.max_gpa) : null,
        eligible_schools: formData.eligible_schools,
        eligible_majors: formData.eligible_majors.split(',').map(s => s.trim()).filter(Boolean),
        graduation_year_min: formData.graduation_year_min ? parseInt(formData.graduation_year_min) : null,
        graduation_year_max: formData.graduation_year_max ? parseInt(formData.graduation_year_max) : null,
        keywords: formData.keywords.split(',').map(s => s.trim()).filter(Boolean),
      };

      const { error: rulesError } = await supabase
        .from('eligibility_rules')
        .upsert(rulesData, { onConflict: 'scholarship_id' });

      if (rulesError) throw rulesError;

      toast({
        title: editingId ? 'Scholarship updated' : 'Scholarship created',
        description: 'Changes saved successfully.',
      });

      resetForm();
      setShowForm(false);
      loadScholarships();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scholarship?')) return;

    try {
      const { error } = await supabase
        .from('scholarships')
        .delete()
        .eq('id', id);
      if (error) throw error;

      toast({ title: 'Scholarship deleted' });
      loadScholarships();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('scholarships')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
      loadScholarships();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  if (authLoading || (loading && userRole === 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <GraduationCap className="h-8 w-8 text-accent" />
              <span className="font-display text-2xl font-bold text-primary">Admin</span>
            </div>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />
            Add Scholarship
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Form Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                {editingId ? 'Edit Scholarship' : 'Create Scholarship'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Provider *</Label>
                  <Input
                    value={formData.provider}
                    onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Award Amount ($) *</Label>
                  <Input
                    type="number"
                    value={formData.award_amount}
                    onChange={(e) => setFormData({ ...formData, award_amount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Deadline *</Label>
                  <Input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Application URL *</Label>
                  <Input
                    type="url"
                    value={formData.application_url}
                    onChange={(e) => setFormData({ ...formData, application_url: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Eligibility Rules</h3>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Min GPA</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="4"
                      value={formData.min_gpa}
                      onChange={(e) => setFormData({ ...formData, min_gpa: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Max GPA</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="4"
                      value={formData.max_gpa}
                      onChange={(e) => setFormData({ ...formData, max_gpa: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <Label>Eligible Schools</Label>
                  <div className="flex flex-wrap gap-4">
                    {SCHOOLS.map((school) => (
                      <div key={school.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={school.value}
                          checked={formData.eligible_schools.includes(school.value)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({
                                ...formData,
                                eligible_schools: [...formData.eligible_schools, school.value],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                eligible_schools: formData.eligible_schools.filter(s => s !== school.value),
                              });
                            }
                          }}
                        />
                        <Label htmlFor={school.value} className="text-sm">
                          {school.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 mt-4">
                  <div className="space-y-2">
                    <Label>Graduation Year Min</Label>
                    <Input
                      type="number"
                      value={formData.graduation_year_min}
                      onChange={(e) => setFormData({ ...formData, graduation_year_min: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Graduation Year Max</Label>
                    <Input
                      type="number"
                      value={formData.graduation_year_max}
                      onChange={(e) => setFormData({ ...formData, graduation_year_max: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2 mt-4">
                  <Label>Eligible Majors (comma-separated)</Label>
                  <Input
                    value={formData.eligible_majors}
                    onChange={(e) => setFormData({ ...formData, eligible_majors: e.target.value })}
                    placeholder="Computer Science, Engineering, Business"
                  />
                </div>

                <div className="space-y-2 mt-4">
                  <Label>Keywords (comma-separated)</Label>
                  <Input
                    value={formData.keywords}
                    onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                    placeholder="STEM, leadership, community service"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label>Active</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button type="button" variant="outline" onClick={() => { resetForm(); setShowForm(false); }}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Scholarships List */}
        <div className="space-y-4">
          {scholarships.length === 0 ? (
            <Card className="text-center py-12">
              <CardContent>
                <p className="text-muted-foreground">No scholarships yet. Create your first one!</p>
              </CardContent>
            </Card>
          ) : (
            scholarships.map((scholarship) => (
              <Card key={scholarship.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="font-display text-lg flex items-center gap-2">
                        {scholarship.name}
                        <Badge variant={scholarship.is_active ? 'default' : 'secondary'}>
                          {scholarship.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">{scholarship.provider}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={scholarship.is_active}
                        onCheckedChange={() => toggleActive(scholarship.id, scholarship.is_active)}
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(scholarship)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(scholarship.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">{scholarship.description}</p>
                  <div className="flex flex-wrap gap-2 text-sm">
                    <Badge variant="outline">${scholarship.award_amount.toLocaleString()}</Badge>
                    <Badge variant="outline">Deadline: {new Date(scholarship.deadline).toLocaleDateString()}</Badge>
                    {scholarship.eligibility_rules?.min_gpa && (
                      <Badge variant="outline">Min GPA: {scholarship.eligibility_rules.min_gpa}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
