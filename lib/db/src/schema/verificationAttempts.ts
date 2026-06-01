import { pgTable, text, integer, timestamp, boolean, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verificationAttemptsTable = pgTable("verification_attempts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  tier: integer("tier").notNull(),
  riskScore: integer("risk_score").notNull(),
  status: text("status").notNull().default("started"), // started | captcha_failed | questionnaire_failed | challenge_failed | pending_review | completed | expired
  captchaPassed: boolean("captcha_passed"),
  questionnairePassed: boolean("questionnaire_passed"),
  questionnaireResponses: text("questionnaire_responses"), // JSON string
  challengePassed: boolean("challenge_passed"),
  challengeType: text("challenge_type"),
  failureReason: text("failure_reason"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const insertVerificationAttemptSchema = createInsertSchema(verificationAttemptsTable).omit({ id: true, startedAt: true });
export type InsertVerificationAttempt = z.infer<typeof insertVerificationAttemptSchema>;
export type VerificationAttempt = typeof verificationAttemptsTable.$inferSelect;
