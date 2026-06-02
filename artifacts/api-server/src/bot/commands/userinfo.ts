import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} from "discord.js";
import type { Command } from "../client";
import { getUser, getAttempts } from "../lib/db";
import { getTierColor, getTierLabel } from "../lib/riskScoring";
import type { RiskTier } from "../lib/riskScoring";

const STATUS_EMOJI: Record<string, string> = {
  verified: "✅",
  pending: "⏳",
  review: "🔍",
  denied: "❌",
};

const userinfo: Command = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Look up a user's verification status and history")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(opt =>
      opt.setName("user").setDescription("User to look up").setRequired(true)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId!;
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser("user", true);
    const [record, attempts] = await Promise.all([
      getUser(target.id, guildId),
      getAttempts(target.id, guildId),
    ]);

    const created = new Date(Number((BigInt(target.id) >> 22n) + 1420070400000n));
    const ageDays = Math.floor((Date.now() - created.getTime()) / 86400000);
    const tier = (record?.verificationTier as RiskTier | undefined) ?? 1;
    const status = record?.status ?? "not_registered";

    const embed = new EmbedBuilder()
      .setTitle(`👤 User Info — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .setColor(record ? getTierColor(tier) : 0x99aab5)
      .addFields(
        { name: "🆔 User", value: `<@${target.id}> (\`${target.id}\`)`, inline: false },
        {
          name: "📊 Status",
          value: record
            ? `${STATUS_EMOJI[status] ?? "❓"} **${status}**`
            : "❓ Not registered in Trust Guard",
          inline: true,
        },
        { name: "🎯 Risk Tier", value: record ? `Tier ${tier} — ${getTierLabel(tier)}` : "—", inline: true },
        { name: "⚠️ Risk Score", value: record ? `${record.riskScore}/100` : "—", inline: true },
        { name: "📅 Account Age", value: `${ageDays} days`, inline: true },
        { name: "🔄 Attempts", value: `${record?.attemptCount ?? 0}`, inline: true },
        {
          name: "✅ Verified At",
          value: record?.verifiedAt
            ? `<t:${Math.floor(new Date(record.verifiedAt).getTime() / 1000)}:F>`
            : "—",
          inline: true,
        },
        { name: "📅 Created", value: `<t:${Math.floor(created.getTime() / 1000)}:D>`, inline: true },
        { name: "🖼️ Avatar", value: record?.hasAvatar ? "✅ Yes" : "❌ No", inline: true },
        { name: "🏷️ Banner", value: record?.hasBanner ? "✅ Yes" : "❌ No", inline: true },
      )
      .setTimestamp();

    if (attempts.length > 0) {
      const lines = attempts.slice(0, 5).map((a, i) => {
        const ts = `<t:${Math.floor(new Date(a.startedAt).getTime() / 1000)}:R>`;
        return `${i + 1}. \`${a.status}\` · Tier ${a.tier} · ${ts}`;
      });
      embed.addFields({
        name: `🔄 Recent Attempts (${attempts.length} total)`,
        value: lines.join("\n"),
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};

export default userinfo;
