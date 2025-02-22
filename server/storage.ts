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

  // Existing methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createChitFund(fund: InsertChitFund): Promise<ChitFund>;
  getChitFunds(): Promise<ChitFund[]>;
  deleteChitFund(id: number): Promise<boolean>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  getUserPayments(userId: number): Promise<Payment[]>;

  // New methods for fund membership
  addMemberToFund(fundId: number, userId: number): Promise<boolean>;
  removeMemberFromFund(fundId: number, userId: number): Promise<boolean>;
  getFundMembers(fundId: number): Promise<User[]>;
  getMemberFunds(userId: number): Promise<ChitFund[]>;
  getUsersByRole(role: string): Promise<User[]>;
}

export class MemStorage implements IStorage {
  users: Map<number, User>;
  chitFunds: Map<number, ChitFund>;
  payments: Map<number, Payment>;
  private currentId: { [key: string]: number };
  sessionStore: session.Store;
  private fundMembers: Map<number, Set<number>>; // fundId -> Set of userIds

  constructor() {
    this.users = new Map();
    this.chitFunds = new Map();
    this.payments = new Map();
    this.fundMembers = new Map();
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
      id,
      username: insertUser.username,
      password: insertUser.password,
      role: insertUser.role,
      fullName: insertUser.fullName,
      email: insertUser.email,
      phone: insertUser.phone,
      address: insertUser.address || null,
      city: insertUser.city || null,
      state: insertUser.state || null,
      pincode: insertUser.pincode || null,
      status: insertUser.status || "active",
      fundPreferences: insertUser.fundPreferences || null,
      agentId: null,
      agentCommission: null
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

  async deleteChitFund(id: number): Promise<boolean> {
    return this.chitFunds.delete(id);
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

  async addMemberToFund(fundId: number, userId: number): Promise<boolean> {
    const fund = this.chitFunds.get(fundId);
    const user = this.users.get(userId);

    if (!fund || !user) return false;

    if (!this.fundMembers.has(fundId)) {
      this.fundMembers.set(fundId, new Set());
    }

    const members = this.fundMembers.get(fundId)!;
    if (members.size >= fund.memberCount) return false;

    members.add(userId);
    return true;
  }

  async removeMemberFromFund(fundId: number, userId: number): Promise<boolean> {
    const members = this.fundMembers.get(fundId);
    if (!members) return false;
    return members.delete(userId);
  }

  async getFundMembers(fundId: number): Promise<User[]> {
    const members = this.fundMembers.get(fundId);
    if (!members) return [];
    return Array.from(members).map(id => this.users.get(id)!).filter(Boolean);
  }

  async getMemberFunds(userId: number): Promise<ChitFund[]> {
    const userFunds: ChitFund[] = [];
    this.fundMembers.forEach((members, fundId) => {
      if (members.has(userId)) {
        const fund = this.chitFunds.get(fundId);
        if (fund) userFunds.push(fund);
      }
    });
    return userFunds;
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.role === role);
  }
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export const storage = new MemStorage();