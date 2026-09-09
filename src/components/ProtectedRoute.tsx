import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { user, loading, userRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // A signed-out visitor landing here already has an account (they're
        // bouncing off a protected page) — send them to sign-in, not the
        // bare /auth route, which defaults to the new-visitor signup form.
        navigate('/auth?mode=signin');
      } else if (requiredRole && userRole !== requiredRole) {
        navigate('/dashboard');
      }
    }
  }, [user, loading, userRole, requiredRole, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#8A6810' }} />
      </div>
    );
  }

  if (!user) return null;
  if (requiredRole && userRole !== requiredRole) return null;

  return <>{children}</>;
}
