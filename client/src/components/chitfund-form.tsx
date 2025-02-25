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

      const fundData = {
        ...values,
        status: "active" as const,
      };

      const response = await apiRequest("POST", "/api/chitfunds", fundData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create chit fund");
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/chitfunds"] });

      toast({
        title: "Success",
        description: "Chit fund created successfully",
      });

      form.reset({
        name: "",
        amount: 0,
        duration: 12,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + 12)),
        memberCount: 10,
      });
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date < new Date()
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
  );
}