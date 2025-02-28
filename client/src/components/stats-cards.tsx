import { ChitFund, Payment, User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wallet, Coins, CreditCard } from "lucide-react";
import { formatCurrency, isCashPaymentMethod, isDigitalPaymentMethod, parseAmount } from "@/lib/utils";

interface StatsCardsProps {
  chitFunds: ChitFund[];
  payments: Payment[];
  role: string;
  users: User[];
}

export function StatsCards({ chitFunds, payments, role, users }: StatsCardsProps) {
  // Calculate total active funds safely
  const totalFunds = chitFunds?.filter(fund => fund.status === "active").length ?? 0;

  // Calculate active members safely
  const activeMembers = users?.filter(u => u.role === "member" && u.status === "active").length ?? 0;

  // Calculate total cash payments using standardized utility function
  const totalCashAmount = payments?.reduce((sum, payment) => {
    try {
      // Only include cash payments using shared utility function
      if (!isCashPaymentMethod(payment.paymentMethod)) {
        return sum;
      }
      
      // Use shared parseAmount utility to safely convert amount
      const amount = parseAmount(payment.amount);
      
      // Add debugging
      if (amount > 0) {
        console.log(`Found cash payment: ${amount}`);
      }
      
      return sum + amount;
    } catch (e) {
      console.error('Error processing cash payment amount:', e);
      return sum;
    }
  }, 0) ?? 0;

  // Calculate total digital payments using standardized utility function
  const totalDigitalAmount = payments?.reduce((sum, payment) => {
    try {
      // Use shared utility function for consistent digital payment detection
      if (!isDigitalPaymentMethod(payment.paymentMethod)) {
        return sum;
      }
      
      // Use shared parseAmount utility to safely convert amount
      const amount = parseAmount(payment.amount);
      
      // Add debugging
      if (amount > 0) {
        console.log(`Found digital payment (${payment.paymentMethod}): ${amount}`);
      }
      
      return sum + amount;
    } catch (e) {
      console.error('Error processing digital payment amount:', e);
      return sum;
    }
  }, 0) ?? 0;
  
  // Log totals for debugging
  console.log(`Total cash amount: ${totalCashAmount}`);
  console.log(`Total digital amount: ${totalDigitalAmount}`);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {(role === "admin" || role === "agent") && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeMembers}</div>
            <p className="text-xs text-muted-foreground">Current active members</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Active Funds</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalFunds}</div>
          <p className="text-xs text-muted-foreground">Currently active chit funds</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Amount in Kitty (Cash)</CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalCashAmount)}</div>
          <p className="text-xs text-muted-foreground">Total cash collected</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Amount in Bank (Digital)</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalDigitalAmount)}</div>
          <p className="text-xs text-muted-foreground">Total digital payments received</p>
        </CardContent>
      </Card>
    </div>
  );
}