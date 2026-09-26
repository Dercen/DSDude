import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readProjectFile, writeProjectFile } from "./files.ts";
import { imageSources, listLearnDocs, readLearnDoc, titleOf } from "./learn.ts";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const dirs: string[] = [];
function temp(): string {
  const d = mkdtempSync(join(tmpdir(), "dsdude-learn-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function docsTree(): string {
  const root = temp();
  const put = (rel: string, data: string | Buffer) => {
    mkdirSync(join(root, rel, ".."), { recursive: true });
    writeFileSync(join(root, rel), data);
  };
  put(
    "docs/tutorial/flappy-bird.md",
    "# Flappy Bird\n\n![The bird](assets/bird.png)\n![remote](https://x.test/a.png)\n",
  );
  put("docs/tutorial/assets/bird.png", PNG);
  put("docs/tutorial/assets/notes.md", "# not a chapter");
  put("docs/manual/sprites.md", 'Intro without a heading\n<img src="../tutorial/assets/bird.png" alt="b">\n');
  put("docs/manual/secret.md", "![x](../../../outside.png)");
  put("docs/reference/errors.md", "# Errors\n\n## E101\n");
  put("docs/status/ws6.md", "# not Learn");
  put("outside.png", PNG);
  return root;
}

describe("Learn documents", () => {
  it("lists tutorial, manual and reference markdown with titles, skipping assets folders", async () => {
    expect(await listLearnDocs(docsTree())).toEqual([
      { path: "docs/tutorial/flappy-bird.md", section: "tutorial", title: "Flappy Bird" },
      { path: "docs/manual/secret.md", section: "manual", title: "secret" },
      { path: "docs/manual/sprites.md", section: "manual", title: "sprites" },
      { path: "docs/reference/errors.md", section: "reference", title: "Errors" },
    ]);
    expect(await listLearnDocs(temp())).toEqual([]);
  });

  it("inlines local images as data: URLs and leaves remote and outside images out", async () => {
    const root = docsTree();
    const doc = await readLearnDoc(root, "docs/tutorial/flappy-bird.md");
    expect(Object.keys(doc.images)).toEqual(["assets/bird.png"]);
    expect(doc.images["assets/bird.png"]).toBe(`data:image/png;base64,${PNG.toString("base64")}`);
    expect(Object.keys((await readLearnDoc(root, "docs/manual/sprites.md")).images)).toEqual([
      "../tutorial/assets/bird.png",
    ]);
    expect((await readLearnDoc(root, "docs/manual/secret.md")).images).toEqual({});
  });

  it("finds image sources and titles", () => {
    expect(imageSources('![a](x.png) ![b](<y z.png> "t") ![c](data:image/png;base64,AA) <IMG SRC="w.gif">')).toEqual([
      "x.png",
      "y z.png",
      "w.gif",
    ]);
    expect(titleOf("text\n# Rooms and views #\n", "f")).toBe("Rooms and views");
  });
});

describe("project asset files", () => {
  it("writes atomically and reads back inside the project only", async () => {
    const dir = temp();
    await writeProjectFile(dir, "sprites/spr_new/sheet.png", PNG);
    expect(Buffer.from(await readProjectFile(dir, "sprites/spr_new/sheet.png"))).toEqual(PNG);
    await expect(readProjectFile(dir, "../outside.png")).rejects.toThrow("outside");
    await expect(writeProjectFile(dir, "C:/Windows/x.png", PNG)).rejects.toThrow();
  });
});
