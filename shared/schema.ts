import { pgTable, text, serial, integer, decimal, timestamp, primaryKey, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User table definition with proper type annotation
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().$type<"admin" | "agent" | "member">(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  fundPreferences: text("fund_preferences"),
  agentId: integer("agent_id").references((): any => users.id, { onDelete: 'set null' }),
  agentCommission: decimal("agent_commission"),
  status: text("status").$type<"active" | "inactive">().default("active").notNull(),
});

export const chitFunds = pgTable("chit_funds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  memberCount: integer("member_count").notNull(),
  monthlyContribution: decimal("monthly_contribution", { precision: 10, scale: 2 }).notNull(),
  monthlyBonus: decimal("monthly_bonus", { precision: 10, scale: 2 }).notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  baseCommission: decimal("base_commission", { precision: 10, scale: 2 }).notNull(),
  status: text("status").$type<"active" | "completed" | "closed">().notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  chitFundId: integer("chit_fund_id").notNull().references(() => chitFunds.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  monthNumber: integer("month_number").notNull(),
  bonusAmount: decimal("bonus_amount", { precision: 10, scale: 2 }),
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }),
  paymentType: text("payment_type").$type<"monthly" | "bonus" | "withdrawal">().notNull(),
  paymentMethod: text("payment_method").$type<"cash" | "google_pay" | "phone_pay" | "online_portal">().notNull(),
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  notes: text("notes"),
  paymentDate: timestamp("payment_date"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});

export const fundMembers = pgTable("fund_members", {
  fundId: integer("fund_id").notNull().references(() => chitFunds.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  earlyWithdrawalMonth: integer("early_withdrawal_month"),
  increasedMonthlyAmount: decimal("increased_monthly_amount", { precision: 10, scale: 2 }),
  totalBonusReceived: decimal("total_bonus_received", { precision: 10, scale: 2 }).default('0'),
  totalCommissionPaid: decimal("total_commission_paid", { precision: 10, scale: 2 }).default('0'),
  isWithdrawn: boolean("is_withdrawn").default(false),
}, (table) => ({
  pk: primaryKey({ columns: [table.fundId, table.userId] }),
}));

// Maintain relationships
export const usersRelations = relations(users, ({ many, one }) => ({
  managedFunds: many(chitFunds),
  payments: many(payments),
  fundMemberships: many(fundMembers),
  agent: one(users, {
    fields: [users.agentId],
    references: [users.id],
  }),
}));

export const chitFundsRelations = relations(chitFunds, ({ many }) => ({
  payments: many(payments),
  members: many(fundMembers),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  chitFund: one(chitFunds, {
    fields: [payments.chitFundId],
    references: [chitFunds.id],
  }),
  recorder: one(users, {
    fields: [payments.recordedBy],
    references: [users.id],
  }),
}));

export const fundMembersRelations = relations(fundMembers, ({ one }) => ({
  user: one(users, {
    fields: [fundMembers.userId],
    references: [users.id],
  }),
  fund: one(chitFunds, {
    fields: [fundMembers.fundId],
    references: [chitFunds.id],
  }),
}));

// Updated insert schemas with proper validation
export const insertUserSchema = createInsertSchema(users).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  email: z.string().email("Invalid email format"),
  phone: z.string().regex(/^\+?[\d\s-]{10,}$/, "Invalid phone number format"),
});

export const insertChitFundSchema = createInsertSchema(chitFunds).extend({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  amount: z.string().or(z.number()).transform(String),
  duration: z.number().min(1, "Duration must be at least 1 month"),
  memberCount: z.number().min(2, "Member count must be at least 2"),
  monthlyContribution: z.string().or(z.number()).transform(String),
  monthlyBonus: z.string().or(z.number()).transform(String),
  baseCommission: z.string().or(z.number()).transform(String),
});

// Define a completely custom payments schema instead of using createInsertSchema
export const insertPaymentSchema = z.object({
  userId: z.number(),
  chitFundId: z.number(),
  amount: z.string().or(z.number()).transform(String),
  paymentType: z.enum(["monthly", "bonus", "withdrawal"]),
  paymentMethod: z.enum(["cash", "google_pay", "phone_pay", "online_portal"]),
  recordedBy: z.number(),
  notes: z.string().optional().nullable(),
  paymentDate: z.coerce.date(),
  monthNumber: z.number().optional(),
});

