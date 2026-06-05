/**
 * maze-view-cases.ts — Task C1 enumeration of the DISTINCT first-person
 * view-cases the REACHABLE starting area of dungeon level 0 exercises.
 *
 * This is the offline (map-only) half of C1: BFS the reachable (gx,gy,facing)
 * space from the START NEW GAME entrance under the real movement rules
 * (`turn` + `tryStepForward` from @wiz6/parser movement.ts — collision-gated),
 * compute the per-(cell,facing) VIEW-CONFIG that determines the rendered first-
 * person view (the cells/edges in the classify view frustum: per depth d=0..3
 * the corrected front edge + cornerL + cornerR + leftSide + rightSide, plus the
 * head-on-door recess flag), DEDUPE by view-config, and expose the finite set of
 * DISTINCT view-cases + a representative (gx,gy,facing) for each.
 *
 * This case list is what Stage C ports (C2/C3) and gates (C4). The per-case
 * engine FRAMEBUFFER fixtures are captured by capture-maze-view-cases.ts (the
 * live half of C1) keyed off the representatives this module emits.
 *
 * ANCHORS:
 *   - level data: extracted/maze/level-0.json (the decoded MazeBlock; A1/A2).
 *   - movement law: @wiz6/parser movement.ts (turn / tryStepForward — wmaze
 *     0x3244 collision gate, view-step 0x37a7).
 *   - view-config primitives: @wiz6/parser maze-geometry.ts + classify.ts
 *     (the corrected per-facing forward-edge selector 0x3828/0x36dd/0x3742,
 *     cornerL 0x3c11, cornerR 0x3dce, side reads, depth loop 0x521e=4).
 *
 * ENTRANCE NOTE (important): the captured fixtures + the C-stage gate use the
 * ENGINE arrow-controllable entrance gy=121 (the first frame the player can steer
 * with the arrow keys), NOT the extracted/viewer level entrance gy=120. The
 * gy=120 frame is the party's position DURING the scripted gate-walk and is NOT
 * arrow-controllable in the engine (an engine arrow-BFS confirms the whole
 * controllable area is gy>=121; the one-way N3 gate door blocks travel back
 * north). See docs/re/findings/maze-view-cases.json `entrance_discrepancy` —
 * flagged for the parent: the viewer entrance should likely be gy=121.
 *
 * Pure (no I/O beyond reading the committed level JSON). Run:
 *   pnpm tsx tools/parity/maze-view-cases.ts             # engine entrance gy=121 + MVP cap
 *   pnpm tsx tools/parity/maze-view-cases.ts --extracted # gy=120 viewer entrance (engine-unreachable)
 *   import { enumerateViewCases } from './maze-view-cases.js'  # programmatic
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MazeBlock, MazeParty } from '../../packages/data/src/index.js';
import { turn, tryStepForward } from '../../packages/parser/src/index.js';

// classify.ts does not export its internal frustum primitives, so we re-derive
// the SAME per-depth view-config here using the shared geometry module. These
// are byte-identical to the helpers classify.ts uses (it imports the same
// maze-geometry.ts primitives); see classify.ts cornerL/cornerR/sideForward.
import {
  isSolid,
  resolve as resolveCell,
  N,
  W,
  step,
  forwardEdge,
} from '../../packages/parser/src/maze/maze-geometry.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const LEVEL_PATH = resolve(REPO_ROOT, 'extracted', 'maze', 'level-0.json');

/** Max depths the BUILD loop walks (wmaze DGROUP 0x521e = 4). Mirrors classify.ts. */
const DEPTH_BOUND = 4;

// ── Frustum primitives (mirror classify.ts EXACTLY) ─────────────────────────

/** Corner-L perpendicular edge (classify_corner_L 0x3c11, dispatch 0x3d20). */
function cornerL(b: MazeBlock, gx: number, gy: number, facing: number): number {
  switch (facing) {
    case 0:
      return W(b, gx - 1, gy);
    case 1:
      return N(b, gx, gy);
    case 2:
      return W(b, gx, gy);
    default:
      return N(b, gx, gy - 1);
  }
}

/** Corner-R perpendicular edge (classify_corner_R 0x3dce, dispatch 0x3edd). */
function cornerR(b: MazeBlock, gx: number, gy: number, facing: number): number {
  switch (facing) {
    case 0:
      return W(b, gx, gy);
    case 1:
      return N(b, gx, gy - 1);
    case 2:
      return W(b, gx - 1, gy);
    default:
      return N(b, gx, gy);
  }
}

/** Side slot: lateral view-step (OOB-after-step -> SOLID 2) then forward-edge of
 *  the neighbour (classify_front_side side params 0xffff/1). Mirrors classify.ts. */
