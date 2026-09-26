// The store end to end in node: store -> createLocalBridge (C5 validation) -> main's real handlers ->
// PlayController -> MockBuildService + fake emulator, with events flowing back through the same bridge.
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalBridge } from "@dsdude/ipc-contract";
import type { Diagnostic } from "@dsdude/project-format";
import { MockBuildService } from "@dsdude/toolchain";
import { afterEach, describe, expect, it } from "vitest";
import { FakeEmulatorManager } from "../../main/build/modes.ts";
import { PlayController } from "../../main/build/play.ts";
import { createBuildHandlers, createCoreHandlers } from "../../main/handlers.ts";
import { SettingsStore } from "../../main/settings.ts";
import { eventDocId } from "./documents.ts";
import { createIde, OUTPUT_LIMIT, problemsOf } from "./ide.ts";

const flappy = resolve(import.meta.dirname, "../../../../../samples/flappy");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const compileError: Diagnostic = {
  severity: "error",
  code: "E101",
  message: "A ')' is missing.",
  hint: "Add ')' at the end of the line.",
  file: "objects/obj_bird/step.dss",
  line: 2,
  col: 4,
  endLine: null,
  endCol: null,
  source: "compiler",
};

function setup(
  opts: { diagnostics?: Diagnostic[]; emulatorLines?: string[]; savePanels?: () => Promise<boolean> } = {},
) {
  const tmp = mkdtempSync(join(tmpdir(), "dsdude-store-"));
  dirs.push(tmp);
  const projectDir = join(tmp, "flappy");
  cpSync(flappy, projectDir, { recursive: true });
  const service = new MockBuildService({ diagnostics: opts.diagnostics });
  const emulators = new FakeEmulatorManager(opts.emulatorLines);
  const settings = new SettingsStore(join(tmp, "settings.json"));
  let emit: ReturnType<typeof createLocalBridge>["emit"] = () => {};
  const play: PlayController = new PlayController({
    worker: {
      run: (mode, req) => (mode === "build" ? service.build(req) : service.compileOnly(req)),
      cancel: () => service.cancel(),
    },
    emulators,
    send: (c, p) => emit(c, p),
    controlsLine: async () => "Controls: Arrows = D-pad",
    defaultEmulator: async () => "melonds",
  });
  service.onEvent(play.onBuildEvent);
  const local = createLocalBridge({
    ...createCoreHandlers({
      learnRoot: tmp,
      settings,
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [projectDir] }) },
    }),
    ...createBuildHandlers(play, emulators),
  });
  emit = local.emit;
  const calls: string[] = [];
  const ide = createIde(
    local.bridge,
    {
      openDocument: (id) => calls.push(`open:${id}`),
      openResource: (r) => calls.push(`resource:${r.kind}:${r.name}`),
      showLearn: () => calls.push("learn"),
      focusPanel: (id) => calls.push(`focus:${id}`),
    },
    { savePanels: opts.savePanels },
  );
  const off = ide.actions.connect();
  return { ...ide, projectDir, calls, off, settings, emit: local.emit };
}

const settle = () => new Promise((r) => setTimeout(r, 80));

