import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import type { Command } from "../client";
import { db, staffReviewsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { resolveStaffReview, updateUserStatus, addLog } from "../lib/db";
import { assignVerifiedRole } from "../lib/verification";
import type { GuildMember } from "discord.js";

const review: Command = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Manage pending verification reviews (Staff only)")
    .addSubcommand((sub) =>
      sub
        .setName("approve")
        .setDescription("Approve a pending review")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Review ID").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("notes").setDescription("Optional staff notes")
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("deny")
        .setDescription("Deny a pending review")
        .addIntegerOption((opt) =>
          opt.setName("id").setDescription("Review ID").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("notes").setDescription("Reason for denial")
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all pending reviews")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    await interaction.deferReply({ ephemeral: true });

    if (sub === "list") {
      const pending = await db
        .select()
        .from(staffReviewsTable)
        .where(and(eq(staffReviewsTable.guildId, guildId), eq(staffReviewsTable.status, "pending")))
        .limit(10);

      if (pending.length === 0) {
        await interaction.editReply("✅ No pending reviews.");
        return;
      }

      const lines = pending.map((r) =>
        `**ID ${r.id}** — @${r.username} (Tier ${r.tier}, Score: ${r.riskScore}) — <t:${Math.floor(new Date(r.createdAt).getTime() / 1000)}:R>`
      );
      await interaction.editReply(`🔍 **Pending Reviews** (${pending.length})\n\n${lines.join("\n")}`);
      return;
    }

    const id = interaction.options.getInteger("id", true);
    const notes = interaction.options.getString("notes") ?? undefined;

    const [reviewRow] = await db
      .select()
      .from(staffReviewsTable)
      .where(and(eq(staffReviewsTable.id, id), eq(staffReviewsTable.guildId, guildId)))
      .limit(1);

    if (!reviewRow) {
      await interaction.editReply(`❌ Review #${id} not found.`);
      return;
    }
    if (reviewRow.status !== "pending") {
      await interaction.editReply(`❌ Review #${id} is already **${reviewRow.status}**.`);
      return;
    }

    if (sub === "approve") {
      await resolveStaffReview(id, "approved", notes);
      await updateUserStatus(reviewRow.userId, guildId, "verified", new Date());
      await addLog(reviewRow.userId, guildId, reviewRow.username, "review_approved", {
        reviewId: id,
        staff: interaction.user.username,
        notes,
      });

      try {
        const guild = interaction.guild!;
        const member = await guild.members.fetch(reviewRow.userId) as GuildMember;
        await assignVerifiedRole(member);
        await member.send(`✅ Your verification has been approved by staff! Welcome to the server.`).catch(() => {});
      } catch {
        // User may have left
      }

      await interaction.editReply(`✅ Review #${id} approved. @${reviewRow.username} has been verified.`);
    } else if (sub === "deny") {
      await resolveStaffReview(id, "denied", notes);
      await updateUserStatus(reviewRow.userId, guildId, "failed");
      await addLog(reviewRow.userId, guildId, reviewRow.username, "review_denied", {
        reviewId: id,
        staff: interaction.user.username,
        notes,
      });

      try {
        const guild = interaction.guild!;
        const member = await guild.members.fetch(reviewRow.userId);
        const reason = notes ? `\n\nReason: ${notes}` : "";
        await member.send(`❌ Your verification request has been denied by staff.${reason}`).catch(() => {});
      } catch {
        // User may have left
      }

      await interaction.editReply(`❌ Review #${id} denied. @${reviewRow.username} will not be verified.`);
    }
  },
};

export default review;
