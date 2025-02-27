import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Download, RefreshCw, FileText } from "lucide-react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

// Mock invoice data generator for GST invoices with proper invoice numbers
const generateInvoiceNumber = (index: number, month: string, year: string) => {
  return `CHIT${year}${month}${String(index + 1).padStart(3, "0")}`;
};

// Function to get the current financial year
const getCurrentFinancialYear = () => {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const currentYear = now.getFullYear();
  
  // In India, financial year runs from April (3) to March (2)
  // If we're in Jan-Mar, FY is previous year to current year
  // If we're in Apr-Dec, FY is current year to next year
  if (currentMonth < 3) { // Jan-Mar
    return `${currentYear-1}-${currentYear}`;
  } else { // Apr-Dec
    return `${currentYear}-${currentYear+1}`;
  }
};

// Function to generate a list of available financial years
// Shows current FY and 2 previous FYs
const getAvailableFinancialYears = () => {
  const currentFY = getCurrentFinancialYear();
  const [startYear] = currentFY.split('-').map(Number);
  
  return [
    `${startYear}-${startYear+1}`,
    `${startYear-1}-${startYear}`,
    `${startYear-2}-${startYear-1}`,
  ];
};

// Get month name from month number (0-11)
const getMonthName = (monthNum: number) => {
  return new Date(2000, monthNum).toLocaleString('default', { month: 'long' });
};

// Get all months for a financial year
const getMonthsForFinancialYear = (financialYear: string) => {
  const [startYear, endYear] = financialYear.split('-').map(Number);
  
  const months = [];
  // April to December of start year
  for (let i = 3; i <= 11; i++) {
    months.push({
      monthNumber: i,
      year: startYear,
      name: getMonthName(i),
      fullName: `${getMonthName(i)} ${startYear}`
    });
  }
  
  // January to March of end year
  for (let i = 0; i <= 2; i++) {
    months.push({
      monthNumber: i,
      year: endYear,
      name: getMonthName(i),
      fullName: `${getMonthName(i)} ${endYear}`
    });
  }
  
  return months;
};

// GST rate for chit fund services
const GST_RATE = 18; // 18%

// Mock expense categories with HSN/SAC codes
const EXPENSE_CATEGORIES = [
  { name: "Office Rent", hsn: "997212", gstRate: 18 },
  { name: "Software Services", hsn: "998314", gstRate: 18 },
  { name: "Computer Equipment", hsn: "847130", gstRate: 18 },
  { name: "Internet Services", hsn: "998411", gstRate: 18 },
  { name: "Stationery", hsn: "4820", gstRate: 12 },
  { name: "Professional Services", hsn: "9982", gstRate: 18 },
  { name: "Travel", hsn: "996411", gstRate: 5 },
  { name: "Maintenance", hsn: "995411", gstRate: 18 },
];

