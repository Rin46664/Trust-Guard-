import {
  Events,
  type GuildMember,
  type ModalSubmitInteraction,
  type ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import type { TrustGuardClient } from "../client";
import { logger } from "../../lib/logger";
import { assessRisk } from "../lib/riskScoring";
import { generateCaptcha, verifyCaptcha } from "../lib/captcha";
import { evaluateQuestionnaire } from "../lib/questionnaire";
import {
  BTN_VERIFY, MODAL_CAPTCHA, MODAL_QUESTIONNAIRE, MODAL_CHALLENGE,
  getSession, setSession, clearSession,
  buildCaptchaModal, buildQuestionnaireModal, buildChallengeModal,
  assignVerifiedRole, postVerificationCard,
} from "../lib/verification";
import {
  upsertUser, createAttempt, updateAttempt, updateUserStatus,
  incrementUserAttempts, addLog, createStaffReview, getUser,
} from "../lib/db";
import { isRateLimited, recordAttempt, formatCooldown } from "../lib/rateLimiter";
import { EmbedBuilder } from "discord.js";

// Button IDs for multi-step flow
const BTN_CONTINUE_QUESTIONNAIRE = "tg_continue_questionnaire";
const BTN_CONTINUE_CHALLENGE = "tg_continue_challenge";

function makeContinueRow(customId: string, label: string) {
  const btn = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Primary)
    .setEmoji("▶️");
  return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
}

export default function registerInteractionCreateEvent(c: TrustGuardClient) {
  c.on(Events.InteractionCreate, async (interaction) => {

    // ── Slash Commands ─────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = c.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, "Command error");
        const msg = { content: "❌ Something went wrong.", ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
        else await interaction.reply(msg);
      }
      return;
    }

    // ── Buttons ────────────────────────────────────────────────────────────
    if (interaction.isButton()) {
      switch (interaction.customId) {
        case BTN_VERIFY:
          await handleVerifyButton(interaction as ButtonInteraction);
          return;
        case BTN_CONTINUE_QUESTIONNAIRE:
          await handleContinueQuestionnaire(interaction as ButtonInteraction);
          return;
        case BTN_CONTINUE_CHALLENGE:
          await handleContinueChallenge(interaction as ButtonInteraction);
          return;
      }
    }

    // ── Modals ─────────────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      switch (interaction.customId) {
        case MODAL_CAPTCHA:
          await handleCaptchaSubmit(interaction);
          return;
        case MODAL_QUESTIONNAIRE:
          await handleQuestionnaireSubmit(interaction);
          return;
        case MODAL_CHALLENGE:
          await handleChallengeSubmit(interaction);
          return;
      }
    }
  });
}

// ── Verify Button ─────────────────────────────────────────────────────────────
async function handleVerifyButton(interaction: ButtonInteraction) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;

  const existing = await getUser(member.id, guildId);
  if (existing?.status === "verified") {
    await interaction.reply({ content: "✅ You're already verified!", ephemeral: true });
    return;
  }
  if (existing?.status === "review") {
    await interaction.reply({ content: "⏳ Your account is pending staff review. Please wait.", ephemeral: true });
    return;
  }

  const rateCheck = isRateLimited(member.id, guildId);
  if (rateCheck.limited) {
    await interaction.reply({
      content: `⏳ You're on cooldown. Please wait **${formatCooldown(rateCheck.cooldownMs!)}** before trying again.`,
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
    tier: assessment.tier, score: assessment.score, attemptId: attempt.id,
  });

  // Tier 1: instant
  if (assessment.tier === 1) {
    await interaction.deferReply({ ephemeral: true });
    const success = await assignVerifiedRole(member);
    if (success) {
      await updateUserStatus(member.id, guildId, "verified", new Date());
      await updateAttempt(attempt.id, { status: "completed", captchaPassed: true, completedAt: new Date() });
      await addLog(member.id, guildId, member.user.username, "verified", { tier: 1, method: "instant" });
      await interaction.editReply({ content: "✅ Instantly verified as a trusted account! Welcome!" });
      await postVerificationCard(member, assessment.score, assessment.tier);
    } else {
      await interaction.editReply({ content: "❌ Verification failed — no verified role configured. Contact an admin." });
    }
    return;
  }

  // Tier 2+: captcha
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
}

// ── Continue → Questionnaire button ───────────────────────────────────────────
async function handleContinueQuestionnaire(interaction: ButtonInteraction) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;
  const session = getSession(member.id, guildId);

  if (!session) {
    await interaction.reply({ content: "❌ Session expired. Please click Verify again.", ephemeral: true });
    return;
  }

  await interaction.showModal(buildQuestionnaireModal(session.tier));
}

