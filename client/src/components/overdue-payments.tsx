import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Phone, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, ChitFund } from "@shared/schema";

interface OverduePaymentsProps {
  className?: string;
}

interface PaymentStatus {
  userId: number;
  fullName: string;
  phone: string;
  email: string;
  currentMonthPaid: boolean;
  previousMonthPaid: boolean;
}

export function OverduePayments({ className }: OverduePaymentsProps) {
  // Fetch all chit funds for selection
  const { data: chitFunds = [], isLoading: isLoadingFunds } = useQuery<ChitFund[]>({
    queryKey: ["/api/chitfunds"],
  });

  // State for selected fund
  const [selectedFundId, setSelectedFundId] = useState<string>("");

  // Get active funds only for the dropdown
  const activeFunds = useMemo(() => {
    return chitFunds.filter(fund => fund.status === "active");
  }, [chitFunds]);

  // Set default selection if there are active funds and nothing is selected yet
  React.useEffect(() => {
    if (activeFunds.length > 0 && !selectedFundId) {
      setSelectedFundId(activeFunds[0].id.toString());
    }
  }, [activeFunds, selectedFundId]);

  // Fetch fund members and their payment status
  const { data: membersData = [], isLoading: isLoadingMembers } = useQuery<PaymentStatus[]>({
    queryKey: ["/api/fund-members/payment-status", selectedFundId],
    queryFn: async () => {
      if (!selectedFundId) return [];
      
      try {
        const response = await fetch(`/api/fund-members/payment-status/${selectedFundId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch member payment status");
        }
        return response.json();
      } catch (error) {
        console.error("Error fetching payment status:", error);
        
        // If the endpoint is not yet implemented, we'll return empty data
        return [];
      }
    },
    enabled: !!selectedFundId,
  });

  // Filter members with overdue payments (either current or previous month not paid)
  const overdueMembers = useMemo(() => {
    return membersData.filter(member => 
      !member.currentMonthPaid || !member.previousMonthPaid
    );
  }, [membersData]);

  // Handle fund selection change
  const handleFundChange = (value: string) => {
    setSelectedFundId(value);
  };

  const isLoading = isLoadingFunds || isLoadingMembers;

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex justify-center items-center p-6">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (activeFunds.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>Overdue Payments</CardTitle>
          <CardDescription>No active chit funds available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Overdue Payments</CardTitle>
          <CardDescription>Members with pending payments</CardDescription>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Chit Fund:</span>
          <Select value={selectedFundId} onValueChange={handleFundChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select fund" />
            </SelectTrigger>
            <SelectContent>
              {activeFunds.map(fund => (
                <SelectItem key={fund.id} value={fund.id.toString()}>
                  {fund.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {overdueMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center">
            <AlertCircle className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground mb-2">No overdue payments found</p>
            <p className="text-sm text-muted-foreground">
              All members are up to date with their payments
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Current Month</TableHead>
                <TableHead>Previous Month</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overdueMembers.map(member => (
                <TableRow key={member.userId}>
                  <TableCell className="font-medium">{member.fullName}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="flex items-center">
                        <Phone className="h-3 w-3 mr-1" />
                        <span>{member.phone}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{member.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.currentMonthPaid ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Paid
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        Overdue
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {member.previousMonthPaid ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Paid
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        Overdue
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}