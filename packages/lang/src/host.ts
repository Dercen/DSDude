/**
 * Contract C7 v0.1.0: the language-service host API (PLAN.md 5.2 C7). Owner: WS4. Consumer: WS7's
 * `@dsdude/language-service`, which runs it in a Web Worker behind Monaco. Frozen at CP-B.
 *
 * Everything crosses this boundary as plain data (structured-clone safe): no AST, no classes, no Monaco types.
 * - **Files** are project-relative paths with `/`: `objects/<obj>/<event>.dss`, `objects/<obj>/functions.dss`,
 *   `scripts/<name>.dss`. Without a project, or for any other path, a file is a stand-alone program-form file
 *   (contracts/language.md section 1).
 * - **Offsets** are UTF-16 code units into the file's text with `\r` removed (DSDude files are LF). Ranges are
 *   half-open `[start, end)`. Diagnostics use the C9 shape (1-based lines and columns).
 * - The host keeps the latest text of every file: `setProject` loads a C1 Project, `setFile` (or `parse`)
 *   replaces one file, and every query answers for the current state.
 *
 * How to change me: T0 for comments; T1 (minor bump + contracts/CHANGELOG.md) for new methods, new optional
 * fields or new SymbolKind values; T2 (ADR co-signed by WS4 and WS7) for anything else.
 */
import {
  Analysis,
  compileProgram,
  compileProjectModule,
  formatSource,
  indexProgram,
  indexProject,
  type ProjectIndex,
  parse as parseSource,
} from "@dsdude/compiler";
import type { Diagnostic, Project } from "@dsdude/project-format";

export const LANGUAGE_HOST_VERSION = "0.1.0";

/** A half-open range of UTF-16 offsets. */
export interface TextSpan {
  start: number;
  end: number;
}

/** A range in a file. */
export interface SourceLocation extends TextSpan {
  file: string;
}

/** What a name stands for. New kinds may be added (T1); consumers treat unknown kinds as plain names. */
export type SymbolKind =
  | "keyword"
  | "local"
  | "parameter"
  | "instanceVariable"
  | "global"
  | "function"
  | "objectFunction"
  | "builtinFunction"
  | "builtinVariable"
  | "constant"
  | "sprite"
  | "background"
  | "sound"
  | "music"
  | "object"
  | "room";

/** One parameter of a callable symbol. */
export interface ParamInfo {
  name: string;
  /** True when the argument may be left out (a default value, or past a builtin's minimum). */
  optional: boolean;
}

/** A name and what it stands for. Builtins carry no doc here: the docs are builtins.json's (WS7). */
export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  /** One line, e.g. "function die()", "instance variable of obj_bird", "floor(x: number): int". */
  detail: string;
  /** Where it is declared or first given a value; null for builtins and assets. */
  definition: SourceLocation | null;
  /** Parameters for callable symbols; null otherwise. */
  params: ParamInfo[] | null;
  /** True for builtins that take more arguments than they name (choose, min, max). */
  variadic: boolean;
  /** For user functions: the comment right above the declaration, without comment markers; else null. */
  doc: string | null;
}

/** A classified token or comment, for semantic highlighting. */
export interface TokenSpan extends TextSpan {
  kind: "keyword" | "name" | "number" | "string" | "comment" | "operator";
  /** For names: what the name resolves to, or null when unknown (misspelt). */
  symbol: SymbolKind | null;
}

/** `parse` result: the syntax diagnostics (E1xx, W030, W032) and the classified tokens. */
export interface ParseInfo {
  diagnostics: Diagnostic[];
  spans: TokenSpan[];
}

export interface CompletionItem {
  label: string;
  kind: SymbolKind;
  detail: string;
}

/** Signature help for the call around an offset. */
export interface SignatureHelp {
  name: string;
  params: ParamInfo[];
  variadic: boolean;
  /** The argument the offset is in, 0-based (may pass the last parameter for variadic builtins). */
  activeParameter: number;
}

