import { describe, expect, it } from "vitest";
import { suggestName } from "./ImportDialog.tsx";

describe("suggestName", () => {
  it("makes a C1 name with the kind's prefix, unique in the project", () => {
    expect(suggestName("C:\\art\\Bird Flap.png", "sprite", new Set())).toBe("spr_bird_flap");
    expect(suggestName("/x/spr_coin.png", "sprite", new Set())).toBe("spr_coin");
    expect(suggestName("C:\\sfx\\jump!.wav", "sound", new Set())).toBe("snd_jump");
    expect(suggestName("sky.png", "background", new Set(["bg_sky", "bg_sky_2"]))).toBe("bg_sky_3");
    expect(suggestName("___.png", "sprite", new Set())).toBe("spr_new");
  });
});
