/**
 * `compileProject` (contract C4 `CompileFn`): a loaded Project -> one DSDB (C2) plus the per-room asset sets.
 * Synchronous and Worker-safe: the project arrives as data (C1), nothing here touches the file system.
 *
 * Passes:
 * 1. Parse every event, functions.dss, script and room creation code (E1xx), and check event file names (E308/E309).
 * 2. Declare functions: scripts are global, functions.dss is object-scoped and inherited (events.md section 3).
 * 3. Slot layouts: each object's instance variables are its parent's layout, then the names assigned anywhere in
 *    its own code, sorted (language.md section 5); more than 24 is E491.
 * 4. Code generation for every event, function and creation code (src/codegen/function.ts).
 * 5. OBJS, ROOM (with per-screen asset sets, PLAN.md 3.2) and ASET.
 */
import {
  type AssetDef,
  type DsdbModule,
  emptyModule,
  encode,
  eventId,
  type Func,
  type ObjectDef,
  type RoomDef,
} from "@dsdude/dsdb";
import type { Diagnostic, Project } from "@dsdude/project-format";
import type { AssetManifest, CompileOutput, RoomAssetSet } from "@dsdude/toolchain";
import { COMPILER_BUILTINS_ENV } from "./codegen/abi.ts";
import { builtinConstants, builtinFunctions, builtinVariables } from "./codegen/builtins.ts";
import { declareFunction } from "./codegen/declare.ts";
import type { AssetNameKind, CodegenEnv } from "./codegen/env.ts";
import { compileFunction } from "./codegen/function.ts";
import { finishModule } from "./codegen/module.ts";
import type { CompilerCode } from "./diagnostics/catalog.ts";
import { type DiagArgs, Reporter } from "./diagnostics/report.ts";
import type {
  CodeUnit,
  DeclaredFunction,
  ObjectEntry,
  ProjectIndex,
  SourceLocation,
  SourceText,
} from "./project-index.ts";
import type { Expr, FunctionDecl, LValue, Span, Stmt } from "./syntax/ast.ts";
import { type FileKind, parse } from "./syntax/parser.ts";
import { localsOf, walk } from "./syntax/walk.ts";

/** At most this many user slots per object, parents included (C13 `userSlotsPerObject`). */
const MAX_USER_SLOTS = 24;
/** GETDYN/SETDYN name a symbol in 8 bits (ADR-0005). */
const MAX_SYMBOLS = 256;
/** Separator between an object's name and an event or function in generated FUNC names. */
const SEP = "__";
/** Prefix of object-function FUNC names after the separator, so they can never collide with event stems. */
const FUNCTION_PREFIX = "fn_";

/** Every event file stem contracts/events.md section 1 allows, except collision_<object> (checked separately). */
const EVENT_STEM =
  /^(create|destroy|begin_step|step|end_step|alarm_[0-7]|draw|(button_pressed|button_released|button_held)_(a|b|x|y|l|r|start|select|up|down|left|right)|touch_pressed|touch_released|touch_held|global_touch_pressed|global_touch_released|global_touch_held|game_start|game_end|room_start|room_end|animation_end|outside_room|user_[0-7])$/;
const COLLISION_PREFIX = "collision_";
/** Instance touch events, which fire only for bottom-screen instances (events.md section 1; W031). */
const TOUCH_EVENT = /^touch_(pressed|released|held)$/;

export interface CompileProjectOptions {
  /** DSDB header RNG seed (`--seed N`); 0 lets the runtime choose (contracts/dsdb.md section 2). */
  seed?: number;
}

/** compileProject's result plus the symbolic module (for goldens and `dsdb-dis`), null on errors. */
export interface CompileProjectResult extends CompileOutput {
  module: DsdbModule | null;
}

/** C4 `CompileFn`: compiles a loaded project. */
export function compileProject(project: Project, manifest: AssetManifest): CompileOutput {
  const { dsdb, roomSets, diagnostics } = compileProjectModule(project, manifest);
  return { dsdb, roomSets, diagnostics };
}

/** compileProject with options, also returning the symbolic module. */
export function compileProjectModule(
  project: Project,
  manifest: AssetManifest,
  options: CompileProjectOptions = {},
): CompileProjectResult {
  return new ProjectCompiler(project, manifest, options).run();
}

