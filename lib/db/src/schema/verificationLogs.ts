import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verificationLogsTable = pgTable("verification_logs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  username: text("username").notNull(),
  eventType: text("event_type").notNull(), // joined | started | captcha_passed | captcha_failed | questionnaire_passed | questionnaire_failed | challenge_passed | challenge_failed | verified | failed | review_requested | review_approved | review_denied | cooldown_applied | rate_limited
  metadata: text("metadata"), // JSON string with extra context
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVerificationLogSchema = createInsertSchema(verificationLogsTable).omit({ id: true, createdAt: true });
export type InsertVerificationLog = z.infer<typeof insertVerificationLogSchema>;
export type VerificationLog = typeof verificationLogsTable.$inferSelect;
