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
  getUserFundPayments(userId: number, fundId: number): Promise<Payment[]>;  // New method to get payments for a specific user and fund

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
    try {
      const result = await db.select().from(users).where(eq(users.id, id));
      return result.length > 0 ? result[0] as User : undefined;
    } catch (error) {
      console.error("Error in getUser:", error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.username, username));
      return result.length > 0 ? result[0] as User : undefined;
    } catch (error) {
      console.error("Error in getUserByUsername:", error);
      return undefined;
    }
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    try {
      const result = await db.select().from(users).where(eq(users.email, email));
      return result.length > 0 ? result[0] as User : undefined;
    } catch (error) {
      console.error("Error in getUserByEmail:", error);
      return undefined;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      const result = await db.insert(users).values(user).returning();
      return result[0] as User;
    } catch (error) {
      console.error("Error in createUser:", error);
      throw error;
    }
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    try {
      const result = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      return result.length > 0 ? result[0] as User : undefined;
    } catch (error) {
      console.error("Error in updateUser:", error);
      return undefined;
    }
  }

  async getUsers(): Promise<User[]> {
    try {
      return (await db.select().from(users)) as User[];
    } catch (error) {
      console.error("Error in getUsers:", error);
      return [];
    }
  }

  async getUserCount(): Promise<number> {
    try {
      const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      return result?.count || 0;
    } catch (error) {
      console.error("Error in getUserCount:", error);
      return 0;
    }
  }

  async getUsersByRole(role: string): Promise<Omit<User, "password">[]> {
    try {
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
    } catch (error) {
      console.error("Error in getUsersByRole:", error);
      return [];
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      const result = await db.delete(users).where(eq(users.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in deleteUser:", error);
      return false;
    }
  }

  async createChitFund(fund: InsertChitFund): Promise<ChitFund> {
    try {
      const result = await db
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
        } as any)
        .returning();
      return result[0] as ChitFund;
    } catch (error) {
      console.error("Error in createChitFund:", error);
      throw error;
    }
  }

  async getChitFund(id: number): Promise<ChitFund | undefined> {
    try {
      const result = await db.select().from(chitFunds).where(eq(chitFunds.id, id));
      return result.length > 0 ? result[0] as ChitFund : undefined;
    } catch (error) {
      console.error("Error in getChitFund:", error);
      return undefined;
    }
  }

  async getChitFunds(): Promise<ChitFund[]> {
    try {
      return (await db.select().from(chitFunds)) as ChitFund[];
    } catch (error) {
      console.error("Error in getChitFunds:", error);
      return [];
    }
  }

  async updateChitFund(id: number, updates: Partial<ChitFund>): Promise<ChitFund | undefined> {
    try {
      const result = await db
        .update(chitFunds)
        .set(updates)
        .where(eq(chitFunds.id, id))
        .returning();
      return result.length > 0 ? result[0] as ChitFund : undefined;
    } catch (error) {
      console.error("Error in updateChitFund:", error);
      return undefined;
    }
  }

  async deleteChitFund(id: number): Promise<boolean> {
    try {
      const result = await db.delete(chitFunds).where(eq(chitFunds.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in deleteChitFund:", error);
      return false;
    }
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

      const result = await db
        .insert(payments)
        .values(paymentData)
        .returning();

      return result[0] as Payment;
    } catch (error) {
      console.error("Error in createPayment:", error);
      throw error;
    }
  }

  async getUserPayments(userId: number): Promise<Payment[]> {
    try {
      if (!userId || isNaN(userId)) {
        throw new Error("Invalid user ID");
      }
      return (await db.select().from(payments).where(eq(payments.userId, userId))) as Payment[];
    } catch (error) {
      console.error("Error in getUserPayments:", error);
      return [];
    }
  }

  async getUserFundPayments(userId: number, fundId: number): Promise<Payment[]> {
    try {
      if (!userId || isNaN(userId) || !fundId || isNaN(fundId)) {
        throw new Error("Invalid user ID or fund ID");
      }
      return (await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, userId),
            eq(payments.chitFundId, fundId)
          )
        )
        .orderBy(payments.paymentDate)) as Payment[];
    } catch (error) {
      console.error("Error in getUserFundPayments:", error);
      return [];
    }
  }

  async addMemberToFund(fundId: number, userId: number): Promise<boolean> {
    try {
      const result = await db
        .insert(fundMembers)
        .values({
          fundId,
          userId,
          totalBonusReceived: "0",
          totalCommissionPaid: "0",
          isWithdrawn: false,
        })
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in addMemberToFund:", error);
      return false;
    }
  }

  async removeMemberFromFund(fundId: number, userId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(fundMembers)
        .where(and(eq(fundMembers.fundId, fundId), eq(fundMembers.userId, userId)))
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in removeMemberFromFund:", error);
      return false;
    }
  }

  async getFundMembers(fundId: number): Promise<Omit<User, "password">[]> {
    try {
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
    } catch (error) {
      console.error("Error in getFundMembers:", error);
      return [];
    }
  }

  async getFundMemberDetails(fundId: number, userId: number): Promise<FundMember | undefined> {
    try {
      const result = await db
        .select()
        .from(fundMembers)
        .where(
          and(
            eq(fundMembers.fundId, fundId),
            eq(fundMembers.userId, userId)
          )
        );
      return result.length > 0 ? result[0] as FundMember : undefined;
    } catch (error) {
      console.error("Error in getFundMemberDetails:", error);
      return undefined;
    }
  }

  async updateMemberWithdrawalStatus(fundId: number, userId: number, updates: Partial<FundMember>): Promise<boolean> {
    try {
      const result = await db
        .update(fundMembers)
        .set(updates)
        .where(
          and(
            eq(fundMembers.fundId, fundId),
            eq(fundMembers.userId, userId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in updateMemberWithdrawalStatus:", error);
      return false;
    }
  }

  async getMemberFunds(userId: number): Promise<ChitFund[]> {
    try {
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

      return results as ChitFund[];
    } catch (error) {
      console.error("Error in getMemberFunds:", error);
      return [];
    }
  }

  async createReceivable(receivable: InsertAccountsReceivable): Promise<AccountsReceivable> {
    try {
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

      const result = await db
        .insert(accountsReceivable)
        .values(receivableData)
        .returning();

      return result[0] as AccountsReceivable;
    } catch (error) {
      console.error("Error in createReceivable:", error);
      throw error;
    }
  }

  async updateReceivable(id: number, updates: Partial<AccountsReceivable>): Promise<boolean> {
    try {
      const updatedData = {
        ...updates,
        updatedAt: new Date(),
      };

      // Convert null to proper string value for status if needed
      if (updatedData.status === null) {
        updatedData.status = "partial";
      }

      const result = await db
        .update(accountsReceivable)
        .set(updatedData)
        .where(eq(accountsReceivable.id, id))
        .returning();

      return result.length > 0;
    } catch (error) {
      console.error("Error in updateReceivable:", error);
      return false;
    }
  }

  async getReceivablesByUser(userId: number): Promise<AccountsReceivable[]> {
    try {
      return (await db
        .select()
        .from(accountsReceivable)
        .where(eq(accountsReceivable.userId, userId))
        .orderBy(desc(accountsReceivable.updatedAt))) as AccountsReceivable[];
    } catch (error) {
      console.error("Error in getReceivablesByUser:", error);
      return [];
    }
  }

  async getReceivablesByFund(fundId: number): Promise<AccountsReceivable[]> {
    try {
      return (await db
        .select()
        .from(accountsReceivable)
        .where(eq(accountsReceivable.chitFundId, fundId))
        .orderBy(desc(accountsReceivable.updatedAt))) as AccountsReceivable[];
    } catch (error) {
      console.error("Error in getReceivablesByFund:", error);
      return [];
    }
  }

  async getReceivablesByMonth(fundId: number, monthNumber: number): Promise<AccountsReceivable[]> {
    try {
      return (await db
        .select()
        .from(accountsReceivable)
        .where(
          and(
            eq(accountsReceivable.chitFundId, fundId),
            eq(accountsReceivable.monthNumber, monthNumber)
          )
        )
        .orderBy(desc(accountsReceivable.updatedAt))) as AccountsReceivable[];
    } catch (error) {
      console.error("Error in getReceivablesByMonth:", error);
      return [];
    }
  }

  async getAllReceivables(): Promise<AccountsReceivable[]> {
    try {
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

      return results as unknown as AccountsReceivable[];
    } catch (error) {
      console.error("Error in getAllReceivables:", error);
      return [];
    }
  }

  async createPayable(payable: InsertAccountsPayable): Promise<AccountsPayable> {
    try {
      // Map fields correctly for the database table including required due_date
      const payableData = {
        userId: payable.userId,
        chitFundId: payable.chitFundId,
        paymentType: payable.paymentType,
        amount: payable.amount,
        recorder_id: payable.recordedBy, // Map recordedBy to recorder_id
        notes: payable.notes,
        paid_date: payable.paidDate, // Use paid_date field to match database column name
        due_date: payable.dueDate || payable.paidDate, // Use paidDate as fallback for dueDate
        status: "paid", // Default status for payables
        paid_amount: payable.amount, // Set paid amount same as amount for withdrawals
      };

      console.log("Creating payable with data:", payableData);

      // Insert into database with explicit column mapping
      const result = await db
        .insert(accountsPayable)
        .values(payableData as any)
        .returning();

      // If this is a withdrawal payment, update the member's withdrawal status
      if (payable.paymentType === 'withdrawal' && payable.withdrawalMonth) {
        try {
          // Update the fund member record with withdrawal info
          await this.updateMemberWithdrawalStatus(
            payable.chitFundId, 
            payable.userId, 
            {
              isWithdrawn: true,
              earlyWithdrawalMonth: payable.withdrawalMonth
            }
          );
          console.log(`Updated withdrawal status for user ${payable.userId} in fund ${payable.chitFundId}`);
          
          // Also create a payment record for better tracking
          try {
            await this.createPayment({
              userId: payable.userId,
              chitFundId: payable.chitFundId,
              amount: payable.amount,
              paymentType: "withdrawal",
              paymentMethod: "cash", // Default method
              recordedBy: payable.recordedBy,
              notes: payable.notes || `Withdrawal payment for month ${payable.withdrawalMonth}`,
              paymentDate: payable.paidDate,
              monthNumber: payable.withdrawalMonth
            });
            console.log(`Created payment record for withdrawal`);
          } catch (paymentError) {
            console.error("Error creating payment record for withdrawal:", paymentError);
            // Continue anyway - payable record was already created
          }
        } catch (withdrawalError) {
          console.error("Error updating withdrawal status:", withdrawalError);
          // Continue anyway - we don't want to roll back the payment record
        }
      }

      return result[0] as AccountsPayable;
    } catch (error) {
      console.error("Error creating payable:", error);
      throw error;
    }
  }

  async getPayablesByUser(userId: number): Promise<AccountsPayable[]> {
    try {
      return (await db
        .select()
        .from(accountsPayable)
        .where(eq(accountsPayable.userId, userId))
        .orderBy(desc(accountsPayable.createdAt))) as AccountsPayable[]; // Use createdAt as fallback
    } catch (error) {
      console.error("Error in getPayablesByUser:", error);
      return [];
    }
  }

  async getPayablesByFund(fundId: number): Promise<AccountsPayable[]> {
    try {
      return (await db
        .select()
        .from(accountsPayable)
        .where(eq(accountsPayable.chitFundId, fundId))
        .orderBy(desc(accountsPayable.createdAt))) as AccountsPayable[]; // Use createdAt as fallback
    } catch (error) {
      console.error("Error in getPayablesByFund:", error);
      return [];
    }
  }

  async getPayablesByType(fundId: number, type: string): Promise<AccountsPayable[]> {
    try {
      return (await db
        .select()
        .from(accountsPayable)
        .where(
          and(
            eq(accountsPayable.chitFundId, fundId),
            eq(accountsPayable.paymentType, type as any)
          )
        )
        .orderBy(desc(accountsPayable.createdAt))) as AccountsPayable[]; // Use createdAt as fallback
    } catch (error) {
      console.error("Error in getPayablesByType:", error);
      return [];
    }
  }

  async getAllPayables(): Promise<AccountsPayable[]> {
    try {
      // Select with explicit column names to avoid the paid_date issue
      const results = await db
        .select({
          id: accountsPayable.id,
          userId: accountsPayable.userId,
          chitFundId: accountsPayable.chitFundId,
          paymentType: accountsPayable.paymentType,
          amount: accountsPayable.amount,
          paidDate: accountsPayable.paid_date, // Map paid_date to paidDate in result
          recordedBy: accountsPayable.recorder_id, // Map recorder_id to recordedBy
          notes: accountsPayable.notes,
          // commission removed as it doesn't exist in the database
          createdAt: accountsPayable.createdAt,
          userName: users.fullName,
          fundName: chitFunds.name
        })
        .from(accountsPayable)
        .leftJoin(users, eq(accountsPayable.userId, users.id))
        .leftJoin(chitFunds, eq(accountsPayable.chitFundId, chitFunds.id))
        .orderBy(desc(accountsPayable.createdAt)); // Use createdAt as fallback

      return results as unknown as AccountsPayable[];
    } catch (error) {
      console.error("Error in getAllPayables:", error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();