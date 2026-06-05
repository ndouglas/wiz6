/**
 * maze-classify-validate.ts — validate the orient2-aware classify algorithm
 * against the deterministic engine reads in /tmp/maze-block.json (all 12 frames).
 * This locks the algorithm before porting it into packages/parser/src/maze/classify.ts.
 */
import { readFileSync } from 'node:fs';
import {
  classifyVisibleWalls,
  type MazeBlock,
  type MazeParty,
} from '../../packages/parser/src/maze/classify.js';

const data = JSON.parse(readFileSync('/tmp/maze-block.json', 'utf8'));
const block: MazeBlock = {
  gxBase: data.planes.gxBase,
  gyBase: data.planes.gyBase,
  regions: data.planes.regions,
};

let allOk = true;
for (const f of data.frames) {
  const party: MazeParty = { gx: f.party.gx, gy: f.party.gy, z: 0, facing: f.party.facing };
  const sides = classifyVisibleWalls(block, party);
  // emit depthFields from sides:
  const got: number[] = [];
  for (let d = 0; d < sides.length; d++) for (const _ of sides[d]!) got.push(d);
  got.sort((a, b) => a - b);
  const want = [...f.wt2_live].sort((a: number, b: number) => a - b);
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) allOk = false;
  console.log(`${f.name.padEnd(24)} want=${JSON.stringify(want)} got=${JSON.stringify(got)} ${ok ? 'OK' : 'X'}`);
}
console.log(allOk ? 'ALL OK' : 'SOME FAIL');
process.exit(allOk ? 0 : 1);
