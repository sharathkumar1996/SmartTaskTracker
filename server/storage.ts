import { users, chitFunds, payments, fundMembers, type User, type ChitFund, type Payment, type InsertUser, type InsertChitFund, type InsertPayment } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";

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
  getUserCount(): Promise<number>;
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
  deleteUser(id: number): Promise<boolean>;
  getFundPayments(fundId: number): Promise<{
    members: {
      id: number;
      fullName: string;
      payments: {
        month: number;
        amount: string;
        paymentDate: Date;
      }[];
    }[];
  }>;
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
    try {
      const [newPayment] = await db.insert(payments).values({
        userId: payment.userId,
        chitFundId: payment.chitFundId,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        paymentType: payment.paymentType,
        recordedBy: payment.recordedBy,
        notes: payment.notes,
        paymentDate: payment.paymentDate,
        createdAt: new Date()
      }).returning();

      return newPayment;
    } catch (error) {
      console.error('Error creating payment:', error);
      throw error;
    }
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    return await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId));
  }

  async addMemberToFund(fundId: number, userId: number): Promise<boolean> {
    try {
      const existingMember = await db
        .select()
        .from(fundMembers)
        .where(
          and(
            eq(fundMembers.fundId, fundId),
            eq(fundMembers.userId, userId)
          )
        )
        .limit(1);

      if (existingMember.length > 0) {
        throw new Error("Member is already in this fund");
      }

      await db.insert(fundMembers).values({ fundId, userId });
      return true;
    } catch (error) {
      console.error('Error adding member to fund:', error);
      throw error;
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
  async deleteUser(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return !!deleted;
  }

  async getUserCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    return Number(result[0]?.count) || 0;
  }

  async getFundPayments(fundId: number): Promise<{
    members: {
      id: number;
      fullName: string;
      payments: {
        month: number;
        amount: string;
        paymentDate: Date;
      }[];
    }[];
  }> {
    const members = await this.getFundMembers(fundId);

    const [fund] = await db
      .select()
      .from(chitFunds)
      .where(eq(chitFunds.id, fundId));

    if (!fund) {
      throw new Error("Fund not found");
    }

    const fundStartDate = new Date(fund.startDate);

    const membersWithPayments = await Promise.all(
      members.map(async (member) => {
        // Get all payments for this member in this fund
        const memberPayments = await db
          .select({
            amount: payments.amount,
            paymentDate: payments.paymentDate,
            chitFundId: payments.chitFundId,
          })
          .from(payments)
          .where(
            and(
              eq(payments.userId, member.id),
              eq(payments.chitFundId, fundId)
            )
          );

        // Process payments to calculate months from fund start date
        const paymentsWithMonth = memberPayments
          .filter(payment => payment.paymentDate)
          .map(payment => {
            const paymentDate = new Date(payment.paymentDate!);

            // Calculate months since fund start
            const yearDiff = paymentDate.getFullYear() - fundStartDate.getFullYear();
            const monthDiff = paymentDate.getMonth() - fundStartDate.getMonth();
            const month = yearDiff * 12 + monthDiff + 1; // Adding 1 to make it 1-based

            return {
              month,
              amount: payment.amount,
              paymentDate
            };
          });

        return {
          id: member.id,
          fullName: member.fullName,
          payments: paymentsWithMonth
        };
      })
    );

    return { members: membersWithPayments };
  }
}

export const storage = new DatabaseStorage();