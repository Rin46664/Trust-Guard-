import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

export interface Command {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export interface TrustGuardClient extends Client {
  commands: Collection<string, Command>;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
}) as TrustGuardClient;

client.commands = new Collection<string, Command>();

export default client;
