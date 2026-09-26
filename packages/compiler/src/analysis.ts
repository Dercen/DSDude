/**
 * Language-service analysis over the shared project view (src/project-index.ts): which name is at an offset,
 * what is visible there, completions, references, signature help, outline and folding. packages/lang wraps it in
 * the C7 `LanguageServiceHost` (packages/lang/src/host.ts), whose plain-data shapes these results match.
 *
 * Name resolution follows the code generator exactly (contracts/language.md section 5): local, the object's own
 * and inherited functions, instance variable, builtin variable, global functions, builtin functions, constants,
 * assets. Offsets are UTF-16 code units, ranges half-open.
 */
import { builtinAliases, builtinConstants, builtinFunctions, builtinVariables } from "./codegen/builtins.ts";
import type { AssetNameKind } from "./codegen/env.ts";
import type { CodeUnit, ObjectEntry, ProjectIndex, SourceLocation, SourceText } from "./project-index.ts";
import type { Expr, FunctionDecl, Span, Stmt } from "./syntax/ast.ts";
import { KEYWORDS, type Token } from "./syntax/lexer.ts";
import { walk, walkExpr } from "./syntax/walk.ts";

/** What a name stands for. */
export type SymbolKind =
  | "keyword"
  | "local"
  | "parameter"
  | "instanceVariable"
  | "global"
  | "function"
  | "objectFunction"
  | "builtinFunction"
  | "builtinVariable"
  | "constant"
  | AssetNameKind;

/** One parameter of a callable symbol. */
export interface ParamInfo {
  name: string;
  /** True when the argument may be left out (a default value, or past a builtin's minArgs). */
  optional: boolean;
}

/** A resolved name. */
export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  /** One line for hovers and completion lists, e.g. "function die()", "instance variable of obj_bird". */
  detail: string;
  /** Where it is declared or first given a value; null for builtins and assets. */
  definition: SourceLocation | null;
  /** Parameters, for callable symbols; null otherwise. */
  params: ParamInfo[] | null;
  /** True when a builtin takes more arguments than it names (choose, min, max). */
  variadic: boolean;
  /** The comment just above a user function's declaration, without comment markers; null otherwise. */
  doc: string | null;
}

/** A symbol found at a place in a file. */
export interface SymbolAt extends SymbolInfo {
  /** The name's own range in the file. */
  span: Span;
}

/** One completion candidate. */
export interface CompletionInfo {
  label: string;
  kind: SymbolKind;
  detail: string;
}

/** Signature help for the call around an offset. */
export interface SignatureInfo {
  name: string;
  params: ParamInfo[];
  variadic: boolean;
  /** Index of the argument the offset is in (0-based; may pass the last parameter for variadic builtins). */
  activeParameter: number;
}

/** An outline entry. */
export interface OutlineSymbol {
  name: string;
  kind: SymbolKind;
  /** The whole declaration. */
  span: Span;
  /** The name within it. */
  selection: Span;
}

/** A classified token (C7 `parse` spans). */
export interface TokenClass extends Span {
  kind: "keyword" | "name" | "number" | "string" | "comment" | "operator";
  /** What a name resolves to, when known. */
  symbol: SymbolKind | null;
}

/** What code at a place runs as: its unit, its locals, and what `self`/`other` are. */
interface Scope {
  unit: CodeUnit | null;
  locals: Map<string, { kind: "local" | "parameter"; at: SourceLocation }>;
  self: ObjectEntry | null;
  other: ObjectEntry | null;
}

/** Prefix of collision event stems. */
const COLLISION_PREFIX = "collision_";

export class Analysis {
  private readonly index: ProjectIndex;

  constructor(index: ProjectIndex) {
    this.index = index;
  }

  /** The parsed source of `file`, if the project has it. */
  source(file: string): SourceText | undefined {
    return this.index.sources.find((s) => s.file === file);
  }

  // ---- Scopes ----------------------------------------------------------------------------------------------------

