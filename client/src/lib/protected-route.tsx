import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

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
  
  // Enhanced auth verification with fallback mechanisms
  useEffect(() => {
    // Only run once when loading completes
    if (!isLoading && !authChecked) {
      const hasCookies = document.cookie.includes('auth_success') || 
                        document.cookie.includes('chitfund.sid') ||
                        document.cookie.includes('manual_auth_success') ||
                        document.cookie.includes('user_info');
                        
      console.log(`ProtectedRoute (${path}): Auth check completed.`, { 
        isAuthenticated: !!user,
        hasCookies,
        cookiesFound: document.cookie ? document.cookie.split(';').map(c => c.trim().split('=')[0]) : []
      });
      
      // Check for sessionStorage backup if cookie auth is failing
      if (!user && !hasCookies) {
        try {
          // Match the same key used in the auth hook
          const SESSION_STORAGE_KEY = 'chitfund_user_session';
          const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
          
          if (savedSession) {
            console.log("Loaded user session from sessionStorage:", JSON.parse(savedSession).username);
            // Don't actually redirect - the useAuth hook should handle this
          }
        } catch (err) {
          console.error("Error reading from sessionStorage:", err);
        }
      }
      
      // If there's a cookie/user state mismatch, it may indicate a session issue
      if ((!user && hasCookies) || (user && !hasCookies)) {
        console.warn("Authentication state mismatch detected");
        // Don't show toast for now as it's disruptive while we fix the issue
      }
      
      setAuthChecked(true);
    }
  }, [isLoading, user, toast, path, authChecked]);

  return (
    <Route path={path}>
      {() => {
        // Show loading spinner while checking auth
        if (isLoading) {
          return (
            <div className="flex flex-col items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Verifying your session...</p>
            </div>
          );
        }

        // Redirect to auth page if not authenticated
        if (!user) {
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