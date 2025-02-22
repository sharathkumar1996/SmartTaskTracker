import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertChitFundSchema, insertPaymentSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

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

  app.get("/api/users", async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "agent") {
      return res.sendStatus(403);
    }
    const users = await storage.getUsers();
    res.json(users);
  });

  const httpServer = createServer(app);
  return httpServer;
}
