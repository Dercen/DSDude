import type { AssetManifest, RoomAssetSet } from "@dsdude/toolchain";
import { describe, expect, it } from "vitest";
import { checkRoomBudgets, nameList, spriteVramBytes } from "./budgets.ts";

/** A sprite entry as C3 writes it (only the fields budgets read matter). */
const sprite = (id: number, colorMode: "16" | "256", vramBytes: number, colors = 200) => ({
  id,
  frames: 1,
  frameWidth: 64,
  frameHeight: 64,
  colorMode,
  vramBytes,
  colors,
});

/** A hand-written room set (the compiler does not emit ROOMS yet). */
const room = (name: string, top: string[], bottom: string[] = [], sounds: string[] = [], bgs: string[] = []) =>
  ({
    room: name,
    screens: { top: { sprites: top, backgrounds: bgs }, bottom: { sprites: bottom, backgrounds: [] } },
    sounds,
  }) satisfies RoomAssetSet;

describe("checkRoomBudgets", () => {
  it("totals per room and screen, counting a sprite once per screen it is on", () => {
    const manifest = {
      provisional: true,
      sprites: { spr_a: sprite(0, "16", 384), spr_b: sprite(1, "256", 2048) },
      backgrounds: { bg_sky: { id: 0, width: 256, height: 192, vramBytes: 9728 } },
      sounds: { snd_x: { id: 0, kind: "effect", ramBytes: 5000 } },
    } as AssetManifest;
    const { manifest: out, diagnostics } = checkRoomBudgets(manifest, [
      room("rm_a", ["spr_a", "spr_b", "spr_a"], ["spr_a"], ["snd_x", "snd_x"], ["bg_sky"]),
    ]);
    expect(diagnostics).toEqual([]);
    expect((out as AssetManifest & { rooms: unknown }).rooms).toEqual({
      rm_a: {
        top: { objVramBytes: 2432, obj16Palettes: 1, obj256Palettes: 1, bgPalettes: 1, bgVramBytes: 9728 },
        bottom: { objVramBytes: 384, obj16Palettes: 1, obj256Palettes: 0, bgPalettes: 0, bgVramBytes: 0 },
        soundRamBytes: 5000,
      },
    });
  });

  it("gives the DoD colour-set message, suggesting the sprites with the fewest colours", () => {
    const names = Array.from({ length: 18 }, (_, i) => `spr_${String.fromCharCode(97 + i)}`);
    const sprites = Object.fromEntries(names.map((n, i) => [n, sprite(i, "256", 128, 100 + i)]));
    const manifest = { provisional: true, sprites, backgrounds: {}, sounds: {} } as AssetManifest;
    const { diagnostics } = checkRoomBudgets(manifest, [room("rm_game", names)]);
    expect(diagnostics.map((d) => [d.code, `${d.message} ${d.hint}`, d.file])).toEqual([
      [
        "E415",
        "rm_game needs 18 colour sets on the top screen, but the DS has 16. Reduce spr_a or spr_b to 16 colours.",
        "rooms/rm_game/room.json",
      ],
    ]);
  });

  it("reports sprite memory, 16-colour sets, backgrounds and sound memory", () => {
    const many16 = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`s${i}`, sprite(i, "16", 8192, 15)]));
    const manifest = {
      provisional: true,
      sprites: many16,
      backgrounds: Object.fromEntries(
        ["b1", "b2", "b3", "b4", "b5"].map((n, i) => [n, { id: i, width: 8, height: 8 }]),
      ),
      sounds: { big: { id: 0, kind: "music", ramBytes: 700_000 }, small: { id: 1, kind: "effect", ramBytes: 100_000 } },
    } as AssetManifest;
    const { diagnostics } = checkRoomBudgets(manifest, [
      room("rm_big", Object.keys(many16), [], ["big", "small"], ["b1", "b2", "b3", "b4", "b5"]),
    ]);
    expect(diagnostics.map((d) => d.code)).toEqual(["E413", "E414", "E416", "E417"]);
    expect(diagnostics[0]?.message).toBe(
      "rm_big needs 139264 bytes of sprite memory on the top screen, but the DS has 131072.",
    );
    expect(diagnostics[3]?.hint).toBe("Use fewer or shorter sounds in this room. The biggest are big and small.");
  });

  it("works on the provisional manifest of compileOnly (no C3 figures)", () => {
    const manifest: AssetManifest = {
      provisional: true,
      sprites: { spr_gap: { id: 0, frames: 2, frameWidth: 8, frameHeight: 48, colorMode: "256" } },
      backgrounds: {},
      sounds: { snd: { id: 0, kind: "effect" } },
    };
    expect(spriteVramBytes(manifest.sprites.spr_gap as never)).toBe(2 * 2048);
    const { diagnostics } = checkRoomBudgets(manifest, [room("rm", ["spr_gap", "spr_unknown"], [], ["snd"])]);
    expect(diagnostics).toEqual([]);
  });

  it("joins names for hints", () => {
    expect([nameList([]), nameList(["a"]), nameList(["a", "b"]), nameList(["a", "b", "c"], "and")]).toEqual([
      "",
      "a",
      "a or b",
      "a, b and c",
    ]);
  });
});
