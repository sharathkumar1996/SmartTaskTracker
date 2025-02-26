import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export const AccountsManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);

  // Query for received payments (accounts receivable)
  const receivablesQuery = useQuery({
    queryKey: ['/api/accounts/receivables'],
    retry: 1,
  });

  // Query for paid amounts (accounts payable)
  const payablesQuery = useQuery({
    queryKey: ['/api/accounts/payables'],
    retry: 1,
  });

  // Mutation to sync payments to receivables
  const syncMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/sync-payments-to-receivables");
    },
    onSuccess: () => {
      toast({
        title: "Sync Completed",
        description: "Payment data synchronized to accounts successfully.",
      });
      // Invalidate the queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/receivables'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts/payables'] });
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

export default AccountsManagement;