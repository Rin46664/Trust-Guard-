import type { TrustGuardClient } from "../client";
import ping from "./ping";
import config from "./config";
import dev from "./dev";
import review from "./review";
import stats from "./stats";
import logs from "./logs";
import userinfo from "./userinfo";

const commands = [ping, config, dev, review, stats, logs, userinfo];

export function loadCommands(client: TrustGuardClient) {
  for (const command of commands) {
    client.commands.set(command.data.name, command);
  }
}

export { commands };