  /** The innermost unit of `file` whose extent contains `offset` (a function inside an event file wins). */
  private unitAt(file: string, offset: number): CodeUnit | null {
    let best: CodeUnit | null = null;
    for (const u of this.index.units) {
      if (u.source.file !== file || offset < u.span.start || offset > u.span.end) continue;
      if (best === null || u.span.end - u.span.start < best.span.end - best.span.start) best = u;
    }
    return best;
  }

  /** The scope at `offset`: the unit's locals, and self/other after any enclosing `with`. */
  private scopeAt(file: string, offset: number): Scope {
    const unit = this.unitAt(file, offset);
    if (unit === null) return { unit: null, locals: new Map(), self: null, other: null };
    const scope = this.unitScope(unit);
    // Apply every `with` whose body contains the offset, outermost first.
    const visit = (stmts: readonly Stmt[]): void =>
      walk(stmts, {
        stmt: (s) => {
          if (s.kind !== "with" || offset < s.body.start || offset > s.body.end) return true;
          const inner = this.withTarget(s.target, scope);
          scope.other = scope.self;
          scope.self = inner;
          visit([s.body]);
          return false;
        },
      });
    visit(unit.body);
    return scope;
  }

  /** A unit's scope at its start: parameters, every `var` (function-wide), its object and collision target. */
  private unitScope(unit: CodeUnit): Scope {
    const locals: Scope["locals"] = new Map();
    const file = unit.source.file;
    for (const p of unit.decl?.params ?? [])
      locals.set(p.name, { kind: "parameter", at: { file, start: p.start, end: p.start + p.name.length } });
    walk(unit.body, {
      stmt: (s) => {
        if (s.kind === "var")
          for (const d of s.decls)
            if (!locals.has(d.name))
              locals.set(d.name, { kind: "local", at: { file, start: d.start, end: d.start + d.name.length } });
        return true;
      },
    });
    const self = unit.owner === null ? null : (this.index.objects.get(unit.owner) ?? null);
    const other = unit.stem?.startsWith(COLLISION_PREFIX)
      ? (this.index.objects.get(unit.stem.slice(COLLISION_PREFIX.length)) ?? null)
      : null;
    return { unit, locals, self, other };
  }

  private withTarget(t: Expr, scope: Scope): ObjectEntry | null {
    if (t.kind === "special") return t.which === "self" ? scope.self : t.which === "other" ? scope.other : null;
    if (t.kind === "name" && !scope.locals.has(t.name)) return this.index.objects.get(t.name) ?? null;
    return null;
  }

  // ---- Resolution ------------------------------------------------------------------------------------------------

  /** Resolves a bare name as code in `scope` sees it; `call` selects function lookup. */
  private resolveName(scope: Scope, name: string, call: boolean): SymbolInfo | null {
    const local = scope.locals.get(name);
    if (!call && local !== undefined) return this.localSymbol(name, local.kind, local.at, scope.unit);
    const owner = scope.unit?.owner ?? null;
    const user = this.index.lookupFunction(owner, name);
    const builtin = builtinFunctions.get(name);
    if (call) {
      if (user !== null)
        return this.userFunctionSymbol(name, user.decl, user.file, owner !== null && user.funcName !== name);
      return builtin === undefined ? this.aliasSymbol(name, true) : this.builtinFunctionSymbol(name);
    }
    const constant = builtinConstants.get(name);
    if (constant !== undefined) return plain(name, "constant", `${name} = ${constant.value}`);
    if (builtinVariables.has(name)) return this.builtinVariableSymbol(name);
    const asset = this.index.assetKinds.get(name);
    if (asset !== undefined) return plain(name, asset, asset);
    const ivar = this.instanceVariable(scope.self, name, scope.unit !== null && this.index.hasInstance);
    if (ivar !== null) return ivar;
    const alias = this.aliasSymbol(name, false);
    if (alias !== null) return alias;
    if (user !== null)
      return this.userFunctionSymbol(name, user.decl, user.file, owner !== null && user.funcName !== name);
    if (builtin !== undefined) return this.builtinFunctionSymbol(name);
    // A GameMaker function name written without brackets (hovering it by name) still shows what it maps to.
    return this.aliasSymbol(name, true);
  }

