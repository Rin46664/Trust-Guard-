import { db, verifiedUsersTable, verificationAttemptsTable, verificationLogsTable, staffReviewsTable, guildConfigTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import type { RiskAssessment } from "./riskScoring";
import type { VerifiedUser, VerificationAttempt, VerificationLog, StaffReview, GuildConfig } from "@workspace/db";
import { logger } from "../../lib/logger";

export type { VerifiedUser, VerificationAttempt, VerificationLog, StaffReview, GuildConfig };

// ── Guild Config ─────────────────────────────────────────────────────────────

export async function getGuildConfig(guildId: string): Promise<GuildConfig | null> {
  const rows = await db.select().from(guildConfigTable).where(eq(guildConfigTable.guildId, guildId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertGuildConfig(guildId: string, patch: Partial<Omit<GuildConfig, "guildId" | "createdAt" | "updatedAt">>) {
  await db
    .insert(guildConfigTable)
    .values({ guildId, ...patch })
    .onConflictDoUpdate({ target: guildConfigTable.guildId, set: patch });
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function upsertUser(member: GuildMember, assessment: RiskAssessment): Promise<VerifiedUser> {
  const id = `${member.id}:${member.guild.id}`;
  const accountCreatedAt = new Date(Number((BigInt(member.id) >> 22n) + 1420070400000n));

  const values = {
    id,
    userId: member.id,
    guildId: member.guild.id,
    username: member.user.username,
    displayName: member.displayName !== member.user.username ? member.displayName : null,
    avatarUrl: member.user.avatarURL({ size: 256 }) ?? null,
    accountCreatedAt,
    joinedAt: member.joinedAt ?? new Date(),
    riskScore: assessment.score,
    verificationTier: assessment.tier,
    status: "pending" as const,
    hasAvatar: assessment.hasAvatar,
    hasBanner: assessment.hasBanner,
  };

  await db
    .insert(verifiedUsersTable)
    .values(values)
    .onConflictDoUpdate({
      target: verifiedUsersTable.id,
      set: {
        username: values.username,
        displayName: values.displayName,
        avatarUrl: values.avatarUrl,
        riskScore: values.riskScore,
        verificationTier: values.verificationTier,
        hasAvatar: values.hasAvatar,
        hasBanner: values.hasBanner,
        joinedAt: values.joinedAt,
      },
    });

  const rows = await db.select().from(verifiedUsersTable).where(eq(verifiedUsersTable.id, id)).limit(1);
  return rows[0]!;
}

export async function updateUserStatus(
  userId: string,
  guildId: string,
  status: string,
  verifiedAt?: Date
) {
  const id = `${userId}:${guildId}`;
  await db
    .update(verifiedUsersTable)
    .set({ status, verifiedAt: verifiedAt ?? null })
    .where(eq(verifiedUsersTable.id, id));
}

export async function incrementUserAttempts(userId: string, guildId: string) {
  const id = `${userId}:${guildId}`;
  const rows = await db.select({ count: verifiedUsersTable.attemptCount }).from(verifiedUsersTable).where(eq(verifiedUsersTable.id, id)).limit(1);
  const current = rows[0]?.count ?? 0;
  await db.update(verifiedUsersTable).set({ attemptCount: current + 1 }).where(eq(verifiedUsersTable.id, id));
}

export async function getUser(userId: string, guildId: string): Promise<VerifiedUser | null> {
  const id = `${userId}:${guildId}`;
  const rows = await db.select().from(verifiedUsersTable).where(eq(verifiedUsersTable.id, id)).limit(1);
  return rows[0] ?? null;
}

// ── Attempts ──────────────────────────────────────────────────────────────────

export async function createAttempt(userId: string, guildId: string, tier: number, riskScore: number): Promise<VerificationAttempt> {
  const rows = await db
    .insert(verificationAttemptsTable)
    .values({ userId, guildId, tier, riskScore, status: "started" })
    .returning();
  return rows[0]!;
}

export async function updateAttempt(id: number, patch: Partial<Omit<VerificationAttempt, "id" | "startedAt">>) {
  await db.update(verificationAttemptsTable).set(patch).where(eq(verificationAttemptsTable.id, id));
}

export async function getAttempts(userId: string, guildId: string): Promise<VerificationAttempt[]> {
  return db
    .select()
    .from(verificationAttemptsTable)
    .where(and(eq(verificationAttemptsTable.userId, userId), eq(verificationAttemptsTable.guildId, guildId)))
    .orderBy(desc(verificationAttemptsTable.startedAt))
    .limit(10);
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function addLog(
  userId: string,
  guildId: string,
  username: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  try {
    await db.insert(verificationLogsTable).values({
      userId,
      guildId,
      username,
      eventType,
      metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch (err) {
    logger.error({ err, eventType }, "Failed to write verification log");
  }
}

// ── Staff Reviews ─────────────────────────────────────────────────────────────

export async function createStaffReview(
  userId: string,
  guildId: string,
  username: string,
  displayName: string | null,
  avatarUrl: string | null,
  riskScore: number,
  tier: number,
  attemptId: number,
  questionnaireResponses?: Record<string, string>
): Promise<StaffReview> {
  const rows = await db
    .insert(staffReviewsTable)
    .values({
      userId,
      guildId,
      username,
      displayName,
      avatarUrl,
      riskScore,
      tier,
      attemptId,
      status: "pending",
      questionnaireResponses: questionnaireResponses ? JSON.stringify(questionnaireResponses) : null,
    })
    .returning();
  return rows[0]!;
}

export async function resolveStaffReview(id: number, status: "approved" | "denied", staffNotes?: string) {
  await db
    .update(staffReviewsTable)
    .set({ status, staffNotes: staffNotes ?? null, resolvedAt: new Date() })
    .where(eq(staffReviewsTable.id, id));
}

export async function getPendingReview(userId: string, guildId: string): Promise<StaffReview | null> {
  const rows = await db
    .select()
    .from(staffReviewsTable)
    .where(and(eq(staffReviewsTable.userId, userId), eq(staffReviewsTable.guildId, guildId), eq(staffReviewsTable.status, "pending")))
    .limit(1);
  return rows[0] ?? null;
}
