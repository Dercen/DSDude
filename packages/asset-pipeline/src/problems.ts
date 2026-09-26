/**
 * Problems found by the pure conversions, before they know which asset or file they belong to. The pack layer
 * turns each one into a C9 Diagnostic with `toDiagnostic`, adding the asset name and the project-relative file.
 */
import { type Diagnostic, makeDiagnostic } from "@dsdude/project-format";
import { ASSET_CATALOG, type AssetCode } from "./diagnostics/catalog.ts";

/** A catalog code plus the placeholder values the conversion knows. */
export interface Problem {
  code: AssetCode;
  args: Record<string, string | number>;
}

/** The C9 `source` of every asset diagnostic. */
export const DIAGNOSTIC_SOURCE = "assets";

/**
 * Builds the Diagnostic for a problem: `name` fills `{name}`, and `file` (the project-relative path, or null) is both
 * the location and `{file}`. The problem's own arguments win over both.
 */
export function toDiagnostic(problem: Problem, name: string | null, file: string | null): Diagnostic {
  const args = { ...(name === null ? {} : { name }), ...(file === null ? {} : { file }), ...problem.args };
  return makeDiagnostic(ASSET_CATALOG[problem.code], DIAGNOSTIC_SOURCE, args, { file });
}

/** Shorthand for the pack layer: a diagnostic straight from a code and its arguments. */
export function diagnostic(
  code: AssetCode,
  args: Record<string, string | number>,
  file: string | null = null,
): Diagnostic {
  return makeDiagnostic(ASSET_CATALOG[code], DIAGNOSTIC_SOURCE, args, { file });
}
