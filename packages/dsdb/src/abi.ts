/**
 * The ABI hash and the builtin environment the assembler needs (contract C2, contracts/dsdb.md "ABI hash").
 * Pure TypeScript; callers pass the parsed contracts/builtins.json.
 */

export interface BuiltinParam {
  name: string;
  type: string;
  default?: string;
}

export interface BuiltinEntry {
  id: number;
  name: string;
  kind: "function" | "variable" | "constant" | "alias" | "unsupported";
  params?: BuiltinParam[];
  minArgs?: number;
  maxArgs?: number;
  returns?: string;
  scope?: "instance" | "global";
  type?: string;
  value?: number;
}

export interface BuiltinsFile {
  contract: string;
  version: string;
  entries: BuiltinEntry[];
}

/** FNV-1a 32 over bytes. */
export function fnv1a32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The canonical line of one function, variable or constant entry: id|name|kind|paramTypes|minArgs|maxArgs|returns|scope|value */
export function abiLine(e: BuiltinEntry): string {
  if (e.kind === "function") {
    const types = (e.params ?? []).map((p) => p.type).join(",");
    return [e.id, e.name, e.kind, types, e.minArgs, e.maxArgs, e.returns, "", ""].join("|");
  }
  if (e.kind === "variable") return [e.id, e.name, e.kind, "", "", "", e.type, e.scope, ""].join("|");
  return [e.id, e.name, e.kind, "", "", "", e.type, "", e.value].join("|");
}

const abiKinds = new Set(["function", "variable", "constant"]);

/** The ABI hash of a builtins table: FNV-1a 32 over the LF-joined canonical lines, in id order. */
export function abiHash(entries: readonly BuiltinEntry[]): number {
  const lines = [...entries]
    .filter((e) => abiKinds.has(e.kind))
    .sort((a, b) => a.id - b.id)
    .map(abiLine);
  return fnv1a32(new TextEncoder().encode(lines.join("\n")));
}

export const hex32 = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");

/** What the assembler and disassembler need from builtins.json. */
export interface BuiltinsEnv {
  abiHash: number;
  /** Builtin function names by dense runtime index (function entries in id order); CALLN's C operand. */
  functions: readonly string[];
  functionIndex: ReadonlyMap<string, number>;
  /**
   * Builtin variable names by dense runtime index (variable entries in id order, DSD_BUILTIN_VARS): the
   * `bivar` operand of GETBI/SETBI/GETBIX/SETBIX/GETBIO/SETBIO (ADR-0005).
   */
  variables: readonly string[];
  variableIndex: ReadonlyMap<string, number>;
}

/** Names of the entries of one kind, in id order: their dense runtime indices. */
const denseNames = (file: BuiltinsFile, kind: BuiltinEntry["kind"]): string[] =>
  file.entries
    .filter((e) => e.kind === kind)
    .sort((a, b) => a.id - b.id)
    .map((e) => e.name);

/** Builds the environment from builtins.json. */
export function builtinsEnv(file: BuiltinsFile): BuiltinsEnv {
  const functions = denseNames(file, "function");
  const variables = denseNames(file, "variable");
  if (functions.length > 256) throw new Error("more than 256 builtin functions do not fit CALLN's C operand");
  return {
    abiHash: abiHash(file.entries),
    functions,
    functionIndex: new Map(functions.map((n, i) => [n, i])),
    variables,
    variableIndex: new Map(variables.map((n, i) => [n, i])),
  };
}
