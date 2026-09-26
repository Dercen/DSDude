/**
 * @dsdude/dsdb: contract C2's container. Table-driven encode/decode/assemble/disassemble of DSDB bytecode and
 * its `.dsda` text form. Browser-safe; `@dsdude/dsdb/node` reads contracts/builtins.json from the repo.
 * Written by WS0 in Phase 0; owner WS4 from the tag (WS2 co-signs).
 */
export * from "./abi.ts";
export * from "./asm.ts";
export * from "./encode.ts";
export { OPCODES, OPCODES_VERSION, type OpcodeInfo, type OpcodeStatus } from "./gen/opcodes.ts";
export * from "./model.ts";

export const packageName = "@dsdude/dsdb";
/** C2 container version; see contracts/dsdb.md. */
export const CONTRACT_VERSION = "0.2.0";
