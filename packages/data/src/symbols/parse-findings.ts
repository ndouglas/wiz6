import type { Binary, Confidence, SymbolEntry } from './types.js';

/**
 * Shape of a single `findings[]` entry as it appears on disk in
 * `docs/re/findings/*.json`. Schema is loose by design (see
 * `docs/re/findings/README.md`) — this type captures the fields we
 * actually use.
 */
export interface RawFinding {
  id?: string;
  claim?: string;
  category?: string;
  applied_name?: string;
  confidence?: string;
  evidence?: {
    binary?: string;
    address?: string | number;
    addresses?: ReadonlyArray<string | number>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

/**
 * An entry in the `renamed_full_list` flat array used by overlay naming
 * passes (and supplementarily by wroot's). Schema mirrors the Ghidra
 * rename log: addr is a string (possibly hex with segment prefix), `new`
 * is the applied name.
 */
export interface RawRenamedEntry {
  addr?: string | number;
  old?: string;
  new?: string;
  category?: string;
}

/** Shape of the top-level findings document. */
export interface RawFindingsDoc {
  topic?: string;
  binaries?: readonly string[];
  findings?: readonly RawFinding[];
  renamed_full_list?: readonly RawRenamedEntry[];
  [k: string]: unknown;
}

const VALID_BINARIES: readonly Binary[] = [
  'wroot.exe',
  'winit.ovr',
  'wbase.ovr',
  'wmaze.ovr',
  'wmele.ovr',
  'wmnpc.ovr',
  'wpcvw.ovr',
  'wpcmk.ovr',
  'wpops.ovr',
  'wtrea.ovr',
  'wmexe.ovr',
  'wdopt.ovr',
];

function isBinary(s: string): s is Binary {
  return (VALID_BINARIES as readonly string[]).includes(s);
}

function toNumber(v: string | number): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return undefined;
  const n = v.startsWith('0x') || v.startsWith('0X') ? parseInt(v, 16) : parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normalize an address read from a findings JSON into a file/image offset.
 *
 * wroot.exe entries are recorded with Ghidra's segment-prefixed form
 * (`0x1XXXX` = `0x10000 + image_offset`); the thunk-delta law and the
 * `docs/re/<format>.md` notes all use bare image offsets. Strip the segment
 * if present. Overlay addresses (< 0x10000) pass through unchanged.
 */
function normalizeAddress(binary: Binary, address: number): number {
  if (binary === 'wroot.exe' && address >= 0x10000) return address - 0x10000;
  return address;
}

function normalizeConfidence(c: string | undefined): Confidence | undefined {
  if (c === 'high' || c === 'medium' || c === 'low') return c;
  return undefined;
}

/**
 * Extract SymbolEntries from a single findings document.
 *
 * Two sources are merged, in priority order:
 *
 *  A. `renamed_full_list[]` — the flat per-function rename log dumped by
 *     the Ghidra naming-pass scripts. Used by all overlay docs and as a
 *     comprehensive backstop in wroot's doc. Each entry has `addr` + `new`.
 *  B. `findings[].applied_name` — supplementary detail on specific findings
 *     in wroot's doc; some are slash-delimited multi-name strings paired
 *     with `evidence.addresses[]`.
 *
 * Entries from (A) populate the index first. Entries from (B) only add a
 * symbol if `(binary, address)` isn't already covered by (A) — the
 * `renamed_full_list` is authoritative.
 *
 * Address normalization: wroot.exe entries use Ghidra's segment-prefixed
 * notation (`0x1XXXX` = `0x10000 + image_offset`). The thunk-delta law and
 * all `docs/re/<format>.md` references use bare image offsets, so the
 * parser strips the segment.
 */
export function parseFindingsDoc(doc: RawFindingsDoc): SymbolEntry[] {
  const out: SymbolEntry[] = [];
  const seen = new Set<string>(); // dedupe key: `${binary}@${address}`
  const docBinary = doc.binaries?.find((b) => isBinary(b));

  // (A) renamed_full_list — primary source.
  if (docBinary && Array.isArray(doc.renamed_full_list)) {
    for (const r of doc.renamed_full_list) {
      if (!r.new || r.addr === undefined) continue;
      const rawAddr = toNumber(r.addr);
      if (rawAddr === undefined) continue;
      const address = normalizeAddress(docBinary, rawAddr);
      const key = `${docBinary}@${address}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry: SymbolEntry = { binary: docBinary, address, name: r.new };
      if (r.category !== undefined) entry.category = r.category;
      out.push(entry);
    }
  }

  // (B) per-finding applied_name — supplementary.
  for (const f of doc.findings ?? []) {
    if (!f.applied_name) continue;
    const binStr = f.evidence?.binary ?? docBinary;
    if (!binStr || !isBinary(binStr)) continue;
    const binary: Binary = binStr;

    const addrs: number[] = [];
    if (f.evidence?.address !== undefined) {
      const n = toNumber(f.evidence.address);
      if (n !== undefined) addrs.push(n);
    }
    for (const a of f.evidence?.addresses ?? []) {
      const n = toNumber(a);
      if (n !== undefined) addrs.push(n);
    }
    if (addrs.length === 0) continue;
    const normAddrs = addrs.map((a) => normalizeAddress(binary, a));

    const names = f.applied_name
      .split('/')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const pushIfNew = (address: number, name: string): void => {
      const key = `${binary}@${address}`;
      if (seen.has(key)) return;
      seen.add(key);
      const entry: SymbolEntry = { binary, address, name };
      if (f.category !== undefined) entry.category = f.category;
      const conf = normalizeConfidence(f.confidence);
      if (conf !== undefined) entry.confidence = conf;
      if (f.claim !== undefined) entry.claim = f.claim;
      if (f.id !== undefined) entry.source_finding_id = f.id;
      out.push(entry);
    };

    if (names.length === normAddrs.length && names.length > 1) {
      for (let i = 0; i < names.length; i++) pushIfNew(normAddrs[i]!, names[i]!);
    } else if (names.length === 1) {
      for (const a of normAddrs) pushIfNew(a, names[0]!);
    } else {
      const rawName = f.applied_name;
      for (const a of normAddrs) pushIfNew(a, rawName);
    }
  }
  return out;
}

/** Run `parseFindingsDoc` over many docs and concatenate the results. */
export function parseAllFindingsDocs(docs: readonly RawFindingsDoc[]): SymbolEntry[] {
  const out: SymbolEntry[] = [];
  for (const d of docs) out.push(...parseFindingsDoc(d));
  return out;
}