export const insertFundMemberSchema = createInsertSchema(fundMembers).extend({
  earlyWithdrawalMonth: z.number().min(1).max(20).optional(),
  increasedMonthlyAmount: z.string().or(z.number()).optional().transform(String),
  isGroup: z.boolean().optional(),
  groupId: z.number().optional(),
});

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ChitFund = typeof chitFunds.$inferSelect;
export type InsertChitFund = z.infer<typeof insertChitFundSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type FundMember = typeof fundMembers.$inferSelect & {
  hasPayable?: boolean; // Added for client-side display purposes
  isGroup?: boolean; // Is this a group membership (not stored in DB)
  groupId?: number; // Reference to a member group (not stored in DB)
  groupMembers?: GroupMember[]; // Group members for this spot (not stored in DB)
};
export type InsertFundMember = z.infer<typeof insertFundMemberSchema>;
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").$type<"payment" | "reminder" | "system">().notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Add notification relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
export const insertNotificationSchema = createInsertSchema(notifications);
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Add receivables and payables tables to existing schema
// Revise accounts_receivable schema to match the actual database structure
export const accountsReceivable = pgTable("accounts_receivable", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  chitFundId: integer("chit_fund_id").notNull().references(() => chitFunds.id, { onDelete: 'cascade' }),
  monthNumber: integer("month_number").notNull(),
  dueDate: timestamp("due_date"),
  expectedAmount: decimal("expected_amount", { precision: 10, scale: 2 }),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }),
  status: text("status").$type<"pending" | "paid" | "overdue" | "partial">().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const accountsPayable = pgTable("accounts_payable", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  chitFundId: integer("chit_fund_id").notNull().references(() => chitFunds.id, { onDelete: 'cascade' }),
  paymentType: text("payment_type").$type<"bonus" | "withdrawal" | "commission">().notNull(),
  dueDate: timestamp("due_date").notNull(), // Required field in the database
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 10, scale: 2 }).default('0'),
  status: text("status").$type<"pending" | "paid" | "overdue" | "partial">().notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  paidDate: timestamp("paid_date", { withTimezone: true }),
  recorderId: integer("recorder_id").references(() => users.id),
  commission: decimal("commission", { precision: 10, scale: 2 }),
  paymentMethod: text("payment_method").$type<"cash" | "bank_transfer" | "google_pay" | "phone_pay" | "online_portal">().default("cash"),
});

// Update the relations to use the new structure
export const accountsReceivableRelations = relations(accountsReceivable, ({ one }) => ({
  user: one(users, {
    fields: [accountsReceivable.userId],
    references: [users.id],
  }),
  chitFund: one(chitFunds, {
    fields: [accountsReceivable.chitFundId],
    references: [chitFunds.id],
  }),
}));

export const accountsPayableRelations = relations(accountsPayable, ({ one }) => ({
  user: one(users, {
    fields: [accountsPayable.userId],
    references: [users.id],
  }),
  chitFund: one(chitFunds, {
    fields: [accountsPayable.chitFundId],
    references: [chitFunds.id],
  }),
  recorder: one(users, {
    fields: [accountsPayable.recorderId],
    references: [users.id],
  }),
}));

// Add insert schemas for the new tables
// Update the insert schema for the new structure
export const insertAccountsReceivableSchema = createInsertSchema(accountsReceivable).extend({
  dueDate: z.coerce.date().optional(),
  expectedAmount: z.string().or(z.number()).transform(String),
  paidAmount: z.string().or(z.number()).transform(String),
  status: z.enum(["pending", "paid", "overdue", "partial"]).default("paid"),
  updatedAt: z.coerce.date().optional(),
});

export const insertAccountsPayableSchema = createInsertSchema(accountsPayable).extend({
  paidDate: z.coerce.date(),
  dueDate: z.coerce.date(), // Add the due date field to match the database column
  amount: z.string().or(z.number()).transform(String),
  commission: z.string().or(z.number()).optional().transform(val => val ? String(val) : undefined),
  // Fields for app logic (not stored in DB directly)
  withdrawalMonth: z.number().optional(),
  recordedBy: z.number(), // Field used in the API but maps to recorderId
  paymentMethod: z.enum(["cash", "bank_transfer", "google_pay", "phone_pay", "online_portal"]).default("cash"),
});

