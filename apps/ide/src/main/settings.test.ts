import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsStore } from "./settings.ts";

const dirs: string[] = [];
function tempFile(): string {
  const d = mkdtempSync(join(tmpdir(), "dsdude-settings-"));
  dirs.push(d);
  return join(d, "userData", "settings.json");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("SettingsStore", () => {
  it("returns defaults without a file and persists a change atomically", async () => {
    const file = tempFile();
    const store = new SettingsStore(file);
    expect(await store.get("emulator")).toBe("melonds");
    await store.set("emulator", "desmume");
    await store.set("recentProjects", ["C:/p"]);
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(onDisk).toMatchObject({ emulator: "desmume", recentProjects: ["C:/p"], firstRunDone: false });
    expect(await new SettingsStore(file).get("emulator")).toBe("desmume");
  });

  it("keeps valid fields of a damaged file and resets the rest", async () => {
    const file = tempFile();
    await new SettingsStore(file).set("firstRunDone", true);
    writeFileSync(file, JSON.stringify({ firstRunDone: true, emulator: "mame", recentProjects: "nope" }));
    const all = await new SettingsStore(file).getAll();
    expect(all.firstRunDone).toBe(true);
    expect(all.emulator).toBe("melonds");
    expect(all.recentProjects).toEqual([]);
    writeFileSync(file, "{ not json");
    expect((await new SettingsStore(file).getAll()).firstRunDone).toBe(false);
  });
});
