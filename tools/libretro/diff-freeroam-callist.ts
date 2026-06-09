/**
 * diff-freeroam-callist.ts — Step 3 diagnosis: for each captured engine call-list
 * (tools/libretro/trace-maze.ts freeroam), compute generateFullCallList(block,
 * party) for the SAME view and diff the OR index set + masked pairs vs the engine
 * ground truth. Characterizes WHY the generator is wrong per view.
 *
 * Usage: pnpm tsx tools/libretro/diff-freeroam-callist.ts <callist.json...>
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateFullCallList } from '../../packages/parser/src/maze/callist.js';
import { loadLevel0 } from '../parity/maze-view-cases.js';

interface EngineCall { branch: 'OR' | 'masked'; arg0c: number; arg10: number }

function summarizeSet(a: number[], b: number[]): { common: number[]; onlyA: number[]; onlyB: number[] } {
  const sa = new Set(a), sb = new Set(b);
  return {
    common: [...sa].filter((x) => sb.has(x)).sort((p, q) => p - q),
    onlyA: [...sa].filter((x) => !sb.has(x)).sort((p, q) => p - q),
    onlyB: [...sb].filter((x) => !sa.has(x)).sort((p, q) => p - q),
  };
}

function main() {
  const { block } = loadLevel0();
  for (const arg of process.argv.slice(2)) {
    const j = JSON.parse(readFileSync(resolve(arg), 'utf8'));
    const t = j.target;
    if (!t) { console.log(`${arg}: no target — skip`); continue; }
    const party = { gx: t.gx, gy: t.gy, z: 0, facing: t.facing };
    console.log(`\n=== ${arg}  view gx${t.gx} gy${t.gy} f${t.facing} (capture: ${j.capture}) ===`);

    const engCalls: EngineCall[] = j.calls ?? [];
    const engOR = engCalls.filter((c) => c.branch === 'OR').map((c) => c.arg0c);
    const engMasked = engCalls.filter((c) => c.branch === 'masked').map((c) => ({ src: c.arg0c, dst: c.arg10 }));

    const gen = generateFullCallList(block, party);
    const genOR = gen.filter((c) => c.kind === 'OR').map((c) => (c as { src: number }).src);
    const genMasked = gen.filter((c) => c.kind === 'masked').map((c) => {
      const m = c as { src: number; dst: number };
      return { src: m.src, dst: m.dst };
    });

    console.log(`engine: ${engOR.length} OR + ${engMasked.length} masked  |  generated: ${genOR.length} OR + ${genMasked.length} masked`);

    const orDiff = summarizeSet(engOR, genOR);
    const orExact = orDiff.onlyA.length === 0 && orDiff.onlyB.length === 0;
    console.log(`OR index SET: ${orExact ? 'EXACT MATCH' : 'DIFFER'}`);
    if (!orExact) {
      console.log(`  engine OR : [${[...engOR].sort((a, b) => a - b).join(',')}]`);
      console.log(`  generated : [${[...genOR].sort((a, b) => a - b).join(',')}]`);
      console.log(`  engine-only (generator MISSING): [${orDiff.onlyA.join(',')}]`);
      console.log(`  gen-only   (generator SPURIOUS): [${orDiff.onlyB.join(',')}]`);
    }
    // OR ORDER (only meaningful if the set matches).
    if (orExact) {
      const orderMatch = engOR.length === genOR.length && engOR.every((v, i) => v === genOR[i]);
      console.log(`OR ORDER: ${orderMatch ? 'EXACT' : 'DIFFERS'}`);
      if (!orderMatch) { console.log(`  engine order: [${engOR.join(',')}]`); console.log(`  gen order   : [${genOR.join(',')}]`); }
    }

    // masked diff (src->dst pairs).
    const engMaskedKeys = engMasked.map((m) => `${m.src}->${m.dst}`);
    const genMaskedKeys = genMasked.map((m) => `${m.src}->${m.dst}`);
    const mDiff = summarizeSet(engMaskedKeys.map((_, i) => i), []); void mDiff;
    const engMs = new Set(engMaskedKeys), genMs = new Set(genMaskedKeys);
    const mExact = engMaskedKeys.length === genMaskedKeys.length && [...engMs].every((k) => genMs.has(k));
    console.log(`MASKED pairs: ${mExact ? 'EXACT MATCH' : 'DIFFER'}`);
    if (!mExact) {
      console.log(`  engine masked: [${engMaskedKeys.join(', ')}]`);
      console.log(`  generated    : [${genMaskedKeys.join(', ')}]`);
      console.log(`  engine-only (MISSING): [${[...engMs].filter((k) => !genMs.has(k)).join(', ')}]`);
      console.log(`  gen-only (SPURIOUS)  : [${[...genMs].filter((k) => !engMs.has(k)).join(', ')}]`);
    }
  }
}
main();