  /** `object.name`: a builtin variable, a slot of a known object, or a variable some instance has. */
  private resolveMember(scope: Scope, object: Expr, name: string): SymbolInfo | null {
    if (builtinVariables.has(name)) return this.builtinVariableSymbol(name);
    let known: ObjectEntry | null = null;
    if (object.kind === "special")
      known = object.which === "self" ? scope.self : object.which === "other" ? scope.other : null;
    else if (object.kind === "name" && !scope.locals.has(object.name))
      known = this.index.objects.get(object.name) ?? null;
    return this.instanceVariable(known, name, true);
  }

  /** An instance variable of `self` (or of any instance when self is unknown); null when nothing assigns it. */
  private instanceVariable(self: ObjectEntry | null, name: string, allowDynamic: boolean): SymbolInfo | null {
    if (self?.info.slots.has(name)) {
      // Declared by the farthest ancestor that assigns it.
      const chain = this.index.ancestors(self);
      const decl = [...chain].reverse().find((o) => o.assigned.has(name)) ?? self;
      return {
        ...plain(name, "instanceVariable", `instance variable of ${decl.res.name}`),
        definition: decl.assignSites.get(name) ?? null,
      };
    }
    if (!allowDynamic || !this.index.instanceNames.has(name)) return null;
    const owner = [...this.index.objects.values()].find((o) => o.assignSites.has(name));
    return {
      ...plain(
        name,
        "instanceVariable",
        owner === undefined ? "instance variable" : `instance variable of ${owner.res.name}`,
      ),
      definition: owner?.assignSites.get(name) ?? null,
    };
  }

  private localSymbol(
    name: string,
    kind: "local" | "parameter",
    at: SourceLocation,
    unit: CodeUnit | null,
  ): SymbolInfo {
    const where = unit?.decl?.name;
    const detail =
      kind === "parameter"
        ? `parameter of ${where}()`
        : where === undefined
          ? "local variable"
          : `local variable of ${where}()`;
    return { ...plain(name, kind, detail), definition: at };
  }

  private userFunctionSymbol(name: string, decl: FunctionDecl, file: string, objectScoped: boolean): SymbolInfo {
    const source = this.source(file);
    const params = decl.params.map((p) => ({ name: p.name, optional: p.init !== null }));
    const signature = decl.params.map((p) =>
      p.init === null || source === undefined ? p.name : `${p.name} = ${source.text.slice(p.init.start, p.init.end)}`,
    );
    const owner = objectScoped ? file.split("/")[1] : null;
    return {
      name,
      kind: objectScoped ? "objectFunction" : "function",
      detail: `function ${name}(${signature.join(", ")})${owner ? ` of ${owner}` : ""}`,
      definition: { file, start: decl.nameStart, end: decl.nameStart + name.length },
      params,
      variadic: false,
      doc: source === undefined ? null : docComment(source, decl.start),
    };
  }

  private builtinFunctionSymbol(name: string): SymbolInfo {
    const f = builtinFunctions.get(name);
    if (f === undefined) return plain(name, "builtinFunction", name);
    const params = f.params.map((p, i) => ({ name: p.name, optional: i >= f.minArgs }));
    const variadic = f.maxArgs > f.params.length;
    const text = [
      ...f.params.map((p, i) => `${p.name}${i >= f.minArgs ? "?" : ""}: ${p.type}`),
      ...(variadic ? ["..."] : []),
    ];
    return { ...plain(name, "builtinFunction", `${name}(${text.join(", ")}): ${f.returns}`), params, variadic };
  }