describe("IDE store", () => {
  it("opens samples/flappy through the dialog and remembers it", async () => {
    const { store, actions, projectDir, settings } = setup();
    await actions.chooseAndOpenProject();
    const s = store.getState();
    expect(s.projectDir).toBe(projectDir);
    expect(s.project?.objects.map((o) => o.name)).toContain("obj_bird");
    expect(errors(s.loadDiagnostics)).toEqual([]);
    expect(await settings.get("recentProjects")).toEqual([projectDir]);
  });

  it("boots into the most recent project", async () => {
    const a = setup();
    await a.actions.openProject(a.projectDir);
    const b = createIde(
      createLocalBridge(
        createCoreHandlers({
          learnRoot: a.projectDir,
          settings: a.settings,
          dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
        }),
      ).bridge,
      { openDocument: () => {}, openResource: () => {}, showLearn: () => {}, focusPanel: () => {} },
    );
    await b.actions.boot();
    expect(b.store.getState().projectDir).toBe(a.projectDir);
  });

  it("edits a document, saves it through project-format and clears dirty", async () => {
    const { store, actions, projectDir } = setup();
    await actions.openProject(projectDir);
    const id = eventDocId("obj_bird", "step");
    actions.editDocument(id, "// edited\n");
    expect(store.getState().dirty).toEqual({ [id]: true });
    expect(await actions.save()).toBe(true);
    expect(store.getState().dirty).toEqual({});
    expect(readFileSync(join(projectDir, "objects/obj_bird/step.dss"), "utf8")).toBe("// edited\n");
  });

  it("plays against the mock: fake log in Output, then Stop", async () => {
    const { store, actions, projectDir } = setup();
    await actions.openProject(projectDir);
    await actions.play();
    await settle();
    let s = store.getState();
    expect(s.build.status).toBe("running");
    const texts = s.output.map((l) => l.text);
    expect(texts).toContain("Controls: Arrows = D-pad");
    expect(texts).toContain("Game started (runtime 0.1.0)");
    expect(texts).toContain("hello");
    await actions.stop();
    await settle();
    s = store.getState();
    expect(s.build.status).toBe("idle");
    expect(s.output.at(-1)).toEqual({ kind: "exit", text: "Game ended (exit code 0)" });
  });

  it("saves dirty documents before Play", async () => {
    const { actions, projectDir } = setup();
    await actions.openProject(projectDir);
    actions.editDocument(eventDocId("obj_bird", "create"), "// before play\n");
    await actions.play();
    expect(readFileSync(join(projectDir, "objects/obj_bird/create.dss"), "utf8")).toBe("// before play\n");
    await actions.stop();
  });

  it("puts errors in Problems, shows the toast and focuses Problems when Play fails", async () => {
    const { store, actions, projectDir, calls } = setup({ diagnostics: [compileError] });
    await actions.openProject(projectDir);
    await actions.play();
    const s = store.getState();
    expect(s.build.status).toBe("idle");
    expect(problemsOf(s)).toEqual([compileError]);
    expect(s.toast?.message).toBe("Fix 1 problem to play");
    expect(calls).toContain("focus:problems");
    actions.revealDiagnostic(compileError);
    expect(calls).toContain("open:objects/obj_bird/step.dss");
    expect(store.getState().reveal).toMatchObject({ docId: "objects/obj_bird/step.dss", line: 2, col: 4 });
  });

  it("turns DSD|ERR into a runtime problem and STAT into stats", async () => {
    const { store, actions, projectDir } = setup({
      emulatorLines: [
        "DSD|READY|0.1.0|0dd9987a",
        "DSD|STAT|fps=59,oam_drop=1",
        "DSD|ERR|R510|obj_bird|Step|objects/obj_bird/step.dss|3|spr_x is not loaded in rm_game",
      ],
    });
    await actions.openProject(projectDir);
    await actions.play();
    await settle();
    const s = store.getState();
    expect(s.runtimeDiagnostics.map((d) => d.code)).toEqual(["R510"]);
    expect(s.stats).toEqual({ fps: 59, oam_drop: 1 });
    await actions.stop();
  });

  it("caps Output at OUTPUT_LIMIT lines, keeping the newest", () => {
    const { store, emit } = setup();
    const lines = Array.from({ length: OUTPUT_LIMIT + 1000 }, (_, i) => `line ${i}`);
    emit("build.log", { lines });
    const out = store.getState().output;
    expect(out).toHaveLength(OUTPUT_LIMIT);
    expect(out.at(-1)?.text).toBe(`line ${OUTPUT_LIMIT + 999}`);
  });

  it("updates a resource through the C12 path and marks its file dirty", async () => {
    const { store, actions, projectDir } = setup();
    await actions.openProject(projectDir);
    const before = store.getState().project;
    const next = actions.updateResource({ kind: "object", name: "obj_bird" }, (d) => {
      const o = d.objects.find((x) => x.name === "obj_bird");
      if (o) o.depth = -5;
    });
    expect(next).not.toBe(before);
    expect(store.getState().dirty).toEqual({ "objects/obj_bird/object.json": true });
    // A no-op recipe changes nothing.
    actions.updateResource({ kind: "object", name: "obj_bird" }, () => {});
    expect(store.getState().project).toBe(next);
    await actions.save();
    expect(JSON.parse(readFileSync(join(projectDir, "objects/obj_bird/object.json"), "utf8")).depth).toBe(-5);
  });

  it("opens Learn on the first launch only, and from targets or URIs", async () => {
    const a = setup();
    await a.actions.boot();
    expect(a.calls).toContain("learn");
    expect(await a.settings.get("learnOpened")).toBe(true);
    expect(a.store.getState().learn.target).toBeNull();
    a.actions.openLearn("dsdude-learn:/docs/reference/errors.md#e101");
    expect(a.store.getState().learn.target).toEqual({ path: "docs/reference/errors.md", anchor: "e101" });
    const seq = a.store.getState().learn.seq;
    a.actions.openLearn({ path: "docs/manual/sprites.md" });
    expect(a.store.getState().learn.seq).toBe(seq + 1);
    a.calls.length = 0;
    await a.actions.boot();
    expect(a.calls).not.toContain("learn");
  });

  it("saves dirty editor panels before project.save, and stops when they fail", async () => {
    let panelSaves = 0;
    let ok = true;
    const { actions, projectDir } = setup({
      savePanels: async () => {
        panelSaves++;
        return ok;
      },
    });
    await actions.openProject(projectDir);
    actions.editDocument(eventDocId("obj_bird", "step"), "// a\n");
    expect(await actions.save()).toBe(true);
    expect(panelSaves).toBe(1);
    ok = false;
    actions.editDocument(eventDocId("obj_bird", "step"), "// b\n");
    expect(await actions.save()).toBe(false);
    expect(readFileSync(join(projectDir, "objects/obj_bird/step.dss"), "utf8")).toBe("// a\n");
  });

  it("shows the Controls card on the first successful Play of the session only", async () => {
    const { store, actions, projectDir } = setup();
    await actions.openProject(projectDir);
    await actions.play();
    expect(store.getState().controlsCard).toBe(true);
    actions.hideControls();
    await actions.stop();
    await actions.play();
    expect(store.getState().controlsCard).toBe(false);
    actions.showControls(); // Help > Controls
    expect(store.getState().controlsCard).toBe(true);
    await actions.stop();
  });

  it("does not show the Controls card when Play fails", async () => {
    const { store, actions, projectDir } = setup({ diagnostics: [compileError] });
    await actions.openProject(projectDir);
    await actions.play();
    expect(store.getState().controlsCard).toBe(false);
  });

  it("reports a missing tutorial assets folder in a toast", async () => {
    const { store, actions } = setup();
    await actions.openTutorialAssets();
    expect(store.getState().toast?.message).toMatch(/Could not open the tutorial assets: .*not installed/);
  });

  it("opens the first-run wizard until it has been finished once", async () => {
    const a = setup();
    await a.actions.boot();
    expect(a.store.getState().firstRun).toBe(true);
    await a.actions.finishFirstRun();
    expect(a.store.getState().firstRun).toBe(false);
    expect(await a.settings.get("firstRunDone")).toBe(true);
    await a.actions.boot();
    expect(a.store.getState().firstRun).toBe(false);
  });

  it("asks for a project before Play", async () => {
    const { store, actions } = setup();
    await actions.play();
    expect(store.getState().toast?.message).toBe("Open a project first.");
  });
});

function errors(ds: Diagnostic[]) {
  return ds.filter((d) => d.severity === "error");
}
