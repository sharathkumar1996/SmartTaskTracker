import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertChitFundSchema, insertPaymentSchema, insertUserSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Member Management Routes
  app.get("/api/users", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }
    const users = await storage.getUsers();
    res.json(users);
  });

  // Add new routes for getting members and agents
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

  // Add delete endpoint for chit funds
  app.delete("/api/chitfunds/:id", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);

    const success = await storage.deleteChitFund(parseInt(req.params.id));
    if (!success) {
      return res.status(404).json({ message: "Chit fund not found" });
    }
    res.sendStatus(200);
  });

  // Add patch endpoint for chit funds
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
    const payment = await storage.createPayment({
      ...req.body,
      userId: req.user.id,
    });
    res.json(payment);
  });

  app.get("/api/payments/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const payments = await storage.getUserPayments(parseInt(req.params.userId));
    res.json(payments);
  });

  // Add new route for getting fund payments
  app.get("/api/chitfunds/:fundId/payments", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }

    try {
      const fundPayments = await storage.getFundPayments(parseInt(req.params.fundId));
      res.json(fundPayments);
    } catch (error) {
      console.error("Error fetching fund payments:", error);
      res.status(500).json({ message: "Failed to fetch fund payments" });
    }
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

  const httpServer = createServer(app);
  return httpServer;
}