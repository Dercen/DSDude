/**
 * C8 log lines for Output, Problems and the meters (contracts/log-protocol.md). Unknown line types and keys are
 * ignored as the contract asks; `DSD|PAD|` never reaches here (main drops it) but is dropped again defensively.
 */
import { DIAGNOSTIC_CODE, type Diagnostic } from "@dsdude/project-format";

export type OutputKind = "build" | "info" | "log" | "error" | "ready" | "exit";

export interface OutputLine {
  kind: OutputKind;
  text: string;
}

export type Stats = Record<string, number>;
export type Usage = Record<string, { used: number; total: number }>;

export type ParsedLine =
  | { type: "output"; line: OutputLine }
  | { type: "error"; line: OutputLine; diagnostic: Diagnostic | null }
  | { type: "stat"; stats: Stats }
  | { type: "mem"; usage: Usage; line: OutputLine }
  | { type: "drop" };

function parseStats(text: string): Stats {
  const out: Stats = {};
  for (const pair of text.split(",")) {
    const [k, v] = pair.split("=");
    const n = Number(v);
    if (k && v !== undefined && Number.isFinite(n)) out[k.trim()] = n;
  }
  return out;
}

function parseUsage(text: string): Usage {
  const out: Usage = {};
  for (const pair of text.split(",")) {
    const m = /^\s*([\w]+)=(\d+)\/(\d+)\s*$/.exec(pair);
    if (m?.[1]) out[m[1]] = { used: Number(m[2]), total: Number(m[3]) };
  }
  return out;
}

/** One emulator line (C8) -> what Output, Problems and the meters need. */
export function parseLogLine(raw: string): ParsedLine {
  const line = raw.replace(/\r$/, "");
  if (!line.startsWith("DSD|")) return { type: "output", line: { kind: "info", text: line } };
  const body = line.slice(4);
  const bar = body.indexOf("|");
  const tag = bar < 0 ? body : body.slice(0, bar);
  const rest = bar < 0 ? "" : body.slice(bar + 1);
  switch (tag) {
    case "PAD":
      return { type: "drop" };
    case "LOG":
      return { type: "output", line: { kind: "log", text: rest } };
    case "READY": {
      const [version] = rest.split("|");
      return { type: "output", line: { kind: "ready", text: `Game started (runtime ${version ?? "?"})` } };
    }
    case "EXIT":
      return { type: "output", line: { kind: "exit", text: `Game ended (exit code ${rest})` } };
    case "STAT":
      return { type: "stat", stats: parseStats(rest) };
    case "MEM":
      return { type: "mem", usage: parseUsage(rest), line: { kind: "info", text: `Memory at room start: ${rest}` } };
    case "ERR": {
      // <code>|<object>|<event>|<file>|<line>|<message>; the message is the last field and may contain '|'.
      const f = rest.split("|");
      const [code = "", object = "", event = "", file = "", lineNo = "0"] = f;
      const message = f.slice(5).join("|");
      const n = Number.parseInt(lineNo, 10);
      const where = [object, event].filter(Boolean).join(" ");
      const text = `Error ${code}${where ? ` in ${where}` : ""}${file ? ` (${file}${n > 0 ? `:${n}` : ""})` : ""}: ${message}`;
      const diagnostic: Diagnostic | null =
        DIAGNOSTIC_CODE.test(code) && message
          ? {
              severity: "error",
              code,
              message,
              hint: null,
              file: file || null,
              line: n > 0 ? n : null,
              col: null,
              endLine: null,
              endCol: null,
              source: "runtime",
            }
          : null;
      return { type: "error", line: { kind: "error", text }, diagnostic };
    }
    default:
      // C8: parsers ignore unknown line types.
      return { type: "drop" };
  }
}
