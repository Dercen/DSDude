// Writes samples/minimal and samples/flappy v0 (C14; PLAN.md section 4 listing). Run: node tools/phase0/make-samples.ts
// PNGs and WAVs are script-generated so the samples are reproducible. After the tag the samples belong to WS4
// (then WS7 from M2); rerun this only in Phase 0.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Image, type Rgba, tone, wav } from "./media.ts";

const root = resolve(import.meta.dirname, "../..");
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

function writer(sample: string) {
  return (rel: string, data: string | Buffer) => {
    const f = join(root, "samples", sample, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, data);
  };
}

const CLEAR: Rgba = [0, 0, 0, 0];
const BLACK: Rgba = [16, 16, 24, 255];
const WHITE: Rgba = [248, 248, 248, 255];
const YELLOW: Rgba = [248, 208, 48, 255];
const ORANGE: Rgba = [240, 120, 32, 255];
const GREEN: Rgba = [72, 176, 64, 255];
const DARK_GREEN: Rgba = [40, 112, 40, 255];
const LIGHT_GREEN: Rgba = [144, 216, 104, 255];
const SKY: Rgba = [96, 176, 232, 255];
const BLUE: Rgba = [48, 96, 200, 255];

const sprite = (
  frames: number,
  w: number,
  h: number,
  ox: number,
  oy: number,
  bbox: [number, number, number, number],
) => ({
  frames,
  frameWidth: w,
  frameHeight: h,
  origin: { x: ox, y: oy },
  bbox: { left: bbox[0], top: bbox[1], right: bbox[2], bottom: bbox[3] },
  colorMode: "auto",
  transparent: "alpha",
});
const object = (sprite: string | null, visible: boolean, depth = 0) => ({
  sprite,
  parent: null,
  visible,
  depth,
  screen: "top",
});
const noScreen = { background: null, viewX: 0, viewY: 0 };

function bird(): Image {
  const img = new Image(48, 16);
  for (let f = 0; f < 3; f++) {
    const x = f * 16;
    img.ellipse(x + 1, 3, 14, 11, BLACK);
    img.ellipse(x + 2, 4, 12, 9, YELLOW);
    img.rect(x + 10, 5, 2, 2, WHITE);
    img.set(x + 11, 6, BLACK);
    img.rect(x + 12, 8, 4, 2, ORANGE);
    const wy = [5, 7, 9][f]; // wing up, middle, down
    img.rect(x + 3, wy, 5, 2, WHITE);
  }
  return img;
}

function pipe(): Image {
  const img = new Image(32, 64);
  img.rect(0, 0, 32, 64, DARK_GREEN);
  img.rect(2, 0, 28, 64, GREEN);
  img.rect(5, 0, 4, 64, LIGHT_GREEN);
  img.rect(0, 0, 32, 2, DARK_GREEN);
  img.rect(0, 62, 32, 2, DARK_GREEN);
  return img;
}

function gap(): Image {
  const img = new Image(8, 48);
  img.rect(0, 0, 8, 48, [255, 255, 255, 96]);
  return img;
}

function icon(body: Rgba): Image {
  const img = new Image(32, 32);
  img.rect(0, 0, 32, 32, SKY);
  img.rect(22, 0, 8, 32, GREEN);
  img.ellipse(4, 9, 16, 14, BLACK);
  img.ellipse(5, 10, 14, 12, body);
  img.rect(14, 13, 3, 3, WHITE);
  img.rect(17, 18, 5, 3, ORANGE);
  return img;
}

function player(): Image {
  const img = new Image(16, 16);
  img.rect(0, 0, 16, 16, CLEAR);
  img.rect(1, 1, 14, 14, BLACK);
  img.rect(2, 2, 12, 12, BLUE);
  img.rect(4, 4, 3, 3, WHITE);
  img.rect(9, 4, 3, 3, WHITE);
  return img;
}

