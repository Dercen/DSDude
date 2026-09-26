# fixtures/bytecode

Hand-written `.dsda` programs and the `.dsdb` files generated from them (contract C2, `contracts/dsdb.md`). Owner:
WS2 from the `phase0` tag. Every `.dsdb` here is regenerated from its sibling `.dsda` by `node tools/gen-dsdb.ts`
(`npm run check` requires byte-identical output); never edit or hand-assemble a `.dsdb`, and commit the `.dsda` and
the regenerated `.dsdb` together.

- `hello.dsda`: the smallest program-form DSDB. `__main` loads the string `"hello"`, calls the builtin
  `show_debug_message` with one argument and returns. Expected runtime output: `DSD|READY|<version>|<abihash>`,
  `DSD|LOG|hello`, `DSD|EXIT|0`. It uses only stable opcodes, and `dsdb-dis hello.dsdb` prints `hello.dsda` byte for
  byte.
- `conformance/v0-01.dsda`: conformance program `fixtures/conformance/v0/01-arith.dss`, assembled by hand with
  stable opcodes only (`.loc` lines point at its source lines). Its expected log is
  `fixtures/conformance/expected/v0/01-arith.log`. WS2 hand-assembles v0 02-05 the same way until WS4's compiler
  emits them.

Tools: `npx dsdb-asm in.dsda -o out.dsdb`, `npx dsdb-dis in.dsdb [-o out.dsda]` (packages/dsdb).
