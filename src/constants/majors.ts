// Structured list of majors for AUC schools
// This ensures deterministic matching between students and scholarships

export const MAJORS = [
  // Business & Economics
  'Accounting',
  'Business Administration',
  'Economics',
  'Finance',
  'Marketing',
  'Management',
  'Entrepreneurship',
  'International Business',
  
  // STEM
  'Biology',
  'Chemistry',
  'Computer Science',
  'Mathematics',
  'Physics',
  'Engineering',
  'Computer Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Data Science',
  'Information Technology',
  'Cybersecurity',
  
  // Health Sciences
  'Pre-Medicine',
  'Nursing',
  'Public Health',
  'Health Sciences',
  'Kinesiology',
  'Nutrition',
  
  // Social Sciences
  'Psychology',
  'Sociology',
  'Political Science',
  'Criminal Justice',
  'Social Work',
  'Anthropology',
  'International Relations',
  
  // Humanities
  'English',
  'History',
  'Philosophy',
  'Religious Studies',
  'African American Studies',
  'Women\'s Studies',
  'Spanish',
  'French',
  
  // Arts & Communication
  'Art',
  'Music',
  'Theater',
  'Film Studies',
  'Communications',
  'Journalism',
  'Mass Media Arts',
  'Public Relations',
  
  // Education
  'Education',
  'Early Childhood Education',
  'Elementary Education',
  'Secondary Education',
  'Special Education',
  
  // Other
  'Environmental Science',
  'Urban Studies',
  'Interdisciplinary Studies',
  'Liberal Arts',
  'Undeclared',
] as const;

export type Major = typeof MAJORS[number];
