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

// ── Verify-prompt message tracking ────────────────────────────────────────────
// Tracks the channel message posted when a member joins so it can be deleted
// once they verify (or auto-deleted after 15 minutes).

interface VerifyMessageEntry { channelId: string; messageId: string; timer: NodeJS.Timeout; }
const verifyMessages = new Map<string, VerifyMessageEntry>();

export function storeVerifyMessage(userId: string, guildId: string, channelId: string, messageId: string): void {
  const key = sessionKey(userId, guildId);
  const existing = verifyMessages.get(key);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => { void deleteVerifyMessage(userId, guildId); }, 15 * 60 * 1000);
  verifyMessages.set(key, { channelId, messageId, timer });
}

export async function deleteVerifyMessage(userId: string, guildId: string): Promise<void> {
  const key = sessionKey(userId, guildId);
  const entry = verifyMessages.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  verifyMessages.delete(key);
  try {
    const ch = await client.channels.fetch(entry.channelId);
    if (ch?.isTextBased()) {
      const msg = await (ch as TextChannel).messages.fetch(entry.messageId).catch(() => null);
      await msg?.delete().catch(() => {});
    }
  } catch {
    // Message may already be gone
  }
}

// ── Embeds ────────────────────────────────────────────────────────────────────

export function buildWelcomeEmbed(member: GuildMember, tier: RiskTier, _score: number) {
  const descriptions: Record<RiskTier, string> = {
    1: "Click the button below to gain instant access.",
    2: "Click the button below to complete a quick security check.",
    3: "Click the button below to complete a short verification process.",
    4: "Click the button below to complete the verification steps.",
    5: "Click the button below to begin. Your account will be reviewed by a staff member before access is granted.",
    6: "Click the button below to begin. Staff approval is required for all new accounts.",
  };

  return new EmbedBuilder()
    .setTitle("Verification Required")
    .setDescription(`Welcome, <@${member.id}>.\n\nTo access this server you need to complete a quick verification.\n\n${descriptions[tier]}`)
    .setColor(0x5865f2)
    .setFooter({ text: "Trust Guard" })
    .setTimestamp();
}

export function buildVerifyButton() {
  const btn = new ButtonBuilder()
    .setCustomId(BTN_VERIFY)
    .setLabel("Verify Me")
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

// ── Modals ────────────────────────────────────────────────────────────────────

export function buildCaptchaModal(challenge: CaptchaChallenge): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(MODAL_CAPTCHA)
    .setTitle("Verification — Security Check");

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
    .setTitle("Verification — Questionnaire");

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
    .setTitle("Verification — Final Challenge");

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
    .setTitle("Member Verified")
    .setDescription(`<@${member.id}> has passed verification.`)
    .addFields(
      { name: "Username", value: `@${member.user.username}`, inline: true },
      { name: "User ID", value: member.id, inline: true },
    )
    .setImage("attachment://verification.png")
    .setColor(0x57f287)
    .setFooter({ text: "Trust Guard" })
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
    .setTitle("Verification")
    .setDescription(
      "To access this server you need to verify your account.\n\n" +
      "Click the button below to get started. The process only takes a moment."
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Trust Guard" })
    .setTimestamp();

  await channel.send({ embeds: [embed], components: [buildVerifyButton()] });
  await addLog(client.user?.id ?? "bot", guildId, "Trust Guard", "setup", { channelId: channel.id });
}
