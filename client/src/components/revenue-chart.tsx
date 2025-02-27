import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
// Define a Payment type that includes commission for our chart component
interface ChartPayment {
  id: number;
  userId: number;
  chitFundId: number;
  amount: string | number;
  paymentType: "monthly" | "bonus" | "withdrawal";
  paymentDate: string | Date;
  paymentMethod?: string;
  monthNumber?: number;
  notes?: string;
  commission?: string | number; // Commission field we need for withdrawn payments
  commissionAmount?: string | number; // Alternative field name
};
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./ui/chart";

interface ChartData {
  month: string;
  revenue: number;
  commission: number;
}

interface RevenueChartProps {
  fundId?: number; // Optional - if provided, will show only data for this fund
  months?: number; // Optional - number of months to show, defaults to 6
}

export function RevenueChart({ fundId, months = 6 }: RevenueChartProps) {
  // Get the current year
  const currentYear = new Date().getFullYear();
  
  // Set up year selection state
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  
  // Create an array of years (current year and 3 years back)
  const availableYears = useMemo(() => {
    const years = [];
    for (let i = 0; i < 4; i++) {
      years.push((currentYear - i).toString());
    }
    return years;
  }, [currentYear]);
  
  const { data: payments, isLoading, error, refetch } = useQuery({
    queryKey: ["api/payments", fundId, selectedYear],
    queryFn: async () => {
      let url = '/api/payments';
      if (fundId) {
        url = `/api/payments/fund/${fundId}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch payment data");
      }
      return response.json() as Promise<ChartPayment[]>;
    },
  });

  // Create chart data from payments, grouped by month
  const chartData = useMemo(() => {
    if (!payments || !payments.length) return [];

    // Create a map of payments by month
    const paymentsByMonth = new Map<string, { revenue: number; commission: number }>();
    
    // Process all payments
    payments.forEach(payment => {
      // Skip if no payment date
      if (!payment.paymentDate) return;

      const date = new Date(payment.paymentDate);
      
      // Filter by selected year
      if (date.getFullYear().toString() !== selectedYear) {
        return;
      }
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Initialize month data if not exists
      if (!paymentsByMonth.has(monthKey)) {
        paymentsByMonth.set(monthKey, { revenue: 0, commission: 0 });
      }
      
      const monthData = paymentsByMonth.get(monthKey)!;
      
      // Add payment amount to revenue
      const amount = typeof payment.amount === 'string' 
        ? parseFloat(payment.amount) 
        : Number(payment.amount);
      
      if (!isNaN(amount)) {
        // Regular payments contribute to revenue
        if (payment.paymentType === 'monthly') {
          monthData.revenue += amount;
        }

        // For withdrawal payments, extract commission if available
        if (payment.paymentType === 'withdrawal') {
          // Try to get commission from payment
          let commission = 0;
          
          // Try different possible commission field names
          if (payment.commission) {
            commission = typeof payment.commission === 'string' 
              ? parseFloat(payment.commission) 
              : Number(payment.commission);
          } else if (payment.commissionAmount) {
            commission = typeof payment.commissionAmount === 'string'
              ? parseFloat(payment.commissionAmount)
              : Number(payment.commissionAmount);
          }
          
          // If no commission found, estimate it as 5-6% of payment amount
          if (commission === 0) {
            commission = amount * 0.05; // Default commission rate
          }
          
          if (!isNaN(commission) && commission > 0) {
            monthData.commission += commission;
            
            // Add debug log
            console.log(`Adding commission for month ${monthKey}: ${commission}`);
          }
        }
      }
    });

    // Convert map to array and sort by month
    const result = Array.from(paymentsByMonth.entries())
      .map(([month, data]) => ({
        month,
        revenue: data.revenue,
        commission: data.commission,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Format month labels for display
    return result.map(item => ({
      ...item,
      month: new Date(item.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    }));
  }, [payments, selectedYear]);

  // We don't need to slice data for yearly view, we want to show all months
  const recentData = useMemo(() => {
    // Create array for all 12 months of the year to ensure all months are shown
    const allMonths = Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(parseInt(selectedYear), i, 1);
      return {
        month: monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: 0,
        commission: 0
      };
    });
    
    // Merge with actual data (if any)
    if (chartData.length) {
      chartData.forEach(dataPoint => {
        // Find the month in our all-months array
        const monthName = dataPoint.month;
        const existingMonthIndex = allMonths.findIndex(m => m.month === monthName);
        
        if (existingMonthIndex >= 0) {
          // Update with actual data
          allMonths[existingMonthIndex].revenue = dataPoint.revenue;
          allMonths[existingMonthIndex].commission = dataPoint.commission;
        }
      });
    }
    
    return allMonths;
  }, [chartData, selectedYear]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Chart Data</CardTitle>
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

  if (!recentData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue & Commission</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center p-6">
          <p className="text-muted-foreground">No payment data available to display</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Revenue & Commission</CardTitle>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Year:</span>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ChartContainer
          className="h-[300px]"
          config={{
            revenue: {
              label: "Revenue",
              theme: {
                light: "hsl(var(--primary))",
                dark: "hsl(var(--primary))",
              },
            },
            commission: {
              label: "Commission",
              theme: {
                light: "hsl(var(--secondary))",
                dark: "hsl(var(--secondary))",
              },
            },
          }}
        >
          <LineChart data={recentData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis 
              tickFormatter={(value) => {
                // Format as currency with shortened notation
                return new Intl.NumberFormat('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  notation: 'compact',
                  maximumFractionDigits: 1
                }).format(value);
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => [
                    formatCurrency(value as number),
                    name as string,
                  ]}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              strokeWidth={2}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="commission"
              stroke="var(--color-commission)"
              strokeWidth={2}
            />
            <Legend />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}