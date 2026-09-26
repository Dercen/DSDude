/**
 * EmulatorManager (C4; PLAN.md 2.6, 3.2 step 7). Emulators are GUI processes: they spawn with stdio 'pipe' and
 * WITHOUT windowsHide (Windows would hide their window; spike 2). Both block-buffer stdout on a pipe, so the ROM
 * pads its important lines (C8) and stop() closes gracefully: taskkill /PID (WM_CLOSE flushes stdout), wait up
 * to 2 s, then taskkill /F /T.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { EmulatorHandle, EmulatorKind, EmulatorManager, LaunchOptions } from "./api.ts";
import { ToolchainError, toolchainDiagnostic } from "./diagnostics/catalog.ts";
import { type DownloadFn, type ExtractFn, installMelonDs } from "./emulator-install.ts";
import { DESMUME_EXE, desmumeExe, emulatorsDir, melonDsExe } from "./layout.ts";
import { runProcess } from "./process.ts";

export const PAD_PREFIX = "DSD|PAD|";
export const GRACEFUL_STOP_MS = 2000;
const KILL_WAIT_MS = 5000;
const BACKLOG_MAX = 5000;

/** Splits a byte stream into lines (`\n`, with `\r\n` accepted) and drops the DSD|PAD| flush-pad lines (C8). */
export class LineSplitter {
  #rest = "";

  /** Returns the complete lines in `text`, pad lines removed. */
  push(text: string): string[] {
    const parts = (this.#rest + text).split("\n");
    this.#rest = parts.pop() ?? "";
    return parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l)).filter((l) => !l.startsWith(PAD_PREFIX));
  }

  /** The unterminated tail, once the stream has ended. */
  end(): string[] {
    const rest = this.#rest;
    this.#rest = "";
    return this.push(rest.length > 0 ? `${rest}\n` : "");
  }
}

/** Qt key codes of the default Controls mapping (PLAN.md 6 WS1/WS6). */
export const MELONDS_KEYS: Readonly<Record<string, number>> = {
  A: 88,
  B: 90,
  X: 83,
  Y: 65,
  L: 81,
  R: 87,
  Start: 16777220,
  Select: 16777248,
  Up: 16777235,
  Down: 16777237,
  Left: 16777234,
  Right: 16777236,
};

export interface MelonDsSettings {
  /** Enables the GDB stub on 3333 (ARM9) / 3334 (ARM7); only for Debug. */
  gdb?: boolean;
}

/** The [section] key = value pairs DSDude owns in melonDS.toml. */
export function melonDsOverrides(settings: MelonDsSettings = {}): [string, string, string][] {
  const out: [string, string, string][] = [];
  for (const [key, code] of Object.entries(MELONDS_KEYS)) out.push(["Instance0.Keyboard", key, String(code)]);
  out.push(
    ["Instance0.Window0", "IntegerScaling", "true"],
    ["Instance0.Window0", "ShowOSD", "false"],
    ["3D", "Renderer", "0"],
    ["Screen", "UseGL", "false"],
    ["Instance0.Gdb", "Enabled", settings.gdb ? "true" : "false"],
    ["Instance0.Gdb.ARM9", "Port", "3333"],
    ["Instance0.Gdb.ARM7", "Port", "3334"],
  );
  return out;
}

/**
 * Sets `[section] key = value` pairs in a melonDS TOML text and keeps everything else (window geometry, recent
 * ROMs). melonDS writes a flat file: section headers, `key = value` lines and top-level multi-line arrays.
 */
export function patchToml(text: string | null, overrides: readonly [string, string, string][]): string {
  const lines = text === null || text === "" ? [] : text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const sectionOf = (line: string) => /^\[([^\][]+)\]\s*$/.exec(line)?.[1] ?? null;
  for (const [section, key, value] of overrides) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) if (sectionOf(lines[i] ?? "") === section) start = i;
    if (start === -1) {
      if (lines.length > 0) lines.push("");
      lines.push(`[${section}]`, `${key} = ${value}`);
      continue;
    }
    let end = start + 1;
    while (end < lines.length && sectionOf(lines[end] ?? "") === null) end++;
    const keyRe = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`);
    const at = lines.slice(start + 1, end).findIndex((l) => keyRe.test(l));
    if (at >= 0) {
      lines[start + 1 + at] = `${key} = ${value}`;
    } else {
      let insert = end;
      while (insert > start + 1 && (lines[insert - 1] ?? "").trim() === "") insert--;
      lines.splice(insert, 0, `${key} = ${value}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export type SpawnEmulatorFn = (
  exe: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
) => ChildProcess;

/** The real spawn: stdio 'pipe' and no windowsHide (spike 2: windowsHide hides a GUI emulator's window). */
export const spawnEmulator: SpawnEmulatorFn = (exe, args, opts) =>
  spawn(exe, args, { cwd: opts.cwd, env: opts.env, stdio: "pipe" });

