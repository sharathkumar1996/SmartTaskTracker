import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { AccountsReceivable, AccountsPayable } from "@shared/schema";

export function AccountsManagement() {
  const { user } = useAuth();

  // Fetch receivables
  const { data: receivables = [], isLoading: isLoadingReceivables } = useQuery<AccountsReceivable[]>({
    queryKey: ["/api/receivables/user", user?.id],
    enabled: !!user,
  });

  // Fetch payables
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

  const formatDate = (date: string) => {
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
      <Tabs defaultValue="receivables" className="w-full">
        <TabsList>
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
        </TabsList>

        <TabsContent value="receivables">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Payments Due</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {receivables.map((receivable) => (
                  <div
                    key={receivable.id}
                    className="flex items-center justify-between border-b py-2"
                  >
                    <div>
                      <p className="font-medium">Month {receivable.monthNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        Due: {formatDate(receivable.dueDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        {formatCurrency(receivable.expectedAmount)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Paid: {formatCurrency(receivable.paidAmount)}
                      </p>
                    </div>
                    <div className="ml-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          receivable.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : receivable.status === "partial"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {receivable.status.charAt(0).toUpperCase() + receivable.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payables">
          <Card>
            <CardHeader>
              <CardTitle>Expected Payments</CardTitle>
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
                        Due: {formatDate(payable.dueDate)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(payable.amount)}</p>
                      <p className="text-sm text-muted-foreground">
                        Paid: {formatCurrency(payable.paidAmount)}
                      </p>
                    </div>
                    <div className="ml-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          payable.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : payable.status === "partial"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {payable.status.charAt(0).toUpperCase() + payable.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