/** An outline entry (the functions of a file). */
export interface OutlineSymbol {
  name: string;
  kind: SymbolKind;
  /** The whole declaration. */
  span: TextSpan;
  /** The name inside it. */
  selection: TextSpan;
}

export interface LanguageServiceHost {
  /** LANGUAGE_HOST_VERSION of this implementation. */
  readonly version: string;
  /** Loads a project (C1); null returns to stand-alone program-form files. Replaces every earlier file. */
  setProject(project: Project | null): void;
  /** Replaces one file's text (see "Files" above). */
  setFile(file: string, text: string): void;
  /** The current text of a file, or null when the host has none. */
  getFile(file: string): string | null;
  /** Records `text` as `fileName`'s text, then returns its syntax diagnostics and classified tokens. */
  parse(text: string, fileName: string): ParseInfo;
  /** Every diagnostic the compiler reports for `file` (syntax, names, types, events), for editor markers. */
  check(file: string): Diagnostic[];
  /** The names visible at `offset` (locals first, then the object's, the project's and the builtins). */
  symbolsAt(file: string, offset: number): SymbolInfo[];
  /** Completion candidates at `offset`: members after `x.`, globals after `global.`, else names and keywords. */
  completionsAt(file: string, offset: number): CompletionItem[];
  /** What `name` is: at `offset` in `file` when given (so locals resolve), otherwise project-wide. */
  hover(name: string, file?: string, offset?: number): SymbolInfo | null;
  /** Where the name at `offset` is declared or first given a value; null for builtins, assets and unknowns. */
  definitionAt(file: string, offset: number): SourceLocation | null;
  /** Every reference to the name at `offset` across the project, its definition included. */
  referencesAt(file: string, offset: number): SourceLocation[];
  /** Signature help for the innermost call whose brackets contain `offset`. */
  signatureAt(file: string, offset: number): SignatureHelp | null;
  /** The functions declared in `file`. */
  documentSymbols(file: string): OutlineSymbol[];
  /** Multi-line blocks, switches and comment runs of `file`. */
  foldingRanges(file: string): TextSpan[];
  /** The formatted text (indentation, spacing, semicolons); code with syntax errors comes back unchanged. */
  format(text: string, fileName?: string): string;
}

/** An empty asset manifest (C4) for checks: the compiler needs only names, which the project provides. */
const NO_MANIFEST = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} } as const;

/** Where a project file's text lives in a C1 Project. */
type Slot =
  | { kind: "event"; object: string; stem: string }
  | { kind: "functions"; object: string }
  | { kind: "script"; name: string };

/** Maps a project-relative path to its place in the project, or null for a stand-alone file. */
function slotOf(file: string): Slot | null {
  const obj = /^objects\/([A-Za-z_][A-Za-z0-9_]*)\/([A-Za-z_][A-Za-z0-9_]*)\.dss$/.exec(file);
  if (obj !== null) {
    const [, object, stem] = obj as unknown as [string, string, string];
    return stem === "functions" ? { kind: "functions", object } : { kind: "event", object, stem };
  }
  const script = /^scripts\/([A-Za-z_][A-Za-z0-9_]*)\.dss$/.exec(file);
  return script === null ? null : { kind: "script", name: script[1] as string };
}

/** functions.dss and scripts hold only functions (language.md section 1). */
function fileKind(file: string): "code" | "functions" {
  const slot = slotOf(file);
  return slot?.kind === "functions" || slot?.kind === "script" ? "functions" : "code";
}

