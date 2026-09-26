/**
 * The compiler's diagnostics catalog (contract C9, contracts/diagnostics.md). Owner: WS4.
 *
 * Ranges owned here: E1xx syntax, E2xx names and assets (except E290-E299), E3xx types, arity and event misuse,
 * E490-E499 hardware limits the compiler detects, and W0xx lints. `tools/gen-docs` (WS7) renders every entry into
 * docs/reference/errors.md, so each entry carries a short `title` for that page.
 *
 * Style rules (contracts/diagnostics.md): the message says what happened, the hint says what to do, the location
 * fields say where. Write for a 12-year-old. Banned words in messages and hints: instruction, token, identifier,
 * operand, arity, expression, opcode, VRAM, OAM, palette slot (a unit test enforces the list).
 *
 * Adding an entry inside these ranges is a T0 change: commit it with a contracts/CHANGELOG.md line.
 */
import type { CatalogEntry, Severity } from "@dsdude/project-format";

/** Builds one catalog entry; the helper keeps each entry on a few lines below. */
const entry = (
  code: string,
  severity: Severity,
  title: string,
  message: string,
  hint: string | null,
): CatalogEntry => ({
  code,
  severity,
  title,
  message,
  hint,
});

/** Shorthand for an error entry (errors block Play). */
const err = (code: string, title: string, message: string, hint: string | null): CatalogEntry =>
  entry(code, "error", title, message, hint);

/** Shorthand for a warning entry (W0xx lints never block Play). */
const warn = (code: string, title: string, message: string, hint: string | null): CatalogEntry =>
  entry(code, "warning", title, message, hint);

export const COMPILER_CATALOG = {
  // ---- E1xx: syntax (lexer and parser) -------------------------------------------------------------------------
  E101: err("E101", "Unclosed (", "The ( on line {line} is never closed.", "Add a ) where the part in brackets ends."),
  E102: err("E102", "Unclosed [", "The [ on line {line} is never closed.", "Add a ] after the last item."),
  E103: err("E103", "Missing }", "The { on line {line} is never closed.", "Add a } where this block of code ends."),
  E104: err(
    "E104",
    "Extra closing bracket",
    "This {bracket} has nothing to close.",
    "Remove it, or add the matching {open} before it.",
  ),
  E105: err(
    "E105",
    "Unclosed text",
    "The line ends before this text in quotes is closed.",
    'Add a " at the end of the text.',
  ),
  E106: err(
    "E106",
    "Unknown backslash code",
    '"\\{char}" can\'t be used inside text in quotes.',
    'Use \\n for a new line, \\" for a quote mark or \\\\ for a backslash.',
  ),
  E107: err(
    "E107",
    "Whole number too big",
    "{text} is too big for a whole number.",
    "Whole numbers go from -2147483648 to 2147483647.",
  ),
  E108: err(
    "E108",
    "Number with a point too big",
    "{text} is too big for a number with a decimal point.",
    "Numbers with a decimal point must stay between -524288 and 524288.",
  ),
  E109: err(
    "E109",
    "Point needs digits on both sides",
    "{text} needs a digit on both sides of the point.",
    "Write {fixed} instead.",
  ),
  E110: err(
    "E110",
    "Unknown character",
    "The character {char} can't be used in DSS code.",
    "Remove it. Names use only letters, digits and _.",
  ),
  E111: err("E111", "Unclosed comment", "This /* comment is never closed.", "Add */ where the comment ends."),
  E112: err("E112", "Missing value", "A value is missing {where}.", "Write a number, a name or a call here."),
  E113: err(
    "E113",
    "Line can't start like this",
    "A line of code can't start with {what}.",
    "Start with a name, a call such as instance_destroy(), or a word such as if, var or while.",
  ),
  E114: err(
    "E114",
    "Value not used",
    "This line works out a value but does nothing with it.",
    "Give it to a variable with =, pass it to a call, or use it in an if.",
  ),
  E115: err(
    "E115",
    "Comparison not used",
    "This line compares two values but does nothing with the answer.",
    "To give {name} a new value, write = instead of ==.",
  ),
  E116: err(
    "E116",
    "Can't give this a value",
    "Only a variable, an array item or a variable of an instance can go before {op}.",
    "Put the variable you want to change on the left of {op}.",
  ),
  E117: err(
    "E117",
    "Condition needs brackets",
    "{keyword} needs its {part} in brackets.",
    "Write it like this: {example}.",
  ),
  E118: err(
    "E118",
    "Code outside a function",
    "This file can hold only functions, but this line is not inside one.",
    "Move the line into an event, or put it inside a function.",
  ),
  E119: err(
    "E119",
    "Name missing",
    "A name is missing after {after}.",
    "Write a name made of letters, digits and _, starting with a letter or _.",
  ),
  E120: err(
    "E120",
    "case outside a switch",
    "{keyword} can only be used inside a switch.",
    "Put it inside switch (value) { ... }.",
  ),
  E121: err(
    "E121",
    "++ or -- inside a line",
    "{op} only works after a variable, on a line of its own.",
    "Write it like this: {example}.",
  ),
  E122: err("E122", "Symbol not in DSS", "{op} isn't part of DSS.", "{advice}"),
  E123: err(
    "E123",
    "Something missing",
    "DSS expected {expected} here.",
    "Add {expected}, or check this line for a typo.",
  ),
  E124: err(
    "E124",
    "Parameter order",
    "The parameter {name} has no default value but comes after one that does.",
    "Move the parameters that have = values to the end of the list.",
  ),
  E125: err(
    "E125",
    "else without if",
    "This else has no if before it.",
    "Put else straight after the if's code, or remove it.",
  ),
  E126: err(
    "E126",
    "DSS word used as a name",
    "{word} is a word DSS uses itself, so it can't be a name.",
    "Pick another name, such as my_{word}.",
  ),
  E127: err(
    "E127",
    "Function inside other code",
    "A function can't be made inside other code.",
    "Move function {name} to the top level of the file.",
  ),
  E128: err(
    "E128",
    "Single quotes",
    "DSS writes text in double quotes, not single quotes.",
    "Write \"like this\" instead of 'like this'.",
  ),
  E129: err(
    "E129",
    "Code before the first case",
    "Code in a switch must come after a case or default.",
    "Add case value: or default: before this line.",
  ),

  // ---- W0xx: lints ---------------------------------------------------------------------------------------------
  W030: warn(
    "W030",
    "= used to compare",
    "This = compares the two sides; it doesn't change anything.",
    "Write == here to make that clear. To change a value, do it on its own line.",
  ),
  W032: warn(
    "W032",
    "Line joined to the one above",
    "This line starts with {bracket}, so DSS joins it to the line above.",
    "End the line above with ; if the two lines are meant to be separate.",
  ),
} as const satisfies Record<string, CatalogEntry>;

/** Every code this catalog defines. */
export type CompilerCode = keyof typeof COMPILER_CATALOG;

/** All entries, in code order, for tools/gen-docs. */
export const COMPILER_CATALOG_ENTRIES: readonly CatalogEntry[] = Object.values(COMPILER_CATALOG);

/** Words contracts/diagnostics.md bans from messages and hints (checked by catalog.test.ts). */
export const BANNED_WORDS: readonly string[] = [
  "instruction",
  "token",
  "identifier",
  "operand",
  "arity",
  "expression",
  "opcode",
  "vram",
  "oam",
  "palette slot",
];
