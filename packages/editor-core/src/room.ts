/**
 * The room core: operations on a C1 room (`room.json`: size, per-screen background + view, instances). The mutators
 * change the room they are given, so they run inside immer recipes (`host.project.update`, `edit`); the queries are
 * pure. Layout is "separate": each instance lives on one screen (its own `screen`, else its object's), and each
 * screen has its own background and 256x192 view into the room.
 */

export type Screen = "top" | "bottom";

export const DS_SCREEN = { width: 256, height: 192 } as const;

export interface InstanceLike {
  object: string;
  x: number;
  y: number;
  screen?: Screen;
  creationCode?: string;
}

export interface RoomLike {
  width: number;
  height: number;
  screens: Record<Screen, { background: string | null; viewX: number; viewY: number }>;
  instances: InstanceLike[];
}

export interface ObjectInfo {
  name: string;
  sprite: string | null;
  screen: Screen;
  visible: boolean;
  depth: number;
}

export interface SpriteInfo {
  name: string;
  frameWidth: number;
  frameHeight: number;
  origin: { x: number; y: number };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The size of the marker drawn for an object without a sprite (and of a wall cell by default). */
export const MARKER = 16;

export function snap(v: number, grid: number): number {
  return grid > 1 ? Math.floor(v / grid) * grid : Math.round(v);
}

export function instanceScreen(inst: InstanceLike, objects: ReadonlyMap<string, ObjectInfo>): Screen {
  return inst.screen ?? objects.get(inst.object)?.screen ?? "top";
}

/** The instance's box in room pixels: its sprite's frame placed by the origin, else a marker at (x, y). */
export function instanceBox(
  inst: InstanceLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  sprites: ReadonlyMap<string, SpriteInfo>,
): Box {
  const sprite = sprites.get(objects.get(inst.object)?.sprite ?? "");
  if (!sprite) return { x: inst.x, y: inst.y, width: MARKER, height: MARKER };
  return {
    x: inst.x - sprite.origin.x,
    y: inst.y - sprite.origin.y,
    width: sprite.frameWidth,
    height: sprite.frameHeight,
  };
}

/** Draw order: higher depth first (behind), equal depth in list order. Returns instance indices. */
export function drawOrder(room: RoomLike, objects: ReadonlyMap<string, ObjectInfo>, screen: Screen): number[] {
  return room.instances
    .map((inst, i) => ({ i, inst }))
    .filter(({ inst }) => instanceScreen(inst, objects) === screen)
    .sort((a, b) => (objects.get(b.inst.object)?.depth ?? 0) - (objects.get(a.inst.object)?.depth ?? 0) || a.i - b.i)
    .map(({ i }) => i);
}

/** The topmost instance on `screen` whose box contains (x, y), or -1. */
export function hitTest(
  room: RoomLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  sprites: ReadonlyMap<string, SpriteInfo>,
  screen: Screen,
  x: number,
  y: number,
): number {
  const order = drawOrder(room, objects, screen);
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k] as number;
    const b = instanceBox(room.instances[i] as InstanceLike, objects, sprites);
    if (x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height) return i;
  }
  return -1;
}

/** Instances whose box overlaps the rectangle (rubber-band selection). */
export function instancesIn(
  room: RoomLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  sprites: ReadonlyMap<string, SpriteInfo>,
  screen: Screen,
  r: Box,
): number[] {
  return drawOrder(room, objects, screen).filter((i) => {
    const b = instanceBox(room.instances[i] as InstanceLike, objects, sprites);
    return b.x < r.x + r.width && b.x + b.width > r.x && b.y < r.y + r.height && b.y + b.height > r.y;
  });
}

// ---------------------------------------------------------------------------------------------------------
// Mutators (use inside immer recipes)

/** Adds an instance; `screen` is stored only when it differs from the object's. Returns its index. */
export function placeInstance(
  room: RoomLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  object: string,
  x: number,
  y: number,
  screen: Screen,
): number {
  const inst: InstanceLike = { object, x: Math.round(x), y: Math.round(y) };
  if ((objects.get(object)?.screen ?? "top") !== screen) inst.screen = screen;
  room.instances.push(inst);
  return room.instances.length - 1;
}

export function moveInstances(room: RoomLike, indices: readonly number[], dx: number, dy: number): void {
  for (const i of indices) {
    const inst = room.instances[i];
    if (!inst) continue;
    inst.x = Math.round(inst.x + dx);
    inst.y = Math.round(inst.y + dy);
  }
}

export function deleteInstances(room: RoomLike, indices: readonly number[]): void {
  for (const i of [...new Set(indices)].sort((a, b) => b - a)) room.instances.splice(i, 1);
}

/**
 * Wall paint mode (block platformers): puts `object` at the grid cell containing each point on `screen`, unless one
 * is already there. Returns how many were added.
 */
export function paintCells(
  room: RoomLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  object: string,
  screen: Screen,
  points: readonly (readonly [number, number])[],
  grid: number,
): number {
  let added = 0;
  const taken = new Set(
    room.instances
      .filter((inst) => inst.object === object && instanceScreen(inst, objects) === screen)
      .map((inst) => `${inst.x},${inst.y}`),
  );
  for (const [px, py] of points) {
    if (px < 0 || py < 0 || px >= room.width || py >= room.height) continue;
    const x = snap(px, grid);
    const y = snap(py, grid);
    if (taken.has(`${x},${y}`)) continue;
    taken.add(`${x},${y}`);
    placeInstance(room, objects, object, x, y, screen);
    added++;
  }
  return added;
}

/** Removes `object` instances whose cell contains one of the points. Returns how many were removed. */
export function eraseCells(
  room: RoomLike,
  objects: ReadonlyMap<string, ObjectInfo>,
  object: string,
  screen: Screen,
  points: readonly (readonly [number, number])[],
  grid: number,
): number {
  const cells = new Set(points.map(([x, y]) => `${snap(x, grid)},${snap(y, grid)}`));
  const doomed = room.instances
    .map((inst, i) => ({ inst, i }))
    .filter(
      ({ inst }) =>
        inst.object === object && instanceScreen(inst, objects) === screen && cells.has(`${inst.x},${inst.y}`),
    )
    .map(({ i }) => i);
  deleteInstances(room, doomed);
  return doomed.length;
}

/** The view position clamped so the 256x192 view stays inside the room. */
export function clampView(room: Pick<RoomLike, "width" | "height">, viewX: number, viewY: number): [number, number] {
  return [
    Math.max(0, Math.min(Math.round(viewX), room.width - DS_SCREEN.width)),
    Math.max(0, Math.min(Math.round(viewY), room.height - DS_SCREEN.height)),
  ];
}

export function setView(room: RoomLike, screen: Screen, viewX: number, viewY: number): void {
  const [x, y] = clampView(room, viewX, viewY);
  room.screens[screen].viewX = x;
  room.screens[screen].viewY = y;
}

// ---------------------------------------------------------------------------------------------------------
// Meters

/**
 * Sprites each screen will draw: visible instances of objects with a sprite (an invisible object, such as a wall,
 * uses no sprite slot). Compare with C13 `spritesPerScreen` (128).
 */
export function spritesPerScreen(room: RoomLike, objects: ReadonlyMap<string, ObjectInfo>): Record<Screen, number> {
  const out: Record<Screen, number> = { top: 0, bottom: 0 };
  for (const inst of room.instances) {
    const obj = objects.get(inst.object);
    if (!obj?.sprite || !obj.visible) continue;
    out[instanceScreen(inst, objects)]++;
  }
  return out;
}
