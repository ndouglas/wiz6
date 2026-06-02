/** verify-squad.ts — decode legendary-squad/pcfile.dbs and print the roster. */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePcfile } from '../../packages/parser/src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const RN = ['Human', 'Elf', 'Dwarf', 'Gnome', 'Hobbit', 'Faerie', 'Lizardman', 'Dracon', 'Felpurr', 'Rawulf', 'Mook'];
const CN = ['Fighter', 'Mage', 'Priest', 'Thief', 'Ranger', 'Alchemist', 'Bard', 'Psionic', 'Valkyrie', 'Bishop', 'Lord', 'Samurai', 'Monk', 'Ninja'];

const path = process.argv[2] ?? join(REPO_ROOT, 'legendary-squad', 'pcfile.dbs');
const bytes = new Uint8Array(readFileSync(path));
const dec = decodePcfile(bytes);
let n = 0;
for (const s of dec.slots) {
  if (!s.populated) continue;
  n++;
  console.log(
    `slot ${s.slot}: ${(s.name ?? '').padEnd(7)} | ${RN[s.race]?.padEnd(10)}(${s.race}) ${CN[s.class]?.padEnd(9)}(${s.class}) ${s.sex === 1 ? 'F' : 'M'}(${s.sex}) | ` +
    `attrs=[${s.str},${s.int},${s.pie},${s.vit},${s.dex},${s.spd},${s.per},${s.kar}] hp=${s.hpCurrent}/${s.hpMax} sp=${s.spCurrent}/${s.spMax}`,
  );
}
console.log(`\n${n} populated slot(s).`);
