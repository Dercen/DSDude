import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { formatSource } from "./format.ts";
import { REPO_ROOT } from "./golden.ts";

/** Every .dss file under `dir`. */
function dssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? dssFiles(p) : n.endsWith(".dss") ? [p] : [];
  });
}

const kindOf = (p: string) =>
  p.endsWith(`${sep}functions.dss`) || p.includes(`${sep}scripts${sep}`) ? "functions" : "code";

describe("formatter", () => {
  it("leaves the samples and the conformance corpus as they are", () => {
    for (const p of [
      ...dssFiles(join(REPO_ROOT, "samples")),
      ...dssFiles(join(REPO_ROOT, "fixtures", "conformance")),
    ]) {
      const text = readFileSync(p, "utf8").replace(/\r/g, "");
      expect(formatSource(text, kindOf(p)), p).toBe(text);
    }
  });

  const cases: [string, string, string][] = [
    ["inserts semicolons", "x = 1\nfoo()\nvar a = 2, b\nreturn\n", "x = 1;\nfoo();\nvar a = 2, b;\nreturn;\n"],
    ["spaces operators and commas", "a=b+c*-d\nf(1,2 ,3)\n", "a = b + c * -d;\nf(1, 2, 3);\n"],
    ["indents blocks and brace-less bodies", "if(a){\nb()\n}else\nc()\n", "if (a) {\n    b();\n} else\n    c();\n"],
    [
      "indents case bodies",
      "switch(x){\ncase 1:\nf()\nbreak\ndefault:\ng()\n}\n",
      "switch (x) {\n    case 1:\n        f();\n        break;\n    default:\n        g();\n}\n",
    ],
    [
      "keeps for headers and do-until",
      "for(var i=0;i<3;i++)f(i)\ndo{i--}until(i<=0)\n",
      "for (var i = 0; i < 3; i++) f(i);\ndo { i--; } until (i <= 0);\n",
    ],
    [
      "keeps comments and one blank line",
      "a = 1 // one\n\n\n\n/* two */ b = 2\n",
      "a = 1; // one\n\n/* two */ b = 2;\n",
    ],
    ["indents continued lines", "x = f(1,\n2)\n", "x = f(1,\n    2);\n"],
    ["handles ternaries and member access", "x=a?b.c:d[0]\nother.y+=1\n", "x = a ? b.c : d[0];\nother.y += 1;\n"],
    ["returns broken code unchanged", "x = (\n", "x = (\n"],
  ];
  for (const [name, input, expected] of cases)
    it(name, () => {
      expect(formatSource(input, "code")).toBe(expected);
      expect(formatSource(expected, "code")).toBe(expected);
    });

  it("formats functions files", () => {
    expect(formatSource("function f(a,b=1){return a+b}\n", "functions")).toBe(
      "function f(a, b = 1) { return a + b; }\n",
    );
  });
});
