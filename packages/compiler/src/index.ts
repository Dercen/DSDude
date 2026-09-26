/**
 * @dsdude/compiler: the DSS compiler (WS4). Read packages/compiler/CLAUDE.md first.
 *
 * Worker-safe: nothing reachable from this entry point imports Node APIs, so the IDE can run it in a Web Worker.
 * The syntax tree is internal to WS4 (PLAN.md 5.2 C7); `@dsdude/lang` builds the public C7 host on top of it.
 */
export { BANNED_WORDS, COMPILER_CATALOG, COMPILER_CATALOG_ENTRIES, type CompilerCode } from "./diagnostics/catalog.ts";
export { type DiagArgs, type LineCol, LineMap, Reporter } from "./diagnostics/report.ts";
export type * from "./syntax/ast.ts";
export {
  type Comment,
  decimalToFixedRaw,
  FIXED_ONE,
  KEYWORDS,
  type LexResult,
  lex,
  type Token,
  type TokenKind,
} from "./syntax/lexer.ts";
export { type FileKind, isLValue, type ParseOptions, type ParseResult, parse } from "./syntax/parser.ts";

export const packageName = "@dsdude/compiler";
export {
  Analysis,
  type CompletionInfo,
  type OutlineSymbol,
  type ParamInfo,
  type SignatureInfo,
  type SymbolAt,
  type SymbolInfo,
  type SymbolKind,
  type TokenClass,
} from "./analysis.ts";
export { type CompilerCliIo, type CompilerCliOptions, cliCommands, makeCompilerCliCommands } from "./cli.ts";
export { COMPILER_BUILTINS_ENV } from "./codegen/abi.ts";
export { formatSource, INDENT } from "./format.ts";
export { compileProgram, indexProgram, MAIN_FUNCTION, type ProgramOptions, type ProgramResult } from "./program.ts";
export {
  type CompileProjectOptions,
  type CompileProjectResult,
  compileProject,
  compileProjectModule,
  indexProject,
} from "./project.ts";
export type { ProjectIndex, SourceLocation } from "./project-index.ts";
