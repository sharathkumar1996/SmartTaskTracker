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

  // Chit Fund Management Routes
  app.post("/api/chitfunds", async (req, res) => {
    if (req.user?.role !== "admin") return res.sendStatus(403);
    const chitFund = await storage.createChitFund(req.body);
    res.json(chitFund);
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

  const httpServer = createServer(app);
  return httpServer;
}