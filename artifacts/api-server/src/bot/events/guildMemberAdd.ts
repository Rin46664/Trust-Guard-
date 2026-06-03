import { Events, type TextChannel } from "discord.js";
import type { TrustGuardClient } from "../client";
import { assessRisk } from "../lib/riskScoring";
import { buildWelcomeEmbed, buildVerifyButton, storeVerifyMessage } from "../lib/verification";
import { upsertUser, addLog, getGuildConfig } from "../lib/db";
import { recordJoin } from "../lib/rateLimiter";
import { logger } from "../../lib/logger";
import { logEvent, logError, makeEventEmbed, makeErrorEmbed } from "../lib/channelLogger";
import client from "../client";

export default function registerGuildMemberAddEvent(c: TrustGuardClient) {
  c.on(Events.GuildMemberAdd, async (member) => {
    try {
      const isMassJoin = recordJoin(member.guild.id);
      if (isMassJoin) {
        logger.warn({ guildId: member.guild.id }, "Mass join detected");
        logError(member.guild.id, makeErrorEmbed(
          "⚠️ Mass Join Detected",
          "Unusual join rate detected. Potential raid or bot wave.",
          [{ name: "Guild", value: member.guild.id }]
        ));
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

      // Log join to activity channel
      const ageDays = Math.floor(assessment.accountAgeDays);
      logEvent(member.guild.id, makeEventEmbed(
        "👋 Member Joined",
        `<@${member.id}> joined the server.`,
        [
          { name: "Risk Tier", value: `Tier ${assessment.tier}`, inline: true },
          { name: "Risk Score", value: `${assessment.score}/100`, inline: true },
          { name: "Account Age", value: `${ageDays} day${ageDays === 1 ? "" : "s"}`, inline: true },
          { name: "Username", value: `@${member.user.username}`, inline: true },
          { name: "Signals", value: assessment.signals.length ? assessment.signals.join(", ") : "None", inline: true },
          { name: "Mass Join", value: isMassJoin ? "⚠️ Yes" : "No", inline: true },
        ],
        assessment.score > 60 ? 0xfee75c : 0x5865f2
      ));

      const config = await getGuildConfig(member.guild.id);
      const verifyChannelId = config?.verificationChannelId;

      // Check if bot is enabled
      if (config?.enabled === false) {
        logger.info({ userId: member.id }, "Bot disabled — skipping verification prompt");
        return;
      }

      // Apply tier override if configured
      const effectiveTier = (config?.tierOverride ?? assessment.tier) as typeof assessment.tier;
      const displayAssessment = { ...assessment, tier: effectiveTier };

      if (verifyChannelId) {
        try {
          const ch = await client.channels.fetch(verifyChannelId) as TextChannel | null;
          if (ch?.isTextBased()) {
            const embed = buildWelcomeEmbed(member, displayAssessment.tier, displayAssessment.score);
            const msg = await ch.send({ content: `<@${member.id}>`, embeds: [embed], components: [buildVerifyButton()] });
            storeVerifyMessage(member.id, member.guild.id, ch.id, msg.id);
          }
        } catch (err) {
          logger.error({ err, userId: member.id }, "Failed to send verification prompt");
          logError(member.guild.id, makeErrorEmbed(
            "Failed to Send Verification Prompt",
            err,
            [{ name: "User", value: `<@${member.id}>`, inline: true }]
          ));
        }
      } else {
        logger.info({ userId: member.id }, "No verification channel configured — skipping prompt");
      }

      logger.info({ userId: member.id, tier: assessment.tier, score: assessment.score }, "Member processed on join");
    } catch (err) {
      logger.error({ err, userId: member.id }, "Error processing new member");
      logError(member.guild.id, makeErrorEmbed(
        "Guild Member Add Error",
        err,
        [{ name: "User", value: `<@${member.id}>`, inline: true }]
      ));
    }
  });
}
