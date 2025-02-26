import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface PaymentFormProps {
  type: "receivable" | "payable";
  className?: string;
  chitFundId: number;
  userId: number;
  onSuccess?: () => void;
}

const baseFormSchema = {
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  notes: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
};

const receivableFormSchema = z.object({
  ...baseFormSchema,
  paymentType: z.enum(["monthly", "deposit"]),
  paymentMethod: z.enum(["cash", "google_pay", "phone_pay", "online_portal"]),
  monthNumber: z.number().min(1).max(20, "Month number must be between 1 and 20"),
});

const payableFormSchema = z.object({
  ...baseFormSchema,
  paymentType: z.enum(["bonus", "withdrawal", "commission"]),
});

type ReceivableFormValues = z.infer<typeof receivableFormSchema>;
type PayableFormValues = z.infer<typeof payableFormSchema>;

export function PaymentForm({ type, className, chitFundId, userId, onSuccess }: PaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isReceivable = type === "receivable";
  const formSchema = isReceivable ? receivableFormSchema : payableFormSchema;

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: 0,
      notes: "",
      paymentDate: new Date(),
      ...(isReceivable ? {
        paymentType: "monthly",
        paymentMethod: "cash",
        monthNumber: 1,
      } : {
        paymentType: "bonus",
      }),
    },
  });

  async function onSubmit(values: ReceivableFormValues | PayableFormValues) {
    try {
      setIsSubmitting(true);

      const paymentData = {
        userId,
        chitFundId,
        ...values,
        amount: values.amount.toString(),
        recordedBy: user?.id,
      };

      const endpoint = isReceivable ? "/api/receivables" : "/api/payables";
      const response = await apiRequest("POST", endpoint, paymentData);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `Failed to record ${isReceivable ? 'payment' : 'payout'}`);
      }

      await queryClient.invalidateQueries({ queryKey: [`/api/${isReceivable ? 'receivables' : 'payables'}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", chitFundId, "payments"] });

      toast({
        title: "Success",
        description: `${isReceivable ? 'Payment' : 'Payout'} recorded successfully`,
      });

      form.reset({
        amount: 0,
        notes: "",
        paymentDate: new Date(),
        ...(isReceivable ? {
          paymentType: "monthly",
          paymentMethod: "cash",
          monthNumber: 1,
        } : {
          paymentType: "bonus",
        }),
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

          {isReceivable && (
            <FormField
              control={form.control}
              name="monthNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Month Number</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/^0+/, '') || '0');
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
            name="paymentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {isReceivable ? (
                      <>
                        <SelectItem value="monthly">Monthly Payment</SelectItem>
                        <SelectItem value="deposit">Deposit</SelectItem>
                      </>
                    ) : (
                      <>
                        <SelectItem value="bonus">Monthly Bonus</SelectItem>
                        <SelectItem value="withdrawal">Early Withdrawal</SelectItem>
                        <SelectItem value="commission">Agent Commission</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {isReceivable && (
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
          )}

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
                {`Recording ${isReceivable ? 'Payment' : 'Payout'}...`}
              </>
            ) : (
              `Record ${isReceivable ? 'Payment' : 'Payout'}`
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}