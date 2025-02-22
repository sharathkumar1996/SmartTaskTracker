import { IStorage } from "./storage";
import createMemoryStore from "memorystore";
import session from "express-session";
import { User, ChitFund, Payment, InsertUser, InsertChitFund, InsertPayment } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chitFunds: Map<number, ChitFund>;
  private payments: Map<number, Payment>;
  sessionStore: session.Store;
  currentId: { [key: string]: number };

  constructor() {
    this.users = new Map();
    this.chitFunds = new Map();
    this.payments = new Map();
    this.currentId = { users: 1, chitFunds: 1, payments: 1 };
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId.users++;
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createChitFund(fund: InsertChitFund): Promise<ChitFund> {
    const id = this.currentId.chitFunds++;
    const chitFund = { ...fund, id };
    this.chitFunds.set(id, chitFund);
    return chitFund;
  }

  async getChitFunds(): Promise<ChitFund[]> {
    return Array.from(this.chitFunds.values());
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const id = this.currentId.payments++;
    const newPayment = { ...payment, id };
    this.payments.set(id, newPayment);
    return newPayment;
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return Array.from(this.payments.values()).filter(
      (payment) => payment.userId === userId,
    );
  }
}

export const storage = new MemStorage();