  /**
   * A GameMaker alias (builtins.json `alias` entries): shown as the DSDude builtin it compiles to, with the alias
   * note as its doc. Null when `name` is not an alias of the wanted kind (a function when `call`, else a constant).
   */
  private aliasSymbol(name: string, call: boolean): SymbolInfo | null {
    const alias = builtinAliases.get(name);
    if (alias === undefined) return null;
    const constant = builtinConstants.get(alias.aliasOf);
    const target = call
      ? builtinFunctions.has(alias.aliasOf)
        ? this.builtinFunctionSymbol(alias.aliasOf)
        : null
      : constant === undefined
        ? null
        : plain(alias.aliasOf, "constant", `${alias.aliasOf} = ${constant.value}`);
    if (target === null) return null;
    return { ...target, name, detail: `GameMaker name for ${target.detail}`, doc: alias.note };
  }

  private builtinVariableSymbol(name: string): SymbolInfo {
    const v = builtinVariables.get(name);
    if (v === undefined) return plain(name, "builtinVariable", name);
    const shape = v.arrayLength > 0 ? `${v.type}[${v.arrayLength}]` : v.type;
    return plain(name, "builtinVariable", `${name}: ${shape} (${v.scope}${v.readonly ? ", read-only" : ""})`);
  }

  /** Every name reference in a unit, with what it resolves to (`with` scopes applied). */
  private refsIn(unit: CodeUnit, cb: (span: Span, symbol: SymbolInfo | null) => void): void {
    const scope = this.unitScope(unit);
    for (const p of unit.decl?.params ?? [])
      cb({ start: p.start, end: p.start + p.name.length }, this.resolveName(scope, p.name, false));
    const visit = (stmts: readonly Stmt[], sc: Scope): void => {
      const callees = new Set<Expr>();
      const onExpr = (e: Expr): void => {
        if (e.kind === "call" && e.callee.kind === "name") {
          callees.add(e.callee);
          cb(e.callee, this.resolveName(sc, e.callee.name, true));
        } else if (e.kind === "name" && !callees.has(e)) cb(e, this.resolveName(sc, e.name, false));
        else if (e.kind === "global") cb({ start: e.nameStart, end: e.end }, this.globalSymbol(e.name));
        else if (e.kind === "member") cb({ start: e.nameStart, end: e.end }, this.resolveMember(sc, e.object, e.name));
      };
      walk(stmts, {
        stmt: (s) => {
          if (s.kind === "var")
            for (const d of s.decls)
              cb({ start: d.start, end: d.start + d.name.length }, this.resolveName(sc, d.name, false));
          if (s.kind === "with") {
            walkExpr(s.target, { expr: onExpr });
            visit([s.body], { ...sc, self: this.withTarget(s.target, sc), other: sc.self });
            return false;
          }
          return true;
        },
        expr: onExpr,
      });
    };
    visit(unit.body, scope);
  }

  private globalSymbol(name: string): SymbolInfo {
    return { ...plain(name, "global", `global.${name}`), definition: this.index.globals.get(name) ?? null };
  }

  /** The symbol whose name covers `offset` in `file`, or null. */
  symbolAt(file: string, offset: number): SymbolAt | null {
    // A function's own name in its declaration.
    for (const u of this.index.units) {
      const d = u.decl;
      if (u.source.file !== file || d === null || offset < d.nameStart || offset > d.nameStart + d.name.length)
        continue;
      const span = { start: d.nameStart, end: d.nameStart + d.name.length };
      return { ...this.userFunctionSymbol(d.name, d, file, u.owner !== null), span };
    }
    let found: SymbolAt | null = null;
    for (const u of this.index.units) {
      if (u.source.file !== file || offset < u.span.start || offset > u.span.end) continue;
      this.refsIn(u, (span, symbol) => {
        if (symbol !== null && offset >= span.start && offset <= span.end) found = { ...symbol, span };
      });
      if (found !== null) return found;
    }
    return found;
  }

  /** A name's meaning outside any code: builtins, global functions, globals, assets and objects. */
  lookup(name: string): SymbolInfo | null {
    const scope: Scope = { unit: null, locals: new Map(), self: null, other: null };
    if (this.index.globals.has(name) && !builtinFunctions.has(name) && !this.index.scripts.has(name))
      return this.globalSymbol(name);
    return this.resolveName(scope, name, true) ?? this.resolveName(scope, name, false);
  }

