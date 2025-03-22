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
  const { user, isLoading, setManualUser } = useAuth();
  const { toast } = useToast();
  const [authChecked, setAuthChecked] = useState(false);
  
  // Simplified authentication flow - check session storage once
  useEffect(() => {
    if (!isLoading && !authChecked && !user) {
      // Try to get session from sessionStorage if no user is already set
      try {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
          const userData = JSON.parse(savedSession);
          console.log("Found user session in storage:", { id: userData.id, role: userData.role });
          // Set the user directly through our authenticated method
          setManualUser(userData);
        }
      } catch (err) {
        console.error("Error reading from sessionStorage:", err);
      }
      
      // Also check if we're in development environment
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const isReplit = typeof window !== 'undefined' && 
                     window.location.hostname.includes('replit');
      
      if (isDevelopment && isReplit) {
        console.log("Development environment detected - attempting auto-login");
        // For development only: Try to get an admin session from the server
        fetch('/api/user', {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Dev-Mode': 'true'
          }
        })
        .then(res => {
          if (res.ok) return res.json();
          return null;
        })
        .then(userData => {
          if (userData && userData.id) {
            console.log("Auto-logged in as:", userData.username);
            setManualUser(userData);
          }
        })
        .catch(err => {
          console.warn("Auto-login failed:", err);
        });
      }
      
      setAuthChecked(true);
    }
  }, [isLoading, user, setManualUser, authChecked]);

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

        // Simplified check - only rely on the useAuth user state
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