import type { TrustGuardClient } from "../client";
import ping from "./ping";
import setup from "./setup";
import review from "./review";
import stats from "./stats";

const commands = [ping, setup, review, stats];

export function loadCommands(client: TrustGuardClient) {
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
}

export { commands };
