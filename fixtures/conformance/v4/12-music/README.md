# v4/12-music

Language rule 8: `audio_play_music(m)` is a no-op if `m` is already playing; to restart it, call `audio_stop_music()`
first. `obj_dj` (invisible) runs the checks in Room Start, after the room's music module is loaded (events.md
section 4), then ends the game. `sounds/mus_tune/tune.xm` is a copy of `fixtures/assets/tune.xm`.

Intended output (one `DSD|LOG` line each), then `DSD|EXIT|0`:

```
true
true
false
false
true
```

The log alone cannot tell a no-op from a restart: a platform that counts module starts must see exactly two
(`dsd_plat_music_play` from the first call and from the call after the stop, none from the second call).
