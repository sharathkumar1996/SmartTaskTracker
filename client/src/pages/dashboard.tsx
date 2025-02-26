import { useAuth } from "@/hooks/use-auth";
import { Loader2, LogOut } from "lucide-react";
import { ChitFundTable } from "@/components/chitfund-table";
import { ChitFundForm } from "@/components/chitfund-form";
import { StatsCards } from "@/components/stats-cards";
import { MemberManagement } from "@/components/member-management";
import { AccountsManagement } from "@/components/accounts-management";
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

  // Fetch all users if admin/agent
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "admin" || user?.role === "agent",
  });

  // Fetch all chit funds
  const { data: allChitFunds = [], isLoading: isLoadingChitFunds } = useQuery<ChitFund[]>({
    queryKey: ["/api/chitfunds"],
  });

  const activeChitFunds = allChitFunds.filter(fund => fund.status === "active");
  const closedChitFunds = allChitFunds.filter(fund => fund.status === "closed" || fund.status === "completed");

  // Fetch all payments based on user role
  const { data: payments = [], isLoading: isLoadingPayments } = useQuery<Payment[]>({
    queryKey: ["/api/payments", user?.id],
    queryFn: async () => {
      if (!user) return [];
      // For admin/agent, fetch all payments
      if (user.role === "admin" || user.role === "agent") {
        const res = await fetch("/api/payments");
        if (!res.ok) throw new Error("Failed to fetch payments");
        return res.json();
      }
      // For members, fetch only their payments
      const res = await fetch(`/api/payments/${user.id}`);
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
    enabled: !!user,
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
          chitFunds={activeChitFunds}
          payments={payments}
          role={user.role}
          users={users}
        />

        <div className="mt-8">
          <Tabs defaultValue="active" className="space-y-8">
            <TabsList>
              <TabsTrigger value="active">Active Funds</TabsTrigger>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
              {user.role === "admin" && (
                <>
                  <TabsTrigger value="closed">Closed Funds</TabsTrigger>
                  <TabsTrigger value="users">Users</TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="active">
              <div className="space-y-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Active Chit Funds</h2>
                  {user.role === "admin" && (
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button>Create New Fund</Button>
                      </SheetTrigger>
                      <SheetContent side="right" className="sm:max-w-xl">
                        <SheetHeader>
                          <SheetTitle>Create Chit Fund</SheetTitle>
                          <SheetDescription>
                            Set up a new chit fund with the required details
                          </SheetDescription>
                        </SheetHeader>
                        <div className="mt-4">
                          <ChitFundForm />
                        </div>
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
                    chitFunds={activeChitFunds}
                    userRole={user.role}
                    userId={user.id}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="accounts">
              <AccountsManagement />
            </TabsContent>

            {user.role === "admin" && (
              <>
                <TabsContent value="closed">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Closed Chit Funds</h2>
                  </div>
                  {isLoadingChitFunds ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <ChitFundTable
                      chitFunds={closedChitFunds}
                      userRole={user.role}
                      userId={user.id}
                    />
                  )}
                </TabsContent>

                <TabsContent value="users">
                  <MemberManagement />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </main>
    </div>
  );
}