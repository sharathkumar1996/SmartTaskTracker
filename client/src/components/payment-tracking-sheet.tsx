import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface FundMemberPayment {
  month: number;
  amount: string;
  paymentDate: Date;
  paymentType?: string;
  notes?: string;
  isWithdrawal?: boolean;
}

interface FundMember {
  id: number;
  fullName: string;
  payments: FundMemberPayment[];
}

interface PaymentData {
  members: FundMember[];
}

interface PaymentTrackingSheetProps {
  fundId: number;
  fundName: string;
}

export function PaymentTrackingSheet({ fundId, fundName }: PaymentTrackingSheetProps) {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery<PaymentData>({
    queryKey: ["/api/chitfunds", fundId, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/chitfunds/${fundId}/payments`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch payments");
      }
      return res.json();
    },
  });

  const downloadSheet = () => {
    if (!data) {
      toast({
        title: "No data to download",
        description: "Please wait for the payment data to load",
        variant: "destructive",
      });
      return;
    }

    try {
      // Create header row with months
      const headers = ["Member Name"];
      for (let i = 1; i <= 20; i++) {
        headers.push(`Month ${i}`);
      }

      // Create rows for each member with withdrawal information
      const rows = data.members.map((member: FundMember) => {
        const row = [member.fullName];
        for (let month = 1; month <= 20; month++) {
          // Get all payments for this month
          const monthPayments = member.payments.filter(p => p.month === month);
          
          // Check if any payment is a withdrawal
          const hasWithdrawal = monthPayments.some(payment => 
            payment.isWithdrawal === true || 
            payment.paymentType === 'withdrawal' ||
            (payment.notes?.toLowerCase().includes('withdrawal') ?? false)
          );
          
          // Sum up all payments for this month - safely parse the amount
          const totalAmount = monthPayments.reduce((sum, p) => {
            // Handle potential parsing errors
            const amount = parseFloat(String(p.amount).replace(/[^\d.-]/g, ''));
            return sum + (isNaN(amount) ? 0 : amount);
          }, 0);
          
          // Add W to indicate withdrawal payments in CSV
          row.push(totalAmount > 0 ? 
            (hasWithdrawal ? `${totalAmount.toString()} (W)` : totalAmount.toString()) : 
            "");
        }
        return row;
      });

      // Combine all rows with organization header
      const csvContent = [
        ["Sri Vasavi Financial Services"],
        [`Payment Record - ${fundName}`],
        ["Generated on: " + new Date().toLocaleDateString("en-IN")],
        [""],
        headers,
        ...rows
      ]
        .map(row => row.map(val => {
          // Ensure proper CSV formatting by escaping quotes and commas
          const cellValue = String(val).replace(/"/g, '""');
          return cellValue.includes(',') ? `"${cellValue}"` : cellValue;
        }).join(","))
        .join("\n");

      // Create and trigger download
      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.setAttribute("hidden", "");
      a.setAttribute("href", url);
      a.setAttribute("download", `payment_sheet_${fundName.replace(/\s+/g, "_")}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: "Your payment sheet is being downloaded",
      });
    } catch (err) {
      console.error("Error downloading CSV:", err);
      toast({
        title: "Download failed",
        description: "There was an error creating the payment sheet",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Payment Data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive-foreground">{error instanceof Error ? error.message : "Unknown error occurred"}</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.members || data.members.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">No payment records found for this fund</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Sort members alphabetically by name
  const sortedMembers = [...data.members].sort((a, b) => 
    a.fullName.localeCompare(b.fullName)
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Payment Records</h2>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={downloadSheet} className="gap-2" variant="outline" size="sm">
            <Download className="h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px] rounded-md border">
            <div className="min-w-[1400px]"> {/* Ensure horizontal scrolling works */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-20 bg-background min-w-[180px]">Member</TableHead>
                    {Array.from({ length: 20 }, (_, i) => (
                      <TableHead key={i} className="text-right min-w-[100px]">
                        Month {i + 1}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium min-w-[180px]">
                        {member.fullName}
                      </TableCell>
                      {Array.from({ length: 20 }, (_, month) => {
                        const monthNumber = month + 1;
                        const monthPayments = member.payments.filter(
                          (p) => p.month === monthNumber
                        );
                        
                        // Safely calculate total amount
                        const totalAmount = monthPayments.reduce((sum, p) => {
                          const amount = parseFloat(String(p.amount).replace(/[^\d.-]/g, ''));
                          return sum + (isNaN(amount) ? 0 : amount);
                        }, 0);
                        
                        // Format the date of the most recent payment
                        let paymentDate = "";
                        if (monthPayments.length > 0) {
                          const mostRecentPayment = monthPayments.reduce((latest, current) => {
                            const latestDate = latest.paymentDate instanceof Date 
                              ? latest.paymentDate 
                              : new Date(latest.paymentDate);
                            
                            const currentDate = current.paymentDate instanceof Date 
                              ? current.paymentDate 
                              : new Date(current.paymentDate);
                              
                            return currentDate > latestDate ? current : latest;
                          }, monthPayments[0]);
                          
                          const date = mostRecentPayment.paymentDate instanceof Date 
                            ? mostRecentPayment.paymentDate 
                            : new Date(mostRecentPayment.paymentDate);
                            
                          paymentDate = date.toLocaleDateString("en-IN");
                        }
                        
                        // Check if any payment in this month is a withdrawal
                        // Using the direct isWithdrawal flag and multiple fallback checks
                        const hasWithdrawal = monthPayments.some(payment => {
                          // First check the direct flag we added
                          if (payment.isWithdrawal === true) {
                            return true;
                          }
                          
                          // Then check payment type
                          if (payment.paymentType === 'withdrawal') {
                            return true;
                          }
                          
                          // Finally check notes as a last resort
                          const notes = payment.notes?.toString().toLowerCase() || '';
                          
                          return notes.includes('withdrawal') || 
                                 notes.includes('withdrew') ||
                                 notes.includes('payout');
                        });
                        
                        return (
                          <TableCell 
                            key={month} 
                            className={`text-right min-w-[100px] ${hasWithdrawal ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                          >
                            {totalAmount > 0 ? (
                              <div>
                                <div className={`font-medium ${hasWithdrawal ? 'text-blue-600 dark:text-blue-300' : ''}`}>
                                  {formatCurrency(totalAmount)}
                                  {hasWithdrawal && ' (Withdrawal)'}
                                </div>
                                {monthPayments.length > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    {paymentDate}
                                    {monthPayments.length > 1 && (
                                      <span className="ml-1">
                                        ({monthPayments.length} payments)
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}