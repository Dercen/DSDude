/**
 * The BuiltinsEnv that @dsdude/dsdb's encoder needs, built from the generated builtins table instead of
 * contracts/builtins.json, so the compiler stays free of file IO (it runs in a Web Worker).
 */
import type { BuiltinsEnv } from "@dsdude/dsdb";
import { ABI_HASH, BUILTIN_FUNCTIONS } from "../gen/builtins.ts";

/** Builtin function names by dense runtime index (CALLN's C operand), from the generated table. */
const functions = [...BUILTIN_FUNCTIONS].sort((a, b) => a.runtimeIndex - b.runtimeIndex).map((f) => f.name);

export const COMPILER_BUILTINS_ENV: BuiltinsEnv = {
  abiHash: ABI_HASH,
  functions,
  functionIndex: new Map(functions.map((name, i) => [name, i])),
};
