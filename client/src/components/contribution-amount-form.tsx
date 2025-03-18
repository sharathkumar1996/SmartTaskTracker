import { useState, useEffect } from "react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

const contributionSchema = z.object({
  increasedMonthlyAmount: z.string().optional(),
  shareIdentifier: z.string().optional(),
});

export type ContributionFormProps = {
  fundId: number;
  userId: number;
  standardAmount: string;
  initialValues?: {
    increasedMonthlyAmount?: string | null;
    shareIdentifier?: string | null;
  };
  onSuccess?: () => void;
  className?: string;
};

export function ContributionAmountForm({ 
  fundId, 
  userId, 
  standardAmount, 
  initialValues, 
  onSuccess, 
  className 
}: ContributionFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof contributionSchema>>({
    resolver: zodResolver(contributionSchema),
    defaultValues: {
      increasedMonthlyAmount: initialValues?.increasedMonthlyAmount || undefined,
      shareIdentifier: initialValues?.shareIdentifier || undefined,
    },
  });

  useEffect(() => {
    if (initialValues) {
      form.reset({
        increasedMonthlyAmount: initialValues.increasedMonthlyAmount || undefined,
        shareIdentifier: initialValues.shareIdentifier || undefined,
      });
    }
  }, [initialValues, form]);

  async function onSubmit(data: z.infer<typeof contributionSchema>) {
    setIsSubmitting(true);
    try {
      const response = await apiRequest(
        "PATCH",
        `/api/chitfunds/${fundId}/members/${userId}/contribution`,
        {
          increasedMonthlyAmount: data.increasedMonthlyAmount,
          shareIdentifier: data.shareIdentifier,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update contribution amount");
      }

      toast({
        title: "Success",
        description: "Member contribution amount updated successfully",
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

  // Calculate expected bonus based on contribution (assuming 1,000 bonus per 10,000 contribution)
  const getCurrentBonus = () => {
    const contributionAmount = form.watch("increasedMonthlyAmount") || standardAmount;
    const numericAmount = parseFloat(contributionAmount.replace(/[^\d.-]/g, ''));
    if (isNaN(numericAmount)) return formatCurrency(0);
    
    // Calculate bonus as 10% of monthly contribution
    const bonusAmount = numericAmount * 0.1;
    return formatCurrency(bonusAmount);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        <div className="space-y-4">
          <div className="p-4 bg-muted rounded-lg mb-4">
            <h3 className="font-medium mb-2">Current Contribution Details</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Standard Monthly Amount: <span className="font-medium">{formatCurrency(standardAmount)}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Standard Monthly Bonus: <span className="font-medium">{formatCurrency(parseFloat(standardAmount) * 0.1)}</span>
            </p>
          </div>
          
          <FormField
            control={form.control}
            name="shareIdentifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Share Identifier (Optional)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Main, Second Share, etc."
                    {...field}
                    disabled={isSubmitting}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormDescription>
                  A label to identify this share when a member has multiple spots in the fund
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="increasedMonthlyAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Custom Monthly Contribution</FormLabel>
                <FormControl>
                  <Input
                    placeholder={`Standard amount: ${formatCurrency(standardAmount)}`}
                    {...field}
                    disabled={isSubmitting}
                    value={field.value || ""}
                    onChange={(e) => {
                      // Allow only numbers and basic formatting
                      const value = e.target.value.replace(/[^\d.-]/g, '');
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormDescription>
                  Customize the monthly contribution amount for this member (leave empty to use standard amount)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {form.watch("increasedMonthlyAmount") && (
            <div className="p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 rounded-lg">
              <p className="text-sm font-medium text-green-800 dark:text-green-300">
                Expected monthly bonus: {getCurrentBonus()}
              </p>
              <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                After withdrawal, member will need to pay {formatCurrency((parseFloat(form.watch("increasedMonthlyAmount") || standardAmount) * 1.2))} per month
              </p>
            </div>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Contribution Amount"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default ContributionAmountForm;