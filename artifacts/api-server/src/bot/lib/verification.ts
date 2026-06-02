import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
  type TextChannel,
  AttachmentBuilder,
} from "discord.js";
import type { RiskTier } from "./riskScoring";
import { getTierColor, getTierLabel } from "./riskScoring";
import type { CaptchaChallenge } from "./captcha";
import { generateCaptcha } from "./captcha";
import { getQuestionsForTier } from "./questionnaire";
import { generateVerificationCard } from "./verificationCard";
import { getGuildConfig, addLog } from "./db";
import client from "../client";
import { logger } from "../../lib/logger";
import {
  logEvent, logError,
  makeEventEmbed, makeErrorEmbed,
} from "./channelLogger";

// ── Custom IDs ────────────────────────────────────────────────────────────────
export const BTN_VERIFY = "tg_verify";
export const MODAL_CAPTCHA = "tg_captcha";
export const MODAL_QUESTIONNAIRE = "tg_questionnaire";
export const MODAL_CHALLENGE = "tg_challenge";

// ── In-memory session store ───────────────────────────────────────────────────
export interface VerificationSession {
  attemptId: number;
  tier: RiskTier;
  step: "captcha" | "questionnaire" | "challenge" | "review" | "complete";
  captcha: CaptchaChallenge;
  captchaPassed: boolean;
  questionnaireResponses?: Record<string, string>;
  challengeChallenge?: CaptchaChallenge;
  userId: string;
  guildId: string;
  startedAt: number;
}

const sessions = new Map<string, VerificationSession>();

function sessionKey(userId: string, guildId: string) {
  return `${userId}:${guildId}`;
}

export function getSession(userId: string, guildId: string): VerificationSession | undefined {
  return sessions.get(sessionKey(userId, guildId));
}

export function setSession(userId: string, guildId: string, session: VerificationSession) {
  sessions.set(sessionKey(userId, guildId), session);
}

export function clearSession(userId: string, guildId: string) {
  sessions.delete(sessionKey(userId, guildId));
}

export function clearAllSessions(): number {
  const count = sessions.size;
  sessions.clear();
  return count;
}

// ── Embeds ────────────────────────────────────────────────────────────────────

export function buildWelcomeEmbed(member: GuildMember, tier: RiskTier, score: number) {
  const color = getTierColor(tier);
  const tierName = getTierLabel(tier);

  const descriptions: Record<RiskTier, string> = {
    1: "Your account is established and trusted. Click **Verify** to gain instant access.",
    2: "Please complete a quick captcha to verify you're human.",
    3: "Please complete a captcha and a short questionnaire to verify your account.",
    4: "Your account requires additional verification. Please complete the captcha, questionnaire, and a challenge.",
    5: "Your account requires thorough verification and staff review before access is granted.",
    6: "Accounts less than 24 hours old require full verification and mandatory staff approval.",
  };

  return new EmbedBuilder()
    .setTitle("🛡️ Trust Guard Verification")
    .setDescription(`Welcome, <@${member.id}>!\n\n${descriptions[tier]}`)
    .addFields(
      { name: "Risk Level", value: tierName, inline: true },
      { name: "Trust Score", value: `${100 - score}/100`, inline: true },
      { name: "Verification Steps", value: getStepsList(tier), inline: false }
    )
    .setColor(color)
    .setFooter({ text: "Trust Guard • Verification System" })
    .setTimestamp();
}

function getStepsList(tier: RiskTier): string {
  const steps: Record<RiskTier, string> = {
    1: "1. Click Verify → ✅ Done",
    2: "1. Click Verify\n2. Solve captcha\n3. ✅ Done",
    3: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. ✅ Done",
    4: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. Complete challenge\n5. ✅ Done",
    5: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. Complete challenge\n5. 👤 Staff review",
    6: "1. Click Verify\n2. Solve captcha\n3. Answer questionnaire\n4. Complete challenge\n5. ⏳ Cooldown\n6. 👤 Staff review",
  };
  return steps[tier];
}

export function buildVerifyButton() {
  const btn = new ButtonBuilder()
    .setCustomId(BTN_VERIFY)
    .setLabel("Verify Me")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("🛡️");
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

// ── Modals ────────────────────────────────────────────────────────────────────

export function buildCaptchaModal(challenge: CaptchaChallenge): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_CAPTCHA)
    .setTitle("🛡️ Verification — Captcha");

  const input = new TextInputBuilder()
    .setCustomId("captcha_answer")
    .setLabel(challenge.question)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Your answer...")
    .setRequired(true)
    .setMaxLength(50);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

export function buildQuestionnaireModal(tier: RiskTier): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_QUESTIONNAIRE)
    .setTitle("🛡️ Verification — Questionnaire");

  const questions = getQuestionsForTier(tier);
  for (const q of questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setLabel(q.label)
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(q.placeholder)
      .setRequired(q.id === "rules");
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

export function buildChallengeModal(challenge: CaptchaChallenge): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_CHALLENGE)
    .setTitle("🛡️ Verification — Final Challenge");

  const input = new TextInputBuilder()
    .setCustomId("challenge_answer")
    .setLabel(challenge.question)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Your answer...")
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

// ── Role Assignment ───────────────────────────────────────────────────────────

