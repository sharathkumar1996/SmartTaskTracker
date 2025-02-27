import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { 
  insertChitFundSchema, insertPaymentSchema, insertUserSchema, 
  insertAccountsReceivableSchema, insertAccountsPayableSchema, Payment,
  insertMemberGroupSchema, insertGroupMemberSchema
} from "@shared/schema";
import { db } from "./db"; // Assuming db is imported from elsewhere
import { payments } from "@shared/schema"; // Import the payments table schema

// Global map to store WebSocket connections by user ID
const userSockets = new Map<number, WebSocket>();

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);
  const httpServer = createServer(app);

  // Setup WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // Extract user ID from session
    const userId = (req as any).session?.passport?.user;

    if (userId) {
      userSockets.set(userId, ws);

      ws.on('close', () => {
        userSockets.delete(userId);
      });
    }
  });

  // Helper function to send notification to a specific user
  async function sendUserNotification(userId: number, notification: any) {
    const socket = userSockets.get(userId);
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(notification));
    }
  }

  // Member Management Routes
  app.get("/api/users", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }
    const users = await storage.getUsers();
    res.json(users);
  });

  app.get("/api/users/members", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }
    const members = await storage.getUsersByRole("member");
    res.json(members);
  });

  app.get("/api/users/agents", async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.sendStatus(403);
    }
    const agents = await storage.getUsersByRole("agent");
    res.json(agents);
  });

  app.post("/api/users", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }

    const parseResult = insertUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json(parseResult.error);
    }

    const user = await storage.createUser(parseResult.data);
    res.status(201).json(user);
  });

  app.patch("/api/users/:id", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }

    const user = await storage.updateUser(parseInt(req.params.id), req.body);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  });

  app.delete("/api/users/:id", async (req, res) => {
    if (req.user?.role !== "admin") {
      return res.sendStatus(403);
    }

    const success = await storage.deleteUser(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ message: "User not found" });
    }
    res.sendStatus(200);
  });

  // Chit Fund Management Routes
  app.post("/api/chitfunds", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    const parseResult = insertChitFundSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.error("Validation error:", parseResult.error);
      return res.status(400).json(parseResult.error);
    }

    try {
      const chitFund = await storage.createChitFund(parseResult.data);
      res.json(chitFund);
    } catch (error) {
      console.error("Error creating chit fund:", error);
      res.status(500).json({ message: "Failed to create chit fund" });
    }
  });

  app.get("/api/chitfunds", async (req, res) => {
    const chitFunds = await storage.getChitFunds();
    res.json(chitFunds);
  });

  // Add endpoint to get a single chit fund by ID
  app.get("/api/chitfunds/:id", async (req, res) => {
    try {
      const fund = await storage.getChitFund(parseInt(req.params.id));
      if (!fund) {
        return res.status(404).json({ message: "Chit fund not found" });
      }
      res.json(fund);
    } catch (error) {
      console.error("Error fetching chit fund:", error);
      res.status(500).json({ message: "Failed to fetch chit fund" });
    }
  });

  app.delete("/api/chitfunds/:id", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    const success = await storage.deleteChitFund(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ message: "Chit fund not found" });
    }
    res.sendStatus(200);
  });

  app.patch("/api/chitfunds/:id", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    try {
      const updatedFund = await storage.updateChitFund(parseInt(req.params.id), req.body);
      if (!updatedFund) {
        return res.status(404).json({ message: "Chit fund not found" });
      }
      res.json(updatedFund);
    } catch (error) {
      console.error("Error updating chit fund:", error);
      res.status(500).json({ message: "Failed to update chit fund" });
    }
  });

  app.post("/api/payments", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      // Ensure all numeric fields are properly formatted
      const paymentData = {
        ...req.body,
        amount: req.body.amount,
        userId: parseInt(req.body.userId),
        chitFundId: parseInt(req.body.chitFundId),
        recordedBy: req.user.id,
        // Convert date string to Date object if needed
        paymentDate: req.body.paymentDate instanceof Date
          ? req.body.paymentDate
          : new Date(req.body.paymentDate)
      };

      console.log("Payment data before validation:", paymentData);

      const parseResult = insertPaymentSchema.safeParse(paymentData);

      if (!parseResult.success) {
        console.error("Payment validation error:", parseResult.error);
        return res.status(400).json(parseResult.error);
      }

      console.log("Validated payment data:", parseResult.data);

      // First, create the payment record
      const payment = await storage.createPayment(parseResult.data);

      // Then, create a corresponding accounts_receivable record
      if (payment && payment.paymentType === "monthly") {
        // Get the fund details to calculate the expected amount
        const fund = await storage.getChitFund(payment.chitFundId);

        // Get member details to check if they have withdrawn
        const memberDetails = await storage.getFundMemberDetails(payment.chitFundId, payment.userId);

        // Calculate expected amount based on fund amount and withdrawal status
        // Before withdrawal: 5% of fund amount per month (1 lakh fund = 5k per month)
        // After withdrawal: 6% of fund amount per month (1 lakh fund = 6k per month)
        let expectedAmount = payment.amount; // Default to payment amount if calculation fails

        if (fund) {
          const fundAmount = parseFloat(fund.amount.toString());
          const baseRate = 0.05; // 5% of fund amount per month
          const withdrawnRate = 0.06; // 6% of fund amount per month (20% increase)

          if (memberDetails?.isWithdrawn) {
            expectedAmount = (fundAmount * withdrawnRate).toString();
          } else {
            expectedAmount = (fundAmount * baseRate).toString();
          }
        }

        // Check if a receivable already exists for this month
        const existingReceivables = await storage.getReceivablesByMonth(
          payment.chitFundId,
          payment.monthNumber || 1
        );

        const userReceivable = existingReceivables.find(r => r.userId === payment.userId);

        if (userReceivable) {
          // Update existing receivable
          const newPaidAmount = (parseFloat(userReceivable.paidAmount || "0") + parseFloat(payment.amount)).toString();

          // Update the record with the new paid amount
          await storage.updateReceivable(userReceivable.id, {
            paidAmount: newPaidAmount,
            status: parseFloat(newPaidAmount) >= parseFloat(userReceivable.expectedAmount || "0") ? "paid" : "partial",
            updatedAt: new Date()
          });

          console.log(`Updated existing receivable ID ${userReceivable.id} with new paid amount: ${newPaidAmount}`);
        } else {
          // Create a new receivable record for monthly payments
          const receivableData = {
            userId: payment.userId,
            chitFundId: payment.chitFundId,
            monthNumber: payment.monthNumber || 1, // Use payment month number or default to 1
            paidAmount: payment.amount,
            expectedAmount: expectedAmount, // Set dynamically based on fund and withdrawal status
            status: parseFloat(payment.amount) >= parseFloat(expectedAmount) ? "paid" : "partial",
            dueDate: payment.paymentDate, // Use payment date as due date
            updatedAt: new Date(),
          };

          try {
            const receivableParseResult = insertAccountsReceivableSchema.safeParse(receivableData);
            if (receivableParseResult.success) {
              await storage.createReceivable(receivableParseResult.data);
              console.log("Created corresponding receivable record for payment:", payment.id);
            } else {
              console.error("Validation error for receivable:", receivableParseResult.error);
            }
          } catch (error) {
            console.error("Error creating corresponding receivable record:", error);
            // We don't want to fail the payment if the receivable fails
            // Just log the error and continue
          }
        }
      }

      // Send real-time notification
      const notification = {
        userId: payment.userId,
        title: "Payment Received",
        message: `Payment of ₹${payment.amount} has been recorded`,
        type: "payment",
      };

      await sendUserNotification(payment.userId, notification);

      res.json(payment);
    } catch (error) {
      console.error("Payment creation error:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to create payment",
      });
    }
  });

  // Get all payments (admin/agent only)
  app.get("/api/payments", async (req, res) => {
    try {
      if (!req.isAuthenticated() || (req.user.role !== "admin" && req.user.role !== "agent")) {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const payments = await storage.getPaymentsByFund(0); // 0 means get all payments
      
      // Log payment data for debugging
      console.log("Payments data sample:", 
        payments.slice(0, 3).map(p => ({
          id: p.id,
          amount: p.amount,
          paymentMethod: p.paymentMethod,
          paymentType: p.paymentType,
          monthNumber: p.monthNumber
        }))
      );
      
      res.json(payments);
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.get("/api/payments/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const payments = await storage.getUserPayments(parseInt(req.params.userId));
    res.json(payments);
  });

  // Fund Membership Routes
  app.post("/api/chitfunds/:fundId/members/:userId", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    try {
      const success = await storage.addMemberToFund(
        parseInt(req.params.fundId),
        parseInt(req.params.userId)
      );

      res.sendStatus(200);
    } catch (error) {
      console.error("Error adding member to fund:", error);
      // Check if this is a duplicate member error
      if (error instanceof Error && error.message.includes("already in this fund")) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to add member to fund" });
    }
  });

  app.delete("/api/chitfunds/:fundId/members/:userId", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    const success = await storage.removeMemberFromFund(
      parseInt(req.params.fundId),
      parseInt(req.params.userId)
    );

    if (!success) {
      return res.status(404).json({ message: "Member not found in fund" });
    }
    res.sendStatus(200);
  });

  app.get("/api/chitfunds/:fundId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    
    // Check for query param to include group data
    const includeGroups = req.query.includeGroups === 'true';
    
    if (includeGroups) {
      // Get fund members with group information
      const membersWithGroups = await storage.getFundMembersWithGroups(parseInt(req.params.fundId));
      res.json(membersWithGroups);
    } else {
      // Get regular members list
      const members = await storage.getFundMembers(parseInt(req.params.fundId));
      res.json(members);
    }
  });
  
  // Member Group Management Routes
  app.post("/api/member-groups", async (req, res) => {
    if (!req.user || req.user.role !== "admin") return res.sendStatus(403);
    
    try {
      // Set the created_by field to current user's ID
      const groupData = {
        ...req.body,
        createdBy: req.user.id
      };
      
      const parseResult = insertMemberGroupSchema.safeParse(groupData);
      if (!parseResult.success) {
        return res.status(400).json(parseResult.error);
      }
      
      const group = await storage.createMemberGroup(parseResult.data);
      res.status(201).json(group);
    } catch (error) {
      console.error("Error creating member group:", error);
      res.status(500).json({ message: "Failed to create member group" });
    }
  });
  
  app.get("/api/member-groups", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    
    try {
      let groups;
      
      // Check if we should include members in the response
      if (req.query.includeMembers === 'true') {
        groups = await storage.getMemberGroupsWithMembers();
      } else {
        groups = await storage.getMemberGroups();
      }
      
      res.json(groups);
    } catch (error) {
      console.error("Error fetching member groups:", error);
      res.status(500).json({ message: "Failed to fetch member groups" });
    }
  });
  
  app.get("/api/member-groups/:id", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    
    try {
      const groupId = parseInt(req.params.id);
      const group = await storage.getMemberGroup(groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Member group not found" });
      }
      
      // Include members if requested
      if (req.query.includeMembers === 'true') {
        const members = await storage.getGroupMembers(groupId);
        res.json({ ...group, members });
      } else {
        res.json(group);
      }
    } catch (error) {
      console.error("Error fetching member group:", error);
      res.status(500).json({ message: "Failed to fetch member group" });
    }
  });
  
  app.post("/api/member-groups/:groupId/members", async (req, res) => {
    if (!req.user || req.user.role !== "admin") return res.sendStatus(403);
    
    try {
      const groupId = parseInt(req.params.groupId);
      
      // Make sure the group exists
      const group = await storage.getMemberGroup(groupId);
      if (!group) {
        return res.status(404).json({ message: "Member group not found" });
      }
      
      // Add groupId to the member data
      const memberData = {
        ...req.body,
        groupId
      };
      
      const parseResult = insertGroupMemberSchema.safeParse(memberData);
      if (!parseResult.success) {
        return res.status(400).json(parseResult.error);
      }
      
      const success = await storage.addUserToGroup(groupId, parseResult.data);
      
      if (success) {
        res.sendStatus(200);
      } else {
        res.status(500).json({ message: "Failed to add member to group" });
      }
    } catch (error) {
      console.error("Error adding member to group:", error);
      res.status(500).json({ message: "Failed to add member to group" });
    }
  });
  
  app.delete("/api/member-groups/:groupId/members/:userId", async (req, res) => {
    if (!req.user || req.user.role !== "admin") return res.sendStatus(403);
    
    try {
      const groupId = parseInt(req.params.groupId);
      const userId = parseInt(req.params.userId);
      
      const success = await storage.removeUserFromGroup(groupId, userId);
      
      if (success) {
        res.sendStatus(200);
      } else {
        res.status(404).json({ message: "Member not found in group" });
      }
    } catch (error) {
      console.error("Error removing member from group:", error);
      res.status(500).json({ message: "Failed to remove member from group" });
    }
  });
  
  // Add a group to a chit fund
  app.post("/api/chitfunds/:fundId/group-members/:groupId", async (req, res) => {
    if (!req.user || req.user.role !== "admin") return res.sendStatus(403);
    
    try {
      const fundId = parseInt(req.params.fundId);
      const groupId = parseInt(req.params.groupId);
      
      // Validate params
      if (isNaN(fundId) || isNaN(groupId)) {
        return res.status(400).json({ 
          message: "Invalid parameters", 
          details: "Fund ID and Group ID must be valid numbers"
        });
      }
      
      // Check if the fund exists
      const fund = await storage.getChitFund(fundId);
      if (!fund) {
        return res.status(404).json({ 
          message: "Chit Fund not found", 
          details: `No fund found with ID ${fundId}`
        });
      }
      
      // Check if the group exists
      const group = await storage.getMemberGroup(groupId);
      if (!group) {
        return res.status(404).json({ 
          message: "Member Group not found", 
          details: `No group found with ID ${groupId}` 
        });
      }
      
      // Ensure group members add up to 100%
      const groupWithMembers = await storage.getMemberGroupWithMembers(groupId);
      if (!groupWithMembers || !groupWithMembers.members || groupWithMembers.members.length === 0) {
        return res.status(400).json({ 
          message: "Invalid group", 
          details: "Group has no members" 
        });
      }
      
      // Calculate total percentage
      const totalPercentage = groupWithMembers.members.reduce(
        (sum: number, member: { sharePercentage: string }) => sum + parseFloat(member.sharePercentage), 
        0
      );
      
      if (Math.abs(totalPercentage - 100) > 0.01) {
        return res.status(400).json({ 
          message: "Invalid group percentage", 
          details: `Group members' share percentages must add up to 100% (currently: ${totalPercentage.toFixed(2)}%)` 
        });
      }
      
      // Add the group to the fund
      const success = await storage.addGroupToFund(fundId, groupId);
      
      if (success) {
        res.status(200).json({ 
          message: "Group added to fund successfully" 
        });
      } else {
        res.status(500).json({ 
          message: "Failed to add group to fund", 
          details: "An error occurred while adding the group to the fund" 
        });
      }
    } catch (error) {
      console.error("Error adding group to fund:", error);
      res.status(500).json({ 
        message: "Server error", 
        details: "An unexpected error occurred while processing your request" 
      });
    }
  });
  
  // Get members payment status (for overdue payments tracking)
  app.get("/api/fund-members/payment-status/:fundId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    
    try {
      const fundId = parseInt(req.params.fundId);
      if (isNaN(fundId)) {
        return res.status(400).json({ error: "Invalid fund ID" });
      }
      
      // Get all members for this fund
      const members = await storage.getFundMembers(fundId);
      if (!members || members.length === 0) {
        return res.json([]);
      }
      
      // Get current date info to determine current and previous month
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1; // 1-12
      const currentYear = currentDate.getFullYear();
      
      // Calculate previous month (handle January case)
      const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const previousMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      
      // Prepare result data structure
      const results = [];
      
      // For each member, check their payment status
      for (const member of members) {
        // Get all the member's payments for this fund
        const payments = await storage.getUserFundPayments(member.id, fundId);
        
        // Check if member has paid for current month
        const hasCurrentMonthPayment = payments.some(payment => {
          const paymentDate = new Date(payment.paymentDate);
          return (
            payment.paymentType === 'monthly' &&
            paymentDate.getMonth() + 1 === currentMonth &&
            paymentDate.getFullYear() === currentYear
          );
        });
        
        // Check if member has paid for previous month
        const hasPreviousMonthPayment = payments.some(payment => {
          const paymentDate = new Date(payment.paymentDate);
          return (
            payment.paymentType === 'monthly' &&
            paymentDate.getMonth() + 1 === previousMonth &&
            paymentDate.getFullYear() === previousMonthYear
          );
        });
        
        // Add to results
        results.push({
          userId: member.id,
          fullName: member.fullName,
          phone: member.phone || "Not provided",
          email: member.email || "Not provided",
          currentMonthPaid: hasCurrentMonthPayment,
          previousMonthPaid: hasPreviousMonthPayment
        });
      }
      
      res.json(results);
    } catch (error) {
      console.error("Error getting payment status:", error);
      res.status(500).json({ error: "Failed to get payment status" });
    }
  });

  // Get member details including withdrawal status
  app.get("/api/chitfunds/:fundId/members/:userId/details", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const fundId = parseInt(req.params.fundId);
      const userId = parseInt(req.params.userId);

      const memberDetails = await storage.getFundMemberDetails(fundId, userId);

      if (!memberDetails) {
        return res.status(404).json({ message: "Member not found in fund" });
      }
      
      // Check if member has any payables (payout records)
      let hasPayable = false;
      try {
        const payables = await storage.getPayablesByUser(userId);
        hasPayable = payables.some(p => 
          p.chitFundId === fundId && 
          p.paymentType === "withdrawal"
        );
      } catch (error) {
        console.error("Error checking payables:", error);
      }

      res.json({
        ...memberDetails,
        hasPayable
      });
    } catch (error) {
      console.error("Error fetching member details:", error);
      res.status(500).json({
        message: "Failed to fetch member details",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update member withdrawal status
  app.patch("/api/chitfunds/:fundId/members/:userId/withdraw", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    try {
      const fundId = parseInt(req.params.fundId);
      const userId = parseInt(req.params.userId);
      const { isWithdrawn, withdrawalMonth } = req.body;

      const result = await storage.updateMemberWithdrawalStatus(fundId, userId, {
        isWithdrawn: !!isWithdrawn,
        earlyWithdrawalMonth: withdrawalMonth || null
      });

      if (!result) {
        return res.status(404).json({ message: "Member not found in fund" });
      }

      res.json({ success: true, message: "Member withdrawal status updated" });
    } catch (error) {
      console.error("Error updating member withdrawal status:", error);
      res.status(500).json({
        message: "Failed to update withdrawal status",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/users/:userId/funds", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const funds = await storage.getMemberFunds(parseInt(req.params.userId));
    res.json(funds);
  });


  // Add new routes for accounts receivable and payable
  app.post("/api/receivables", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.role !== "agent") {
      return res.sendStatus(403);
    }

    try {
      const newReceivable = await storage.createReceivable({
        ...req.body,
        recordedBy: req.user.id,
      });
      res.json(newReceivable);
    } catch (error) {
      console.error("Error creating receivable:", error);
      res.status(500).json({ message: "Failed to create receivable" });
    }
  });

  app.get("/api/receivables/user/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.id !== parseInt(req.params.userId)) {
      return res.sendStatus(403);
    }

    try {
      const receivables = await storage.getReceivablesByUser(parseInt(req.params.userId));
      res.json(receivables);
    } catch (error) {
      console.error("Error fetching receivables:", error);
      res.status(500).json({ message: "Failed to fetch receivables" });
    }
  });

  app.get("/api/receivables/fund/:fundId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.role !== "agent") {
      return res.sendStatus(403);
    }

    try {
      const receivables = await storage.getReceivablesByFund(parseInt(req.params.fundId));
      res.json(receivables);
    } catch (error) {
      console.error("Error fetching fund receivables:", error);
      res.status(500).json({ message: "Failed to fetch fund receivables" });
    }
  });

  app.get("/api/receivables/fund/:fundId/month/:monthNumber", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.role !== "agent") {
      return res.sendStatus(403);
    }

    try {
      const receivables = await storage.getReceivablesByMonth(
        parseInt(req.params.fundId),
        parseInt(req.params.monthNumber)
      );
      res.json(receivables);
    } catch (error) {
      console.error("Error fetching month receivables:", error);
      res.status(500).json({ message: "Failed to fetch month receivables" });
    }
  });

  // Add endpoint to get receivables for a specific user and month
  app.get("/api/receivables/fund/:fundId/month/:monthNumber/user/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const fundId = parseInt(req.params.fundId);
      const monthNumber = parseInt(req.params.monthNumber);
      const userId = parseInt(req.params.userId);

      // First get all receivables for this fund and month
      const monthlyReceivables = await storage.getReceivablesByMonth(fundId, monthNumber);

      // Then filter to get only the one for this user
      const userReceivable = monthlyReceivables.find(r => r.userId === userId);

      if (!userReceivable) {
        return res.status(404).json({ message: "No receivable found for this user and month" });
      }

      res.json(userReceivable);
    } catch (error) {
      console.error("Error fetching user receivable:", error);
      res.status(500).json({
        message: "Failed to fetch user receivable",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Update the payables creation endpoint to handle withdrawals with commission
  app.post("/api/payables", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin") {
      return res.sendStatus(403);
    }

    try {
      // Extract request data
      const { userId, chitFundId, paymentType, amount, notes, paidDate, dueDate, withdrawalMonth, commission } = req.body;

      console.log("Request body for payable:", req.body);
      
      // Explicitly ensure we have a due date - critical field
      // Handle various possible input formats and ensure we always have a valid date
      let payableDueDate;
      
      try {
        if (dueDate) {
          payableDueDate = new Date(dueDate).toISOString();
        } else if (paidDate) {
          payableDueDate = new Date(paidDate).toISOString();
        } else {
          payableDueDate = new Date().toISOString();
        }
        
        // If date parsing somehow fails, use current date
        if (payableDueDate === 'Invalid Date') {
          payableDueDate = new Date().toISOString();
        }
      } catch (error) {
        console.error("Error parsing dates, using current date:", error);
        payableDueDate = new Date().toISOString();
      }
      
      console.log("Using due date:", payableDueDate);

      // Create the payable record
      const newPayable = await storage.createPayable({
        userId: parseInt(userId),
        chitFundId: parseInt(chitFundId),
        paymentType,
        amount: amount.toString(),
        recordedBy: req.user.id,
        notes: notes || null,
        paidDate: new Date(paidDate),
        dueDate: new Date(payableDueDate), // Ensure we always have a valid due date
        withdrawalMonth: withdrawalMonth ? parseInt(withdrawalMonth) : undefined,
        commission: commission ? commission.toString() : undefined, // Include commission with proper conversion
      });

      // If this is a withdrawal payment, we should also update the member's withdrawal status
      if (paymentType === "withdrawal") {
        // Update the FundMember record to mark as withdrawn
        // Note: This is now also done from the client side before making this request
        try {
          const memberDetails = await storage.getFundMemberDetails(
            parseInt(chitFundId),
            parseInt(userId)
          );

          // Only update if not already withdrawn
          if (memberDetails && !memberDetails.isWithdrawn) {
            await storage.updateMemberWithdrawalStatus(parseInt(chitFundId), parseInt(userId), {
              isWithdrawn: true,
              earlyWithdrawalMonth: req.body.withdrawalMonth || null
            });
          }
        } catch (memberError) {
          console.error("Error updating member withdrawal status:", memberError);
          // We don't want to fail the payout if this fails
        }
      }

      // Send notification to the member
      const notification = {
        userId: parseInt(userId),
        title: paymentType === "withdrawal" ? "Chit Fund Withdrawal" : "Payment Made",
        message: paymentType === "withdrawal"
          ? `You have withdrawn ₹${amount} from chit fund #${chitFundId}`
          : `A payment of ₹${amount} has been made to you`,
        type: "payment",
      };

      await sendUserNotification(parseInt(userId), notification);

      res.json(newPayable);
    } catch (error) {
      console.error("Error creating payable:", error);
      res.status(500).json({
        message: "Failed to create payable",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/payables/user/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.id !== parseInt(req.params.userId)) {
      return res.sendStatus(403);
    }

    try {
      const payables = await storage.getPayablesByUser(parseInt(req.params.userId));
      res.json(payables);
    } catch (error) {
      console.error("Error fetching payables:", error);
      res.status(500).json({ message: "Failed to fetch payables" });
    }
  });

  app.get("/api/payables/fund/:fundId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.role !== "agent") {
      return res.sendStatus(403);
    }

    try {
      const payables = await storage.getPayablesByFund(parseInt(req.params.fundId));
      res.json(payables);
    } catch (error) {
      console.error("Error fetching fund payables:", error);
      res.status(500).json({ message: "Failed to fetch fund payables" });
    }
  });

  app.get("/api/payables/fund/:fundId/type/:type", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin" && req.user.role !== "agent") {
      return res.sendStatus(403);
    }

    try {
      const payables = await storage.getPayablesByType(
        parseInt(req.params.fundId),
        req.params.type
      );
      res.json(payables);
    } catch (error) {
      console.error("Error fetching typed payables:", error);
      res.status(500).json({ message: "Failed to fetch typed payables" });
    }
  });

  // Add API endpoints for accounts data
  app.get("/api/accounts/receivables", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const receivables = await storage.getAllReceivables();
      res.json(receivables);
    } catch (error) {
      console.error("Error fetching receivables:", error);
      res.status(500).json({ message: "Failed to fetch receivables" });
    }
  });

  app.get("/api/accounts/payables", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const payables = await storage.getAllPayables();
      res.json(payables);
    } catch (error) {
      console.error("Error fetching payables:", error);
      res.status(500).json({ message: "Failed to fetch payables" });
    }
  });

  // Add a new endpoint to sync payments to accounts_receivable and accounts_payable
  app.post("/api/sync-payments-to-receivables", async (req, res) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    try {
      // Get all payments
      const allPayments = await db.query.payments.findMany();
      console.log(`Found ${allPayments.length} payments to sync`);

      // Get existing payables to prevent duplicates
      const existingPayables = await storage.getAllPayables();
      
      // Create a map of existing withdrawal payables keyed by user + fund + date to check for duplicates
      const existingWithdrawalMap = new Map();
      
      // Track processed payment IDs to avoid duplicates
      const processedPaymentIds = new Set();
      
      for (const payable of existingPayables) {
        if (payable.paymentType === 'withdrawal') {
          // Create a unique key combining userId, chitFundId, and amount
          const key = `${payable.userId}_${payable.chitFundId}_${payable.amount}`;
          existingWithdrawalMap.set(key, payable);
        }
      }

      let syncedReceivablesCount = 0;
      let syncedPayablesCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // For each payment, create a corresponding account entry if it doesn't exist
      for (const payment of allPayments) {
        // Process monthly payments to receivables
        if (payment.paymentType === "monthly") {
          try {
            // Get the fund details to calculate the expected amount
            const fund = await storage.getChitFund(payment.chitFundId);

            // Get member details to check if they have withdrawn
            const memberDetails = await storage.getFundMemberDetails(payment.chitFundId, payment.userId);

            // Calculate expected amount based on fund amount and withdrawal status
            let expectedAmount = payment.amount.toString(); // Default

            if (fund) {
              const fundAmount = parseFloat(fund.amount.toString());
              const baseRate = 0.05; // 5% of fund amount per month
              const withdrawnRate = 0.06; // 6% of fund amount per month (20% increase)

              if (memberDetails?.isWithdrawn) {
                expectedAmount = (fundAmount * withdrawnRate).toString();
              } else {
                expectedAmount = (fundAmount * baseRate).toString();
              }
            }

            // Create receivable data from payment
            const receivableData = {
              userId: payment.userId,
              chitFundId: payment.chitFundId,
              monthNumber: payment.monthNumber || 1,
              paidAmount: payment.amount.toString(),
              expectedAmount: expectedAmount, // Dynamically calculated
              status: parseFloat(payment.amount.toString()) >= parseFloat(expectedAmount) ? "paid" : "partial",
              dueDate: payment.paymentDate,
              updatedAt: new Date(),
            };

            console.log("Creating receivable with data:", receivableData);

            // Validate receivable data
            const receivableParseResult = insertAccountsReceivableSchema.safeParse(receivableData);
            if (receivableParseResult.success) {
              await storage.createReceivable(receivableParseResult.data);
              syncedReceivablesCount++;
              console.log(`Synced payment ID ${payment.id} to receivables.`);
            } else {
              console.error("Validation error for receivable:", receivableParseResult.error);
              errorCount++;
            }
          } catch (error) {
            console.error("Error syncing payment to receivable:", error, "Payment:", payment);
            errorCount++;
          }
        }
        // Process withdrawal payments to payables - with duplicate prevention
        else if (payment.paymentType === "withdrawal") {
          try {
            // Create a unique key for this payment
            const paymentKey = `${payment.userId}_${payment.chitFundId}_${payment.amount}`;
            
            // Check if we've already processed this payment in this sync
            if (processedPaymentIds.has(payment.id)) {
              console.log(`Skipping already processed payment ID ${payment.id}`);
              skippedCount++;
              continue;
            }
            
            // Check if a similar withdrawal already exists
            if (existingWithdrawalMap.has(paymentKey)) {
              console.log(`Skipping withdrawal payment ID ${payment.id} as it appears to be a duplicate`);
              skippedCount++;
              continue;
            }
            
            // Process this payment and track it
            processedPaymentIds.add(payment.id);
            
            // Create payable data from payment
            const payableData = {
              userId: payment.userId,
              chitFundId: payment.chitFundId,
              paymentType: "withdrawal",
              amount: payment.amount.toString(),
              paidDate: payment.paymentDate,
              dueDate: payment.paymentDate, // Set due date to payment date
              recordedBy: payment.recordedBy || req.user.id, // Default to current user if not set
              notes: payment.notes || `Withdrawal payment for month ${payment.monthNumber || 1}`,
              withdrawalMonth: payment.monthNumber,
            };

            console.log("Creating payable with data:", payableData);

            // Validate payable data
            const payableParseResult = insertAccountsPayableSchema.safeParse(payableData);
            if (payableParseResult.success) {
              await storage.createPayable(payableParseResult.data);
              syncedPayablesCount++;
              
              // Add this to our tracking map to prevent duplicates within the same sync operation
              existingWithdrawalMap.set(paymentKey, true);
              
              console.log(`Synced withdrawal payment ID ${payment.id} to payables.`);
            } else {
              console.error("Validation error for payable:", payableParseResult.error);
              errorCount++;
            }
          } catch (error) {
            console.error("Error syncing withdrawal payment to payable:", error, "Payment:", payment);
            errorCount++;
          }
        }
      }

      return res.json({
        message: `Synced ${syncedReceivablesCount} payments to accounts_receivable, ${syncedPayablesCount} payments to accounts_payable, skipped ${skippedCount} duplicates, with ${errorCount} errors.`,
        syncedReceivablesCount,
        syncedPayablesCount,
        skippedCount,
        errorCount,
      });
    } catch (error) {
      console.error("Error syncing payments to accounts:", error);
      return res.status(500).json({
        message: "Error syncing payments to accounts",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/payments/user/:userId/fund/:fundId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const userId = parseInt(req.params.userId);
      const fundId = parseInt(req.params.fundId);

      const payments = await storage.getUserFundPayments(userId, fundId);
      res.json(payments);
    } catch (error) {
      console.error("Error fetching user's fund payments:", error);
      res.status(500).json({ message: "Failed to fetch user's fund payments" });
    }
  });

  // Add endpoint for the payment tracking sheet - this was missing
  app.get("/api/chitfunds/:id/payments", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    
    try {
      const fundId = parseInt(req.params.id);
      
      // 1. Get all members of the fund (both current and withdrawn)
      const members = await storage.getFundMembers(fundId);
      
      // 2. Get all payments for this fund to find withdrawn members too
      const allFundPayments = await storage.getPaymentsByFund(fundId);
      
      // 3. Create a set of all user IDs who have ever made payments to this fund
      const allPaymentUserIds = new Set(allFundPayments.map((payment: Payment) => payment.userId));
      
      // 4. Get any members who have made withdrawals but may no longer be in the fund
      const payables = await storage.getPayablesByFund(fundId);
      const withdrawalUserIds = new Set(
        payables
          .filter(p => p.paymentType === 'withdrawal')
          .map(p => p.userId)
      );
      
      // 5. Combine all unique user IDs
      const allUserIds = new Set([
        ...Array.from(allPaymentUserIds),
        ...Array.from(withdrawalUserIds)
      ]);
      
      // 6. Get details for all users who aren't current members
      const currentMemberIds = new Set(members.map(m => m.id));
      const additionalMemberIds = Array.from(allUserIds).filter((id: number) => !currentMemberIds.has(id));
      
      let additionalMembers: any[] = [];
      if (additionalMemberIds.length > 0) {
        // Get details for each additional member
        additionalMembers = await Promise.all(
          additionalMemberIds.map(async (userId) => {
            try {
              const user = await storage.getUser(userId);
              return user ? {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                username: user.username,
                role: user.role,
                status: user.status,
              } : null;
            } catch (error) {
              console.error(`Error fetching user ${userId}:`, error);
              return null;
            }
          })
        ).then(results => results.filter(Boolean));
      }
      
      // 7. Combine current and past members
      const allMembers = [...members, ...additionalMembers];
      
      // 8. For each member, get their payments for this fund
      const membersWithPayments = await Promise.all(
        allMembers.map(async (member) => {
          if (!member) return null;
          
          const userPayments = await storage.getUserFundPayments(member.id, fundId);
          
          // Check if there are withdrawal payables
          const userWithdrawals = payables.filter(
            p => p.userId === member.id && p.paymentType === 'withdrawal'
          );
          
          // Add withdrawal payments to the regular payments with improved month extraction
          const withdrawalPayments = userWithdrawals.map(withdrawal => {
            // Try to extract the month from the notes or use the withdrawalMonth field
            let monthNum = 1; // Default to month 1
            
            // First, check if withdrawal has a withdrawalMonth field
            // Using optional chaining and type checking to avoid errors
            if (typeof (withdrawal as any).withdrawalMonth !== 'undefined') {
              const withdrawalMonthValue = (withdrawal as any).withdrawalMonth;
              monthNum = parseInt(withdrawalMonthValue.toString());
            }
            // Next, try to extract from notes using regex
            else if (withdrawal.notes && withdrawal.notes.match(/month (\d+)/i)) {
              monthNum = parseInt(withdrawal.notes.match(/month (\d+)/i)?.[1] || '1');
            }
            
            return {
              id: -withdrawal.id, // Negative ID to avoid conflicts
              userId: withdrawal.userId,
              chitFundId: withdrawal.chitFundId,
              amount: withdrawal.amount,
              paymentType: 'withdrawal',
              paymentMethod: 'bank',
              recordedBy: withdrawal.recorderId,
              notes: withdrawal.notes || 'Withdrawal payment',
              paymentDate: withdrawal.paidDate,
              monthNumber: monthNum,
              createdAt: withdrawal.createdAt
            };
          });
          
          const allUserPayments = [...userPayments, ...withdrawalPayments];
          
          // Format payments as needed by the client with additional info
          return {
            id: member.id,
            fullName: member.fullName,
            payments: allUserPayments.map(payment => ({
              month: payment.monthNumber || 1, // Fallback to month 1 if not specified
              amount: (typeof payment.amount === 'string' 
                ? payment.amount 
                : (payment.amount ? String(payment.amount) : '0')),
              paymentDate: payment.paymentDate,
              // Add these fields to help the client identify payment types
              paymentType: payment.paymentType || 'monthly',
              notes: payment.notes || '',
              isWithdrawal: payment.paymentType === 'withdrawal'
            }))
          };
        })
      ).then(results => results.filter(Boolean));
      
      res.json({ members: membersWithPayments });
    } catch (error) {
      console.error("Error fetching fund payments for tracking sheet:", error);
      res.status(500).json({ 
        message: "Failed to fetch fund payments",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return httpServer;
}