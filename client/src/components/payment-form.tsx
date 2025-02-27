import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { Loader2, Calendar, InfoIcon } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ChitFund, FundMember } from "@shared/schema";

interface PaymentFormProps {
  className?: string;
  chitFundId: number;
  userId: number;
  onSuccess?: () => void;
}

const paymentFormSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  paymentMethod: z.enum(["cash", "google_pay", "phone_pay", "online_portal"]),
  notes: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
  monthNumber: z.coerce.number().min(1, "Month number is required").max(24, "Month number cannot exceed 24"),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export function PaymentForm({ className, chitFundId, userId, onSuccess }: PaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expectedAmount, setExpectedAmount] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState<number>(1);
  const [remainingAmount, setRemainingAmount] = useState<string | null>(null);

  // Fetch the fund details to calculate expected amount
  const { data: fundData } = useQuery<ChitFund>({
    queryKey: ["/api/chitfunds", chitFundId],
    queryFn: async () => {
      const res = await fetch(`/api/chitfunds/${chitFundId}`);
      if (!res.ok) throw new Error("Failed to fetch fund details");
      return res.json();
    },
    enabled: !!chitFundId,
  });

  // Fetch member details to check if they have withdrawn
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

  // Fetch existing receivable for the selected month
  const { data: existingReceivable } = useQuery({
    queryKey: ["/api/receivables/fund", chitFundId, "month", currentMonth, userId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/receivables/fund/${chitFundId}/month/${currentMonth}`);
        if (!res.ok) return null;
        const data = await res.json();
        // Find the receivable that belongs to this user
        return data.find((item: any) => item.userId === userId);
      } catch (error) {
        console.error("Error fetching receivables:", error);
        return null;
      }
    },
    enabled: !!chitFundId && !!userId && !!currentMonth,
  });

  // Calculate expected payment amount based on fund amount and withdrawal status
  useEffect(() => {
    if (fundData && fundData.amount) {
      try {
        const fundAmount = parseFloat(fundData.amount.toString());
        const baseRate = 0.05; // 5% of fund amount per month
        const withdrawnRate = 0.06; // 6% of fund amount per month (20% increase)

        if (memberDetails?.isWithdrawn) {
          setExpectedAmount((fundAmount * withdrawnRate).toString());
        } else {
          setExpectedAmount((fundAmount * baseRate).toString());
        }
      } catch (error) {
        console.error("Error calculating expected amount:", error);
        setExpectedAmount(null);
      }
    }
  }, [fundData, memberDetails]);

  // Calculate remaining amount based on expected amount and already paid amount
  useEffect(() => {
    if (expectedAmount && existingReceivable) {
      try {
        const expected = parseFloat(expectedAmount);
        const paid = parseFloat(existingReceivable.paidAmount || "0");
        const remaining = Math.max(0, expected - paid); // Ensure remaining is never negative
        setRemainingAmount(remaining.toString());
      } catch (error) {
        console.error("Error calculating remaining amount:", error);
        setRemainingAmount(expectedAmount); // Default to full expected amount if there's an error
      }
    } else {
      setRemainingAmount(expectedAmount); // Default to full expected amount if no existing receivable
    }
  }, [expectedAmount, existingReceivable]);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: '',
      paymentMethod: "cash",
      notes: "",
      paymentDate: new Date(),
      monthNumber: 1,
    },
  });

  // Update the current month when the form month number changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'monthNumber' && value.monthNumber) {
        setCurrentMonth(Number(value.monthNumber));
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch]);

  async function onSubmit(values: PaymentFormValues) {
    // Ensure month number is valid (1-20)
    const monthNumber = Math.max(1, Math.min(20, values.monthNumber || 1));
    try {
      setIsSubmitting(true);

      // Format amount: remove non-numeric characters and ensure it's a valid number
      const numericAmount = values.amount.replace(/[^0-9]/g, '');
      if (!numericAmount || isNaN(Number(numericAmount))) {
        throw new Error("Invalid amount");
      }

      const paymentData = {
        userId,
        chitFundId,
        amount: numericAmount,
        paymentMethod: values.paymentMethod,
        paymentType: "monthly",
        paymentDate: values.paymentDate,
        monthNumber: monthNumber, // Use the validated month number
        notes: values.notes,
        recordedBy: user?.id,
      };

      const response = await apiRequest("POST", "/api/payments", paymentData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to record payment");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", chitFundId, "payments"] });
      // Also invalidate accounts receivable to reflect the new payment
      await queryClient.invalidateQueries({ queryKey: ["/api/accounts/receivables"] });
      // Invalidate the current month receivable query
      await queryClient.invalidateQueries({ 
        queryKey: ["/api/receivables/fund", chitFundId, "month", values.monthNumber, userId] 
      });

      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });

      form.reset({
        amount: '',
        paymentMethod: "cash",
        notes: "",
        paymentDate: new Date(),
        monthNumber: 1,
      });

      onSuccess?.();
    } catch (error) {
      console.error("Payment error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record payment",
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
          {expectedAmount && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <InfoIcon className="h-4 w-4 text-blue-500" />
                  <span>
                    Expected monthly payment: {formatCurrency(expectedAmount)}
                    {memberDetails?.isWithdrawn && " (withdrawn)"}
                  </span>
                </div>
                {existingReceivable && parseFloat(existingReceivable.paidAmount || "0") > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <InfoIcon className="h-4 w-4 text-green-500" />
                    <span>
                      Already paid: {formatCurrency(existingReceivable.paidAmount || "0")}
                    </span>
                  </div>
                )}
                {remainingAmount && parseFloat(remainingAmount) > 0 && (
                  <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                    <InfoIcon className="h-4 w-4 text-amber-500" />
                    <span>
                      Remaining to pay: {formatCurrency(remainingAmount)}
                    </span>
                  </div>
                )}
                {existingReceivable && parseFloat(existingReceivable.paidAmount || "0") >= parseFloat(expectedAmount) && (
                  <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-green-600">
                    <InfoIcon className="h-4 w-4 text-green-500" />
                    <span>
                      Fully paid for this month!
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <FormField
            control={form.control}
            name="monthNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month Number</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    max="24"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  The month number for this payment (1-24)
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
                      disabled={(date) => false} // Allow any date for historical data entry
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
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={remainingAmount ? formatCurrency(remainingAmount) : "Enter amount"}
                    {...field}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '');
                      field.onChange(value);
                    }}
                  />
                </FormControl>
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
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="google_pay">Google Pay</SelectItem>
                    <SelectItem value="phone_pay">Phone Pay</SelectItem>
                    <SelectItem value="online_portal">Online Portal</SelectItem>
                  </SelectContent>
                </Select>
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
                    placeholder="Add any additional notes about the payment"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Recording Payment...
              </>
            ) : (
              'Record Payment'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}