// ── Continue → Challenge button ────────────────────────────────────────────────
async function handleContinueChallenge(interaction: ButtonInteraction) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;
  const session = getSession(member.id, guildId);

  if (!session) {
    await interaction.reply({ content: "❌ Session expired. Please click Verify again.", ephemeral: true });
    return;
  }

  const challenge = generateCaptcha(session.tier);
  session.step = "challenge";
  session.challengeChallenge = challenge;
  setSession(member.id, guildId, session);

  await interaction.showModal(buildChallengeModal(challenge));
}

// ── Captcha Modal ──────────────────────────────────────────────────────────────
async function handleCaptchaSubmit(interaction: ModalSubmitInteraction) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;
  const session = getSession(member.id, guildId);

  if (!session) {
    await interaction.reply({ content: "❌ Session expired. Please click Verify again.", ephemeral: true });
    return;
  }

  const answer = interaction.fields.getTextInputValue("captcha_answer");
  const passed = verifyCaptcha(answer, session.captcha);

  await addLog(member.id, guildId, member.user.username, passed ? "captcha_passed" : "captcha_failed", {
    tier: session.tier, attemptId: session.attemptId,
  });

  if (!passed) {
    await updateAttempt(session.attemptId, { status: "captcha_failed", captchaPassed: false, failureReason: "Wrong captcha answer", completedAt: new Date() });
    clearSession(member.id, guildId);
    await interaction.reply({ content: "❌ Incorrect answer. Click **Verify** to try again.", ephemeral: true });
    return;
  }

  session.captchaPassed = true;
  await updateAttempt(session.attemptId, { captchaPassed: true });

  // Tier 2: done after captcha
  if (session.tier === 2) {
    await interaction.deferReply({ ephemeral: true });
    const success = await assignVerifiedRole(member);
    if (success) {
      await updateUserStatus(member.id, guildId, "verified", new Date());
      await updateAttempt(session.attemptId, { status: "completed", completedAt: new Date() });
      await addLog(member.id, guildId, member.user.username, "verified", { tier: 2 });
      clearSession(member.id, guildId);
      await interaction.editReply({ content: "✅ Captcha passed! You've been verified. Welcome!" });
      await postVerificationCard(member, 20, session.tier);
    } else {
      await interaction.editReply({ content: "❌ Role assignment failed. Contact an admin." });
    }
    return;
  }

  // Tier 3+: proceed to questionnaire via button
  session.step = "questionnaire";
  setSession(member.id, guildId, session);

  await interaction.reply({
    content: "✅ Captcha passed! Click below to continue to the questionnaire.",
    ephemeral: true,
    components: [makeContinueRow(BTN_CONTINUE_QUESTIONNAIRE, "Continue to Questionnaire")],
  });
}

// ── Questionnaire Modal ────────────────────────────────────────────────────────
async function handleQuestionnaireSubmit(interaction: ModalSubmitInteraction) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;
  const session = getSession(member.id, guildId);

  if (!session) {
    await interaction.reply({ content: "❌ Session expired. Please click Verify again.", ephemeral: true });
    return;
  }

  const responses: Record<string, string> = {};
  for (const field of ["reason", "source", "rules", "about", "alts"]) {
    try {
      responses[field] = interaction.fields.getTextInputValue(field);
    } catch { /* field not in this tier */ }
  }

  const result = evaluateQuestionnaire(responses);
  session.questionnaireResponses = responses;

  await addLog(member.id, guildId, member.user.username, result.passed ? "questionnaire_passed" : "questionnaire_failed", {
    tier: session.tier, score: result.score, attemptId: session.attemptId,
  });

  if (!result.passed) {
    await updateAttempt(session.attemptId, {
      status: "questionnaire_failed", questionnairePassed: false,
      questionnaireResponses: JSON.stringify(responses),
      failureReason: "Questionnaire did not pass", completedAt: new Date(),
    });
    clearSession(member.id, guildId);
    await interaction.reply({
      content: "❌ Your responses did not meet the requirements. Make sure you agreed to the rules and provided thoughtful answers. Click **Verify** to try again.",
      ephemeral: true,
    });
    return;
  }

  await updateAttempt(session.attemptId, {
    questionnairePassed: true,
    questionnaireResponses: JSON.stringify(responses),
  });

  // Tier 3: done after questionnaire
  if (session.tier === 3) {
    await interaction.deferReply({ ephemeral: true });
    const success = await assignVerifiedRole(member);
    if (success) {
      await updateUserStatus(member.id, guildId, "verified", new Date());
      await updateAttempt(session.attemptId, { status: "completed", completedAt: new Date() });
      await addLog(member.id, guildId, member.user.username, "verified", { tier: 3 });
      clearSession(member.id, guildId);
      await interaction.editReply({ content: "✅ Questionnaire passed! You've been verified. Welcome!" });
      await postVerificationCard(member, 40, session.tier);
    } else {
      await interaction.editReply({ content: "❌ Role assignment failed. Contact an admin." });
    }
    return;
  }

  // Tier 4+: proceed to challenge via button
  await interaction.reply({
    content: "✅ Questionnaire passed! Click below to continue to the final challenge.",
    ephemeral: true,
    components: [makeContinueRow(BTN_CONTINUE_CHALLENGE, "Continue to Final Challenge")],
  });
}

