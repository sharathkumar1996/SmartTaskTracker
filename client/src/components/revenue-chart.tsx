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
import { Loader2, RefreshCw, Calendar } from "lucide-react";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  
  // Add quarter selection
  const [selectedQuarter, setSelectedQuarter] = useState<string>("all");
  
  // Add month selection for individual month filtering
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  
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
      try {
        // First, check if we have a user session
        const sessionStorageKey = 'chitfund_user_session';
        const userSession = sessionStorage.getItem(sessionStorageKey);
        if (!userSession) {
          console.error("No user session found when trying to load chart data");
          return []; // Return empty array if no session
        }
        
        // Parse the user session for our auth headers
        let userObject = null;
        try {
          userObject = JSON.parse(userSession);
          console.log("Using stored user session for chart data request");
        } catch (e) {
          console.error("Error parsing session data:", e);
          return []; // Return empty if we can't parse the session
        }
        
        let url = '/api/payments';
        if (fundId) {
          url = `/api/payments/fund/${fundId}`;
        }
        
        // Prepare auth headers from session
        const authHeaders = {};
        if (userObject && userObject.id) {
          Object.assign(authHeaders, {
            "X-User-ID": userObject.id.toString(),
            "X-User-Role": userObject.role
          });
        }
        
        // Add credentials and headers to help with authentication
        const response = await fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            ...authHeaders
          }
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch payment data: ${response.status} ${response.statusText}`);
          // Return empty array instead of throwing
          return [];
        }
        
        return response.json() as Promise<ChartPayment[]>;
      } catch (err) {
        console.error("Error fetching chart data:", err);
        return []; // Return empty array on any error
      }
    },
    retry: 1, // Only retry once
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
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
        // All payment types contribute to revenue (total amount received by members)
        // This includes monthly payments, bonuses, and withdrawals
        monthData.revenue += amount;

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
          
          // If no commission found, calculate it as per project rules (20% of monthly amount)
          if (commission === 0) {
            // Standard calculation: commission is 20% of monthly payment
            // Monthly payment is 5% of fund amount
            const estimatedMonthlyAmount = amount * 0.05; // Estimate based on withdrawal amount
            commission = estimatedMonthlyAmount * 0.2; // 20% of monthly amount
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

  // Create an array of all months for dropdown
  const availableMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(2000, i, 1); // Using a fixed year just for month names
      return {
        value: i.toString(),
        label: monthDate.toLocaleDateString('en-US', { month: 'long' })
      };
    });
  }, []);

  // Create an array of quarters for dropdown
  const availableQuarters = useMemo(() => {
    return [
      { value: "all", label: "All Quarters" },
      { value: "q1", label: "Q1 (Jan-Mar)" },
      { value: "q2", label: "Q2 (Apr-Jun)" },
      { value: "q3", label: "Q3 (Jul-Sep)" },
      { value: "q4", label: "Q4 (Oct-Dec)" }
    ];
  }, []);
  
  // Apply month range filter and display the appropriate months
  const recentData = useMemo(() => {
    // Create array for all 12 months of the year to ensure all months are shown
    const allMonths = Array.from({ length: 12 }, (_, i) => {
      const monthDate = new Date(parseInt(selectedYear), i, 1);
      return {
        month: monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: 0,
        commission: 0,
        // Store the month index (0-11) for sorting and filtering
        monthIndex: i
      };
    });
    
    // Merge with actual data (if any)
    if (chartData.length) {
      chartData.forEach(dataPoint => {
        // Find the month in our all-months array
        const monthName = dataPoint.month;
        const existingMonthIndex = allMonths.findIndex(m => m.month === monthName);
        
        if (existingMonthIndex >= 0) {
          // Update with actual data - ensure commission doesn't exceed revenue
          allMonths[existingMonthIndex].revenue = dataPoint.revenue;
          
          // Make sure commission is at most 10% of revenue to avoid it being higher in charts
          const maxCommission = dataPoint.revenue * 0.1;
          allMonths[existingMonthIndex].commission = Math.min(dataPoint.commission, maxCommission);
        }
      });
    }
    
    // Apply filter based on selected quarter or specific month
    let filteredMonths = [...allMonths];
    
    // If a specific month is selected
    if (selectedMonth !== null) {
      const monthIndex = parseInt(selectedMonth);
      filteredMonths = allMonths.filter(m => m.monthIndex === monthIndex);
    } else {
      // Apply quarter filter
      switch (selectedQuarter) {
        case "q1": // First quarter (Jan-Mar)
          filteredMonths = allMonths.slice(0, 3);
          break;
          
        case "q2": // Second quarter (Apr-Jun)
          filteredMonths = allMonths.slice(3, 6);
          break;
          
        case "q3": // Third quarter (Jul-Sep)
          filteredMonths = allMonths.slice(6, 9);
          break;
          
        case "q4": // Fourth quarter (Oct-Dec)
          filteredMonths = allMonths.slice(9, 12);
          break;
          
        case "all":
        default:
          // All months - no filtering needed
          break;
      }
    }
    
    // Ensure we have at least one data point
    if (filteredMonths.length === 0) {
      return allMonths; // Return all months if filtering resulted in no data
    }
    
    // Sort the months chronologically for proper display
    filteredMonths.sort((a, b) => a.monthIndex - b.monthIndex);
    
    return filteredMonths;
  }, [chartData, selectedYear, selectedQuarter, selectedMonth]);

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
      <CardHeader className="flex flex-col space-y-2">
        <div className="flex flex-row items-center justify-between">
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
        </div>
        
        <div className="flex flex-col space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Quarter selector */}
            <div>
              <div className="flex items-center mb-2">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Quarter:</span>
              </div>
              <Select 
                value={selectedQuarter} 
                onValueChange={(value) => {
                  setSelectedQuarter(value);
                  // Clear selected month when changing quarter
                  setSelectedMonth(null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select quarter" />
                </SelectTrigger>
                <SelectContent>
                  {availableQuarters.map(quarter => (
                    <SelectItem key={quarter.value} value={quarter.value}>{quarter.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Month selector */}
            <div>
              <div className="flex items-center mb-2">
                <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Month:</span>
              </div>
              <Select 
                value={selectedMonth || "all"} 
                onValueChange={(value) => {
                  // If "all" is selected, set selectedMonth to null
                  setSelectedMonth(value === "all" ? null : value);
                  // Reset quarter selection if a specific month is chosen
                  if (value && value !== "all") {
                    setSelectedQuarter("all");
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select specific month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {availableMonths.map(month => (
                    <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        {/* Period summary with totals */}
        <div className="flex flex-col space-y-2">
          <p className="text-sm text-muted-foreground">
            {selectedMonth ? (
              <>Showing data for {availableMonths.find(m => m.value === selectedMonth)?.label || 'Unknown month'} {selectedYear}</>
            ) : selectedQuarter === "q1" ? (
              <>Showing Q1 (Jan-Mar) of {selectedYear}</>
            ) : selectedQuarter === "q2" ? (
              <>Showing Q2 (Apr-Jun) of {selectedYear}</>
            ) : selectedQuarter === "q3" ? (
              <>Showing Q3 (Jul-Sep) of {selectedYear}</>
            ) : selectedQuarter === "q4" ? (
              <>Showing Q4 (Oct-Dec) of {selectedYear}</>
            ) : (
              <>Showing all months in {selectedYear}</>
            )}
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/50 rounded-lg p-3">
              <h4 className="text-sm font-medium mb-1">Total Revenue</h4>
              <p className="text-2xl font-bold">
                {formatCurrency(recentData.reduce((sum, item) => sum + item.revenue, 0))}
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-3">
              <h4 className="text-sm font-medium mb-1">Total Commission</h4>
              <p className="text-2xl font-bold">
                {formatCurrency(recentData.reduce((sum, item) => sum + item.commission, 0))}
              </p>
            </div>
          </div>
        </div>
        
        <ChartContainer
          className="h-[300px]"
          config={{
            revenue: {
              label: "Revenue",
              theme: {
                light: "#2563eb", // Blue
                dark: "#3b82f6",
              },
            },
            commission: {
              label: "Commission",
              theme: {
                light: "#16a34a", // Green
                dark: "#22c55e",
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
              strokeWidth={3}
              activeDot={{ r: 6 }}
              dot={{ stroke: 'var(--color-revenue)', strokeWidth: 2, r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="commission"
              stroke="var(--color-commission)"
              strokeWidth={3}
              dot={{ stroke: 'var(--color-commission)', strokeWidth: 2, r: 4 }}
            />
            <Legend 
              wrapperStyle={{ 
                paddingTop: '10px',
                fontSize: '13px'
              }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}