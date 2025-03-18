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
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [sessionStorageUser, setSessionStorageUser] = useState<SelectUser | null>(null);
  
  // Load user from sessionStorage on initial render
  useEffect(() => {
    try {
      const savedSession = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (savedSession) {
        const userData = JSON.parse(savedSession);
        setSessionStorageUser(userData);
        // Prime the query cache with this data
        queryClient.setQueryData(["/api/user"], userData);
        console.log("Loaded user session from sessionStorage:", userData?.username);
      }
    } catch (err) {
      console.error("Error loading session from sessionStorage:", err);
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
        const data = await apiRequest<SelectUser>({
          url: "/api/login",
          method: "POST",
          body: credentials,
        });
        console.log("Login response received");
        return data;
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
      
      // Store session in sessionStorage as a fallback
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
        console.log("Saved user session to sessionStorage");
        
        // Set manual client-side cookies since the server ones might not work
        const cookieExpiration = new Date();
        cookieExpiration.setTime(cookieExpiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
        
        // Set authentication flag cookie
        document.cookie = `manual_auth_success=true; path=/; expires=${cookieExpiration.toUTCString()}`;
        
        // Set user info cookie for fallback authentication
        const userInfoCookie = JSON.stringify({
          id: user.id,
          username: user.username,
          role: user.role
        });
        document.cookie = `user_info=${encodeURIComponent(userInfoCookie)}; path=/; expires=${cookieExpiration.toUTCString()}`;
        
        console.log("Set manual auth cookies for fallback:", {
          auth_cookie: "manual_auth_success=true",
          user_info: {id: user.id, username: user.username, role: user.role}
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
      
      // Store session in sessionStorage as a fallback
      try {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
        console.log("Saved user session to sessionStorage");
        
        // Set manual client-side cookies since the server ones might not work
        const cookieExpiration = new Date();
        cookieExpiration.setTime(cookieExpiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
        
        // Set authentication flag cookie
        document.cookie = `manual_auth_success=true; path=/; expires=${cookieExpiration.toUTCString()}`;
        
        // Set user info cookie for fallback authentication
        const userInfoCookie = JSON.stringify({
          id: user.id,
          username: user.username,
          role: user.role
        });
        document.cookie = `user_info=${encodeURIComponent(userInfoCookie)}; path=/; expires=${cookieExpiration.toUTCString()}`;
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
      await apiRequest({
        url: "/api/logout",
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      
      // Clear sessionStorage
      try {
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        console.log("Cleared user session from sessionStorage");
        
        // Clear all cookies - use multiple formats to ensure they're cleared
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
        
        // Update local state
        setSessionStorageUser(null);
      } catch (err) {
        console.error("Failed to clear session storage:", err);
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

  return (
    <AuthContext.Provider
      value={{
        user: safeUser,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
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