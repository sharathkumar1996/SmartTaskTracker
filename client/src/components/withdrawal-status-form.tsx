import { useState, useEffect } from "react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

const withdrawalSchema = z.object({
  isWithdrawn: z.boolean().default(false),
  withdrawalMonth: z.coerce.number().optional(),
});

export type WithdrawalFormProps = {
  fundId: number;
  userId: number;
  initialValues?: {
    isWithdrawn: boolean;
    earlyWithdrawalMonth?: number | null;
  };
  onSuccess?: () => void;
  className?: string;
};

export function WithdrawalStatusForm({ fundId, userId, initialValues, onSuccess, className }: WithdrawalFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof withdrawalSchema>>({
    resolver: zodResolver(withdrawalSchema),
    defaultValues: {
      isWithdrawn: initialValues?.isWithdrawn || false,
      withdrawalMonth: initialValues?.earlyWithdrawalMonth || undefined,
    },
  });

  useEffect(() => {
    if (initialValues) {
      form.reset({
        isWithdrawn: initialValues.isWithdrawn,
        withdrawalMonth: initialValues.earlyWithdrawalMonth || undefined,
      });
    }
  }, [initialValues, form]);

  async function onSubmit(data: z.infer<typeof withdrawalSchema>) {
    setIsSubmitting(true);
    try {
      const response = await apiRequest(
        "PATCH",
        `/api/chitfunds/${fundId}/members/${userId}/withdraw`,
        {
          isWithdrawn: data.isWithdrawn,
          withdrawalMonth: data.withdrawalMonth,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update withdrawal status");
      }

      toast({
        title: "Success",
        description: "Member withdrawal status updated successfully",
      });

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const showWithdrawalMonth = form.watch("isWithdrawn");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="isWithdrawn"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <FormLabel className="text-base">Has Withdrawn Chit</FormLabel>
                  <FormDescription>
                    Mark if the member has taken the chit amount
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isSubmitting}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {showWithdrawalMonth && (
            <FormField
              control={form.control}
              name="withdrawalMonth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Withdrawal Month</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder="Enter month number"
                      min="1"
                      max="24"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    The month number when the member withdrew the chit
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Withdrawal Status"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default WithdrawalStatusForm;