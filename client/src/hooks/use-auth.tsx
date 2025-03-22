import { createContext, ReactNode, useContext, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// For session backup in case cookies fail
const SESSION_STORAGE_KEY = 'chitfund_user_session';

type AuthContextType = {
  user: SelectUser | null; // User is either a valid user object or null (when not authenticated)
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  setManualUser: (user: SelectUser) => void; // Manual override to set the user
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [sessionStorageUser, setSessionStorageUser] = useState<SelectUser | null>(null);
  
  // Load user from all possible storage locations (cookies, sessionStorage, localStorage)
  useEffect(() => {
    try {
      console.log("Checking for existing authentication on page load");
      
      // Get deployment environment details
      const isRender = window.location.hostname.includes('.onrender.com');
      const isCustomDomain = window.location.hostname === 'srivasavifinancialservices.in' || 
                            window.location.hostname === 'www.srivasavifinancialservices.in';
      
      if (isRender || isCustomDomain) {
        console.log(`Initial auth check for special deployment: ${window.location.hostname}`);
      }
      
      // Authentication sources to check in priority order
      let userData = null;
      
      // Source 1: Check cookies first
      const userInfoCookie = document.cookie
        .split(';')
        .find(cookie => cookie.trim().startsWith('user_info='));
        
      if (userInfoCookie) {
        try {
          const userInfoValue = userInfoCookie.split('=')[1];
          if (userInfoValue) {
            userData = JSON.parse(decodeURIComponent(userInfoValue));
            console.log("Found user session in cookies:", userData?.username);
          }
        } catch (cookieErr) {
          console.error("Error parsing user_info cookie:", cookieErr);
        }
      }
      
      // Source 2: Check sessionStorage if no cookies
      if (!userData) {
        const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (savedSession) {
          userData = JSON.parse(savedSession);
          console.log("Found user session in sessionStorage:", userData?.username);
        }
      }
      
      // Source 3: Check localStorage as last resort (for cross-domain environments)
      if (!userData && (isRender || isCustomDomain)) {
        try {
          const localStorageKey = 'chitfund_render_user';
          const localData = localStorage.getItem(localStorageKey);
          if (localData) {
            userData = JSON.parse(localData);
            console.log("Found user session in localStorage (cross-domain fallback):", userData?.username);
          }
        } catch (localErr) {
          console.error("Error accessing localStorage:", localErr);
        }
      }
      
      // If we found user data in any source, set it
      if (userData) {
        // Set the user in state and query cache
        setSessionStorageUser(userData);
        queryClient.setQueryData(["/api/user"], userData);
        
        // Ensure data is stored in all places for redundancy
        try {
          // Save to sessionStorage for fast access
          sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userData));
          
          // For Render environments, also save to localStorage
          if (isRender || isCustomDomain) {
            localStorage.setItem('chitfund_render_user', JSON.stringify(userData));
          }
          
          console.log("Authentication data synchronized across available storage mechanisms");
        } catch (err) {
          console.warn("Error synchronizing auth data:", err);
        }
      } else {
        console.log("No existing authentication found in any storage location");
      }
    } catch (err) {
      console.error("Error during initial authentication check:", err);
    }
  }, []);
  const {
    data: user,
    error,
    isLoading,
    refetch: refetchUser
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      console.log('Fetching current user session');
      
      // Check for session storage first as our most reliable source
      if (sessionStorageUser) {
        console.log('Using session from sessionStorage:', sessionStorageUser.username);
        return sessionStorageUser;
      }
      
      // Check cookies as a secondary authentication method
      const hasAuthCookie = document.cookie.includes('auth_success');
      const hasManualAuthCookie = document.cookie.includes('manual_auth_success');
      
      if (!hasAuthCookie && !hasManualAuthCookie) {
        console.log('No auth cookie found, assuming not logged in');
        return null;
      }
      
      console.log('Auth cookie found, verifying session with server');
      
      try {
        const response = await fetch('/api/user', {
          credentials: 'include', // Important: include cookies with the request
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache, no-store'
          }
        });
        
        console.log('Session check response status:', response.status);
        
        if (!response.ok) {
          if (response.status === 401) {
            console.log('Session not authenticated or expired (401)');
            
            // Clear local cookies if they exist but the server rejects them
            // This helps with cookie/session mismatch
            const hasUserInfoCookie = document.cookie.includes('user_info=');
            if (hasAuthCookie || hasManualAuthCookie || hasUserInfoCookie) {
              console.log('Clearing stale client-side cookies');
              // Standard cookies (no secure/sameSite flags)
              document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
              
              // Also try with secure flag variants
              document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
              document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
              document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
              document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
              document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
            }
            
            return null;
          }
          throw new Error(`HTTP error: ${response.status}`);
        }
        
        const userData = await response.json();
        
        if (!userData.authenticated) {
          console.log('Server did not confirm authentication');
          return null;
        }
        
        console.log('User session validated:', userData.id, userData.username);
        return userData;
      } catch (err) {
        console.error('Error fetching user session:', err);
        return null;
      }
    },
    staleTime: 60000, // 1 minute - keep data fresh for 1 minute
    gcTime: 3600000, // 1 hour - keep data in cache for an hour
    refetchInterval: 300000, // Re-check session every 5 minutes
    refetchOnWindowFocus: true, // Re-check when tab/window gets focus
    // Explicitly initialize to null to fix type issue
    initialData: null,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      // For security, don't log credentials
      console.log("Processing login");
      try {
        return await apiRequest<SelectUser>({
          url: "/api/login",
          method: "POST",
          body: credentials,
        });
      } catch (error) {
        console.error("Login error:", error);
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      console.log("Setting user data in cache");
      queryClient.setQueryData(["/api/user"], user);
      
      // Update session state
      setSessionStorageUser(user);
      
      // Get deployment environment details
      const isRender = window.location.hostname.includes('.onrender.com');
      const isCustomDomain = window.location.hostname === 'srivasavifinancialservices.in' || 
                            window.location.hostname === 'www.srivasavifinancialservices.in';
      
      // Enable additional logging for special environments
      if (isRender || isCustomDomain) {
        console.log(`Login in special deployment environment:`, {
          isRender,
          isCustomDomain,
          hostname: window.location.hostname
        });
      }
      
      try {
        // Create auth info object for storage
        const userAuthInfo = {
          id: user.id,
          username: user.username, 
          role: user.role,
          fullName: user.fullName
        };
        
        // 1. Save to sessionStorage (works in same domain)
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userAuthInfo));
        console.log("Saved user session to sessionStorage");
        
        // 2. Set manual client-side cookies 
        const cookieExpiration = new Date();
        cookieExpiration.setTime(cookieExpiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
        
        // Cookie options based on environment
        const cookieOptions = isRender || isCustomDomain 
          ? `path=/; expires=${cookieExpiration.toUTCString()}; SameSite=None; Secure`
          : `path=/; expires=${cookieExpiration.toUTCString()}`;
        
        // Set authentication flag cookie
        document.cookie = `manual_auth_success=true; ${cookieOptions}`;
        
        // Set user info cookie for fallback authentication
        const userInfoCookie = JSON.stringify(userAuthInfo);
        document.cookie = `user_info=${encodeURIComponent(userInfoCookie)}; ${cookieOptions}`;
        
        // 3. For Render: Also save to localStorage as additional fallback
        if (isRender || isCustomDomain) {
          const localStorageKey = 'chitfund_render_user';
          localStorage.setItem(localStorageKey, JSON.stringify(userAuthInfo));
          console.log("Saved user data to localStorage for cross-domain support");
        }
        
        console.log("Authentication data saved to multiple storage mechanisms:", {
          sessionStorage: "Saved",
          cookies: "Saved",
          localStorage: isRender || isCustomDomain ? "Saved" : "Not needed"
        });
        
        // Update local state
        setSessionStorageUser(user);
      } catch (err) {
        console.error("Failed to save session to storage:", err);
      }
      
      // Clear and refetch any relevant queries
      queryClient.invalidateQueries({queryKey: ["/api/chitfunds"]});
      queryClient.invalidateQueries({queryKey: ["/api/users"]});
      queryClient.invalidateQueries({queryKey: ["/api/member-groups"]});
    },
    onError: (error: Error) => {
      console.error("Login mutation error:", error);
      let errorMessage = "Username or password incorrect";
      
      // More detailed error handling
      if (error.message.includes("500")) {
        errorMessage = "Server error. Please try again later.";
      } else if (error.message.includes("404")) {
        errorMessage = "Login service unavailable. Please try again later.";
      } else if (error.message.includes("401")) {
        console.log("Login credentials incorrect.");
        errorMessage = "Username or password incorrect. Please contact your administrator if you need access.";
      } else if (error.message.includes("Network Error") || error.message.includes("Failed to fetch")) {
        errorMessage = "Network error. Please check your connection and try again.";
      }
      
      toast({
        title: "Login failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const data = await apiRequest<SelectUser>({
        url: "/api/register",
        method: "POST",
        body: credentials,
      });
      return data;
    },
    onSuccess: (user: SelectUser) => {
      console.log("Setting user data in cache after registration");
      queryClient.setQueryData(["/api/user"], user);
      
      // Update session state
      setSessionStorageUser(user);
      
      // Get deployment environment details
      const isRender = window.location.hostname.includes('.onrender.com');
      const isCustomDomain = window.location.hostname === 'srivasavifinancialservices.in' || 
                            window.location.hostname === 'www.srivasavifinancialservices.in';
      
      try {
        // Create auth info object
        const userAuthInfo = {
          id: user.id,
          username: user.username, 
          role: user.role,
          fullName: user.fullName
        };
        
        // 1. Save to sessionStorage (primary storage for same domain)
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userAuthInfo));
        console.log("Saved user session to sessionStorage");
        
        // 2. Set cookies with environment-specific options
        const cookieExpiration = new Date();
        cookieExpiration.setTime(cookieExpiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
        
        // Cookie options based on environment
        const cookieOptions = isRender || isCustomDomain 
          ? `path=/; expires=${cookieExpiration.toUTCString()}; SameSite=None; Secure`
          : `path=/; expires=${cookieExpiration.toUTCString()}`;
        
        // Set auth cookies
        document.cookie = `manual_auth_success=true; ${cookieOptions}`;
        
        const userInfoCookie = JSON.stringify(userAuthInfo);
        document.cookie = `user_info=${encodeURIComponent(userInfoCookie)}; ${cookieOptions}`;
        
        // 3. For Render: Save to localStorage as additional fallback for cross-domain
        if (isRender || isCustomDomain) {
          const localStorageKey = 'chitfund_render_user';
          localStorage.setItem(localStorageKey, JSON.stringify(userAuthInfo));
          console.log("Saved user data to localStorage for cross-domain support");
        }
        
        console.log("Registration successful - auth data stored in multiple places");
      } catch (err) {
        console.error("Failed to save session to storage:", err);
      }
      
      toast({
        title: "Registration successful",
        description: "Your account has been created.",
      });
    },
    onError: (error: Error) => {
      console.error("Registration error:", error);
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<void>({
        url: "/api/logout", 
        method: "POST"
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      
      // Get deployment environment details
      const isRender = window.location.hostname.includes('.onrender.com');
      const isCustomDomain = window.location.hostname === 'srivasavifinancialservices.in' || 
                            window.location.hostname === 'www.srivasavifinancialservices.in';
      
      try {
        // 1. Clear sessionStorage
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        console.log("Cleared user session from sessionStorage");
        
        // 2. Clear localStorage if in cross-domain environment
        if (isRender || isCustomDomain) {
          const localStorageKey = 'chitfund_render_user';
          localStorage.removeItem(localStorageKey);
          console.log("Cleared user data from localStorage (cross-domain support)");
        }
        
        // 3. Clear all cookies - use multiple formats to ensure they're cleared
        // Standard cookies (no secure/sameSite flags)
        document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        
        // Also try with secure flag variants for cross-domain support
        document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=None; Secure;';
        
        // Update local state
        setSessionStorageUser(null);
        
        console.log("Logout successful - cleared all authentication data");
      } catch (err) {
        console.error("Failed to clear auth data during logout:", err);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Ensure user is always correctly typed as SelectUser | null
  const safeUser: SelectUser | null = user || null;
  
  // Function to manually set user data (for direct login scenarios)
  const setManualUser = (userData: SelectUser) => {
    console.log("Manually setting user data:", userData.username);
    
    // Set in query cache
    queryClient.setQueryData(["/api/user"], userData);
    
    // Update session state
    setSessionStorageUser(userData);
    
    // Get deployment environment details
    const isRender = window.location.hostname.includes('.onrender.com');
    const isCustomDomain = window.location.hostname === 'srivasavifinancialservices.in' || 
                          window.location.hostname === 'www.srivasavifinancialservices.in';
    
    try {
      // Create user auth info object
      const userAuthInfo = {
        id: userData.id,
        username: userData.username, 
        role: userData.role,
        fullName: userData.fullName
      };
      
      // 1. Save to sessionStorage (main storage for same domain)
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userAuthInfo));
      
      // 2. Set cookies with proper options for the environment
      const cookieExpiration = new Date();
      cookieExpiration.setTime(cookieExpiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
      
      // Set cookie options based on environment
      const cookieOptions = isRender || isCustomDomain
        ? `path=/; expires=${cookieExpiration.toUTCString()}; SameSite=None; Secure`
        : `path=/; expires=${cookieExpiration.toUTCString()}`;
      
      // Set auth cookies
      document.cookie = `manual_auth_success=true; ${cookieOptions}`;
      const userInfoCookie = JSON.stringify(userAuthInfo);
      document.cookie = `user_info=${encodeURIComponent(userInfoCookie)}; ${cookieOptions}`;
      
      // 3. For Render: Also save to localStorage for cross-domain support
      if (isRender || isCustomDomain) {
        const localStorageKey = 'chitfund_render_user';
        localStorage.setItem(localStorageKey, JSON.stringify(userAuthInfo));
        console.log("Saved user data to localStorage for cross-domain environment");
      }
      
      // Display welcome message
      toast({
        title: "Logged in",
        description: `Welcome, ${userData.fullName || userData.username}!`,
      });
      
      // Invalidate queries that might need refreshing with the new user
      queryClient.invalidateQueries({queryKey: ["/api/chitfunds"]});
      queryClient.invalidateQueries({queryKey: ["/api/users"]});
      
      console.log("Manual login successful - stored auth data across multiple mechanisms");
    } catch (err) {
      console.error("Failed to save manual user data:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user: safeUser,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        setManualUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}