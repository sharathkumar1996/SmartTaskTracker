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
import { ScrollArea } from "@/components/ui/scroll-area";

interface PaymentFormProps {
  type: "fund" | "payment";
  className?: string;
  chitFundId?: number;
  userId?: number;
}

const fundFormSchema = insertChitFundSchema
  .extend({
    amount: z.coerce.number().min(1, "Amount must be greater than 0"),
    duration: z.coerce.number().min(20).max(20),
    memberCount: z.coerce.number().min(1, "Member count must be at least 1").max(20, "Maximum 20 members allowed"),
    startDate: z.date({
      required_error: "Start date is required",
    }),
    endDate: z.date({
      required_error: "End date is required",
    }),
  })
  .transform((data) => ({
    ...data,
    duration: 20, // Always set to 20 months
    amount: String(data.amount), // Convert to string for schema compatibility
  }));

const paymentFormSchema = insertPaymentSchema.extend({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
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
      endDate: addMonths(new Date(), 20), // Default end date is 20 months from start date
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

  if (type === "fund") {
    return (
      <Form {...fundForm}>
        <form
          onSubmit={fundForm.handleSubmit(async (values) => {
            try {
              const fundData = {
                name: values.name,
                amount: String(values.amount),
                duration: values.duration,
                memberCount: values.memberCount,
                startDate: values.startDate.toISOString(),
                endDate: values.endDate.toISOString(),
                status: values.status,
              };

              const response = await apiRequest("POST", endpoint, fundData);
              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Failed to create fund");
              }

              const result = await response.json();

              await queryClient.invalidateQueries({ queryKey: ["/api/chitfunds"] });
              toast({
                title: "Success",
                description: "Chit fund created successfully",
              });
              fundForm.reset();
            } catch (error) {
              console.error("Fund creation error:", error);
              toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to create fund",
                variant: "destructive",
              });
            }
          })}
          className={className}
        >
          <ScrollArea className="h-[400px] pr-4">
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
                          const value = Math.min(parseInt(e.target.value.replace(/^0+/, '') || '1'), 20);
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
                        onChange={(e) => {
                          const startDate = new Date(e.target.value);
                          field.onChange(startDate);
                          // Update end date when start date changes
                          const endDate = addMonths(startDate, 20);
                          fundForm.setValue('endDate', endDate);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={fundForm.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value instanceof Date ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(new Date(e.target.value))}
                        disabled // End date is automatically calculated
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="text-sm text-muted-foreground">
                Duration is fixed at 20 months
              </div>
              <Button type="submit" className="w-full mt-6">
                Create Fund
              </Button>
            </div>
          </ScrollArea>
        </form>
      </Form>
    );
  }

  return (
    <Form {...paymentForm}>
      <form onSubmit={paymentForm.handleSubmit(async (values) => {
        try {
          await apiRequest("POST", endpoint, {
            ...values,
            amount: String(values.amount), // Convert to string as per schema
          });
          await queryClient.invalidateQueries({ queryKey: [endpoint] });
          toast({
            title: "Success",
            description: "Payment recorded successfully",
          });
          paymentForm.reset();
        } catch (error) {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to record payment",
            variant: "destructive",
          });
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
          <Button type="submit" className="w-full">
            Make Payment
          </Button>
        </div>
      </form>
    </Form>
  );
}