/** Runs passes 1-3 (parse, declare, lay out slots) and returns the shared project view; never throws. */
export function indexProject(project: Project): ProjectIndex {
  return new ProjectCompiler(project, EMPTY_MANIFEST, {}).index();
}

/** Used by indexProject, which never reaches the asset passes. */
const EMPTY_MANIFEST: AssetManifest = { provisional: true, sprites: {}, backgrounds: {}, sounds: {} };

class ProjectCompiler {
  private readonly project: Project;
  private readonly manifest: AssetManifest;
  private readonly options: CompileProjectOptions;
  private readonly diagnostics: Diagnostic[] = [];
  private readonly units: CodeUnit[] = [];
  private readonly objects = new Map<string, ObjectEntry>();
  private readonly scripts = new Map<string, DeclaredFunction>();
  private readonly sources: SourceText[] = [];
  private readonly globals = new Map<string, SourceLocation>();
  private readonly assetKinds = new Map<string, AssetNameKind>();
  /** Names written through another instance or from code whose object is unknown (dynamic symbols). */
  private readonly dynamicNames = new Set<string>();
  /** Every slot name of every object, plus dynamicNames. */
  private readonly instanceNames = new Set<string>();

  constructor(project: Project, manifest: AssetManifest, options: CompileProjectOptions) {
    this.project = project;
    this.manifest = manifest;
    this.options = options;
  }

  /** Passes 1-3, whatever errors they find (the language service works on broken code too). */
  index(): ProjectIndex {
    this.indexAssets();
    this.indexObjects();
    this.parseAll();
    this.layouts();
    return {
      hasInstance: true,
      sources: this.sources,
      units: this.units,
      objects: this.objects,
      scripts: this.scripts,
      assetKinds: this.assetKinds,
      instanceNames: this.instanceNames,
      globals: this.globals,
      diagnostics: this.diagnostics,
      ancestors: (o) => this.ancestors(o),
      lookupFunction: (owner, name) =>
        (owner === null ? null : this.lookupObjectFunction(owner, name)) ?? this.scripts.get(name) ?? null,
    };
  }

  run(): CompileProjectResult {
    this.index();
    if (this.hasErrors()) return this.failed();
    this.projectLints();
    const functions = this.units.map((u) => this.generate(u));
    const fromCodegen = this.units.flatMap((u) => u.source.reporter.diagnostics);
    this.diagnostics.push(...dedupe(fromCodegen));
    const module = this.assemble(functions);
    const symbolCount = new Set([...module.symbols, ...module.objects.flatMap((o) => o.slots.map((s) => s.symbol))])
      .size;
    if (symbolCount > MAX_SYMBOLS) this.report(null, "E494", { count: symbolCount });
    const roomSets = this.roomSets(module);
    if (this.hasErrors()) return { ...this.failed(), roomSets };
    return { dsdb: encode(module, COMPILER_BUILTINS_ENV), roomSets, diagnostics: this.diagnostics, module };
  }

  // ---- Helpers ---------------------------------------------------------------------------------------------------