export function GSTReports() {
  // State for selected financial year
  const [selectedFY, setSelectedFY] = useState<string>(getCurrentFinancialYear());
  
  // State for selected month (for monthly reports)
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  
  // Get available FYs
  const availableFYs = useMemo(() => getAvailableFinancialYears(), []);
  
  // Get months for selected FY
  const monthsForSelectedFY = useMemo(() => getMonthsForFinancialYear(selectedFY), [selectedFY]);
  
  // Set default month if not selected
  React.useEffect(() => {
    if (!selectedMonth && monthsForSelectedFY.length > 0) {
      // Default to current month or last month if in a different FY
      const currentDate = new Date();
      const currentMonthIndex = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      
      // Find if current month is in the selected FY
      const currentMonthInFY = monthsForSelectedFY.find(
        m => m.monthNumber === currentMonthIndex && m.year === currentYear
      );
      
      if (currentMonthInFY) {
        setSelectedMonth(`${currentMonthIndex}-${currentYear}`);
      } else {
        // Default to latest month in the FY
        const latestMonth = monthsForSelectedFY[monthsForSelectedFY.length - 1];
        setSelectedMonth(`${latestMonth.monthNumber}-${latestMonth.year}`);
      }
    }
  }, [monthsForSelectedFY, selectedMonth]);
  
  // Fetch financial transactions with GST information
  const { data: gstTransactions = [], isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/financial-transactions'],
    queryFn: async () => {
      const res = await fetch('/api/financial-transactions');
      if (!res.ok) throw new Error('Failed to load financial transactions');
      const data = await res.json();
      
      // Filter for GST eligible transactions
      return data.filter((tx: any) => tx.gstEligible === true);
    }
  });

  // Fetch all payments - these will be used to calculate commission for GSTR-1
  const { data: payments = [], isLoading: isLoadingPayments } = useQuery({
    queryKey: ["/api/payments"],
    queryFn: async () => {
      const res = await fetch('/api/payments');
      if (!res.ok) throw new Error('Failed to load payments');
      return res.json();
    }
  });

  // Fetch all chit funds to get commission rates
  const { data: chitFunds = [], isLoading: isLoadingFunds } = useQuery({
    queryKey: ["/api/chitfunds"],
  });

  // Determine if loading
  const isLoading = isLoadingTransactions || isLoadingPayments || isLoadingFunds;

  // Extract selected month and year for filtering
  const selectedMonthYear = useMemo(() => {
    if (!selectedMonth) return null;
    const [month, year] = selectedMonth.split('-').map(Number);
    return { month, year };
  }, [selectedMonth]);

  // Parse and format the month for display
  const selectedMonthFormatted = useMemo(() => {
    if (!selectedMonthYear) return "";
    const { month, year } = selectedMonthYear;
    return new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [selectedMonthYear]);

  // Generate GSTR-1 data (Outward Supplies - Commission Earned)
  const gstr1Data = useMemo(() => {
    if (!selectedMonthYear || !payments.length || !chitFunds.length) return [];
    
    const { month, year } = selectedMonthYear;
    const targetDate = new Date(year, month);
    const targetMonthStart = new Date(year, month, 1);
    const targetMonthEnd = new Date(year, month + 1, 0); // Last day of month
    
    // Get all withdrawal payments with commission
    // Group by chit fund and customer
    const commissionsMap = new Map();
    
    payments.forEach((payment: any) => {
      const paymentDate = new Date(payment.paymentDate);
      // Only include payments from selected month
      if (paymentDate < targetMonthStart || paymentDate > targetMonthEnd) return;
      
      // Only include withdrawal payments which generate commission
      if (payment.paymentType !== 'withdrawal') return;
      
      // Find the chit fund to get commission rate
      const fund = chitFunds.find((f: any) => f.id === payment.chitFundId);
      if (!fund) return;
      
      // Calculate commission amount (default is 5% of fund amount)
      const commissionRate = fund.commissionRate ? parseFloat(fund.commissionRate) : 5;
      const fundAmount = parseFloat(fund.amount);
      const commissionAmount = (fundAmount * commissionRate) / 100;
      
      // Use chitFund + user as key to group commissions
      const key = `${payment.chitFundId}-${payment.userId}`;
      
      if (commissionsMap.has(key)) {
        const existing = commissionsMap.get(key);
        existing.commissionAmount += commissionAmount;
      } else {
        commissionsMap.set(key, {
          userId: payment.userId,
          chitFundId: payment.chitFundId,
          chitFundName: fund.name,
          commissionAmount,
          date: paymentDate
        });
      }
    });
    
    // Convert map to array and add GST calculation
    return Array.from(commissionsMap.values()).map((item, index) => {
      const commission = parseFloat(item.commissionAmount.toFixed(2));
      const gstAmount = parseFloat((commission * GST_RATE / 100).toFixed(2));
      const total = commission + gstAmount;
      
      return {
        ...item,
        invoiceNo: generateInvoiceNumber(index, String(month + 1).padStart(2, '0'), String(year)),
        commission,
        gstAmount,
        gstRate: GST_RATE,
        total
      };
    });
  }, [selectedMonthYear, payments, chitFunds]);

  // Calculate GSTR-1 totals
  const gstr1Totals = useMemo(() => {
    if (!gstr1Data.length) return { commission: 0, gst: 0, total: 0 };
    
    return gstr1Data.reduce((acc, item) => {
      acc.commission += item.commission;
      acc.gst += item.gstAmount;
      acc.total += item.total;
      return acc;
    }, { commission: 0, gst: 0, total: 0 });
  }, [gstr1Data]);

  // Generate GSTR-2B data (Input Tax Credit - GST Paid on Expenses)
  const gstr2bData = useMemo(() => {
    if (!selectedMonthYear || !gstTransactions.length) return [];
    
    const { month, year } = selectedMonthYear;
    const targetMonthStart = new Date(year, month, 1);
    const targetMonthEnd = new Date(year, month + 1, 0); // Last day of month
    
    // Filter expenses for the selected month
    const monthExpenses = gstTransactions.filter((tx: any) => {
      const txDate = new Date(tx.transactionDate);
      return (
        tx.transactionType === 'expense' && 
        txDate >= targetMonthStart && 
        txDate <= targetMonthEnd
      );
    });
    
    // Generate GSTR-2B entries
    return monthExpenses.map((expense: any, index) => {
      const amount = parseFloat(expense.amount);
      const gstAmount = expense.gstAmount ? parseFloat(expense.gstAmount) : (amount * 0.18); // Default 18% if not specified
      
      // Find expense category or use a generic one
      const category = expense.description ? 
        EXPENSE_CATEGORIES.find(c => expense.description.toLowerCase().includes(c.name.toLowerCase())) || 
        EXPENSE_CATEGORIES[0] : 
        EXPENSE_CATEGORIES[0];
      
      return {
        id: expense.id,
        date: new Date(expense.transactionDate),
        expenseType: expense.description || category.name,
        supplierName: expense.lenderName || "Vendor", // Reusing lenderName field for supplier
        invoiceNo: `INV${String(year).slice(2)}${String(month + 1).padStart(2, '0')}${String(index + 1).padStart(3, '0')}`,
        amount,
        gstAmount: parseFloat(gstAmount.toFixed(2)),
        hsn: expense.hsn || category.hsn,
        gstRate: expense.gstRate ? parseFloat(expense.gstRate) : category.gstRate,
        eligibleForITC: true // Assuming all business expenses are eligible
      };
    });
  }, [selectedMonthYear, gstTransactions]);

  // Calculate GSTR-2B totals
  const gstr2bTotals = useMemo(() => {
    if (!gstr2bData.length) return { amount: 0, gst: 0 };
    
    return gstr2bData.reduce((acc, item) => {
      acc.amount += item.amount;
      acc.gst += item.gstAmount;
      return acc;
    }, { amount: 0, gst: 0 });
  }, [gstr2bData]);

  // Generate GSTR-3B data (Summary of GST Payable After ITC)
  const gstr3bData = useMemo(() => {
    const gstOnCommission = gstr1Totals.gst;
    const inputTaxCredit = gstr2bTotals.gst;
    const netGstPayable = Math.max(0, gstOnCommission - inputTaxCredit);
    
    return {
      gstOnCommission,
      inputTaxCredit,
      netGstPayable
    };
  }, [gstr1Totals, gstr2bTotals]);

  // Generate GSTR-9 data (Annual Summary - we'll mock this with some data)
  const gstr9Data = useMemo(() => {
    // Generate mock data for 12 months of the financial year
    const months = getMonthsForFinancialYear(selectedFY);
    
    // Return mock data for each month with randomized but realistic figures
    return months.map(month => {
      // Create semi-random but realistic values
      const commission = Math.floor(15000 + Math.random() * 10000);
      const gst = Math.floor(commission * GST_RATE / 100);
      const itc = Math.floor(gst * (0.4 + Math.random() * 0.3)); // 40-70% of GST as ITC
      const paid = gst - itc;
      
      return {
        month: month.name,
        year: month.year,
        gstOnCommission: commission,
        inputTaxCredit: itc, 
        gstPaid: paid
      };
    });
  }, [selectedFY]);

  // Calculate GSTR-9 totals
  const gstr9Totals = useMemo(() => {
    if (!gstr9Data.length) return { commission: 0, itc: 0, paid: 0 };
    
    return gstr9Data.reduce((acc, item) => {
      acc.commission += item.gstOnCommission;
      acc.itc += item.inputTaxCredit;
      acc.paid += item.gstPaid;
      return acc;
    }, { commission: 0, itc: 0, paid: 0 });
  }, [gstr9Data]);

  // Handle downloading reports as CSV
  const downloadReport = (reportType: string) => {
    let csvContent = '';
    let filename = '';
    
    switch (reportType) {
      case 'gstr1':
        csvContent = 'Invoice No,Date,Customer Name,GSTIN,Commission (₹),GST (' + GST_RATE + '%) (₹),Total (₹)\n';
        gstr1Data.forEach(item => {
          const date = new Date(item.date).toLocaleDateString('en-IN');
          csvContent += `${item.invoiceNo},${date},${item.chitFundName},,${item.commission},${item.gstAmount},${item.total}\n`;
        });
        csvContent += `\nTotal,,,,${gstr1Totals.commission},${gstr1Totals.gst},${gstr1Totals.total}`;
        filename = `GSTR1_${selectedMonthFormatted.replace(' ', '_')}.csv`;
        break;
        
      case 'gstr2b':
        csvContent = 'Date,Expense Type,Supplier Name,Invoice No,HSN/SAC,GST Rate (%),Amount (₹),GST Paid (₹),Eligible for ITC?\n';
        gstr2bData.forEach(item => {
          const date = new Date(item.date).toLocaleDateString('en-IN');
          csvContent += `${date},${item.expenseType},${item.supplierName},${item.invoiceNo},${item.hsn},${item.gstRate},${item.amount},${item.gstAmount},Yes\n`;
        });
        csvContent += `\nTotal,,,,,,,${gstr2bTotals.gst},`;
        filename = `GSTR2B_${selectedMonthFormatted.replace(' ', '_')}.csv`;
        break;
        
      case 'gstr3b':
        csvContent = 'Description,Amount (₹)\n';
        csvContent += `GST on Commission Earned (From GSTR-1),${gstr3bData.gstOnCommission}\n`;
        csvContent += `Input Tax Credit (From GSTR-2B),-${gstr3bData.inputTaxCredit}\n`;
        csvContent += `Net GST Payable,${gstr3bData.netGstPayable}\n`;
        filename = `GSTR3B_${selectedMonthFormatted.replace(' ', '_')}.csv`;
        break;
        
      case 'gstr9':
        csvContent = 'Month,GST on Commission (₹),Input Tax Credit (₹),GST Paid (₹)\n';
        gstr9Data.forEach(item => {
          csvContent += `${item.month} ${item.year},${item.gstOnCommission},${item.inputTaxCredit},${item.gstPaid}\n`;
        });
        csvContent += `\nTotal,${gstr9Totals.commission},${gstr9Totals.itc},${gstr9Totals.paid}`;
        filename = `GSTR9_${selectedFY.replace('-', '_')}.csv`;
        break;
        
      default:
        return;
    }
    
    // Create a download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center items-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">GST Reports</h2>
          <p className="text-muted-foreground">
            Generate and download GST reports for compliance
          </p>
        </div>
        
        <div className="flex gap-4">
          <div>
            <label className="text-sm font-medium mr-2">Financial Year</label>
            <Select value={selectedFY} onValueChange={setSelectedFY}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Select FY" />
              </SelectTrigger>
              <SelectContent>
                {availableFYs.map(fy => (
                  <SelectItem key={fy} value={fy}>{fy}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium mr-2">Month</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {monthsForSelectedFY.map(m => (
                  <SelectItem key={`${m.monthNumber}-${m.year}`} value={`${m.monthNumber}-${m.year}`}>
                    {m.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <Tabs defaultValue="gstr1" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="gstr1">GSTR-1 (Sales)</TabsTrigger>
          <TabsTrigger value="gstr2b">GSTR-2B (Purchases)</TabsTrigger>
          <TabsTrigger value="gstr3b">GSTR-3B (Summary)</TabsTrigger>
          <TabsTrigger value="gstr9">GSTR-9 (Annual)</TabsTrigger>
        </TabsList>
        
        {/* GSTR-1 Tab (Outward Supplies - Commission Earned) */}
        <TabsContent value="gstr1">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>GSTR-1: Outward Supplies (Commission Earned)</CardTitle>
                <CardDescription>
                  Monthly record of commission earned and GST collected - {selectedMonthFormatted}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => downloadReport('gstr1')} className="gap-2">
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {gstr1Data.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No commission data found for {selectedMonthFormatted}
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableCaption>Filing Deadline: 11th of next month</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice No</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer Name</TableHead>
                        <TableHead>GSTIN</TableHead>
                        <TableHead className="text-right">Commission (₹)</TableHead>
                        <TableHead className="text-right">GST ({GST_RATE}%) (₹)</TableHead>
                        <TableHead className="text-right">Total (₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gstr1Data.map((item) => (
                        <TableRow key={item.invoiceNo}>
                          <TableCell className="font-medium">{item.invoiceNo}</TableCell>
                          <TableCell>{new Date(item.date).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell>{item.chitFundName}</TableCell>
                          <TableCell>N/A</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.commission)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.gstAmount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              <div className="mt-6 bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Commission Earned</p>
                    <p className="text-lg font-semibold">{formatCurrency(gstr1Totals.commission)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">GST Collected ({GST_RATE}%)</p>
                    <p className="text-lg font-semibold">{formatCurrency(gstr1Totals.gst)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-lg font-semibold">{formatCurrency(gstr1Totals.total)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* GSTR-2B Tab (Input Tax Credit - GST Paid on Expenses) */}
        <TabsContent value="gstr2b">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>GSTR-2B: Input Tax Credit (Expenses)</CardTitle>
                <CardDescription>
                  GST paid on expenses that qualify for input tax credit - {selectedMonthFormatted}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => downloadReport('gstr2b')} className="gap-2">
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              {gstr2bData.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  No expense data found for {selectedMonthFormatted}
                </div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableCaption>Auto-generated on GST portal</TableCaption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Expense Type</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Invoice No</TableHead>
                        <TableHead>HSN/SAC</TableHead>
                        <TableHead className="text-right">Amount (₹)</TableHead>
                        <TableHead className="text-right">GST Paid (₹)</TableHead>
                        <TableHead>Eligible for ITC</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gstr2bData.map((item) => (
                        <TableRow key={item.invoiceNo}>
                          <TableCell>{new Date(item.date).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell>{item.expenseType}</TableCell>
                          <TableCell>{item.supplierName}</TableCell>
                          <TableCell className="font-medium">{item.invoiceNo}</TableCell>
                          <TableCell>{item.hsn}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.gstAmount)}</TableCell>
                          <TableCell>{item.eligibleForITC ? "Yes" : "No"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              
              <div className="mt-6 bg-muted p-4 rounded-lg">
                <h3 className="font-semibold mb-2">Summary</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Expenses</p>
                    <p className="text-lg font-semibold">{formatCurrency(gstr2bTotals.amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Input Tax Credit (ITC)</p>
                    <p className="text-lg font-semibold">{formatCurrency(gstr2bTotals.gst)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* GSTR-3B Tab (Summary of GST Payable After ITC) */}
        <TabsContent value="gstr3b">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>GSTR-3B: GST Payment Summary</CardTitle>
                <CardDescription>
                  Summary of GST payable after adjusting input tax credit - {selectedMonthFormatted}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => downloadReport('gstr3b')} className="gap-2">
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="max-w-md mx-auto bg-card border rounded-lg overflow-hidden">
                <Table>
                  <TableCaption>Filing Deadline: 20th of next month</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>GST on Commission Earned (From GSTR-1)</TableCell>
                      <TableCell className="text-right">{formatCurrency(gstr3bData.gstOnCommission)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Input Tax Credit (From GSTR-2B)</TableCell>
                      <TableCell className="text-right text-green-600">- {formatCurrency(gstr3bData.inputTaxCredit)}</TableCell>
                    </TableRow>
                    <TableRow className="font-medium">
                      <TableCell>Net GST Payable</TableCell>
                      <TableCell className="text-right text-primary">{formatCurrency(gstr3bData.netGstPayable)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              
              <div className="flex flex-col items-center mt-6 p-6 bg-muted rounded-lg">
                <FileText className="h-8 w-8 mb-2 text-primary" />
                <h3 className="text-lg font-semibold">Payment Summary</h3>
                <p className="text-center text-muted-foreground mb-2">You need to pay</p>
                <p className="text-3xl font-bold text-primary">{formatCurrency(gstr3bData.netGstPayable)}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  as GST for {selectedMonthFormatted}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* GSTR-9 Tab (Annual Summary Report) */}
        <TabsContent value="gstr9">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>GSTR-9: Annual GST Return</CardTitle>
                <CardDescription>
                  Annual summary of GST transactions for {selectedFY}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={() => downloadReport('gstr9')} className="gap-2">
                <Download className="h-4 w-4" />
                Download CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableCaption>Filing Deadline: December 31st of next FY</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">GST on Commission (₹)</TableHead>
                      <TableHead className="text-right">Input Tax Credit (₹)</TableHead>
                      <TableHead className="text-right">GST Paid (₹)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gstr9Data.map((item) => (
                      <TableRow key={`${item.month}-${item.year}`}>
                        <TableCell>{item.month} {item.year}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.gstOnCommission)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.inputTaxCredit)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.gstPaid)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-medium bg-muted">
                      <TableCell>Total for {selectedFY}</TableCell>
                      <TableCell className="text-right">{formatCurrency(gstr9Totals.commission)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(gstr9Totals.itc)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(gstr9Totals.paid)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              
              <div className="mt-6 grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total GST Collected</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(gstr9Totals.commission)}</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total ITC Claimed</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(gstr9Totals.itc)}</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">Total GST Paid</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatCurrency(gstr9Totals.paid)}</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}