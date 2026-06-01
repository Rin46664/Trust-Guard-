import { Events, type TextChannel } from "discord.js";
import type { TrustGuardClient } from "../client";
import { assessRisk } from "../lib/riskScoring";
import { buildWelcomeEmbed, buildVerifyButton } from "../lib/verification";
import { upsertUser, addLog, getGuildConfig } from "../lib/db";
import { recordJoin } from "../lib/rateLimiter";
import { logger } from "../../lib/logger";
import client from "../client";

export default function registerGuildMemberAddEvent(c: TrustGuardClient) {
  c.on(Events.GuildMemberAdd, async (member) => {
    try {
      const isMassJoin = recordJoin(member.guild.id);
      if (isMassJoin) {
        logger.warn({ guildId: member.guild.id }, "Mass join detected");
      }

      const assessment = assessRisk(member);
      await upsertUser(member, assessment);
      await addLog(member.id, member.guild.id, member.user.username, "joined", {
        riskScore: assessment.score,
        tier: assessment.tier,
        ageDays: Math.floor(assessment.accountAgeDays),
        signals: assessment.signals,
        massJoin: isMassJoin,
      });

      // Try to find the verification channel from config
      const config = await getGuildConfig(member.guild.id);
      const verifyChannelId = config?.verificationChannelId;

      if (verifyChannelId) {
        // Post a DM-style welcome pointing them to the verification channel
        try {
          const embed = buildWelcomeEmbed(member, assessment.tier, assessment.score);
          await member.send({ embeds: [embed], components: [buildVerifyButton()] });
          await addLog(member.id, member.guild.id, member.user.username, "dm_sent", { tier: assessment.tier });
        } catch {
          // DMs might be closed — fall back to posting in verify channel
          try {
            const ch = await client.channels.fetch(verifyChannelId) as TextChannel | null;
            if (ch?.isTextBased()) {
              const embed = buildWelcomeEmbed(member, assessment.tier, assessment.score);
              const msg = await ch.send({ content: `<@${member.id}>`, embeds: [embed], components: [buildVerifyButton()] });
              // Auto-delete after 10 minutes if not verified
              setTimeout(() => msg.delete().catch(() => {}), 10 * 60 * 1000);
            }
          } catch (err) {
            logger.error({ err, userId: member.id }, "Failed to send verification prompt");
          }
        }
      } else {
        // No config yet — try DM only
        try {
          const embed = buildWelcomeEmbed(member, assessment.tier, assessment.score);
          await member.send({ embeds: [embed], components: [buildVerifyButton()] });
        } catch {
          logger.info({ userId: member.id }, "Could not DM user — no verification channel configured");
        }
      }

      logger.info({ userId: member.id, tier: assessment.tier, score: assessment.score }, "Member processed on join");
    } catch (err) {
      logger.error({ err, userId: member.id }, "Error processing new member");
    }
  });
}
