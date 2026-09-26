# v3/09-with

Language rule 3 (`with`): a snapshot in creation order, instances destroyed mid-loop are skipped, `other` is the
outer `self`, loops nest, `break` leaves through WITHEND. Also an alarm and a collision event (events.md sections
2 and 6).

`obj_ctrl` creates four balls (n = 0..3, 32 px apart). While visiting ball 0 a nested `with` destroys ball 2, so
the outer loop visits 0, 1 and 3. A second loop breaks at ball 3 and uses `with (other)` inside. `obj_wall` sits
on ball 1 and destroys itself at its first collision. Alarm 0 ends the game on frame 2.

Intended output (one `DSD|LOG` line each), then `DSD|EXIT|0`:

```
ball 0 from ctrl
ball 1 from ctrl
ball 3 from ctrl
ctrl sees 0
ctrl sees 1
hit 1
alarm
```
