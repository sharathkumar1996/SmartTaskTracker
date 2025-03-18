import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema } from "@shared/schema";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

export default function AuthPage() {
  const { user, loginMutation, registerMutation, setManualUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Login form with no default credentials for security
  const loginForm = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    // Prevent excessive rerendering
    mode: "onSubmit",
  });
  
  // Enhanced session check and feedback
  useEffect(() => {
    console.log("Auth page loaded, checking session status");
    
    // Log current user state and automatically redirect if already logged in
    console.log("Current user:", user);
    
    // Advanced cookie debugging
    try {
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const parts = cookie.trim().split('=');
        if (parts.length >= 1) {
          const key = parts[0].trim();
          const value = parts.length > 1 ? parts[1] : '';
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>);
      
      console.log("Current cookies:", cookies);
      
      // Check for server availability
      if (cookies['server_online']) {
        console.log("Server is reachable (server_online cookie found)");
      }
      
      // Auto-fill credentials for development if cookies suggest a previous session
      if ((cookies['auth_success'] || cookies['manual_auth_success']) && 
          !user && !loginForm.getValues().username) {
        console.log("Previous session detected but not active, suggesting login");
        toast({
          title: "Session expired",
          description: "Your previous session has expired. Please log in again.",
          variant: "default",
        });
      }
    } catch (e) {
      console.error("Error parsing cookies:", e);
    }
    
    // Notify if there are login errors
    if (loginMutation.isError) {
      toast({
        title: "Login error detected",
        description: `Error: ${loginMutation.error?.message || "Unknown error"}`,
        variant: "destructive",
      });
    }
  }, [user, loginMutation.isError, loginMutation.error, toast, loginForm]);
  
  // Simplified direct login handler
  const handleLoginSubmit = async (data: { username: string; password: string }) => {
    // For security, don't log credentials
    console.log("Processing login attempt");
    
    // Clear any previous errors and form state
    loginForm.clearErrors();
    
    // Enhanced validation
    if (!data.username.trim()) {
      loginForm.setError("username", { 
        type: "manual", 
        message: "Username is required" 
      });
      return;
    }
    
    if (!data.password) {
      loginForm.setError("password", { 
        type: "manual", 
        message: "Password is required" 
      });
      return;
    }
    
    // Clear any stale cookies before attempting new login
    console.log("Clearing existing auth cookies before login attempt");
    try {
      document.cookie = 'auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'user_info=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'chitfund.sid=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'server_online=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
      document.cookie = 'manual_auth_success=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    } catch (e) {
      console.error("Error clearing cookies:", e);
    }
    
    try {
      // Use the mutation to log in
      loginMutation.mutate(data, {
        onSuccess: (userData) => {
          console.log("Login successful, redirecting to dashboard");
          toast({
            title: "Login successful",
            description: "Welcome back!",
            variant: "default"
          });
          
          try {
            // Store session in localStorage as a last resort
            const SESSION_STORAGE_KEY = 'chitfund_user_session';
            sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userData));
          } catch (e) {
            console.error("Failed to save to sessionStorage:", e);
          }
          
          // Store user info for APIs that need it
          const userInfoCookie = JSON.stringify({
            id: userData.id,
            username: userData.username,
            role: userData.role
          });
          
          // Set expiration for cookies
          const cookieExpiration = new Date();
          cookieExpiration.setTime(cookieExpiration.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
          
          document.cookie = `user_info=${encodeURIComponent(userInfoCookie)}; path=/; expires=${cookieExpiration.toUTCString()}`;
          document.cookie = `manual_auth_success=true; path=/; expires=${cookieExpiration.toUTCString()}`;
          
          console.log("Set client-side auth cookies for redundancy");
          
          // After successful login, check for session cookies
          setTimeout(() => {
            const hasCookies = document.cookie.includes('auth_success') || 
                              document.cookie.includes('chitfund.sid') ||
                              document.cookie.includes('manual_auth_success');
            console.log("Auth cookies present after login:", hasCookies);
            console.log("Current cookies:", document.cookie);
            
            if (!hasCookies) {
              console.warn("Warning: No auth cookies detected after successful login");
              toast({
                title: "Cookie Warning",
                description: "Login succeeded but session cookies weren't stored. You may be logged out soon.",
                variant: "destructive"
              });
            }
          }, 500);
        },
        onError: (error) => {
          console.error("Login mutation error:", error);
          loginForm.setError("root", {
            type: "manual",
            message: "Login failed: " + error.message
          });
          
          toast({
            title: "Login failed",
            description: error.message || "Authentication failed",
            variant: "destructive"
          });
        }
      });
    } catch (error) {
      console.error("Unexpected login error:", error);
      loginForm.setError("root", {
        type: "manual",
        message: "Login failed: " + (error instanceof Error ? error.message : String(error))
      });
    }
  };

  const registerForm = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      role: "member" as const, // Default and only option for public registration
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      status: "active" as const,
    },
  });

  if (user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Sri Vasavi Chit Fund</CardTitle>
            <CardDescription>
              Manage your chit funds efficiently and securely
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <Form {...loginForm}>
                  <form
                    onSubmit={loginForm.handleSubmit(handleLoginSubmit)}
                    className="space-y-4"
                  >
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Login guidance */}
                    <div className="p-2 mb-2 bg-blue-50 text-blue-800 rounded-md text-sm">
                      <p>Please log in with your account credentials</p>
                    </div>
                    
                    <Button
                      type="submit"
                      className="w-full mb-2"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Logging in...
                        </>
                      ) : (
                        "Login"
                      )}
                    </Button>
                    
                    {/* Direct Admin Login */}
                    <Button
                      type="button"
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        // Create a hardcoded admin user for direct access with all required fields
                        const adminUser = {
                          id: 1,
                          username: "admin",
                          password: "", // Don't store passwords in frontend
                          role: "admin" as const,
                          fullName: "System Administrator",
                          email: "admin@example.com",
                          phone: "1234567890",
                          address: null,
                          city: null,
                          state: null,
                          pincode: null,
                          fundPreferences: null,
                          agentId: null,
                          agentCommission: null,
                          status: "active" as const
                        };
                        
                        // Use our direct authentication method
                        setManualUser(adminUser);
                        
                        // Navigate to dashboard
                        setLocation('/');
                      }}
                      disabled={loginMutation.isPending}
                    >
                      Quick Admin Access
                    </Button>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="register">
                <Form {...registerForm}>
                  <form
                    onSubmit={registerForm.handleSubmit((data) =>
                      registerMutation.mutate(data)
                    )}
                    className="space-y-4"
                  >
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {/* Removed role selection for public registration */}
                    <input type="hidden" {...registerForm.register("role")} value="member" />

                    <FormField
                      control={registerForm.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={registerMutation.isPending}
                    >
                      Register
                    </Button>
                  </form>
                </Form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      <div className="hidden lg:flex flex-1 bg-primary items-center justify-center p-8">
        <div className="max-w-md text-primary-foreground">
          <h1 className="text-4xl font-bold mb-4">
            Welcome to Sri Vasavi Chit Fund
          </h1>
          <p className="text-lg opacity-90">
            Manage your chit funds efficiently with our secure platform. Track
            payments, calculate bonuses, and maintain transparent records.
          </p>
        </div>
      </div>
    </div>
  );
}