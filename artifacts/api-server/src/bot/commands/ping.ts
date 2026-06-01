import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../client";

const ping: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Trust Guard is online"),
  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: `🛡️ Trust Guard is online! Latency: **${latency}ms**`,
      ephemeral: true,
    });
  },
};

export default ping;