function sideForward(
  b: MazeBlock,
  gx: number,
  gy: number,
  facing: number,
  lateral: -1 | 1,
): number {
  const [sx, sy] = step(gx, gy, facing, lateral, 0);
  if (!resolveCell(b, sx, sy)) return 2;
  return forwardEdge(b, sx, sy, facing);
}

// ── View-config ─────────────────────────────────────────────────────────────

/** Per-depth frustum slot (the edge codes the classifier reads at depth d). */
export interface DepthSlot {
  depth: number;
  front: number; // forward edge of the depth cell (corrected per-facing selector)
  cornerL: number; // perpendicular corner-L edge
  cornerR: number; // perpendicular corner-R edge
  leftSide: number; // lateral-step neighbour forward edge (left)
  rightSide: number; // lateral-step neighbour forward edge (right)
  bounded: boolean; // >=1 of cL/cR/lS/rS solid (corridor bounded here)
  inRegion: boolean; // depth cell resolves to a region (else OOB → all solid)
}

/** The full local view-config that determines the rendered first-person view. */
export interface ViewConfig {
  slots: DepthSlot[]; // DEPTH_BOUND entries (d=0..3)
  headOnDoorDepth: number; // depth of the head-on door (front===3, facing 2/3), or -1
}

/** Compute the view-config for a (cell, facing) — the cells/edges in the frustum. */
export function viewConfig(block: MazeBlock, party: MazeParty): ViewConfig {
  const { gx, gy, facing } = party;
  const slots: DepthSlot[] = [];
  let [cgx, cgy] = step(gx, gy, facing, 0, -1); // entry pull-back (forward=-1)
  for (let d = 0; d < DEPTH_BOUND; d++) {
    [cgx, cgy] = step(cgx, cgy, facing, 0, 1); // advance forward 1
    const front = forwardEdge(block, cgx, cgy, facing);
    const cL = cornerL(block, cgx, cgy, facing);
    const cR = cornerR(block, cgx, cgy, facing);
    const lS = sideForward(block, cgx, cgy, facing, -1);
    const rS = sideForward(block, cgx, cgy, facing, 1);
    const bounded = isSolid(cL) || isSolid(cR) || isSolid(lS) || isSolid(rS);
    const inRegion = resolveCell(block, cgx, cgy) !== null;
    slots.push({
      depth: d,
      front,
      cornerL: cL,
      cornerR: cR,
      leftSide: lS,
      rightSide: rS,
      bounded,
      inRegion,
    });
  }
  // ORIENT2 head-on-door gate: a door (front===3) is a drawn recess only for the
  // head-on facings 2/3 (classify.ts headOnFacing). For 0/1 it reads the back face.
  const headOnFacing = facing === 2 || facing === 3;
  const headOnDoorDepth = headOnFacing ? slots.findIndex((s) => s.front === 3) : -1;
  return { slots, headOnDoorDepth };
}

/** Canonical string key for a view-config (for dedup). Captures every field that
 *  feeds the wall classifier + the recess gate. */
export function viewConfigKey(cfg: ViewConfig): string {
  const slotKey = cfg.slots
    .map(
      (s) =>
        `${s.front}:${s.cornerL}:${s.cornerR}:${s.leftSide}:${s.rightSide}:${s.bounded ? 1 : 0}:${s.inRegion ? 1 : 0}`,
    )
    .join('|');
  return `${slotKey}#door=${cfg.headOnDoorDepth}`;
}

// ── Reachability BFS (real movement rules) ──────────────────────────────────

export interface ReachableState {
  gx: number;
  gy: number;
  facing: number;
}

function stateKey(s: ReachableState): string {
  return `${s.gx},${s.gy},${s.facing}`;
}

/** BFS the reachable (gx,gy,facing) space from the entrance under turn +
 *  tryStepForward (collision-gated). z is fixed at the entrance z (level 0).
 *
 *  `maxForwardSteps` (default Infinity) caps the BFS by the number of FORWARD
 *  steps (cell moves) taken from the entrance — turns are free. This keeps the
 *  enumerated "starting area" bounded for capture: the full level 0 is hundreds
 *  of cells, but the MVP only needs the distinct view-cases the immediate
 *  starting area exercises. A cap of N means: every (cell,facing) within N cell
 *  moves of the entrance (any number of turns). */
export function enumerateReachable(
  block: MazeBlock,
  entrance: MazeParty,
  maxForwardSteps = Infinity,
): ReachableState[] {
  const seen = new Set<string>();
  const queue: Array<{ p: MazeParty; steps: number }> = [{ p: entrance, steps: 0 }];
  seen.add(stateKey(entrance));
  const out: ReachableState[] = [];
  while (queue.length) {
    const { p, steps } = queue.shift()!;
    out.push({ gx: p.gx, gy: p.gy, facing: p.facing });
    const fwd = tryStepForward(p, block);
    const moved = fwd.gx !== p.gx || fwd.gy !== p.gy;
    const neighbours: Array<{ next: MazeParty; steps: number }> = [
      { next: turn(p, 'left'), steps },
      { next: turn(p, 'right'), steps },
    ];
    if (moved && steps < maxForwardSteps) {
      neighbours.push({ next: fwd, steps: steps + 1 });
    }
    for (const { next, steps: ns } of neighbours) {
      const k = stateKey(next);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push({ p: next, steps: ns });
      }
    }
  }
  return out;
}

