import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { Payment, AccountsPayable, ChitFund } from "@shared/schema";

export function AccountsManagement() {
  const { user } = useAuth();

  // Fetch all payments (money received)
  const { data: payments = [], isLoading: isLoadingPayments } = useQuery<Payment[]>({
    queryKey: ["/api/payments", user?.id],
    enabled: !!user,
  });

  // Fetch chit funds for reference
  const { data: chitFunds = [] } = useQuery<ChitFund[]>({
    queryKey: ["/api/chitfunds"],
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

  const getFundName = (fundId: number) => {
    const fund = chitFunds.find(f => f.id === fundId);
    return fund?.name || "Unknown Fund";
  };

  if (isLoadingPayments || isLoadingPayables) {
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
          <Card>
            <CardHeader>
              <CardTitle>Payments Received from Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between border-b py-2"
                  >
                    <div>
                      <p className="font-medium">
                        {getFundName(payment.chitFundId)} - Month {payment.monthNumber}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Received: {formatDate(payment.paymentDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(payment.amount)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        via {payment.paymentMethod.replace('_', ' ').toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
                {payments.length === 0 && (
                  <p className="text-center text-muted-foreground">No payments received yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid">
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
                        {getFundName(payable.chitFundId)} - {payable.paymentType.charAt(0).toUpperCase() + payable.paymentType.slice(1)}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}