#!/usr/bin/env node
// dsdude CLI entry (C10). Phase-0 skeleton: WS1 registers the commands from each package's `cliCommands`.
import { packageName } from "./index.ts";

const [command] = process.argv.slice(2);
if (command === undefined || command === "--help" || command === "-h") {
  console.log(`${packageName}: no commands yet (WS1 implements contracts/cli.md)`);
  process.exit(0);
}
console.error(`dsdude: unknown command '${command}'`);
process.exit(2);
