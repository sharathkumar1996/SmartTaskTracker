import React, { useState } from "react";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2, Users, UserPlus } from "lucide-react";

// Type definitions
interface MemberGroup {
  id: number;
  name: string;
  notes?: string;
  createdBy: number;
  createdAt: string;
  isActive: boolean;
  primaryUserId?: number;
  members?: GroupMember[];
}

interface GroupMember {
  userId: number;
  groupId: number;
  sharePercentage: string;
  notes?: string;
  user?: {
    id: number;
    fullName: string;
    email: string;
    phone: string;
  };
}

interface User {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  username?: string;
}

interface ChitFund {
  id: number;
  name: string;
  amount: string;
  duration: number;
  startDate: string;
  commissionRate: string;
  status: string;
}

// Create group form schema
const createGroupSchema = z.object({
  name: z.string().min(3, "Group name must be at least 3 characters"),
  notes: z.string().optional().nullable(),
  createdBy: z.number().optional(), // This will be set on the server
});

// Add member to group form schema
const addMemberSchema = z.object({
  userId: z.coerce.number({
    required_error: "Please select a member",
    invalid_type_error: "Please select a valid member",
  }),
  sharePercentage: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0 && num <= 100;
    },
    { message: "Share percentage must be between 0 and 100" }
  ),
  notes: z.string().optional(),
});

