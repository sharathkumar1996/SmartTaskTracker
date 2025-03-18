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
  customFundAmount: z.string().optional(),
});

export type ContributionFormProps = {
  fundId: number;
  userId: number;
  standardAmount: string;
  initialValues?: {
    increasedMonthlyAmount?: string | null;
    shareIdentifier?: string | null;
    customFundAmount?: string | null;
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
      customFundAmount: initialValues?.customFundAmount || undefined,
    },
  });

  useEffect(() => {
    if (initialValues) {
      form.reset({
        increasedMonthlyAmount: initialValues.increasedMonthlyAmount || undefined,
        shareIdentifier: initialValues.shareIdentifier || undefined,
        customFundAmount: initialValues.customFundAmount || undefined,
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
          customFundAmount: data.customFundAmount,
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

  // Calculate monthly contribution amount based on custom fund amount if provided
  const getMonthlyContribution = () => {
    // If user has manually entered a monthly amount, use that
    const increasedAmount = form.watch("increasedMonthlyAmount") as string | undefined;
    if (increasedAmount) {
      return parseFloat(increasedAmount.replace(/[^\d.-]/g, ''));
    }
    
    // If user has specified a custom fund amount, calculate 5% of that
    const customFundAmount = form.watch("customFundAmount") as string | undefined;
    if (customFundAmount) {
      const customAmount = parseFloat(customFundAmount.replace(/[^\d.-]/g, ''));
      if (!isNaN(customAmount)) {
        return customAmount * 0.05; // 5% of custom fund amount
      }
    }
    
    // Default to standard amount
    return parseFloat(standardAmount);
  };

  // Calculate expected bonus based on contribution
  const getCurrentBonus = () => {
    const contributionAmount = getMonthlyContribution();
    if (isNaN(contributionAmount)) return formatCurrency(0);
    
    // Calculate bonus as 10% of monthly contribution
    const bonusAmount = contributionAmount * 0.1;
    return formatCurrency(bonusAmount);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        <div className="max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg mb-4 sticky top-0 z-10">
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

            <div className="p-4 border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 rounded-lg mb-4">
              <h4 className="font-medium mb-2 text-blue-800 dark:text-blue-300">Custom Amount Options</h4>
              <p className="text-xs text-blue-700 dark:text-blue-400 mb-4">
                Choose one of the options below to customize the contribution amount.
              </p>

              <FormField
                control={form.control}
                name="customFundAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Option 1: Custom Chit Fund Amount</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={`Standard fund: ₹100,000`}
                        {...field}
                        disabled={isSubmitting || !!form.watch("increasedMonthlyAmount")}
                        value={field.value || ""}
                        onChange={(e) => {
                          // Allow only numbers and basic formatting
                          const value = e.target.value.replace(/[^\d.-]/g, '');
                          field.onChange(value);
                          
                          // If we set a custom fund amount, clear any custom monthly contribution
                          if (value && form.watch("increasedMonthlyAmount")) {
                            form.setValue("increasedMonthlyAmount", "");
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Set a custom chit fund amount (e.g., 2 lakhs instead of 1 lakh). Monthly payments will be 5% of this amount.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="my-4 flex items-center">
                <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800"></div>
                <span className="px-3 text-xs text-blue-600 dark:text-blue-400">OR</span>
                <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800"></div>
              </div>

              <FormField
                control={form.control}
                name="increasedMonthlyAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Option 2: Custom Monthly Contribution</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={`Standard amount: ${formatCurrency(standardAmount)}`}
                        {...field}
                        disabled={isSubmitting || !!form.watch("customFundAmount")}
                        value={field.value || ""}
                        onChange={(e) => {
                          // Allow only numbers and basic formatting
                          const value = e.target.value.replace(/[^\d.-]/g, '');
                          field.onChange(value);
                          
                          // If we set a custom monthly amount, clear any custom fund amount
                          if (value && form.watch("customFundAmount")) {
                            form.setValue("customFundAmount", "");
                          }
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Directly specify a monthly contribution amount (alternative to custom fund amount)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {(form.watch("increasedMonthlyAmount") || form.watch("customFundAmount")) && (
              <div className="p-4 border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 rounded-lg">
                <h4 className="font-medium mb-2 text-green-800 dark:text-green-300">Calculation Summary</h4>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">
                  Monthly contribution: {formatCurrency(getMonthlyContribution())}
                </p>
                <p className="text-sm font-medium text-green-800 dark:text-green-300 mt-1">
                  Expected monthly bonus: {getCurrentBonus()}
                </p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                  After withdrawal, member will need to pay {formatCurrency(getMonthlyContribution() * 1.2)} per month
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 sticky bottom-0 bg-background pt-2 border-t">
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