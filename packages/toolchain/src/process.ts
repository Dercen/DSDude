/**
 * The one way this package runs a console process (tools, bash/make, python, taskkill). Every spawn gets a timeout,
 * an explicit windowsHide, and a tree kill when the timeout fires or the signal aborts (make spawns gcc).
 * Emulators are GUI processes and do not come through here (emulator.ts).
 */
import { spawn } from "node:child_process";
import treeKill from "tree-kill";

export interface RunOptions {
  cwd?: string;
  env: Record<string, string>;
  timeoutMs: number;
  /** true for every console tool; emulators never come through runProcess. */
  windowsHide: boolean;
  /** Receives output as it arrives (stdout and stderr interleaved). */
  onOutput?: (text: string) => void;
  signal?: AbortSignal;
}

export interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  /** Set when the process could not start at all (e.g. ENOENT). */
  spawnError: string | null;
}

/** Windows exit code when a DLL the program imports is missing (STATUS_DLL_NOT_FOUND). */
export const EXIT_DLL_NOT_FOUND = 0xc0000135;

const MAX_CAPTURE = 1 << 20;

function append(buf: string, text: string): string {
  const out = buf + text;
  return out.length > MAX_CAPTURE ? out.slice(out.length - MAX_CAPTURE) : out;
}

export function runProcess(exe: string, args: readonly string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const result: RunResult = {
      exitCode: null,
      stdout: "",
      stderr: "",
      timedOut: false,
      cancelled: false,
      spawnError: null,
    };
    if (opts.signal?.aborted) {
      resolve({ ...result, cancelled: true });
      return;
    }
    const child = spawn(exe, args, {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: opts.windowsHide,
      timeout: opts.timeoutMs,
      killSignal: "SIGKILL",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const kill = () => {
      if (child.pid !== undefined) treeKill(child.pid, "SIGKILL", () => {});
    };
    const timer = setTimeout(() => {
      result.timedOut = true;
      kill();
    }, opts.timeoutMs);
    const onAbort = () => {
      result.cancelled = true;
      kill();
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (text: string) => {
      result.stdout = append(result.stdout, text);
      opts.onOutput?.(text);
    });
    child.stderr?.on("data", (text: string) => {
      result.stderr = append(result.stderr, text);
      opts.onOutput?.(text);
    });
    child.on("error", (err) => {
      result.spawnError = err.message;
      finish();
    });
    child.on("close", (code, signal) => {
      result.exitCode = code;
      // Node's own `timeout` kill (the backstop to the timer above) reports only the signal.
      if (signal === "SIGKILL" && !result.cancelled) result.timedOut = true;
      finish();
    });
  });
}

/** The last non-empty lines of a tool's output, for a diagnostic message. */
export function outputTail(result: Pick<RunResult, "stdout" | "stderr">, lines = 3): string {
  const all = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return all.slice(-lines).join(" / ") || "no output";
}
