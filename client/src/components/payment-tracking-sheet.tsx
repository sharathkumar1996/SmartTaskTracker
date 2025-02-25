import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

interface FundMemberPayment {
  month: number;
  amount: string;
  paymentDate: Date;
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
  const { data, isLoading } = useQuery<PaymentData>({
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
    const rows = data.members.map((member: FundMember) => {
      const row = [member.fullName];
      for (let month = 1; month <= 20; month++) {
        const monthPayments = member.payments.filter(p => p.month === month);
        const totalAmount = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        row.push(totalAmount ? totalAmount.toString() : "");
      }
      return row;
    });

    // Combine all rows with organization header
    const csvContent = [
      ["Sri Vasavi Financial Services"],
      [`Payment Record - ${fundName}`],
      [""],
      headers,
      ...rows
    ]
      .map(row => row.map(String).join(","))
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

  if (!data || !data.members) {
    return <div>No payment data available</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Payment Records</h2>
        <Button onClick={downloadSheet} className="gap-2" variant="outline">
          <Download className="h-4 w-4" />
          Download Sheet
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 bg-background">Member</TableHead>
                  {Array.from({ length: 20 }, (_, i) => (
                    <TableHead key={i} className="text-right">
                      Month {i + 1}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="sticky left-0 z-10 bg-background font-medium">
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
                        <TableCell key={month} className="text-right">
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
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}