export async function assignVerifiedRole(member: GuildMember): Promise<boolean> {
  const config = await getGuildConfig(member.guild.id);
  const roleId = config?.verifiedRoleId ?? process.env["DISCORD_VERIFIED_ROLE_ID"];

  if (!roleId) {
    logger.warn({ guildId: member.guild.id }, "No verified role configured");
    logError(member.guild.id, makeErrorEmbed(
      "No Verified Role Configured",
      "Cannot assign role — set one with `/config verified-role`",
      [{ name: "Guild", value: member.guild.id }]
    ));
    return false;
  }

  if (member.roles.cache.has(roleId)) {
    return true;
  }

  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    logger.error({ roleId }, "Verified role not found in guild");
    logError(member.guild.id, makeErrorEmbed(
      "Verified Role Not Found",
      `Role ID \`${roleId}\` does not exist in this server.`,
      [{ name: "User", value: `<@${member.id}>`, inline: true }]
    ));
    return false;
  }

  try {
    await member.roles.add(role, "Trust Guard verification");
    logger.info({ userId: member.id, roleId }, "Verified role assigned");
    return true;
  } catch (err) {
    logger.error({ err, userId: member.id }, "Failed to assign role");
    logError(member.guild.id, makeErrorEmbed(
      "Role Assignment Failed",
      err,
      [
        { name: "User", value: `<@${member.id}>`, inline: true },
        { name: "Role", value: `<@&${roleId}>`, inline: true },
      ]
    ));
    return false;
  }
}

// ── Card & Log Posting ────────────────────────────────────────────────────────

export async function postVerificationCard(member: GuildMember, riskScore: number, tier: RiskTier) {
  const config = await getGuildConfig(member.guild.id);
  const logChannelId = config?.logChannelId ?? process.env["DISCORD_LOG_CHANNEL_ID"];
  const welcomeChannelId = config?.welcomeChannelId ?? process.env["DISCORD_WELCOME_CHANNEL_ID"];

  const accountCreatedAt = new Date(Number((BigInt(member.id) >> 22n) + 1420070400000n));

  let cardBuffer: Buffer;
  try {
    cardBuffer = await generateVerificationCard({
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
  } catch (err) {
    logger.error({ err }, "Failed to generate verification card");
    logError(member.guild.id, makeErrorEmbed(
      "Verification Card Generation Failed",
      err,
      [{ name: "User", value: `<@${member.id}>`, inline: true }]
    ));
    return;
  }

  const attachment = new AttachmentBuilder(cardBuffer, { name: "verification.png" });

  const embed = new EmbedBuilder()
    .setTitle("✅ User Verified")
    .setDescription(`<@${member.id}> has been verified.`)
    .addFields(
      { name: "Username", value: `@${member.user.username}`, inline: true },
      { name: "User ID", value: member.id, inline: true },
      { name: "Tier", value: `Tier ${tier} — ${getTierLabel(tier)}`, inline: true },
      { name: "Trust Score", value: `${100 - riskScore}/100`, inline: true }
    )
    .setImage("attachment://verification.png")
    .setColor(getTierColor(tier))
    .setTimestamp();

  const channelIds = [...new Set([logChannelId, welcomeChannelId])].filter(Boolean) as string[];

  for (const channelId of channelIds) {
    try {
      const ch = await client.channels.fetch(channelId) as TextChannel | null;
      if (ch?.isTextBased()) {
        await ch.send({ embeds: [embed], files: [attachment] });
      }
    } catch (err) {
      logger.error({ err, channelId }, "Failed to post verification card");
    }
  }

  // Also log the event to the log channel
  logEvent(member.guild.id, makeEventEmbed(
    "🏅 Member Verified",
    `<@${member.id}> passed verification.`,
    [
      { name: "Tier", value: `Tier ${tier} — ${getTierLabel(tier)}`, inline: true },
      { name: "Trust Score", value: `${100 - riskScore}/100`, inline: true },
      { name: "Username", value: `@${member.user.username}`, inline: true },
    ],
    getTierColor(tier)
  ));
}

// ── Verification Channel Setup ────────────────────────────────────────────────

export async function sendVerificationMessage(channel: TextChannel, guildId: string) {
  const embed = new EmbedBuilder()
    .setTitle("🛡️ Server Verification")
    .setDescription(
      "To access the rest of the server, please verify your account.\n\n" +
      "Our system will assess your account and route you through the appropriate verification steps automatically.\n\n" +
      "**Click the button below to begin.**"
    )
    .addFields(
      { name: "Tier 1 — Trusted", value: "Instant access", inline: true },
      { name: "Tier 2 — Normal", value: "Quick captcha", inline: true },
      { name: "Tier 3 — Newer", value: "Captcha + questionnaire", inline: true },
      { name: "Tier 4 — High Risk", value: "Full verification", inline: true },
      { name: "Tier 5 — Extreme", value: "Full + staff review", inline: true },
      { name: "Tier 6 — Fresh", value: "Full + mandatory review", inline: true }
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Trust Guard • Risk-Based Verification" })
    .setTimestamp();

  await channel.send({ embeds: [embed], components: [buildVerifyButton()] });
  await addLog(client.user?.id ?? "bot", guildId, "Trust Guard", "setup", { channelId: channel.id });
}
