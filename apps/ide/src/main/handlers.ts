/**
 * C5 invoke handlers: project, settings and dialogs (core), and build/emulator over the PlayController. The assets,
 * toolchain and doctor channels answer `[not-implemented]` until tasks 5-6 wire them.
 */

import { existsSync } from "node:fs";
import type { InvokeHandlers, SettingKey } from "@dsdude/ipc-contract";
import { loadProject, saveProject } from "@dsdude/project-format/node";
import type { IdeEmulatorManager } from "./build/modes.ts";
import type { PlayController } from "./build/play.ts";
import { inside, readProjectFile, writeProjectFile } from "./files.ts";
import { listLearnDocs, readLearnDoc } from "./learn.ts";
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

export interface CoreHandlerDeps {
  settings: SettingsStore;
  dialog: DialogLike;
  shell?: ShellLike;
  /** The folder that contains docs/ (Learn documents). */
  learnRoot: string;
}

/** build.* and emulator.* over the PlayController (worker + EmulatorManager). */
export function createBuildHandlers(play: PlayController, emulators: IdeEmulatorManager): InvokeHandlers {
  return {
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

export function createCoreHandlers({ settings, dialog, shell, learnRoot }: CoreHandlerDeps): InvokeHandlers {
  return {
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
      return { paths: r.canceled ? [] : r.filePaths };
    },
  };
}
