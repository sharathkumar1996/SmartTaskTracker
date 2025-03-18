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
  
  // Calculate total fund amount based on monthly contribution
  const getTotalFundAmount = () => {
    const monthlyAmount = getMonthlyContribution();
    if (isNaN(monthlyAmount)) return 0;
    
    // Total fund amount is 20 times the monthly contribution (since monthly is 5% of total)
    return monthlyAmount * 20;
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
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="p-4 bg-muted rounded-lg mb-4">
            <h3 className="font-medium mb-2">Current Contribution Details</h3>
            <p className="text-sm text-muted-foreground mb-1">
              Standard Monthly Amount: <span className="font-medium">{formatCurrency(standardAmount)}</span>
            </p>
            <p className="text-sm text-muted-foreground mb-1">
              Standard Monthly Bonus: <span className="font-medium">{formatCurrency(parseFloat(standardAmount) * 0.1)}</span>
            </p>
            <p className="text-xs text-green-700 dark:text-green-400 mt-2">
              After withdrawal, payment increases by 20%.
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
                <FormDescription className="text-xs">
                  A label to identify this share when a member has multiple spots in the fund
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="mb-4 text-center">
            <p className="text-xs text-blue-700 dark:text-blue-400 mb-2">
              Update automatically to maintain the 5% ratio.
            </p>
          </div>
          
          <FormField
            control={form.control}
            name="increasedMonthlyAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Option 1: Custom Monthly Contribution</FormLabel>
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
                      
                      // If we set a custom monthly amount, calculate and update the custom fund amount
                      if (value) {
                        const monthlyContribution = parseFloat(value);
                        if (!isNaN(monthlyContribution)) {
                          // Calculate fund amount as 20x the monthly contribution (since monthly is 5% of total)
                          const fundAmount = monthlyContribution * 20;
                          // Update the custom fund amount field with this calculated value
                          form.setValue("customFundAmount", fundAmount.toString());
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Monthly contribution amount (e.g., 10,000 per month)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex items-center my-2">
            <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800"></div>
            <span className="px-3 text-xs text-blue-600 dark:text-blue-400">AND</span>
            <div className="h-px flex-1 bg-blue-200 dark:bg-blue-800"></div>
          </div>

          <FormField
            control={form.control}
            name="customFundAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Option 2: Custom Chit Fund Amount</FormLabel>
                <FormControl>
                  <Input
                    placeholder={`Standard fund: ₹100,000`}
                    {...field}
                    disabled={isSubmitting}
                    value={field.value || ""}
                    onChange={(e) => {
                      // Allow only numbers and basic formatting
                      const value = e.target.value.replace(/[^\d.-]/g, '');
                      field.onChange(value);
                      
                      // If we set a custom fund amount, calculate and update the monthly contribution
                      if (value) {
                        const customFundAmount = parseFloat(value);
                        if (!isNaN(customFundAmount)) {
                          // Calculate monthly contribution as 5% of the fund amount
                          const monthlyAmount = customFundAmount * 0.05;
                          // Update the monthly contribution field with this calculated value
                          form.setValue("increasedMonthlyAmount", monthlyAmount.toString());
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Custom chit fund amount (e.g., 2 lakhs)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="mt-6 pb-2">
          <Button type="submit" disabled={isSubmitting} className="w-full bg-gray-900 hover:bg-gray-800 text-white">
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