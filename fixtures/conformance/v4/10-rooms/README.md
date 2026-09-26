# v4/10-rooms

Language rule 7 (`global.*` survives `room_goto` and `room_restart`) and the room load order of events.md section
4: Create, then Game Start (first room only), then Room Start; Room End on leaving. `obj_runner` is placed in both
rooms and draws its counter every frame (no log). Rule 8 (music) needs a tracker module and is not covered here.

Intended output (one `DSD|LOG` line each), then `DSD|EXIT|0`:

```
create in a
game start
room a visit 1
room end
create in b
room b visit 2
room end
create in b
room b visit 3
```
