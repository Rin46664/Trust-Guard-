import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import type { Command } from "../client";
import { db, verificationLogsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";

const EVENT_EMOJI: Record<string, string> = {
  joined: "👋",
  started: "▶️",
  captcha_passed: "✅",
  captcha_failed: "❌",
  questionnaire_passed: "✅",
  questionnaire_failed: "❌",
  challenge_passed: "✅",
  challenge_failed: "❌",
  verified: "🏅",
  review_requested: "🔍",
  setup: "⚙️",
  dm_sent: "💬",
};

const logs: Command = {
  data: new SlashCommandBuilder()
    .setName("logs")
    .setDescription("View recent Trust Guard verification logs")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption(opt =>
      opt.setName("limit")
        .setDescription("Number of entries to show (1–25, default 15)")
        .setMinValue(1).setMaxValue(25)
    )
    .addUserOption(opt =>
      opt.setName("user").setDescription("Filter logs for a specific user")
    )
    .addStringOption(opt =>
      opt.setName("type").setDescription("Filter by event type")
        .addChoices(
          { name: "👋 Joined", value: "joined" },
          { name: "▶️ Started", value: "started" },
          { name: "🏅 Verified", value: "verified" },
          { name: "✅ Captcha Passed", value: "captcha_passed" },
          { name: "❌ Captcha Failed", value: "captcha_failed" },
          { name: "✅ Questionnaire Passed", value: "questionnaire_passed" },
          { name: "❌ Questionnaire Failed", value: "questionnaire_failed" },
          { name: "🔍 Review Requested", value: "review_requested" },
        )
    ),

  async execute(interaction) {
    const guildId = interaction.guildId!;
    await interaction.deferReply({ ephemeral: true });

    const limit = interaction.options.getInteger("limit") ?? 15;
    const filterUser = interaction.options.getUser("user");
    const filterType = interaction.options.getString("type");

    const conditions = [eq(verificationLogsTable.guildId, guildId)];
    if (filterUser) conditions.push(eq(verificationLogsTable.userId, filterUser.id));
    if (filterType) conditions.push(eq(verificationLogsTable.eventType, filterType));

    const entries = await db
      .select()
      .from(verificationLogsTable)
      .where(conditions.length === 1 ? conditions[0]! : and(...conditions))
      .orderBy(desc(verificationLogsTable.createdAt))
      .limit(limit);

    if (entries.length === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setTitle("📋 Verification Logs")
            .setDescription("No log entries found for the given filters.")
            .setColor(0x99aab5).setTimestamp()
        ]
      });
      return;
    }

    const lines = entries.map(e => {
      const emoji = EVENT_EMOJI[e.eventType] ?? "📝";
      const ts = `<t:${Math.floor(new Date(e.createdAt).getTime() / 1000)}:R>`;
      return `${emoji} **${e.eventType}** · \`${e.username}\` · ${ts}`;
    });

    const filterDesc = [
      filterUser ? `User: **${filterUser.username}**` : null,
      filterType ? `Type: **${filterType}**` : null,
    ].filter(Boolean).join(" · ");

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📋 Verification Logs")
          .setDescription(lines.join("\n"))
          .setColor(0x5865f2)
          .setFooter({ text: `Showing ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${filterDesc ? ` · ${filterDesc}` : ""}` })
          .setTimestamp()
      ]
    });
  },
};

export default logs;
