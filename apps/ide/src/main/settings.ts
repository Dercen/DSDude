/**
 * `settings.json` under userData (PLAN.md 6 WS6: `DSDUDE_HOME\userData` in development, `%APPDATA%\DSDude`
 * packaged). Validated with C5 `SettingsSchema`; an unreadable or invalid file falls back to the defaults, field by
 * field, and writes are atomic (temp file + rename).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { type SettingKey, type Settings, SettingsSchema } from "@dsdude/ipc-contract";

export class SettingsStore {
  readonly file: string;
  private cache: Settings | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  async getAll(): Promise<Settings> {
    if (this.cache) return this.cache;
    let raw: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
    } catch {
      // missing or corrupt: defaults
    }
    // Keep every valid field; drop invalid ones to their defaults instead of losing the whole file.
    const clean: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(SettingsSchema.shape)) {
      if (key in raw && field.safeParse(raw[key]).success) clean[key] = raw[key];
    }
    this.cache = SettingsSchema.parse(clean);
    return this.cache;
  }

  async get<K extends SettingKey>(key: K): Promise<Settings[K]> {
    return (await this.getAll())[key];
  }

  async set<K extends SettingKey>(key: K, value: Settings[K]): Promise<void> {
    const next = SettingsSchema.parse({ ...(await this.getAll()), [key]: value });
    this.cache = next;
    const text = `${JSON.stringify(next, null, 2)}\n`;
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, text, "utf8");
      await rename(tmp, this.file);
    });
    await this.writing;
  }
}