// Member Groups for handling group members - one logical member consists of multiple physical members
export const memberGroups = pgTable("member_groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  primaryUserId: integer("primary_user_id").references(() => users.id, { onDelete: 'cascade' }),
  createdBy: integer("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
});

// Store individual members in a group
export const groupMembers = pgTable("group_members", {
  groupId: integer("group_id").notNull().references(() => memberGroups.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  sharePercentage: decimal("share_percentage", { precision: 5, scale: 2 }).notNull(),
  notes: text("notes"),
}, (table) => ({
  pk: primaryKey({ columns: [table.groupId, table.userId] }),
}));

// Relations for member groups
export const memberGroupsRelations = relations(memberGroups, ({ one, many }) => ({
  primaryUser: one(users, {
    fields: [memberGroups.primaryUserId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [memberGroups.createdBy],
    references: [users.id],
  }),
  members: many(groupMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(memberGroups, {
    fields: [groupMembers.groupId],
    references: [memberGroups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}));

// Add relation to users
export const usersWithGroupsRelations = relations(users, ({ many }) => ({
  memberGroups: many(memberGroups, { relationName: "userGroups" }),
  groupMemberships: many(groupMembers, { relationName: "userGroupMemberships" }),
}));

// We can't modify the existing table directly, so we need to handle this in the code
// Instead of creating a new table, we'll extend the type
// Note: This doesn't change the DB structure, just adds fields for TypeScript

// Schemas for member groups
export const insertMemberGroupSchema = createInsertSchema(memberGroups);
export const insertGroupMemberSchema = createInsertSchema(groupMembers).extend({
  sharePercentage: z.string().or(z.number()).transform(String),
});

// Export types for groups
export type MemberGroup = typeof memberGroups.$inferSelect;
export type InsertMemberGroup = z.infer<typeof insertMemberGroupSchema>;
export type GroupMember = typeof groupMembers.$inferSelect;
export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;

// Create table for financial transactions that don't belong to a specific chit fund
export const financialTransactions = pgTable("financial_transactions", {
  id: serial("id").primaryKey(),
  transactionDate: timestamp("transaction_date").notNull().defaultNow(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  transactionType: text("transaction_type").$type<"admin_borrow" | "admin_repay" | "external_loan" | "loan_repayment" | "agent_salary" | "expense" | "other_income">().notNull(),
  paymentMethod: text("payment_method").$type<"cash" | "bank_transfer" | "google_pay" | "phone_pay" | "online_portal">().default("cash"),
  description: text("description"),
  interestRate: decimal("interest_rate", { precision: 5, scale: 2 }),
  lenderName: text("lender_name"),
  agentId: integer("agent_id").references(() => users.id),
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  documentUrl: text("document_url"),
  gstEligible: boolean("gst_eligible").default(false),
  hsn: text("hsn"), // HSN/SAC code for GST
  gstRate: decimal("gst_rate", { precision: 5, scale: 2 }),
  gstAmount: decimal("gst_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
});

// Add schema for the financial transactions
export const insertFinancialTransactionSchema = createInsertSchema(financialTransactions).extend({
  amount: z.string().or(z.number()).transform(String),
  interestRate: z.string().or(z.number()).optional().transform(val => val ? String(val) : undefined),
  gstRate: z.string().or(z.number()).optional().transform(val => val ? String(val) : undefined),
  gstAmount: z.string().or(z.number()).optional().transform(val => val ? String(val) : undefined),
});

// Export types for the financial transactions
export type FinancialTransaction = typeof financialTransactions.$inferSelect;
export type InsertFinancialTransaction = z.infer<typeof insertFinancialTransactionSchema>;

// Export types for the new tables
export type AccountsReceivable = typeof accountsReceivable.$inferSelect;
export type InsertAccountsReceivable = z.infer<typeof insertAccountsReceivableSchema>;
export type AccountsPayable = typeof accountsPayable.$inferSelect;
export type InsertAccountsPayable = z.infer<typeof insertAccountsPayableSchema>;