/**
 * validate-asset-loader.ts — byte-exact oracle for decode-asset.ts.
 *
 * On the NIGHTLY core + committed maze-corridor.state, read every zone's live
 * floor (DGROUP 0x7d2) and ceiling (DGROUP 0x80a) heap block, strip the 0x20-byte
 * heap header, and compare the record payload against the offline
 * decodeFloorImage / decodeCeilingImage from the on-disk DISK.HDR/MASTER.HDR/
 * SCENARIO.DBS. Asserts 0 byte diffs for all 12 zones x {floor,ceiling}.
 */
import { resolve } from 'node:path';
import { HostClient } from '../../packages/mcp/src/live/host-client.js';
import { loadAssetDb, decodeFloorImage, decodeCeilingImage } from '../parity/decode-asset.js';

const STATE = resolve('tools/libretro/states/maze-corridor.state');
const HEADER = 0x20; // ramp(16) + WROOT header(16) before the record payload

async function main() {
  const db = loadAssetDb();
  const c = new HostClient();
  await c.step(3000);
  await c.unserialize(STATE);
  await c.step(2);
  const dg = await c.anchor();
  const ftab = await c.read(dg + 0x7d2, 4 * 12);
  const ctab = await c.read(dg + 0x80a, 4 * 12);

  let fail = 0;
  for (let z = 0; z < 12; z++) {
    const fseg = ftab[z * 4 + 2] | (ftab[z * 4 + 3] << 8);
    const cseg = ctab[z * 4 + 2] | (ctab[z * 4 + 3] << 8);
    const fRec = decodeFloorImage(db, z);
    const cRec = decodeCeilingImage(db, z);
    const fLive = await c.read(fseg * 16 + HEADER, fRec.length);
    const cLive = await c.read(cseg * 16 + HEADER, cRec.length);
    const fd = countDiff(fRec, fLive);
    const cd = countDiff(cRec, cLive);
    if (fd || cd) fail++;
    console.log(
      `zone${z}: floor(bank2 rec${z + 2}, ${fRec.length}B) diff=${fd}  ` +
      `ceil(bank3 rec${z + 2}, ${cRec.length}B) diff=${cd}` +
      (fd || cd ? '  <-- MISMATCH' : '  OK'),
    );
  }
  c.close();
  console.log(fail === 0
    ? '\nALL 24 (12 floor + 12 ceiling) records BYTE-EXACT vs live in-RAM blocks.'
    : `\n${fail} zone(s) MISMATCHED.`);
  process.exit(fail === 0 ? 0 : 1);
}

function countDiff(a: Uint8Array, b: Uint8Array): number {
  let n = Math.abs(a.length - b.length);
  const m = Math.min(a.length, b.length);
  for (let i = 0; i < m; i++) if (a[i] !== b[i]) n++;
  return n;
}

main().catch((e) => { console.error(e); process.exit(1); });
