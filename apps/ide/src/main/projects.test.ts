import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProject } from "@dsdude/project-format/node";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, EMPTY_TEMPLATE, templateSources } from "./projects.ts";

const repo = resolve(import.meta.dirname, "../../../..");
const samples = join(repo, "samples");
const dirs: string[] = [];
function temp(): string {
  const d = mkdtempSync(join(tmpdir(), "dsdude-np-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("templates", () => {
  it("falls back to Empty plus the repo's samples until templates/index.json exists", async () => {
    const list = await templateSources(temp(), samples);
    expect(list[0]).toEqual(EMPTY_TEMPLATE);
    expect(list.map((t) => t.id)).toContain("sample-flappy");
    expect(list.map((t) => t.id)).not.toContain("sample-hello"); // a BlocksDS folder, not a DSDude project
    expect(await templateSources(temp(), null)).toEqual([EMPTY_TEMPLATE]);
  });

  it("reads templates/index.json when it exists", async () => {
    const root = temp();
    mkdirSync(join(root, "templates", "blank"), { recursive: true });
    writeFileSync(
      join(root, "templates", "index.json"),
      JSON.stringify({ templates: [{ id: "blank", title: "Blank", dir: "blank" }] }),
    );
    const list = await templateSources(root, samples);
    expect(list).toEqual([{ id: "blank", title: "Blank", description: "", dir: join(root, "templates", "blank") }]);
  });
});

describe("createProject", () => {
  it("creates an Empty project that C1 loads with the given name", async () => {
    const parent = temp();
    const dir = await createProject({ parent, name: "my_game", template: "empty", sources: [EMPTY_TEMPLATE] });
    expect(dir).toBe(join(parent, "my_game"));
    const { project, diagnostics } = await loadProject(dir);
    expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(project?.project).toMatchObject({ name: "my_game", title: "my_game", firstRoom: "rm_main" });
    expect(project?.rooms.map((r) => r.name)).toEqual(["rm_main"]);
    // The default icon is a real 32x32 PNG.
    const icon = readFileSync(join(dir, "icon.png"));
    expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect([icon.readUInt32BE(16), icon.readUInt32BE(20)]).toEqual([32, 32]);
  });

  it("copies a template, renames it and never copies a build folder", async () => {
    const src = join(temp(), "tpl");
    const { cpSync } = await import("node:fs");
    cpSync(join(samples, "flappy"), src, { recursive: true });
    mkdirSync(join(src, "build"), { recursive: true });
    writeFileSync(join(src, "build", "old.nds"), "x");
    const parent = temp();
    const dir = await createProject({
      parent,
      name: "bird_game",
      template: "flappy",
      sources: [{ id: "flappy", title: "Flappy Bird", description: "", dir: src }],
    });
    const { project } = await loadProject(dir);
    expect(project?.project.name).toBe("bird_game");
    expect(project?.objects.map((o) => o.name)).toContain("obj_bird");
    expect(existsSync(join(dir, "sprites", "spr_bird", "sheet.png"))).toBe(true);
    expect(existsSync(join(dir, "build"))).toBe(false);
  });

  it("refuses a non-empty folder and an unknown template", async () => {
    const parent = temp();
    mkdirSync(join(parent, "taken"));
    writeFileSync(join(parent, "taken", "x.txt"), "x");
    await expect(
      createProject({ parent, name: "taken", template: "empty", sources: [EMPTY_TEMPLATE] }),
    ).rejects.toThrow("not empty");
    await expect(createProject({ parent, name: "a", template: "nope", sources: [EMPTY_TEMPLATE] })).rejects.toThrow(
      "no template",
    );
  });
});
