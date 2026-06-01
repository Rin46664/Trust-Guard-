import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guildConfigTable = pgTable("guild_config", {
  guildId: text("guild_id").primaryKey(),
  verifiedRoleId: text("verified_role_id"),
  verificationChannelId: text("verification_channel_id"),
  logChannelId: text("log_channel_id"),
  welcomeChannelId: text("welcome_channel_id"),
  staffRoleId: text("staff_role_id"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGuildConfigSchema = createInsertSchema(guildConfigTable).omit({ createdAt: true, updatedAt: true });
export type InsertGuildConfig = z.infer<typeof insertGuildConfigSchema>;
export type GuildConfig = typeof guildConfigTable.$inferSelect;
