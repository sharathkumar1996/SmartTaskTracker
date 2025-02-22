import { useAuth } from "@/hooks/use-auth";
import { Loader2, LogOut } from "lucide-react";
import { ChitFundTable } from "@/components/chitfund-table";
import { PaymentForm } from "@/components/payment-form";
import { StatsCards } from "@/components/stats-cards";
import { MemberManagement } from "@/components/member-management";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useQuery } from "@tanstack/react-query";
import { ChitFund, Payment, User } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Dashboard() {
  const { user, logoutMutation } = useAuth();
  const { data: users = [] } = useQuery<User[]>({ 
    queryKey: ["/api/users"],
    enabled: user?.role === "admin" || user?.role === "agent"
  });
  const { data: chitFunds = [], isLoading: isLoadingChitFunds } = useQuery<ChitFund[]>({ 
    queryKey: ["/api/chitfunds"] 
  });
  const { data: payments = [], isLoading: isLoadingPayments } = useQuery<Payment[]>({ 
    queryKey: ["/api/payments", user?.id],
    enabled: !!user
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Chit Fund Management</h1>
            <p className="text-muted-foreground">Welcome, {user.fullName}</p>
          </div>
          <Button variant="outline" onClick={() => logoutMutation.mutate()} className="gap-2">
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <StatsCards 
          chitFunds={chitFunds} 
          payments={payments} 
          role={user.role}
          users={users}
        />

        <div className="mt-8">
          <Tabs defaultValue="funds" className="space-y-8">
            <TabsList>
              <TabsTrigger value="funds">Chit Funds</TabsTrigger>
              {(user.role === "admin" || user.role === "agent") && (
                <TabsTrigger value="members">Members</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="funds">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Chit Funds</h2>
                {user.role === "admin" && (
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button>Create New Fund</Button>
                    </SheetTrigger>
                    <SheetContent>
                      <SheetHeader>
                        <SheetTitle>Create Chit Fund</SheetTitle>
                        <SheetDescription>
                          Set up a new chit fund with the required details
                        </SheetDescription>
                      </SheetHeader>
                      <PaymentForm type="fund" className="mt-4" />
                    </SheetContent>
                  </Sheet>
                )}
              </div>

              {isLoadingChitFunds ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <ChitFundTable 
                  chitFunds={chitFunds} 
                  userRole={user.role} 
                  userId={user.id}
                />
              )}
            </TabsContent>

            {(user.role === "admin" || user.role === "agent") && (
              <TabsContent value="members">
                <MemberManagement />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}