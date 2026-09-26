/** Finishing touches shared by every compiled module, so `disassemble(module)` is already canonical. */
import { compareUtf8, type DsdbModule, OPCODES } from "@dsdude/dsdb";

/** Operand kinds whose names the module lists: globals (GLOB) and dynamic symbols (SYMS). */
const LISTED_KINDS = { global: "globals", sym: "symbols" } as const;

/** Operand kinds per opcode name, e.g. GETGLOB -> ["reg", "global"]. */
const operandKinds = new Map(OPCODES.map((o) => [o.name, o.operands.map((x) => x.split(":")[1] as string)]));

/**
 * Fills `globals` with every global the code names and `symbols` with every dynamic symbol that no slot table
 * names, both sorted by UTF-8 bytes (the canonical `.global`/`.symbol` order, contracts/dsdb.md section 8).
 */
export function finishModule(m: DsdbModule): DsdbModule {
  const found = { globals: new Set(m.globals), symbols: new Set(m.symbols) };
  for (const f of m.functions)
    for (const ins of f.code)
      (operandKinds.get(ins.op) ?? []).forEach((kind, i) => {
        const list = LISTED_KINDS[kind as keyof typeof LISTED_KINDS];
        if (list !== undefined) found[list].add(ins.args[i] as string);
      });
  const slotted = new Set(m.objects.flatMap((o) => o.slots.map((s) => s.symbol)));
  m.globals = [...found.globals].sort(compareUtf8);
  m.symbols = [...found.symbols].filter((s) => !slotted.has(s)).sort(compareUtf8);
  return m;
}
