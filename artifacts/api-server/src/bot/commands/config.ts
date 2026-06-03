import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import type { Command } from "../client";
import { upsertGuildConfig, getGuildConfig } from "../lib/db";
import { sendVerificationMessage } from "../lib/verification";
import { logEvent, makeEventEmbed } from "../lib/channelLogger";

function statusLine(label: string, value: string | null | undefined, type: "channel" | "role" | "text" = "text"): string {
  if (!value) return `${label}: ❌ Not set`;
  if (type === "channel") return `${label}: <#${value}>`;
  if (type === "role") return `${label}: <@&${value}>`;
  return `${label}: ${value}`;
}

const config: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure Trust Guard for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName("verify-channel")
        .setDescription("Set the verification channel and post the verify button there")
        .addChannelOption(opt =>
          opt.setName("channel").setDescription("Verification channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("log-channel")
        .setDescription("Set the channel for activity logs (joins, verifications, reviews)")
        .addChannelOption(opt =>
          opt.setName("channel").setDescription("Activity log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("error-channel")
        .setDescription("Set the channel for error reports and bot failures")
        .addChannelOption(opt =>
          opt.setName("channel").setDescription("Error log channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("scripts-channel")
        .setDescription("Set the channel where all executed commands are logged")
        .addChannelOption(opt =>
          opt.setName("channel").setDescription("Scripts & commands channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("welcome-channel")
        .setDescription("Set the channel where verification cards are posted after verification")
        .addChannelOption(opt =>
          opt.setName("channel").setDescription("Welcome channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("bot-channel")
        .setDescription("Restrict bot commands to one channel (administrators are exempt)")
        .addChannelOption(opt =>
          opt.setName("channel").setDescription("Bot commands channel").addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("verified-role")
        .setDescription("Set the role granted to users after successful verification")
        .addRoleOption(opt =>
          opt.setName("role").setDescription("Verified role").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("staff-role")
        .setDescription("Set the role that can access staff commands (review, stats, logs, userinfo)")
        .addRoleOption(opt =>
          opt.setName("role").setDescription("Staff role").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("toggle")
        .setDescription("Enable or disable Trust Guard verification for this server")
        .addBooleanOption(opt =>
          opt.setName("enabled").setDescription("Enable or disable").setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("status")
        .setDescription("Show the full current Trust Guard configuration")
    )
    .addSubcommand(sub =>
      sub.setName("difficulty")
        .setDescription("Set default verification difficulty (tier) for all new members")
        .addIntegerOption(opt =>
          opt.setName("level")
            .setDescription("Tier level — Auto lets risk scoring decide")
            .setRequired(true)
            .addChoices(
              { name: "Auto (use risk assessment)", value: 0 },
              { name: "Tier 1 — Instant access (trusted accounts only)", value: 1 },
              { name: "Tier 2 — Captcha only", value: 2 },
              { name: "Tier 3 — Captcha + questionnaire", value: 3 },
              { name: "Tier 4 — Captcha + questionnaire + challenge", value: 4 },
              { name: "Tier 5 — All steps + staff review", value: 5 },
              { name: "Tier 6 — All steps + mandatory staff review", value: 6 },
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("reset")
        .setDescription("⚠️ Clear ALL Trust Guard settings back to default")
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    await interaction.deferReply({ ephemeral: true });

    switch (sub) {

      case "verify-channel": {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await upsertGuildConfig(guildId, { verificationChannelId: channel.id });
        await sendVerificationMessage(channel, guildId);
        logEvent(guildId, makeEventEmbed(
          "⚙️ Verify Channel Updated",
          `Verification channel set to <#${channel.id}> by <@${interaction.user.id}>.`,
          [{ name: "Channel", value: `<#${channel.id}>`, inline: true }]
        ));
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Verification Channel Set")
              .setDescription(`Verification message posted in <#${channel.id}>.\nNew members will be directed here to verify.`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "log-channel": {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await upsertGuildConfig(guildId, { logChannelId: channel.id });
        logEvent(guildId, makeEventEmbed(
          "⚙️ Log Channel Updated",
          `Activity log channel set to <#${channel.id}> by <@${interaction.user.id}>.`
        ));
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Log Channel Set")
              .setDescription(`Activity logs (joins, verifications, reviews) → <#${channel.id}>`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "error-channel": {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await upsertGuildConfig(guildId, { errorLogChannelId: channel.id });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Error Channel Set")
              .setDescription(`Error reports and bot failures → <#${channel.id}>`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "scripts-channel": {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await upsertGuildConfig(guildId, { scriptsChannelId: channel.id });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Scripts Channel Set")
              .setDescription(`All executed commands will be logged to <#${channel.id}>`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "welcome-channel": {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await upsertGuildConfig(guildId, { welcomeChannelId: channel.id });
        logEvent(guildId, makeEventEmbed(
          "⚙️ Welcome Channel Updated",
          `Welcome channel set to <#${channel.id}> by <@${interaction.user.id}>.`
        ));
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Welcome Channel Set")
              .setDescription(`Verification cards will be posted to <#${channel.id}> after verification.`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "bot-channel": {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;
        await upsertGuildConfig(guildId, { botChannelId: channel.id });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Bot Channel Restricted")
              .setDescription(`Commands are now only accepted in <#${channel.id}>.\n\n> Administrators can still use commands anywhere.`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "verified-role": {
        const role = interaction.options.getRole("role", true);
        await upsertGuildConfig(guildId, { verifiedRoleId: role.id });
        logEvent(guildId, makeEventEmbed(
          "⚙️ Verified Role Updated",
          `Verified role set to <@&${role.id}> by <@${interaction.user.id}>.`,
          [{ name: "Role", value: `<@&${role.id}>`, inline: true }]
        ));
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Verified Role Set")
              .setDescription(`Users who pass verification will receive <@&${role.id}>.`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "staff-role": {
        const role = interaction.options.getRole("role", true);
        await upsertGuildConfig(guildId, { staffRoleId: role.id });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Staff Role Set")
              .setDescription(`Members with <@&${role.id}> can now use: \`/review\`, \`/stats\`, \`/logs\`, \`/userinfo\``)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "toggle": {
        const enabled = interaction.options.getBoolean("enabled", true);
        await upsertGuildConfig(guildId, { enabled });
        logEvent(guildId, makeEventEmbed(
          `⚙️ Trust Guard ${enabled ? "Enabled" : "Disabled"}`,
          `Bot was ${enabled ? "enabled" : "disabled"} by <@${interaction.user.id}>.`,
          [], enabled ? 0x57f287 : 0xed4245
        ));
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle(enabled ? "✅ Trust Guard Enabled" : "⏸️ Trust Guard Disabled")
              .setDescription(
                enabled
                  ? "Trust Guard is now **active**. New members will go through verification."
                  : "Trust Guard is now **disabled**. Verification will not run for new members."
              )
              .setColor(enabled ? 0x57f287 : 0xfee75c).setTimestamp()
          ]
        });
        break;
      }

      case "difficulty": {
        const level = interaction.options.getInteger("level", true);
        const tierOverride = level === 0 ? null : level;
        await upsertGuildConfig(guildId, { tierOverride });
        const levelLabels: Record<number, string> = {
          0: "Auto (risk assessment)",
          1: "Tier 1 — Instant access",
          2: "Tier 2 — Captcha only",
          3: "Tier 3 — Captcha + questionnaire",
          4: "Tier 4 — Captcha + questionnaire + challenge",
          5: "Tier 5 — All steps + staff review",
          6: "Tier 6 — All steps + mandatory staff review",
        };
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("✅ Difficulty Level Set")
              .setDescription(`All new members will now be routed to: **${levelLabels[level]}**`)
              .setColor(0x57f287).setTimestamp()
          ]
        });
        break;
      }

      case "status": {
        const cfg = await getGuildConfig(guildId);
        const difficultyLabel = cfg?.tierOverride == null
          ? "Auto (risk assessment)"
          : `Tier ${cfg.tierOverride} (forced)`;
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🛡️ Trust Guard — Configuration")
              .setDescription(cfg ? "Current settings for this server." : "⚠️ No config found. Run `/config` subcommands to set up.")
              .setColor(cfg?.enabled !== false ? 0x5865f2 : 0x99aab5)
              .addFields(
                {
                  name: "📋 Channels",
                  value: [
                    statusLine("🔒 Verification", cfg?.verificationChannelId, "channel"),
                    statusLine("📋 Activity Logs", cfg?.logChannelId, "channel"),
                    statusLine("❌ Error Logs", cfg?.errorLogChannelId, "channel"),
                    statusLine("⚙️ Scripts & Codes", cfg?.scriptsChannelId, "channel"),
                    statusLine("🎉 Welcome", cfg?.welcomeChannelId, "channel"),
                    statusLine("🤖 Bot Commands Only", cfg?.botChannelId, "channel"),
                  ].join("\n"),
                  inline: false,
                },
                {
                  name: "👥 Roles",
                  value: [
                    statusLine("✅ Verified Role", cfg?.verifiedRoleId, "role"),
                    statusLine("👮 Staff Role", cfg?.staffRoleId, "role"),
                  ].join("\n"),
                  inline: false,
                },
                { name: "⚡ Status", value: cfg?.enabled !== false ? "✅ Enabled" : "❌ Disabled", inline: true },
                { name: "🎯 Difficulty", value: difficultyLabel, inline: true },
              )
              .setFooter({ text: `Guild: ${guildId}` })
              .setTimestamp()
          ]
        });
        break;
      }

      case "reset": {
        await upsertGuildConfig(guildId, {
          verifiedRoleId: null,
          verificationChannelId: null,
          logChannelId: null,
          errorLogChannelId: null,
          scriptsChannelId: null,
          welcomeChannelId: null,
          botChannelId: null,
          staffRoleId: null,
          tierOverride: null,
          enabled: true,
        });
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔄 Configuration Reset")
              .setDescription("All Trust Guard settings have been cleared.\nUse `/config` subcommands to reconfigure.")
              .setColor(0xfee75c).setTimestamp()
          ]
        });
        break;
      }
    }
  },
};

export default config;