export function GroupMemberManagement({
  chitFundId,
  onGroupAdded,
  closeModal,
}: {
  chitFundId?: number;
  onGroupAdded?: (groupId: number) => void;
  closeModal?: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<MemberGroup | null>(null);
  const [totalPercentage, setTotalPercentage] = useState<number>(0);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  // Form for creating a new group
  const createGroupForm = useForm<z.infer<typeof createGroupSchema>>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      name: "",
      notes: "",
    },
  });

  // Form for adding a member to a group
  const addMemberForm = useForm<z.infer<typeof addMemberSchema>>({
    resolver: zodResolver(addMemberSchema),
    defaultValues: {
      userId: 0,
      sharePercentage: "",
      notes: "",
    },
  });

  // Query to get all member groups with better error handling
  const { data: groups = [], isLoading: isLoadingGroups } = useQuery({
    queryKey: ["/api/member-groups"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/member-groups");
        if (!response.ok) {
          throw new Error("Failed to fetch member groups");
        }
        return response.json();
      } catch (error) {
        console.error("Error loading member groups:", error);
        toast({
          title: "Error loading groups",
          description: "Unable to load member groups. Please try again.",
          variant: "destructive",
        });
        throw error;
      }
    },
    select: (data: MemberGroup[]) => data,
    // Avoid unnecessary refetches and improve performance
    staleTime: 30000, // 30 seconds
  });

  // Query to get selected group details with members
  const { data: groupWithMembers, isLoading: isLoadingGroupDetails } = useQuery({
    queryKey: ["/api/member-groups", selectedGroup?.id, "members"],
    queryFn: async () => {
      if (!selectedGroup?.id) return null;
      try {
        console.log("Fetching group details for ID:", selectedGroup.id);
        const response = await apiRequest("GET", `/api/member-groups/${selectedGroup.id}?includeMembers=true`);
        const data = await response.json();
        return data;
      } catch (error) {
        console.error("Error fetching group details:", error);
        toast({
          title: "Error loading group details",
          description: "Unable to load group member details.",
          variant: "destructive",
        });
        throw error;
      }
    },
    enabled: !!selectedGroup?.id,
  });

  // Query to get all members (for adding to group)
  const { data: members = [], isLoading: isLoadingMembers } = useQuery({
    queryKey: ["/api/users/members"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/users/members");
        if (!response.ok) {
          throw new Error("Failed to fetch member users");
        }
        return response.json();
      } catch (error) {
        console.error("Error loading users:", error);
        toast({
          title: "Error loading members",
          description: "Unable to load user list.",
          variant: "destructive",
        });
        throw error;
      }
    },
    select: (data: User[]) => data,
    // Cache user data longer to improve performance
    staleTime: 60000, // 1 minute
  });

  // Query to get available chitfunds
  const { data: chitFunds = [], isLoading: isLoadingChitFunds } = useQuery({
    queryKey: ["/api/chitfunds"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/chitfunds");
        if (!response.ok) {
          throw new Error("Failed to fetch chit funds");
        }
        return response.json();
      } catch (error) {
        console.error("Error loading chit funds:", error);
        toast({
          title: "Error loading chit funds",
          description: "Unable to load available chit funds.",
          variant: "destructive",
        });
        throw error;
      }
    },
    select: (data: ChitFund[]) => data,
    enabled: !chitFundId, // Only fetch if we don't already have a chitFundId
    staleTime: 30000, // 30 seconds
  });

  // Mutation to create a new group
  const createGroupMutation = useMutation({
    mutationFn: async (values: z.infer<typeof createGroupSchema>) => {
      const response = await apiRequest("POST", "/api/member-groups", {
        body: JSON.stringify(values),
      });
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Group created",
        description: "The member group has been created successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/member-groups"] });
      setIsCreateGroupOpen(false);
      createGroupForm.reset();
      
      // If creating for a specific chitfund, select this new group
      if (chitFundId && data?.id) {
        setSelectedGroup(data);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create group",
        variant: "destructive",
      });
    },
  });

  // Mutation to add a member to a group
  const addMemberMutation = useMutation({
    mutationFn: async (values: z.infer<typeof addMemberSchema>) => {
      if (!selectedGroup) throw new Error("No group selected");
      const response = await apiRequest("POST", `/api/member-groups/${selectedGroup.id}/members`, {
        body: JSON.stringify(values)
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Member added",
        description: "The member has been added to the group.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/member-groups", selectedGroup?.id, "members"] });
      setAddMemberOpen(false);
      addMemberForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add member to group",
        variant: "destructive",
      });
    },
  });

  // Mutation to add a group to a chitfund
  const addGroupToFundMutation = useMutation({
    mutationFn: async ({ fundId, groupId }: { fundId: number; groupId: number }) => {
      const response = await apiRequest("POST", `/api/chitfunds/${fundId}/group-members/${groupId}`);
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Group added to fund",
        description: "The member group has been added to the chit fund.",
      });
      if (onGroupAdded && selectedGroup) {
        onGroupAdded(selectedGroup.id);
      }
      if (closeModal) {
        closeModal();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add group to fund",
        variant: "destructive",
      });
    },
  });

  // Calculate total percentage when group with members changes
  React.useEffect(() => {
    if (groupWithMembers?.members?.length) {
      const total = groupWithMembers.members.reduce((sum: number, member: any) => {
        return sum + parseFloat(member.sharePercentage);
      }, 0);
      setTotalPercentage(total);
    } else {
      setTotalPercentage(0);
    }
  }, [groupWithMembers]);

  // Handle submit for creating a new group
  const onCreateGroupSubmit = (values: z.infer<typeof createGroupSchema>) => {
    createGroupMutation.mutate(values);
  };

  // Handle submit for adding a member to a group
  const onAddMemberSubmit = (values: z.infer<typeof addMemberSchema>) => {
    addMemberMutation.mutate(values);
  };

  // Handle adding the selected group to a chitfund
  const handleAddGroupToFund = (fundId: number) => {
    if (!selectedGroup) return;
    addGroupToFundMutation.mutate({ fundId, groupId: selectedGroup.id });
  };

  // Percentage validation warning
  const getPercentageStatus = () => {
    if (totalPercentage < 100) {
      return { color: "yellow", message: "Total share is under 100%" };
    } else if (totalPercentage > 100) {
      return { color: "destructive", message: "Total share exceeds 100%" };
    }
    return { color: "green", message: "Total share is 100%" };
  };

  const percentageStatus = getPercentageStatus();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Member Groups</span>
            <Button onClick={() => setIsCreateGroupOpen(true)} size="sm">
              <Plus className="mr-2 h-4 w-4" /> Create Group
            </Button>
          </CardTitle>
          <CardDescription>
            Create and manage groups of members to join chit funds collectively
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingGroups ? (
            <div className="flex justify-center p-4">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="mx-auto h-12 w-12 opacity-50 mb-2" />
              <p>No member groups available</p>
              <p className="text-sm">Create a group to get started</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {/* List of groups */}
              <div className="border rounded-md p-4">
                <h3 className="font-medium mb-2">Available Groups</h3>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className={`p-3 rounded-md cursor-pointer hover:bg-accent transition-colors ${
                          selectedGroup?.id === group.id ? "bg-accent" : "bg-muted/50"
                        }`}
                        onClick={() => setSelectedGroup(group)}
                      >
                        <div className="font-medium">{group.name}</div>
                        {group.notes && (
                          <div className="text-sm text-muted-foreground truncate">
                            {group.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Group details */}
              <div className="border rounded-md p-4">
                {!selectedGroup ? (
                  <div className="h-[300px] flex items-center justify-center text-center text-muted-foreground">
                    <div>
                      <p>Select a group to view details</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-[300px] flex flex-col">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-medium">{selectedGroup.name}</h3>
                        {selectedGroup.notes && (
                          <p className="text-sm text-muted-foreground">
                            {selectedGroup.notes}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => setAddMemberOpen(true)}
                        disabled={!selectedGroup}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Member
                      </Button>
                    </div>

                    <Separator className="my-2" />

                    {/* Badge showing total percentage */}
                    <div className="mb-2">
                      <Badge variant={percentageStatus.color === "green" ? "default" : "outline"}>
                        {percentageStatus.message} ({totalPercentage.toFixed(2)}%)
                      </Badge>
                    </div>

                    {/* Members list */}
                    <ScrollArea className="flex-grow">
                      {isLoadingGroupDetails ? (
                        <div className="flex justify-center p-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : groupWithMembers?.members?.length ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Member</TableHead>
                              <TableHead className="text-right">Share %</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {groupWithMembers.members.map((member: any) => (
                              <TableRow key={member.userId}>
                                <TableCell>{member.user?.fullName}</TableCell>
                                <TableCell className="text-right">
                                  {parseFloat(member.sharePercentage).toFixed(2)}%
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <p>No members in this group</p>
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
        {chitFundId ? (
          <CardFooter>
            <Button
              className="w-full"
              onClick={() => handleAddGroupToFund(chitFundId)}
              disabled={!selectedGroup || totalPercentage !== 100}
            >
              Add Group to This Chit Fund
            </Button>
          </CardFooter>
        ) : (
          <CardFooter>
            <div className="w-full">
              <Label htmlFor="fund-select">Add selected group to chit fund:</Label>
              <div className="flex mt-2 gap-2">
                <select
                  id="fund-select"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!selectedGroup || isLoadingChitFunds || chitFunds.length === 0}
                >
                  <option value="">Select a chit fund</option>
                  {chitFunds.map((fund) => (
                    <option key={fund.id} value={fund.id}>
                      {fund.name} ({formatCurrency(fund.amount)})
                    </option>
                  ))}
                </select>
                <Button
                  onClick={() => {
                    const select = document.getElementById("fund-select") as HTMLSelectElement;
                    const fundId = parseInt(select.value);
                    if (!isNaN(fundId)) {
                      handleAddGroupToFund(fundId);
                    }
                  }}
                  disabled={!selectedGroup || totalPercentage !== 100}
                >
                  Add
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Create Group Dialog */}
      <Dialog open={isCreateGroupOpen} onOpenChange={setIsCreateGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Member Group</DialogTitle>
            <DialogDescription>
              Create a new group of members who will jointly participate in a chit fund
            </DialogDescription>
          </DialogHeader>

          <Form {...createGroupForm}>
            <form onSubmit={createGroupForm.handleSubmit(onCreateGroupSubmit)} className="space-y-4">
              <FormField
                control={createGroupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Family Group" {...field} />
                    </FormControl>
                    <FormDescription>
                      Enter a descriptive name for this member group
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={createGroupForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional notes about this group"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsCreateGroupOpen(false);
                    createGroupForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createGroupMutation.isPending}>
                  {createGroupMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Group
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Member to Group Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Member to Group</DialogTitle>
            <DialogDescription>
              Add a member to the group with their share percentage
            </DialogDescription>
          </DialogHeader>

          <Form {...addMemberForm}>
            <form onSubmit={addMemberForm.handleSubmit(onAddMemberSubmit)} className="space-y-4">
              <FormField
                control={addMemberForm.control}
                name="userId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Member</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        {...field}
                        value={field.value || ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : "")}
                      >
                        <option value="">Select a member</option>
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.fullName}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addMemberForm.control}
                name="sharePercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Share Percentage</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          placeholder="e.g., 25"
                          step="0.01"
                          min="0.01"
                          max="100"
                          {...field}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          %
                        </div>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Enter the percentage share for this member (current total: {totalPercentage.toFixed(2)}%)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={addMemberForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optional notes about this member's share"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAddMemberOpen(false);
                    addMemberForm.reset();
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={addMemberMutation.isPending}>
                  {addMemberMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Add Member
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}