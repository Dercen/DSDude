/**
 * @dsdude/lang: the DSS language-service host (contract C7, `src/host.ts`). Read packages/lang/CLAUDE.md first.
 * The lexer, parser and checker live in @dsdude/compiler; this package is their plain-data face for editors.
 */
export * from "./host.ts";

export const packageName = "@dsdude/lang";
