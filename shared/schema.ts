import { pgTable, text, serial, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
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
});

export const chitFunds = pgTable("chit_funds", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  duration: integer("duration").notNull(), // in months
  memberCount: integer("member_count").notNull(),
  agentCommission: decimal("agent_commission", { precision: 10, scale: 2 }).notNull(),
  status: text("status", { enum: ["active", "completed"] }).notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  chitFundId: integer("chit_fund_id").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentType: text("payment_type", { enum: ["monthly", "bonus"] }).notNull(),
});

export const insertUserSchema = createInsertSchema(users);
export const insertChitFundSchema = createInsertSchema(chitFunds);
export const insertPaymentSchema = createInsertSchema(payments);

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type ChitFund = typeof chitFunds.$inferSelect;
export type InsertChitFund = z.infer<typeof insertChitFundSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
