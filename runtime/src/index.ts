/** @dsdude/runtime: the C8 runtime artifact helpers (WS3). The C sources are built by runtime/Makefile. */
export {
  ARM7_ELF,
  formatReport,
  formatVersion,
  IMAGE_BUDGET_BYTES,
  ITCM_CEILING_BYTES,
  type MemoryReport,
  memoryReport,
  parseNm,
  parseSizeA,
  parseVersion,
  readAbiHash,
  reportProblems,
  runtimeTreeHash,
  TREE_EXCLUDES,
  type VersionInfo,
} from "./artifact.ts";

export const packageName = "@dsdude/runtime";
