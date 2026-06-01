import { Events, type GuildMember } from "discord.js";
import type { TrustGuardClient } from "../client";
import { VERIFY_BUTTON_ID, assignVerifiedRole } from "../lib/verification";
import { logger } from "../../lib/logger";

export default function registerInteractionCreateEvent(client: TrustGuardClient) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        logger.warn({ name: interaction.commandName }, "Unknown command");
        return;
      }
      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, "Command execution failed");
        const reply = { content: "❌ Something went wrong. Please try again.", ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
      await interaction.deferReply({ ephemeral: true });

      const member = interaction.member as GuildMember;
      const success = await assignVerifiedRole(member);

      if (success) {
        await interaction.editReply({
          content: "✅ You've been verified! Welcome to the server.",
        });
        logger.info({ userId: member.id }, "User verified successfully");
      } else {
        await interaction.editReply({
          content: "❌ Verification failed. Please contact an admin.",
        });
      }
    }
  });
}