/** Creates a host. It holds no global state, so several can coexist (e.g. one per project). */
export function createLanguageServiceHost(): LanguageServiceHost {
  let project: Project | null = null;
  /** Stand-alone program-form files, by path. */
  const loose = new Map<string, string>();
  /** Analyses, rebuilt lazily after any change. */
  let projectAnalysis: Analysis | null = null;
  const looseAnalysis = new Map<string, Analysis>();
  let projectDiagnostics: Diagnostic[] | null = null;

  const invalidate = (): void => {
    projectAnalysis = null;
    projectDiagnostics = null;
    looseAnalysis.clear();
  };

  /** The project resource that holds `file`, when there is one. */
  const projectText = (file: string): { get(): string | null; set(text: string): boolean } => {
    const slot = project === null ? null : slotOf(file);
    const p = project;
    if (slot === null || p === null) return { get: () => null, set: () => false };
    if (slot.kind === "script")
      return {
        get: () => p.scripts.find((s) => s.name === slot.name)?.source ?? null,
        set: (text) => {
          const s = p.scripts.find((x) => x.name === slot.name);
          if (s !== undefined) s.source = text;
          else p.scripts = [...p.scripts, { name: slot.name, source: text }].sort((a, b) => (a.name < b.name ? -1 : 1));
          return true;
        },
      };
    const obj = p.objects.find((o) => o.name === slot.object);
    if (obj === undefined) return { get: () => null, set: () => false };
    if (slot.kind === "functions")
      return {
        get: () => obj.functions,
        set: (text) => {
          obj.functions = text;
          return true;
        },
      };
    return {
      get: () => obj.events[slot.stem] ?? null,
      set: (text) => {
        obj.events[slot.stem] = text;
        return true;
      },
    };
  };

  /** The analysis that knows `file`. */
  const analysisFor = (file: string): Analysis => {
    if (project !== null && slotOf(file) !== null && projectText(file).get() !== null) {
      projectAnalysis ??= new Analysis(indexProject(project));
      return projectAnalysis;
    }
    let a = looseAnalysis.get(file);
    if (a === undefined) {
      const index: ProjectIndex = indexProgram(loose.get(file) ?? "", file);
      a = new Analysis(index);
      looseAnalysis.set(file, a);
    }
    return a;
  };

  const host: LanguageServiceHost = {
    version: LANGUAGE_HOST_VERSION,
    setProject(p) {
      project = p === null ? null : structuredClone(p);
      loose.clear();
      invalidate();
    },
    setFile(file, text) {
      if (!projectText(file).set(text)) loose.set(file, text);
      invalidate();
    },
    getFile(file) {
      return projectText(file).get() ?? loose.get(file) ?? null;
    },
    parse(text, fileName) {
      host.setFile(fileName, text);
      const parsed = parseSource(text.replace(/\r/g, ""), { file: fileName, kind: fileKind(fileName) });
      return { diagnostics: parsed.diagnostics, spans: analysisFor(fileName).classify(fileName) };
    },
    check(file) {
      if (project !== null && projectText(file).get() !== null) {
        projectDiagnostics ??= compileProjectModule(project, NO_MANIFEST).diagnostics;
        return projectDiagnostics.filter((d) => d.file === file);
      }
      const text = loose.get(file);
      return text === undefined ? [] : compileProgram(text.replace(/\r/g, ""), { file }).diagnostics;
    },
    symbolsAt: (file, offset) => analysisFor(file).symbolsAt(file, offset),
    completionsAt: (file, offset) => analysisFor(file).completionsAt(file, offset),
    hover(name, file, offset) {
      if (file !== undefined && offset !== undefined) {
        const at = analysisFor(file).symbolAt(file, offset);
        if (at !== null && at.name === name) {
          const { span: _span, ...symbol } = at;
          return symbol;
        }
      }
      if (project !== null) {
        projectAnalysis ??= new Analysis(indexProject(project));
        return projectAnalysis.lookup(name);
      }
      return file === undefined ? new Analysis(indexProgram("", "")).lookup(name) : analysisFor(file).lookup(name);
    },
    definitionAt: (file, offset) => analysisFor(file).symbolAt(file, offset)?.definition ?? null,
    referencesAt: (file, offset) => analysisFor(file).referencesAt(file, offset),
    signatureAt: (file, offset) => analysisFor(file).signatureAt(file, offset),
    documentSymbols: (file) => analysisFor(file).documentSymbols(file),
    foldingRanges: (file) => analysisFor(file).foldingRanges(file),
    format: (text, fileName) => formatSource(text, fileName === undefined ? "code" : fileKind(fileName)),
  };
  return host;
}
