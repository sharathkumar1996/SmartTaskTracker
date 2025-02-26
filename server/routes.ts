import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertChitFundSchema, insertPaymentSchema, insertUserSchema, insertAccountsReceivableSchema } from "@shared/schema";
import { db } from "./db"; // Assuming db is imported from elsewhere


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
        // Create a receivable record for monthly payments
        const receivableData = {
          userId: payment.userId,
          chitFundId: payment.chitFundId,
          monthNumber: payment.monthNumber || 1, // Use payment month number or default to 1
          paidAmount: payment.amount,
          status: "paid",
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
    const members = await storage.getFundMembers(parseInt(req.params.fundId));
    res.json(members);
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

  app.post("/api/payables", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    if (req.user.role !== "admin") {
      return res.sendStatus(403);
    }

    try {
      const newPayable = await storage.createPayable({
        ...req.body,
        recordedBy: req.user.id,
      });
      res.json(newPayable);
    } catch (error) {
      console.error("Error creating payable:", error);
      res.status(500).json({ message: "Failed to create payable" });
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

  // Add a new endpoint to sync payments to accounts_receivable
  app.post("/api/sync-payments-to-receivables", async (req, res) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized" });
    }

    try {
      // Get all payments
      const allPayments = await db.select().from("payments"); // Assuming 'payments' is the table name
      console.log(`Found ${allPayments.length} payments to sync`);

      let syncedCount = 0;
      let errorCount = 0;

      // For each payment, create a corresponding accounts_receivable entry if it doesn't exist
      for (const payment of allPayments) {
        // Only sync monthly payments
        if (payment.paymentType === "monthly") {
          try {
            // Create receivable data from payment
            const receivableData = {
              userId: payment.userId,
              chitFundId: payment.chitFundId,
              monthNumber: payment.monthNumber || 1,
              paidAmount: payment.amount,
              status: "paid",
              dueDate: payment.paymentDate,
              updatedAt: new Date(),
            };

            // Validate receivable data
            const receivableParseResult = insertAccountsReceivableSchema.safeParse(receivableData);
            if (receivableParseResult.success) {
              await storage.createReceivable(receivableParseResult.data);
              syncedCount++;
            } else {
              console.error("Validation error for receivable:", receivableParseResult.error);
              errorCount++;
            }
          } catch (error) {
            console.error("Error syncing payment to receivable:", error, "Payment:", payment);
            errorCount++;
          }
        }
      }

      return res.json({
        message: `Synced ${syncedCount} payments to accounts_receivable, with ${errorCount} errors.`,
        syncedCount,
        errorCount,
      });
    } catch (error) {
      console.error("Error syncing payments to receivables:", error);
      return res.status(500).json({
        message: "Error syncing payments to receivables",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return httpServer;
}