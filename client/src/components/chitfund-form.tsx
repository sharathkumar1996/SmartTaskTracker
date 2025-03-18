import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
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
import { useState } from "react";
import { Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const chitFundFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  duration: z.coerce.number().min(1, "Duration must be at least 1 month").max(60, "Duration cannot exceed 60 months"),
  startDate: z.date({
    required_error: "Start date is required",
  }),
  endDate: z.date({
    required_error: "End date is required",
  }),
  memberCount: z.coerce.number().min(1, "Member count must be at least 1"),
}).refine((data) => data.endDate > data.startDate, {
  message: "End date must be after start date",
  path: ["endDate"],
});

type ChitFundFormValues = z.infer<typeof chitFundFormSchema>;

export function ChitFundForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ChitFundFormValues>({
    resolver: zodResolver(chitFundFormSchema),
    defaultValues: {
      name: "",
      amount: 0,
      duration: 12,
      startDate: new Date(),
      endDate: new Date(new Date().setMonth(new Date().getMonth() + 12)),
      memberCount: 10,
    },
  });

  async function onSubmit(values: ChitFundFormValues) {
    try {
      setIsSubmitting(true);

      // Calculate monthly contribution from amount and duration
      const monthlyContribution = (values.amount / values.duration).toFixed(2);
      // Calculate default monthly bonus (e.g., 10% of monthly contribution)
      const monthlyBonus = (values.amount * 0.1).toFixed(2);
      // Set default base commission (e.g., 5% of total amount)
      const baseCommission = (values.amount * 0.05).toFixed(2);

      const fundData = {
        ...values,
        amount: values.amount.toString(),
        status: "active" as const,
        // Add required fields from the schema
        monthlyContribution: monthlyContribution,
        monthlyBonus: monthlyBonus,
        baseCommission: baseCommission
      };

      console.log("Submitting fund data:", fundData);

      const response = await apiRequest("POST", "/api/chitfunds", fundData);
      
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Server error response:", errorData);
        throw new Error(errorData.message || "Failed to create chit fund");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/chitfunds"] });

      toast({
        title: "Success",
        description: "Chit fund created successfully",
      });

      form.reset();
    } catch (error) {
      console.error("Chit fund creation error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create chit fund",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollArea className="h-[500px] pr-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fund Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter fund name" />
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
                <FormLabel>Amount per Member (₹)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    min={1}
                    placeholder="Enter amount"
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/^0+/, '') || '0');
                      field.onChange(value);
                    }}
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
                    min={1}
                    max={60}
                    placeholder="Enter duration in months"
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/^0+/, '') || '0');
                      field.onChange(value);
                      if (value > 0) {
                        // Update end date when duration changes
                        const startDate = form.getValues("startDate");
                        if (startDate) {
                          const endDate = new Date(startDate);
                          endDate.setMonth(endDate.getMonth() + value);
                          form.setValue("endDate", endDate);
                        }
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Start Date</FormLabel>
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
                        <Calendar className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => {
                        field.onChange(date);
                        if (date) {
                          // Update end date when start date changes
                          const duration = form.getValues("duration");
                          const endDate = new Date(date);
                          endDate.setMonth(endDate.getMonth() + duration);
                          form.setValue("endDate", endDate);
                        }
                      }}
                      /* Allow dates in the past for historical data */
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>End Date</FormLabel>
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
                        <Calendar className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        date <= form.getValues("startDate")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="memberCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Members</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    min={1}
                    placeholder="Enter number of members"
                    onChange={(e) => {
                      const value = parseInt(e.target.value.replace(/^0+/, '') || '0');
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={isSubmitting}
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Fund...
              </>
            ) : (
              'Create Fund'
            )}
          </Button>
        </form>
      </Form>
    </ScrollArea>
  );
}