import { pgTable, text, serial, integer, decimal, timestamp, primaryKey, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Type declaration to avoid circular reference
type UserTable = typeof users;

// User table with fixed TypeScript issues and proper constraints
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
  agentId: integer("agent_id").references(() => users.id, { onDelete: 'set null' }),
  agentCommission: decimal("agent_commission", { precision: 5, scale: 2 }),
  status: text("status").$type<"active" | "inactive">().default("active").notNull(),
});

// Define user relations with proper return types
export const usersRelations = relations(users, ({ many, one }): { 
  managedFunds: ReturnType<typeof many<typeof chitFunds>>;
  payments: ReturnType<typeof many<typeof payments>>;
  fundMemberships: ReturnType<typeof many<typeof fundMembers>>;
  agent: ReturnType<typeof one<typeof users>>;
} => ({
  managedFunds: many(chitFunds),
  payments: many(payments),
  fundMemberships: many(fundMembers),
  agent: one(users, {
    fields: [users.agentId],
    references: [users.id],
  }),
}));

export const chitFunds = pgTable("chit_funds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  memberCount: integer("member_count").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status").$type<"active" | "completed" | "closed">().notNull(),
});

// Define chit fund relations
export const chitFundsRelations = relations(chitFunds, ({ many }) => ({
  payments: many(payments),
  members: many(fundMembers),
}));

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  chitFundId: integer("chit_fund_id").notNull().references(() => chitFunds.id, { onDelete: 'cascade' }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentType: text("payment_type").$type<"monthly" | "bonus">().notNull(),
  paymentMethod: text("payment_method").$type<"cash" | "google_pay" | "phone_pay" | "online_portal">().notNull(),
  recordedBy: integer("recorded_by").notNull().references(() => users.id),
  notes: text("notes"),
  paymentDate: timestamp("payment_date").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Define payment relations
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

export const fundMembers = pgTable("fund_members", {
  fundId: integer("fund_id").notNull().references(() => chitFunds.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.fundId, table.userId] }),
}));

// Define fund member relations
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
});

export const insertPaymentSchema = createInsertSchema(payments).extend({
  paymentDate: z.coerce.date(),
  amount: z.string().or(z.number()).transform(String),
});

export const insertFundMemberSchema = createInsertSchema(fundMembers);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ChitFund = typeof chitFunds.$inferSelect;
export type InsertChitFund = z.infer<typeof insertChitFundSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type FundMember = typeof fundMembers.$inferSelect;
export type InsertFundMember = z.infer<typeof insertFundMemberSchema>;

// Add notification schema
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

// Add notification insert schema
export const insertNotificationSchema = createInsertSchema(notifications);
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;