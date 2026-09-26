# C6: The DSS language

Version: 0.1.0 · Owner: WS4 · Changes: see the tiers in contracts/README.md

DSS (`.dss`) is DSDude's GML-flavoured scripting language. This file is normative for the compiler (WS4), the
runtime (WS2) and the language service and manual (WS7); `contracts/events.md` covers events and the frame, and
`contracts/dsdb.md` the bytecode. Written by WS0 in Phase 0 (v0.1); owner WS4 from the tag (WS0 holds it until
`start-ws4`). Source: PLAN.md sections 1, 2.8, 4 and 5.2 C6.

## 1. Where code lives

- `objects/<obj>/<event>.dss`: statements, run as that event (`contracts/events.md`).
- `objects/<obj>/functions.dss`: function declarations only; object-scoped, callable from that object's events and
  its children's; `self` is the calling instance.
- `scripts/<name>.dss`: function declarations only; global functions.
- Room instance creation code (`room.json` `creationCode`): statements, run after the instance's Create event.
- **Program form** (conformance tiers v0-v1): one `fixtures/conformance/vN/NN-<name>.dss` file whose **top-level
  statements run once** as the DSDB function `__main`, and whose functions are global. Top-level statements are legal
  only in program form. A program has no instance: instance variables, `self`, `other`, `with`, events and builtins
  that need an instance are E3xx, and assigning an undeclared name is E2xx ("use `var` or `global.`"). After
  `__main` returns, the runtime prints `DSD|EXIT|0` (C8). Tier v2 and later programs are small projects in folders.

## 2. Lexical structure

- Source is UTF-8. Line comments `// ...`, block comments `/* ... */` (not nested).
- Names: `[A-Za-z_][A-Za-z0-9_]*`, case-sensitive.
- Keywords: `var if else while for repeat do until switch case default break continue return exit with function
  true false undefined div mod global self other all noone`.
- Numbers: decimal integers (`42`), hex (`0x2A`), and decimals with a digit on both sides of the point (`1.5`,
  `0.25`). An integer literal must fit int32; a decimal literal must fit Q20.12 (|v| < 524,288) and is rounded half
  away from zero to the nearest 1/4096. Out-of-range literals are E1xx.
