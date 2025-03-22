import { useQuery, useMutation } from "@tanstack/react-query";
import { User, insertUserSchema, InsertUser } from "@shared/schema"; // Assuming InsertUser is defined here or needs importing
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Trash2, Edit } from "lucide-react";

export function MemberManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: members = [], isLoading } = useQuery<User[]>({ 
    queryKey: ["/api/users"],
    enabled: user?.role === "admin" || user?.role === "agent",
    queryFn: async ({ queryKey }) => {
      // Check if we're on Render.com
      const isRender = window.location.hostname.includes('render.com') || 
                       document.referrer.includes('render.com') || 
                       localStorage.getItem('deploy_platform') === 'render';
      
      // If on Render, add special headers for authentication
      const customHeaders: Record<string, string> = {};
      
      if (isRender && user) {
        console.log("Adding special Render.com headers for authentication");
        customHeaders['x-user-id'] = user.id.toString();
        customHeaders['x-user-role'] = user.role;
        customHeaders['x-deploy-type'] = 'render';
        customHeaders['x-special-render-access'] = 'true';
      }
      
      return apiRequest<User[]>({
        url: queryKey[0] as string,
        method: 'GET',
        headers: customHeaders
      });
    }
  });

  const form = useForm({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      username: "",
      password: "",
      role: "member" as const,
      fullName: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      pincode: "",
      fundPreferences: "",
      status: "active" as const,
    },
  });

  const memberMutation = useMutation({
    mutationFn: async (data: InsertUser) => {
      // Ensure password is included in the data
      if (!data.password) {
        throw new Error("Password is required");
      }
      
      // Check if we're on Render.com or custom domain
      const isRender = window.location.hostname.includes('render.com') || 
                       document.referrer.includes('render.com') || 
                       localStorage.getItem('deploy_platform') === 'render';
      const isCustomDomain = window.location.hostname === 'srivasavifinancialservices.in' || 
                            window.location.hostname === 'www.srivasavifinancialservices.in';
      
      // Add special headers for Render environment
      const customHeaders: Record<string, string> = {};
      if ((isRender || isCustomDomain) && user) {
        console.log("Adding special auth headers for user creation on Render");
        customHeaders['x-user-id'] = user.id.toString();
        customHeaders['x-user-role'] = user.role;
        customHeaders['x-deploy-type'] = 'render';
        customHeaders['x-special-render-access'] = 'true';
        // Add CSRF protection for create operations
        customHeaders['x-csrf-token'] = 'render-secure-' + Date.now();
      }
      
      const response = await apiRequest<InsertUser>({
        url: "/api/users",
        method: "POST",
        body: data,
        headers: customHeaders
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User added successfully",
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<User> }) => {
      return await apiRequest<User>({
        url: `/api/users/${id}`,
        method: "PATCH",
        body: data
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMemberMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest<void>({
        url: `/api/users/${id}`,
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const membersList = members.filter(m => m.role === "member");
  const agentsList = members.filter(m => m.role === "agent");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Manage members and agents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="members" className="space-y-4">
            <TabsList>
              <TabsTrigger value="members">Members</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="add">Add User</TabsTrigger>
            </TabsList>

            <TabsContent value="members">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Info</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Fund Preferences</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {membersList.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="font-medium">{member.fullName}</div>
                          <div className="text-sm text-muted-foreground">@{member.username}</div>
                        </TableCell>
                        <TableCell>
                          <div>{member.email}</div>
                          <div className="text-sm text-muted-foreground">{member.phone}</div>
                        </TableCell>
                        <TableCell>
                          <div>{member.address}</div>
                          <div className="text-sm text-muted-foreground">
                            {member.city}, {member.state} {member.pincode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{member.fundPreferences || "Not specified"}</div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={member.status === "active" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {member.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Edit className="h-4 w-4 mr-1" />
                                  Edit
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Member Details</DialogTitle>
                                  <DialogDescription>
                                    Update member information and preferences
                                  </DialogDescription>
                                </DialogHeader>
                                <Form {...form}>
                                  <form 
                                    onSubmit={form.handleSubmit((data) => 
                                      updateMemberMutation.mutate({ id: member.id, data })
                                    )} 
                                    className="space-y-4"
                                  >
                                    <FormField
                                      control={form.control}
                                      name="fullName"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Full Name</FormLabel>
                                          <FormControl>
                                            <Input {...field} defaultValue={member.fullName} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="email"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Email (Optional)</FormLabel>
                                          <FormControl>
                                            <Input 
                                              type="email" 
                                              {...field} 
                                              defaultValue={member.email as string || ''} 
                                              placeholder="user@example.com"
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="phone"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Phone (Optional)</FormLabel>
                                          <FormControl>
                                            <Input 
                                              {...field} 
                                              defaultValue={member.phone as string || ''} 
                                              placeholder="+91 XXXXX XXXXX"
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="address"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Address</FormLabel>
                                          <FormControl>
                                            <Textarea {...field} defaultValue={member.address || ''} />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <div className="grid grid-cols-3 gap-4">
                                      <FormField
                                        control={form.control}
                                        name="city"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>City</FormLabel>
                                            <FormControl>
                                              <Input {...field} defaultValue={member.city || ''} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="state"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>State</FormLabel>
                                            <FormControl>
                                              <Input {...field} defaultValue={member.state || ''} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name="pincode"
                                        render={({ field }) => (
                                          <FormItem>
                                            <FormLabel>Pincode</FormLabel>
                                            <FormControl>
                                              <Input {...field} defaultValue={member.pincode || ''} />
                                            </FormControl>
                                            <FormMessage />
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                    <FormField
                                      control={form.control}
                                      name="fundPreferences"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Fund Preferences</FormLabel>
                                          <FormControl>
                                            <Textarea 
                                              {...field} 
                                              defaultValue={member.fundPreferences || ''} 
                                              placeholder="Enter preferred fund amounts, duration, etc."
                                            />
                                          </FormControl>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <FormField
                                      control={form.control}
                                      name="status"
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormLabel>Status</FormLabel>
                                          <Select
                                            onValueChange={field.onChange}
                                            defaultValue={member.status}
                                          >
                                            <FormControl>
                                              <SelectTrigger>
                                                <SelectValue placeholder="Select status" />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              <SelectItem value="active">Active</SelectItem>
                                              <SelectItem value="inactive">Inactive</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          <FormMessage />
                                        </FormItem>
                                      )}
                                    />
                                    <Button 
                                      type="submit" 
                                      className="w-full"
                                      disabled={updateMemberMutation.isPending}
                                    >
                                      {updateMemberMutation.isPending && (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      )}
                                      Update Member
                                    </Button>
                                  </form>
                                </Form>
                              </DialogContent>
                            </Dialog>

                            {user?.role === "admin" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="destructive" size="sm">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Member</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this member? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMemberMutation.mutate(member.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      {deleteMemberMutation.isPending && (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      )}
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="agents">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact Info</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agentsList.map((agent) => (
                      <TableRow key={agent.id}>
                        <TableCell>
                          <div className="font-medium">{agent.fullName}</div>
                          <div className="text-sm text-muted-foreground">@{agent.username}</div>
                        </TableCell>
                        <TableCell>
                          <div>{agent.email}</div>
                          <div className="text-sm text-muted-foreground">{agent.phone}</div>
                        </TableCell>
                        <TableCell>
                          <div>{agent.address}</div>
                          <div className="text-sm text-muted-foreground">
                            {agent.city}, {agent.state} {agent.pincode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={agent.status === "active" ? "default" : "secondary"}
                            className="capitalize"
                          >
                            {agent.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            {user?.role === "admin" && (
                              <>
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" size="sm">
                                      <Edit className="h-4 w-4 mr-1" />
                                      Edit
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit Agent Details</DialogTitle>
                                      <DialogDescription>
                                        Update agent information
                                      </DialogDescription>
                                    </DialogHeader>
                                    <Form {...form}>
                                      <form 
                                        onSubmit={form.handleSubmit((data) => 
                                          updateMemberMutation.mutate({ id: agent.id, data })
                                        )} 
                                        className="space-y-4"
                                      >
                                        <FormField
                                          control={form.control}
                                          name="fullName"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Full Name</FormLabel>
                                              <FormControl>
                                                <Input {...field} defaultValue={agent.fullName} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name="email"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Email (Optional)</FormLabel>
                                              <FormControl>
                                                <Input 
                                                  type="email"
                                                  {...field} 
                                                  defaultValue={agent.email as string || ''} 
                                                  placeholder="user@example.com"
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name="phone"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Phone (Optional)</FormLabel>
                                              <FormControl>
                                                <Input 
                                                  {...field} 
                                                  defaultValue={agent.phone as string || ''} 
                                                  placeholder="+91 XXXXX XXXXX"
                                                />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <FormField
                                          control={form.control}
                                          name="address"
                                          render={({ field }) => (
                                            <FormItem>
                                              <FormLabel>Address</FormLabel>
                                              <FormControl>
                                                <Textarea {...field} defaultValue={agent.address || ''} />
                                              </FormControl>
                                              <FormMessage />
                                            </FormItem>
                                          )}
                                        />
                                        <div className="grid grid-cols-3 gap-4">
                                          <FormField
                                            control={form.control}
                                            name="city"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel>City</FormLabel>
                                                <FormControl>
                                                  <Input {...field} defaultValue={agent.city || ''} />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                          <FormField
                                            control={form.control}
                                            name="state"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel>State</FormLabel>
                                                <FormControl>
                                                  <Input {...field} defaultValue={agent.state || ''} />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                          <FormField
                                            control={form.control}
                                            name="pincode"
                                            render={({ field }) => (
                                              <FormItem>
                                                <FormLabel>Pincode</FormLabel>
                                                <FormControl>
                                                  <Input {...field} defaultValue={agent.pincode || ''} />
                                                </FormControl>
                                                <FormMessage />
                                              </FormItem>
                                            )}
                                          />
                                        </div>
                                        <Button 
                                          type="submit" 
                                          className="w-full"
                                          disabled={updateMemberMutation.isPending}
                                        >
                                          {updateMemberMutation.isPending && (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                          )}
                                          Update Agent
                                        </Button>
                                      </form>
                                    </Form>
                                  </DialogContent>
                                </Dialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Agent</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this agent? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteMemberMutation.mutate(agent.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        {deleteMemberMutation.isPending && (
                                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        )}
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="add">
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => memberMutation.mutate(data))} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
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
                      control={form.control}
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
                  </div>

                  {user?.role === "admin" && (
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="agent">Agent</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              type="email" 
                              {...field} 
                              value={field.value || ''} 
                              placeholder="user@example.com"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone (Optional)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value || ''} 
                              placeholder="+91 XXXXX XXXXX"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="state"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>State</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="pincode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Pincode</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {form.watch("role") === "member" && (
                    <FormField
                      control={form.control}
                      name="fundPreferences"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fund Preferences</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="Enter preferred fund amounts, duration, etc."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <Button 
                    type="submit" 
                    className="w-full"
                    disabled={memberMutation.isPending}
                  >
                    {memberMutation.isPending && (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    )}
                    Add User
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}