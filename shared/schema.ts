import { pgTable, text, serial, integer, decimal, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role", { enum: ["admin", "agent", "member"] }).notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  pincode: text("pincode"),
  fundPreferences: text("fund_preferences"),
  agentId: integer("agent_id"),
  agentCommission: decimal("agent_commission", { precision: 10, scale: 2 }),
  status: text("status", { enum: ["active", "inactive"] }).default("active").notNull(),
});

export const chitFunds = pgTable("chit_funds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(),
  memberCount: integer("member_count").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  status: text("status", { enum: ["active", "completed", "closed"] }).notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  chitFundId: integer("chit_fund_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentType: text("payment_type", { enum: ["monthly", "bonus"] }).notNull(),
  paymentMethod: text("payment_method", { enum: ["cash", "google_pay", "phone_pay", "online_portal"] }).notNull(),
  recordedBy: integer("recorded_by").notNull(),
  notes: text("notes"),
  paymentDate: timestamp("payment_date").notNull(), 
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const fundMembers = pgTable("fund_members", {
  fundId: integer("fund_id").notNull(),
  userId: integer("user_id").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.fundId, table.userId] }),
}));

export const insertUserSchema = createInsertSchema(users);
export const insertChitFundSchema = createInsertSchema(chitFunds);
export const insertPaymentSchema = createInsertSchema(payments);
export const insertFundMemberSchema = createInsertSchema(fundMembers);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ChitFund = typeof chitFunds.$inferSelect;
export type InsertChitFund = z.infer<typeof insertChitFundSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type FundMember = typeof fundMembers.$inferSelect;
export type InsertFundMember = z.infer<typeof insertFundMemberSchema>;