- Strings: `"..."` with the escapes `\n`, `\"` and `\\`; any other `\` escape is E1xx. No single-quoted strings.
- Operators and punctuation: `+ - * / % ! = == != < <= > >= && || ?: += -= *= /= ++ -- ( ) [ ] { } , ; . :`.

## 3. Grammar (EBNF)

```ebnf
file        = { statement | function } ;            (* event, creation code and program files *)
funcfile    = { function } ;                        (* functions.dss, scripts/*.dss *)
function    = "function" NAME "(" [ param { "," param } ] ")" block ;
param       = NAME [ "=" expression ] ;             (* defaulted params come last *)
block       = "{" { statement } "}" ;
statement   = block
            | "var" vardecl { "," vardecl } [ ";" ]
            | "if" "(" condition ")" statement [ "else" statement ]
            | "while" "(" condition ")" statement
            | "do" statement "until" "(" condition ")" [ ";" ]
            | "for" "(" [ simple ] ";" [ condition ] ";" [ simple ] ")" statement
            | "repeat" "(" expression ")" statement
            | "switch" "(" expression ")" "{" { ( "case" expression | "default" ) ":" { statement } } "}"
            | "with" "(" expression ")" statement
            | "break" [ ";" ] | "continue" [ ";" ] | "exit" [ ";" ] | "return" [ expression ] [ ";" ]
            | simple [ ";" ]
            | ";" ;
vardecl     = NAME [ "=" expression ] ;
simple      = lvalue ( "=" | "+=" | "-=" | "*=" | "/=" ) expression
            | lvalue ( "++" | "--" )
            | call ;
condition   = expression ;                          (* a top-level "a = b" here means "a == b", W030 *)
lvalue      = NAME | "global" "." NAME | postfix "." NAME | postfix "[" expression "]" ;
expression  = ternary ;
ternary     = or [ "?" expression ":" expression ] ;
or          = and { "||" and } ;
and         = equality { "&&" equality } ;
equality    = relation { ( "==" | "!=" ) relation } ;
relation    = additive { ( "<" | "<=" | ">" | ">=" ) additive } ;
additive    = term { ( "+" | "-" ) term } ;
term        = unary { ( "*" | "/" | "div" | "mod" | "%" ) unary } ;
unary       = ( "-" | "!" ) unary | postfix ;
postfix     = primary { "." NAME | "[" expression "]" | "(" [ expression { "," expression } ] ")" } ;
call        = postfix ;                             (* a postfix that ends in an argument list *)
primary     = NUMBER | STRING | "true" | "false" | "undefined"
            | "self" | "other" | "all" | "noone" | "global" "." NAME | NAME
            | "[" [ expression { "," expression } ] "]"      (* array literal *)
            | "(" expression ")" ;
```

**Precedence**, lowest to highest: `?:` (right-associative), `||`, `&&`, `== !=`, `< <= > >=`, `+ -`,
`* / div mod %`, unary `- !`, postfix `. [] ()`. Binary operators are left-associative. Assignments and `++`/`--`
are statements, not expressions. `&&` and `||` short-circuit and yield a bool.

**Semicolons are optional**, as in GML: a statement ends where the next token cannot continue it. The formatter
inserts them, and the parser resynchronises on `;`, statement keywords, `}` and newlines. W032 warns when a line
starting with `(` or `[` continues the previous line's expression (write a `;` to end the line before it).

## 4. Values and numbers

Types: number, string (immutable, ref-counted), bool, undefined, array (0-based, by reference), instance id, asset id
(sprite, background, sound, object and room names are values). `typeof`-style reflection is not in 0.1.

**Numbers** have one language-level type with two hidden representations (PLAN.md 2.8): **int32** for whole numbers
and **Q20.12 fixed point** for fractions (range +-524,288, resolution 1/4096).
- int op int stays int for `+ - *` and `div`; anything with a fraction becomes fixed. A fixed result stays fixed even
  when whole; printing and comparison hide the difference (`0.5 + 0.5 == 1` is true and prints `1`).
- `/` yields an int when both operands are ints that divide exactly. Otherwise the result is fixed: the exact
  quotient truncated toward zero to 1/4096; when it does not fit Q20.12 (|q| >= 524,288), `/` yields the truncated int
  quotient instead.
- `div` is integer division, truncating toward zero; a fixed operand is floored to an int first (W04x when provable).
- `mod` and `%` are the same operator. They accept fractions, and the remainder takes the dividend's sign, as in GML:
  `a - b * trunc(a / b)`.
- Fixed multiplication uses a 64-bit intermediate and truncates toward zero to 1/4096.
- `floor`, `ceil`, `round` and `irandom` return ints. `round` rounds half away from zero.
- Comparing an int with a fixed value is exact: `(int64)a << 12` against `b`.
- int32 overflow in `+ - *` and mixed arithmetic whose result does not fit Q20.12 raise R52x in debug builds and wrap
  in release builds. `INT_MIN / -1` wraps.
- Division by zero (`/`, `div`, `mod`) and `sqrt` of a negative are always R5xx.
- No doubles and no int64 anywhere.

**Printing** (`string(v)`, `show_debug_message`, `draw_text`, and string `+` via `string()`):
- An int prints in decimal with no decimals: `42`, `-7`.
- A fixed value prints its **exact** Q20.12 value rounded half away from zero to **2 decimals**, then trailing zeros
  and a trailing point are dropped: `2.5`, `0.1` (from 410/4096), `0.13` (0.125), `0.67` (2/3 as 2731/4096), `3`
  (3.0). It never prints `-0`: `-0.001` prints `0`.
- `true` / `false`; `undefined` prints `undefined`.
- Arrays print as `[1, 2, 3]`: elements printed by these rules, strings unquoted, separated by `, `; nested arrays
  nest.
- Instance ids and asset ids print as their number.

`point_direction(x1, y1, x2, y2)` returns degrees as Q20.12 in [0, 360), counter-clockwise with y pointing down (as in
GML: straight up is 90), exact at multiples of 45; it uses an integer octant-LUT `atan2`. `point_distance`,
`point_direction` and `lengthdir_*` compute in 64-bit. `dsin`/`dcos` take degrees.

**Truthiness.** `false`, `0` (int or fixed) and `undefined` are false; every other value is true.

**Equality** (`==`, `!=`): numbers, bools, instance ids and asset ids compare by numeric value (`true` is 1, `false`
is 0); strings compare by content; `undefined` equals only `undefined`; arrays compare by reference; a string never
equals a number. **Ordering** (`< <= > >=`): numbers (and bools and ids, as numbers), or two strings by code point;
anything else is R5xx.

**Strings.** `+` on two strings concatenates. string + number is E3xx when provable and R5xx otherwise ("use
string(n)"). Strings are immutable; `string_char_at` is 1-based, as in GML.

**Arrays.** `[a, b, c]` makes a new array. `a[i]` reads (out of range: R5xx); `a[i] = v` writes and grows the array,
filling new elements with 0. Arrays nest (`a[i][j]`) and are shared by reference. A fixed-point index floors, with
W04x when the checker can tell.

## 5. Names and scopes

- **Locals:** `var a = 1, b;` declares locals that live in registers and die at the end of the event or function.
  Function parameters are locals.
- **Instance variables** exist on first assignment. Each object gets compile-time slots: its parent's layout first,
  then the union of the names assigned anywhere in the object's events and functions (at most 24 user slots, E49x
  beyond). Unknown names reached through another instance (`other.foo`, `inst.foo`) fall into a lazily allocated
  8-entry overflow map (rule 1).
- **Globals:** `global.name`, created on first assignment (rule 7).
- **Built-in variables** (`x`, `alarm`, `room_width`, ...) and **constants** (`btn_a`, `noone`, ...) come from
  `contracts/builtins.json`; read-only ones are E3xx on assignment.
- `self`, `other`, `all`, `noone` are the constants -1, -2, -3, -4 where an instance is expected.
- **`inst.x` and `obj.x`:** on an instance id, the instance's variable; on an object name, read = the first instance
  of that object (creation order; R5xx when there is none), write = every instance, exactly as GML.
- **Name lookup** in an event or function: local, then the object's own and inherited functions, then instance
  variable, built-in variable, global functions (`scripts/`), builtin functions, constants, and finally asset names.
  An unknown name is E2xx with a did-you-mean (E201 for functions), unless it is a known GameMaker name, which gets
  its dedicated E2xx message (C2 `unsupported` entries).
- **Functions** `function name(a, b = 1) { ... }`: parameters with defaults come last; `return v` returns a value,
  `return` and `exit` return undefined. In an event, `exit` ends the event.

## 6. Statements

- `if`/`else`, `while`, `do ... until (c)`, `for (init; cond; step)` (init and step are simple statements),
  `repeat (n)` (n evaluated once, floored), `switch` (case values are compared with `==`; execution falls through to
  the next case until `break`, as in GML), `break`, `continue`, `return`, `exit`, `with`.
- `=` inside an `if`/`while`/`until`/`for` condition or a `?:` condition is compared, not assigned, with W030.

## 7. Semantics pinned before the tag (PLAN.md 4)

Each rule gets one conformance fixture in the tier that exercises it.

1. **Dynamic slots.** DSDB OBJS carries, per object, a sorted (symbolId, slot) table, the parent id and an ancestor
   bitset (`contracts/dsdb.md`). `inst.var` on a runtime id and GETDYN/SETDYN binary-search that table, then fall
   back to the 8-entry overflow map. Reading a slot that was never assigned raises R50x *"x was never given a value
   in obj_y"*.
2. **Event inheritance.** A child without an event file runs the parent's. `event_inherited()` calls the parent's
   version. `collision_<parent>`, `with`, `instance_*` and `place_meeting` on a parent include its descendants.
3. **`with`.** `with (target)` iterates a snapshot of the matching ids in creation order, skips instances destroyed
   mid-loop, sets `other` to the outer `self`, and can nest; `break`/`continue`/`exit`/`return` unwind through
   WITHEND. The target is an object (its instances and descendants'), an instance id, `all`, `other` or `self`.
4. **User events.** `event_user(n)` runs the instance's `user_<n>.dss` (`user_0`..`user_7`), inherited like any
   event.
5. **Variadic builtins.** `choose`, `min` and `max` declare `minArgs`/`maxArgs` in `builtins.json` (1..16).
6. **Printing any value.** `show_debug_message` and `draw_text` accept any value, formatting numbers as `string()`
   does.
7. **Globals.** `global.*` persists across `room_goto`/`room_restart` and is cleared only by `game_restart`.
8. **Music.** `audio_play_music(m)` is a no-op if `m` is already playing; to restart it, call `audio_stop_music()`
   first.

**Three small rules** (PLAN.md 5.2 C6):
- A W lint flags non-ASCII characters in string literals passed to `draw_text`: "the DS font only has A-Z, a-z, 0-9
  and punctuation".
- Random numbers come from the core's xorshift32. A non-zero seed in the DSDB header (a build with `--seed N`) wins;
  otherwise the core uses `dsd_plat_rng_seed()`. `randomize()` is kept as a compatible no-op.
- Fixed-point array indices floor, with W04x.

Also: `touch_x`/`touch_y` keep the last touched position while the stylus is up (guard with `touch_check()`); the
per-frame watchdog stops a script after 200,000 instructions with R510.

## 8. Not in DSS 0.1 (the omission list)

Documented in the manual's "Differences from GameMaker" chapter:
- **Language:** structs, methods and `new`; `try`/`catch`; enums; `ds_*` data structures; doubles and int64; bitwise
  operators; `??`; `^^`; `#macro`; single-quoted strings; `++`/`--` inside expressions.
- **Engine:** physics; paths, timelines and sequences; the layers API; surfaces, shaders and particles;
  `image_alpha`/`image_blend`; precise pixel collision; `solid` and `persistent`; custom fonts; 3D.
- **Input and I/O:** keyboard, mouse and gamepad APIs (buttons and touch replace them; `keyboard_check*` with the
  arrow, space and enter `vk_*` keys is an alias for the D-pad, A and Start, with a hint); text input; files and
  saves; networking.
- **Editing:** drag-and-drop actions; tile painting and tilesets.

Known GameMaker names from this list get a dedicated E2xx message and a manual link (C2 `unsupported` entries), not a
did-you-mean.

## How to change me

- T0 (wording, examples, clarifications that change no program's meaning): WS4 commits with a `contracts/CHANGELOG.md`
  line.
- T1 (a new construct or builtin behaviour that makes no valid program mean something else): minor version bump,
  conformance fixtures for it, CHANGELOG entry; WS2 co-signs anything the runtime must implement.
- T2 (changing what a valid program does, a number rule, a printing rule or a pinned rule): an ADR co-signed by WS2,
  WS4 and WS7, with the conformance expectations updated in the same merge.
