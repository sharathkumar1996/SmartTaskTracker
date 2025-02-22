import type { User, ChitFund, Payment, InsertUser, InsertChitFund, InsertPayment } from "@shared/schema";
import createMemoryStore from "memorystore";
import session from "express-session";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  users: Map<number, User>;
  chitFunds: Map<number, ChitFund>;
  payments: Map<number, Payment>;
  sessionStore: session.Store;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createChitFund(fund: InsertChitFund): Promise<ChitFund>;
  getChitFunds(): Promise<ChitFund[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getUserPayments(userId: number): Promise<Payment[]>;
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export class MemStorage implements IStorage {
  users: Map<number, User>;
  chitFunds: Map<number, ChitFund>;
  payments: Map<number, Payment>;
  private currentId: { [key: string]: number };
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.chitFunds = new Map();
    this.payments = new Map();
    this.currentId = { users: 1, chitFunds: 1, payments: 1 };
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 });

    // Seed admin user
    this.seedAdminUser();
  }

  private async seedAdminUser() {
    const existingAdmin = Array.from(this.users.values()).find(
      (user) => user.role === "admin"
    );

    if (!existingAdmin) {
      const adminUser: InsertUser = {
        username: "admin",
        password: await hashPassword("admin123"),
        role: "admin",
        fullName: "System Admin",
        email: "admin@chitfund.com",
        phone: "1234567890",
        address: "",
        city: "",
        state: "",
        pincode: "123456",
        fundPreferences: null,
        status: "active",
      };
      await this.createUser(adminUser);
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId.users++;
    const user: User = { 
      ...insertUser, 
      id,
      address: insertUser.address || "",
      city: insertUser.city || "",
      state: insertUser.state || "",
      pincode: insertUser.pincode || "",
      status: insertUser.status || "active",
      fundPreferences: insertUser.fundPreferences || null
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) return undefined;

    const updatedUser = { ...existingUser, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
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