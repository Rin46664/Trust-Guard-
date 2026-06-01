import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { logger } from "../../lib/logger";

export const VERIFY_BUTTON_ID = "trustguard_verify";

export function buildVerificationEmbed() {
  return new EmbedBuilder()
    .setTitle("🛡️ Welcome to the server!")
    .setDescription(
      "To gain access to the rest of the server, please verify yourself by clicking the button below.\n\n" +
      "By verifying, you agree to follow the server rules."
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Trust Guard • Verification" })
    .setTimestamp();
}

export function buildVerificationRow() {
  const button = new ButtonBuilder()
    .setCustomId(VERIFY_BUTTON_ID)
    .setLabel("Verify Me")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("✅");

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export async function assignVerifiedRole(member: GuildMember): Promise<boolean> {
  const roleId = process.env["DISCORD_VERIFIED_ROLE_ID"];
  if (!roleId) {
    logger.warn("DISCORD_VERIFIED_ROLE_ID is not set — skipping role assignment");
    return false;
  }

  const role = member.guild.roles.cache.get(roleId);
  if (!role) {
    logger.error({ roleId }, "Verified role not found in guild");
    return false;
  }

  try {
    await member.roles.add(role);
    logger.info({ userId: member.id, roleId }, "Assigned verified role");
    return true;
  } catch (err) {
    logger.error({ err, userId: member.id }, "Failed to assign verified role");
    return false;
  }
}

export async function sendVerificationMessage(channel: TextChannel) {
  await channel.send({
    embeds: [buildVerificationEmbed()],
    components: [buildVerificationRow()],
  });
}