  /** Every place that refers to the same thing as the name at `offset` (its definition included). */
  referencesAt(file: string, offset: number): SourceLocation[] {
    const target = this.symbolAt(file, offset);
    if (target === null) return [];
    const key = symbolKey(target);
    const out: SourceLocation[] = [];
    for (const u of this.index.units)
      this.refsIn(u, (span, symbol) => {
        if (symbol !== null && symbolKey(symbol) === key)
          out.push({ file: u.source.file, start: span.start, end: span.end });
      });
    for (const u of this.index.units)
      if (u.decl !== null) {
        const fnKey = symbolKey(this.userFunctionSymbol(u.decl.name, u.decl, u.source.file, u.owner !== null));
        if (fnKey === key)
          out.push({ file: u.source.file, start: u.decl.nameStart, end: u.decl.nameStart + u.decl.name.length });
      }
    const unique = new Map(out.map((l) => [`${l.file}:${l.start}`, l]));
    return [...unique.values()].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.start - b.start));
  }

  // ---- Completions and signature help ----------------------------------------------------------------------------

  /** What can be written at `offset`: after `global.`, after `x.`, or anywhere else. */
  completionsAt(file: string, offset: number): CompletionInfo[] {
    const source = this.source(file);
    if (source === undefined || insideCommentOrString(source, offset)) return [];
    const tokens = source.parsed.tokens;
    // The token being typed (if the offset is at the end of a name) does not count as context.
    let i = tokens.findIndex((t) => t.kind !== "eof" && t.end >= offset);
    if (i < 0) i = tokens.length - 1;
    const current = tokens[i] as Token;
    const beforeIndex =
      current.start < offset && (current.kind === "name" || current.kind === "keyword")
        ? i - 1
        : current.start >= offset
          ? i - 1
          : i;
    const before = tokens[beforeIndex];
    const scope = this.scopeAt(file, offset);
    if (before?.kind === "punct" && before.text === ".") {
      const owner = tokens[beforeIndex - 1];
      if (owner?.kind === "keyword" && owner.text === "global")
        return sortCompletions(
          [...this.index.globals.keys()].map((g) => ({ label: g, kind: "global", detail: `global.${g}` })),
        );
      return this.memberCompletions(scope, owner);
    }
    return this.scopeCompletions(scope);
  }

  private memberCompletions(scope: Scope, owner: Token | undefined): CompletionInfo[] {
    let known: ObjectEntry | null = null;
    if (owner?.kind === "keyword")
      known = owner.text === "self" ? scope.self : owner.text === "other" ? scope.other : null;
    else if (owner?.kind === "name" && !scope.locals.has(owner.text))
      known = this.index.objects.get(owner.text) ?? null;
    const names = known !== null ? [...known.info.slots.keys()] : [...this.index.instanceNames];
    const items: CompletionInfo[] = names.map((n) => ({
      label: n,
      kind: "instanceVariable",
      detail: this.instanceVariable(known, n, true)?.detail ?? "instance variable",
    }));
    for (const v of builtinVariables.values())
      if (v.scope === "instance")
        items.push({ label: v.name, kind: "builtinVariable", detail: this.builtinVariableSymbol(v.name).detail });
    return sortCompletions(items);
  }

  /** Every name visible at `offset` in `file`, nearest scope first (locals shadow the rest). */
  symbolsAt(file: string, offset: number): SymbolInfo[] {
    return [...this.visible(this.scopeAt(file, offset)).values()];
  }

  private scopeCompletions(scope: Scope): CompletionInfo[] {
    const items = new Map<string, CompletionInfo>();
    for (const s of this.visible(scope).values()) items.set(s.name, { label: s.name, kind: s.kind, detail: s.detail });
    for (const k of KEYWORDS) if (!items.has(k)) items.set(k, { label: k, kind: "keyword", detail: "keyword" });
    return sortCompletions([...items.values()]);
  }

  /** The symbols visible in `scope`, by name; the first one found for a name wins, as in name lookup. */
  private visible(scope: Scope): Map<string, SymbolInfo> {
    const items = new Map<string, SymbolInfo>();
    const add = (s: SymbolInfo | null) => {
      if (s !== null && !items.has(s.name)) items.set(s.name, s);
    };
    for (const [name, l] of scope.locals) add(this.localSymbol(name, l.kind, l.at, scope.unit));
    const hasInstance = this.index.hasInstance && scope.unit !== null;
    if (hasInstance) {
      const names = scope.self !== null ? [...scope.self.info.slots.keys()] : [...this.index.instanceNames];
      for (const n of names) add(this.instanceVariable(scope.self, n, true));
    }
    const owner = scope.unit?.owner ?? null;
    if (owner !== null) {
      const o = this.index.objects.get(owner);
      for (const c of o === undefined ? [] : this.index.ancestors(o))
        for (const [name, f] of c.functions) add(this.userFunctionSymbol(name, f.decl, f.file, true));
    }
    for (const [name, f] of this.index.scripts) add(this.userFunctionSymbol(name, f.decl, f.file, false));
    for (const name of builtinFunctions.keys()) add(this.builtinFunctionSymbol(name));
    for (const v of builtinVariables.values())
      if (hasInstance || v.scope === "global") add(this.builtinVariableSymbol(v.name));
    for (const [name, c] of builtinConstants) add(plain(name, "constant", `${name} = ${c.value}`));
    for (const [name, kind] of this.index.assetKinds) add(plain(name, kind, kind));
    return items;
  }

  /** Signature help for the innermost call whose argument list contains `offset`. */
  signatureAt(file: string, offset: number): SignatureInfo | null {
    const source = this.source(file);
    if (source === undefined || insideCommentOrString(source, offset)) return null;
    const tokens = source.parsed.tokens.filter((t) => t.kind !== "eof" && t.start < offset);
    let depth = 0;
    let commas = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i] as Token;
      if (t.kind !== "punct") continue;
      if (t.text === ")" || t.text === "]") depth++;
      else if (t.text === "[" && depth > 0) depth--;
      else if (t.text === "(") {
        if (depth > 0) {
          depth--;
          continue;
        }
        const callee = tokens[i - 1];
        if (callee?.kind !== "name") return null;
        const symbol = this.resolveName(this.scopeAt(file, offset), callee.text, true);
        if (symbol === null || symbol.params === null) return null;
        return { name: symbol.name, params: symbol.params, variadic: symbol.variadic, activeParameter: commas };
      } else if (t.text === "," && depth === 0) commas++;
      else if ((t.text === "{" || t.text === "}" || t.text === ";") && depth === 0) return null;
    }
    return null;
  }

  // ---- Outline, folding and classification -----------------------------------------------------------------------

  /** Functions declared in `file`, in source order. */
  documentSymbols(file: string): OutlineSymbol[] {
    return this.index.units
      .filter((u) => u.source.file === file && u.decl !== null)
      .map((u) => {
        const d = u.decl as FunctionDecl;
        return {
          name: d.name,
          kind: u.owner === null ? ("function" as const) : ("objectFunction" as const),
          span: { start: d.start, end: d.end },
          selection: { start: d.nameStart, end: d.nameStart + d.name.length },
        };
      })
      .sort((a, b) => a.span.start - b.span.start);
  }

  /** Multi-line blocks and comments of `file`. */
  foldingRanges(file: string): Span[] {
    const source = this.source(file);
    if (source === undefined) return [];
    const line = (o: number) => source.reporter.at(o).line;
    const ranges: Span[] = [];
    const add = (start: number, end: number) => {
      if (line(start) < line(Math.max(start, end - 1))) ranges.push({ start, end });
    };
    for (const u of this.index.units.filter((x) => x.source.file === file)) {
      if (u.decl !== null) add(u.decl.body.start, u.decl.body.end);
      walk(u.body, {
        stmt: (s) => {
          if (s.kind === "block") add(s.start, s.end);
          if (s.kind === "switch") add(s.start, s.end);
          return true;
        },
      });
    }
    // Block comments, and runs of line comments on consecutive lines.
    const comments = source.parsed.comments;
    for (let i = 0; i < comments.length; i++) {
      const c = comments[i] as (typeof comments)[number];
      if (c.block) {
        add(c.start, c.end);
        continue;
      }
      let j = i;
      while (
        j + 1 < comments.length &&
        !(comments[j + 1] as typeof c).block &&
        line((comments[j + 1] as typeof c).start) === line((comments[j] as typeof c).start) + 1
      )
        j++;
      if (j > i) add(c.start, (comments[j] as typeof c).end);
      i = j;
    }
    const unique = new Map(ranges.map((r) => [`${r.start}:${r.end}`, r]));
    return [...unique.values()].sort((a, b) => a.start - b.start || b.end - a.end);
  }

  /** Every token and comment of `file`, classified; names carry what they resolve to. */
  classify(file: string): TokenClass[] {
    const source = this.source(file);
    if (source === undefined) return [];
    const symbols = new Map<number, SymbolKind>();
    for (const u of this.index.units.filter((x) => x.source.file === file))
      this.refsIn(u, (span, symbol) => {
        if (symbol !== null) symbols.set(span.start, symbol.kind);
      });
    const out: TokenClass[] = [];
    for (const t of source.parsed.tokens) {
      if (t.kind === "eof") continue;
      const kind = t.kind === "int" || t.kind === "fixed" ? "number" : t.kind === "punct" ? "operator" : t.kind;
      out.push({ start: t.start, end: t.end, kind, symbol: t.kind === "name" ? (symbols.get(t.start) ?? null) : null });
    }
    for (const c of source.parsed.comments) out.push({ start: c.start, end: c.end, kind: "comment", symbol: null });
    return out.sort((a, b) => a.start - b.start);
  }
}

