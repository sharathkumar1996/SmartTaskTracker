import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

// Session storage key must match the one in use-auth.tsx
const SESSION_STORAGE_KEY = 'chitfund_user_session';

type ProtectedRouteProps = {
  path: string;
  component: React.ComponentType;
};

export function ProtectedRoute({
  path,
  component: Component,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [authChecked, setAuthChecked] = useState(false);
  const [sessionUser, setSessionUser] = useState<any>(null);
  
  // Use both normal auth and session storage for enhanced reliability
  useEffect(() => {
    // Only run once when loading completes
    if (!isLoading && !authChecked) {
      // First try to get session from sessionStorage
      try {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
          const userData = JSON.parse(savedSession);
          console.log("Found user session in storage:", { id: userData.id, role: userData.role });
          setSessionUser(userData);
        }
      } catch (err) {
        console.error("Error reading from sessionStorage:", err);
      }
      
      // Also check for any relevant cookies
      const hasCookies = document.cookie.includes('auth_success') || 
                        document.cookie.includes('chitfund.sid') ||
                        document.cookie.includes('manual_auth_success') ||
                        document.cookie.includes('user_info');
                        
      console.log(`ProtectedRoute (${path}): Auth check completed.`, { 
        isAuthenticated: !!user || !!sessionUser,
        hasCookies,
        cookiesFound: document.cookie ? document.cookie.split(';').map(c => c.trim().split('=')[0]) : []
      });
      
      setAuthChecked(true);
    }
  }, [isLoading, user, toast, path, authChecked, sessionUser]);

  return (
    <Route path={path}>
      {() => {
        // Show loading spinner while checking auth
        if (isLoading || !authChecked) {
          return (
            <div className="flex flex-col items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Verifying your session...</p>
            </div>
          );
        }

        // Check for authentication from any source (React Query or session storage)
        const isAuthenticated = !!user || !!sessionUser;
        
        // Redirect to auth page if not authenticated
        if (!isAuthenticated) {
          console.log(`ProtectedRoute (${path}): No user found, redirecting to auth page`);
          return <Redirect to="/auth" />;
        }

        // User is authenticated, render the component
        console.log(`ProtectedRoute (${path}): Authentication verified, rendering component`);
        return <Component />;
      }}
    </Route>
  );
}