export interface EmulatorManagerOptions {
  /** DSDUDE_HOME: emulators live in <home>\emulators\, with their configs beside them. */
  home: string;
  /** Where DeSmuME 0.9.13 is copied from when missing. */
  desmumeSource?: string;
  spawn?: SpawnEmulatorFn;
  /** Runs taskkill; injectable for tests. */
  taskkill?: (args: string[]) => Promise<void>;
  /** The exe path and start time of a running PID, or null; injectable for tests (default: PowerShell). */
  processInfo?: (pid: number) => Promise<ProcessInfo | null>;
  /** A local melonDS 1.1 release zip (the installer's bundled copy); otherwise ensureInstalled downloads it. */
  melonDsZip?: string;
  download?: DownloadFn;
  extract?: ExtractFn;
  /** How long stop() waits after taskkill /PID before /F; default GRACEFUL_STOP_MS. */
  gracefulStopMs?: number;
}

const realTaskkill = async (args: string[]) => {
  await runProcess("taskkill.exe", args, {
    env: { ...process.env } as Record<string, string>,
    timeoutMs: 10_000,
    windowsHide: true,
  });
};

interface RunningRecord {
  pid: number;
  kind: EmulatorKind;
  /** The emulator exe that was spawned. */
  exe: string;
  rom: string;
  /** ISO time taken right after spawn; the OS start time must be within RECONCILE_TOLERANCE_MS of it. */
  startedAt: string;
}

export interface ProcessInfo {
  /** Full path of the process image. */
  path: string;
  startedAt: Date;
}

/** How far the OS start time of a recorded PID may be from the recorded spawn time and still be that process. */
export const RECONCILE_TOLERANCE_MS = 10_000;

/** Get-Process path and start time (UTC) of one PID; null when there is no such process. */
export async function powershellProcessInfo(pid: number): Promise<ProcessInfo | null> {
  const script = `$p = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($p) { $p.Path + '|' + $p.StartTime.ToUniversalTime().ToString('o') }`;
  const run = await runProcess("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env } as Record<string, string>,
    timeoutMs: 20_000,
    windowsHide: true,
  });
  const [p, t] = run.stdout.trim().split("|");
  const startedAt = new Date(t ?? "");
  return p && !Number.isNaN(startedAt.getTime()) ? { path: p, startedAt } : null;
}

export class LocalEmulatorManager implements EmulatorManager {
  readonly home: string;
  readonly #opts: EmulatorManagerOptions;
  #current: EmulatorHandle | null = null;

  constructor(opts: EmulatorManagerOptions) {
    this.home = opts.home;
    this.#opts = opts;
  }

  exePath(kind: EmulatorKind): string {
    return kind === "melonds" ? melonDsExe(this.home) : desmumeExe(this.home);
  }

  get runningFile(): string {
    return path.join(emulatorsDir(this.home), "running.json");
  }

