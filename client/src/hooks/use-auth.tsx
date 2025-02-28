import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      console.log('Fetching current user session');
      try {
        const response = await fetch('/api/user', {
          credentials: 'include', // Important: include cookies with the request
          headers: {
            'Accept': 'application/json'
          }
        });
        
        console.log('Session check response status:', response.status);
        
        if (!response.ok) {
          if (response.status === 401) {
            console.log('Session not authenticated (401)');
            return null;
          }
          throw new Error(`HTTP error: ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('User session data received:', userData.id, userData.username);
        return userData;
      } catch (err) {
        console.error('Error fetching user session:', err);
        return null;
      }
    },
    staleTime: 60000, // 1 minute
    gcTime: Infinity,
    // Explicitly initialize to null to fix type issue
    initialData: null,
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log("Logging in with username:", credentials.username);
      try {
        const res = await apiRequest("POST", "/api/login", credentials);
        const userData = await res.json();
        console.log("Login successful:", userData);
        return userData;
      } catch (error) {
        console.error("Login error:", error);
        throw error;
      }
    },
    onSuccess: (user: SelectUser) => {
      console.log("Setting user data in cache");
      queryClient.setQueryData(["/api/user"], user);
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
        console.log("Login credentials incorrect. Please make sure you're using admin/admin123 for the admin account.");
        errorMessage = "Username or password incorrect. For admin account, use username 'admin' and password 'admin123'.";
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
      const res = await apiRequest("POST", "/api/register", credentials);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      queryClient.invalidateQueries();
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
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