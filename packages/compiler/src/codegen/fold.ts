/**
 * Constant folding (task 7's peephole passes): evaluates, at compile time, an expression built only from literals and
 * builtin constants, with exactly the runtime's number rules (contracts/language.md section 3, "Numbers").
 *
 * It folds only where the result is certain. Anything the runtime reports or treats specially stays a runtime
 * operation, so a debug build still raises its error at the same place:
 * - int32 overflow in `+ - *` and a fixed result outside Q20.12 (R52x in debug builds). In a release build
 *   (ADR-0008, `wrap`) these fold too, to what the runtime computes there: the low 32 bits of the exact result
 *   (number.c `int_result`/`real_result`, fixed.c `dsd_fx_mul`);
 * - division by zero (`/`, `div`, `mod`) and `INT_MIN / -1`, in both modes;
 * - `div`, `mod` and `/` with a fixed operand, and ordering comparisons of strings (code point order), which are left
 *   to the runtime rather than re-implemented here.
 * Diagnostics never depend on folding: every case a checker diagnostic looks at (string + number, a zero divisor,
 * `div` with a fraction) is one this module declines to fold.
 */
import type { Expr } from "../syntax/ast.ts";
import { FIXED_ONE } from "../syntax/lexer.ts";

/** A folded value: the literal the expression is equivalent to. */
export type Folded =
  | { kind: "number"; repr: "int" | "fixed"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean };

/** Returns the int value of a builtin constant name, or undefined when `name` is not one (or is shadowed). */
export type ConstantLookup = (name: string) => number | undefined;

/** How to fold. */
export interface FoldOptions {
  /**
   * A release build (ADR-0008): an overflowing `+ - *` or negation folds to its wrapped value. Absent or false (a
   * debug build): it is left unfolded, so the runtime reports R52x on its line.
   */
  wrap?: boolean;
}

/** Bits kept by a wrapped result (int32 and Q20.12 raw values alike). */
const INT_BITS = 32;
/** The int32 range (int results outside it overflow). */
const INT32_MIN = -(2n ** 31n);
const INT32_MAX = 2n ** 31n - 1n;
/** Q20.12 scale as a BigInt: raw = value * 4096. */
const FIXED_SCALE = BigInt(FIXED_ONE);
/**
 * A fixed value fits Q20.12 when |value| < 524,288 (language.md), i.e. its raw value is an int32 other than INT_MIN
 * (-524,288 exactly is left to the runtime).
 */
const FIXED_RAW_MIN = INT32_MIN + 1n;
const FIXED_RAW_MAX = INT32_MAX;

type NumberValue = Folded & { kind: "number" };

/** The folded value of `e`, or null when it is not a constant the compiler may evaluate. */
export function fold(e: Expr, constant: ConstantLookup, options: FoldOptions = {}): Folded | null {
  return foldWith(e, constant, options.wrap === true);
}

function foldWith(e: Expr, constant: ConstantLookup, wrap: boolean): Folded | null {
  const fold = (x: Expr): Folded | null => foldWith(x, constant, wrap);
  switch (e.kind) {
    case "number":
      return { kind: "number", repr: e.repr, value: e.value };
    case "string":
      return { kind: "string", value: e.value };
    case "bool":
      return { kind: "bool", value: e.value };
    case "name": {
      const value = constant(e.name);
      return value === undefined ? null : { kind: "number", repr: "int", value };
    }
    case "unary": {
      const v = fold(e.operand);
      if (v === null) return null;
      if (e.op === "!") return v.kind === "bool" ? { kind: "bool", value: !v.value } : null;
      return v.kind === "number" ? negate(v, wrap) : null;
    }
    case "ternary": {
      // Both branches must fold, so the branch that is dropped holds nothing a diagnostic could be about.
      const cond = fold(e.cond);
      if (cond === null || cond.kind !== "bool") return null;
      const then = fold(e.then);
      const otherwise = fold(e.otherwise);
      if (then === null || otherwise === null) return null;
      return cond.value ? then : otherwise;
    }
    case "binary": {
      const left = fold(e.left);
      if (left === null) return null;
      const right = fold(e.right);
      if (right === null) return null;
      return binary(e.op, left, right, wrap);
    }
    default:
      return null;
  }
}

/** `-v`; on overflow (`-INT_MIN`, or the most negative fixed) its wrapped value when `wrap`, else null. */
function negate(v: NumberValue, wrap: boolean): Folded | null {
  return result(v.repr, -BigInt(v.value), wrap);
}

/**
 * A number result: the value when it fits (int32, or Q20.12 for fixed), else its low 32 bits when `wrap` (as the
 * runtime's release build keeps them), else null (left to the runtime, which reports the overflow).
 */
