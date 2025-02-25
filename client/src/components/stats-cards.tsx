import { ChitFund, Payment, User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wallet, CreditCard, TrendingUp } from "lucide-react";

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

  // Calculate total collections with safe type handling
  const totalPayments = payments?.reduce((sum, payment) => {
    try {
      // Handle both string and number types for amount
      const numAmount = typeof payment.amount === 'string' 
        ? parseFloat(payment.amount) 
        : Number(payment.amount);
      return sum + (isNaN(numAmount) ? 0 : numAmount);
    } catch (e) {
      console.error('Error processing payment amount:', e);
      return sum;
    }
  }, 0) ?? 0;

  // Calculate average payment with validation
  const validPaymentsCount = payments?.filter(payment => {
    try {
      const numAmount = typeof payment.amount === 'string'
        ? parseFloat(payment.amount)
        : Number(payment.amount);
      return !isNaN(numAmount) && numAmount > 0;
    } catch {
      return false;
    }
  }).length ?? 0;

  const averagePayment = validPaymentsCount > 0 ? totalPayments / validPaymentsCount : 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  };

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
          <CardTitle className="text-sm font-medium">Total Collections</CardTitle>
          <CreditCard className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalPayments)}</div>
          <p className="text-xs text-muted-foreground">Total amount collected till date</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Average Transaction</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(averagePayment)}</div>
          <p className="text-xs text-muted-foreground">Per transaction amount</p>
        </CardContent>
      </Card>
    </div>
  );
}