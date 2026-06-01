import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type TextChannel,
} from "discord.js";
import type { Command } from "../client";
import { sendVerificationMessage } from "../lib/verification";
import { upsertGuildConfig, getGuildConfig } from "../lib/db";

const setup: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure Trust Guard for this server (Admin only)")
    .addSubcommand((sub) =>
      sub
        .setName("verify-channel")
        .setDescription("Post the verification message in a channel")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Verification channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("verified-role")
        .setDescription("Set the role granted after verification")
        .addRoleOption((opt) =>
          opt.setName("role").setDescription("Verified role").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("log-channel")
        .setDescription("Set the channel for verification logs and staff reviews")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("welcome-channel")
        .setDescription("Set the channel where verification cards are posted")
        .addChannelOption((opt) =>
          opt.setName("channel").setDescription("Welcome channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show current Trust Guard configuration")
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    await interaction.deferReply({ ephemeral: true });

    if (sub === "verify-channel") {
      const channel = interaction.options.getChannel("channel", true) as TextChannel;
      await upsertGuildConfig(guildId, { verificationChannelId: channel.id });
      await sendVerificationMessage(channel, guildId);
      await interaction.editReply(`✅ Verification message posted in ${channel}. Users can now begin verification there.`);
    } else if (sub === "verified-role") {
      const role = interaction.options.getRole("role", true);
      await upsertGuildConfig(guildId, { verifiedRoleId: role.id });
      await interaction.editReply(`✅ Verified role set to **${role.name}**. This role will be assigned after successful verification.`);
    } else if (sub === "log-channel") {
      const channel = interaction.options.getChannel("channel", true) as TextChannel;
      await upsertGuildConfig(guildId, { logChannelId: channel.id });
      await interaction.editReply(`✅ Log channel set to ${channel}. Verification cards and staff review alerts will be posted there.`);
    } else if (sub === "welcome-channel") {
      const channel = interaction.options.getChannel("channel", true) as TextChannel;
      await upsertGuildConfig(guildId, { welcomeChannelId: channel.id });
      await interaction.editReply(`✅ Welcome channel set to ${channel}.`);
    } else if (sub === "status") {
      const config = await getGuildConfig(guildId);
      const lines = [
        `**Verified Role:** ${config?.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : "❌ Not set"}`,
        `**Verification Channel:** ${config?.verificationChannelId ? `<#${config.verificationChannelId}>` : "❌ Not set"}`,
        `**Log Channel:** ${config?.logChannelId ? `<#${config.logChannelId}>` : "❌ Not set"}`,
        `**Welcome Channel:** ${config?.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "❌ Not set"}`,
        `**Enabled:** ${config?.enabled ? "✅ Yes" : "❌ No"}`,
      ];
      await interaction.editReply(`🛡️ **Trust Guard Configuration**\n\n${lines.join("\n")}`);
    }
  },
};

export default setup;
