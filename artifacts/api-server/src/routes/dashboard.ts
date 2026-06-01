import { Router } from "express";
import { db, verifiedUsersTable, verificationAttemptsTable, verificationLogsTable, staffReviewsTable } from "@workspace/db";
import { eq, and, like, or, desc, count, sql } from "drizzle-orm";
import { resolveStaffReview, getUser, updateUserStatus, addLog } from "../bot/lib/db";
import { assignVerifiedRole } from "../bot/lib/verification";
import client from "../bot/client";
import type { GuildMember } from "discord.js";

const router = Router();

// GET /api/dashboard/stats
router.get("/stats", async (req, res) => {
  const guildId = process.env["DISCORD_GUILD_ID"]!;

  const [totalVerified] = await db
    .select({ count: count() })
    .from(verifiedUsersTable)
    .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.status, "verified")));

  const [totalFailed] = await db
    .select({ count: count() })
    .from(verifiedUsersTable)
    .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.status, "failed")));

  const [pendingReviews] = await db
    .select({ count: count() })
    .from(staffReviewsTable)
    .where(and(eq(staffReviewsTable.guildId, guildId), eq(staffReviewsTable.status, "pending")));

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [dailyJoins] = await db
    .select({ count: count() })
    .from(verifiedUsersTable)
    .where(and(eq(verifiedUsersTable.guildId, guildId), sql`${verifiedUsersTable.createdAt} >= ${oneDayAgo}`));

  // Risk distribution by tier
  const tierRows = await db
    .select({ tier: verifiedUsersTable.verificationTier, count: count() })
    .from(verifiedUsersTable)
    .where(eq(verifiedUsersTable.guildId, guildId))
    .groupBy(verifiedUsersTable.verificationTier);

  const tierMap: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
  for (const row of tierRows) {
    tierMap[String(row.tier)] = row.count;
  }

  const recentLogs = await db
    .select()
    .from(verificationLogsTable)
    .where(eq(verificationLogsTable.guildId, guildId))
    .orderBy(desc(verificationLogsTable.createdAt))
    .limit(10);

  res.json({
    totalVerified: totalVerified?.count ?? 0,
    totalFailed: totalFailed?.count ?? 0,
    pendingReviews: pendingReviews?.count ?? 0,
    dailyJoins: dailyJoins?.count ?? 0,
    riskDistribution: {
      tier1: tierMap["1"],
      tier2: tierMap["2"],
      tier3: tierMap["3"],
      tier4: tierMap["4"],
      tier5: tierMap["5"],
      tier6: tierMap["6"],
    },
    recentActivity: recentLogs,
  });
});

// GET /api/dashboard/users
router.get("/users", async (req, res) => {
  const guildId = process.env["DISCORD_GUILD_ID"]!;
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
  const offset = (page - 1) * limit;
  const search = req.query["search"] as string | undefined;
  const status = req.query["status"] as string | undefined;
  const tier = req.query["tier"] ? Number(req.query["tier"]) : undefined;

  const conditions = [eq(verifiedUsersTable.guildId, guildId)];
  if (status) conditions.push(eq(verifiedUsersTable.status, status));
  if (tier) conditions.push(eq(verifiedUsersTable.verificationTier, tier));
  if (search) {
    conditions.push(
      or(
        like(verifiedUsersTable.username, `%${search}%`),
        like(verifiedUsersTable.userId, `%${search}%`)
      )!
    );
  }

  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(verifiedUsersTable).where(where);
  const users = await db
    .select()
    .from(verifiedUsersTable)
    .where(where)
    .orderBy(desc(verifiedUsersTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    users,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

// GET /api/dashboard/users/:userId
router.get("/users/:userId", async (req, res) => {
  const guildId = process.env["DISCORD_GUILD_ID"]!;
  const { userId } = req.params;

  const user = await getUser(userId!, guildId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const attempts = await db
    .select()
    .from(verificationAttemptsTable)
    .where(and(eq(verificationAttemptsTable.userId, userId!), eq(verificationAttemptsTable.guildId, guildId)))
    .orderBy(desc(verificationAttemptsTable.startedAt))
    .limit(20);

  const logs = await db
    .select()
    .from(verificationLogsTable)
    .where(and(eq(verificationLogsTable.userId, userId!), eq(verificationLogsTable.guildId, guildId)))
    .orderBy(desc(verificationLogsTable.createdAt))
    .limit(30);

  res.json({ user, attempts, logs });
});

// GET /api/dashboard/reviews
router.get("/reviews", async (req, res) => {
  const guildId = process.env["DISCORD_GUILD_ID"]!;
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
  const offset = (page - 1) * limit;

  const where = and(eq(staffReviewsTable.guildId, guildId), eq(staffReviewsTable.status, "pending"));
  const [{ total }] = await db.select({ total: count() }).from(staffReviewsTable).where(where);
  const reviews = await db
    .select()
    .from(staffReviewsTable)
    .where(where)
    .orderBy(desc(staffReviewsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ reviews, total, page, totalPages: Math.ceil(total / limit) });
});

// POST /api/dashboard/reviews/:id/approve
router.post("/reviews/:id/approve", async (req, res) => {
  const id = Number(req.params["id"]);
  const notes = req.body?.notes as string | undefined;
  const guildId = process.env["DISCORD_GUILD_ID"]!;

  const [review] = await db.select().from(staffReviewsTable).where(eq(staffReviewsTable.id, id)).limit(1);
  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  await resolveStaffReview(id, "approved", notes);
  await updateUserStatus(review.userId, guildId, "verified", new Date());
  await addLog(review.userId, guildId, review.username, "review_approved", { reviewId: id, notes });

  // Try to assign the role via Discord
  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(review.userId) as GuildMember;
    await assignVerifiedRole(member);
  } catch (err) {
    req.log.warn({ err }, "Could not assign role after review approval");
  }

  res.json({ success: true, message: "Review approved and user verified" });
});

// POST /api/dashboard/reviews/:id/deny
router.post("/reviews/:id/deny", async (req, res) => {
  const id = Number(req.params["id"]);
  const notes = req.body?.notes as string | undefined;
  const guildId = process.env["DISCORD_GUILD_ID"]!;

  const [review] = await db.select().from(staffReviewsTable).where(eq(staffReviewsTable.id, id)).limit(1);
  if (!review) {
    res.status(404).json({ error: "Review not found" });
    return;
  }

  await resolveStaffReview(id, "denied", notes);
  await updateUserStatus(review.userId, guildId, "failed");
  await addLog(review.userId, guildId, review.username, "review_denied", { reviewId: id, notes });

  res.json({ success: true, message: "Review denied" });
});

// GET /api/dashboard/logs
router.get("/logs", async (req, res) => {
  const guildId = process.env["DISCORD_GUILD_ID"]!;
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query["limit"]) || 50));
  const offset = (page - 1) * limit;
  const userId = req.query["userId"] as string | undefined;
  const eventType = req.query["eventType"] as string | undefined;

  const conditions = [eq(verificationLogsTable.guildId, guildId)];
  if (userId) conditions.push(eq(verificationLogsTable.userId, userId));
  if (eventType) conditions.push(eq(verificationLogsTable.eventType, eventType));
  const where = and(...conditions);

  const [{ total }] = await db.select({ total: count() }).from(verificationLogsTable).where(where);
  const logs = await db
    .select()
    .from(verificationLogsTable)
    .where(where)
    .orderBy(desc(verificationLogsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ logs, total, page, totalPages: Math.ceil(total / limit) });
});

export default router;
