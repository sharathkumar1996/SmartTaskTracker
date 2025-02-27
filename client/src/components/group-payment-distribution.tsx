import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChitFund, MemberGroup } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, InfoIcon, Calculator, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface GroupPaymentFormProps {
  className?: string;
  chitFundId: number;
  groupId: number;
  onSuccess?: () => void;
}

const groupPaymentFormSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  paymentMethod: z.enum(["cash", "google_pay", "phone_pay", "online_portal"]),
  notes: z.string().optional(),
  paymentDate: z.date({
    required_error: "Payment date is required",
  }),
  monthNumber: z.coerce.number().min(1, "Month number is required").max(24, "Month number cannot exceed 24"),
});

type GroupPaymentFormValues = z.infer<typeof groupPaymentFormSchema>;

export function GroupPaymentDistribution({ className, chitFundId, groupId, onSuccess }: GroupPaymentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expectedAmount, setExpectedAmount] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [paymentDistribution, setPaymentDistribution] = useState<Array<{
    userId: number;
    fullName: string;
    sharePercentage: string;
    amountDue: string;
  }>>([]);

  // Fetch the fund details
  const { data: fundData } = useQuery<ChitFund>({
    queryKey: ["/api/chitfunds", chitFundId],
    queryFn: async () => {
      const res = await fetch(`/api/chitfunds/${chitFundId}`);
      if (!res.ok) throw new Error("Failed to fetch fund details");
      return res.json();
    },
    enabled: !!chitFundId,
  });

  // Fetch group details with members
  const { data: groupWithMembers, isLoading: isLoadingGroup } = useQuery({
    queryKey: ["/api/member-groups", groupId, "members"],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/member-groups/${groupId}?includeMembers=true`);
      const data = await response.json();
      return data;
    },
    enabled: !!groupId,
  });

  // Calculate expected amount based on fund data
  useEffect(() => {
    if (fundData) {
      setExpectedAmount(fundData.monthlyContribution);
    }
  }, [fundData]);

  const form = useForm<GroupPaymentFormValues>({
    resolver: zodResolver(groupPaymentFormSchema),
    defaultValues: {
      amount: '',
      paymentMethod: "cash",
      notes: "",
      paymentDate: new Date(),
      monthNumber: 1,
    },
  });

  // When amount changes, recalculate distribution
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'amount' && value.amount && groupWithMembers?.members) {
        calculateDistribution(value.amount);
      }
    });
    return () => subscription.unsubscribe();
  }, [form.watch, groupWithMembers]);

  // Calculate payment distribution based on share percentages
  const calculateDistribution = (amount: string) => {
    setIsCalculating(true);
    
    try {
      const totalAmount = parseFloat(amount);
      
      if (isNaN(totalAmount) || totalAmount <= 0 || !groupWithMembers?.members) {
        setPaymentDistribution([]);
        setIsCalculating(false);
        return;
      }
      
      // Calculate individual amounts based on share percentages
      const distribution = groupWithMembers.members.map((member: { userId: number; sharePercentage: string; user?: { fullName: string }}) => {
        const sharePercentage = parseFloat(member.sharePercentage);
        const amountDue = (totalAmount * sharePercentage / 100).toFixed(2);
        
        return {
          userId: member.userId,
          fullName: member.user?.fullName || `Member #${member.userId}`,
          sharePercentage: member.sharePercentage,
          amountDue
        };
      });
      
      setPaymentDistribution(distribution);
    } catch (error) {
      console.error("Error calculating distribution:", error);
      toast({
        title: "Calculation Error",
        description: "Failed to calculate payment distribution",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Create mutation for group payment submission
  const groupPaymentMutation = useMutation({
    mutationFn: async (data: GroupPaymentFormValues & { distribution: any[] }) => {
      const response = await apiRequest("POST", "/api/member-groups/payments", {
        body: JSON.stringify({
          groupId,
          chitFundId,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          notes: data.notes || `Group payment for month ${data.monthNumber}`,
          paymentDate: data.paymentDate,
          monthNumber: data.monthNumber,
          distribution: data.distribution
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to process group payment");
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment recorded",
        description: "The group payment has been recorded successfully and distributed to members.",
      });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chitfunds", chitFundId, "payments"] });
      
      // Reset the form
      form.reset();
      setPaymentDistribution([]);
      
      // Call the success callback if provided
      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      console.error("Error recording group payment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to record group payment",
        variant: "destructive",
      });
    }
  });

  // Handle form submission
  const onSubmit = async (values: GroupPaymentFormValues) => {
    if (!groupWithMembers || !groupWithMembers.members || groupWithMembers.members.length === 0) {
      toast({
        title: "Invalid group",
        description: "This group has no members",
        variant: "destructive",
      });
      return;
    }

    if (paymentDistribution.length === 0) {
      toast({
        title: "Missing distribution",
        description: "Please calculate the payment distribution first",
        variant: "destructive",
      });
      return;
    }

    groupPaymentMutation.mutate({
      ...values,
      distribution: paymentDistribution
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className={className}>
        <div className="space-y-4">
          {expectedAmount && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <InfoIcon className="h-4 w-4 text-blue-500" />
                  <span>
                    Expected monthly payment: {formatCurrency(expectedAmount)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Payment Amount</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter amount"
                      {...field}
                      type="number"
                      min="1"
                      step="0.01"
                    />
                    <Button 
                      type="button" 
                      variant="secondary"
                      onClick={() => {
                        if (expectedAmount) {
                          form.setValue("amount", expectedAmount);
                          calculateDistribution(expectedAmount);
                        }
                      }}
                      disabled={!expectedAmount}
                    >
                      <Calculator className="h-4 w-4 mr-2" />
                      Use Expected
                    </Button>
                  </div>
                </FormControl>
                <FormDescription>
                  Total payment amount for the group
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="monthNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Month Number</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter month number"
                    {...field}
                    type="number"
                    min="1"
                    max="24"
                  />
                </FormControl>
                <FormDescription>
                  The month number this payment applies to (1-24)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

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
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => false} // Allow any date for historical data entry
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Payment Distribution Table */}
          {paymentDistribution.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payment Distribution</CardTitle>
                <CardDescription>
                  How the payment will be distributed to group members
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Share %</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentDistribution.map((item) => (
                      <TableRow key={item.userId}>
                        <TableCell>{item.fullName}</TableCell>
                        <TableCell>{parseFloat(item.sharePercentage).toFixed(2)}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.amountDue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {isLoadingGroup ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : groupWithMembers && (!groupWithMembers.members || groupWithMembers.members.length === 0) ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Invalid Group</AlertTitle>
              <AlertDescription>
                This group has no members. Please add members to the group before recording a payment.
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            type="submit"
            className="w-full"
            disabled={groupPaymentMutation.isPending || isLoadingGroup || paymentDistribution.length === 0}
          >
            {groupPaymentMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing Payment...
              </>
            ) : (
              'Record Group Payment'
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}