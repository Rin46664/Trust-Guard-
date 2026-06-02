import { EmbedBuilder, type TextChannel } from "discord.js";
import client from "../client";
import { getGuildConfig } from "./db";
import { logger } from "../../lib/logger";

type LogTarget = "log" | "error" | "scripts";

async function sendToChannel(guildId: string, target: LogTarget, embed: EmbedBuilder): Promise<void> {
  try {
    const config = await getGuildConfig(guildId);
    if (!config) return;

    const channelId =
      target === "log" ? config.logChannelId
      : target === "error" ? config.errorLogChannelId
      : config.scriptsChannelId;

    if (!channelId) return;

    const ch = (await client.channels.fetch(channelId).catch(() => null)) as TextChannel | null;
    if (ch?.isTextBased()) {
      await ch.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.error({ err, guildId, target }, "channelLogger: failed to send");
  }
}

export function logEvent(guildId: string, embed: EmbedBuilder): void {
  void sendToChannel(guildId, "log", embed);
}

export function logError(guildId: string, embed: EmbedBuilder): void {
  void sendToChannel(guildId, "error", embed);
}

export function logScript(guildId: string, embed: EmbedBuilder): void {
  void sendToChannel(guildId, "scripts", embed);
}

export function makeEventEmbed(
  title: string,
  description: string,
  fields: { name: string; value: string; inline?: boolean }[] = [],
  color = 0x5865f2
): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
  if (fields.length) e.addFields(fields);
  return e;
}

export function makeErrorEmbed(
  title: string,
  error: unknown,
  context: { name: string; value: string; inline?: boolean }[] = []
): EmbedBuilder {
  const msg = error instanceof Error ? error.message : String(error);
  const e = new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(`\`\`\`\n${msg.slice(0, 1000)}\n\`\`\``)
    .setColor(0xed4245)
    .setTimestamp();
  if (context.length) e.addFields(context);
  return e;
}

export function makeScriptEmbed(
  commandPath: string,
  userId: string,
  subcommand: string,
  extraFields: { name: string; value: string; inline?: boolean }[] = []
): EmbedBuilder {
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Command", value: `\`${commandPath}\``, inline: true },
    { name: "User", value: `<@${userId}>`, inline: true },
  ];
  if (subcommand) fields.push({ name: "Subcommand", value: `\`${subcommand}\``, inline: true });
  fields.push(...extraFields);
  return new EmbedBuilder()
    .setTitle("⚙️ Command Executed")
    .setColor(0xfee75c)
    .addFields(fields)
    .setTimestamp();
}
