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

export type ReviewFixPriority = 'high' | 'medium' | 'low';

export interface ResumeReviewFix {
  priority: ReviewFixPriority;
  title: string;
  detail: string;
}

export interface ResumeReviewCategoryScores {
  ats_readability: number;
  clarity: number;
  impact: number;
  completeness: number;
}

export type ResumeEditType = 'cut' | 'rewrite' | 'add' | 'note';
export type ResumeEditCategory = 'ats_readability' | 'clarity' | 'impact' | 'completeness' | 'tailoring';

// The red-ink markup layer: each edit anchors to an exact substring of
// `resume_text` (copied verbatim by the model) so the frontend can locate
// and mark it up inline, rather than just listing advice in the abstract.
export interface ResumeEdit {
  type: ResumeEditType;
  anchor: string;
  replacement: string;
  comment: string;
  category: ResumeEditCategory;
  priority: ReviewFixPriority;
}

// Deterministic, code-computed facts about the resume — never LLM-judged.
// These are what let the score be explained ("here's what we actually
// found on the page") rather than just asserted, and they're used
// server-side to floor/cap the LLM's category scores so a subjective
// score can never contradict an objective, checkable fact.
export interface ResumeDeterministicChecks {
  has_contact_info: boolean;
  sections_found: string[];
  sections_expected: string[];
  quantified_terms_per_100_words: number;
  word_count: number;
  anchors_verified: number;
  anchors_total: number;
}

export interface ResumeReview {
  id: string;
  user_id: string;
  resume_path: string;
  overall_score: number;
  category_scores: ResumeReviewCategoryScores;
  fixes: ResumeReviewFix[];
  edits: ResumeEdit[];
  summary: string | null;
  tailored_note: string | null;
  resume_text: string | null;
  model: string;
  created_at: string;
  rubric_version: string;
  checks: ResumeDeterministicChecks | Record<string, never>;
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
      resume_reviews: {
        Row: ResumeReview;
        Insert: Omit<ResumeReview, 'id' | 'created_at'> & { id?: string; created_at?: string; };
        Update: Partial<ResumeReview>;
      };
    };
    Enums: {
      app_role: AppRole;
      school: School;
    };
  };
}
