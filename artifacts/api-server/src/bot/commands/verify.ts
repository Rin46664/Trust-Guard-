import {
  SlashCommandBuilder,
  EmbedBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import {
  assessRisk,
} from "../lib/riskScoring";
import {
  generateCaptcha,
} from "../lib/captcha";
import {
  isRateLimited, recordAttempt, formatCooldown,
} from "../lib/rateLimiter";
import {
  getSession, setSession, buildCaptchaModal,
  assignVerifiedRole, postVerificationCard,
} from "../lib/verification";
import {
  getUser, upsertUser, createAttempt, updateAttempt,
  updateUserStatus, incrementUserAttempts, addLog,
} from "../lib/db";
import { logEvent, makeEventEmbed } from "../lib/channelLogger";

export default {
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Start your verification to access the server"),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply({ content: "This command can only be used in a server.", ephemeral: true });
      return;
    }

    const member = interaction.member as GuildMember;
    const guildId = interaction.guildId!;

    // Already verified? Just restore the role (handles rejoins).
    const existing = await getUser(member.id, guildId);
    if (existing?.status === "verified") {
      await interaction.deferReply({ ephemeral: true });
      const success = await assignVerifiedRole(member);
      if (success) {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription("✅ Welcome back! Your verified role has been restored.")
              .setColor(0x57f287),
          ],
        });
      } else {
        await interaction.editReply({ content: "❌ Role assignment failed — no verified role configured. Contact an admin." });
      }
      return;
    }

    // Pending review?
    if (existing?.status === "review") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription("⏳ Your account is currently pending staff review. Please wait — you'll be notified when approved.")
            .setColor(0xfee75c),
        ],
        ephemeral: true,
      });
      return;
    }

    // Active session?
    const session = getSession(member.id, guildId);
    if (session) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription("🔄 You already have a verification in progress. Check your DMs or complete the current step.")
            .setColor(0x5865f2),
        ],
        ephemeral: true,
      });
      return;
    }

    // Rate limit check
    const rateCheck = isRateLimited(member.id, guildId);
    if (rateCheck.limited) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`⏳ Please wait **${formatCooldown(rateCheck.cooldownMs!)}** before trying again.`)
            .setColor(0xed4245),
        ],
        ephemeral: true,
      });
      return;
    }

    recordAttempt(member.id, guildId);

    const assessment = assessRisk(member);
    await upsertUser(member, assessment);
    const attempt = await createAttempt(member.id, guildId, assessment.tier, assessment.score);
    await incrementUserAttempts(member.id, guildId);
    await addLog(member.id, guildId, member.user.username, "started", {
      tier: assessment.tier, score: assessment.score, attemptId: attempt.id, source: "slash_command",
    });

    logEvent(guildId, makeEventEmbed(
      "▶️ Verification Started",
      `<@${member.id}> started verification via /verify.`,
      [
        { name: "Username", value: `@${member.user.username}`, inline: true },
      ]
    ));

    // Tier 1: instant
    if (assessment.tier === 1) {
      await interaction.deferReply({ ephemeral: true });
      const success = await assignVerifiedRole(member);
      if (success) {
        await updateUserStatus(member.id, guildId, "verified", new Date());
        await updateAttempt(attempt.id, { status: "completed", captchaPassed: true, completedAt: new Date() });
        await addLog(member.id, guildId, member.user.username, "verified", { tier: 1, method: "instant" });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription("✅ You've been verified! Welcome to the server.")
              .setColor(0x57f287),
          ],
        });
        await postVerificationCard(member, assessment.score, assessment.tier);
      } else {
        await interaction.editReply({ content: "❌ Verification failed — no role configured. Contact an admin." });
      }
      return;
    }

    // Tier 2+: start captcha modal
    const captcha = generateCaptcha(assessment.tier);
    setSession(member.id, guildId, {
      attemptId: attempt.id,
      tier: assessment.tier,
      step: "captcha",
      captcha,
      captchaPassed: false,
      userId: member.id,
      guildId,
      startedAt: Date.now(),
    });

    await interaction.showModal(buildCaptchaModal(captcha));
  },
};
