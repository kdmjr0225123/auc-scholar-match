import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/database';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: AppRole;
  ownerOnly?: boolean;
}

export default function ProtectedRoute({ children, requiredRole, ownerOnly = false }: ProtectedRouteProps) {
  const { user, loading, userRole, isOwner } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const studentPreview = isOwner && userRole === 'admin' && location.pathname === '/dashboard' && new URLSearchParams(location.search).get('preview') === '1';

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // A signed-out visitor landing here already has an account (they're
        // bouncing off a protected page) — send them to sign-in, not the
        // bare /auth route, which defaults to the new-visitor signup form.
        navigate('/auth?mode=signin');
      } else if (ownerOnly && (!isOwner || userRole !== 'admin')) {
        navigate('/dashboard', { replace: true });
      } else if (requiredRole && userRole !== requiredRole) {
        navigate('/dashboard');
      } else if (isOwner && userRole === 'admin' && !ownerOnly && !studentPreview) {
        navigate('/console', { replace: true });
      }
    }
  }, [user, loading, userRole, requiredRole, ownerOnly, isOwner, studentPreview, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#8A6810' }} />
      </div>
    );
  }

  if (!user) return null;
  if (ownerOnly && (!isOwner || userRole !== 'admin')) return null;
  if (requiredRole && userRole !== requiredRole) return null;
  if (isOwner && userRole === 'admin' && !ownerOnly && !studentPreview) return null;

  return <>{children}</>;
}
