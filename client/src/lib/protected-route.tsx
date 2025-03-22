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
  
  // More robust authentication flow with environment detection
  useEffect(() => {
    if (!isLoading && !authChecked && !user) {
      console.log("Protected route: Checking authentication sources...");
      
      // Environment detection
      const isDevelopment = process.env.NODE_ENV !== 'production';
      const isReplit = typeof window !== 'undefined' && window.location.hostname.includes('replit');
      const isRender = typeof window !== 'undefined' && window.location.hostname.includes('onrender.com');
      const isCustomDomain = typeof window !== 'undefined' && 
                             (window.location.hostname.includes('srivasavifinancialservices.in') || 
                              window.location.hostname.includes('vasavi'));
                              
      console.log("Environment detection:", { isDevelopment, isReplit, isRender, isCustomDomain });
      
      // 1. Try to get session from sessionStorage first (works across all environments)
      try {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
          const userData = JSON.parse(savedSession);
          console.log("Found user session in storage:", { id: userData.id, role: userData.role });
          // Set the user directly through our authenticated method
          setManualUser(userData);
          setAuthChecked(true);
          return; // Exit early if we found a session
        }
      } catch (err) {
        console.error("Error reading from sessionStorage:", err);
      }
      
      // 2. Try to get session from the server if we're in a specific environment
      let apiHeaders: Record<string, string> = {
        'Accept': 'application/json'
      };
      
      // Customize headers based on environment
      if (isDevelopment && isReplit) {
        // For Replit in development mode, add dev mode flag
        console.log("Development environment on Replit detected - attempting auto-login");
        apiHeaders['X-Dev-Mode'] = 'true';
      } else if (isRender || isCustomDomain) {
        // For Render.com or production custom domain
        console.log("Production environment detected (Render/custom domain) - adding special headers");
        // These headers will be processed by the server for header-based auth
        apiHeaders['X-Special-Render-Access'] = 'true';
        apiHeaders['X-Deploy-Type'] = 'render';
        
        // Attempt to get user info from our storage if available
        try {
          const savedUserInfo = localStorage.getItem('user_info');
          if (savedUserInfo) {
            const storedUserInfo = JSON.parse(savedUserInfo);
            if (storedUserInfo.id && storedUserInfo.role) {
              apiHeaders['X-User-ID'] = storedUserInfo.id.toString();
              apiHeaders['X-User-Role'] = storedUserInfo.role;
              apiHeaders['X-User-Auth'] = 'true';
            }
          }
        } catch (err) {
          console.error("Error getting stored user info for headers:", err);
        }
      }
      
      // Make the API request with environment-specific headers
      fetch('/api/user', {
        credentials: 'include', // Always include credentials for cookie-based auth
        headers: apiHeaders
      })
      .then(res => {
        if (res.ok) return res.json();
        console.warn("Auth check response not OK:", res.status);
        return null;
      })
      .then(userData => {
        if (userData && userData.id) {
          console.log("Server authentication successful:", userData.username);
          setManualUser(userData);
          
          // Store in session & local storage for future auth checks
          try {
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userData));
            localStorage.setItem('user_info', JSON.stringify({
              id: userData.id,
              role: userData.role,
              username: userData.username
            }));
          } catch (err) {
            console.error("Error storing user data:", err);
          }
        } else {
          console.log("No user data returned from server");
          toast({
            title: "Authentication Required",
            description: "Please log in to access this page",
            variant: "destructive"
          });
        }
        setAuthChecked(true);
      })
      .catch(err => {
        console.warn("Authentication check failed:", err);
        toast({
          title: "Authentication Error",
          description: "Failed to verify your session. Please try logging in again.",
          variant: "destructive"
        });
        setAuthChecked(true);
      });
    }
  }, [isLoading, user, setManualUser, authChecked, toast]);

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