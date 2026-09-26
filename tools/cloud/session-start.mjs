// SessionStart hook for Claude Code cloud sessions (docs/kickoff/README.md section 8.2). Plain JS so Node 22
// runs it; it never fails. Silent unless CLAUDE_CODE_REMOTE=true (so it does nothing on Windows).
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

try {
  if (process.env.CLAUDE_CODE_REMOTE === "true") {
    const envFile = process.env.CLAUDE_ENV_FILE;
    if (envFile) appendFileSync(envFile, "export PATH=/opt/node24/bin:$PATH\nexport DSDUDE_HOME=$HOME/.dsdude\n");
    const ws = process.env.DSDUDE_WS;
    if (ws) {
      const git = (...args) => execFileSync("git", args, { stdio: "ignore", timeout: 30_000 });
      git("config", "core.hooksPath", ".githooks");
      git("config", "core.autocrlf", "false");
      git("config", "dsdude.ws", ws);
    }
  }
} catch {
  // never fail a session start
}
process.exit(0);
