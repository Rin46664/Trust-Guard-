import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  AttachmentBuilder,
  type GuildMember,
} from "discord.js";
import type { Command } from "../client";
import { assessRisk, getTierColor, getTierLabel } from "../lib/riskScoring";
import type { RiskTier } from "../lib/riskScoring";
import { generateCaptcha } from "../lib/captcha";
import { getUser, updateUserStatus, getAttempts, getGuildConfig } from "../lib/db";
import { getSession, clearSession, clearAllSessions, assignVerifiedRole } from "../lib/verification";
import { generateVerificationCard } from "../lib/verificationCard";
import { logError, makeErrorEmbed } from "../lib/channelLogger";
import {
  db,
  verifiedUsersTable,
  verificationAttemptsTable,
  verificationLogsTable,
  staffReviewsTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";

const TIER_FLOW: Record<number, string> = {
  1: "Click Verify → ✅ Instant access",
  2: "Click Verify → 🧩 Captcha → ✅ Done",
  3: "Click Verify → 🧩 Captcha → 📝 Questionnaire → ✅ Done",
  4: "Click Verify → 🧩 Captcha → 📝 Questionnaire → 🎯 Challenge → ✅ Done",
  5: "Click Verify → 🧩 Captcha → 📝 Questionnaire → 🎯 Challenge → 👤 Staff review",
  6: "Click Verify → 🧩 Captcha → 📝 Questionnaire → 🎯 Challenge → ⚠️ Mandatory staff review",
};

const TIER_STEPS: Record<number, string> = {
  1: "1. Click Verify button",
  2: "1. Click Verify\n2. Solve captcha",
  3: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire",
  4: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. Solve final challenge",
  5: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. Solve final challenge\n5. Wait for staff review",
  6: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. Solve final challenge\n5. Mandatory staff review",
};

function snowflakeToDate(userId: string): Date {
  return new Date(Number((BigInt(userId) >> 22n) + 1420070400000n));
}

const dev: Command = {
  data: new SlashCommandBuilder()
    .setName("dev")
    .setDescription("Developer testing tools for Trust Guard")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName("ping").setDescription("Bot latency, uptime, and database response time")
    )
    .addSubcommand(sub =>
      sub.setName("verify-test")
        .setDescription("Run a live risk assessment on a user without affecting their status")
        .addUserOption(opt => opt.setName("user").setDescription("User to assess").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("simulate-tier")
        .setDescription("Show what verification flow a specific tier looks like")
        .addUserOption(opt => opt.setName("user").setDescription("Target user").setRequired(true))
        .addIntegerOption(opt =>
          opt.setName("tier").setDescription("Tier 1–6").setRequired(true)
            .addChoices(
              { name: "Tier 1 — Instant", value: 1 },
              { name: "Tier 2 — Captcha", value: 2 },
              { name: "Tier 3 — Captcha + Questionnaire", value: 3 },
              { name: "Tier 4 — Full flow", value: 4 },
              { name: "Tier 5 — Full + Staff review", value: 5 },
              { name: "Tier 6 — Mandatory review", value: 6 },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("risk-check")
        .setDescription("Full risk factor breakdown for a user")
        .addUserOption(opt => opt.setName("user").setDescription("User to inspect").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("Clear a user's verification state and set status back to pending")
        .addUserOption(opt => opt.setName("user").setDescription("User to reset").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("force-verify")
        .setDescription("Instantly grant the verified role to a user")
        .addUserOption(opt => opt.setName("user").setDescription("User to verify").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("force-deny")
        .setDescription("Revoke verification and reset user status")
        .addUserOption(opt => opt.setName("user").setDescription("User to deny").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("session")
        .setDescription("Show the active in-memory verification session for a user")
        .addUserOption(opt => opt.setName("user").setDescription("User to inspect").setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName("test-captcha")
        .setDescription("Generate and display a test captcha challenge with the answer revealed")
        .addIntegerOption(opt =>
          opt.setName("tier").setDescription("Tier to generate for (affects difficulty, default: 3)")
            .addChoices(
              { name: "Tier 2 — Easy", value: 2 },
              { name: "Tier 3 — Medium", value: 3 },
              { name: "Tier 4 — Hard", value: 4 },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("test-card")
        .setDescription("Generate a test verification card for yourself")
        .addIntegerOption(opt =>
          opt.setName("tier").setDescription("Tier for the card (default: 1)")
            .addChoices(
              { name: "Tier 1 — Trusted", value: 1 },
              { name: "Tier 2 — Normal", value: 2 },
              { name: "Tier 3 — Newer", value: 3 },
              { name: "Tier 4 — High Risk", value: 4 },
              { name: "Tier 5 — Extreme", value: 5 },
              { name: "Tier 6 — Fresh", value: 6 },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("clear-sessions")
        .setDescription("Wipe all active in-memory verification sessions")
    )
    .addSubcommand(sub =>
      sub.setName("db-stats")
        .setDescription("Show row counts for all Trust Guard database tables")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    await interaction.deferReply({ ephemeral: true });

    try {
      switch (sub) {

        case "ping": {
          const wsLatency = interaction.client.ws.ping;
          const dbStart = Date.now();
          await db.select({ n: count() }).from(verifiedUsersTable);
          const dbMs = Date.now() - dbStart;

          const uptime = process.uptime();
          const h = Math.floor(uptime / 3600);
          const m = Math.floor((uptime % 3600) / 60);
          const s = Math.floor(uptime % 60);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🏓 Trust Guard — Ping")
                .setColor(0x57f287)
                .addFields(
                  { name: "🌐 WebSocket", value: `\`${wsLatency}ms\``, inline: true },
                  { name: "🗄️ Database", value: `\`${dbMs}ms\``, inline: true },
                  { name: "⏱️ Uptime", value: `\`${h}h ${m}m ${s}s\``, inline: true },
                  { name: "📦 Node.js", value: `\`${process.version}\``, inline: true },
                  { name: "🏠 Guild", value: `\`${guildId}\``, inline: true },
                  { name: "🤖 Tag", value: `\`${interaction.client.user.tag}\``, inline: true },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "verify-test": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          if (!target) { await interaction.editReply("❌ Member not found in this server."); return; }

          const a = assessRisk(target);
          const dbRecord = await getUser(target.id, guildId);
          const ageDays = Math.floor((Date.now() - snowflakeToDate(target.id).getTime()) / 86400000);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔬 Verify-Test — Risk Assessment")
                .setDescription(`Live assessment for <@${target.id}> (read-only — no DB changes)`)
                .setColor(getTierColor(a.tier))
                .setThumbnail(target.user.displayAvatarURL({ size: 128 }))
                .addFields(
                  { name: "🎯 Risk Tier", value: `**Tier ${a.tier}** — ${getTierLabel(a.tier)}`, inline: true },
                  { name: "⚠️ Risk Score", value: `**${a.score}** / 100`, inline: true },
                  { name: "✅ Trust Score", value: `**${100 - a.score}** / 100`, inline: true },
                  { name: "📅 Account Age", value: `${ageDays} days`, inline: true },
                  { name: "🖼️ Avatar", value: a.hasAvatar ? "✅ Yes" : "❌ No", inline: true },
                  { name: "🏷️ Banner", value: a.hasBanner ? "✅ Yes" : "❌ No", inline: true },
                  { name: "🔍 Verification Flow", value: TIER_FLOW[a.tier] ?? "Unknown", inline: false },
                  { name: "🚩 Risk Signals", value: a.signals.length ? a.signals.map(s => `• ${s}`).join("\n") : "✅ None — clean profile", inline: false },
                  { name: "💾 DB Status", value: dbRecord ? `\`${dbRecord.status}\` — ${dbRecord.attemptCount ?? 0} attempt(s)` : "Not in database yet", inline: false },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "simulate-tier": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          const tier = interaction.options.getInteger("tier", true) as RiskTier;
          if (!target) { await interaction.editReply("❌ Member not found."); return; }

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle(`🎭 Simulate Tier ${tier} — ${getTierLabel(tier)}`)
                .setDescription(`What <@${target.id}> would experience if assigned **Tier ${tier}**`)
                .setColor(getTierColor(tier))
                .addFields(
                  { name: "🔄 Verification Flow", value: TIER_FLOW[tier] ?? "Unknown", inline: false },
                  { name: "📋 Steps", value: TIER_STEPS[tier] ?? "Unknown", inline: false },
                  { name: "✅ Auto-verified", value: tier <= 4 ? "Yes" : "No — needs staff", inline: true },
                  { name: "👤 Staff Review", value: tier >= 5 ? "Required" : "Not needed", inline: true },
                  { name: "⚠️ Mandatory Wait", value: tier === 6 ? "Yes (24h min)" : "No", inline: true },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "risk-check": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          if (!target) { await interaction.editReply("❌ Member not found."); return; }

          const a = assessRisk(target);
          const created = snowflakeToDate(target.id);
          const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
          const ageScore = ageDays >= 365 * 5 ? 0 : ageDays >= 365 * 3 ? 10 : ageDays >= 365 ? 25 : ageDays >= 30 ? 45 : ageDays >= 7 ? 65 : ageDays >= 1 ? 80 : 95;
          const signalBonus = Math.max(0, a.score - ageScore);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔍 Risk Factor Breakdown")
                .setDescription(`Detailed analysis for <@${target.id}>`)
                .setColor(getTierColor(a.tier))
                .setThumbnail(target.user.displayAvatarURL({ size: 128 }))
                .addFields(
                  { name: "📊 Final Result", value: `Risk: **${a.score}**/100 | Trust: **${100 - a.score}**/100 | Tier: **${a.tier}**`, inline: false },
                  { name: "🕐 Age Contribution", value: `${ageDays} days → +${ageScore} risk`, inline: true },
                  { name: "🚩 Signal Bonus", value: `+${signalBonus} from ${a.signals.length} signal(s)`, inline: true },
                  { name: "🖼️ Avatar", value: a.hasAvatar ? "✅ Has avatar" : "❌ No avatar (+8 risk)", inline: true },
                  { name: "🏷️ Banner", value: a.hasBanner ? "✅ Has banner" : "❌ No banner (+3 risk)", inline: true },
                  { name: "📅 Account Created", value: `<t:${Math.floor(created.getTime() / 1000)}:D>`, inline: true },
                  { name: "🆔 User ID", value: `\`${target.id}\``, inline: true },
                  { name: "🚩 Signals Triggered", value: a.signals.length ? a.signals.map(s => `\`${s}\``).join("\n") : "✅ None — clean profile", inline: false },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "reset": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          if (!target) { await interaction.editReply("❌ Member not found."); return; }

          clearSession(target.id, guildId);
          const existed = await getUser(target.id, guildId);
          if (existed) await updateUserStatus(target.id, guildId, "pending");

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔄 User Reset")
                .setDescription(`<@${target.id}>'s verification state has been cleared.`)
                .setColor(0xfee75c)
                .addFields(
                  { name: "User", value: `@${target.user.username}`, inline: true },
                  { name: "Session", value: "✅ Cleared", inline: true },
                  { name: "DB Status", value: existed ? "→ `pending`" : "Not in DB", inline: true },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "force-verify": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          if (!target) { await interaction.editReply("❌ Member not found."); return; }

          const success = await assignVerifiedRole(target);
          if (success) await updateUserStatus(target.id, guildId, "verified", new Date());

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle(success ? "✅ Force Verified" : "❌ Force Verify Failed")
                .setDescription(
                  success
                    ? `<@${target.id}> has been verified and granted the verified role.`
                    : `Failed to assign role to <@${target.id}>. Make sure a verified role is configured with \`/config verified-role\`.`
                )
                .setColor(success ? 0x57f287 : 0xed4245)
                .addFields(
                  { name: "User", value: `@${target.user.username}`, inline: true },
                  { name: "Role Assigned", value: success ? "✅ Yes" : "❌ No", inline: true },
                  { name: "DB Updated", value: success ? "✅ Yes" : "—", inline: true },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "force-deny": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          if (!target) { await interaction.editReply("❌ Member not found."); return; }

          const cfg = await getGuildConfig(guildId);
          const roleId = cfg?.verifiedRoleId;
          let roleRemoved = false;
          if (roleId && target.roles.cache.has(roleId)) {
            try {
              await target.roles.remove(roleId, "Force deny by admin");
              roleRemoved = true;
            } catch { /* role removal failed */ }
          }

          clearSession(target.id, guildId);
          await updateUserStatus(target.id, guildId, "pending");

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🚫 Force Denied")
                .setDescription(`<@${target.id}>'s verification has been revoked.`)
                .setColor(0xed4245)
                .addFields(
                  { name: "User", value: `@${target.user.username}`, inline: true },
                  { name: "Role Removed", value: roleRemoved ? "✅ Yes" : "⚠️ Not held", inline: true },
                  { name: "Status Reset", value: "→ `pending`", inline: true },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "session": {
          const target = interaction.options.getMember("user") as GuildMember | null;
          if (!target) { await interaction.editReply("❌ Member not found."); return; }

          const session = getSession(target.id, guildId);

          if (!session) {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setTitle("🔍 Session Info")
                  .setDescription(`No active session found for <@${target.id}>.`)
                  .setColor(0x99aab5)
                  .setTimestamp()
              ]
            });
            return;
          }

          const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔍 Active Session")
                .setDescription(`In-memory session for <@${target.id}>`)
                .setColor(0xfee75c)
                .addFields(
                  { name: "Step", value: `\`${session.step}\``, inline: true },
                  { name: "Tier", value: `Tier ${session.tier}`, inline: true },
                  { name: "Attempt ID", value: `\`${session.attemptId}\``, inline: true },
                  { name: "Captcha Passed", value: session.captchaPassed ? "✅ Yes" : "❌ No", inline: true },
                  { name: "Captcha Type", value: session.captcha?.type ?? "—", inline: true },
                  { name: "Elapsed", value: `${elapsed}s`, inline: true },
                )
                .setTimestamp()
            ]
          });
          break;
        }

        case "test-captcha": {
          const tier = (interaction.options.getInteger("tier") ?? 3) as RiskTier;
          const captcha = generateCaptcha(tier);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🧪 Test Captcha")
                .setColor(0x5865f2)
                .addFields(
                  { name: "Type", value: `\`${captcha.type}\``, inline: true },
                  { name: "Tier", value: `${tier}`, inline: true },
                  { name: "❓ Question", value: `**${captcha.question}**`, inline: false },
                  { name: "✅ Answer (dev only)", value: `||\`${captcha.answer}\`||`, inline: false },
                )
                .setFooter({ text: "Answer shown for testing purposes only." })
                .setTimestamp()
            ]
          });
          break;
        }

        case "test-card": {
          const tier = (interaction.options.getInteger("tier") ?? 1) as RiskTier;
          const member = interaction.member as GuildMember;
          const riskScore = [0, 15, 30, 50, 70, 90][tier - 1]!;
          const accountCreatedAt = snowflakeToDate(member.id);

          try {
            const buf = await generateVerificationCard({
              username: member.user.username,
              displayName: member.displayName !== member.user.username ? member.displayName : null,
              userId: member.id,
              avatarUrl: member.user.avatarURL({ size: 256 }) ?? null,
              accountCreatedAt,
              joinedAt: member.joinedAt ?? new Date(),
              riskScore,
              tier,
              verifiedAt: new Date(),
            });
            await interaction.editReply({
              content: `🧪 Test card for **Tier ${tier} — ${getTierLabel(tier)}**`,
              files: [new AttachmentBuilder(buf, { name: "test-card.png" })],
            });
          } catch (err) {
            logError(guildId, makeErrorEmbed("Test Card Failed", err, [{ name: "Tier", value: String(tier) }]));
            await interaction.editReply("❌ Card generation failed. Check error-logs channel.");
          }
          break;
        }

        case "clear-sessions": {
          const cleared = clearAllSessions();
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("🧹 Sessions Cleared")
                .setDescription("All active verification sessions have been wiped from memory.")
                .setColor(0xfee75c)
                .addFields({ name: "Cleared", value: `\`${cleared}\` session(s)`, inline: true })
                .setTimestamp()
            ]
          });
          break;
        }

        case "db-stats": {
          const [[users], [verified], [pending], [inReview], [attempts], [logs], [staffTotal], [staffPending]] = await Promise.all([
            db.select({ c: count() }).from(verifiedUsersTable),
            db.select({ c: count() }).from(verifiedUsersTable).where(eq(verifiedUsersTable.status, "verified")),
            db.select({ c: count() }).from(verifiedUsersTable).where(eq(verifiedUsersTable.status, "pending")),
            db.select({ c: count() }).from(verifiedUsersTable).where(eq(verifiedUsersTable.status, "review")),
            db.select({ c: count() }).from(verificationAttemptsTable),
            db.select({ c: count() }).from(verificationLogsTable),
            db.select({ c: count() }).from(staffReviewsTable),
            db.select({ c: count() }).from(staffReviewsTable).where(eq(staffReviewsTable.status, "pending")),
          ]);

          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setTitle("📊 Database Statistics")
                .setColor(0x5865f2)
                .addFields(
                  { name: "👥 Total Users", value: `\`${users?.c ?? 0}\``, inline: true },
                  { name: "✅ Verified", value: `\`${verified?.c ?? 0}\``, inline: true },
                  { name: "⏳ Pending", value: `\`${pending?.c ?? 0}\``, inline: true },
                  { name: "🔍 In Review", value: `\`${inReview?.c ?? 0}\``, inline: true },
                  { name: "🔄 Attempts", value: `\`${attempts?.c ?? 0}\``, inline: true },
                  { name: "📜 Log Entries", value: `\`${logs?.c ?? 0}\``, inline: true },
                  { name: "👮 Staff Reviews", value: `\`${staffTotal?.c ?? 0}\` total`, inline: true },
                  { name: "🕐 Pending Reviews", value: `\`${staffPending?.c ?? 0}\``, inline: true },
                )
                .setFooter({ text: "Trust Guard — Live DB Stats" })
                .setTimestamp()
            ]
          });
          break;
        }
      }
    } catch (err) {
      logError(guildId, makeErrorEmbed(`/dev ${sub} failed`, err, [
        { name: "User", value: `<@${interaction.user.id}>`, inline: true },
      ]));
      await interaction.editReply("❌ Command failed. Check the error-logs channel.");
    }
  },
};

export default dev;
