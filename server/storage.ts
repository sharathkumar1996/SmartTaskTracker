import { users, chitFunds, payments, fundMembers, notifications, accountsReceivable, accountsPayable, type User, type ChitFund, type Payment, type InsertUser, type InsertChitFund, type InsertPayment, type Notification, type InsertNotification, type AccountsReceivable, type InsertAccountsReceivable, type AccountsPayable, type InsertAccountsPayable, type FundMember } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";
import Decimal from 'decimal.js';

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  sessionStore: session.Store;

  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  getUserCount(): Promise<number>;
  getUsersByRole(role: string): Promise<Omit<User, "password">[]>;
  deleteUser(id: number): Promise<boolean>;

  createChitFund(fund: InsertChitFund): Promise<ChitFund>;
  getChitFund(id: number): Promise<ChitFund | undefined>; 
  getChitFunds(): Promise<ChitFund[]>;
  updateChitFund(id: number, updates: Partial<ChitFund>): Promise<ChitFund | undefined>;
  deleteChitFund(id: number): Promise<boolean>;

  createPayment(payment: InsertPayment): Promise<Payment>;
  getUserPayments(userId: number): Promise<Payment[]>;

  addMemberToFund(fundId: number, userId: number): Promise<boolean>;
  removeMemberFromFund(fundId: number, userId: number): Promise<boolean>;
  getFundMembers(fundId: number): Promise<Omit<User, "password">[]>;
  getFundMemberDetails(fundId: number, userId: number): Promise<FundMember | undefined>; 
  updateMemberWithdrawalStatus(fundId: number, userId: number, updates: Partial<FundMember>): Promise<boolean>; 
  getMemberFunds(userId: number): Promise<ChitFund[]>;

  // Accounts Receivable methods
  createReceivable(receivable: InsertAccountsReceivable): Promise<AccountsReceivable>;
  updateReceivable(id: number, updates: Partial<AccountsReceivable>): Promise<boolean>; 
  getReceivablesByUser(userId: number): Promise<AccountsReceivable[]>;
  getReceivablesByFund(fundId: number): Promise<AccountsReceivable[]>;
  getReceivablesByMonth(fundId: number, monthNumber: number): Promise<AccountsReceivable[]>;
  getAllReceivables(): Promise<AccountsReceivable[]>;

  // Accounts Payable methods
  createPayable(payable: InsertAccountsPayable): Promise<AccountsPayable>;
  getPayablesByUser(userId: number): Promise<AccountsPayable[]>;
  getPayablesByFund(fundId: number): Promise<AccountsPayable[]>;
  getPayablesByType(fundId: number, type: string): Promise<AccountsPayable[]>;
  getAllPayables(): Promise<AccountsPayable[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({ checkPeriod: 86400000 }); 
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

  async createUser(user: InsertUser): Promise<User> {
    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
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
    return db.select().from(users);
  }

  async getUserCount(): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result?.count || 0;
  }

  async getUsersByRole(role: string): Promise<Omit<User, "password">[]> {
    return db
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
        agentCommission: users.agentCommission,
      })
      .from(users)
      .where(eq(users.role, role));
  }

  async deleteUser(id: number): Promise<boolean> {
    const [deleted] = await db.delete(users).where(eq(users.id, id)).returning();
    return !!deleted;
  }

  async createChitFund(fund: InsertChitFund): Promise<ChitFund> {
    const [chitFund] = await db
      .insert(chitFunds)
      .values({
        name: fund.name,
        amount: fund.amount,
        duration: fund.duration,
        memberCount: fund.memberCount,
        monthlyContribution: fund.monthlyContribution || "5000",
        monthlyBonus: fund.monthlyBonus || "1000",
        baseCommission: fund.baseCommission || "5000",
        startDate: new Date(fund.startDate),
        endDate: new Date(fund.endDate),
        status: fund.status
      })
      .returning();
    return chitFund;
  }

  async getChitFund(id: number): Promise<ChitFund | undefined> {
    const [fund] = await db.select().from(chitFunds).where(eq(chitFunds.id, id));
    return fund;
  }

  async getChitFunds(): Promise<ChitFund[]> {
    return db.select().from(chitFunds);
  }

  async updateChitFund(id: number, updates: Partial<ChitFund>): Promise<ChitFund | undefined> {
    const [updated] = await db
      .update(chitFunds)
      .set(updates)
      .where(eq(chitFunds.id, id))
      .returning();
    return updated;
  }

  async deleteChitFund(id: number): Promise<boolean> {
    const [deleted] = await db.delete(chitFunds).where(eq(chitFunds.id, id)).returning();
    return !!deleted;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    try {
      const paymentData = {
        userId: payment.userId,
        chitFundId: payment.chitFundId,
        amount: payment.amount,
        paymentType: payment.paymentType,
        paymentMethod: payment.paymentMethod,
        recordedBy: payment.recordedBy,
        notes: payment.notes,
        paymentDate: payment.paymentDate,
        monthNumber: payment.monthNumber || 1,
      };

      console.log("Creating payment with data:", paymentData);

      const [newPayment] = await db
        .insert(payments)
        .values(paymentData)
        .returning();

      return newPayment;
    } catch (error) {
      console.error("Error in createPayment:", error);
      throw error;
    }
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    if (!userId || isNaN(userId)) {
      throw new Error("Invalid user ID");
    }
    return db.select().from(payments).where(eq(payments.userId, userId));
  }

  async addMemberToFund(fundId: number, userId: number): Promise<boolean> {
    const [result] = await db
      .insert(fundMembers)
      .values({
        fundId,
        userId,
        totalBonusReceived: "0",
        totalCommissionPaid: "0",
        isWithdrawn: false,
      })
      .returning();
    return !!result;
  }

  async removeMemberFromFund(fundId: number, userId: number): Promise<boolean> {
    const [deleted] = await db
      .delete(fundMembers)
      .where(and(eq(fundMembers.fundId, fundId), eq(fundMembers.userId, userId)))
      .returning();
    return !!deleted;
  }

  async getFundMembers(fundId: number): Promise<Omit<User, "password">[]> {
    return db
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
        agentCommission: users.agentCommission,
      })
      .from(fundMembers)
      .innerJoin(users, eq(fundMembers.userId, users.id))
      .where(eq(fundMembers.fundId, fundId));
  }

  async getFundMemberDetails(fundId: number, userId: number): Promise<FundMember | undefined> {
    const [member] = await db
      .select()
      .from(fundMembers)
      .where(
        and(
          eq(fundMembers.fundId, fundId),
          eq(fundMembers.userId, userId)
        )
      );
    return member;
  }

  async updateMemberWithdrawalStatus(fundId: number, userId: number, updates: Partial<FundMember>): Promise<boolean> {
    const [updated] = await db
      .update(fundMembers)
      .set(updates)
      .where(
        and(
          eq(fundMembers.fundId, fundId),
          eq(fundMembers.userId, userId)
        )
      )
      .returning();
    return !!updated;
  }

  async getMemberFunds(userId: number): Promise<ChitFund[]> {
    const results = await db
      .select({
        id: chitFunds.id,
        name: chitFunds.name,
        amount: chitFunds.amount,
        duration: chitFunds.duration,
        memberCount: chitFunds.memberCount,
        monthlyContribution: chitFunds.monthlyContribution,
        monthlyBonus: chitFunds.monthlyBonus,
        startDate: chitFunds.startDate,
        endDate: chitFunds.endDate,
        baseCommission: chitFunds.baseCommission,
        status: chitFunds.status
      })
      .from(chitFunds)
      .innerJoin(fundMembers, eq(fundMembers.fundId, chitFunds.id))
      .where(eq(fundMembers.userId, userId));

    return results;
  }

  async createReceivable(receivable: InsertAccountsReceivable): Promise<AccountsReceivable> {
    const receivableData = {
      userId: receivable.userId,
      chitFundId: receivable.chitFundId,
      monthNumber: receivable.monthNumber,
      paidAmount: receivable.paidAmount,
      expectedAmount: receivable.expectedAmount,
      status: receivable.status || "paid",
      dueDate: receivable.dueDate,
      updatedAt: receivable.updatedAt || new Date(),
    };

    console.log("Creating receivable with data:", receivableData);

    const [newReceivable] = await db
      .insert(accountsReceivable)
      .values(receivableData)
      .returning();

    return newReceivable;
  }

  async updateReceivable(id: number, updates: Partial<AccountsReceivable>): Promise<boolean> {
    try {
      const [updated] = await db
        .update(accountsReceivable)
        .set({
          ...updates,
          updatedAt: new Date(), 
        })
        .where(eq(accountsReceivable.id, id))
        .returning();

      return !!updated;
    } catch (error) {
      console.error("Error updating receivable:", error);
      return false;
    }
  }

  async getReceivablesByUser(userId: number): Promise<AccountsReceivable[]> {
    return db
      .select()
      .from(accountsReceivable)
      .where(eq(accountsReceivable.userId, userId))
      .orderBy(desc(accountsReceivable.updatedAt));
  }

  async getReceivablesByFund(fundId: number): Promise<AccountsReceivable[]> {
    return db
      .select()
      .from(accountsReceivable)
      .where(eq(accountsReceivable.chitFundId, fundId))
      .orderBy(desc(accountsReceivable.updatedAt));
  }

  async getReceivablesByMonth(fundId: number, monthNumber: number): Promise<AccountsReceivable[]> {
    return db
      .select()
      .from(accountsReceivable)
      .where(
        and(
          eq(accountsReceivable.chitFundId, fundId),
          eq(accountsReceivable.monthNumber, monthNumber)
        )
      )
      .orderBy(desc(accountsReceivable.updatedAt));
  }

  async getAllReceivables(): Promise<AccountsReceivable[]> {
    const results = await db
      .select({
        id: accountsReceivable.id,
        userId: accountsReceivable.userId,
        chitFundId: accountsReceivable.chitFundId,
        monthNumber: accountsReceivable.monthNumber,
        dueDate: accountsReceivable.dueDate,
        expectedAmount: accountsReceivable.expectedAmount,
        paidAmount: accountsReceivable.paidAmount,
        status: accountsReceivable.status,
        createdAt: accountsReceivable.createdAt,
        updatedAt: accountsReceivable.updatedAt,
        userName: users.fullName,
        fundName: chitFunds.name
      })
      .from(accountsReceivable)
      .leftJoin(users, eq(accountsReceivable.userId, users.id))
      .leftJoin(chitFunds, eq(accountsReceivable.chitFundId, chitFunds.id))
      .orderBy(desc(accountsReceivable.updatedAt));

    return results;
  }

  async createPayable(payable: InsertAccountsPayable): Promise<AccountsPayable> {
    const payableData = {
      userId: payable.userId,
      chitFundId: payable.chitFundId,
      paymentType: payable.paymentType,
      amount: payable.amount,
      recordedBy: payable.recordedBy,
      notes: payable.notes,
      paidDate: payable.paidDate,
    };

    const [newPayable] = await db
      .insert(accountsPayable)
      .values(payableData)
      .returning();

    return newPayable;
  }

  async getPayablesByUser(userId: number): Promise<AccountsPayable[]> {
    return db
      .select()
      .from(accountsPayable)
      .where(eq(accountsPayable.userId, userId))
      .orderBy(desc(accountsPayable.paidDate));
  }

  async getPayablesByFund(fundId: number): Promise<AccountsPayable[]> {
    return db
      .select()
      .from(accountsPayable)
      .where(eq(accountsPayable.chitFundId, fundId))
      .orderBy(desc(accountsPayable.paidDate));
  }

  async getPayablesByType(fundId: number, type: string): Promise<AccountsPayable[]> {
    return db
      .select()
      .from(accountsPayable)
      .where(
        and(
          eq(accountsPayable.chitFundId, fundId),
          eq(accountsPayable.paymentType, type as any)
        )
      )
      .orderBy(desc(accountsPayable.paidDate));
  }

  async getAllPayables(): Promise<AccountsPayable[]> {
    const results = await db
      .select({
        id: accountsPayable.id,
        userId: accountsPayable.userId,
        chitFundId: accountsPayable.chitFundId,
        paymentType: accountsPayable.paymentType,
        amount: accountsPayable.amount,
        paidDate: accountsPayable.paidDate,
        recordedBy: accountsPayable.recordedBy,
        notes: accountsPayable.notes,
        createdAt: accountsPayable.createdAt,
        userName: users.fullName,
        fundName: chitFunds.name
      })
      .from(accountsPayable)
      .leftJoin(users, eq(accountsPayable.userId, users.id))
      .leftJoin(chitFunds, eq(accountsPayable.chitFundId, chitFunds.id))
      .orderBy(desc(accountsPayable.paidDate));

    return results;
  }
}

export const storage = new DatabaseStorage();