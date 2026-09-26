/**
 * Status-bar meters (PLAN.md 1 step 5, 6 WS6): DS limits in plain language, hardware terms only in tooltips.
 * Before Play they come from the room (sprite-bearing instances per screen) and C3 assets.manifest.json (colour sets,
 * sprite memory, sound memory) against C13 contracts/runtime-limits.json; while the game runs, DSD|STAT and DSD|MEM
 * replace them, and dropped or unrotated sprites turn red. Pure.
 */
import type { ManifestSummary } from "@dsdude/ipc-contract";
import type { Project } from "@dsdude/project-format";
import limitsJson from "../../../../contracts/runtime-limits.json?raw";
import type { Stats, Usage } from "./log.ts";

/** C13, the single source for meters. */
export const LIMITS: Readonly<Record<string, number>> = (JSON.parse(limitsJson) as { limits: Record<string, number> })
  .limits;

export type MeterLevel = "ok" | "warn" | "over";

export interface Meter {
  id: string;
  /** Plain words for the status bar. */
  text: string;
  level: MeterLevel;
  /** Hardware terms and the exact figures. */
  tooltip: string;
}

export interface MeterInput {
  project: Project | null;
  /** The room the meters describe; null = the project's first room. */
  room?: string | null;
  manifest: ManifestSummary | null;
  /** The last DSD|STAT / DSD|MEM of the running game (null when not running). */
  stats: Stats | null;
  usage: Usage | null;
  running: boolean;
  limits?: Readonly<Record<string, number>>;
}

const levelOf = (used: number, max: number): MeterLevel => (used > max ? "over" : used >= max * 0.9 ? "warn" : "ok");
const worst = (...ls: MeterLevel[]): MeterLevel => (ls.includes("over") ? "over" : ls.includes("warn") ? "warn" : "ok");
const kb = (bytes: number) => {
  const k = bytes / 1024;
  return k < 10 && k % 1 !== 0 ? k.toFixed(1) : String(Math.round(k));
};

/**
 * Visible sprite-bearing instances placed on each screen of the room (an instance's screen defaults to its object's):
 * an invisible object, such as a wall, takes no sprite slot. The room editor counts the same (editor-core).
 */
export function spritesPerScreen(project: Project, room: string): { top: number; bottom: number } {
  const r = project.rooms.find((x) => x.name === room);
  const out = { top: 0, bottom: 0 };
  if (!r) return out;
  const objects = new Map(project.objects.map((o) => [o.name, o]));
  for (const inst of r.instances) {
    const obj = objects.get(inst.object);
    if (!obj?.sprite || !obj.visible) continue;
    out[inst.screen ?? obj.screen]++;
  }
  return out;
}

export function computeMeters(input: MeterInput): Meter[] {
  const L = input.limits ?? LIMITS;
  const { project, manifest, stats, usage, running } = input;
  if (!project) return [];
  const room = input.room ?? project.project.firstRoom;
  const roomBudget = manifest?.rooms?.[room] ?? null;
  const meters: Meter[] = [];
  const maxSprites = L.spritesPerScreen ?? 128;
  const placed = spritesPerScreen(project, room);
  const live = running && stats !== null;

  for (const screen of ["top", "bottom"] as const) {
    const Screen = screen === "top" ? "Top" : "Bottom";
    const sprites = live ? (stats[screen === "top" ? "spr_top" : "spr_bot"] ?? placed[screen]) : placed[screen];
    const b = roomBudget?.[screen] ?? null;
    const pal16 = b?.obj16Palettes ?? null;
    const pal256 = b?.obj256Palettes ?? null;
    const bgPal = b?.bgPalettes ?? null;
    const vram = b?.objVramBytes ?? null;
    const levels: MeterLevel[] = [levelOf(sprites, maxSprites)];
    const parts = [`${Screen}: ${sprites}/${maxSprites} sprites`];
    const tips = [
      `${Screen} screen, ${room}${live ? " (running game)" : ""}:`,
      `${sprites} of ${maxSprites} OAM entries (${live ? "visible instances this second" : "visible sprite-bearing instances placed"})`,
    ];
    if (pal16 !== null) {
      const max16 = L.obj16PalettesPerScreen ?? 16;
      parts.push(`${pal16}/${max16} colour sets`);
      levels.push(levelOf(pal16, max16));
      tips.push(`16-colour OBJ palettes: ${pal16} of ${max16}`);
    }
    if (pal256 !== null) {
      levels.push(levelOf(pal256, L.obj256PalettesPerScreen ?? 16));
      tips.push(`256-colour OBJ palettes: ${pal256} of ${L.obj256PalettesPerScreen ?? 16}`);
    }
    if (bgPal !== null) {
      levels.push(levelOf(bgPal, L.bg256PaletteSlotsPerScreen ?? 4));
      tips.push(`BG palette slots: ${bgPal} of ${L.bg256PaletteSlotsPerScreen ?? 4}`);
    }
    if (vram !== null) {
      const maxVram = L.objVramBytesPerScreen ?? 131072;
      levels.push(levelOf(vram, maxVram));
      tips.push(`OBJ VRAM: ${kb(vram)} of ${kb(maxVram)} KB in ${L.objVramAlignBytes ?? 128}-byte slots`);
    }
    if (!roomBudget) tips.push("Colour sets and sprite memory appear after the first build.");
    meters.push({ id: screen, text: parts.join(" · "), level: worst(...levels), tooltip: tips.join("\n") });
  }

  // Sound memory: the running game's figure, else the room's budget, else every sound's RAM.
  const soundMax = L.soundRamBytes ?? 786432;
  const liveSnd = live ? usage?.snd : undefined;
  const soundBytes = liveSnd
    ? liveSnd.used * 1024
    : (roomBudget?.soundRamBytes ??
      (manifest?.sounds ? Object.values(manifest.sounds).reduce((sum, s) => sum + (s?.ramBytes ?? 0), 0) : null));
  const soundTotal = liveSnd ? liveSnd.total * 1024 : soundMax;
  if (soundBytes !== null && soundBytes !== undefined)
    meters.push({
      id: "sound",
      text: `Sound memory ${kb(soundBytes)}/${kb(soundTotal)} KB`,
      level: levelOf(soundBytes, soundTotal),
      tooltip: `Sound RAM for ${room}'s effects and music (maxmod soundbank): ${kb(soundBytes)} of ${kb(soundTotal)} KB`,
    });

  if (live) {
    const oam = stats.oam_drop ?? 0;
    const aff = stats.aff_drop ?? 0;
    if (oam > 0)
      meters.push({
        id: "oam-drop",
        text: `${oam} sprite${oam === 1 ? "" : "s"} not drawn`,
        level: "over",
        tooltip: `More than ${maxSprites} visible instances on a screen: the OAM is full, so the ones with the highest depth were dropped.`,
      });
    if (aff > 0)
      meters.push({
        id: "aff-drop",
        text: `${aff} turned sprite${aff === 1 ? "" : "s"} drawn straight`,
        level: "over",
        tooltip: `More than ${L.affinePerScreen ?? 32} rotated or scaled instances on a screen: the extra ones used no affine matrix.`,
      });
    const inst = usage?.inst;
    if (inst)
      meters.push({
        id: "instances",
        text: `Instances ${inst.used}/${inst.total}`,
        level: levelOf(inst.used, inst.total),
        tooltip: `Instance slots in use at room start (${L.instanceBlockBytes ?? 384}-byte blocks)`,
      });
  }
  return meters;
}