// ---------------------------------------------------------------------------------------------------------
// samples/minimal: one sprite moved with the D-pad (M2)
{
  const w = writer("minimal");
  w(
    "project.json",
    json({
      formatVersion: 0,
      name: "minimal",
      title: "Minimal",
      subtitle: "Move with the D-pad",
      author: "DSDude",
      gamecode: "####",
      icon: "icon.png",
      firstRoom: "rm_main",
      rooms: ["rm_main"],
    }),
  );
  w("icon.png", icon(BLUE).png());
  w("sprites/spr_player/sprite.json", json(sprite(1, 16, 16, 8, 8, [1, 1, 14, 14])));
  w("sprites/spr_player/sheet.png", player().png());
  w("objects/obj_player/object.json", json(object("spr_player", true)));
  w(
    "objects/obj_player/step.dss",
    [
      "// objects/obj_player/step.dss  -- move with the D-pad, 2 pixels per frame",
      "if (button_check(btn_left))  x -= 2;",
      "if (button_check(btn_right)) x += 2;",
      "if (button_check(btn_up))    y -= 2;",
      "if (button_check(btn_down))  y += 2;",
      "x = clamp(x, 8, room_width - 8);",
      "y = clamp(y, 8, room_height - 8);",
      "",
    ].join("\n"),
  );
  w(
    "rooms/rm_main/room.json",
    json({
      width: 256,
      height: 192,
      layout: "separate",
      screens: { top: noScreen, bottom: noScreen },
      instances: [{ object: "obj_player", x: 128, y: 96 }],
    }),
  );
}

