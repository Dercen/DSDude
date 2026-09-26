/**
 * Turns (code, placeholder values, source range) into a C9 Diagnostic. Every compiler stage reports through a
 * `Reporter`, so the "one mistake yields one diagnostic" rule (contracts/diagnostics.md) can be enforced in one
 * place: while `suppressed` is true, reports are dropped (the parser sets it while it resynchronises).
 */
import { type Diagnostic, makeDiagnostic } from "@dsdude/project-format";
import { COMPILER_CATALOG, type CompilerCode } from "./catalog.ts";

/** Placeholder values for a catalog template (`{name}` -> value). */
export type DiagArgs = Readonly<Record<string, string | number>>;

/** 1-based line and column of one source offset. */
export interface LineCol {
  line: number;
  col: number;
}

/**
 * Maps UTF-16 offsets to 1-based lines and columns. Columns count UTF-16 code units, which is what Monaco uses.
 * A "\r" before a "\n" counts as part of the line it ends, so CRLF files report the same columns as LF files.
 */
export class LineMap {
  /** Offset of the first character of each line; lineStarts[0] is always 0. */
  private readonly lineStarts: number[] = [0];

  constructor(text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === NEWLINE) this.lineStarts.push(i + 1);
  }

  /** Converts an offset (clamped to the text) into a 1-based line and column. */
  at(offset: number): LineCol {
    // Binary search for the last line start <= offset.
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((this.lineStarts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - (this.lineStarts[lo] as number) + 1 };
  }
}

/** Char code of "\n", the only character that starts a new line. */
const NEWLINE = 10;

/** Collects diagnostics for one source file. */
export class Reporter {
  /** Everything reported so far, in report order. */
  readonly diagnostics: Diagnostic[] = [];
  /** While true, `report` drops everything (used during parser resynchronisation). */
  suppressed = false;
  /** Project-relative path with "/" separators, or null when the text is not tied to a file. */
  readonly file: string | null;
  private readonly lines: LineMap;

  /**
   * @param file project-relative path with "/" separators, or null when the text is not tied to a file
   * @param text the full source text, used to turn offsets into lines and columns
   */
  constructor(file: string | null, text: string) {
    this.file = file;
    this.lines = new LineMap(text);
  }

  /** 1-based line and column of an offset in this file. */
  at(offset: number): LineCol {
    return this.lines.at(offset);
  }

  /**
   * Reports `code` over the half-open source range [start, end). An empty or one-character range becomes a
   * single position (endLine/endCol null); otherwise the end is inclusive, as C9 requires.
   * @returns true when the diagnostic was recorded, false when it was suppressed
   */
  report(code: CompilerCode, args: DiagArgs, start: number, end: number = start): boolean {
    if (this.suppressed) return false;
    const from = this.lines.at(start);
    const single = end - start <= 1;
    const to = single ? null : this.lines.at(end - 1);
    this.diagnostics.push(
      makeDiagnostic(COMPILER_CATALOG[code], "compiler", args, {
        file: this.file,
        line: from.line,
        col: from.col,
        endLine: to === null ? null : to.line,
        endCol: to === null ? null : to.col,
      }),
    );
    return true;
  }
}
