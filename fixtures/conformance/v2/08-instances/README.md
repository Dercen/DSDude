# v2/08-instances

Language rules 1 (dynamic slots), 2 (event inheritance, `event_inherited()`) and 4 (user events). `obj_ctrl`
creates one `obj_kid` and one `obj_leaf` (a child of `obj_kid` with no events of its own), reads and writes their
variables through instance ids, then ends the game in its first Step.

Intended output (one `DSD|LOG` line each), then `DSD|EXIT|0`:

```
base create 10
kid create 15
kid user_1
base user_0
base create 10
kid create 15
kid user_1
base user_0
15
3
7
2
leaf
```
