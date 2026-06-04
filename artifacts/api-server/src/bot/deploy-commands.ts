import { REST, Routes } from "discord.js";
import { commands } from "./commands/index";
import { logger } from "../lib/logger";

export async function deployCommands() {
  const token = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"]?.replace(/[^0-9]/g, "");

  if (!token || !clientId) {
    logger.warn("DISCORD_TOKEN or DISCORD_CLIENT_ID not set — skipping command deploy");
    return;
  }

  const rest = new REST().setToken(token);
  const body = commands.map((cmd) => cmd.data.toJSON()) as object[];

  try {
    logger.info({ count: body.length }, "Deploying slash commands globally");
    await rest.put(Routes.applicationCommands(clientId), { body });
    logger.info("Global slash commands deployed successfully — active in all servers");
  } catch (err) {
    logger.error({ err }, "Failed to deploy slash commands");
  }
}