/** BFS the SHORTEST key-path (sequence of 'left'|'right'|'forward') from the
 *  entrance to a target (gx,gy,facing) under the real movement rules. Returns
 *  null if unreachable (should never happen for an enumerated reachable state).
 *  This is the navigation script the live capture replays. */
export type MoveKey = 'left' | 'right' | 'forward';

export function pathTo(
  block: MazeBlock,
  entrance: MazeParty,
  target: ReachableState,
): MoveKey[] | null {
  const start: MazeParty = { ...entrance };
  const startK = stateKey(start);
  const targetK = stateKey(target);
  if (startK === targetK) return [];
  const prev = new Map<string, { from: string; key: MoveKey }>();
  const seen = new Set<string>([startK]);
  const queue: MazeParty[] = [start];
  while (queue.length) {
    const p = queue.shift()!;
    const moves: Array<{ key: MoveKey; next: MazeParty }> = [
      { key: 'left', next: turn(p, 'left') },
      { key: 'right', next: turn(p, 'right') },
      { key: 'forward', next: tryStepForward(p, block) },
    ];
    for (const m of moves) {
      const k = stateKey(m.next);
      if (k === stateKey(p)) continue; // a no-op forward (blocked) — skip
      if (seen.has(k)) continue;
      seen.add(k);
      prev.set(k, { from: stateKey(p), key: m.key });
      if (k === targetK) {
        // Reconstruct.
        const path: MoveKey[] = [];
        let cur = k;
        while (cur !== startK) {
          const e = prev.get(cur)!;
          path.push(e.key);
          cur = e.from;
        }
        return path.reverse();
      }
      queue.push(m.next);
    }
  }
  return null;
}

// ── Distinct-case taxonomy ──────────────────────────────────────────────────

/** A distinct view-case: a unique view-config + every (cell,facing) that hits it. */
export interface DistinctCase {
  id: string; // stable short label (e.g. "case-00")
  kind: string; // human classification (corridor / dead-end / junction / door / ...)
  configKey: string;
  config: ViewConfig;
  members: ReachableState[]; // every reachable (gx,gy,facing) with this config
  representative: ReachableState; // the chosen representative for fixture capture
  path: MoveKey[]; // key-sequence from the entrance to the representative
}

export interface Enumeration {
  entrance: MazeParty;
  reachable: ReachableState[];
  reachableConfigs: Array<{ state: ReachableState; configKey: string }>;
  distinct: DistinctCase[];
}

/** Classify a view-config into a coarse human "kind" for the taxonomy. The
 *  classify pass only emits side-walls; a config's character is read from the
 *  d=0 slot (immediate surroundings) + the front run. Heuristic labelling only —
 *  the configKey is the authoritative dedup key. */
function classifyKind(cfg: ViewConfig): string {
  const s0 = cfg.slots[0]!;
  const leftOpen = !isSolid(s0.cornerL) && !isSolid(s0.leftSide);
  const rightOpen = !isSolid(s0.cornerR) && !isSolid(s0.rightSide);
  const frontBlocked = isSolid(s0.front);
  // Depth at which the front run is first blocked (dead-end / back wall).
  const frontRun = cfg.slots.findIndex((s) => isSolid(s.front));
  const labels: string[] = [];
  if (cfg.headOnDoorDepth >= 0) labels.push(`door@d${cfg.headOnDoorDepth}`);
  if (frontBlocked) labels.push('front-wall');
  if (leftOpen && rightOpen) labels.push('4-way-ish');
  else if (leftOpen) labels.push('left-open');
  else if (rightOpen) labels.push('right-open');
  else labels.push('corridor');
  if (!frontBlocked && frontRun >= 0) labels.push(`deadend@d${frontRun}`);
  else if (!frontBlocked) labels.push('open-ahead');
  return labels.join('/');
}

/** Pick a representative for a distinct case: prefer the member nearest the
 *  entrance (smallest BFS-order index — first discovered), to minimise nav. */
function pickRepresentative(
  members: ReachableState[],
  order: Map<string, number>,
): ReachableState {
  return members.reduce((best, m) =>
    (order.get(stateKey(m)) ?? Infinity) < (order.get(stateKey(best)) ?? Infinity)
      ? m
      : best,
  );
}

