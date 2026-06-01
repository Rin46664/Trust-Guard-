import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import type { Command } from "../client";
import { db, verifiedUsersTable, staffReviewsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";

const stats: Command = {
  data: new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show Trust Guard verification statistics")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const guildId = interaction.guildId!;
    await interaction.deferReply({ ephemeral: true });

    const [verified] = await db.select({ count: count() }).from(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.status, "verified")));
    const [pending] = await db.select({ count: count() }).from(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.status, "pending")));
    const [reviews] = await db.select({ count: count() }).from(staffReviewsTable)
      .where(and(eq(staffReviewsTable.guildId, guildId), eq(staffReviewsTable.status, "pending")));
    const [failed] = await db.select({ count: count() }).from(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.status, "failed")));

    const tierRows = await db
      .select({ tier: verifiedUsersTable.verificationTier, count: count() })
      .from(verifiedUsersTable)
      .where(and(eq(verifiedUsersTable.guildId, guildId), eq(verifiedUsersTable.status, "verified")))
      .groupBy(verifiedUsersTable.verificationTier);

    const tierMap: Record<number, number> = {};
    for (const row of tierRows) tierMap[row.tier] = row.count;

    const tierLines = [1, 2, 3, 4, 5, 6].map((t) => {
      const labels = ["Trusted", "Normal", "Newer", "High Risk", "Extreme", "Fresh"];
      return `Tier ${t} (${labels[t - 1]}): **${tierMap[t] ?? 0}**`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🛡️ Trust Guard Statistics")
      .addFields(
        { name: "✅ Verified", value: String(verified?.count ?? 0), inline: true },
        { name: "⏳ Pending", value: String(pending?.count ?? 0), inline: true },
        { name: "❌ Failed", value: String(failed?.count ?? 0), inline: true },
        { name: "🔍 Awaiting Review", value: String(reviews?.count ?? 0), inline: true },
        { name: "Verified by Tier", value: tierLines.join("\n") }
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Trust Guard" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

export default stats;
