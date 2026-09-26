/** E290-E299: project-file problems found by @dsdude/project-format (C9 sub-range; owner WS0). */
import type { CatalogEntry } from "../diagnostics.ts";

const e = (code: string, title: string, message: string, hint: string | null): CatalogEntry => ({
  code,
  severity: "error",
  title,
  message,
  hint,
});

export const PROJECT_CATALOG = {
  E290: e(
    "E290",
    "No project.json",
    "There is no project.json in {dir}.",
    "Open the folder that holds project.json, or make a new project with File > New Project.",
  ),
  E291: e(
    "E291",
    "Broken JSON file",
    "{file} could not be read: {detail}.",
    "Fix the file in a text editor, or bring back an older copy of it.",
  ),
  E292: e(
    "E292",
    "Wrong setting in a project file",
    "{file}: the setting '{field}' is wrong: {problem}.",
    "Change it in the editor for that resource, or fix the file by hand.",
  ),
  E293: e("E293", "Missing file", "{file} is missing.", "Put the file back, or re-import the resource."),
  E294: e(
    "E294",
    "Unknown name",
    "{file} uses the {kind} '{name}', but the project has no {kind} with that name.",
    "Check the spelling, or add the {kind}.",
  ),
  E295: e(
    "E295",
    "Folder name can't be used",
    "The folder '{folder}' can't be a name in the game.",
    "Rename it with letters, digits and _ only, starting with a letter, 63 characters at most.",
  ),
  E296: e(
    "E296",
    "Project from a newer DSDude",
    "This project was saved by a newer DSDude (format {found}); this DSDude reads format {expected}.",
    "Update DSDude to open it.",
  ),
  E297: e(
    "E297",
    "Room list out of step",
    "project.json {problem} the room '{name}'.",
    "Keep the rooms list in project.json the same as the folders in rooms/.",
  ),
  E298: e(
    "E298",
    "Name used twice",
    "The name '{name}' belongs to both a {a} and a {b}.",
    "Rename one of them: every sprite, background, sound, object, room and script needs its own name.",
  ),
  E299: e(
    "E299",
    "Parent loop",
    "The object '{name}' ends up as its own parent ({chain}).",
    "Change the Parent of one of these objects.",
  ),
} as const satisfies Record<string, CatalogEntry>;

export const PROJECT_CATALOG_ENTRIES: readonly CatalogEntry[] = Object.values(PROJECT_CATALOG);