  async ensureInstalled(kind: EmulatorKind): Promise<string> {
    const exe = this.exePath(kind);
    if (existsSync(exe)) return exe;
    if (kind === "desmume" && this.#opts.desmumeSource) {
      const src = path.join(this.#opts.desmumeSource, DESMUME_EXE);
      if (existsSync(src)) {
        mkdirSync(path.dirname(exe), { recursive: true });
        copyFileSync(src, exe);
        return exe;
      }
    }
    if (kind === "melonds") {
      return installMelonDs({
        exe,
        zip: this.#opts.melonDsZip,
        download: this.#opts.download,
        extract: this.#opts.extract,
      });
    }
    throw new ToolchainError([toolchainDiagnostic("E620", { emulator: "DeSmuME 0.9.13", path: exe, kind })]);
  }

  /** melonDS.toml beside melonDS.exe (a portable build), rewritten before every launch. */
  writeMelonDsConfig(settings: MelonDsSettings = {}): string {
    const file = path.join(path.dirname(this.exePath("melonds")), "melonDS.toml");
    const current = existsSync(file) ? readFileSync(file, "utf8") : null;
    writeFileSync(file, patchToml(current, melonDsOverrides(settings)));
    return file;
  }

  async launch(romPath: string, opts: LaunchOptions & { kind: EmulatorKind }): Promise<EmulatorHandle> {
    // One emulator per manager: the previous one must have exited before its config is rewritten.
    if (opts.debug && opts.kind !== "melonds") throw new ToolchainError([toolchainDiagnostic("E623")]);
    await this.stopCurrent();
    await this.reconcile();
    const exe = await this.ensureInstalled(opts.kind);
    if (!existsSync(romPath)) {
      throw new ToolchainError([toolchainDiagnostic("E607", { what: "The ROM", path: romPath })]);
    }
    if (opts.kind === "melonds") this.writeMelonDsConfig({ gdb: opts.debug === true });
    const spawnFn = this.#opts.spawn ?? spawnEmulator;
    const child = spawnFn(exe, [path.resolve(romPath)], {
      cwd: path.dirname(exe),
      env: { ...process.env, ...opts.env },
    });
    const handle = this.#wrap(opts.kind, child);
    if (child.pid === undefined) {
      const name = opts.kind === "melonds" ? "melonDS" : "DeSmuME";
      throw new ToolchainError([toolchainDiagnostic("E621", { emulator: name, detail: `${exe} did not start` })]);
    }
    this.#current = handle;
    this.#writeRunning({ pid: child.pid, kind: opts.kind, exe, rom: romPath, startedAt: new Date().toISOString() });
    const pid = child.pid;
    handle.exited.then(() => {
      if (this.#current === handle) this.#current = null;
      this.#clearRunning(pid);
    });
    return handle;
  }

  /** Stops the emulator this manager launched, if any. */
  async stopCurrent(): Promise<void> {
    const current = this.#current;
    this.#current = null;
    if (current) await current.stop();
  }

  /**
   * Kills (/F /T) an emulator left running by an earlier process, e.g. a crashed IDE or CLI: the PID in
   * running.json, but only while it is still the same process. Windows reuses PIDs, so the process must run the
   * recorded exe (this worktree's copy) and have started within RECONCILE_TOLERANCE_MS of the recorded time.
   * Call it at startup and before quit; launch() calls it too. Returns whether it killed something.
   */
  async reconcile(): Promise<boolean> {
    if (!existsSync(this.runningFile)) return false;
    let killed = false;
    try {
      const rec = JSON.parse(readFileSync(this.runningFile, "utf8")) as RunningRecord;
      const recorded = Date.parse(rec.startedAt);
      if (Number.isInteger(rec.pid) && rec.pid > 0 && typeof rec.exe === "string" && !Number.isNaN(recorded)) {
        const info = await (this.#opts.processInfo ?? powershellProcessInfo)(rec.pid);
        if (
          info !== null &&
          info.path.toLowerCase() === rec.exe.toLowerCase() &&
          Math.abs(info.startedAt.getTime() - recorded) <= RECONCILE_TOLERANCE_MS
        ) {
          await this.#taskkill(["/F", "/T", "/PID", String(rec.pid)]);
          killed = true;
        }
      }
    } catch {
      // A broken record names no process we could safely kill.
    }
    rmSync(this.runningFile, { force: true });
    return killed;
  }

  #taskkill(args: string[]): Promise<void> {
    return (this.#opts.taskkill ?? realTaskkill)(args);
  }

  /** Removes running.json if it still records `pid` (a newer launch may have replaced it). */
  #clearRunning(pid: number): void {
    try {
      const rec = JSON.parse(readFileSync(this.runningFile, "utf8")) as RunningRecord;
      if (rec.pid === pid) rmSync(this.runningFile, { force: true });
    } catch {
      // Already gone or unreadable: nothing recorded for this PID.
    }
  }

  #writeRunning(rec: RunningRecord): void {
    mkdirSync(path.dirname(this.runningFile), { recursive: true });
    writeFileSync(this.runningFile, `${JSON.stringify(rec)}\n`);
  }

  #wrap(kind: EmulatorKind, child: ChildProcess): EmulatorHandle {
    const listeners = new Set<(line: string) => void>();
    const backlog: string[] = [];
    const splitter = new LineSplitter();
    const deliver = (lines: string[]) => {
      for (const line of lines) {
        backlog.push(line);
        if (backlog.length > BACKLOG_MAX) backlog.shift();
        for (const l of listeners) l(line);
      }
    };
    child.stdout?.setEncoding("latin1");
    child.stderr?.setEncoding("latin1");
    child.stdout?.on("data", (text: string) => deliver(splitter.push(text)));
    child.stderr?.on("data", (text: string) => deliver(splitter.push(text)));
    const exited = new Promise<number | null>((resolve) => {
      child.once("close", (code) => {
        deliver(splitter.end());
        resolve(code);
      });
      child.once("error", () => resolve(null));
    });
    let stopping: Promise<void> | null = null;
    const pid = child.pid ?? null;
    const stop = (): Promise<void> => {
      stopping ??= (async () => {
        if (pid === null || child.exitCode !== null) return;
        await this.#taskkill(["/PID", String(pid)]);
        const graceful = await Promise.race([
          exited.then(() => true),
          new Promise<boolean>((r) => setTimeout(() => r(false), this.#opts.gracefulStopMs ?? GRACEFUL_STOP_MS)),
        ]);
        if (!graceful) {
          await this.#taskkill(["/F", "/T", "/PID", String(pid)]);
          await Promise.race([exited, new Promise((r) => setTimeout(r, KILL_WAIT_MS))]);
        }
      })();
      return stopping;
    };
    return {
      kind,
      pid,
      exited,
      onLine(listener) {
        for (const line of backlog) listener(line);
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      stop,
    };
  }
}
