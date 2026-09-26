#!/usr/bin/env node
// dsdude CLI entry (C10, contracts/cli.md): runs one command from the registry and exits with its code.
import { commandRegistry, formatHelp } from "./index.ts";

const [command, ...rest] = process.argv.slice(2);
const commands = await commandRegistry();
if (command === undefined || command === "--help" || command === "-h" || command === "help") {
  console.log(formatHelp(commands));
  process.exit(0);
}
const found = commands.find((c) => c.name === command);
if (!found) {
  console.error(`dsdude: unknown command '${command}'. Run dsdude --help for the list.`);
  process.exit(2);
}
process.exitCode = await found.run(rest);
