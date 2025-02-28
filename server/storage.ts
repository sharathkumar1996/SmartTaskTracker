import { 
  users, chitFunds, payments, fundMembers, notifications, accountsReceivable, 
  accountsPayable, memberGroups, groupMembers, financialTransactions,
  type User, type ChitFund, type Payment, type InsertUser, type InsertChitFund, 
  type InsertPayment, type Notification, type InsertNotification, type AccountsReceivable, 
  type InsertAccountsReceivable, type AccountsPayable, type InsertAccountsPayable, 
  type FundMember, type InsertFundMember, type MemberGroup, type InsertMemberGroup,
  type GroupMember, type InsertGroupMember, type FinancialTransaction, type InsertFinancialTransaction
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, or } from "drizzle-orm";
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
  getUserFundPayments(userId: number, fundId: number): Promise<Payment[]>;  // Get payments for a specific user and fund
  getPaymentsByFund(fundId: number): Promise<Payment[]>;  // Get all payments for a fund

  addMemberToFund(fundId: number, userId: number, isGroup?: boolean, groupId?: number, metadataString?: string): Promise<boolean>;
  removeMemberFromFund(fundId: number, userId: number): Promise<boolean>;
  getFundMembers(fundId: number): Promise<Omit<User, "password">[]>;
  getFundMemberDetails(fundId: number, userId: number): Promise<FundMember | undefined>; 
  updateMemberWithdrawalStatus(fundId: number, userId: number, updates: Partial<FundMember>): Promise<boolean>; 
  getMemberFunds(userId: number): Promise<ChitFund[]>;

  // Member Group methods
  createMemberGroup(group: InsertMemberGroup): Promise<MemberGroup>;
  getMemberGroup(id: number): Promise<MemberGroup | undefined>;
  getMemberGroups(): Promise<MemberGroup[]>;
  getMemberGroupsWithMembers(): Promise<(MemberGroup & { members: (GroupMember & { user: Omit<User, "password"> })[] })[]>;
  addUserToGroup(groupId: number, user: InsertGroupMember): Promise<boolean>;
  removeUserFromGroup(groupId: number, userId: number): Promise<boolean>;
  getGroupMembers(groupId: number): Promise<(GroupMember & { user: Omit<User, "password"> })[]>;

  // Fund Members with Group support
  addGroupToFund(fundId: number, groupId: number): Promise<boolean>;
  getFundMembersWithGroups(fundId: number): Promise<(FundMember & { 
    isGroup?: boolean; 
    groupId?: number; 
    groupMembers?: (GroupMember & { user: Omit<User, "password"> })[] 
  })[]>;

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
  
  // Financial Transaction methods
  createFinancialTransaction(transaction: InsertFinancialTransaction): Promise<FinancialTransaction>;
  getFinancialTransactions(): Promise<FinancialTransaction[]>;
  getFinancialTransactionsByType(type: string): Promise<FinancialTransaction[]>;
  getFinancialSummary(): Promise<{
    adminBorrowTotal: number;
    adminRepayTotal: number;
    adminNetDebt: number;
    externalLoanTotal: number;
    loanRepaymentTotal: number;
    externalNetDebt: number;
    agentSalaryTotal: number;
    gstTotal: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({ 
      checkPeriod: 86400000, // Once per day
      // Using only supported options from MemoryStore
      // Logging is handled by our custom middleware
    }); 
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

  async getUserById(id: number): Promise<User | undefined> {
    try {
      if (!id || isNaN(id)) {
        console.error("Invalid user ID in getUserById:", id);
        return undefined;
      }
      
      const result = await db.select().from(users).where(eq(users.id, id));
      return result.length > 0 ? result[0] as User : undefined;
    } catch (error) {
      console.error("Error in getUserById:", error);
      return undefined;
    }
  }

  async createUser(user: InsertUser): Promise<User> {
    try {
      // Using [] to wrap the user object as drizzle expects an array for batch inserts
      const result = await db.insert(users).values([user as any]).returning();
      const resultArray = Array.isArray(result) ? result : [result];
      return resultArray[0] as User;
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
        .where(sql`${users.role} = ${role}`);
    } catch (error) {
      console.error("Error in getUsersByRole:", error);
      return [];
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      const result = await db.delete(users).where(eq(users.id, id)).returning();
      return Array.isArray(result) && result.length > 0;
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

  async getPaymentsByFund(fundId: number): Promise<Payment[]> {
    try {
      // Special case: fundId 0 means get all payments (for dashboard analytics)
      if (fundId === 0) {
        console.log("Getting all payments for analytics");
        return (await db
          .select()
          .from(payments)
          .orderBy(payments.paymentDate)) as Payment[];
      }
      
      // Regular case - check for valid fundId
      if (!fundId || isNaN(fundId)) {
        throw new Error("Invalid fund ID");
      }
      
      return (await db
        .select()
        .from(payments)
        .where(eq(payments.chitFundId, fundId))
        .orderBy(payments.paymentDate)) as Payment[];
    } catch (error) {
      console.error("Error in getPaymentsByFund:", error);
      return [];
    }
  }

  async addMemberToFund(fundId: number, userId: number, isGroup: boolean = false, groupId?: number, metadataString?: string): Promise<boolean> {
    try {
      // Validate inputs
      if (!fundId || !userId) {
        console.error("Invalid fundId or userId in addMemberToFund:", { fundId, userId });
        return false;
      }
      
      // Check if fund exists
      const fund = await this.getChitFund(fundId);
      if (!fund) {
        console.error(`Fund with ID ${fundId} not found`);
        return false;
      }
      
      // Check if user exists
      const user = await this.getUserById(userId);
      if (!user) {
        console.error(`User with ID ${userId} not found`);
        return false;
      }
      
      // Add metadata fields to track if this is a group membership
      let metadata;
      if (isGroup && groupId) {
        if (metadataString) {
          // Use provided metadata string
          metadata = metadataString;
        } else {
          // Create basic metadata
          metadata = JSON.stringify({ isGroup: true, groupId });
        }
        console.log(`Using group metadata: ${metadata}`);
      } else {
        metadata = null;
      }
      
      // Prevent duplicate memberships
      const existingMembership = await db
        .select()
        .from(fundMembers)
        .where(and(
          eq(fundMembers.fundId, fundId),
          eq(fundMembers.userId, userId)
        ))
        .limit(1);
        
      if (existingMembership.length > 0) {
        console.log(`User ${userId} is already a member of fund ${fundId}`);
        return true; // Consider this a success since the relationship already exists
      }
      
      // Add the member to the fund with proper values
      const result = await db
        .insert(fundMembers)
        .values({
          fundId: fundId,
          userId: userId,
          earlyWithdrawalMonth: null,
          increasedMonthlyAmount: null,
          totalBonusReceived: "0",
          totalCommissionPaid: "0",
          isWithdrawn: false,
          notes: metadata
        })
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error in addMemberToFund:", error);
      
      // Log more detailed error information
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      
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

  // Financial transactions methods
  async createFinancialTransaction(transaction: InsertFinancialTransaction): Promise<FinancialTransaction> {
    try {
      // Create a copy of the transaction and ensure the date is set properly
      const transactionData = {
        ...transaction,
        // Ensure a valid date is used
        transactionDate: transaction.transactionDate || new Date()
      };
      
      console.log("Creating financial transaction with data:", transactionData);
      
      // Let Drizzle handle the inserts with typing
      const result = await db
        .insert(financialTransactions)
        .values(transactionData as any)
        .returning();
      return result[0] as FinancialTransaction;
    } catch (error) {
      console.error("Error in createFinancialTransaction:", error);
      throw error;
    }
  }

  async getFinancialTransactions(): Promise<FinancialTransaction[]> {
    try {
      const transactions = await db
        .select({
          id: financialTransactions.id,
          transactionDate: financialTransactions.transactionDate,
          amount: financialTransactions.amount,
          transactionType: financialTransactions.transactionType,
          paymentMethod: financialTransactions.paymentMethod,
          description: financialTransactions.description,
          interestRate: financialTransactions.interestRate,
          lenderName: financialTransactions.lenderName,
          agentId: financialTransactions.agentId,
          recordedBy: financialTransactions.recordedBy,
          documentUrl: financialTransactions.documentUrl,
          gstEligible: financialTransactions.gstEligible,
          hsn: financialTransactions.hsn,
          gstRate: financialTransactions.gstRate,
          gstAmount: financialTransactions.gstAmount,
          notes: financialTransactions.notes,
          agentName: users.fullName
        })
        .from(financialTransactions)
        .leftJoin(users, eq(financialTransactions.agentId, users.id))
        .orderBy(desc(financialTransactions.transactionDate));

      return transactions as FinancialTransaction[];
    } catch (error) {
      console.error("Error in getFinancialTransactions:", error);
      return [];
    }
  }
  
  async getFinancialTransactionsByType(type: string): Promise<FinancialTransaction[]> {
    try {
      const transactions = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.transactionType, type as any))
        .orderBy(desc(financialTransactions.transactionDate));
      
      return transactions as FinancialTransaction[];
    } catch (error) {
      console.error(`Error in getFinancialTransactionsByType for type ${type}:`, error);
      return [];
    }
  }
  
  async getFinancialSummary() {
    try {
      // Calculate total admin borrowings vs repayments
      const adminTransactions = await db
        .select()
        .from(financialTransactions)
        .where(
          or(
            eq(financialTransactions.transactionType, 'admin_borrow'),
            eq(financialTransactions.transactionType, 'admin_repay')
          )
        );
      
      let adminBorrowTotal = 0;
      let adminRepayTotal = 0;
      
      adminTransactions.forEach(transaction => {
        const amount = parseFloat(transaction.amount.toString());
        if (transaction.transactionType === 'admin_borrow') {
          adminBorrowTotal += amount;
        } else if (transaction.transactionType === 'admin_repay') {
          adminRepayTotal += amount;
        }
      });
      
      // Calculate external loans vs repayments
      const loanTransactions = await db
        .select()
        .from(financialTransactions)
        .where(
          or(
            eq(financialTransactions.transactionType, 'external_loan'),
            eq(financialTransactions.transactionType, 'loan_repayment')
          )
        );
      
      let externalLoanTotal = 0;
      let loanRepaymentTotal = 0;
      
      loanTransactions.forEach(transaction => {
        const amount = parseFloat(transaction.amount.toString());
        if (transaction.transactionType === 'external_loan') {
          externalLoanTotal += amount;
        } else if (transaction.transactionType === 'loan_repayment') {
          loanRepaymentTotal += amount;
        }
      });
      
      // Calculate total agent salaries
      const agentSalaries = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.transactionType, 'agent_salary'));
      
      let agentSalaryTotal = 0;
      
      agentSalaries.forEach(transaction => {
        agentSalaryTotal += parseFloat(transaction.amount.toString());
      });
      
      // Calculate total GST eligible transactions
      const gstTransactions = await db
        .select()
        .from(financialTransactions)
        .where(eq(financialTransactions.gstEligible, true));
      
      let gstTotal = 0;
      
      gstTransactions.forEach(transaction => {
        if (transaction.gstAmount) {
          gstTotal += parseFloat(transaction.gstAmount.toString());
        }
      });
      
      return {
        adminBorrowTotal,
        adminRepayTotal,
        adminNetDebt: adminBorrowTotal - adminRepayTotal,
        externalLoanTotal,
        loanRepaymentTotal,
        externalNetDebt: externalLoanTotal - loanRepaymentTotal,
        agentSalaryTotal,
        gstTotal
      };
    } catch (error) {
      console.error("Error in getFinancialSummary:", error);
      return {
        adminBorrowTotal: 0,
        adminRepayTotal: 0,
        adminNetDebt: 0,
        externalLoanTotal: 0,
        loanRepaymentTotal: 0,
        externalNetDebt: 0,
        agentSalaryTotal: 0,
        gstTotal: 0
      };
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
      // Ensure we always have a valid date for due_date
      let dueDate;
      
      try {
        // Ensure we have a valid Date object for due_date
        if (payable.dueDate instanceof Date && !isNaN(payable.dueDate.getTime())) {
          console.log("Using provided dueDate:", payable.dueDate);
          dueDate = payable.dueDate;
        } else if (payable.paidDate instanceof Date && !isNaN(payable.paidDate.getTime())) {
          console.log("Using paidDate as dueDate:", payable.paidDate);
          dueDate = payable.paidDate;
        } else {
          console.log("Using current date as dueDate");
          dueDate = new Date();
        }
      } catch (error) {
        console.error("Error parsing dates for payable, using current date:", error);
        dueDate = new Date();
      }
      
      // Ensure dueDate is a valid Date object
      if (!(dueDate instanceof Date) || isNaN(dueDate.getTime())) {
        console.warn("Invalid dueDate detected, resetting to current date");
        dueDate = new Date();
      }
      
      const payableData = {
        userId: payable.userId,
        chitFundId: payable.chitFundId,
        paymentType: payable.paymentType,
        amount: payable.amount,
        recorderId: payable.recordedBy, // Map from API field to schema field
        notes: payable.notes,
        paidDate: payable.paidDate, // Use schema field name
        dueDate: dueDate, // Always ensure we have a valid Date object
        status: "paid", // Default status for payables
        paidAmount: payable.amount, // Set paid amount same as amount for withdrawals
        commission: payable.commission, // Add the commission field
        paymentMethod: payable.paymentMethod, // Add payment method field
      };

      console.log("Creating payable with data:", payableData);

      // Use the original payableData object to insert
      // Drizzle will handle the correct mapping of field names to database column names
      const result = await db
        .insert(accountsPayable)
        .values(payableData as any)
        .returning();
      
      // Log the result for debugging
      console.log("Payable created successfully:", result);

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
      // Select with explicit column names using the updated schema field names
      const results = await db
        .select({
          id: accountsPayable.id,
          userId: accountsPayable.userId,
          chitFundId: accountsPayable.chitFundId,
          paymentType: accountsPayable.paymentType,
          amount: accountsPayable.amount,
          paidDate: accountsPayable.paidDate, // Use schema field name
          recordedBy: accountsPayable.recorderId, // Use schema field name 
          notes: accountsPayable.notes,
          commission: accountsPayable.commission, // Include the commission field
          paymentMethod: accountsPayable.paymentMethod, // Include payment method
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

  // Member Group methods implementation
  async createMemberGroup(group: InsertMemberGroup): Promise<MemberGroup> {
    try {
      const result = await db
        .insert(memberGroups)
        .values(group)
        .returning();
      return result[0] as MemberGroup;
    } catch (error) {
      console.error("Error in createMemberGroup:", error);
      throw error;
    }
  }

  async getMemberGroup(id: number): Promise<MemberGroup | undefined> {
    try {
      const result = await db.select().from(memberGroups).where(eq(memberGroups.id, id));
      return result.length > 0 ? result[0] as MemberGroup : undefined;
    } catch (error) {
      console.error("Error in getMemberGroup:", error);
      return undefined;
    }
  }

  async getMemberGroupWithMembers(id: number): Promise<{
    id: number;
    name: string;
    notes: string | null;
    createdBy: number;
    primaryUserId: number | null;
    members: GroupMember[];
  } | undefined> {
    try {
      // Get the group first
      const group = await this.getMemberGroup(id);
      if (!group) return undefined;

      // Get all the members for this group
      const members = await db
        .select()
        .from(groupMembers)
        .where(eq(groupMembers.groupId, id));

      // For each group member, get the user details (but exclude password)
      const membersWithUser = await Promise.all(
        members.map(async (member) => {
          const user = await this.getUserById(member.userId);
          return {
            ...member,
            user: user ? {
              id: user.id,
              username: user.username,
              role: user.role,
              fullName: user.fullName,
              email: user.email,
              phone: user.phone,
              address: user.address,
              city: user.city,
              state: user.state,
              pincode: user.pincode,
              status: user.status,
            } : null,
          };
        })
      );

      return {
        ...group,
        members: membersWithUser,
      };
    } catch (error) {
      console.error("Error in getMemberGroupWithMembers:", error);
      return undefined;
    }
  }

  async getMemberGroups(): Promise<MemberGroup[]> {
    try {
      return (await db.select().from(memberGroups)) as MemberGroup[];
    } catch (error) {
      console.error("Error in getMemberGroups:", error);
      return [];
    }
  }

  async getMemberGroupsWithMembers(): Promise<(MemberGroup & { members: (GroupMember & { user: Omit<User, "password"> })[] })[]> {
    try {
      const groups = await db.select().from(memberGroups);
      
      // For each group, fetch members with user details
      const groupsWithMembers = await Promise.all(
        groups.map(async (group) => {
          const members = await this.getGroupMembers(group.id);
          return {
            ...group,
            members
          };
        })
      );
      
      return groupsWithMembers as (MemberGroup & { members: (GroupMember & { user: Omit<User, "password"> })[] })[];
    } catch (error) {
      console.error("Error in getMemberGroupsWithMembers:", error);
      return [];
    }
  }

  async addUserToGroup(groupId: number, member: InsertGroupMember): Promise<boolean> {
    try {
      const result = await db
        .insert(groupMembers)
        .values({
          groupId: member.groupId,
          userId: member.userId,
          sharePercentage: member.sharePercentage,
          notes: member.notes
        })
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in addUserToGroup:", error);
      return false;
    }
  }

  async removeUserFromGroup(groupId: number, userId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId)
          )
        )
        .returning();
      return result.length > 0;
    } catch (error) {
      console.error("Error in removeUserFromGroup:", error);
      return false;
    }
  }

  async getGroupMembers(groupId: number): Promise<(GroupMember & { user: Omit<User, "password"> })[]> {
    try {
      const results = await db
        .select({
          groupId: groupMembers.groupId,
          userId: groupMembers.userId,
          sharePercentage: groupMembers.sharePercentage,
          notes: groupMembers.notes,
          user: {
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
          }
        })
        .from(groupMembers)
        .innerJoin(users, eq(groupMembers.userId, users.id))
        .where(eq(groupMembers.groupId, groupId));
      
      return results as unknown as (GroupMember & { user: Omit<User, "password"> })[];
    } catch (error) {
      console.error("Error in getGroupMembers:", error);
      return [];
    }
  }

  // Fund Members with Group support
  async addGroupToFund(fundId: number, groupId: number): Promise<boolean> {
    try {
      console.log(`Adding group ${groupId} to fund ${fundId}`);
      
      // Get the group details
      const group = await this.getMemberGroup(groupId);
      if (!group) {
        console.error(`Group with ID ${groupId} not found`);
        return false;
      }
      console.log(`Found group: ${JSON.stringify(group)}`);
      
      // Get all group members
      const members = await this.getGroupMembers(groupId);
      console.log(`Group ${groupId} has ${members.length} members`);
      
      if (!members || members.length === 0) {
        console.error(`Group ${groupId} has no members`);
        return false;
      }
      
      // Get a primary user for the group (either designated primary or first member)
      let primaryUserId = group.primaryUserId;
      
      if (!primaryUserId) {
        // Use the first member as the primary user
        primaryUserId = members[0].userId;
        console.log(`Using first member (${primaryUserId}) as primary user`);
      }
      
      if (!primaryUserId) {
        console.error("Cannot add group to fund: No primary user could be determined");
        return false;
      }
      
      // Create the metadata that will be stored in the notes field
      const metadata = JSON.stringify({
        isGroup: true,
        groupId: groupId,
        memberCount: members.length,
        groupName: group.name
      });
      
      console.log(`Adding primary user ${primaryUserId} to fund ${fundId} as group representative`);
      console.log(`With metadata: ${metadata}`);
      
      // Add the primary user to the fund with group metadata
      return await this.addMemberToFund(fundId, primaryUserId, true, groupId);
    } catch (error) {
      console.error("Error in addGroupToFund:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      return false;
    }
  }

  async getFundMembersWithGroups(fundId: number): Promise<(FundMember & { 
    isGroup?: boolean; 
    groupId?: number; 
    groupMembers?: (GroupMember & { user: Omit<User, "password"> })[] 
  })[]> {
    try {
      // Get basic fund members data
      const memberships = await db
        .select()
        .from(fundMembers)
        .where(eq(fundMembers.fundId, fundId));
      
      // Process each membership to check if it's a group
      const result = await Promise.all(
        memberships.map(async (membership) => {
          // Check if this is a group membership by examining the notes field
          if (membership.notes) {
            try {
              const metadata = JSON.parse(membership.notes as string);
              
              if (metadata.isGroup && metadata.groupId) {
                // This is a group, get the group members
                const groupMembers = await this.getGroupMembers(metadata.groupId);
                
                return {
                  ...membership,
                  isGroup: true,
                  groupId: metadata.groupId,
                  groupMembers
                };
              }
            } catch (e) {
              // Not a valid JSON or not containing group info, treat as regular member
            }
          }
          
          // Regular member, no group data
          return {
            ...membership,
            isGroup: false
          };
        })
      );
      
      return result as (FundMember & { 
        isGroup?: boolean; 
        groupId?: number; 
        groupMembers?: (GroupMember & { user: Omit<User, "password"> })[] 
      })[];
    } catch (error) {
      console.error("Error in getFundMembersWithGroups:", error);
      return [];
    }
  }
}

export const storage = new DatabaseStorage();