import { ChitFund, Payment, User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Wallet, Coins, CreditCard } from "lucide-react";

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

  // Calculate total cash payments (payment_method === 'cash')
  const totalCashAmount = payments?.reduce((sum, payment) => {
    try {
      // Only include cash payments - make sure we check for case issues too
      const method = String(payment.paymentMethod || '').toLowerCase();
      if (method !== 'cash') {
        return sum;
      }
      
      // Handle both string and number types for amount
      const numAmount = typeof payment.amount === 'string' 
        ? parseFloat(payment.amount) 
        : Number(payment.amount);
      
      // Add debugging
      if (!isNaN(numAmount) && numAmount > 0) {
        console.log(`Found cash payment: ${numAmount}`);
      }
      
      return sum + (isNaN(numAmount) ? 0 : numAmount);
    } catch (e) {
      console.error('Error processing cash payment amount:', e);
      return sum;
    }
  }, 0) ?? 0;

  // Calculate total digital payments (payment_method === 'google_pay', 'phone_pay', 'online_portal')
  const totalDigitalAmount = payments?.reduce((sum, payment) => {
    try {
      // Normalize the payment method to handle case differences
      const method = String(payment.paymentMethod || '').toLowerCase();
      
      // Only include digital payment methods
      if (method !== 'google_pay' && 
          method !== 'phone_pay' && 
          method !== 'online_portal') {
        return sum;
      }
      
      // Handle both string and number types for amount
      const numAmount = typeof payment.amount === 'string' 
        ? parseFloat(payment.amount) 
        : Number(payment.amount);
      
      // Add debugging
      if (!isNaN(numAmount) && numAmount > 0) {
        console.log(`Found digital payment (${method}): ${numAmount}`);
      }
      
      return sum + (isNaN(numAmount) ? 0 : numAmount);
    } catch (e) {
      console.error('Error processing digital payment amount:', e);
      return sum;
    }
  }, 0) ?? 0;
  
  // Log totals for debugging
  console.log(`Total cash amount: ${totalCashAmount}`);
  console.log(`Total digital amount: ${totalDigitalAmount}`);

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