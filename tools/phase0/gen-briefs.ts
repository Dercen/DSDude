// Generates the per-package CLAUDE.md briefs (<= 60 lines each) from one table (WS0, Phase 0 task 2).
// Task 7 reruns it so the briefs carry the final contract versions: `node tools/phase0/gen-briefs.ts`.
// Contract versions are read from the contract files themselves; a missing file prints as "owed".
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

interface Contract {
  id: string;
  files: string[];
  role: string;
}

interface Brief {
  path: string;
  title: string;
  ws: string;
  stream: string;
  where: "local" | "cloud";
  owned: string[];
  contracts: Contract[];
  test: string[];
  isolation: string;
  notes?: string[];
}

const LINUX = {
  WS2: ["make -f runtime/Makefile.host test"],
  WS4: [
    "npm test -w packages/compiler -w packages/lang -w packages/dsdb",
    "npx tsc -b packages/compiler packages/lang packages/dsdb",
  ],
  WS5: ["npm test -w packages/asset-pipeline"],
  WS6b: ["npm test -w packages/editor-core   # plus -w apps/ide for view changes"],
  WS7: [
    "npm test -w packages/language-service -w packages/monaco-dss -w tools/gen-docs",
    "npx tsc -b packages/language-service packages/monaco-dss tools/gen-docs",
  ],
};

const C = {
  c1: { id: "C1 project format", files: ["contracts/project-format.md", "packages/project-format"], role: "consumer" },
  c2: {
    id: "C2 DSDB, opcodes, builtins",
    files: ["contracts/dsdb.md", "contracts/opcodes.json", "contracts/builtins.json"],
    role: "consumer",
  },
  c3: { id: "C3 asset pack", files: ["contracts/assetpack.md"], role: "consumer" },
  c4: { id: "C4 toolchain API", files: ["packages/toolchain/src/api.ts"], role: "consumer" },
  c5: { id: "C5 IPC", files: ["contracts/ipc.md", "packages/ipc-contract"], role: "consumer" },
  c6: {
    id: "C6 language, events, conformance",
    files: ["contracts/language.md", "contracts/events.md", "fixtures/conformance/"],
    role: "consumer",
  },
  c8: { id: "C8 log protocol", files: ["contracts/log-protocol.md"], role: "consumer" },
  c9: {
    id: "C9 diagnostics",
    files: ["contracts/diagnostics.md", "packages/project-format/src/diagnostics.ts"],
    role: "consumer",
  },
  c10: { id: "C10 CLI", files: ["contracts/cli.md"], role: "consumer" },
  c11: { id: "C11 platform seam", files: ["runtime/core/include/dsd_platform.h"], role: "consumer" },
  c12p: { id: "C12 preview API", files: ["packages/asset-pipeline/src/preview.ts"], role: "consumer" },
  c13: { id: "C13 runtime limits", files: ["contracts/runtime-limits.json"], role: "consumer" },
} satisfies Record<string, Contract>;

const as = (c: Contract, role: string): Contract => ({ ...c, role });

const CLOUD_NOTE = (ws: string) => [
  "WS0 also runs it on Windows at integration.",
  `Cloud session: see the Cloud setup block in docs/kickoff/${ws.toLowerCase()}.md.`,
];

