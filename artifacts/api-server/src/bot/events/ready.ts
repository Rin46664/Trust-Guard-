import { Events } from "discord.js";
import type { TrustGuardClient } from "../client";
import { logger } from "../../lib/logger";

export default function registerReadyEvent(client: TrustGuardClient) {
  client.once(Events.ClientReady, (readyClient) => {
    logger.info({ tag: readyClient.user.tag }, "Trust Guard is online");
  });
}
