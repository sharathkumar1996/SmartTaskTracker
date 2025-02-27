import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PlusCircle, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";

// Financial transaction types
type TransactionType = 
  | "admin_borrow" 
  | "admin_repay" 
  | "external_loan" 
  | "loan_repayment" 
  | "agent_salary" 
  | "expense" 
  | "other_income";

type PaymentMethod = 
  | "cash" 
  | "bank_transfer" 
  | "google_pay" 
  | "phone_pay" 
  | "online_portal";

interface FinancialTransaction {
  id: number;
  transactionDate: string;
  amount: string;
  transactionType: TransactionType;
  paymentMethod: PaymentMethod;
  description?: string;
  interestRate?: string;
  lenderName?: string;
  agentId?: number;
  agentName?: string;
  recordedBy: number;
  documentUrl?: string;
  gstEligible: boolean;
  hsn?: string;
  gstRate?: string;
  gstAmount?: string;
  notes?: string;
}

interface FinancialSummary {
  adminBorrowTotal: number;
  adminRepayTotal: number;
  adminNetDebt: number;
  externalLoanTotal: number;
  loanRepaymentTotal: number;
  externalNetDebt: number;
  agentSalaryTotal: number;
  gstTotal: number;
}

export function FinancialManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [formValues, setFormValues] = useState({
    transactionDate: new Date().toISOString().split('T')[0],
    amount: "",
    transactionType: "expense" as TransactionType,
    paymentMethod: "cash" as PaymentMethod,
    description: "",
    interestRate: "",
    lenderName: "",
    agentId: "",
    documentUrl: "",
    gstEligible: false,
    hsn: "",
    gstRate: "",
    gstAmount: "",
    notes: "",
  });

  // Queries for financial transactions and summary
  const transactionsQuery = useQuery<FinancialTransaction[]>({
    queryKey: ['/api/financial-transactions'],
    enabled: user?.role === "admin",
  });

  const summaryQuery = useQuery<FinancialSummary>({
    queryKey: ['/api/financial-transactions/summary'],
    enabled: user?.role === "admin",
  });

  const agentsQuery = useQuery<any[]>({
    queryKey: ['/api/users/agents'],
    enabled: user?.role === "admin" && formValues.transactionType === "agent_salary",
    // Default to empty array if data is not available
    initialData: [],
  });

  // Mutation for creating transactions
  const createTransactionMutation = useMutation({
    mutationFn: async (transaction: any) => {
      return await apiRequest("POST", "/api/financial-transactions", transaction);
    },
    onSuccess: () => {
      toast({
        title: "Transaction Recorded",
        description: "Financial transaction has been recorded successfully.",
      });
      // Reset form and refresh queries
      setFormValues({
        transactionDate: new Date().toISOString().split('T')[0],
        amount: "",
        transactionType: "expense" as TransactionType,
        paymentMethod: "cash" as PaymentMethod,
        description: "",
        interestRate: "",
        lenderName: "",
        agentId: "",
        documentUrl: "",
        gstEligible: false,
        hsn: "",
        gstRate: "",
        gstAmount: "",
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/financial-transactions/summary'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record transaction",
        variant: "destructive",
      });
    }
  });

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));

    // Calculate GST amount automatically when amount and rate are provided
    if (name === "gstRate" && formValues.amount && formValues.gstEligible) {
      const amount = parseFloat(formValues.amount);
      const rate = parseFloat(value);
      if (!isNaN(amount) && !isNaN(rate)) {
        const gstAmount = (amount * rate / 100).toFixed(2);
        setFormValues(prev => ({ ...prev, gstAmount }));
      }
    } else if (name === "amount" && formValues.gstRate && formValues.gstEligible) {
      const amount = parseFloat(value);
      const rate = parseFloat(formValues.gstRate);
      if (!isNaN(amount) && !isNaN(rate)) {
        const gstAmount = (amount * rate / 100).toFixed(2);
        setFormValues(prev => ({ ...prev, gstAmount }));
      }
    }
  };

  // Handle select changes
  const handleSelectChange = (name: string, value: string) => {
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  // Handle checkbox changes
  const handleCheckboxChange = (name: string, checked: boolean) => {
    setFormValues(prev => ({ ...prev, [name]: checked }));
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    if (!formValues.amount || parseFloat(formValues.amount) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (formValues.transactionType === "external_loan" && !formValues.lenderName) {
      toast({
        title: "Validation Error",
        description: "Please enter the lender's name for external loans",
        variant: "destructive",
      });
      return;
    }

    if (formValues.transactionType === "agent_salary" && !formValues.agentId) {
      toast({
        title: "Validation Error",
        description: "Please select an agent for agent salary payments",
        variant: "destructive",
      });
      return;
    }

    // Create transaction object
    const transaction = {
      ...formValues,
      // Keep the date as ISO string instead of converting to Date object
      transactionDate: formValues.transactionDate,
      amount: formValues.amount,
      agentId: formValues.agentId ? parseInt(formValues.agentId) : undefined,
      recordedBy: user?.id
    };

    // Submit transaction
    createTransactionMutation.mutate(transaction);
  };

  // Helper function to get transaction type label
  const getTransactionTypeLabel = (type: TransactionType) => {
    switch (type) {
      case "admin_borrow": return "Admin Borrowed";
      case "admin_repay": return "Admin Repaid";
      case "external_loan": return "External Loan";
      case "loan_repayment": return "Loan Repayment";
      case "agent_salary": return "Agent Salary";
      case "expense": return "Expense";
      case "other_income": return "Other Income";
      default: return type;
    }
  };

  // Helper function to get payment method label
  const getPaymentMethodLabel = (method: PaymentMethod) => {
    switch (method) {
      case "cash": return "Cash";
      case "bank_transfer": return "Bank Transfer";
      case "google_pay": return "Google Pay";
      case "phone_pay": return "Phone Pay";
      case "online_portal": return "Online Portal";
      default: return method;
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              Only administrators can access the financial management features.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Financial Management</h2>
        <Sheet>
          <SheetTrigger asChild>
            <Button className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Record Transaction
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="sm:max-w-xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Record Financial Transaction</SheetTitle>
              <SheetDescription>
                Record administrative transactions, external loans, agent salaries, and other financial activities.
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={handleSubmit} className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="transactionDate">Transaction Date</Label>
                    <Input
                      id="transactionDate"
                      name="transactionDate"
                      type="date"
                      value={formValues.transactionDate}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (₹)</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formValues.amount}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transactionType">Transaction Type</Label>
                  <Select 
                    onValueChange={(value) => handleSelectChange("transactionType", value)}
                    value={formValues.transactionType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select transaction type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin_borrow">Admin Borrowed</SelectItem>
                      <SelectItem value="admin_repay">Admin Repaid</SelectItem>
                      <SelectItem value="external_loan">External Loan</SelectItem>
                      <SelectItem value="loan_repayment">Loan Repayment</SelectItem>
                      <SelectItem value="agent_salary">Agent Salary</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="other_income">Other Income</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Payment Method</Label>
                  <Select 
                    onValueChange={(value) => handleSelectChange("paymentMethod", value)}
                    value={formValues.paymentMethod}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="google_pay">Google Pay</SelectItem>
                      <SelectItem value="phone_pay">Phone Pay</SelectItem>
                      <SelectItem value="online_portal">Online Portal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Brief description of the transaction"
                    value={formValues.description}
                    onChange={handleInputChange}
                  />
                </div>

                {/* Conditional Fields */}
                {(formValues.transactionType === "external_loan" || formValues.transactionType === "loan_repayment") && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="lenderName">Lender Name</Label>
                      <Input
                        id="lenderName"
                        name="lenderName"
                        placeholder="Name of the lender"
                        value={formValues.lenderName}
                        onChange={handleInputChange}
                        required={formValues.transactionType === "external_loan"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="interestRate">Interest Rate (%)</Label>
                      <Input
                        id="interestRate"
                        name="interestRate"
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formValues.interestRate}
                        onChange={handleInputChange}
                      />
                    </div>
                  </>
                )}

                {formValues.transactionType === "agent_salary" && (
                  <div className="space-y-2">
                    <Label htmlFor="agentId">Agent</Label>
                    <Select 
                      onValueChange={(value) => handleSelectChange("agentId", value)}
                      value={formValues.agentId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {agentsQuery.data?.map((agent: any) => (
                          <SelectItem key={agent.id} value={agent.id.toString()}>
                            {agent.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* GST Section */}
                <div className="space-y-2 pt-4 border-t">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="gstEligible" 
                      checked={formValues.gstEligible}
                      onCheckedChange={(checked) => 
                        handleCheckboxChange("gstEligible", checked === true)
                      }
                    />
                    <Label htmlFor="gstEligible">GST Applicable</Label>
                  </div>

                  {formValues.gstEligible && (
                    <div className="pt-2 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="hsn">HSN/SAC Code</Label>
                          <Input
                            id="hsn"
                            name="hsn"
                            placeholder="HSN/SAC Code"
                            value={formValues.hsn}
                            onChange={handleInputChange}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="gstRate">GST Rate (%)</Label>
                          <Input
                            id="gstRate"
                            name="gstRate"
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={formValues.gstRate}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gstAmount">GST Amount (₹)</Label>
                        <Input
                          id="gstAmount"
                          name="gstAmount"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formValues.gstAmount}
                          onChange={handleInputChange}
                          readOnly
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Additional Notes</Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    placeholder="Any additional notes"
                    value={formValues.notes}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button type="button" variant="outline">Cancel</Button>
                </SheetClose>
                <Button 
                  type="submit" 
                  disabled={createTransactionMutation.isPending}
                  className="flex items-center gap-2"
                >
                  {createTransactionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Transaction
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </div>

      {/* Tabs for Financial Data */}
      <Tabs defaultValue="summary" className="space-y-6">
        <TabsList>
          <TabsTrigger value="summary">Financial Summary</TabsTrigger>
          <TabsTrigger value="transactions">All Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6">
          {summaryQuery.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : summaryQuery.isError ? (
            <Card>
              <CardHeader>
                <CardTitle>Error</CardTitle>
                <CardDescription>Failed to load financial summary data</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  variant="outline" 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/financial-transactions/summary'] })}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Admin Funds Usage
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Borrowed:</span>
                      <span className="font-semibold">{formatCurrency(summaryQuery.data?.adminBorrowTotal || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Repaid:</span>
                      <span className="font-semibold">{formatCurrency(summaryQuery.data?.adminRepayTotal || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net Outstanding:</span>
                      <span className={`font-semibold ${(summaryQuery.data?.adminNetDebt || 0) > 0 ? "text-red-500" : "text-green-500"}`}>
                        {formatCurrency(summaryQuery.data?.adminNetDebt || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    External Loans
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Borrowed:</span>
                      <span className="font-semibold">{formatCurrency(summaryQuery.data?.externalLoanTotal || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Repaid:</span>
                      <span className="font-semibold">{formatCurrency(summaryQuery.data?.loanRepaymentTotal || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm font-medium">Net Outstanding:</span>
                      <span className={`font-semibold ${(summaryQuery.data?.externalNetDebt || 0) > 0 ? "text-red-500" : "text-green-500"}`}>
                        {formatCurrency(summaryQuery.data?.externalNetDebt || 0)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    Other Financial Details
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Agent Salaries Paid:</span>
                      <span className="font-semibold">{formatCurrency(summaryQuery.data?.agentSalaryTotal || 0)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">GST Collected:</span>
                      <span className="font-semibold">{formatCurrency(summaryQuery.data?.gstTotal || 0)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions">
          {transactionsQuery.isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : transactionsQuery.isError ? (
            <Card>
              <CardHeader>
                <CardTitle>Error</CardTitle>
                <CardDescription>Failed to load transactions data</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button 
                  variant="outline" 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/financial-transactions'] })}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </Button>
              </CardFooter>
            </Card>
          ) : transactionsQuery.data?.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No Transactions</CardTitle>
                <CardDescription>No financial transactions have been recorded yet.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableCaption>A list of all financial transactions</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>GST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactionsQuery.data?.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{formatDate(new Date(transaction.transactionDate))}</TableCell>
                      <TableCell>{getTransactionTypeLabel(transaction.transactionType)}</TableCell>
                      <TableCell>{formatCurrency(transaction.amount)}</TableCell>
                      <TableCell>{getPaymentMethodLabel(transaction.paymentMethod)}</TableCell>
                      <TableCell className="max-w-xs truncate">{transaction.description || '-'}</TableCell>
                      <TableCell>
                        {transaction.gstEligible ? formatCurrency(transaction.gstAmount) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}