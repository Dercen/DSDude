# fixtures/conformance

The conformance corpus (contract C6, `contracts/language.md`). Programs are WS4's; the expected outputs under
`expected/` are WS2's (WS4 reviews them).

- Tiers: v0 pure computation, v1 strings and arrays, v2 instances and events, v3 `with`, collisions and alarms, v4
  rooms and draw.
- Tier v0-v1 programs use the **program form**: one `vN/NN-<name>.dss` file whose top-level statements run once as
  `__main`; then the runtime prints `DSD|EXIT|0`. Tier v2+ programs are small project folders.
- Expected output: `expected/vN/NN-<name>.log`, only the `DSD|LOG|` lines, LF endings, final newline.
- v0 (Phase 0, WS0, expected output written by hand): 01 integer arithmetic, 02 fixed point and the printing rule
  (0.125 prints 0.13; no -0), 03 comparisons and truthiness, 04 control flow and switch fall-through, 05 functions,
  defaults, recursion and globals. Program 01 is hand-assembled in `fixtures/bytecode/conformance/v0-01.dsda`.
- Programs 6-10 come from WS4; each pinned semantics rule (language.md section 7) gets one fixture in its tier.
