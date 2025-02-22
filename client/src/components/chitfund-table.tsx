import { ChitFund, User } from "@shared/schema";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";

interface ChitFundTableProps {
  chitFunds: ChitFund[];
  userRole: string;
  userId: number;
}

export function ChitFundTable({ chitFunds, userRole, userId }: ChitFundTableProps) {
  const { toast } = useToast();
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: userRole === "admin",
  });

  const [selectedFund, setSelectedFund] = useState<number | null>(null);
  const { data: fundMembers = [] } = useQuery<User[]>({
    queryKey: ["/api/chitfunds", selectedFund, "members"],
    queryFn: async () => {
      if (!selectedFund) return [];
      const res = await fetch(`/api/chitfunds/${selectedFund}/members`);
      if (!res.ok) throw new Error("Failed to fetch fund members");
      return res.json();
    },
    enabled: !!selectedFund,
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
      queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", selectedFund, "members"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", selectedFund, "members"] });
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
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
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {chitFunds.map((fund) => (
            <TableRow key={fund.id}>
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
              <TableCell className="space-x-2">
                {userRole === "member" && fund.status === "active" && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm">
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
                        type="payment"
                        className="mt-4"
                        chitFundId={fund.id}
                        userId={userId}
                      />
                    </SheetContent>
                  </Sheet>
                )}
                {userRole === "admin" && (
                  <>
                    {fund.status === "active" && (
                      <>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedFund(fund.id)}
                            >
                              Manage Members
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md">
                            <DialogHeader>
                              <DialogTitle>Manage Fund Members</DialogTitle>
                              <DialogDescription>
                                Add or remove members from this fund
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <h4 className="mb-2 text-sm font-medium">Add Member</h4>
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
                                  <SelectContent>
                                    {users
                                      .filter((u) => u.role === "member")
                                      .map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                          {user.fullName}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <h4 className="mb-2 text-sm font-medium">Current Members</h4>
                                <div className="space-y-2">
                                  {fundMembers.map((member) => (
                                    <div
                                      key={member.id}
                                      className="flex items-center justify-between p-2 rounded-md border"
                                    >
                                      <span>{member.fullName}</span>
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
                                  ))}
                                </div>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
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
                  </>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}