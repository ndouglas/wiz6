#!/usr/bin/env tsx
/**
 * findings-lint: walk docs/re/findings/*.json and report addresses that
 * don't follow the typed `{space, offset}` convention documented in
 * docs/re/findings/README.md.
 *
 * Usage:
 *   pnpm tsx tools/findings-lint/check.ts             # report mode
 *   pnpm tsx tools/findings-lint/check.ts --fix       # auto-retrofit
 *   pnpm tsx tools/findings-lint/check.ts --fix --file path/to/findings.json
 *
 * Auto-fix safety: only converts bare-hex addresses when the segment is
 * unambiguously inferable from the file's topic + binary metadata. Findings
 * spanning multiple binaries (e.g. cross-overlay deep-dives) are flagged
 * but left alone for manual review.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { SegmentSpace } from '@wiz6/data';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const FINDINGS_DIR = join(REPO_ROOT, 'docs/re/findings');

const VALID_SPACES: readonly SegmentSpace[] = [
  'wroot.exe', 'wroot.dgroup',
  'winit.ovr', 'wbase.ovr', 'wmaze.ovr', 'wmele.ovr', 'wmnpc.ovr',
  'wpcvw.ovr', 'wpcmk.ovr', 'wpops.ovr', 'wtrea.ovr', 'wmexe.ovr', 'wdopt.ovr',
  'ega.drv', 'cga.drv', 'herc.drv',
];

interface AddressOccurrence {
  path: string[];
  value: unknown;
  parent: Record<string, unknown>;
  key: string;
  /** Sibling `binary` field on the same evidence object, if present — used
   *  to disambiguate per-finding inference for multi-binary findings docs. */
  siblingBinary: string | undefined;
}

function findAddresses(node: unknown, path: string[] = []): AddressOccurrence[] {
  const out: AddressOccurrence[] = [];
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const obj = node as Record<string, unknown>;
    const siblingBinary =
      typeof obj['binary'] === 'string' ? (obj['binary'] as string) : undefined;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'address' || k === 'addresses') {
        out.push({ path: [...path, k], value: v, parent: obj, key: k, siblingBinary });
      }
      out.push(...findAddresses(v, [...path, k]));
    }
  } else if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      out.push(...findAddresses(node[i], [...path, `[${i}]`]));
    }
  }
  return out;
}

/** Infer the most likely segment for a finding from its filename/topic. */
function inferSpaceFromFilename(filename: string): SegmentSpace | null {
  const stem = basename(filename, '.json').toLowerCase();
  // Direct matches in filename.
  for (const sp of VALID_SPACES) {
    const prefix = sp.split('.')[0]!;
    if (stem.startsWith(prefix) || stem.includes(`-${prefix}-`)) return sp;
  }
  // Common multi-binary docs — return null (not unambiguous).
  return null;
}

function inferSpaceFromBinaryField(binary: string | undefined): SegmentSpace | null {
  if (!binary) return null;
  const lower = binary.toLowerCase();
  for (const sp of VALID_SPACES) if (sp === lower) return sp;
  return null;
}

function isHexString(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v);
}

interface FileReport {
  file: string;
  totalAddrs: number;
  typed: number;
  bareString: number;
  bareList: number;
  inferredSpace: SegmentSpace | null;
  fixedThisRun: number;
  needsManual: { path: string[]; value: unknown }[];
}

