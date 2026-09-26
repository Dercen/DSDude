/**
 * Golden-file helpers for tests (Node only; never imported by the compiler itself). Goldens are written as bytes
 * and compared with "\r" stripped, so a CRLF checkout on Windows compares equal (CLAUDE.md "Goldens and traces").
 * Set DSDUDE_UPDATE_GOLDENS=1 to rewrite them instead of comparing; then run `node tools/gen-dsdb.ts` for the
 * .dsdb siblings of new or changed .dsda goldens.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** The repository root, four levels above packages/compiler/src. */
export const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

/** True when the run should rewrite goldens rather than compare against them. */
export const UPDATING_GOLDENS = process.env.DSDUDE_UPDATE_GOLDENS === "1";

/**
 * Compares `actual` with the golden text at `path` (repo-relative), or writes it when updating.
 * @returns the golden text (without "\r") to compare against, or `actual` when it was just written
 */
export function goldenText(path: string, actual: string): string {
  const full = join(REPO_ROOT, path);
  if (UPDATING_GOLDENS || !existsSync(full)) {
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(actual, "utf8"));
    return actual;
  }
  return readFileSync(full).toString("utf8").replace(/\r/g, "");
}

/** Reads a repo-relative binary file. */
export function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(join(REPO_ROOT, path)));
}
