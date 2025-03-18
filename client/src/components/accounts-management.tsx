import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate, isDigitalPaymentMethod, isCashPaymentMethod, parseAmount } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// Define types for accounts receivable and payable
interface AccountsReceivable {
  id: number;
  userId: number;
  userName?: string;
  chitFundId: number;
  fundName?: string;
  monthNumber: number;
  expectedAmount: string;
  paidAmount: string;
  status: 'paid' | 'partial' | 'overdue' | 'pending';
  dueDate?: string;
  createdAt: string;
  updatedAt?: string;
}

interface AccountsPayable {
  id: number;
  userId: number;
  userName?: string;
  chitFundId: number;
  fundName?: string;
  paymentType: 'withdrawal' | 'bonus' | 'other';
  amount: string;
  commission?: string;
  paidDate: string;
  paymentMethod: 'cash' | 'bank_transfer' | 'google_pay' | 'phone_pay' | 'online_portal' | 'other';
  notes?: string;
}

export const AccountsManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [cashBalance, setCashBalance] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);

  // Query for received payments (accounts receivable)
  const receivablesQuery = useQuery<AccountsReceivable[]>({
    queryKey: ['/api/accounts/receivables'],
    queryFn: async () => {
      const response = await fetch('/api/accounts/receivables');
      if (!response.ok) {
        throw new Error('Failed to load receivables data');
      }
      return response.json();
    },
    retry: 1,
  });

  // Query for paid amounts (accounts payable)
  const payablesQuery = useQuery<AccountsPayable[]>({
    queryKey: ['/api/accounts/payables'],
    // Using the default queryFn provided through QueryClient
    // This ensures auth headers are properly sent
  });
  
  // Fetch additional dashboard data for payment summaries 
  // to make sure we're consistent with the dashboard
  const { data: paymentsData } = useQuery({
    queryKey: ['/api/payments'],
    // Using the default queryFn provided through QueryClient
    // This ensures auth headers are properly sent
  });

  // Calculate balances when payment data changes
  React.useEffect(() => {
    if (paymentsData && Array.isArray(paymentsData)) {
      console.log("Calculating balances from payments data:", paymentsData.length);
      // Calculate cash and bank balances from all payments
      let cashTotal = 0;
      let bankTotal = 0;

      paymentsData.forEach((payment: any) => {
        const amount = parseAmount(payment.amount);
        
        // Use utility functions for consistent payment method handling
        if (isCashPaymentMethod(payment.paymentMethod)) {
          console.log(`Found cash payment: ${amount}`);
          cashTotal += amount;
        } else if (isDigitalPaymentMethod(payment.paymentMethod)) {
          console.log(`Found digital payment (${payment.paymentMethod}): ${amount}`);
          bankTotal += amount;
        }
      });

      console.log(`Total cash amount: ${cashTotal}`);
      console.log(`Total digital amount: ${bankTotal}`);
      
      setCashBalance(cashTotal);
      setBankBalance(bankTotal);
    }
  }, [paymentsData]);

  // Mutation to sync payments to receivables
  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sync-payments-to-receivables");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to sync payments");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sync Completed",
        description: "Payment data synchronized to accounts successfully.",
      });
      // Invalidate the queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/receivables'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/payables'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments'] });
      setIsSyncing(false);
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "An error occurred during sync",
        variant: "destructive",
      });
      setIsSyncing(false);
    }
  });

  const handleSyncClick = () => {
    setIsSyncing(true);
    syncMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Account Management</h2>
        <Button 
          onClick={handleSyncClick} 
          disabled={isSyncing} 
          className="flex items-center gap-2"
        >
          {isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isSyncing ? "Syncing..." : "Sync Payments to Accounts"}
        </Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Cash Balance</CardTitle>
            <CardDescription>Total funds disbursed via cash</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(cashBalance)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Bank Balance</CardTitle>
            <CardDescription>Total funds disbursed via bank transfers and online methods</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(bankBalance)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="received">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="received">Money Received</TabsTrigger>
          <TabsTrigger value="paid">Money Paid</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Money Received</CardTitle>
              <CardDescription>
                Track all payments received from members.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {receivablesQuery.isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : receivablesQuery.isError ? (
                <div className="text-center p-8 text-red-500">
                  Error loading receivables data.
                </div>
              ) : !receivablesQuery.data || receivablesQuery.data.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  No receivables data available.
                </div>
              ) : (
                <Table>
                  <TableCaption>A list of all money received.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Fund</TableHead>
                      <TableHead>Month</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivablesQuery.data.map((receivable) => (
                      <TableRow key={receivable.id}>
                        <TableCell>{formatDate(receivable.dueDate || receivable.createdAt)}</TableCell>
                        <TableCell>{receivable.userName || `User ${receivable.userId}`}</TableCell>
                        <TableCell>{receivable.fundName || `Fund ${receivable.chitFundId}`}</TableCell>
                        <TableCell>{receivable.monthNumber}</TableCell>
                        <TableCell>{formatCurrency(receivable.expectedAmount)}</TableCell>
                        <TableCell>{formatCurrency(receivable.paidAmount)}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            receivable.status === 'paid' 
                              ? 'bg-green-100 text-green-800' 
                              : receivable.status === 'overdue' 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {receivable.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="paid" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Money Paid</CardTitle>
              <CardDescription>
                Track all payments made to members.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {payablesQuery.isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : payablesQuery.isError ? (
                <div className="text-center p-8 text-red-500">
                  Error loading payables data.
                </div>
              ) : !payablesQuery.data || payablesQuery.data.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground">
                  No payables data available.
                </div>
              ) : (
                <Table>
                  <TableCaption>A list of all money paid.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Fund</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Payment Method</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payablesQuery.data.map((payable) => (
                      <TableRow key={payable.id}>
                        <TableCell>{formatDate(payable.paidDate)}</TableCell>
                        <TableCell>{payable.userName || `User ${payable.userId}`}</TableCell>
                        <TableCell>{payable.fundName || `Fund ${payable.chitFundId}`}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            payable.paymentType === 'withdrawal' 
                              ? 'bg-blue-100 text-blue-800' 
                              : payable.paymentType === 'bonus' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-purple-100 text-purple-800'
                          }`}>
                            {payable.paymentType}
                          </span>
                        </TableCell>
                        <TableCell>{formatCurrency(payable.amount)}</TableCell>
                        <TableCell>{payable.commission ? formatCurrency(payable.commission) : '-'}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            payable.paymentMethod === 'cash' 
                              ? 'bg-amber-100 text-amber-800' 
                              : payable.paymentMethod === 'bank_transfer' 
                                ? 'bg-indigo-100 text-indigo-800' 
                                : 'bg-cyan-100 text-cyan-800'
                          }`}>
                            {payable.paymentMethod === 'cash' ? 'Cash' :
                             payable.paymentMethod === 'bank_transfer' ? 'Bank Transfer' :
                             payable.paymentMethod === 'google_pay' ? 'Google Pay' :
                             payable.paymentMethod === 'phone_pay' ? 'Phone Pay' :
                             payable.paymentMethod === 'online_portal' ? 'Online Portal' :
                             'Other'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};