  private hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === "error");
  }

  private failed(): CompileProjectResult {
    return { dsdb: new Uint8Array(0), roomSets: [], diagnostics: this.diagnostics, module: null };
  }

  /** Reports a diagnostic about a whole file (no position), e.g. an object.json or an event file name. */
  private report(file: string | null, code: CompilerCode, args: DiagArgs): void {
    const r = new Reporter(file, "");
    r.report(code, args, 0, 0);
    const d = r.diagnostics[0] as Diagnostic;
    this.diagnostics.push({ ...d, line: null, col: null });
  }

  // ---- Pass 1: names and sources ---------------------------------------------------------------------------------

  private indexAssets(): void {
    for (const s of this.project.sprites) this.assetKinds.set(s.name, "sprite");
    for (const b of this.project.backgrounds) this.assetKinds.set(b.name, "background");
    for (const s of this.project.sounds) this.assetKinds.set(s.name, s.kind === "music" ? "music" : "sound");
    for (const o of this.project.objects) this.assetKinds.set(o.name, "object");
    for (const r of this.project.rooms) this.assetKinds.set(r.name, "room");
  }

  private indexObjects(): void {
    for (const res of this.project.objects)
      this.objects.set(res.name, {
        res,
        parent: null,
        info: { name: res.name, slots: new Map() },
        assigned: new Set(),
        assignSites: new Map(),
        functions: new Map(),
      });
    // A missing parent or a parent loop is the project loader's E294/E299; the compiler then ignores the parent.
    for (const o of this.objects.values()) {
      const p = o.res.parent === null ? undefined : this.objects.get(o.res.parent);
      if (p !== undefined && !this.ancestors(p).includes(o)) o.parent = p;
    }
  }

  /** `o` and its ancestors, nearest first. */
  private ancestors(o: ObjectEntry): ObjectEntry[] {
    const chain: ObjectEntry[] = [];
    for (let c: ObjectEntry | null = o; c !== null && !chain.includes(c); c = c.parent) chain.push(c);
    return chain;
  }

  /** Parses one source text; its parse diagnostics join the project's. */
  private parseText(file: string, text: string, kind: FileKind) {
    const clean = text.replace(/\r/g, "");
    const parsed = parse(clean, { file, kind });
    this.diagnostics.push(...parsed.diagnostics);
    const source: SourceText = { file, text: clean, parsed, reporter: new Reporter(file, clean) };
    this.sources.push(source);
    return { ast: parsed.ast, source };
  }

  /** Declares a function found in `source`, remembering where. */
  private declareFrom(fn: FunctionDecl, funcName: string, source: SourceText): DeclaredFunction {
    const isAsset = (n: string) => this.assetKinds.has(n);
    return { ...declareFunction(fn, funcName, source.reporter, isAsset), file: source.file, decl: fn };
  }

  private parseAll(): void {
    // Scripts first: their functions are global.
    for (const script of this.project.scripts) {
      const { ast, source } = this.parseText(`scripts/${script.name}.dss`, script.source, "functions");
      for (const fn of functionsOf(ast.items)) {
        if (this.scripts.has(fn.name)) {
          source.reporter.report("E208", { name: fn.name }, fn.nameStart, fn.nameStart + fn.name.length);
          continue;
        }
        this.scripts.set(fn.name, this.declareFrom(fn, fn.name, source));
        this.units.push(unitOf("script", fn.name, null, null, fn, source));
      }
    }
    for (const o of this.objects.values()) {
      const dir = `objects/${o.res.name}`;
      if (o.res.functions !== null) {
        const { ast, source } = this.parseText(`${dir}/functions.dss`, o.res.functions, "functions");
        for (const fn of functionsOf(ast.items)) {
          const funcName = `${o.res.name}${SEP}${FUNCTION_PREFIX}${fn.name}`;
          if (o.functions.has(fn.name)) {
            source.reporter.report("E208", { name: fn.name }, fn.nameStart, fn.nameStart + fn.name.length);
            continue;
          }
          o.functions.set(fn.name, this.declareFrom(fn, funcName, source));
          this.units.push(unitOf("function", funcName, o.res.name, null, fn, source));
        }
      }
      for (const stem of Object.keys(o.res.events).sort()) {
        const file = `${dir}/${stem}.dss`;
        if (!this.checkEventStem(stem, file)) continue;
        const { ast, source } = this.parseText(file, o.res.events[stem] as string, "code");
        // Functions declared in an event file are object functions of that object (grammar `file`).
        for (const fn of functionsOf(ast.items)) {
          const funcName = `${o.res.name}${SEP}${FUNCTION_PREFIX}${fn.name}`;
          if (!o.functions.has(fn.name)) {
            o.functions.set(fn.name, this.declareFrom(fn, funcName, source));
            this.units.push(unitOf("function", funcName, o.res.name, null, fn, source));
          }
        }
        const body = ast.items.filter((i): i is Stmt => i.kind !== "function");
        this.units.push({
          kind: "event",
          funcName: `${o.res.name}${SEP}${stem}`,
          owner: o.res.name,
          stem,
          params: [],
          body,
          decl: null,
          span: ast,
          source,
        });
      }
    }
    for (const room of this.project.rooms)
      room.instances.forEach((inst, i) => {
        if (inst.creationCode === undefined || inst.creationCode.trim() === "") return;
        const { ast, source } = this.parseText(`rooms/${room.name}/room.json`, inst.creationCode, "code");
        const body = ast.items.filter((s): s is Stmt => s.kind !== "function");
        this.units.push({
          kind: "creation",
          funcName: `${room.name}${SEP}inst_${i}`,
          owner: inst.object,
          stem: null,
          params: [],
          body,
          decl: null,
          span: ast,
          source,
        });
      });
  }

  /** Checks an event file's stem (events.md section 1): E308 unknown, E309 collision with no such object. */
  private checkEventStem(stem: string, file: string): boolean {
    if (EVENT_STEM.test(stem)) return true;
    if (stem.startsWith(COLLISION_PREFIX)) {
      const target = stem.slice(COLLISION_PREFIX.length);
      if (this.objects.has(target)) return true;
      this.report(file, "E309", { file, name: target });
      return false;
    }
    this.report(file, "E308", { file });
    return false;
  }

  // ---- Pass 3: slot layouts --------------------------------------------------------------------------------------

  private layouts(): void {
    for (const u of this.units) this.collectAssignments(u);
    const done = new Set<ObjectEntry>();
    const layout = (o: ObjectEntry): void => {
      if (done.has(o)) return;
      done.add(o);
      const slots = new Map<string, number>();
      if (o.parent !== null) {
        layout(o.parent);
        for (const [name, slot] of o.parent.info.slots) slots.set(name, slot);
      }
      for (const name of [...o.assigned].sort()) if (!slots.has(name)) slots.set(name, slots.size);
      o.info = { name: o.res.name, slots };
      if (slots.size > MAX_USER_SLOTS)
        this.report(`objects/${o.res.name}/object.json`, "E491", {
          object: o.res.name,
          count: slots.size,
          max: MAX_USER_SLOTS,
        });
    };
    for (const o of this.objects.values()) layout(o);
    for (const o of this.objects.values()) for (const name of o.info.slots.keys()) this.instanceNames.add(name);
    for (const name of this.dynamicNames) this.instanceNames.add(name);
    // A global that is only ever read still exists as a name (reading it before any assignment is a runtime error).
    for (const u of this.units)
      walk(u.body, {
        expr: (e) => {
          if (e.kind === "global" && !this.globals.has(e.name))
            this.globals.set(e.name, { file: u.source.file, start: e.start, end: e.end });
        },
      });
  }

  /** Is `name`, written bare, an instance variable (rather than a builtin, constant, asset or function)? */
  private isPlainName(name: string, owner: string | null): boolean {
    if (builtinVariables.has(name) || builtinConstants.has(name) || builtinFunctions.has(name)) return false;
    if (this.assetKinds.has(name) || this.scripts.has(name)) return false;
    return owner === null || this.lookupObjectFunction(owner, name) === null;
  }

  /** Records the instance variables a unit assigns, on the object that will hold them. */
  private collectAssignments(u: CodeUnit): void {
    const locals = localsOf(u.params, u.body);
    const owner = u.owner === null ? null : (this.objects.get(u.owner) ?? null);
    const other =
      u.kind === "event" && u.stem?.startsWith(COLLISION_PREFIX)
        ? (this.objects.get(u.stem.slice(COLLISION_PREFIX.length)) ?? null)
        : null;
    this.collectIn(u, u.body, locals, owner, other, u.owner);
  }

  private collectIn(
    u: CodeUnit,
    body: readonly Stmt[],
    locals: Set<string>,
    self: ObjectEntry | null,
    other: ObjectEntry | null,
    owner: string | null,
  ): void {
    const add = (o: ObjectEntry | null, name: string, at: Span) => {
      if (o === null) {
        this.dynamicNames.add(name);
        return;
      }
      o.assigned.add(name);
      // The first assignment is the variable's definition, a Create event's first one preferred.
      const site = o.assignSites.get(name);
      const inCreate = u.stem === "create" && u.owner === o.res.name;
      if (site === undefined || (inCreate && !site.file.endsWith("/create.dss")))
        o.assignSites.set(name, { file: u.source.file, start: at.start, end: at.end });
    };
    const target = (t: LValue): void => {
      // The variable an assignment creates: `a`, `a[i]`, `a[i][j]` all create `a`.
      let base: Expr = t;
      while (base.kind === "index") base = base.object;
      if (base.kind === "name" && !locals.has(base.name) && this.isPlainName(base.name, owner))
        add(self, base.name, base);
      else if (base.kind === "global" && !this.globals.has(base.name))
        this.globals.set(base.name, { file: u.source.file, start: base.start, end: base.end });
      else if (base.kind === "member" && !builtinVariables.has(base.name)) {
        const obj = base.object;
        const at = { start: base.nameStart, end: base.end };
        if (obj.kind === "special" && obj.which === "self") add(self, base.name, at);
        else if (obj.kind === "special" && obj.which === "other") add(other, base.name, at);
        else add(null, base.name, at);
      }
    };
    walk(body, {
      stmt: (s) => {
        if (s.kind === "assign" || s.kind === "incdec") target(s.target);
        if (s.kind === "with") {
          // Inside `with`, self is the target and other is the outer self.
          const inner = this.withTarget(s.target, locals, self, other);
          this.collectIn(u, [s.body], locals, inner, self, inner?.res.name ?? null);
          return false;
        }
        return true;
      },
    });
  }

  /** The object a `with` target makes self, when known. */
  private withTarget(
    t: Expr,
    locals: Set<string>,
    self: ObjectEntry | null,
    other: ObjectEntry | null,
  ): ObjectEntry | null {
    if (t.kind === "special") return t.which === "self" ? self : t.which === "other" ? other : null;
    if (t.kind === "name" && !locals.has(t.name)) return this.objects.get(t.name) ?? null;
    return null;
  }

  // ---- Project lints (contracts/diagnostics.md "Lints") ----------------------------------------------------------

  /** W031 touch events on the top screen, W050 empty rooms, W051 placed objects nobody can see, W052 unused sprites. */
  private projectLints(): void {
    for (const o of this.objects.values())
      if (o.res.screen === "top")
        for (const stem of Object.keys(o.res.events).sort())
          if (TOUCH_EVENT.test(stem))
            this.report(`objects/${o.res.name}/${stem}.dss`, "W031", { what: `The ${stem} event`, object: o.res.name });
    for (const room of this.project.rooms) {
      const file = `rooms/${room.name}/room.json`;
      if (room.instances.length === 0) this.report(file, "W050", { room: room.name });
      const warned = new Set<string>();
      for (const inst of room.instances) {
        const o = this.objects.get(inst.object);
        if (o === undefined || warned.has(o.res.name) || !o.res.visible || o.res.sprite !== null) continue;
        // Visible-off objects (controllers such as Flappy's obj_ctrl) are exempt; so is anything with a Draw event.
        if (this.ancestors(o).some((c) => "draw" in c.res.events)) continue;
        warned.add(o.res.name);
        this.report(file, "W051", { object: o.res.name, room: room.name });
      }
    }
    const usedSprites = new Set(this.project.objects.map((o) => o.sprite));
    for (const u of this.units)
      walk(u.body, {
        expr: (e) => {
          if (e.kind === "name" && this.assetKinds.get(e.name) === "sprite") usedSprites.add(e.name);
        },
      });
    for (const sprite of this.project.sprites)
      if (!usedSprites.has(sprite.name))
        this.report(`sprites/${sprite.name}/sprite.json`, "W052", { sprite: sprite.name });
  }

  // ---- Pass 4: code generation -----------------------------------------------------------------------------------

  /** An object function visible from `owner`'s code: its own, then its ancestors' (events.md section 3). */
  private lookupObjectFunction(owner: string, name: string): DeclaredFunction | null {
    const o = this.objects.get(owner);
    if (o === undefined) return null;
    for (const c of this.ancestors(o)) {
      const f = c.functions.get(name);
      if (f !== undefined) return f;
    }
    return null;
  }

  private generate(u: CodeUnit): Func {
    const owner = u.owner === null ? null : (this.objects.get(u.owner) ?? null);
    const collisionTarget = u.stem?.startsWith(COLLISION_PREFIX)
      ? this.objects.get(u.stem.slice(COLLISION_PREFIX.length))
      : undefined;
    const reachable = (): string[] => [
      ...(owner === null ? [] : this.ancestors(owner).flatMap((c) => [...c.functions.keys()])),
      ...this.scripts.keys(),
    ];
    const env: CodegenEnv = {
      file: u.source.file,
      reporter: u.source.reporter,
      hasInstance: true,
      self: owner?.info ?? null,
      other: collisionTarget?.info ?? null,
      event: u.kind === "event" ? u.stem : null,
      objectScreen: owner?.res.screen ?? null,
      lookupFunction: (name) =>
        (u.owner === null ? null : this.lookupObjectFunction(u.owner, name)) ?? this.scripts.get(name) ?? null,
      functionNames: reachable,
      assetKind: (name) => this.assetKinds.get(name) ?? null,
      assetNames: () => this.assetKinds.keys(),
      objectInfo: (name) => this.objects.get(name)?.info ?? null,
      isInstanceVariableName: (name) => this.instanceNames.has(name),
      helperOwner: (name) => {
        for (const o of this.objects.values()) if (o.functions.has(name)) return o.res.name;
        return null;
      },
    };
    return compileFunction(env, { name: u.funcName, params: u.params, body: u.body });
  }

  // ---- Pass 5: the module ----------------------------------------------------------------------------------------

  private assemble(functions: Func[]): DsdbModule {
    const m = emptyModule();
    m.seed = this.options.seed ?? 0;
    m.assets = this.assetDefs();
    m.functions = this.orderFunctions(functions);
    const objectIndex = new Map(this.project.objects.map((o, i) => [o.name, i]));
    const index = (name: string) => objectIndex.get(name) ?? -1;
    m.objects = [...this.objects.values()].map((o): ObjectDef => {
      const events = this.units
        .filter((u) => u.kind === "event" && u.owner === o.res.name)
        .map((u) => ({ event: u.stem as string, func: u.funcName }))
        .sort((a, b) => eventId(a.event, index) - eventId(b.event, index));
      return {
        name: o.res.name,
        parent: o.parent?.res.name ?? null,
        sprite: o.res.sprite !== null && this.assetKinds.get(o.res.sprite) === "sprite" ? o.res.sprite : null,
        visible: o.res.visible,
        screen: o.res.screen,
        depth: o.res.depth,
        slots: [...o.info.slots]
          .map(([symbol, slot]) => ({ symbol, slot }))
          .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0)),
        events,
      };
    });
    m.rooms = this.project.rooms.map((room): RoomDef => {
      const screen = (s: "top" | "bottom") => ({
        background: room.screens[s].background,
        viewX: room.screens[s].viewX,
        viewY: room.screens[s].viewY,
      });
      return {
        name: room.name,
        width: room.width,
        height: room.height,
        screens: [screen("top"), screen("bottom")],
        instances: room.instances
          .filter((inst) => this.objects.has(inst.object))
          .map((inst) => ({
            object: inst.object,
            x: inst.x,
            y: inst.y,
            screen: inst.screen ?? (this.objects.get(inst.object) as ObjectEntry).res.screen,
            creation:
              this.units.find(
                (u) => u.kind === "creation" && u.funcName === `${room.name}${SEP}inst_${room.instances.indexOf(inst)}`,
              )?.funcName ?? null,
          })),
        sets: [
          { sprites: [], backgrounds: [] },
          { sprites: [], backgrounds: [] },
        ],
        sounds: [],
      };
    });
    m.firstRoom = this.project.rooms.some((r) => r.name === this.project.project.firstRoom)
      ? this.project.project.firstRoom
      : (this.project.rooms[0]?.name ?? null);
    return finishModule(m);
  }

  /**
   * FUNC order: per object (name order) its functions in source order, then its events by event id; then scripts
   * (name order, source order inside); then creation code by room and instance.
   */
  private orderFunctions(functions: Func[]): Func[] {
    const byName = new Map(functions.map((f) => [f.name, f]));
    const objectIndex = new Map(this.project.objects.map((o, i) => [o.name, i]));
    const index = (name: string) => objectIndex.get(name) ?? -1;
    const order: string[] = [];
    for (const o of this.objects.values()) {
      order.push(...this.units.filter((u) => u.kind === "function" && u.owner === o.res.name).map((u) => u.funcName));
      order.push(
        ...this.units
          .filter((u) => u.kind === "event" && u.owner === o.res.name)
          .sort((a, b) => eventId(a.stem as string, index) - eventId(b.stem as string, index))
          .map((u) => u.funcName),
      );
    }
    order.push(...this.units.filter((u) => u.kind === "script").map((u) => u.funcName));
    order.push(...this.units.filter((u) => u.kind === "creation").map((u) => u.funcName));
    return order.map((n) => byName.get(n) as Func);
  }

  /**
   * ASET: sprites, backgrounds, then sounds and music, each by name. Paths and `aux` follow the provisional C4
   * AssetManifest until WS5's contracts/assetpack.md (C3) fixes them.
   */
  private assetDefs(): AssetDef[] {
    const sprites = this.project.sprites.map(
      (s): AssetDef => ({
        kind: "sprite",
        name: s.name,
        path: `gfx/${s.name}.grf`,
        aux: this.manifest.sprites[s.name]?.frames ?? s.frames,
        // ADR-0006: sprite.json's geometry travels in the DSDB's SPRG extension.
        geometry: {
          width: s.frameWidth,
          height: s.frameHeight,
          originX: s.origin.x,
          originY: s.origin.y,
          bboxLeft: s.bbox.left,
          bboxTop: s.bbox.top,
          bboxRight: s.bbox.right,
          bboxBottom: s.bbox.bottom,
        },
      }),
    );
    const backgrounds = this.project.backgrounds.map(
      (b): AssetDef => ({ kind: "background", name: b.name, path: `bg/${b.name}.grf`, aux: 0 }),
    );
    const sounds = this.project.sounds.map(
      (s): AssetDef => ({
        kind: s.kind === "music" ? "music" : "sound",
        name: s.name,
        path: "",
        aux: this.manifest.sounds[s.name]?.id ?? 0,
      }),
    );
    return [...sprites, ...backgrounds, ...sounds];
  }

  // ---- Room asset sets (PLAN.md 3.2) -----------------------------------------------------------------------------

  /** Fills each ROOM's per-screen sets and sounds in `m`, and returns them as C4 RoomAssetSets. */
  private roomSets(m: DsdbModule): RoomAssetSet[] {
    const refs = this.objectReferences();
    return m.rooms.map((room) => {
      const top = { sprites: new Set<string>(), backgrounds: new Set<string>() };
      const bottom = { sprites: new Set<string>(), backgrounds: new Set<string>() };
      const sounds = new Set<string>();
      const onScreen = (s: "top" | "bottom") => (s === "top" ? top : bottom);
      for (const [i, s] of (["top", "bottom"] as const).entries()) {
        const bg = room.screens[i]?.background;
        if (bg !== null && bg !== undefined) onScreen(s).backgrounds.add(bg);
      }
      // Objects placed here (on their instance's screen), then everything they create, transitively.
      const seen = new Set<string>();
      const queue: [string, "top" | "bottom"][] = room.instances.map((inst) => [inst.object, inst.screen]);
      while (queue.length > 0) {
        const [name, screen] = queue.shift() as [string, "top" | "bottom"];
        const key = `${name}/${screen}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r = refs.get(name);
        if (r === undefined) continue;
        const screens: ("top" | "bottom")[] = r.bothScreens ? ["top", "bottom"] : [screen];
        for (const s of screens) {
          for (const sp of r.sprites) onScreen(s).sprites.add(sp);
          for (const bg of r.backgrounds) onScreen(s).backgrounds.add(bg);
        }
        for (const snd of r.sounds) sounds.add(snd);
        for (const created of r.creates) queue.push([created, (this.objects.get(created) as ObjectEntry).res.screen]);
      }
      const sorted = (s: Set<string>) => [...s].sort();
      room.sets = [
        { sprites: sorted(top.sprites), backgrounds: sorted(top.backgrounds) },
        { sprites: sorted(bottom.sprites), backgrounds: sorted(bottom.backgrounds) },
      ];
      room.sounds = sorted(sounds);
      return {
        room: room.name,
        screens: { top: room.sets[0], bottom: room.sets[1] },
        sounds: room.sounds,
      };
    });
  }

  /**
   * What each object's code can need at run time: its sprite, the assets its code (and inherited code, and the
   * scripts it calls, transitively) names, the objects it creates, and whether it draws on both screens.
   */
  private objectReferences(): Map<string, AssetRefs> {
    const unitRefs = new Map<CodeUnit, AssetRefs & { calls: Set<string> }>();
    for (const u of this.units) unitRefs.set(u, this.scanUnit(u));
    const scriptUnits = new Map(this.units.filter((u) => u.kind === "script").map((u) => [u.funcName, u]));
    const result = new Map<string, AssetRefs>();
    for (const o of this.objects.values()) {
      const acc: AssetRefs = {
        sprites: new Set(),
        backgrounds: new Set(),
        sounds: new Set(),
        creates: new Set(),
        bothScreens: false,
      };
      if (o.res.sprite !== null && this.assetKinds.get(o.res.sprite) === "sprite") acc.sprites.add(o.res.sprite);
      const names = new Set(this.ancestors(o).map((c) => c.res.name));
      const pending = this.units.filter((u) => u.owner !== null && names.has(u.owner) && u.kind !== "creation");
      const visited = new Set<CodeUnit>();
      while (pending.length > 0) {
        const u = pending.pop() as CodeUnit;
        if (visited.has(u)) continue;
        visited.add(u);
        const r = unitRefs.get(u) as AssetRefs & { calls: Set<string> };
        mergeRefs(acc, r);
        for (const c of r.calls) {
          const s = scriptUnits.get(c);
          if (s !== undefined) pending.push(s);
        }
      }
      result.set(o.res.name, acc);
    }
    return result;
  }

  /** The asset names, created objects and script calls in one unit. */
  private scanUnit(u: CodeUnit): AssetRefs & { calls: Set<string> } {
    const locals = localsOf(u.params, u.body);
    const r = {
      sprites: new Set<string>(),
      backgrounds: new Set<string>(),
      sounds: new Set<string>(),
      creates: new Set<string>(),
      bothScreens: false,
      calls: new Set<string>(),
    };
    const visitExpr = (e: Expr): void => {
      if (e.kind === "name" && !locals.has(e.name)) {
        const kind = this.assetKinds.get(e.name);
        if (kind === "sprite") r.sprites.add(e.name);
        else if (kind === "background") r.backgrounds.add(e.name);
        else if (kind === "sound" || kind === "music") r.sounds.add(e.name);
      }
      if (e.kind === "call" && e.callee.kind === "name") {
        r.calls.add(e.callee.name);
        if (e.callee.name === "draw_set_screen") r.bothScreens = true;
        const created = e.callee.name === "instance_create" ? e.args[2] : undefined;
        if (created?.kind === "name" && this.objects.has(created.name)) r.creates.add(created.name);
      }
    };
    walk(u.body, { expr: visitExpr });
    return r;
  }
}

/** Assets and objects one object's code may need. */
interface AssetRefs {
  sprites: Set<string>;
  backgrounds: Set<string>;
  sounds: Set<string>;
  /** Objects it creates with instance_create. */
  creates: Set<string>;
  /** True when its code calls draw_set_screen, so its sprites may show on either screen. */
  bothScreens: boolean;
}

function mergeRefs(into: AssetRefs, from: AssetRefs): void {
  for (const k of ["sprites", "backgrounds", "sounds", "creates"] as const) for (const x of from[k]) into[k].add(x);
  into.bothScreens ||= from.bothScreens;
}

function functionsOf(items: readonly (Stmt | FunctionDecl)[]): FunctionDecl[] {
  return items.filter((i): i is FunctionDecl => i.kind === "function");
}

function unitOf(
  kind: "function" | "script",
  funcName: string,
  owner: string | null,
  stem: null,
  fn: FunctionDecl,
  source: SourceText,
): CodeUnit {
  return {
    kind,
    funcName,
    owner,
    stem,
    params: fn.params.map((p) => p.name),
    body: fn.body.body,
    decl: fn,
    span: fn,
    source,
  };
}

/** Drops exact repeats (a function body compiled twice would report twice). */
function dedupe(ds: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return ds.filter((d) => {
    const key = JSON.stringify(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
