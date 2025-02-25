import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { insertPaymentSchema } from "@shared/schema";
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
import { Loader2 } from "lucide-react";

interface PaymentFormProps {
  type: "payment";
  className?: string;
  chitFundId?: number;
  userId?: number;
}

const paymentFormSchema = z.object({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "google_pay", "phone_pay", "online_portal"]),
  paymentType: z.enum(["monthly", "bonus"]),
  notes: z.string().optional(),
});

export function PaymentForm({ type, className, chitFundId, userId }: PaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const paymentForm = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: 0,
      paymentType: "monthly",
      paymentMethod: "cash",
      notes: "",
    },
  });

  return (
    <Form {...paymentForm}>
      <form onSubmit={paymentForm.handleSubmit(async (values) => {
        try {
          setIsSubmitting(true);

          const paymentData = {
            userId: userId,
            chitFundId: chitFundId,
            amount: String(values.amount),
            paymentType: values.paymentType,
            paymentMethod: values.paymentMethod,
            recordedBy: user?.id,
            notes: values.notes || null,
          };

          console.log('Submitting payment:', paymentData);

          const response = await apiRequest("POST", "/api/payments", paymentData);
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to record payment");
          }

          await queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
          toast({
            title: "Success",
            description: "Payment recorded successfully",
          });
          paymentForm.reset({
            amount: 0,
            paymentType: "monthly",
            paymentMethod: "cash",
            notes: "",
          });
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
      })} className={className}>
        <div className="space-y-4">
          <FormField
            control={paymentForm.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/^0+/, '') || '0');
                      field.onChange(value);
                    }}
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={paymentForm.control}
            name="paymentMethod"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Method</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
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
            control={paymentForm.control}
            name="paymentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select payment type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="bonus">Bonus</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {(user?.role === "admin" || user?.role === "agent") && (
            <FormField
              control={paymentForm.control}
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
          )}
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