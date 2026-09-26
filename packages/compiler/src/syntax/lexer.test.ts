import { describe, expect, it } from "vitest";
import { Reporter } from "../diagnostics/report.ts";
import { decimalToFixedRaw, FIXED_ONE, lex } from "./lexer.ts";

/** Lexes `text` and returns the tokens (without the final eof) plus the diagnostic codes. */
function run(text: string) {
  const reporter = new Reporter("t.dss", text);
  const { tokens, comments } = lex(text, reporter);
  return { tokens: tokens.slice(0, -1), comments, codes: reporter.diagnostics.map((d) => d.code) };
}

describe("lexer", () => {
  it("splits names, keywords, numbers, strings and punctuation", () => {
    const { tokens, codes } = run('var x_1 = 0x2A + 1.5; s = "a\\n\\"b\\\\"');
    expect(codes).toEqual([]);
    expect(tokens.map((t) => `${t.kind}:${t.text}`)).toEqual([
      "keyword:var",
      "name:x_1",
      "punct:=",
      "int:0x2A",
      "punct:+",
      "fixed:1.5",
      "punct:;",
      "name:s",
      "punct:=",
      'string:"a\\n\\"b\\\\"',
    ]);
    expect(tokens[3]?.num).toBe(42);
    expect(tokens[5]?.num).toBe(1.5 * FIXED_ONE);
    expect(tokens[9]?.str).toBe('a\n"b\\');
  });

  it("takes the longest operator", () => {
    const { tokens } = run("a+=b==c<=d&&e||f++ --g!=h>=i");
    expect(tokens.filter((t) => t.kind === "punct").map((t) => t.text)).toEqual([
      "+=",
      "==",
      "<=",
      "&&",
      "||",
      "++",
      "--",
      "!=",
      ">=",
    ]);
  });

  it("records line breaks before tokens, including ones inside block comments", () => {
    const { tokens, comments } = run("a // one\nb /* two\nlines */ c\r\nd");
    expect(tokens.map((t) => t.nl)).toEqual([false, true, true, true]);
    expect(comments.map((c) => c.block)).toEqual([false, true]);
  });

  it("rounds decimals half away from zero to 1/4096 (language.md section 2)", () => {
    expect(decimalToFixedRaw("0", "125")).toBe(512);
    expect(decimalToFixedRaw("0", "1")).toBe(410); // 409.6 rounds up
    expect(decimalToFixedRaw("0", "0001220703125")).toBe(1); // exactly half of 1/4096 rounds away from zero
    expect(decimalToFixedRaw("0", "00012207031249")).toBe(0); // just under half rounds down
    expect(decimalToFixedRaw("524287", "999")).toBe(2147483644);
    expect(decimalToFixedRaw("524288", "0")).toBeNull();
  });

  it("reports literals that do not fit (E107, E108) and decimals missing a digit (E109)", () => {
    expect(run("3000000000").codes).toEqual(["E107"]);
    expect(run("0x80000000").codes).toEqual(["E107"]);
    expect(run("2147483648").codes).toEqual([]); // legal after a unary minus; the parser checks
    expect(run("524288.0").codes).toEqual(["E108"]);
    expect(run("1.").codes).toEqual(["E109"]);
    expect(run(".5").codes).toEqual(["E109"]);
  });

  it("reports string problems (E105, E106, E128) and still makes a string", () => {
    expect(run('"abc').codes).toEqual(["E105"]);
    expect(run('"a\nb"').codes).toEqual(["E105", "E105"]);
    expect(run('"\\t"').codes).toEqual(["E106"]);
    const single = run("'hi'");
    expect(single.codes).toEqual(["E128"]);
    expect(single.tokens[0]?.kind).toBe("string");
    expect(single.tokens[0]?.str).toBe("hi");
  });

  it("reports GameMaker operators once and substitutes the nearest DSS one (E122)", () => {
    const cases: [string, string][] = [
      ["a & b", "&&"],
      ["a | b", "||"],
      ["a << b", "*"],
      ["a ?? b", "||"],
      ["a %= b", "+="],
      ["~a", "!"],
    ];
    for (const [text, as] of cases) {
      const { tokens, codes } = run(text);
      expect(codes, text).toEqual(["E122"]);
      expect(
        tokens.some((t) => t.kind === "punct" && t.text === as),
        text,
      ).toBe(true);
    }
  });

  it("reports and skips unknown characters (E110) and unclosed comments (E111)", () => {
    const at = run("a @ b # é");
    expect(at.codes).toEqual(["E110", "E110", "E110"]);
    expect(at.tokens.map((t) => t.text)).toEqual(["a", "b"]);
    expect(run("/* never closed").codes).toEqual(["E111"]);
  });
});
