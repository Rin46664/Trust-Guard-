import { REST, Routes } from "discord.js";
import { commands } from "./commands/index";
import { logger } from "../lib/logger";

export async function deployCommands() {
  const token = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  const guildId = process.env["DISCORD_GUILD_ID"];

  if (!token || !clientId || !guildId) {
    logger.warn(
      "DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID not set — skipping command deploy"
    );
    return;
  }

  const rest = new REST().setToken(token);
  const body = commands.map((cmd) => cmd.data.toJSON()) as object[];

  try {
    logger.info({ count: body.length }, "Deploying slash commands to guild");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
    logger.info("Slash commands deployed successfully");
  } catch (err) {
    logger.error({ err }, "Failed to deploy slash commands");
  }
}
