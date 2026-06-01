import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const staffReviewsTable = pgTable("staff_reviews", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  riskScore: integer("risk_score").notNull(),
  tier: integer("tier").notNull(),
  questionnaireResponses: text("questionnaire_responses"), // JSON string
  attemptId: integer("attempt_id"),
  status: text("status").notNull().default("pending"), // pending | approved | denied
  assignedTo: text("assigned_to"),
  staffNotes: text("staff_notes"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStaffReviewSchema = createInsertSchema(staffReviewsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStaffReview = z.infer<typeof insertStaffReviewSchema>;
export type StaffReview = typeof staffReviewsTable.$inferSelect;
