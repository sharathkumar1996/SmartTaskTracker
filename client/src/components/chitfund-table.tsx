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
import { Badge } from "@/components/ui/badge";

interface ChitFundTableProps {
  chitFunds: ChitFund[];
  userRole: string;
  userId: number;
}

export function ChitFundTable({ chitFunds, userRole, userId }: ChitFundTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
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
            {userRole === "member" && <TableHead>Actions</TableHead>}
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
                >
                  {fund.status}
                </Badge>
              </TableCell>
              {userRole === "member" && (
                <TableCell>
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
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
