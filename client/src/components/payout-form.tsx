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
});

type PayoutFormValues = z.infer<typeof payoutFormSchema>;

export function PayoutForm({ className, chitFundId, userId, onSuccess }: PayoutFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fundAmount, setFundAmount] = useState<string | null>(null);
  const [payoutAmount, setPayoutAmount] = useState<string | null>(null);
  const [commissionAmount, setCommissionAmount] = useState<string>("0");

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

  // Initialize fund amount when fund data is loaded
  useEffect(() => {
    if (fundData && fundData.amount) {
      setFundAmount(fundData.amount.toString());
    }
  }, [fundData]);

  // Calculate payout amount based on fund amount and commission
  useEffect(() => {
    if (fundAmount) {
      try {
        const fundAmountValue = parseFloat(fundAmount);
        const commissionValue = parseFloat(commissionAmount || "0");
        const calculatedPayoutAmount = fundAmountValue - commissionValue;
        setPayoutAmount(calculatedPayoutAmount.toString());
      } catch (error) {
        console.error("Error calculating payout amount:", error);
        setPayoutAmount(null);
      }
    }
  }, [fundAmount, commissionAmount]);

  const form = useForm<PayoutFormValues>({
    resolver: zodResolver(payoutFormSchema),
    defaultValues: {
      commission: fundData?.baseCommission || "5000",
      notes: "",
      paymentDate: new Date(),
      withdrawalMonth: memberDetails?.earlyWithdrawalMonth || 1,
    },
  });

  // Update the commission amount when the form value changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'commission' && value.commission) {
        setCommissionAmount(value.commission.replace(/[^0-9]/g, ''));
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);

  // Update default values when data is loaded
  useEffect(() => {
    if (fundData?.baseCommission) {
      form.setValue('commission', fundData.baseCommission);
      setCommissionAmount(fundData.baseCommission);
    }
    if (memberDetails?.earlyWithdrawalMonth) {
      form.setValue('withdrawalMonth', memberDetails.earlyWithdrawalMonth);
    }
  }, [fundData, memberDetails, form]);

  async function onSubmit(values: PayoutFormValues) {
    if (memberDetails?.isWithdrawn) {
      toast({
        title: "Error",
        description: "This member has already withdrawn from this fund",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Format commission: remove non-numeric characters and ensure it's a valid number
      const numericCommission = values.commission.replace(/[^0-9]/g, '');
      if (!numericCommission || isNaN(Number(numericCommission))) {
        throw new Error("Invalid commission amount");
      }

      // Calculate payout amount
      if (!fundAmount) {
        throw new Error("Fund amount not available");
      }
      const fundAmountValue = parseFloat(fundAmount);
      const commissionValue = parseFloat(numericCommission);
      const payoutAmountValue = fundAmountValue - commissionValue;

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
      const payableData = {
        userId,
        chitFundId,
        paymentType: "withdrawal",
        amount: payoutAmountValue.toString(),
        recordedBy: user?.id,
        notes: values.notes,
        paidDate: values.paymentDate,
        commission: numericCommission,
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

      form.reset({
        commission: fundData?.baseCommission || "5000",
        notes: "",
        paymentDate: new Date(),
        withdrawalMonth: 1,
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
                {commissionAmount && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-amber-500" />
                    <span>
                      Commission: {formatCurrency(commissionAmount)}
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
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter commission amount in rupees (e.g. 5000)"
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormDescription>
                  Commission to be deducted from the fund amount (in rupees, not percentage)
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
            disabled={isSubmitting || (memberDetails?.isWithdrawn === true)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Payout...
              </>
            ) : memberDetails?.isWithdrawn ? (
              'Member Has Already Withdrawn'
            ) : (
              'Process Payout'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default PayoutForm;