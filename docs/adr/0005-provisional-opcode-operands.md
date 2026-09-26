# ADR-0005: Operands of the provisional instance, `with` and array opcodes

> **Renumbered by WS0 (2026-09-26):** filed by WS4 as ADR-0003, which WS1's key-script ADR already held on main. WS4 updates its `ADR-pending ADR-0003` markers in `packages/compiler` and its references in `contracts/dsdb.md`, `contracts/opcodes.json` and `contracts/CHANGELOG.md` to ADR-0005.

- Status: proposed (WS4, 2026-09-26); needs WS2's co-signature (contracts/opcodes.json, contracts/dsdb.md)
- Contracts: C2 `contracts/opcodes.json` 0.1.0 -> 0.2.0 (T1), `contracts/dsdb.md` section 5 (T1: two operand kinds)
- Workaround marker: `// ADR-pending ADR-0003` in `packages/compiler/src/codegen/function.ts`

## Context

The compiler must emit code for instance variables, builtin variables, `with` and arrays before CP-B, but
opcodes.json 0.1.0 leaves the provisional opcodes' operands open ("symbol encoding set when promoted"). Three gaps
block project code generation outright:

1. GETDYN/SETDYN had `C:u8` with no rule for which symbol it names.
2. GETBI/SETBI address builtin variables of **self** only, with no way to index the array ones (`alarm[0] = 60` in
   Flappy's `obj_ctrl`, `view_x[screen]`) or to reach **another instance's** builtin variable (`other.x`,
   `obj_pipe.hspeed`, `inst.visible`).
3. The shape of a `with` loop, NEWARR's element source, and SETIDX on an undefined variable were unstated.

## Decision (proposed)

Two new operand kinds (dsdb.md section 5 table; `.dsda` text is a name, like `global` and `func`):

| Kind | Meaning | `.dsda` text |
|---|---|---|
| `sym` | SYMS index (8 bits in C: at most 256 dynamic symbols per game; the compiler reports more) | the symbol's name |
| `bivar` | dense builtin-variable index (`DSD_BUILTIN_VARS` order = variable entries in `builtins.json` id order) | the variable's name |

Operands and meaning (numbers never change; 55-58 are new, all stay **provisional** until WS2 implements them):

| # | Opcode | Operands | Meaning |
|---|---|---|---|
| 38 | GETDYN | `A:reg B:reg C:sym` | rA = variable C of the instance in rB: an instance id, an object (its first instance, R5xx when none) or -1..-4 for self/other/all/noone; slot table first, then the overflow map (language.md rule 1) |
| 39 | SETDYN | `A:reg B:reg C:sym` | variable C of the instance in rB = rA; an object in rB writes every instance of it |
| 40 | GETBI | `A:reg Bx:bivar` | rA = builtin variable Bx of self (or the global one, e.g. `room_width`) |
| 41 | SETBI | `A:reg Bx:bivar` | builtin variable Bx of self (or the global one) = rA |
| 55 | GETBIX | `A:reg B:bivar C:reg` | rA = element rC of builtin array variable B (`alarm`, `view_x`, `view_y`) |
| 56 | SETBIX | `A:reg B:bivar C:reg` | element rC of builtin array variable B = rA |
| 57 | GETBIO | `A:reg B:reg C:bivar` | rA = builtin variable C of the instance in rB (as GETDYN's rB) |
| 58 | SETBIO | `A:reg B:reg C:bivar` | builtin variable C of the instance in rB = rA; an object writes every instance |

Unchanged operands, now with stated meaning:
- **GETSLOT/SETSLOT/GETSLOTO/SETSLOTO `A:reg B:u8`**: B is the slot index in the layout of self's (other's) object.
  The compiler uses them only when it knows the object; a child's layout starts with its parent's, so the index is
  valid for descendants too.
- **CALL `A:reg Bx:func`**: as in dsdb.md section 6.
- **`with`**, one fixed shape, `rA` reserved for the loop:
  ```
      <target -> rA>            ; object, instance id, or -1 (self), -2 (other), -3 (all)
      WITHBEGIN rA, Lend        ; snapshot matching ids into a loop state kept in rA; none -> jump to Lend
  Lbody:                        ;   self = current instance, other = the outer self
      ...body...
  Lnext:
      WITHNEXT rA, Lbody        ; next live instance -> self, jump to Lbody; none -> fall through
      WITHEND rA                ; restore self and other, free the snapshot
  Lend:
  ```
  `continue` jumps to `Lnext`; `break` emits `WITHEND rA` and jumps to `Lend`; `exit`/`return` emit `WITHEND` for
  every open `with`, innermost first, before `RET`. An empty snapshot jumps past `WITHEND` (nothing to restore).
- **NEWARR `A:reg B:u8`**: rA = a new array of the B values in rA..rA+B-1 (the CALLN argument convention; B = 0 makes
  an empty array). Longer literals are E493 for now.
- **SETIDX `A:reg B:reg C:reg`**: rA[rB] = rC, growing the array and filling new elements with 0 (language.md
  section 4); when rA is **undefined**, the VM first stores a new empty array in rA. The compiler writes a
  non-local array variable back after every element store (`GETSLOT t; SETIDX t, i, v; SETSLOT t`), so
  `a[0] = 1` creates `a` as in GameMaker, and nested stores (`a[i][j] = v`) write each level back.

## Consequences

- WS4 emits these now (goldens under `fixtures/compiler/`); WS2 implements them in the VM, then both promote them
  to stable in one T1 change. Until WS2 co-signs, the operands may still change: the goldens regenerate with
  `DSDUDE_UPDATE_GOLDENS=1` and `node tools/gen-dsdb.ts`.
- `packages/dsdb`'s `BuiltinsEnv` gains `variables`/`variableIndex`; `tools/gen-builtins.ts` already emits the
  dense variable order (`DSD_BUILTIN_VARS`), so no generator changes.
- At most 256 names can be reached dynamically (`inst.foo` on an unknown instance, script variables); slot access
  covers everything else.
