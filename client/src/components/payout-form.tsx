import { useState, useEffect } from "react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Calendar, InfoIcon } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChitFund, FundMember } from "@shared/schema";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PayoutFormProps {
  className?: string;
  chitFundId: number;
  userId: number;
  onSuccess?: () => void;
}

const payoutFormSchema = z.object({
  commission: z.string().min(1, "Commission is required"),
  notes: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
  withdrawalMonth: z.coerce.number().min(1, "Withdrawal month is required").max(24, "Withdrawal month cannot exceed 24"),
  paymentMethod: z.enum(['cash', 'bank_transfer', 'google_pay', 'phone_pay', 'online_portal']),
});

type PayoutFormValues = z.infer<typeof payoutFormSchema>;

export function PayoutForm({ className, chitFundId, userId, onSuccess }: PayoutFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fundAmount, setFundAmount] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState<string | null>(null);
  const [commissionAmount, setCommissionAmount] = useState<string>("5000");
  const [monthsPaid, setMonthsPaid] = useState(0);
  const [paidAmount, setPaidAmount] = useState<string>("0");
  const [bonusAmount, setBonusAmount] = useState<string>("0");
  const [remainingAmount, setRemainingAmount] = useState<string>("0");
  const [penaltyAmount, setPenaltyAmount] = useState<string>("0");
  const [withdrawalMonthValue, setWithdrawalMonthValue] = useState<number>(1);

  // Initialize form first to avoid reference errors
  const form = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutFormSchema),
    defaultValues: {
      commission: "5000", // Default value until fund data is loaded
      notes: "",
      paymentDate: new Date(),
      withdrawalMonth: 1,
      paymentMethod: "cash", // Default payment method
    },
  });

  // Fetch the fund details to calculate payout amount
  const { data: fundData } = useQuery<ChitFund>({
    queryKey: ["/api/chitfunds", chitFundId],
    queryFn: async () => {
      const res = await fetch(`/api/chitfunds/${chitFundId}`);
      if (!res.ok) throw new Error("Failed to fetch fund details");
      return res.json();
    },
    enabled: !!chitFundId,
  });

  // Fetch member details to check if they already have withdrawn
  const { data: memberDetails } = useQuery<FundMember>({
    queryKey: ["/api/chitfunds", chitFundId, "members", userId, "details"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/chitfunds/${chitFundId}/members/${userId}/details`);
        if (!res.ok) return { fundId: chitFundId, userId, isWithdrawn: false };
        return res.json();
      } catch (error) {
        console.error("Error fetching member details:", error);
        return { fundId: chitFundId, userId, isWithdrawn: false };
      }
    },
    enabled: !!chitFundId && !!userId,
  });

  // Fetch member's payment history to calculate paid amount and months
  const { data: memberPayments = [] } = useQuery({
    queryKey: ["/api/payments/user", userId, "fund", chitFundId],
    queryFn: async () => {
      const res = await fetch(`/api/payments/user/${userId}/fund/${chitFundId}`);
      if (!res.ok) throw new Error("Failed to fetch member payments");
      return res.json();
    },
    enabled: !!chitFundId && !!userId,
  });

  // Get member name
  const { data: memberData } = useQuery({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) throw new Error("Failed to fetch user details");
      return res.json();
    },
    enabled: !!userId,
  });

  // Initialize fund amount and default commission when fund data is loaded
  useEffect(() => {
    if (fundData && fundData.amount) {
      setFundAmount(fundData.amount.toString());
      
      // Set the commission based on the fund amount (5k per lakh = 5% of fund amount)
      const fundAmountNum = parseFloat(fundData.amount);
      const defaultCommission = Math.round(fundAmountNum * 0.05).toString(); // 5k per lakh = 50k for 10 lakh fund
      setCommissionAmount(defaultCommission);
      form.setValue('commission', defaultCommission);
    }
  }, [fundData, form]);

  // Calculate months paid and payment amounts from payment history
  useEffect(() => {
    if (memberPayments && memberPayments.length > 0) {
      // Count unique months for which payments were made
      const uniqueMonths = new Set();
      let totalPaid = 0;

      memberPayments.forEach((payment: any) => {
        if (payment.paymentType === 'monthly') {
          uniqueMonths.add(payment.monthNumber);
          totalPaid += parseFloat(payment.amount);
        }
      });

      setMonthsPaid(uniqueMonths.size);
      setPaidAmount(totalPaid.toString());
    }
  }, [memberPayments]);

  // Calculate bonus amount based on months paid
  useEffect(() => {
    if (fundData && monthsPaid > 0) {
      try {
        const monthlyBonus = parseFloat(fundData.monthlyBonus || "1000");
        const calculatedBonus = monthsPaid * monthlyBonus;
        setBonusAmount(calculatedBonus.toString());
      } catch (error) {
        console.error("Error calculating bonus amount:", error);
        setBonusAmount("0");
      }
    }
  }, [fundData, monthsPaid]);

  // Calculate remaining fund amount (fund amount - paid amount)
  useEffect(() => {
    if (fundAmount && paidAmount) {
      try {
        const fundAmountValue = parseFloat(fundAmount);
        const paidAmountValue = parseFloat(paidAmount);
        const calculated = Math.max(0, fundAmountValue - paidAmountValue);
        setRemainingAmount(calculated.toString());
      } catch (error) {
        console.error("Error calculating remaining amount:", error);
        setRemainingAmount("0");
      }
    }
  }, [fundAmount, paidAmount]);

  // Watch for withdrawal month changes
  useEffect(() => {
    const subscription = form.watch((value) => {
      if (value.withdrawalMonth) {
        setWithdrawalMonthValue(Number(value.withdrawalMonth));
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);

  // Calculate penalty and total payout amount using the correct formula
  useEffect(() => {
    // Calculate penalty if withdrawing later than expected
    // Penalty = max(0, (withdrawalMonth - (monthsPaid + 1))) × 1000
    try {
      const penalty = Math.max(0, withdrawalMonthValue - (monthsPaid + 1)) * 1000;
      setPenaltyAmount(penalty.toString());
    } catch (error) {
      console.error("Error calculating penalty:", error);
      setPenaltyAmount("0");
    }

    if (paidAmount && bonusAmount && remainingAmount && commissionAmount) {
      try {
        const paidAmountValue = parseFloat(paidAmount);
        const bonusAmountValue = parseFloat(bonusAmount);
        const remainingAmountValue = parseFloat(remainingAmount);
        const commissionValue = parseFloat(commissionAmount || "0");
        const penaltyValue = parseFloat(penaltyAmount || "0");

        // Formula: Paid amount + Bonus amount + (Remaining amount - Commission) - Penalty
        const calculatedPayoutAmount = paidAmountValue + bonusAmountValue + (remainingAmountValue - commissionValue) - penaltyValue;

        setPayoutAmount(calculatedPayoutAmount.toString());
      } catch (error) {
        console.error("Error calculating payout amount:", error);
        setPayoutAmount(null);
      }
    }
  }, [paidAmount, bonusAmount, remainingAmount, commissionAmount, penaltyAmount, withdrawalMonthValue, monthsPaid]);

  // Update default values when data is loaded
  useEffect(() => {
    if (fundData) {
      if (fundData.baseCommission) {
        // Set the commission to the fund's base commission by default
        form.setValue('commission', fundData.baseCommission);
        setCommissionAmount(fundData.baseCommission);
      } else {
        // Calculate default commission as 5k per lakh (5% of fund amount)
        const fundAmountNum = parseFloat(fundData.amount);
        // 5k per lakh = 5000 per 100000 = 0.05 * fund amount
        const defaultCommission = Math.round(fundAmountNum * 0.05).toString(); // 5k per lakh = 50k for 10 lakh fund
        form.setValue('commission', defaultCommission);
        setCommissionAmount(defaultCommission);
      }
    }
    
    if (memberDetails?.earlyWithdrawalMonth) {
      form.setValue('withdrawalMonth', memberDetails.earlyWithdrawalMonth);
      setWithdrawalMonthValue(memberDetails.earlyWithdrawalMonth);
    }
  }, [fundData, memberDetails, form]);

  // Update the commission amount when the form value changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'commission' && value.commission) {
        // Convert to integer and back to string to ensure it's a clean integer
        const intValue = parseInt(value.commission, 10);
        // Use 5000 as fallback if parsing fails
        setCommissionAmount(isNaN(intValue) ? "5000" : String(intValue));
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);

  async function onSubmit(values: PayoutFormValues) {
    // Double-check the current status to avoid race conditions
    // Get fresh data for the member status
    try {
      const detailsResponse = await fetch(`/api/chitfunds/${chitFundId}/members/${userId}/details`);
      if (detailsResponse.ok) {
        const latestDetails = await detailsResponse.json();
        
        // Allow re-processing payments for already withdrawn members if no payable exists
        // This handles edge cases where the member was marked as withdrawn but the payout wasn't processed
        const hasBeenPaidOut = latestDetails?.isWithdrawn && 
          latestDetails?.hasPayable === true;
        
        if (hasBeenPaidOut) {
          toast({
            title: "Error",
            description: "This member has already withdrawn and received payout from this fund",
            variant: "destructive",
          });
          return;
        }
      }
    } catch (error) {
      console.error("Error checking latest member status:", error);
      // Continue with what we know from the cached data
    }

    try {
      setIsSubmitting(true);

      // Ensure commission is a valid integer
      const commissionValue = parseInt(values.commission, 10);
      if (isNaN(commissionValue)) {
        throw new Error("Invalid commission amount");
      }
      const numericCommission = String(commissionValue);

      // Calculate payout amount
      if (!payoutAmount) {
        throw new Error("Payout amount not available");
      }
      const payoutAmountValue = parseFloat(payoutAmount);

      if (payoutAmountValue <= 0) {
        throw new Error("Payout amount must be greater than zero");
      }

      // First, update the member's withdrawal status
      const withdrawalResponse = await apiRequest(
        "PATCH",
        `/api/chitfunds/${chitFundId}/members/${userId}/withdraw`,
        {
          isWithdrawn: true,
          withdrawalMonth: values.withdrawalMonth,
        }
      );

      if (!withdrawalResponse.ok) {
        const error = await withdrawalResponse.json();
        throw new Error(error.message || "Failed to update withdrawal status");
      }

      // Then record the payout
      // Ensure we have valid dates before sending to the server
      const paymentDate = values.paymentDate instanceof Date ? values.paymentDate : new Date();
      
      const payableData = {
        userId,
        chitFundId,
        paymentType: "withdrawal",
        amount: payoutAmountValue.toString(),
        recordedBy: user?.id,
        notes: values.notes,
        paidDate: paymentDate,
        dueDate: paymentDate, // Always use payment date as due date for consistency
        commission: numericCommission, 
        withdrawalMonth: values.withdrawalMonth,
        paidAmount: paidAmount,
        bonusAmount: bonusAmount,
        paymentMethod: values.paymentMethod, // Add payment method
      };

      const response = await apiRequest("POST", "/api/payables", payableData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to record payout");
      }

      // Invalidate queries to refresh data
      await queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", chitFundId, "members", userId, "details"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/accounts/payables"] });

      toast({
        title: "Success",
        description: "Payout recorded successfully",
      });

      // Reset form with default commission or calculate 5k per lakh (5% of fund amount)
      let defaultCommission = "5000";
      if (fundData?.baseCommission) {
        defaultCommission = fundData.baseCommission;
      } else if (fundData?.amount) {
        const fundAmountNum = parseFloat(fundData.amount);
        defaultCommission = Math.round(fundAmountNum * 0.05).toString(); // 5k per lakh = 50k for 10 lakh fund
      }
      
      form.reset({
        commission: defaultCommission,
        notes: "",
        paymentDate: new Date(),
        withdrawalMonth: 1,
        paymentMethod: "cash",
      });

      onSuccess?.();
    } catch (error) {
      console.error("Payout error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record payout",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4">
            {fundAmount && (
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-blue-500" />
                    <span>
                      Fund amount: {formatCurrency(fundAmount)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-green-500" />
                    <span>
                      Months paid: {monthsPaid}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-green-500" />
                    <span>
                      Amount paid: {formatCurrency(paidAmount)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-green-500" />
                    <span>
                      Bonus earned: {formatCurrency(bonusAmount)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-amber-500" />
                    <span>
                      Remaining fund: {formatCurrency(remainingAmount)}
                    </span>
                  </div>
                  {commissionAmount && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <InfoIcon className="h-4 w-4 text-amber-500" />
                      <span>
                        Commission: {formatCurrency(commissionAmount)}
                      </span>
                    </div>
                  )}
                  {penaltyAmount && parseFloat(penaltyAmount) > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <InfoIcon className="h-4 w-4 text-red-500" />
                      <span>
                        Late withdrawal penalty: {formatCurrency(penaltyAmount)}
                      </span>
                    </div>
                  )}
                  {payoutAmount && (
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <InfoIcon className="h-4 w-4 text-green-500" />
                      <span>
                        Payout amount: {formatCurrency(payoutAmount)}
                      </span>
                    </div>
                  )}
                  {memberDetails?.isWithdrawn && (
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-red-600">
                      <InfoIcon className="h-4 w-4 text-red-500" />
                      <span>
                        Member has already withdrawn from this fund!
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <FormField
              control={form.control}
              name="withdrawalMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Withdrawal Month</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="24"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The month number when the member is withdrawing the chit (1-24)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Payment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <Calendar className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commission"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commission Amount</FormLabel>
                  <FormControl>
                    <div className="flex space-x-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        step="100" 
                        placeholder="Enter commission amount in rupees (e.g. 5000)"
                        {...field}
                        onChange={(e) => {
                          // Ensure we only save valid numbers
                          const value = parseInt(e.target.value, 10);
                          field.onChange(isNaN(value) ? "5000" : String(value));
                        }}
                        className="flex-1"
                      />
                      <Button 
                        type="button" 
                        variant="outline"
                        onClick={() => {
                          // Reset to fund's base commission or calculate 5k per lakh (5% of fund amount)
                          let baseCommission = "5000";
                          if (fundData?.baseCommission) {
                            baseCommission = fundData.baseCommission;
                          } else if (fundData?.amount) {
                            const fundAmountNum = parseFloat(fundData.amount);
                            baseCommission = Math.round(fundAmountNum * 0.05).toString(); // 5k per lakh (5% of fund amount)
                          }
                          field.onChange(baseCommission);
                          setCommissionAmount(baseCommission);
                        }}
                      >
                        Reset to Default
                      </Button>
                    </div>
                  </FormControl>
                  <FormDescription>
                    Commission to be deducted from the fund amount (in rupees, not percentage).
                    The default commission is calculated at 5k per lakh (5% of fund amount).
                    For this fund, it is {fundData?.baseCommission 
                      ? ` ₹${parseFloat(fundData.baseCommission).toLocaleString()}` 
                      : fundData?.amount ? ` ₹${Math.round(parseFloat(fundData.amount) * 0.05).toLocaleString()}` : " ₹5,000"}, 
                    but can be adjusted by an admin as needed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Method</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      {...field}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="google_pay">Google Pay</option>
                      <option value="phone_pay">Phone Pay</option>
                      <option value="online_portal">Online Portal</option>
                    </select>
                  </FormControl>
                  <FormDescription>
                    Select the payment method used for this payout. This affects the balance tracking.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Add any additional notes about the payout"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !!(memberDetails?.isWithdrawn && memberDetails?.hasPayable)}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing Payout...
                </>
              ) : (memberDetails?.isWithdrawn && memberDetails?.hasPayable) ? (
                'Member Has Already Withdrawn and Received Payout'
              ) : memberDetails?.isWithdrawn ? (
                'Retry Processing Incomplete Payout'
              ) : (
                'Process Payout'
              )}
            </Button>
          </div>
        </ScrollArea>
      </form>
    </Form>
  );
}

export default PayoutForm;