function processFile(filepath: string, fix: boolean): FileReport {
  const raw = readFileSync(filepath, 'utf8');
  const data = JSON.parse(raw) as Record<string, unknown>;
  const occurrences = findAddresses(data);
  const inferredFromName = inferSpaceFromFilename(filepath);
  const inferredFromBinaries = (() => {
    const binaries = data['binaries'];
    if (Array.isArray(binaries) && binaries.length === 1) {
      return inferSpaceFromBinaryField(binaries[0] as string);
    }
    return null;
  })();
  const inferredSpace = inferredFromName ?? inferredFromBinaries;

  const report: FileReport = {
    file: filepath,
    totalAddrs: occurrences.length,
    typed: 0,
    bareString: 0,
    bareList: 0,
    inferredSpace,
    fixedThisRun: 0,
    needsManual: [],
  };

  for (const occ of occurrences) {
    if (occ.value && typeof occ.value === 'object' && !Array.isArray(occ.value)) {
      const sub = occ.value as Record<string, unknown>;
      if (typeof sub['space'] === 'string' && 'offset' in sub) {
        report.typed++;
        continue;
      }
    }
    // Prefer per-finding `evidence.binary` over file-level inference for
    // multi-binary findings docs.
    const perFindingSpace = inferSpaceFromBinaryField(occ.siblingBinary);
    const effectiveSpace = perFindingSpace ?? inferredSpace;

    if (typeof occ.value === 'string') {
      const stripped = occ.value.trim();
      // Comma-separated list of hex addresses
      if (/[,\s]/.test(stripped) && stripped.split(/[,\s]+/).every(isHexString)) {
        report.bareList++;
        report.needsManual.push({ path: occ.path, value: occ.value });
        continue;
      }
      if (isHexString(stripped)) {
        report.bareString++;
        if (fix && effectiveSpace !== null) {
          occ.parent[occ.key] = { space: effectiveSpace, offset: stripped };
          report.fixedThisRun++;
        } else {
          report.needsManual.push({ path: occ.path, value: occ.value });
        }
        continue;
      }
    }
    // Unknown shape - flag for manual review
    report.needsManual.push({ path: occ.path, value: occ.value });
  }

  if (fix && report.fixedThisRun > 0) {
    writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
  }
  return report;
}

function main(): number {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const fileArgIdx = args.indexOf('--file');
  const fileFilter = fileArgIdx >= 0 ? args[fileArgIdx + 1] : null;

  const allFiles = readdirSync(FINDINGS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'README.md')
    .map((f) => join(FINDINGS_DIR, f));
  const targets = fileFilter
    ? allFiles.filter((f) => f.endsWith(fileFilter!))
    : allFiles;

  let totalTyped = 0;
  let totalBareString = 0;
  let totalBareList = 0;
  let totalFixed = 0;
  let filesWithUnresolved = 0;

  for (const file of targets) {
    let report: FileReport;
    try {
      report = processFile(file, fix);
    } catch (e) {
      console.log(`SKIP ${basename(file)} — ${(e as Error).message}`);
      continue;
    }
    totalTyped += report.typed;
    totalBareString += report.bareString;
    totalBareList += report.bareList;
    totalFixed += report.fixedThisRun;
    const unresolved =
      report.needsManual.length - (fix ? 0 : 0); // needs manual count is post-fix attempt
    if (unresolved > 0) filesWithUnresolved++;

    const status =
      report.bareString + report.bareList === 0
        ? '✓ clean'
        : `${report.bareString} bare-string · ${report.bareList} list · ${report.fixedThisRun} fixed`;
    const inferred = report.inferredSpace ? ` (inferred space: ${report.inferredSpace})` : '';
    console.log(`${basename(file).padEnd(40)} ${status}${inferred}`);
    if (report.needsManual.length > 0 && !fix) {
      for (const m of report.needsManual.slice(0, 3)) {
        console.log(`    ${m.path.join('.')}: ${JSON.stringify(m.value).slice(0, 80)}`);
      }
      if (report.needsManual.length > 3) {
        console.log(`    ... and ${report.needsManual.length - 3} more`);
      }
    }
  }

  console.log('---');
  console.log(`total addresses: ${totalTyped + totalBareString + totalBareList}`);
  console.log(`  typed: ${totalTyped}`);
  console.log(`  bare-string: ${totalBareString}${fix ? ` (fixed: ${totalFixed})` : ''}`);
  console.log(`  comma/space list: ${totalBareList} (manual review)`);
  console.log(`files needing manual cleanup: ${filesWithUnresolved}`);
  return filesWithUnresolved > 0 && !fix ? 1 : 0;
}

process.exit(main());
