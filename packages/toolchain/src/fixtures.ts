/** Paths of the C14 hello fixtures in the repo (fixtures/build/hello, fixtures/runtime/hello). */
import { fileURLToPath } from "node:url";

const repo = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

/** The ROM `dsdude build samples/hello --runtime fixtures/runtime/hello/arm9.elf --skip-compile --skip-assets` made. */
export const FIXTURE_ROM = repo("fixtures/build/hello/game.nds");
/** packRom()'s info for FIXTURE_ROM. */
export const FIXTURE_PACKROM = repo("fixtures/build/hello/packrom.json");
/** The NitroFS root of FIXTURE_ROM (hello.txt). */
export const FIXTURE_NITROFS = repo("fixtures/build/hello/nitrofs");
/** samples/hello's ELF, stripped: it stands in for the runtime. */
export const FIXTURE_ELF = repo("fixtures/runtime/hello/arm9.elf");
