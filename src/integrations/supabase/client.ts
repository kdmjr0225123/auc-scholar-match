import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://swvfmitxxjrjuizaqvsn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dmZtaXR4eGpyanVpemFxdnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDYwNjUsImV4cCI6MjA4MTQyMjA2NX0.T2FsXrqs-5C-HGiL6YaMEx0JG_JTrSVdTro_zrBfY54';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
