/**
 * Test helpers: golden byte files under fixtures/assets/expected/ and fixture paths. Used only by *.test.ts
 * (Node side). Set DSDUDE_UPDATE_GOLDENS=1 to rewrite the goldens; review the diff before committing.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root (this file is packages/asset-pipeline/src/testing/golden.ts). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
/** WS5's fixture folder. */
export const FIXTURES = join(REPO_ROOT, "fixtures/assets");
/** Where golden outputs live (WS5-owned; fixtures/assets/golden/ is WS0's py-desmume folder). */
export const EXPECTED = join(FIXTURES, "expected");
/** Environment switch that rewrites goldens instead of comparing. */
const UPDATE_ENV = "DSDUDE_UPDATE_GOLDENS";

/** Reads a repository file as bytes. */
export function readRepoFile(relative: string): Uint8Array {
  return new Uint8Array(readFileSync(join(REPO_ROOT, relative)));
}

/** SHA-256 hex of some bytes (for readable failure messages). */
export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Compares `actual` with fixtures/assets/expected/<name> byte for byte (binary, never text), or writes it when
 * DSDUDE_UPDATE_GOLDENS=1. Returns the golden's bytes so callers can assert on them further.
 */
export function matchGolden(name: string, actual: Uint8Array): { expected: Uint8Array; equal: boolean } {
  const path = join(EXPECTED, name);
  if (process.env[UPDATE_ENV] === "1" || !existsSync(path)) {
    if (process.env[UPDATE_ENV] !== "1") throw new Error(`missing golden ${path}: run with ${UPDATE_ENV}=1`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual);
  }
  const expected = new Uint8Array(readFileSync(path));
  return { expected, equal: Buffer.from(expected).equals(Buffer.from(actual)) };
}
