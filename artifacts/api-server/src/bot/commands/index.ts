import type { TrustGuardClient } from "../client";
import ping from "./ping";
import setup from "./setup";

const commands = [ping, setup];

export function loadCommands(client: TrustGuardClient) {
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
}

export { commands };
