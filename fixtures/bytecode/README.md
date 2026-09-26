# fixtures/bytecode

Hand-written `.dsda` programs and the `.dsdb` files generated from them (contract C2, `contracts/dsdb.md`). Owner:
WS2 from the `phase0` tag. Every `.dsdb` here is regenerated from its sibling `.dsda` by `node tools/gen-dsdb.ts`
(`npm run check` requires byte-identical output); never edit or hand-assemble a `.dsdb`, and commit the `.dsda` and
the regenerated `.dsdb` together.

- `hello.dsda`: the smallest program-form DSDB. `__main` loads the string `"hello"`, calls the builtin
  `show_debug_message` with one argument and returns. Expected runtime output: `DSD|READY|<version>|<abihash>`,
  `DSD|LOG|hello`, `DSD|EXIT|0`. It uses only stable opcodes, and `dsdb-dis hello.dsdb` prints `hello.dsda` byte for
  byte.
- `hello.out`: hello's full expected `dsdude-host` output.
- `conformance/v0-01.dsda` .. `v0-05.dsda`: conformance programs `fixtures/conformance/v0/01-arith.dss` ..
  `05-functions.dss`, assembled by hand by WS2 until WS4's compiler emits them (`.loc` lines point at the source
  lines). Their expected logs are `fixtures/conformance/expected/v0/*.log` (only `DSD|LOG|` lines). v0-01..04 use
  stable opcodes only; v0-05 also uses the provisional `CALL` for its functions.
- `v1-01-strings.dsda`, `v1-02-arrays.dsda`, `v1-03-collector.dsda`: tier v1 (strings and arrays), hand-written by
  WS2 until WS4's conformance programs 6-10 exist, each with a full `*.out` golden whose lines were written from the
  language rules before the first run. v1-03 pushes ~2.3 MB of short-lived text through the 192 KB arena, so the
  collector runs while a global list of 500 strings must survive.
- `runtime/*.dsda`: WS2's runtime fixtures, each with a hand-checked `*.out` holding the full expected `dsdude-host
  --seed 1` output (READY, LOG, and EXIT or ERR with code, function, file, line and message): `strings` (TOSTR,
  CONCAT, string comparison and equality, asset ids) and one `err-*` program per runtime error the VM raises so far
  (R501, R510, R511, R520, R530, R540, R541, R550, R551, R582, R590).

The host test runner (`make -f runtime/Makefile.host test`, `runtime/tests/test_programs.c`) runs every one of them.
Tools: `npx dsdb-asm in.dsda -o out.dsdb`, `npx dsdb-dis in.dsdb [-o out.dsda]` (packages/dsdb).
