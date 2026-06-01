import client from "./client";
import { loadCommands } from "./commands/index";
import registerReadyEvent from "./events/ready";
import registerGuildMemberAddEvent from "./events/guildMemberAdd";
import registerInteractionCreateEvent from "./events/interactionCreate";
import { deployCommands } from "./deploy-commands";
import { logger } from "../lib/logger";

export async function startBot() {
  const token = process.env["DISCORD_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_TOKEN not set — Discord bot will not start");
    return;
  }

  loadCommands(client);
  registerReadyEvent(client);
  registerGuildMemberAddEvent(client);
  registerInteractionCreateEvent(client);

  await deployCommands();
  await client.login(token);
  logger.info("Trust Guard bot logged in");
}

export default client;
