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
  
  // Enhanced auth verification
  useEffect(() => {
    // Only run once when loading completes
    if (!isLoading && !authChecked) {
      const hasCookies = document.cookie.includes('auth_success') || 
                        document.cookie.includes('chitfund.sid');
      console.log(`ProtectedRoute (${path}): Auth check completed.`, { 
        isAuthenticated: !!user,
        hasCookies,
        cookiesFound: document.cookie ? document.cookie.split(';').map(c => c.trim().split('=')[0]) : []
      });
      
      // If there's a cookie/user state mismatch, it may indicate a session issue
      if ((!user && hasCookies) || (user && !hasCookies)) {
        console.warn("Authentication state mismatch detected");
        toast({
          title: "Authentication Issue",
          description: "Your session appears to be in an inconsistent state. Try logging in again.",
          variant: "destructive",
        });
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