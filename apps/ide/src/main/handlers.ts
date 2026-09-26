/**
 * C5 invoke handlers: project, settings and dialogs (core), and build/emulator over the PlayController. The assets,
 * toolchain and doctor channels answer `[not-implemented]` until tasks 5-6 wire them.
 */
import type { InvokeHandlers, SettingKey } from "@dsdude/ipc-contract";
import { loadProject, saveProject } from "@dsdude/project-format/node";
import type { IdeEmulatorManager } from "./build/modes.ts";
import type { PlayController } from "./build/play.ts";
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

export interface CoreHandlerDeps {
  settings: SettingsStore;
  dialog: DialogLike;
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

export function createCoreHandlers({ settings, dialog }: CoreHandlerDeps): InvokeHandlers {
  return {
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
