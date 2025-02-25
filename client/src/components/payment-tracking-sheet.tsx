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
import { Download, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface PaymentTrackingSheetProps {
  fundId: number;
  fundName: string;
}

export function PaymentTrackingSheet({ fundId, fundName }: PaymentTrackingSheetProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/chitfunds", fundId, "payments"],
    queryFn: async () => {
      const res = await fetch(`/api/chitfunds/${fundId}/payments`);
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
  });

  const downloadSheet = () => {
    if (!data) return;

    // Create header row with months
    const headers = ["Member Name"];
    for (let i = 1; i <= 20; i++) {
      headers.push(`Month ${i}`);
    }

    // Create rows for each member
    const rows = data.members.map(member => {
      const row = [member.fullName];
      for (let month = 1; month <= 20; month++) {
        const monthPayments = member.payments.filter(p => p.month === month);
        const totalAmount = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        row.push(totalAmount ? totalAmount.toString() : "");
      }
      return row;
    });

    // Combine all rows
    const csvContent = [
      ["Sri Vasavi Financial Services"],
      [`Payment Record - ${fundName}`],
      [""],
      headers,
      ...rows
    ]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");

    // Create and trigger download
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("hidden", "");
    a.setAttribute("href", url);
    a.setAttribute("download", `payment_sheet_${fundName.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payment Tracking Sheet</CardTitle>
        <Button onClick={downloadSheet} className="gap-2">
          <Download className="h-4 w-4" />
          Download Sheet
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[600px]">
          <div className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Member</TableHead>
                  {Array.from({ length: 20 }, (_, i) => (
                    <TableHead key={i} className="min-w-[120px]">Month {i + 1}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="sticky left-0 bg-background font-medium">
                      {member.fullName}
                    </TableCell>
                    {Array.from({ length: 20 }, (_, month) => {
                      const monthPayments = member.payments.filter(
                        (p) => p.month === month + 1
                      );
                      const totalAmount = monthPayments.reduce(
                        (sum, p) => sum + Number(p.amount),
                        0
                      );
                      return (
                        <TableCell key={month}>
                          {totalAmount ? (
                            <div>
                              {formatCurrency(totalAmount)}
                              {monthPayments.length > 1 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({monthPayments.length} payments)
                                </span>
                              )}
                            </div>
                          ) : (
                            "-"
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
  );
}
