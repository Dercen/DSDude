/**
 * C5 invoke handlers that need no build worker. Build, emulator, assets and toolchain channels are wired with the
 * build worker and EmulatorManager (task 3; real BuildService at CP-B) and answer `[not-implemented]` until then.
 */
import type { InvokeHandlers, SettingKey } from "@dsdude/ipc-contract";
import { loadProject, saveProject } from "@dsdude/project-format/node";
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
