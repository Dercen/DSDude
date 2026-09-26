/**
 * Contract C9 v0.1.0: the Diagnostic shape shared by every producer (project-format, compiler, assets,
 * toolchain, runtime). Spec and style rules: contracts/diagnostics.md.
 * How to change me: T0 for comments; T1 (minor bump + CHANGELOG) for a new optional field or source;
 * T2 (ADR co-signed by every producer) for anything else. Owner: WS0.
 */
import { z } from "zod";

export const DIAGNOSTICS_CONTRACT_VERSION = "0.1.0";

/** error blocks Play; warning (W0xx lints) does not; info is advice only. */
export const SeveritySchema = z.enum(["error", "warning", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** Who produced the diagnostic. Each source owns one catalog (contracts/diagnostics.md). */
export const DiagnosticSourceSchema = z.enum(["project", "compiler", "assets", "toolchain", "runtime"]);
export type DiagnosticSource = z.infer<typeof DiagnosticSourceSchema>;

/** E1xx syntax, E2xx names/assets, E3xx types/arity/events, E4xx limits, E6xx build, W0xx lints, R5xx runtime. */
export const DIAGNOSTIC_CODE = /^(E[1-4]\d\d|E6\d\d|W0\d\d|R5\d\d)$/;

export const DiagnosticSchema = z.object({
  severity: SeveritySchema,
  /** e.g. "E101", "W030", "R510". Shown after the message, as a link to docs/reference/errors.md. */
  code: z.string().regex(DIAGNOSTIC_CODE),
  /** What happened, in plain words (no banned words; contracts/diagnostics.md). */
  message: z.string().min(1),
  /** What to do about it; null when the message already says it. */
  hint: z.string().nullable(),
  /** Project-relative path with "/" separators, e.g. "objects/obj_bird/step.dss"; null when not tied to a file. */
  file: z.string().nullable(),
  /** 1-based; null when not tied to a position. */
  line: z.int().min(1).nullable(),
  col: z.int().min(1).nullable(),
  /** Inclusive end of the range; null means a single position. */
  endLine: z.int().min(1).nullable(),
  endCol: z.int().min(1).nullable(),
  source: DiagnosticSourceSchema,
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

/** One entry of a producer's catalog; tools/gen-docs renders all five catalogs into docs/reference/errors.md. */
export interface CatalogEntry {
  code: string;
  severity: Severity;
  /** Short title for the reference page, e.g. "Missing project.json". */
  title: string;
  /** Message template; `{name}` placeholders are filled by the producer. */
  message: string;
  /** Hint template, or null. */
  hint: string | null;
}

/** Fills `{key}` placeholders in a catalog template. Unknown keys stay as written. */
export function formatTemplate(template: string, args: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in args ? String(args[key]) : whole));
}

/** Builds a Diagnostic from a catalog entry; the location fields default to null. */
export function makeDiagnostic(
  entry: CatalogEntry,
  source: DiagnosticSource,
  args: Readonly<Record<string, string | number>> = {},
  at: Partial<Pick<Diagnostic, "file" | "line" | "col" | "endLine" | "endCol">> = {},
): Diagnostic {
  return {
    severity: entry.severity,
    code: entry.code,
    message: formatTemplate(entry.message, args),
    hint: entry.hint === null ? null : formatTemplate(entry.hint, args),
    file: at.file ?? null,
    line: at.line ?? null,
    col: at.col ?? null,
    endLine: at.endLine ?? null,
    endCol: at.endCol ?? null,
    source,
  };
}