const briefs: Brief[] = [
  {
    path: "packages/project-format",
    title: "@dsdude/project-format",
    ws: "WS0",
    stream: "Lead: foundation, contracts, integration",
    where: "local",
    owned: ["packages/project-format/**", "contracts/project-format.md", "contracts/diagnostics.md"],
    contracts: [as(C.c1, "owner"), as(C.c9, "owner (shape; E290-E299 catalog)")],
    test: ["npm test -w packages/project-format"],
    isolation:
      "Pure TypeScript. `src/index.ts` stays browser-safe (injected `ProjectFs`); the Node adapter is the `./node` subpath. The zod schemas load `samples/minimal` and `samples/flappy`.",
  },
  {
    path: "packages/dsdb",
    title: "@dsdude/dsdb",
    ws: "WS4",
    stream: "DSS language + compiler",
    where: "cloud",
    owned: [
      "packages/dsdb/** (WS2 co-signs changes)",
      "contracts/opcodes.json",
      "contracts/dsdb.md (co-owned with WS2)",
    ],
    contracts: [as(C.c2, "owner of packages/dsdb + opcodes.json; builtins.json stays WS0's")],
    test: LINUX.WS4,
    isolation:
      "Table-driven encode/decode/assemble/disassemble. `fixtures/bytecode/hello.dsda` round-trips byte for byte; `src/gen/opcodes.ts` comes only from `node tools/gen-opcodes.ts`.",
    notes: ["`dsdb-asm in.dsda -o out.dsdb` and `dsdb-dis in.dsdb [-o out.dsda]` are this package's bins."],
  },
  {
    path: "packages/lang",
    title: "@dsdude/lang",
    ws: "WS4",
    stream: "DSS language + compiler",
    where: "cloud",
    owned: ["packages/lang/**", "contracts/language.md", "contracts/events.md (WS2 co-signs)"],
    contracts: [
      as(C.c6, "owner"),
      { id: "C7 language-service host", files: ["packages/lang/src/host.ts"], role: "owner (freezes at CP-B)" },
      C.c9,
    ],
    test: LINUX.WS4,
    isolation: "Diagnostic-snapshot tests need no runtime. The AST stays internal; only C7 (`host.ts`) is public.",
  },
  {
    path: "packages/compiler",
    title: "@dsdude/compiler",
    ws: "WS4",
    stream: "DSS language + compiler",
    where: "cloud",
    owned: [
      "packages/compiler/** (incl. src/diagnostics/catalog.ts)",
      "fixtures/compiler/**",
      "fixtures/conformance/** except expected/",
    ],
    contracts: [C.c1, C.c2, as(C.c4, "consumer: exports `compileProject` (CompileFn)"), C.c6, C.c9, C.c13],
    test: LINUX.WS4,
    isolation:
      "Disassembly-snapshot goldens (.dss -> .dsda) and diagnostic snapshots need no runtime; execution goldens arrive tier by tier from WS2's host runner.",
    notes: ["`src/gen/builtins.ts` comes only from `node tools/gen-builtins.ts`."],
  },
  {
    path: "packages/asset-pipeline",
    title: "@dsdude/asset-pipeline",
    ws: "WS5",
    stream: "Asset pipeline",
    where: "cloud",
    owned: [
      "packages/asset-pipeline/** (incl. src/diagnostics/catalog.ts)",
      "fixtures/assets/** except golden/",
      "contracts/assetpack.md",
      "docs/manual/assets/**",
    ],
    contracts: [
      as(C.c3, "owner (write it on your first day)"),
      as(C.c4, "consumer: exports `packAssets`, `checkRoomBudgets`"),
      as(C.c12p, "owner (freezes at CP-B)"),
      C.c1,
      C.c9,
      C.c13,
    ],
    test: LINUX.WS5,
    isolation:
      "The quantizer and tiler are pure TS with golden bytes; tool wrappers skip when ToolPaths is empty (`skipped: no ToolPaths`).",
  },
  {
    path: "packages/toolchain",
    title: "@dsdude/toolchain",
    ws: "WS1",
    stream: "Toolchain, build driver, Play (WS8 from `start-ws8`)",
    where: "local",
    owned: [
      "packages/toolchain/** (incl. src/diagnostics/catalog.ts, E6xx)",
      "contracts/toolchain-api.md",
      "tools/fetch-vendor.ps1, tools/screenshot.py, tools/tools-pack.json",
      "scripts/install-toolchain.ps1, scripts/smoke-test.ps1",
    ],
    contracts: [as(C.c4, "owner (BuildService confirmed at CP-A)"), C.c1, C.c8, C.c9, C.c10],
    test: ["npm test -w packages/toolchain"],
    isolation:
      "Tests mock child_process; real-tool tests skip when detectToolchain() fails; the hello ELF stands in for the runtime. Module import stays free of Windows-only side effects (cloud streams import `api.ts` on Linux).",
    notes: [
      "Never import `@dsdude/compiler` or `@dsdude/asset-pipeline`: `BuildService` receives `CompileFn`, `PackAssetsFn` and `CheckRoomBudgetsFn` injected.",
    ],
  },
  {
    path: "packages/cli",
    title: "@dsdude/cli",
    ws: "WS1",
    stream: "Toolchain, build driver, Play (WS8 from `start-ws8`)",
    where: "local",
    owned: [
      "packages/cli/**",
      "contracts/cli.md",
      "samples/hello/**",
      "fixtures/runtime/hello/**",
      "fixtures/build/**",
    ],
    contracts: [as(C.c10, "owner (final by WS1)"), C.c4, C.c9],
    test: ["npm test -w packages/cli"],
    isolation:
      "Commands come from each package's `cliCommands` export (C4); the CLI is the composition root that injects `compileProject`, `packAssets` and `checkRoomBudgets` into `BuildService`.",
    notes: ["Run it as `npx dsdude ...` from the worktree root (`bin` -> `src/main.ts`, Node 24 type stripping)."],
  },
  {
    path: "packages/ipc-contract",
    title: "@dsdude/ipc-contract",
    ws: "WS6",
    stream: "IDE shell",
    where: "local",
    owned: ["packages/ipc-contract/** (from the tag)", "contracts/ipc.md"],
    contracts: [as(C.c5, "owner (completes the Phase-0 stubs)"), C.c4, C.c9],
    test: ["npm test -w packages/ipc-contract"],
    isolation: "Pure zod schemas; no Electron import, so the preload bundle and the browser tests can use it.",
  },
  {
    path: "packages/editor-core",
    title: "@dsdude/editor-core",
    ws: "WS6b",
    stream: "Visual editors (optional; WS6 holds these paths while WS6b does not run)",
    where: "cloud",
    owned: ["packages/editor-core/**", "apps/ide/src/renderer/editors/**", "fixtures/editors/**"],
    contracts: [
      C.c1,
      as(C.c12p, "consumer"),
      { id: "C12 EditorPanel API", files: ["apps/ide/src/renderer/panels/api.ts"], role: "consumer" },
      C.c13,
    ],
    test: LINUX.WS6b,
    isolation:
      "Editor cores are pure; views render in `fixtures/ide/mock-host` with `samples/flappy`, in headless Chromium (ports 5171-5179).",
  },
  {
    path: "packages/language-service",
    title: "@dsdude/language-service",
    ws: "WS7",
    stream: "Learn: language service, docs, samples, templates",
    where: "cloud",
    owned: [
      "packages/language-service/**",
      "fixtures/language-service/**",
      "doc/example fields of contracts/builtins.json",
    ],
    contracts: [
      C.c2,
      { id: "C7 language-service host", files: ["packages/lang/src/host.ts"], role: "consumer (from CP-B)" },
      C.c9,
    ],
    test: LINUX.WS7,
    isolation:
      "Builtins-only features from builtins.json until C7 lands; until then use a fake of it in `fixtures/language-service/`.",
    notes: ["`src/gen/builtins.ts` comes only from `node tools/gen-builtins.ts`."],
  },
  {
    path: "packages/monaco-dss",
    title: "@dsdude/monaco-dss",
    ws: "WS7",
    stream: "Learn: language service, docs, samples, templates",
    where: "cloud",
    owned: ["packages/monaco-dss/**"],
    contracts: [C.c2, C.c9],
    test: LINUX.WS7,
    isolation:
      "Monaco glue tested with @vitest/browser-playwright in headless Chromium (ports 5181-5189). Import Monaco only through its 0.56+ entry points (`monaco-editor/editor`, `features/...`).",
  },
  {
    path: "apps/ide",
    title: "@dsdude/ide",
    ws: "WS6",
    stream: "IDE shell",
    where: "local",
    owned: [
      "apps/ide/** except src/renderer/editors/** (WS6b) and electron-builder.yml (WS8)",
      "fixtures/ide/** (incl. mock-host)",
    ],
    contracts: [
      C.c1,
      C.c4,
      C.c5,
      C.c8,
      C.c9,
      { id: "C12 EditorPanel API", files: ["apps/ide/src/renderer/panels/api.ts"], role: "owner (freezes at CP-A)" },
      C.c13,
    ],
    test: ["npm test -w apps/ide"],
    isolation:
      "`MockBuildService` from `@dsdude/toolchain` (fake logs, diagnostics, a fake emulator that waits), a fixture project and `createFakeToolchain()`.",
    notes: [
      'Main and preload stay CommonJS (no `"type": "module"`); bundle every `@dsdude/*` package. At most one Electron dev IDE machine-wide.',
    ],
  },
  {
    path: "tools/gen-docs",
    title: "@dsdude/gen-docs",
    ws: "WS7",
    stream: "Learn: language service, docs, samples, templates",
    where: "cloud",
    owned: [
      "tools/gen-docs/**",
      "docs/reference/** (generated only by gen-docs)",
      "docs/manual/** except setup/, assets/, runtime-build.md",
      "docs/tutorial/**",
      "templates/**",
    ],
    contracts: [C.c2, C.c9],
    test: LINUX.WS7,
    isolation:
      "Needs only builtins.json, the five diagnostic catalogs and project-format; output is LF, `/` separators, code-point sorted.",
  },
  {
    path: "runtime",
    title: "runtime core (WS2's brief)",
    ws: "WS2",
    stream: "Runtime core (portable C, host-tested)",
    where: "cloud",
    owned: [
      "runtime/core/** (incl. diagnostics/catalog.json, R5xx)",
      "runtime/host/**, runtime/Makefile.host, runtime/tests/**, runtime/CLAUDE.md",
      "fixtures/bytecode/**, fixtures/runtime-core/** except flappy-nitrofs/",
      "fixtures/conformance/expected/**",
    ],
    contracts: [
      as(C.c8, "owner (protocol)"),
      as(C.c13, "owner"),
      as(C.c11, "owner (freezes at CP-A)"),
      as(C.c2, "co-owner of dsdb.md; co-signs packages/dsdb"),
      C.c6,
    ],
    test: LINUX.WS2,
    isolation:
      "Hand-assembled .dsda fixtures from packages/dsdb, host build only; no emulator needed until CP-B. Every `dsdude-host` run passes `--seed N`.",
    notes: [
      "Flags on both compilers: `-std=c11 -O2 -fwrapv -fno-strict-aliasing -funsigned-char`, no floats, fixed-width seam types.",
      "`runtime/package.json`, `tsconfig.json`, `vitest.config.ts` and `src/**` are WS3's.",
    ],
  },
  {
    path: "runtime/platform/ds",
    title: "runtime DS platform layer (WS3's brief)",
    ws: "WS3",
    stream: "DS platform layer + runtime ELF",
    where: "local",
    owned: [
      "runtime/platform/ds/**, runtime/selftest/**, runtime/data/**",
      "runtime/Makefile, runtime/dist/**",
      "runtime/package.json, tsconfig.json, vitest.config.ts, src/**",
      "fixtures/runtime/** except hello/",
      "contracts/runtime-artifact.md, docs/manual/runtime-build.md",
    ],
    contracts: [
      as(C.c11, "consumer"),
      {
        id: "C8 runtime artifact",
        files: ["contracts/runtime-artifact.md"],
        role: "owner (with the first runtime/dist build)",
      },
      C.c8,
      C.c13,
    ],
    test: ["npm test -w runtime", "npm run build:runtime -w runtime   # make -j4 (DSDUDE_MAKE_JOBS=4)"],
    isolation:
      "The selftest ROM needs no core, compiler or asset pipeline; its GRFs and soundbank come from `fixtures/runtime/`. The M1 path needs only `fixtures/bytecode/` and WS2's core.",
  },
];

