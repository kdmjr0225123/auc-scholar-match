import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AppRole } from '@/types/database';
import { identify, resetAnalytics } from '@/lib/analytics';
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: AppRole | null;
  isOwner: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
// Supabase falls back to the Site URL when a reset link's redirectTo isn't
// allow-listed. Catch that synchronously (before the client strips the hash)
// and carry the recovery tokens over to the reset form.
if (typeof window !== 'undefined' && window.location.pathname !== '/reset-password' &&
  /(^#|&)type=recovery(&|$)/.test(window.location.hash)) {
  window.location.replace(`/reset-password${window.location.hash}`);
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const isOwner = Boolean(user?.email && import.meta.env.VITE_OWNER_EMAIL &&
    user.email.toLowerCase() === import.meta.env.VITE_OWNER_EMAIL.toLowerCase());
  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error && data) {
        setUserRole(data.role as AppRole);
      } else {
        setUserRole('user');
      }
    } catch {
      setUserRole('user');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) identify(session.user.id);
      if (session?.user) void fetchUserRole(session.user.id);
      else {
        setUserRole(null);
        setLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // A password-reset link that Supabase sent back to the Site URL
        // (e.g. redirect URL not allow-listed) would otherwise leave the
        // student signed in on the landing page/console without ever
        // choosing a new password. Send them to the reset form instead.
        if (event === 'PASSWORD_RECOVERY' && window.location.pathname !== '/reset-password') {
          window.location.replace('/reset-password');
          return;
        }
        if (event === 'SIGNED_IN' && session?.user) identify(session.user.id);
        if (event === 'SIGNED_OUT') resetAnalytics();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setLoading(true);
          setTimeout(() => { void fetchUserRole(session.user.id); }, 0);
        } else {
          setUserRole(null);
          setLoading(false);
        }
      }
    );
    return () => subscription.unsubscribe();
  }, []);
  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    resetAnalytics();
    setUser(null);
    setSession(null);
    setUserRole(null);
  };
  return (
    <AuthContext.Provider value={{ user, session, loading, userRole, isOwner, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
