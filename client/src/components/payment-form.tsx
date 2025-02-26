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

  async function onSubmit(values: PaymentFormValues) {
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
        monthNumber: values.monthNumber,
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
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder={expectedAmount ? formatCurrency(expectedAmount) : "Enter amount"}
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