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

interface FinancialReportProps {
  chitFundId?: number;
}

export function FinancialReport({ chitFundId }: FinancialReportProps) {
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Fetch payments for the given date range
  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments/report", chitFundId, dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (chitFundId) params.append("fundId", chitFundId.toString());
      if (dateRange.from) params.append("from", dateRange.from.toISOString());
      if (dateRange.to) params.append("to", dateRange.to.toISOString());

      const res = await fetch(`/api/payments/report?${params}`);
      if (!res.ok) throw new Error("Failed to fetch payment report");
      return res.json();
    },
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const downloadReport = () => {
    if (!payments.length) return;

    const headers = [
      "Date",
      "Member Name",
      "Fund Name",
      "Amount",
      "Payment Type",
      "Payment Method",
      "Recorded By",
      "Notes"
    ];

    const rows = payments.map(payment => [
      new Date(payment.paymentDate).toLocaleDateString(),
      payment.user?.fullName || "",
      payment.chitFund?.name || "",
      payment.amount,
      payment.paymentType,
      payment.paymentMethod,
      payment.recorder?.fullName || "",
      payment.notes || ""
    ]);

    const csvContent = [
      ["Sri Vasavi Financial Services"],
      ["Financial Report"],
      [`Period: ${dateRange.from?.toLocaleDateString()} to ${dateRange.to?.toLocaleDateString()}`],
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalAmount = payments.reduce((sum, payment) => {
    const amount = typeof payment.amount === "string" ? parseFloat(payment.amount) : payment.amount;
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xl font-bold">Financial Report</CardTitle>
          <div className="flex items-center gap-4">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
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
          {payments.length > 0 ? (
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
                    <TableHead>Member</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        {new Date(payment.paymentDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>{payment.user?.fullName}</TableCell>
                      <TableCell>{payment.chitFund?.name}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentType.replace("_", " ")}
                      </TableCell>
                      <TableCell className="capitalize">
                        {payment.paymentMethod.replace("_", " ")}
                      </TableCell>
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