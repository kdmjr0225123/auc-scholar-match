import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '@/styles/elevaid.css';
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
  GraduationCap, Loader2, Plus, Pencil, Trash2, ArrowLeft, Save, X, Search, Users
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { MAJORS } from '@/constants/majors';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StudentProfilesView from '@/components/admin/StudentProfilesView';

const SCHOOLS: { value: School; label: string }[] = [
  { value: 'morehouse', label: 'Morehouse' },
  { value: 'spelman', label: 'Spelman' },
  { value: 'clark_atlanta', label: 'Clark Atlanta' },
  { value: 'morris_brown', label: 'Morris Brown' },
];

const PIPELINE_BADGE: Record<string, { label: string; className: string }> = {
  approved: { label: 'Pipeline: Approved', className: 'bg-green-100 text-green-800 border-green-200' },
  quarantined: { label: 'Pipeline: Quarantined', className: 'bg-red-100 text-red-800 border-red-200' },
  pending: { label: 'Pipeline: Pending', className: 'bg-blue-100 text-blue-800 border-blue-200' },
};

const LINK_BADGE: Record<string, { label: string; className: string }> = {
  ok: { label: 'Link OK', className: 'bg-green-100 text-green-800 border-green-200' },
  broken: { label: 'Link Broken', className: 'bg-red-100 text-red-800 border-red-200' },
  redirected: { label: 'Link Redirected', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  captcha: { label: 'Captcha Wall', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  timeout: { label: 'Link Timeout', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  unchecked: { label: 'Link Unchecked', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  aggregator: { label: 'Third-Party Listing', className: 'bg-purple-100 text-purple-800 border-purple-200' },
};

interface ScholarshipWithRules extends Scholarship {
  eligibility_rules: EligibilityRule | null;
}

export default function Admin() {
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
    eligible_majors: [] as string[],
    graduation_year_min: '',
    graduation_year_max: '',
    keywords: '',
  });

  useEffect(() => {
    loadScholarships();

    const channel = supabase
      .channel('admin-scholarships-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarships' }, () => {
        loadScholarships();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_rules' }, () => {
        loadScholarships();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);


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
      eligible_majors: [],
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
      eligible_majors: rules?.eligible_majors || [],
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
        eligible_majors: formData.eligible_majors,
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#8A6810' }} />
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-background">
      <header className="ev-nav ev-nav-light">
        <div className="flex items-center gap-4">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <Link className="ev-logo" to="/" style={{ color: 'var(--ev-ink)' }}>
            <span className="ev-logo-mark"><GraduationCap size={15} strokeWidth={2.25} /></span>
            <span><em className="ev-logo-em">Elev</em>aid</span>
          </Link>
          <Badge variant="secondary" className="font-body font-medium">Admin</Badge>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" />
          Add Scholarship
        </Button>
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
                  <Label>Eligible Majors</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between font-normal h-auto min-h-10"
                      >
                        <span className="text-left truncate">
                          {formData.eligible_majors.length > 0 
                            ? `${formData.eligible_majors.length} major(s) selected`
                            : "Select eligible majors (all if none)"}
                        </span>
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search majors..." />
                        <CommandList>
                          <CommandEmpty>No major found.</CommandEmpty>
                          <CommandGroup className="max-h-64 overflow-y-auto">
                            {MAJORS.map((m) => (
                              <CommandItem
                                key={m}
                                value={m}
                                onSelect={() => {
                                  if (formData.eligible_majors.includes(m)) {
                                    setFormData({
                                      ...formData,
                                      eligible_majors: formData.eligible_majors.filter(maj => maj !== m),
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      eligible_majors: [...formData.eligible_majors, m],
                                    });
                                  }
                                }}
                              >
                                <Checkbox
                                  checked={formData.eligible_majors.includes(m)}
                                  className="mr-2"
                                />
                                {m}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {formData.eligible_majors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {formData.eligible_majors.map((m) => (
                        <Badge 
                          key={m} 
                          variant="secondary"
                          className="cursor-pointer"
                          onClick={() => setFormData({
                            ...formData,
                            eligible_majors: formData.eligible_majors.filter(maj => maj !== m),
                          })}
                        >
                          {m} Ã—
                        </Badge>
                      ))}
                    </div>
                  )}
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

        {/* Tabs for Scholarships and Student Profiles */}
        <Tabs defaultValue="scholarships" className="space-y-6">
          <TabsList>
            <TabsTrigger value="scholarships" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Scholarships
            </TabsTrigger>
            <TabsTrigger value="students" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Student Profiles
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="scholarships">
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
                        {scholarship.pipeline_status && (
                          <Badge className={PIPELINE_BADGE[scholarship.pipeline_status]?.className}>
                            {PIPELINE_BADGE[scholarship.pipeline_status]?.label ?? scholarship.pipeline_status}
                          </Badge>
                        )}
                        {scholarship.link_status && (
                          <Badge className={LINK_BADGE[scholarship.link_status]?.className}>
                            {LINK_BADGE[scholarship.link_status]?.label ?? scholarship.link_status}
                          </Badge>
                        )}
                      </div>
                      {scholarship.quarantine_reason && (
                        <p className="text-xs text-destructive mt-2">
                          Quarantined: {scholarship.quarantine_reason}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
          
          <TabsContent value="students">
            <StudentProfilesView />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
