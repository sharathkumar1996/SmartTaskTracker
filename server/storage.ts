import { users, chitFunds, payments, fundMembers, type User, type ChitFund, type Payment, type InsertUser, type InsertChitFund, type InsertPayment } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const MemoryStore = createMemoryStore(session);

export interface IStorage {
  users: any;
  chitFunds: any;
  payments: any;
  sessionStore: session.Store;

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
  addMemberToFund(fundId: number, userId: number): Promise<boolean>;
  removeMemberFromFund(fundId: number, userId: number): Promise<boolean>;
  getFundMembers(fundId: number): Promise<Omit<User, "password">[]>;
  getMemberFunds(userId: number): Promise<ChitFund[]>;
  getUsersByRole(role: string): Promise<Omit<User, "password">[]>;
  updateChitFund(id: number, updates: Partial<ChitFund>): Promise<ChitFund | undefined>;
}

export class DatabaseStorage implements IStorage {
  users: any;
  chitFunds: any;
  payments: any;
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 }); // 24 hours
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createChitFund(fund: InsertChitFund): Promise<ChitFund> {
    // Convert string dates to Date objects for PostgreSQL
    const fundData = {
      ...fund,
      startDate: new Date(fund.startDate),
      endDate: new Date(fund.endDate)
    };

    const [chitFund] = await db.insert(chitFunds).values(fundData).returning();
    return chitFund;
  }

  async getChitFunds(): Promise<ChitFund[]> {
    return await db.select().from(chitFunds);
  }

  async deleteChitFund(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(chitFunds)
      .where(eq(chitFunds.id, id))
      .returning();
    return !!deleted;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId));
  }

  async addMemberToFund(fundId: number, userId: number): Promise<boolean> {
    try {
      await db.insert(fundMembers).values({ fundId, userId });
      return true;
    } catch (error) {
      console.error('Error adding member to fund:', error);
      return false;
    }
  }

  async removeMemberFromFund(fundId: number, userId: number): Promise<boolean> {
    const [deleted] = await db
      .delete(fundMembers)
      .where(
        and(
          eq(fundMembers.fundId, fundId),
          eq(fundMembers.userId, userId)
        )
      )
      .returning();
    return !!deleted;
  }

  async getFundMembers(fundId: number): Promise<Omit<User, "password">[]> {
    const result = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        address: users.address,
        city: users.city,
        state: users.state,
        pincode: users.pincode,
        status: users.status,
        fundPreferences: users.fundPreferences,
        agentId: users.agentId,
        agentCommission: users.agentCommission
      })
      .from(fundMembers)
      .innerJoin(users, eq(fundMembers.userId, users.id))
      .where(eq(fundMembers.fundId, fundId));

    return result;
  }

  async getMemberFunds(userId: number): Promise<ChitFund[]> {
    const result = await db
      .select({
        id: chitFunds.id,
        name: chitFunds.name,
        amount: chitFunds.amount,
        duration: chitFunds.duration,
        memberCount: chitFunds.memberCount,
        startDate: chitFunds.startDate,
        endDate: chitFunds.endDate,
        status: chitFunds.status
      })
      .from(fundMembers)
      .innerJoin(chitFunds, eq(fundMembers.fundId, chitFunds.id))
      .where(eq(fundMembers.userId, userId));

    return result;
  }

  async getUsersByRole(role: string): Promise<Omit<User, "password">[]> {
    return await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        address: users.address,
        city: users.city,
        state: users.state,
        pincode: users.pincode,
        status: users.status,
        fundPreferences: users.fundPreferences,
        agentId: users.agentId,
        agentCommission: users.agentCommission
      })
      .from(users)
      .where(eq(users.role, role as any));
  }
  async updateChitFund(id: number, updates: Partial<ChitFund>): Promise<ChitFund | undefined> {
    const [updatedFund] = await db
      .update(chitFunds)
      .set(updates)
      .where(eq(chitFunds.id, id))
      .returning();
    return updatedFund;
  }
}

export const storage = new DatabaseStorage();

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}