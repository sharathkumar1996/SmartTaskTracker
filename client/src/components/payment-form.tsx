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

interface PaymentFormProps {
  type: "fund" | "payment";
  className?: string;
  chitFundId?: number;
  userId?: number;
}

export function PaymentForm({ type, className, chitFundId, userId }: PaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const fundForm = useForm({
    resolver: zodResolver(insertChitFundSchema),
    defaultValues: {
      name: "",
      amount: 0,
      duration: 20,
      memberCount: 0,
      agentCommission: 3000,
      status: "active",
    },
  });

  const paymentForm = useForm({
    resolver: zodResolver(insertPaymentSchema),
    defaultValues: {
      userId: userId,
      chitFundId: chitFundId,
      amount: 0,
      paymentDate: new Date(),
      paymentType: "monthly",
    },
  });

  const form = type === "fund" ? fundForm : paymentForm;
  const endpoint = type === "fund" ? "/api/chitfunds" : "/api/payments";

  async function onSubmit(data: any) {
    try {
      await apiRequest("POST", endpoint, data);
      await queryClient.invalidateQueries({ queryKey: [endpoint] });
      toast({
        title: "Success",
        description: `${type === "fund" ? "Chit fund created" : "Payment recorded"} successfully`,
      });
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        {type === "fund" ? (
          <>
            <FormField
              control={form.control}
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
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="duration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (months)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="memberCount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member Count</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="agentCommission"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Commission</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field} 
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : (
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Amount</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    {...field} 
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <Button type="submit" className="w-full mt-4">
          {type === "fund" ? "Create Fund" : "Make Payment"}
        </Button>
      </form>
    </Form>
  );
}