function versionOf(file: string): string {
  let p = join(root, file);
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, "src/index.ts");
  if (!existsSync(p)) return "owed";
  const text = readFileSync(p, "utf8");
  const md = /^Version: (\d+\.\d+\.\d+)/m.exec(text);
  if (md) return md[1];
  const js = /"version": "(\d+\.\d+\.\d+)"/.exec(text);
  if (js && file.endsWith(".json")) return js[1];
  const ts = /CONTRACT_VERSION = "(\d+\.\d+\.\d+)"/.exec(text);
  if (ts) return ts[1];
  return "draft";
}

function render(b: Brief): string {
  const kick = `docs/kickoff/${b.ws.toLowerCase()}.md`;
  const where = b.where === "cloud" ? `cloud session, environment \`dsdude-${b.ws.toLowerCase()}\`` : "local worktree";
  const lines = [
    `# ${b.title}: ${b.path}`,
    "",
    `Owner: **${b.ws} ${b.stream}** (${where}). Read \`${kick}\` first, then this brief.`,
    "Generated by `tools/phase0/gen-briefs.ts` in Phase 0; after the tag the owner edits it by hand (<= 60 lines).",
    "",
    "## Owned paths",
    ...b.owned.map((o) => {
      const [, path, note = ""] = /^(.*?)( \(.*\))?$/.exec(o) ?? [o, o];
      return `- \`${path}\`${note}`;
    }),
    "- The full, authoritative list is `tools/ownership.json`; WS0's integration refuses commits outside it.",
    "",
    "## Contracts",
    "| Contract | Files | Version | Role |",
    "|---|---|---|---|",
    ...b.contracts.map((c) => {
      const v = c.files.map(versionOf).find((x) => x !== "owed" && x !== "draft") ?? versionOf(c.files[0]);
      return `| ${c.id} | ${c.files.map((f) => `\`${f}\``).join(", ")} | ${v} | ${c.role} |`;
    }),
    "",
    "Changes follow the tiers in `contracts/README.md` (T0 doc, T1 additive + CHANGELOG, T2 ADR).",
    "",
    "## Test before each commit",
    "```",
    ...b.test,
    "```",
    ...(b.where === "cloud" ? ["", ...CLOUD_NOTE(b.ws)] : []),
    "",
    "## Isolation",
    b.isolation,
    "",
    "## Rules",
    "- Import other packages only through their `src/index.ts` or a declared subpath; relative imports carry `.ts`.",
    "- Erasable TypeScript only (no enums, namespaces, parameter properties); `tsc -b` checks it.",
    "- Tests: `vitest run --pool=threads --maxWorkers=2`, never watch mode; a timeout on every spawned process.",
    "- Never commit `package-lock.json`; `npm install`, never `npm ci`.",
    ...(b.notes ?? []).map((n) => `- ${n}`),
  ];
  const out = `${lines.join("\n")}\n`;
  if (out.split("\n").length - 1 > 60) throw new Error(`${b.path}/CLAUDE.md exceeds 60 lines`);
  return out;
}

const only = process.argv[2];
for (const b of briefs) {
  if (only && b.path !== only) continue;
  mkdirSync(join(root, b.path), { recursive: true });
  writeFileSync(join(root, b.path, "CLAUDE.md"), render(b));
  console.log(`wrote ${b.path}/CLAUDE.md`);
}
