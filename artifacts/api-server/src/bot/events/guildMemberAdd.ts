import { Events } from "discord.js";
import type { TrustGuardClient } from "../client";
import { logger } from "../../lib/logger";

export default function registerGuildMemberAddEvent(client: TrustGuardClient) {
  client.on(Events.GuildMemberAdd, async (member) => {
    logger.info({ userId: member.id, guildId: member.guild.id }, "New member joined");
  });
}
