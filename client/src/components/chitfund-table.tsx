import { ChitFund, User, FundMember } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "./payment-form";
import { GroupMemberManagement } from "./group-member-management";
import { ContributionAmountForm } from "./contribution-amount-form";
import { WithdrawalStatusForm } from "./withdrawal-status-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Users, UserPlus, UserCircle } from "lucide-react";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";
import { PaymentTrackingSheet } from "./payment-tracking-sheet";
import { formatCurrency } from "@/lib/utils";
import { PayoutForm } from "./payout-form";

interface ChitFundTableProps {
  chitFunds: ChitFund[];
  userRole: string;
  userId: number;
}

export function ChitFundTable({ chitFunds, userRole, userId }: ChitFundTableProps) {
  const { toast } = useToast();
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [selectedFund, setSelectedFund] = useState<ChitFund | null>(null);

  console.log("Selected Fund:", selectedFund); // Debug log

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: userRole === "admin" || userRole === "agent",
  });

  const { data: fundMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/chitfunds", selectedFund?.id, "members"],
    queryFn: async () => {
      if (!selectedFund) return [];
      const res = await fetch(`/api/chitfunds/${selectedFund.id}/members`);
      if (!res.ok) throw new Error("Failed to fetch fund members");
      return res.json();
    },
    enabled: !!selectedFund,
  });

  // Query to get member details including withdrawal status
  const { data: memberDetails } = useQuery<FundMember>({
    queryKey: ["/api/chitfunds", selectedFund?.id, "members", selectedMemberId, "details"],
    queryFn: async () => {
      if (!selectedFund || !selectedMemberId) return null;
      try {
        const res = await fetch(`/api/chitfunds/${selectedFund.id}/members/${selectedMemberId}/details`);
        if (!res.ok) {
          // If endpoint doesn't exist yet, just return default values
          return { 
            fundId: selectedFund.id, 
            userId: selectedMemberId, 
            isWithdrawn: false 
          };
        }
        return res.json();
      } catch (error) {
        console.error("Error fetching member details:", error);
        return { 
          fundId: selectedFund.id, 
          userId: selectedMemberId, 
          isWithdrawn: false 
        };
      }
    },
    enabled: !!selectedFund && !!selectedMemberId,
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ fundId, userId }: { fundId: number; userId: number }) => {
      const res = await apiRequest("POST", `/api/chitfunds/${fundId}/members/${userId}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add member to fund");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", selectedFund?.id, "members"] });
      toast({
        title: "Success",
        description: "Member added to fund successfully",
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

  const removeMemberMutation = useMutation({
    mutationFn: async ({ fundId, userId }: { fundId: number; userId: number }) => {
      const res = await apiRequest("DELETE", `/api/chitfunds/${fundId}/members/${userId}`);
      if (!res.ok) {
        throw new Error("Failed to remove member from fund");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", selectedFund?.id, "members"] });
      toast({
        title: "Success",
        description: "Member removed from fund successfully",
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

  return (
    <div className="space-y-8">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[300px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chitFunds.map((fund) => (
              <TableRow
                key={fund.id}
                className={selectedFund?.id === fund.id ? "bg-muted/50" : ""}
                onClick={() => {
                  console.log("Row clicked, setting selected fund:", fund); // Debug log
                  setSelectedFund(fund);
                }}
                style={{ cursor: 'pointer' }}
              >
                <TableCell className="font-medium">{fund.name}</TableCell>
                <TableCell>{formatCurrency(Number(fund.amount))}</TableCell>
                <TableCell>{fund.duration} months</TableCell>
                <TableCell>{format(new Date(fund.startDate), 'dd MMM yyyy')}</TableCell>
                <TableCell>{format(new Date(fund.endDate), 'dd MMM yyyy')}</TableCell>
                <TableCell>{fund.memberCount}</TableCell>
                <TableCell>
                  <Badge
                    variant={fund.status === "active" ? "default" : "secondary"}
                    className="capitalize"
                  >
                    {fund.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    {(userRole === "admin" || userRole === "agent") && fund.status === "active" && (
                      <>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFund(fund);
                              }}
                            >
                              Record Payment
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Record Member Payment</DialogTitle>
                              <DialogDescription>
                                Select a member and record their payment for {fund.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Select
                                  onValueChange={(value) => setSelectedMemberId(parseInt(value))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a member" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fundMembers.map((member) => (
                                      <SelectItem key={member.id} value={member.id.toString()}>
                                        {member.fullName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {selectedMemberId && (
                                <PaymentForm
                                  chitFundId={fund.id}
                                  userId={selectedMemberId}
                                />
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFund(fund);
                              }}
                            >
                              Process Payout
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Process Member Payout</DialogTitle>
                              <DialogDescription>
                                Select a member and process their payout for {fund.name}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="space-y-2">
                                <Select
                                  onValueChange={(value) => setSelectedMemberId(parseInt(value))}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select a member" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fundMembers.map((member) => (
                                      <SelectItem key={member.id} value={member.id.toString()}>
                                        {member.fullName}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              {selectedMemberId && (
                                <PayoutForm
                                  chitFundId={fund.id}
                                  userId={selectedMemberId}
                                  onSuccess={() => {
                                    queryClient.invalidateQueries({ 
                                      queryKey: ["/api/chitfunds", fund.id, "members", selectedMemberId, "details"] 
                                    });
                                    queryClient.invalidateQueries({ 
                                      queryKey: ["/api/accounts/payables"] 
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}

                    {userRole === "member" && fund.status === "active" && (
                      <Sheet>
                        <SheetTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Make Payment
                          </Button>
                        </SheetTrigger>
                        <SheetContent>
                          <SheetHeader>
                            <SheetTitle>Make Payment</SheetTitle>
                            <SheetDescription>
                              Make a payment for {fund.name}
                            </SheetDescription>
                          </SheetHeader>
                          <PaymentForm
                            className="mt-4"
                            chitFundId={fund.id}
                            userId={userId}
                          />
                        </SheetContent>
                      </Sheet>
                    )}

                    {userRole === "admin" && fund.status === "active" && (
                      <>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFund(fund);
                              }}
                            >
                              Manage Members
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-5xl">
                            <DialogHeader>
                              <DialogTitle>Manage Fund Members</DialogTitle>
                              <DialogDescription>
                                Add individual members or groups to this fund
                              </DialogDescription>
                            </DialogHeader>
                            
                            <Tabs defaultValue="individual" className="w-full">
                              <TabsList className="grid grid-cols-2 mb-4">
                                <TabsTrigger value="individual" className="flex items-center gap-2">
                                  <UserCircle className="h-4 w-4" />
                                  Individual Members
                                </TabsTrigger>
                                <TabsTrigger value="groups" className="flex items-center gap-2">
                                  <Users className="h-4 w-4" />
                                  Member Groups
                                </TabsTrigger>
                              </TabsList>
                            
                              <TabsContent value="individual" className="space-y-4">
                                <div>
                                  <h4 className="mb-2 text-sm font-medium">Add Individual Member</h4>
                                  <Select
                                    onValueChange={(value) => {
                                      addMemberMutation.mutate({
                                        fundId: fund.id,
                                        userId: parseInt(value),
                                      });
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a member" />
                                    </SelectTrigger>
                                    <SelectContent className="max-h-[200px]">
                                      <ScrollArea className="h-full">
                                        {users
                                          .filter((u) => u.role === "member")
                                          .map((user) => (
                                            <SelectItem key={user.id} value={user.id.toString()}>
                                              {user.fullName}
                                            </SelectItem>
                                          ))}
                                      </ScrollArea>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <h4 className="mb-2 text-sm font-medium">Current Members</h4>
                                  <ScrollArea className="h-[200px]">
                                    <div className="space-y-2 pr-4">
                                    {fundMembers.map((member) => (
                                      <div
                                        key={member.id}
                                        className="flex items-center justify-between p-2 rounded-md border"
                                      >
                                        <span>{member.fullName}</span>
                                        <div className="flex gap-2">
                                          <Dialog>
                                            <DialogTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedMemberId(member.id)}
                                              >
                                                Withdrawal Status
                                              </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                              <DialogHeader>
                                                <DialogTitle>Update Withdrawal Status</DialogTitle>
                                                <DialogDescription>
                                                  Mark if {member.fullName} has withdrawn from {fund.name}
                                                </DialogDescription>
                                              </DialogHeader>
                                              <WithdrawalStatusForm
                                                fundId={fund.id}
                                                userId={member.id}
                                                initialValues={{
                                                  isWithdrawn: memberDetails?.isWithdrawn || false,
                                                  earlyWithdrawalMonth: memberDetails?.earlyWithdrawalMonth || null
                                                }}
                                                onSuccess={() => {
                                                  queryClient.invalidateQueries({
                                                    queryKey: ["/api/chitfunds", fund.id, "members", member.id, "details"]
                                                  });
                                                }}
                                                className="mt-4"
                                              />
                                            </DialogContent>
                                          </Dialog>
                                          
                                          <Dialog>
                                            <DialogTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedMemberId(member.id)}
                                              >
                                                Custom Amount
                                              </Button>
                                            </DialogTrigger>
                                            <DialogContent>
                                              <DialogHeader>
                                                <DialogTitle>Customize Contribution</DialogTitle>
                                                <DialogDescription>
                                                  Set custom monthly amount for {member.fullName} in {fund.name}
                                                </DialogDescription>
                                              </DialogHeader>
                                              <ContributionAmountForm
                                                fundId={fund.id}
                                                userId={member.id}
                                                standardAmount={fund.amount}
                                                initialValues={{
                                                  increasedMonthlyAmount: memberDetails?.increasedMonthlyAmount || null,
                                                  shareIdentifier: memberDetails?.shareIdentifier || null
                                                }}
                                                onSuccess={() => {
                                                  queryClient.invalidateQueries({
                                                    queryKey: ["/api/chitfunds", fund.id, "members", member.id, "details"]
                                                  });
                                                }}
                                                className="mt-4"
                                              />
                                            </DialogContent>
                                          </Dialog>
                                          
                                          <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() =>
                                              removeMemberMutation.mutate({
                                                fundId: fund.id,
                                                userId: member.id,
                                              })
                                            }
                                          >
                                            Remove
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </ScrollArea>
                              </div>
                              </TabsContent>
                              
                              <TabsContent value="groups" className="space-y-4">
                                <GroupMemberManagement 
                                  chitFundId={fund.id}
                                  onGroupAdded={(groupId) => {
                                    queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", fund.id, "members"] });
                                    toast({
                                      title: "Success",
                                      description: "Group added to fund successfully",
                                    });
                                  }}
                                />
                              </TabsContent>
                            </Tabs>
                          </DialogContent>
                        </Dialog>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Close Fund
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Close Chit Fund</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to close this chit fund? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    await apiRequest("PATCH", `/api/chitfunds/${fund.id}`, {
                                      status: "closed"
                                    });
                                    queryClient.invalidateQueries({ queryKey: ["/api/chitfunds"] });
                                    toast({
                                      title: "Success",
                                      description: "Chit fund closed successfully",
                                    });
                                  } catch (error) {
                                    toast({
                                      title: "Error",
                                      description: (error as Error).message,
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Close Fund
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

      {selectedFund && (userRole === "admin" || userRole === "agent") && (
        <div className="rounded-md border p-6 bg-card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-semibold">{selectedFund.name}</h2>
              <p className="text-muted-foreground">Payment Tracking Sheet</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedFund(null)}
            >
              Close Sheet
            </Button>
          </div>
          <PaymentTrackingSheet
            fundId={selectedFund.id}
            fundName={selectedFund.name}
          />
        </div>
      )}
    </div>
  );
}