// ---------------------------------------------------------------------------------------------------------
// samples/flappy v0: PLAN.md section 4 listing (pipe geometry: docs/adr/0001-flappy-pipe-geometry.md)
{
  const w = writer("flappy");
  w(
    "project.json",
    json({
      formatVersion: 0,
      name: "flappy",
      title: "Flappy",
      subtitle: "Tap or press A to flap",
      author: "DSDude",
      gamecode: "####",
      icon: "icon.png",
      firstRoom: "rm_game",
      rooms: ["rm_game"],
    }),
  );
  w("icon.png", icon(YELLOW).png());
  w("sprites/spr_bird/sprite.json", json(sprite(3, 16, 16, 8, 8, [2, 3, 15, 13])));
  w("sprites/spr_bird/sheet.png", bird().png());
  w("sprites/spr_pipe/sprite.json", json(sprite(1, 32, 64, 16, 0, [0, 0, 31, 63])));
  w("sprites/spr_pipe/sheet.png", pipe().png());
  w("sprites/spr_gap/sprite.json", json(sprite(1, 8, 48, 4, 24, [0, 0, 7, 47])));
  w("sprites/spr_gap/sheet.png", gap().png());
  w("sounds/snd_flap/sound.json", json({ kind: "effect", file: "flap.wav" }));
  w("sounds/snd_flap/flap.wav", wav(tone(0.12, 440, 880)));
  w("sounds/snd_point/sound.json", json({ kind: "effect", file: "point.wav" }));
  w("sounds/snd_point/point.wav", wav([...tone(0.08, 988, 988, true), ...tone(0.16, 1319, 1319, true)]));
  w("sounds/snd_hit/sound.json", json({ kind: "effect", file: "hit.wav" }));
  w("sounds/snd_hit/hit.wav", wav(tone(0.25, 220, 55, true)));

  w("objects/obj_bird/object.json", json(object("spr_bird", true)));
  w(
    "objects/obj_bird/create.dss",
    [
      "// objects/obj_bird/create.dss  -- runs once when the bird is created",
      "image_speed  = 0.2;          // wing animation: 0.2 frames per step",
      "gravity      = 0.25;         // built-in: added to vspeed every step by the engine",
      "flap_power   = -4.5;         // instance variable, created on first assignment",
      "alive        = true;",
      "global.score = 0;",
      "",
    ].join("\n"),
  );
  w(
    "objects/obj_bird/step.dss",
    [
      "// objects/obj_bird/step.dss  -- runs every frame (60 per second)",
      "if (!alive) exit;",
      "if (button_pressed(btn_a) || touch_pressed()) {   // A button, or a tap on the bottom screen",
      "    vspeed = flap_power;",
      "    audio_play_sound(snd_flap);",
      "}",
      "if (vspeed > 6) vspeed = 6;                       // terminal velocity",
      "image_angle = clamp(-vspeed * 8, -30, 60);        // tilt the bird's nose up or down",
      "if (y < 0) { y = 0; vspeed = 0; }",
      "if (y > room_height - sprite_height) die();",
      "",
    ].join("\n"),
  );
  w(
    "objects/obj_bird/collision_obj_pipe.dss",
    ["// objects/obj_bird/collision_obj_pipe.dss  -- bbox overlap with any obj_pipe", "if (alive) die();", ""].join(
      "\n",
    ),
  );
  w(
    "objects/obj_bird/collision_obj_gap.dss",
    [
      "// objects/obj_bird/collision_obj_gap.dss   -- invisible score trigger between pipes",
      "if (alive && !other.scored) { other.scored = true; global.score += 1; audio_play_sound(snd_point); }",
      "",
    ].join("\n"),
  );
  w("objects/obj_bird/alarm_0.dss", ["// objects/obj_bird/alarm_0.dss", "room_restart();", ""].join("\n"));
  w(
    "objects/obj_bird/functions.dss",
    [
      "// objects/obj_bird/functions.dss  -- helpers visible to this object's events",
      "function die() {",
      "    alive = false;",
      "    image_speed = 0;",
      "    audio_play_sound(snd_hit);",
      "    with (obj_pipe) hspeed = 0;",
      '    show_debug_message("Score: " + string(global.score));   // -> Output panel',
      "    alarm[0] = 60;                                           // restart in one second",
      "}",
      "",
    ].join("\n"),
  );

  w("objects/obj_pipe/object.json", json(object("spr_pipe", true)));
  w(
    "objects/obj_pipe/create.dss",
    "hspeed = -2;\nimage_yscale = 2;   // 128 px, within the 2x scale limit (ADR-0001)\n",
  );
  w("objects/obj_pipe/outside_room.dss", "instance_destroy();\n");

  w("objects/obj_gap/object.json", json(object("spr_gap", false)));
  w("objects/obj_gap/create.dss", "hspeed = -2;\nscored = false;\n");
  w("objects/obj_gap/outside_room.dss", "instance_destroy();\n");

  w("objects/obj_ctrl/object.json", json(object(null, false)));
  w("objects/obj_ctrl/create.dss", "alarm[0] = 60;\n");
  w(
    "objects/obj_ctrl/alarm_0.dss",
    [
      "var gy = irandom_range(48, 144);",
      "instance_create(272, gy - 152, obj_pipe);   // upper pipe: gy-152 .. gy-25 (ADR-0001)",
      "instance_create(272, gy + 24, obj_pipe);    // lower pipe: gy+24 .. gy+151",
      "instance_create(272, gy, obj_gap);          // score trigger: gy-24 .. gy+23",
      "alarm[0] = 90;",
      "",
    ].join("\n"),
  );

  w("objects/obj_hud/object.json", json(object(null, true)));
  w("objects/obj_hud/draw.dss", "draw_text(112, 16, string(global.score));\n");

  w(
    "rooms/rm_game/room.json",
    json({
      width: 256,
      height: 192,
      layout: "separate",
      screens: { top: noScreen, bottom: noScreen },
      instances: [
        { object: "obj_bird", x: 64, y: 96 },
        { object: "obj_ctrl", x: 0, y: 0 },
        { object: "obj_hud", x: 0, y: 0 },
      ],
    }),
  );
}
console.log("wrote samples/minimal and samples/flappy");
