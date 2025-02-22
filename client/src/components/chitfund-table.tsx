import { ChitFund } from "@shared/schema";
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ChitFundTableProps {
  chitFunds: ChitFund[];
  userRole: string;
  userId: number;
}

export function ChitFundTable({ chitFunds, userRole, userId }: ChitFundTableProps) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/chitfunds/${id}`);
      if (!res.ok) {
        throw new Error("Failed to delete chit fund");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chitfunds"] });
      toast({
        title: "Success",
        description: "Chit fund deleted successfully",
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
            <TableHead>Members</TableHead>
            <TableHead>Commission</TableHead>
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
              <TableCell>{fund.memberCount}</TableCell>
              <TableCell>{formatCurrency(Number(fund.agentCommission))}</TableCell>
              <TableCell>
                <Badge 
                  variant={fund.status === "active" ? "default" : "secondary"}
                  className="capitalize"
                >
                  {fund.status}
                </Badge>
              </TableCell>
              <TableCell className="space-x-2">
                {userRole === "member" && (
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Chit Fund</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this chit fund? This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(fund.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}