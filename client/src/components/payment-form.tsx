import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { insertChitFundSchema, insertPaymentSchema } from "@shared/schema";
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
import { addMonths } from "date-fns";

interface PaymentFormProps {
  type: "fund" | "payment";
  className?: string;
  chitFundId?: number;
  userId?: number;
}

const fundFormSchema = insertChitFundSchema.extend({
  amount: z.number().min(1, "Amount must be greater than 0"),
  duration: z.number().min(20).max(20),
  memberCount: z.number().min(1, "Member count must be at least 1").max(20, "Maximum 20 members allowed"),
  startDate: z.date({
    required_error: "Start date is required",
  }),
});

const paymentFormSchema = insertPaymentSchema.extend({
  amount: z.number().min(1, "Amount must be greater than 0"),
});

export function PaymentForm({ type, className, chitFundId, userId }: PaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fundForm = useForm({
    resolver: zodResolver(fundFormSchema),
    defaultValues: {
      name: "",
      amount: 0,
      duration: 20,
      memberCount: 1,
      status: "active" as const,
      startDate: new Date(),
    },
  });

  const paymentForm = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      userId: userId || 0,
      chitFundId: chitFundId || 0,
      amount: 0,
      paymentDate: new Date().toISOString(),
      paymentType: "monthly" as const,
    },
  });

  const currentForm = type === "fund" ? fundForm : paymentForm;
  const endpoint = type === "fund" ? "/api/chitfunds" : "/api/payments";

  async function onSubmit(values: any) {
    try {
      await apiRequest("POST", endpoint, values);
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({
        title: "Success",
        description: `${type === "fund" ? "Chit fund created" : "Payment recorded"} successfully`,
      });
      currentForm.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  if (type === "fund") {
    return (
      <Form {...fundForm}>
        <form onSubmit={fundForm.handleSubmit(async (values) => {
          try {
            const startDate = values.startDate;
            const endDate = addMonths(startDate, values.duration);

            await apiRequest("POST", endpoint, {
              ...values,
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            });

            await queryClient.invalidateQueries({ queryKey: [endpoint] });
            toast({
              title: "Success",
              description: "Chit fund created successfully",
            });
            fundForm.reset();
          } catch (error) {
            toast({
              title: "Error",
              description: (error as Error).message,
              variant: "destructive",
            });
          }
        })} className={className}>
          <div className="space-y-4">
            <FormField
              control={fundForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fund Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={fundForm.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={fundForm.control}
              name="memberCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member Count (Max: 20)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      {...field}
                      min={1}
                      max={20}
                      onChange={(e) => {
                        const value = Math.min(Number(e.target.value), 20);
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={fundForm.control}
              name="startDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                      onChange={(e) => field.onChange(new Date(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="text-sm text-muted-foreground">
              Duration is fixed at 20 months
            </div>
            <Button type="submit" className="w-full">
              Create Fund
            </Button>
          </div>
        </form>
      </Form>
    );
  }

  return (
    <Form {...paymentForm}>
      <form onSubmit={paymentForm.handleSubmit(onSubmit)} className={className}>
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
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full">
            Make Payment
          </Button>
        </div>
      </form>
    </Form>
  );
}