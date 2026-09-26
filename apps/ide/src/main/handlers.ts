/**
 * C5 invoke handlers: project, settings and dialogs (core), and build/emulator over the PlayController. The assets,
 * toolchain and doctor channels answer `[not-implemented]` until tasks 5-6 wire them.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { type InvokeHandlers, ManifestSummarySchema, type SettingKey } from "@dsdude/ipc-contract";
import type { Diagnostic } from "@dsdude/project-format";
import { loadProject, saveProject } from "@dsdude/project-format/node";
import { detectToolchain, dsdudeHome, projectBuildDir, runDoctor } from "@dsdude/toolchain";
import type { IdeEmulatorManager } from "./build/modes.ts";
import type { PlayController } from "./build/play.ts";
import type { BuildServiceMode } from "./build/protocol.ts";
import { inside, readProjectFile, writeProjectFile } from "./files.ts";
import { importAsset } from "./imports.ts";
import { listLearnDocs, readLearnDoc } from "./learn.ts";
import { createProject, templateSources } from "./projects.ts";
import type { SettingsStore } from "./settings.ts";

export interface DialogLike {
  /** Electron `dialog.showOpenDialog` reduced to what `dialog.open` needs. */
  showOpenDialog(options: {
    title?: string;
    defaultPath?: string;
    properties: ("openDirectory" | "openFile" | "createDirectory")[];
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ canceled: boolean; filePaths: string[] }>;
}

/** Electron `shell.openPath`: resolves to "" on success, else an error message. */
export interface ShellLike {
  openPath(path: string): Promise<string>;
}

export interface AppInfo {
  version: string;
  packaged: boolean;
  defaultProjectsDir: string;
  oneDriveDirs: string[];
}

export interface CoreHandlerDeps {
  settings: SettingsStore;
  dialog: DialogLike;
  shell?: ShellLike;
  /** The repo's samples/ in development (template fallback until WS7 ships templates/); null when packaged. */
  samplesDir?: string | null;
  appInfo?: AppInfo;
  /** The folder that contains docs/ (Learn documents). */
  learnRoot: string;
}

/** The build folder's assets.manifest.json (C3), or null when missing or unreadable. */
export async function readManifest(buildDir: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(join(buildDir, "assets.manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

/**
 * doctor.run and toolchain.status (C10 dsdude doctor, C4 detectToolchain). In mock and fake mode they report canned
 * results, so tests never probe the machine; `real` runs the checks (every tool spawn has its own timeout).
 */
export function createToolHandlers(
  mode: BuildServiceMode,
  deps: {
    doctor?: () => Promise<{ checks: { name: string; status: "ok" | "warn" | "fail" | "info"; detail: string }[] }>;
    detect?: () => Promise<{ installed: boolean; blocksdsVersion: string | null; diagnostics: Diagnostic[] }>;
  } = {},
): InvokeHandlers {
  const fake = mode !== "real";
  return {
    "doctor.run": async () => {
      if (fake)
        return {
          checks: [
            {
              name: "Build service",
              ok: true,
              status: "info",
              detail: `This IDE runs the ${mode} build service, so it needs no tools.`,
            },
          ],
        };
      const report = await (deps.doctor ?? (() => runDoctor({ env: process.env })))();
      return {
        checks: report.checks.map((c) => ({
          name: c.name,
          ok: c.status !== "fail",
          detail: c.detail,
          status: c.status,
        })),
      };
    },
    "toolchain.status": async () => {
      if (fake) return { installed: true, blocksdsVersion: "1.24.0", diagnostics: [] };
      const st = await (deps.detect ?? (() => detectToolchain({ env: process.env })))();
      return { installed: st.installed, blocksdsVersion: st.blocksdsVersion, diagnostics: st.diagnostics };
    },
  };
}

/** build.* and emulator.* over the PlayController (worker + EmulatorManager). */
export function createBuildHandlers(
  play: PlayController,
  emulators: IdeEmulatorManager,
  home: string = dsdudeHome(),
): InvokeHandlers {
  return {
    "build.manifest": async ({ projectDir }) => {
      const raw = await readManifest(projectBuildDir(projectDir, home));
      const parsed = ManifestSummarySchema.safeParse(raw);
      return { manifest: raw !== null && parsed.success ? parsed.data : null };
    },
    "build.play": (req) => play.play(req),
    "build.build": (req) => play.build("build", req),
    "build.compileOnly": (req) => play.build("compileOnly", req),
    "build.cancel": () => {
      play.cancel();
      return { ok: true };
    },
    "emulator.stop": async () => {
      await play.stop();
      return { ok: true };
    },
    "emulator.status": () => play.status(),
    "emulator.install": async ({ kind }) => ({ exe: await emulators.ensureInstalled(kind) }),
  };
}

/** Files the user picked with dialog.open this session: the only paths dialog.readPicked reads. */
export const MAX_PICKED_BYTES = 32 * 1024 * 1024;

export function createCoreHandlers({
  settings,
  dialog,
  shell,
  learnRoot,
  samplesDir = null,
  appInfo,
}: CoreHandlerDeps): InvokeHandlers {
  const picked = new Set<string>();
  return {
    "dialog.readPicked": async ({ path }) => {
      if (!picked.has(path)) throw new Error("only a file you picked can be read");
      if ((await stat(path)).size > MAX_PICKED_BYTES) throw new Error("the file is larger than 32 MB");
      return { bytes: new Uint8Array(await readFile(path)) };
    },
    "assets.import": async (req) => {
      const { name } = await importAsset(req);
      return { name, diagnostics: [] };
    },
    "project.templates": async () => ({
      templates: (await templateSources(learnRoot, samplesDir)).map(({ id, title, description }) => ({
        id,
        title,
        description,
      })),
    }),
    "project.create": async ({ dir, name, template }) => ({
      dir: await createProject({
        parent: dir,
        name,
        template: template ?? "empty",
        sources: await templateSources(learnRoot, samplesDir),
      }),
    }),
    ...(appInfo ? { "app.info": () => appInfo } : {}),
    "learn.openAssets": async () => {
      const path = inside(learnRoot, "docs/tutorial/assets");
      if (!existsSync(path)) throw new Error("the tutorial assets are not installed");
      const failure = shell ? await shell.openPath(path) : "no shell";
      if (failure) throw new Error(failure);
      return { path };
    },
    "project.readFile": async ({ dir, path }) => ({ bytes: await readProjectFile(dir, path) }),
    "project.writeFile": async ({ dir, path, bytes }) => {
      await writeProjectFile(dir, path, bytes);
      return { ok: true };
    },
    "learn.list": async () => ({ docs: await listLearnDocs(learnRoot) }),
    "learn.read": ({ path }) => readLearnDoc(learnRoot, path),
    "project.open": async ({ dir }) => loadProject(dir),
    "project.save": async ({ dir, project }) => {
      await saveProject(dir, project);
      return { ok: true };
    },
    "settings.get": async ({ key }) => ({ value: await settings.get(key) }),
    "settings.set": async ({ key, value }) => {
      await settings.set(key as SettingKey, value as never);
      return { ok: true };
    },
    "settings.getAll": async () => ({ settings: await settings.getAll() }),
    "dialog.open": async ({ kind, title, defaultPath, filters }) => {
      const r = await dialog.showOpenDialog({
        title,
        defaultPath,
        properties: kind === "directory" ? ["openDirectory", "createDirectory"] : ["openFile"],
        filters: kind === "file" ? filters : undefined,
      });
      const paths = r.canceled ? [] : r.filePaths;
      if (kind === "file") for (const p of paths) picked.add(p);
      return { paths };
    },
  };
}
