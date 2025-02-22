import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

type User = {
  id: number;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};

export function UserManagement() {
  const membersQuery = useQuery<User[]>({
    queryKey: ["/api/users/members"],
  });

  const agentsQuery = useQuery<User[]>({
    queryKey: ["/api/users/agents"],
  });

  const renderUserTable = (users: User[] | undefined, isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (!users?.length) {
      return <div className="text-center py-8 text-muted-foreground">No users found</div>;
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Full Name</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>{user.fullName}</TableCell>
              <TableCell>{user.username}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.phone}</TableCell>
              <TableCell>{user.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Management</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="members" className="space-y-4">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            {renderUserTable(membersQuery.data, membersQuery.isLoading)}
          </TabsContent>
          <TabsContent value="agents">
            {renderUserTable(agentsQuery.data, agentsQuery.isLoading)}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