/** A symbol with no definition, parameters or doc. */
function plain(name: string, kind: SymbolKind, detail: string): SymbolInfo {
  return { name, kind, detail, definition: null, params: null, variadic: false, doc: null };
}

/** Identity for references: the same key means the same variable, function or asset. */
function symbolKey(s: SymbolInfo): string {
  if (s.kind === "local" || s.kind === "parameter") return `local:${s.definition?.file}:${s.definition?.start}`;
  if (s.kind === "function" || s.kind === "objectFunction") return `fn:${s.definition?.file}:${s.definition?.start}`;
  return `${s.kind}:${s.name}`;
}

function sortCompletions(items: CompletionInfo[]): CompletionInfo[] {
  return items.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

/** Is `offset` strictly inside a comment or a string literal? */
function insideCommentOrString(source: SourceText, offset: number): boolean {
  if (source.parsed.comments.some((c) => offset > c.start && (offset < c.end || (!c.block && offset === c.end))))
    return true;
  return source.parsed.tokens.some((t) => t.kind === "string" && offset > t.start && offset < t.end);
}

/**
 * The comment right above `start` (line comments on the lines directly before it, or one block comment ending on
 * the line before), without its markers; null when there is none.
 */
function docComment(source: SourceText, start: number): string | null {
  const line = (o: number) => source.reporter.at(o).line;
  const target = line(start);
  const above = source.parsed.comments.filter((c) => c.end <= start).reverse();
  const lines: string[] = [];
  let expected = target - 1;
  for (const c of above) {
    if (line(Math.max(c.start, c.end - 1)) !== expected) break;
    if (c.block) {
      lines.unshift(
        c.text
          .replace(/^\/\*+/, "")
          .replace(/\*+\/$/, "")
          .split("\n")
          .map((l) => l.replace(/^\s*\*?\s?/, "").trimEnd())
          .join("\n")
          .trim(),
      );
      break;
    }
    lines.unshift(c.text.replace(/^\/\/\s?/, "").trimEnd());
    expected--;
  }
  const text = lines.join("\n").trim();
  return text === "" ? null : text;
}
