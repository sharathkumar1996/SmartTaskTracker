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
//import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"; //Removed as per edit


export default function AuthPage() {
  const { user, loginMutation, registerMutation } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Debug: Check session cookies and auth status
  useEffect(() => {
    console.log("Auth page loaded, checking session status");
    
    // Log current user state
    console.log("Current user:", user);
    
    // Check cookies
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    console.log("Current cookies:", cookies);
    
    // Notify if there are session issues
    if (loginMutation.isError) {
      toast({
        title: "Login error detected",
        description: `Error: ${loginMutation.error?.message || "Unknown error"}`,
        variant: "destructive",
      });
    }
  }, [user, loginMutation.isError, loginMutation.error]);

  // Improved login form with better error handling
  const loginForm = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    // Prevent excessive rerendering
    mode: "onSubmit",
  });
  
  // Add admin login hint
  const handleLoginSubmit = (data: { username: string; password: string }) => {
    console.log("Login attempt with:", data.username);
    
    // Clear any previous errors
    loginForm.clearErrors();
    
    // Basic validation
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
    
    // Provide admin login hint if they're trying to use the admin account
    if (data.username.toLowerCase() === "admin" && data.password !== "admin123") {
      console.log("Admin login attempt with incorrect password");
      // We'll still submit, but show a hint
      loginForm.setError("password", {
        type: "manual",
        message: "Hint: Default admin password is 'admin123'"
      });
    }
    
    console.log("Submitting login form");
    loginMutation.mutate(data);
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
                    {/* Add admin login hint */}
                    <div className="p-2 mb-2 bg-blue-50 text-blue-800 rounded-md text-sm">
                      <p>Admin access: use username <strong>admin</strong> and password <strong>admin123</strong></p>
                    </div>
                    
                    <Button
                      type="submit"
                      className="w-full"
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