/**
 * The conversion cache (C3 section 8): `<build>/cache/<sha256>/` holds one converted asset's files plus
 * `meta.json`. Entries are written into a temporary folder and renamed into place, so a crash never leaves a
 * half-written entry that a later run would trust. Deleting `cache/` is always safe. Node side.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { ASSETPACK_CONTRACT_VERSION } from "../manifest.ts";

/**
 * The pipeline's own version, part of every key: bump it whenever a conversion changes its output bytes, so old
 * cache entries are never reused for new rules.
 */
export const PIPELINE_VERSION = "0.1.0";
/** Name of the metadata file in each entry. */
const META_JSON = "meta.json";
/** Bytes of the length prefix written before each key part (so "ab"+"c" and "a"+"bc" differ). */
const LENGTH_PREFIX_BYTES = 4;

/** A cache key: SHA-256 over the length-prefixed parts plus the contract and pipeline versions. */
export function cacheKey(parts: readonly (string | Uint8Array)[]): string {
  const hash = createHash("sha256");
  for (const part of [ASSETPACK_CONTRACT_VERSION, PIPELINE_VERSION, ...parts]) {
    const bytes = typeof part === "string" ? new TextEncoder().encode(part) : part;
    const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
    length.writeUInt32LE(bytes.length);
    hash.update(length).update(bytes);
  }
  return hash.digest("hex");
}

/** The cache under a build folder. */
export class AssetCache {
  readonly root: string;
  /** Counter that keeps temporary folder names unique within this process. */
  private pending = 0;

  constructor(buildDir: string) {
    this.root = path.join(buildDir, "cache");
  }

  /** The folder of an entry. */
  dir(key: string): string {
    return path.join(this.root, key);
  }

  /** An entry's metadata, or null when the entry is missing, incomplete or unreadable. `files` must all exist. */
  read<T>(key: string, files: readonly string[] = []): T | null {
    const dir = this.dir(key);
    const meta = path.join(dir, META_JSON);
    if (!existsSync(meta) || files.some((f) => !existsSync(path.join(dir, f)))) return null;
    try {
      return JSON.parse(readFileSync(meta, "utf8")) as T;
    } catch {
      return null;
    }
  }

  /** Writes an entry atomically: files and meta.json into a temporary folder, then one rename. */
  write(key: string, files: Readonly<Record<string, Uint8Array>>, meta: unknown): string {
    const staged = this.stage(key);
    for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(staged, name), bytes);
    return this.commit(key, staged, meta);
  }

  /** Creates an empty temporary folder for a tool to write into; `commit` later renames it into place. */
  stage(key: string): string {
    const tmp = `${this.dir(key)}.tmp-${process.pid}-${this.pending++}`;
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    return tmp;
  }

  /** Adds meta.json to a staged folder and renames it into place as the entry `key`. */
  commit(key: string, staged: string, meta: unknown): string {
    writeFileSync(path.join(staged, META_JSON), `${JSON.stringify(meta, null, 2)}\n`);
    const dir = this.dir(key);
    rmSync(dir, { recursive: true, force: true });
    renameSync(staged, dir);
    return dir;
  }

  /** Drops a staged folder that will not be committed. */
  discard(staged: string): void {
    rmSync(staged, { recursive: true, force: true });
  }
}
