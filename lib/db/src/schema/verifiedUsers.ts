import { pgTable, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const verifiedUsersTable = pgTable("verified_users", {
  id: text("id").primaryKey(), // discord user_id:guild_id composite key
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  username: text("username").notNull(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  accountCreatedAt: timestamp("account_created_at", { withTimezone: true }).notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  verificationTier: integer("verification_tier").notNull().default(1),
  status: text("status").notNull().default("pending"), // pending | verified | failed | review | banned
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  hasAvatar: boolean("has_avatar").notNull().default(false),
  hasBanner: boolean("has_banner").notNull().default(false),
  attemptCount: integer("attempt_count").notNull().default(0),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVerifiedUserSchema = createInsertSchema(verifiedUsersTable).omit({ createdAt: true, updatedAt: true });
export type InsertVerifiedUser = z.infer<typeof insertVerifiedUserSchema>;
export type VerifiedUser = typeof verifiedUsersTable.$inferSelect;
