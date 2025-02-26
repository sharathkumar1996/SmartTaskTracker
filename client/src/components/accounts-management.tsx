import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AccountsReceivable, AccountsPayable } from "@shared/schema";
import { PaymentForm } from "./payment-form";

export function AccountsManagement() {
  const { user } = useAuth();

  // Fetch receivables (money received from members)
  const { data: receivables = [], isLoading: isLoadingReceivables } = useQuery<AccountsReceivable[]>({
    queryKey: ["/api/receivables/user", user?.id],
    enabled: !!user,
  });

  // Fetch payables (money paid out as bonuses, withdrawals, commissions)
  const { data: payables = [], isLoading: isLoadingPayables } = useQuery<AccountsPayable[]>({
    queryKey: ["/api/payables/user", user?.id],
    enabled: !!user,
  });

  const formatCurrency = (amount: string | number) => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (isLoadingReceivables || isLoadingPayables) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="received" className="w-full">
        <TabsList>
          <TabsTrigger value="received">Money Received</TabsTrigger>
          <TabsTrigger value="paid">Money Paid</TabsTrigger>
        </TabsList>

        <TabsContent value="received">
          <div className="space-y-4">
            {(user?.role === "admin" || user?.role === "agent") && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="sm:max-w-xl">
                  <SheetHeader>
                    <SheetTitle>Record New Payment</SheetTitle>
                    <SheetDescription>
                      Record a new payment received from a member
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4">
                    <PaymentForm
                      type="receivable"
                      chitFundId={1} // This should be dynamic based on selected fund
                      userId={1} // This should be dynamic based on selected member
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Payments Received from Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {receivables.map((receivable) => (
                    <div
                      key={receivable.id}
                      className="flex items-center justify-between border-b py-2"
                    >
                      <div>
                        <p className="font-medium">
                          Month {receivable.monthNumber} - {receivable.paymentType.toUpperCase()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Received: {formatDate(receivable.receivedDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {formatCurrency(receivable.amount)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          via {receivable.paymentMethod.replace('_', ' ').toUpperCase()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {receivables.length === 0 && (
                    <p className="text-center text-muted-foreground">No payments received yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="paid">
          <div className="space-y-4">
            {user?.role === "admin" && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Record Payout
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="sm:max-w-xl">
                  <SheetHeader>
                    <SheetTitle>Record New Payout</SheetTitle>
                    <SheetDescription>
                      Record a new payout (bonus, withdrawal, or commission)
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-4">
                    <PaymentForm
                      type="payable"
                      chitFundId={1} // This should be dynamic based on selected fund
                      userId={1} // This should be dynamic based on selected member
                    />
                  </div>
                </SheetContent>
              </Sheet>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Payments Made (Bonuses, Withdrawals & Commissions)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {payables.map((payable) => (
                    <div
                      key={payable.id}
                      className="flex items-center justify-between border-b py-2"
                    >
                      <div>
                        <p className="font-medium">
                          {payable.paymentType.charAt(0).toUpperCase() + payable.paymentType.slice(1)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Paid: {formatDate(payable.paidDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(payable.amount)}</p>
                        {payable.notes && (
                          <p className="text-sm text-muted-foreground">{payable.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {payables.length === 0 && (
                    <p className="text-center text-muted-foreground">No payments made yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}