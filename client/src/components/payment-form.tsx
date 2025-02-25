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
import { addMonths, format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";

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
    startDate: z.string().refine((str) => {
      return !isNaN(new Date(str).getTime());
    }, {
      message: "Invalid start date"
    }),
    endDate: z.string().refine((str) => {
      return !isNaN(new Date(str).getTime());
    }, {
      message: "Invalid end date"
    }),
  })
  .transform((data) => ({
    ...data,
    duration: 20,
    amount: String(data.amount),
  }));

const paymentFormSchema = insertPaymentSchema.extend({
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "google_pay", "phone_pay", "online_portal"]),
  notes: z.string().optional(),
  paymentDate: z.string(),
});

export function PaymentForm({ type, className, chitFundId, userId }: PaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const fundForm = useForm({
    resolver: zodResolver(fundFormSchema),
    defaultValues: {
      name: "",
      amount: 0,
      duration: 20,
      memberCount: 1,
      status: "active" as const,
      startDate: new Date().toISOString().split('T')[0],
      endDate: addMonths(new Date(), 20).toISOString().split('T')[0],
    },
  });

  const paymentForm = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      userId: userId || 0,
      chitFundId: chitFundId || 0,
      amount: 0,
      paymentDate: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"),
      paymentType: "monthly" as const,
      paymentMethod: "cash" as const,
      recordedBy: user?.id || 0,
      notes: "",
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
                startDate: values.startDate,
                endDate: values.endDate,
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
                        onChange={(e) => {
                          field.onChange(e.target.value);
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
                        onChange={(e) => field.onChange(e.target.value)}
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
          const paymentData = {
            ...values,
            amount: String(values.amount),
            paymentDate: new Date().toISOString(),
            recordedBy: user?.id,
          };

          const response = await apiRequest("POST", endpoint, paymentData);
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to record payment");
          }

          await queryClient.invalidateQueries({ queryKey: [endpoint] });
          toast({
            title: "Success",
            description: "Payment recorded successfully",
          });
          paymentForm.reset({
            ...paymentForm.getValues(),
            amount: 0,
            notes: "",
          });
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
          <Button type="submit" className="w-full">
            Record Payment
          </Button>
        </div>
      </form>
    </Form>
  );
}