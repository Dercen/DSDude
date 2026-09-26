# Editor fixtures (WS6; formerly WS6b's paths)

Inputs and outputs of the visual editors' tests (`packages/editor-core`, `apps/ide/src/renderer/editors/`).

- The sprite core's input is the Phase-0 sprite `fixtures/assets/sprite16x16x3.png` (16x16, 3 frames). It loads
  through the C12 preview, is edited, saved as a DS indexed PNG and read back with the same pixels and colours.
- The background core and editor use `fixtures/assets/background256x192.png` (tile counts checked against the
  pipeline's `convertBackground`) plus generated 4-colour noise for the over-1024-tiles case.
- The sound core and panel use `fixtures/assets/loop-stereo-44k.wav` (smpl loop 1000..9000, odd LIST chunk),
  `blip.wav`, `tone-44k.mp3` and `tune.xm`.
- Editor-saved rooms that WS0 builds end to end at integration:
  - `flappy-rm_game/room.json`: `samples/flappy`'s `rm_game` rebuilt from an empty room with the mouse in the room
    editor (bird, controller, HUD; saved byte-identical to the sample), plus one `obj_pipe` at (192, 128). The room
    browser test writes it when missing and compares it otherwise. To build it, copy `samples/flappy`, replace
    `rooms/rm_game/room.json` with this file and run `dsdude build <copy>`; `dsdude screenshot --frames 20` shows the
    bird, the score and the pipe on the top screen.
