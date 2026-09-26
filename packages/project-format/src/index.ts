/**
 * @dsdude/project-format: contracts C1 (project format) and C9 (Diagnostic shape). Browser-safe:
 * no Node imports here; the Node adapter is the `@dsdude/project-format/node` subpath.
 */

export { PROJECT_CATALOG, PROJECT_CATALOG_ENTRIES } from "./diagnostics/catalog.ts";
export * from "./diagnostics.ts";
export * from "./project.ts";
export * from "./schema.ts";

export const packageName = "@dsdude/project-format";
/** C1 version; see contracts/project-format.md. */
export const CONTRACT_VERSION = "0.1.0";
