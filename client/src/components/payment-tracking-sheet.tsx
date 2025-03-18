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
  shareIdentifier?: string;
  increasedMonthlyAmount?: string;
  customFundAmount?: string;
  isWithdrawn?: boolean;
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
  
  // Fetch fund details to get the start date for month calculations
  const { data: fundDetails } = useQuery({
    queryKey: ["/api/chitfunds", fundId],
    queryFn: async () => {
      const res = await fetch(`/api/chitfunds/${fundId}`);
      if (!res.ok) throw new Error("Failed to fetch fund details");
      return res.json();
    },
  });
  
  // Fetch payment data for members
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
      // Create a more structured A4 template format
      
      // Create top headers for the payment tracking template
      const templateHeaders = [
        ["SRI VASAVI FINANCIAL SERVICES"],
        [`CHIT FUND: ${fundName.toUpperCase()}`],
        ["PAYMENT RECORD"],
        ["Generated on: " + new Date().toLocaleDateString("en-IN")],
        [""],
      ];
      
      // Member number column and name column
      const mainHeaders = ["S.No", "Member Name"];
      
      // Calculate month labels (Jul-24 format) based on fund start date
      const getMonthLabels = () => {
        const labels = [];
        
        // Default to current date if start date not available
        const startDate = fundDetails?.startDate 
          ? new Date(fundDetails.startDate) 
          : new Date();
        
        // Create month labels for each month (1-20)
        for (let i = 0; i < 20; i++) {
          const monthDate = new Date(startDate);
          monthDate.setMonth(monthDate.getMonth() + i);
          
          // Format as "MMM-YY" (e.g., "Jul-24")
          const monthName = monthDate.toLocaleString('en-US', { month: 'short' });
          const year = monthDate.getFullYear().toString().slice(2);
          labels.push(`${monthName}-${year}`);
        }
        
        return labels;
      };
      
      // Get month labels based on fund start date
      const monthLabels = fundDetails ? getMonthLabels() : Array(20).fill("").map((_, i) => `Month ${i+1}`);
      
      // Add month columns with proper labels
      monthLabels.forEach(label => {
        mainHeaders.push(label);
      });
      
      // Add signature column at the end
      mainHeaders.push("Signature");
      
      // Sort members alphabetically for better organization
      const sortedMembers = [...data.members].sort((a, b) => 
        a.fullName.localeCompare(b.fullName)
      );
      
      // Create rows for each member with proper formatting for A4 sheet
      const memberRows = sortedMembers.map((member: FundMember, index) => {
        // Start with member number and name
        let memberName = member.fullName;
        
        // Add share identifier if present
        if (member.shareIdentifier) {
          memberName += ` (${member.shareIdentifier})`;
        }
        
        // Add custom fund amount if present
        if (member.customFundAmount) {
          memberName += ` [Custom: ${formatCurrency(member.customFundAmount)}]`;
        } 
        // Or add custom monthly amount if present
        else if (member.increasedMonthlyAmount) {
          memberName += ` [Monthly: ${formatCurrency(member.increasedMonthlyAmount)}]`;
        }
        
        const row = [(index + 1).toString(), memberName];
        
        // Add payment data for each month
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
          
          // Format cell with payment amount and withdrawal indicator if needed
          row.push(totalAmount > 0 ? 
            (hasWithdrawal ? `${totalAmount.toString()} (W)` : totalAmount.toString()) : 
            "");
        }
        
        // Add empty signature column
        row.push("");
        
        return row;
      });
      
      // Add a row with totals at the bottom
      const totalRow = ["", "TOTAL"];
      
      // Calculate totals for each month
      for (let month = 1; month <= 20; month++) {
        let monthTotal = 0;
        
        // Sum all payments for this month across all members
        sortedMembers.forEach(member => {
          const monthPayments = member.payments.filter(p => p.month === month);
          const memberTotal = monthPayments.reduce((sum, p) => {
            const amount = parseFloat(String(p.amount).replace(/[^\d.-]/g, ''));
            return sum + (isNaN(amount) ? 0 : amount);
          }, 0);
          
          monthTotal += memberTotal;
        });
        
        totalRow.push(monthTotal > 0 ? monthTotal.toString() : "");
      }
      
      // Add empty cell for signature column in totals row
      totalRow.push("");
      
      // Combine all parts to create the complete CSV template
      const csvContent = [
        ...templateHeaders,
        mainHeaders,
        ...memberRows,
        [], // Empty row before totals
        totalRow
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
      a.setAttribute("download", `payment_record_${fundName.replace(/\s+/g, "_")}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "A4 Payment Record Downloaded",
        description: "Your payment tracking sheet has been downloaded in CSV format",
      });
    } catch (err) {
      console.error("Error downloading CSV:", err);
      toast({
        title: "Download failed",
        description: "There was an error creating the payment record sheet",
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
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold">Payment Records</h2>
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm" className="gap-1">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={downloadSheet} className="gap-2" variant="outline" size="sm">
              <Download className="h-4 w-4" />
              Download A4 Payment Template
            </Button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground">
          <p>Download the A4-sized payment template to print and track monthly payments on paper. Open the CSV file in Excel or Google Sheets before printing.</p>
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
                    {Array.from({ length: 20 }, (_, i) => {
                      // Get month name in "MMM-YY" format if fund details are available
                      let monthLabel = `Month ${i + 1}`;
                      
                      if (fundDetails?.startDate) {
                        const startDate = new Date(fundDetails.startDate);
                        const monthDate = new Date(startDate);
                        monthDate.setMonth(monthDate.getMonth() + i);
                        
                        const monthName = monthDate.toLocaleString('en-US', { month: 'short' });
                        const year = monthDate.getFullYear().toString().slice(2);
                        monthLabel = `${monthName}-${year}`;
                      }
                      
                      return (
                        <TableHead key={i} className="text-right min-w-[100px]">
                          {monthLabel}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="sticky left-0 z-10 bg-background font-medium min-w-[220px]">
                        <div>
                          {member.fullName}
                          {member.shareIdentifier && (
                            <span className="text-xs ml-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 px-1.5 py-0.5 rounded">
                              {member.shareIdentifier}
                            </span>
                          )}
                        </div>
                        {(member.customFundAmount || member.increasedMonthlyAmount) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {member.customFundAmount && (
                              <span className="bg-green-50 text-green-700 dark:bg-green-900 dark:text-green-200 px-1.5 py-0.5 rounded">
                                Custom: {formatCurrency(member.customFundAmount)}
                              </span>
                            )}
                            {member.increasedMonthlyAmount && (
                              <span className="bg-amber-50 text-amber-700 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded">
                                Monthly: {formatCurrency(member.increasedMonthlyAmount)}
                              </span>
                            )}
                          </div>
                        )}
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