function result(repr: "int" | "fixed", v: bigint, wrap: boolean): NumberValue | null {
  if (repr === "int" ? fitsInt(v) : fitsFixedRaw(v)) return number(repr, v);
  return wrap ? number(repr, BigInt.asIntN(INT_BITS, v)) : null;
}

/** Folds one binary operator over two folded operands. */
function binary(op: string, left: Folded, right: Folded, wrap: boolean): Folded | null {
  // Short-circuit operators on bool literals.
  if (op === "&&" || op === "||") {
    if (left.kind !== "bool" || right.kind !== "bool") return null;
    return { kind: "bool", value: op === "&&" ? left.value && right.value : left.value || right.value };
  }
  if (left.kind === "string" && right.kind === "string") {
    if (op === "+") return { kind: "string", value: left.value + right.value };
    if (op === "==" || op === "!=") return { kind: "bool", value: (left.value === right.value) === (op === "==") };
    return null;
  }
  if (left.kind === "bool" && right.kind === "bool") {
    if (op === "==" || op === "!=") return { kind: "bool", value: (left.value === right.value) === (op === "==") };
    return null;
  }
  if (left.kind === "number" && right.kind === "number") return numeric(op, left, right, wrap);
  return null;
}

/** Folds an arithmetic or comparison operator over two numbers. */
function numeric(op: string, left: NumberValue, right: NumberValue, wrap: boolean): Folded | null {
  const bothInt = left.repr === "int" && right.repr === "int";
  const a = BigInt(left.value);
  const b = BigInt(right.value);
  switch (op) {
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=": {
      // Comparing an int with a fixed value is exact: the int scaled to Q20.12 against the raw value.
      const x = left.repr === "int" ? a * FIXED_SCALE : a;
      const y = right.repr === "int" ? b * FIXED_SCALE : b;
      return { kind: "bool", value: compare(op, x, y) };
    }
    case "+":
    case "-":
    case "*":
      if (bothInt) {
        return result("int", op === "+" ? a + b : op === "-" ? a - b : a * b, wrap);
      }
      return fixedArith(op, left, right, wrap);
    case "div":
      // Integer division truncating toward zero (BigInt division truncates the same way).
      if (!bothInt || !safeDivisor(a, b)) return null;
      return number("int", a / b);
    case "mod":
    case "%":
      // The remainder takes the dividend's sign: a - b * trunc(a / b), which is BigInt's %.
      if (!bothInt || !safeDivisor(a, b)) return null;
      return number("int", a % b);
    case "/": {
      if (!bothInt || !safeDivisor(a, b)) return null;
      // An int when the division is exact; otherwise the exact quotient truncated toward zero to 1/4096, or the
      // truncated int quotient when that does not fit Q20.12.
      if (a % b === 0n) return number("int", a / b);
      const raw = (a * FIXED_SCALE) / b;
      return fitsFixedRaw(raw) ? number("fixed", raw) : number("int", a / b);
    }
    default:
      return null;
  }
}

/**
 * `+ - *` with at least one fixed operand: the result is fixed. Both operands go to exact Q.12 values (an int is
 * scaled in full, as the runtime's 64-bit `q12_of` does); multiplication uses the exact product truncated toward
 * zero to 1/4096. Only the result has to fit.
 */
function fixedArith(op: string, left: NumberValue, right: NumberValue, wrap: boolean): Folded | null {
  const a = toRaw(left);
  const b = toRaw(right);
  return result("fixed", op === "+" ? a + b : op === "-" ? a - b : (a * b) / FIXED_SCALE, wrap);
}

/** A number's exact Q.12 value (ints scaled by 4096). */
function toRaw(v: NumberValue): bigint {
  const raw = BigInt(v.value);
  return v.repr === "fixed" ? raw : raw * FIXED_SCALE;
}

/** False for a divisor the runtime reports (zero) or wraps (`INT_MIN / -1`). */
function safeDivisor(a: bigint, b: bigint): boolean {
  return b !== 0n && !(a === INT32_MIN && b === -1n);
}

function compare(op: string, x: bigint, y: bigint): boolean {
  switch (op) {
    case "==":
      return x === y;
    case "!=":
      return x !== y;
    case "<":
      return x < y;
    case "<=":
      return x <= y;
    case ">":
      return x > y;
    default:
      return x >= y;
  }
}

function fitsInt(v: bigint): boolean {
  return v >= INT32_MIN && v <= INT32_MAX;
}

function fitsFixedRaw(v: bigint): boolean {
  return v >= FIXED_RAW_MIN && v <= FIXED_RAW_MAX;
}

/** A folded number from a BigInt already known to fit (Number() of 0n is 0, never -0). */
function number(repr: "int" | "fixed", v: bigint): NumberValue {
  return { kind: "number", repr, value: Number(v) };
}
