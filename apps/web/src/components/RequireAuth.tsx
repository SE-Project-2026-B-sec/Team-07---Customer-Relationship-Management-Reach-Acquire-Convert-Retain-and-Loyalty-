import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** Sends logged-out visitors to /login. Wraps every page except the login page. */
export function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}
