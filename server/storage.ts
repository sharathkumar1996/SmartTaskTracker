import { users, chitFunds, payments, fundMembers, notifications, type User, type ChitFund, type Payment, type InsertUser, type InsertChitFund, type InsertPayment, type Notification, type InsertNotification } from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";
import session from "express-session";
import createMemoryStore from "memorystore";

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
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotifications(userId: number): Promise<Notification[]>;
  markNotificationAsRead(id: number): Promise<boolean>;
  getPaymentReport({fundId, fromDate, toDate}: {fundId?: number; fromDate?: Date; toDate?: Date;}): Promise<Payment[]>;
}

export class DatabaseStorage implements IStorage {
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

  async getUserCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users);
    return result[0]?.count || 0;
  }

  async createChitFund(fund: InsertChitFund): Promise<ChitFund> {
    const [chitFund] = await db.insert(chitFunds).values({
      ...fund,
      startDate: new Date(fund.startDate),
      endDate: new Date(fund.endDate)
    }).returning();
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

  async updateChitFund(id: number, updates: Partial<ChitFund>): Promise<ChitFund | undefined> {
    const [updatedFund] = await db
      .update(chitFunds)
      .set(updates)
      .where(eq(chitFunds.id, id))
      .returning();
    return updatedFund;
  }

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values({
      ...payment,
      paymentDate: new Date(payment.paymentDate),
      createdAt: new Date()
    }).returning();
    return newPayment;
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    if (!userId || isNaN(userId)) {
      throw new Error("Invalid user ID");
    }
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
      .from(fundMembers)
      .innerJoin(users, eq(fundMembers.userId, users.id))
      .where(eq(fundMembers.fundId, fundId));
  }

  async getMemberFunds(userId: number): Promise<ChitFund[]> {
    return await db
      .select()
      .from(fundMembers)
      .innerJoin(chitFunds, eq(fundMembers.fundId, chitFunds.id))
      .where(eq(fundMembers.userId, userId));
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
      .where(eq(users.role, role));
  }

  async deleteUser(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    return !!deleted;
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
        const memberPayments = await db
          .select({
            amount: payments.amount,
            paymentDate: payments.paymentDate
          })
          .from(payments)
          .where(
            and(
              eq(payments.userId, member.id),
              eq(payments.chitFundId, fundId)
            )
          );

        const paymentsWithMonth = memberPayments
          .filter(payment => payment.paymentDate)
          .map(payment => {
            const paymentDate = new Date(payment.paymentDate);
            const yearDiff = paymentDate.getFullYear() - fundStartDate.getFullYear();
            const monthDiff = paymentDate.getMonth() - fundStartDate.getMonth();
            const month = yearDiff * 12 + monthDiff + 1;

            return {
              month,
              amount: payment.amount.toString(),
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

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values({
        ...notification,
        createdAt: new Date()
      })
      .returning();
    return newNotification;
  }

  async getNotifications(userId: number): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(notifications.createdAt);
  }

  async markNotificationAsRead(id: number): Promise<boolean> {
    const [updated] = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return !!updated;
  }

  async getPaymentReport({ 
    fundId, 
    fromDate, 
    toDate 
  }: { 
    fundId?: number; 
    fromDate?: Date; 
    toDate?: Date;
  }): Promise<Payment[]> {
    let baseQuery = db
      .select({
        id: payments.id,
        amount: payments.amount,
        paymentType: payments.paymentType,
        paymentMethod: payments.paymentMethod,
        paymentDate: payments.paymentDate,
        notes: payments.notes,
        user: db
          .select({
            id: users.id,
            fullName: users.fullName,
          })
          .from(users)
          .where(eq(users.id, payments.userId))
          .limit(1),
        chitFund: db
          .select({
            id: chitFunds.id,
            name: chitFunds.name,
          })
          .from(chitFunds)
          .where(eq(chitFunds.id, payments.chitFundId))
          .limit(1),
        recorder: db
          .select({
            id: users.id,
            fullName: users.fullName,
          })
          .from(users)
          .where(eq(users.id, payments.recordedBy))
          .limit(1),
      })
      .from(payments);

    if (fundId) {
      baseQuery = baseQuery.where(eq(payments.chitFundId, fundId));
    }

    if (fromDate) {
      baseQuery = baseQuery.where(sql`${payments.paymentDate} >= ${fromDate}`);
    }

    if (toDate) {
      baseQuery = baseQuery.where(sql`${payments.paymentDate} <= ${toDate}`);
    }

    const results = await baseQuery.orderBy(payments.paymentDate);
    return results;
  }
}

export const storage = new DatabaseStorage();