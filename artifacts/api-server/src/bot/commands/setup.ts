import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  type TextChannel,
} from "discord.js";
import type { Command } from "../client";
import { sendVerificationMessage } from "../lib/verification";

const setup: Command = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Post the verification message in a channel (Admin only)")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to post the verification message in")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const channel = interaction.options.getChannel("channel", true) as TextChannel;

    await interaction.deferReply({ ephemeral: true });

    try {
      await sendVerificationMessage(channel);
      await interaction.editReply({
        content: `✅ Verification message posted in ${channel}.`,
      });
    } catch (err) {
      await interaction.editReply({
        content: "❌ Failed to post the verification message. Check my permissions in that channel.",
      });
    }
  },
};

export default setup;