// ── Challenge Modal ────────────────────────────────────────────────────────────
async function handleChallengeSubmit(interaction: ModalSubmitInteraction) {
  const member = interaction.member as GuildMember;
  const guildId = interaction.guildId!;
  const session = getSession(member.id, guildId);

  if (!session?.challengeChallenge) {
    await interaction.reply({ content: "❌ Session expired. Please click Verify again.", ephemeral: true });
    return;
  }

  const answer = interaction.fields.getTextInputValue("challenge_answer");
  const passed = verifyCaptcha(answer, session.challengeChallenge);

  await addLog(member.id, guildId, member.user.username, passed ? "challenge_passed" : "challenge_failed", {
    tier: session.tier, attemptId: session.attemptId,
  });

  if (!passed) {
    await updateAttempt(session.attemptId, {
      status: "challenge_failed", challengePassed: false,
      challengeType: session.challengeChallenge.type,
      failureReason: "Wrong challenge answer", completedAt: new Date(),
    });
    clearSession(member.id, guildId);
    await interaction.reply({ content: "❌ Challenge failed. Click **Verify** to try again.", ephemeral: true });
    return;
  }

  await updateAttempt(session.attemptId, {
    challengePassed: true,
    challengeType: session.challengeChallenge.type,
  });

  // Tier 4: auto-verify
  if (session.tier === 4) {
    await interaction.deferReply({ ephemeral: true });
    const success = await assignVerifiedRole(member);
    if (success) {
      await updateUserStatus(member.id, guildId, "verified", new Date());
      await updateAttempt(session.attemptId, { status: "completed", completedAt: new Date() });
      await addLog(member.id, guildId, member.user.username, "verified", { tier: 4 });
      clearSession(member.id, guildId);
      await interaction.editReply({ content: "✅ All steps passed! You've been verified. Welcome!" });
      await postVerificationCard(member, 55, session.tier);
    } else {
      await interaction.editReply({ content: "❌ Role assignment failed. Contact an admin." });
    }
    return;
  }

  // Tier 5 & 6: queue for staff review
  await updateAttempt(session.attemptId, { status: "pending_review", completedAt: new Date() });
  await updateUserStatus(member.id, guildId, "review");

  const review = await createStaffReview(
    member.id, guildId, member.user.username,
    member.displayName !== member.user.username ? member.displayName : null,
    member.user.avatarURL({ size: 256 }) ?? null,
    session.tier === 5 ? 70 : 90,
    session.tier,
    session.attemptId,
    session.questionnaireResponses,
  );

  await addLog(member.id, guildId, member.user.username, "review_requested", {
    tier: session.tier, reviewId: review.id,
  });
  clearSession(member.id, guildId);

  // Notify staff
  try {
    const { getGuildConfig } = await import("../lib/db");
    const config = await getGuildConfig(guildId);
    if (config?.logChannelId) {
      const ch = await (await import("../client")).default.channels.fetch(config.logChannelId) as any;
      if (ch?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle("🔍 Manual Review Required")
          .setDescription(`<@${member.id}> requires staff review.`)
          .addFields(
            { name: "Username", value: `@${member.user.username}`, inline: true },
            { name: "User ID", value: member.id, inline: true },
            { name: "Tier", value: `Tier ${session.tier}`, inline: true },
            { name: "Review ID", value: String(review.id), inline: true },
          )
          .setColor(session.tier === 6 ? 0x2f3136 : 0xeb459e)
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    logger.error({ err }, "Failed to notify staff channel");
  }

  const msg = session.tier === 6
    ? "⏳ Submitted for mandatory staff review. You'll be notified once approved."
    : "⏳ All steps passed! Your account is queued for staff review. You'll receive access once approved.";
  await interaction.reply({ content: msg, ephemeral: true });
}