export function enumerateViewCases(
  block: MazeBlock,
  entrance: MazeParty,
  maxForwardSteps = Infinity,
): Enumeration {
  const reachable = enumerateReachable(block, entrance, maxForwardSteps);
  const order = new Map<string, number>();
  reachable.forEach((s, i) => order.set(stateKey(s), i));

  const reachableConfigs = reachable.map((state) => {
    const cfg = viewConfig(block, { ...state, z: entrance.z });
    return { state, configKey: viewConfigKey(cfg), config: cfg };
  });

  // Dedup by configKey.
  const byKey = new Map<string, { config: ViewConfig; members: ReachableState[] }>();
  for (const rc of reachableConfigs) {
    const e = byKey.get(rc.configKey);
    if (e) e.members.push(rc.state);
    else byKey.set(rc.configKey, { config: rc.config, members: [rc.state] });
  }

  // Stable order: by first-discovery of any member.
  const distinct: DistinctCase[] = [...byKey.entries()]
    .sort((a, b) => {
      const ai = Math.min(...a[1].members.map((m) => order.get(stateKey(m)) ?? Infinity));
      const bi = Math.min(...b[1].members.map((m) => order.get(stateKey(m)) ?? Infinity));
      return ai - bi;
    })
    .map(([configKey, { config, members }], i) => {
      const representative = pickRepresentative(members, order);
      const path = pathTo(block, entrance, representative) ?? [];
      return {
        id: `case-${String(i).padStart(2, '0')}`,
        kind: classifyKind(config),
        configKey,
        config,
        members,
        representative,
        path,
      };
    });

  return {
    entrance,
    reachable,
    reachableConfigs: reachableConfigs.map(({ state, configKey }) => ({ state, configKey })),
    distinct,
  };
}

// ── Loader ──────────────────────────────────────────────────────────────────

export function loadLevel0(): { block: MazeBlock; entrance: MazeParty } {
  const j = JSON.parse(readFileSync(LEVEL_PATH, 'utf8'));
  const block: MazeBlock = j.mazeBlock;
  const e = j.entrance;
  const entrance: MazeParty = { gx: e.gx, gy: e.gy, z: e.z, facing: e.facing };
  return { block, entrance };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

/** The ENGINE arrow-controllable entrance — the first frame the player can
 *  steer with the arrow keys. This is gy=121 (one cell SOUTH of the extracted
 *  level entrance gy=120, past the one-way N3 gate door). The extracted gy=120
 *  is the position DURING the scripted gate-walk and is NOT arrow-controllable
 *  in the engine. See docs/re/findings/maze-view-cases.json `entrance_discrepancy`.
 *  The captured fixtures + the C-stage gate use THIS entrance + cap. */
export const ENGINE_ENTRANCE: MazeParty = { gx: 127, gy: 121, z: 0, facing: 0 };
/** Forward-step cap for the MVP starting-area enumeration (the full level is
 *  hundreds of cells reachable from gy=121). */
export const MVP_MAX_FORWARD_STEPS = 2;

function main(): void {
  const { block, entrance: extracted } = loadLevel0();
  // Default: the ENGINE entrance + MVP cap (matches the captured fixtures).
  // `--extracted` uses the (engine-unreachable) gy=120 viewer entrance instead.
  const useExtracted = process.argv.includes('--extracted');
  const entrance = useExtracted ? extracted : ENGINE_ENTRANCE;
  const cap = useExtracted ? Infinity : MVP_MAX_FORWARD_STEPS;
  printEnumeration(enumerateViewCases(block, entrance, cap));
}

function printEnumeration(e: Enumeration): void {
  console.log('=== maze-view-cases (level 0) ===');
  console.log(`entrance: gx=${e.entrance.gx} gy=${e.entrance.gy} z=${e.entrance.z} facing=${e.entrance.facing}`);
  console.log(`reachable (gx,gy,facing) states: ${e.reachable.length}`);
  const cells = new Set(e.reachable.map((s) => `${s.gx},${s.gy}`));
  console.log(`reachable distinct CELLS: ${cells.size}`);
  console.log(`DISTINCT view-cases: ${e.distinct.length}`);
  console.log('');
  for (const c of e.distinct) {
    const r = c.representative;
    console.log(
      `${c.id}  [${c.kind}]  members=${c.members.length}  rep=(gx${r.gx},gy${r.gy},f${r.facing})  path=[${c.path.join(',')}]`,
    );
    for (const s of c.config.slots) {
      console.log(
        `    d${s.depth}: front=${s.front} cL=${s.cornerL} cR=${s.cornerR} lS=${s.leftSide} rS=${s.rightSide} bounded=${s.bounded ? 1 : 0} inReg=${s.inRegion ? 1 : 0}`,
      );
    }
    console.log(`    headOnDoorDepth=${c.config.headOnDoorDepth}`);
  }
}

// Run if invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
