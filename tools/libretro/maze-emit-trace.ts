/**
 * maze-emit-trace.ts — single-frame-step a fresh rebuild and capture, for each
 * span_count increment, the (depth_counter, slot5220, span just appended).
 * Defeats the trace wall by sampling DGROUP every frame during the multi-frame build.
 */
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
const u16 = (b: Uint8Array, o = 0): number => b[o]! | (b[o + 1]! << 8);
const s16 = (v: number) => (v > 0x7fff ? v - 0x10000 : v);
const O = { facing: 0x4f9a, slot: 0x5220, span_count: 0x50ce, span_list: 0x50d0, depth_counter: 0x5040,
  front_gate: 0x508a, leftA: 0x5072, leftB: 0x507a, rightA: 0x5092, rightB: 0x509a,
  q50aa: 0x50aa, q504e: 0x504e, decor5043: 0x5043, decor5050: 0x5050, sec5066: 0x5066 };

function readSpans(b: Uint8Array, cnt: number) {
  const spans: any[] = [];
  for (let i = 0; i < cnt; i++) {
    const o = i * 0xb;
    spans.push({ x0: u16(b, o), x1: u16(b, o + 2), clipLo: u16(b, o + 4), clipHi: u16(b, o + 6),
      wt: b[o + 8], seam: b[o + 9], df: b[o + 10] });
  }
  return spans;
}

async function run(c: HostClient, name: string, state: string, keys: string[]) {
  await c.unserialize(state);
  await c.step(2);
  for (const k of keys) { await c.key(k, 'tap'); await c.step(40); }
  const base0 = await c.anchor();
  const facing = u16(await c.read(base0 + O.facing, 2));
  console.log(`\n=== ${name} facing=${facing} ===`);
  // turn away and back to force a fresh build; sample EVERY frame
  for (const turn of ['left', 'right']) {
    await c.key(turn, 'tap');
    let prevCnt = -1, prevDc = -999, prevSlot = '';
    for (let f = 0; f < 30; f++) {
      await c.step(1);
      const b = await c.anchor();
      const dc = s16(u16(await c.read(b + O.depth_counter, 2)));
      const cnt = u16(await c.read(b + O.span_count, 2));
      const slotB = await c.read(b + O.slot, 10);
      const slot = [0,1,2,3,4].map(i => u16(slotB, i*2));
      const slotStr = JSON.stringify(slot);
      if (cnt !== prevCnt) {
        // a span was appended — capture it + the current gate state
        const sb = cnt > 0 ? await c.read(b + O.span_list, cnt * 0xb) : new Uint8Array(0);
        const spans = readSpans(sb, cnt);
        const last = cnt > 0 ? spans[cnt - 1] : null;
        const fg = Array.from(await c.read(b + O.front_gate, 4));
        const lA = Array.from(await c.read(b + O.leftA, 4));
        const rA = Array.from(await c.read(b + O.rightA, 4));
        console.log(`  [${turn}+${f}] cnt ${prevCnt}->${cnt} dc=${dc} slot=${slotStr} LAST=${JSON.stringify(last)} fg=${JSON.stringify(fg)} lA=${JSON.stringify(lA)} rA=${JSON.stringify(rA)}`);
        prevCnt = cnt;
      } else if (dc !== prevDc || slotStr !== prevSlot) {
        console.log(`  [${turn}+${f}] dc=${dc} slot=${slotStr} cnt=${cnt}`);
      }
      prevDc = dc; prevSlot = slotStr;
    }
  }
}

async function main() {
  const c = new HostClient();
  const S = (n: string) => `${process.cwd()}/tools/libretro/states/${n}.state`;
  try {
    await run(c, 'lookback', S('maze-corridor'), ['right', 'right']);
  } finally { c.close(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
