import { useState } from "react";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Download, Loader2 } from "lucide-react";
import type { Payment } from "@shared/schema";
import type { DateRange } from "react-day-picker";

interface FinancialReportProps {
  chitFundId?: number;
}

export function FinancialReport({ chitFundId }: FinancialReportProps) {
  const [dateRange, setDateRange] = useState<DateRange>();

  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments/report", chitFundId, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (chitFundId) params.append("fundId", chitFundId.toString());
      if (dateRange?.from) params.append("from", dateRange.from.toISOString());
      if (dateRange?.to) {
        // Set the end time to the end of the day
        const endDate = new Date(dateRange.to);
        endDate.setHours(23, 59, 59, 999);
        params.append("to", endDate.toISOString());
      }

      const res = await fetch(`/api/payments/report?${params}`);
      if (!res.ok) throw new Error("Failed to fetch payment report");
      return res.json();
    },
    enabled: !!dateRange?.from,
  });

  const downloadReport = () => {
    if (!payments.length) return;

    const headers = [
      "Date",
      "Member ID",
      "Fund ID",
      "Amount",
      "Payment Type",
      "Payment Method",
      "Notes"
    ];

    const rows = payments.map(payment => [
      new Date(payment.paymentDate).toLocaleDateString(),
      payment.userId.toString(),
      payment.chitFundId.toString(),
      payment.amount,
      payment.paymentType,
      payment.paymentMethod,
      payment.notes || ""
    ]);

    const csvContent = [
      ["Sri Vasavi Financial Services"],
      ["Financial Report"],
      [`Period: ${dateRange?.from?.toLocaleDateString()} to ${dateRange?.to?.toLocaleDateString()}`],
      [""],
      headers,
      ...rows
    ]
      .map(row => row.map(String).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", `financial_report_${new Date().toISOString()}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const totalAmount = payments.reduce((sum, payment) => {
    const amount = typeof payment.amount === "string" ? parseFloat(payment.amount) : payment.amount;
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-bold">Financial Report</CardTitle>
          <div className="flex items-center gap-4">
            <DateRangePicker 
              value={dateRange} 
              onChange={setDateRange}
            />
            <Button
              onClick={downloadReport}
              disabled={!payments.length}
              variant="outline"
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {dateRange?.from ? (
            <>
              <div className="mb-4">
                <p className="text-lg font-semibold">
                  Total Collections: {formatCurrency(totalAmount)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total Transactions: {payments.length}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Fund ID</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.paymentDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{payment.userId}</TableCell>
                      <TableCell>{payment.chitFundId}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentType.replace("_", " ")}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentMethod.replace("_", " ")}
                      </TableCell>
                      <TableCell>{payment.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Select a date range to view the financial report
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}