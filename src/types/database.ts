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
    };
    Enums: {
      app_role: AppRole;
      school: School;
    };
  };
}
