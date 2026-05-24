// CPU register decoder for DOSBox-X save states.
//
// Reads the `CPU` zip entry and extracts the x86 register snapshot from
// its first ~371 bytes. Layout sourced from DOSBox-X 2026.05.02 (SDL2)
// `src/cpu/cpu.cpp` SerializeCPU::getBytes — see
// `docs/re/findings/dosbox-x-cpu-blob-layout.json` for source permalinks
// + cross-save validation.
//
// IMPORTANT: This is a 64-bit-host layout (Bitu = uint64_t). A 32-bit
// DOSBox-X build would shift every Bitu field by 4 bytes. wiz6 pins the
// 64-bit Homebrew Cask build, so a runtime check on the version string
// is enough to keep us honest.
//
// Note: DS in the snapshot is the LIVE DS at the moment of save, NOT the
// engine's logical DGROUP. The two often disagree because Wiz6 swaps DS
// when running overlay/driver code. Use `resolveDgroupBase` (anchor-
// string approach) for DGROUP; use this decoder for "what code is
// executing at save?" questions.

import { readFileSync } from 'node:fs';
import AdmZip from 'adm-zip';

export interface CpuRegisters {
  /** General-purpose 32-bit registers (also alias as 16-bit AX/CX/... low halves). */
  EAX: number;
  ECX: number;
  EDX: number;
  EBX: number;
  ESP: number;
  EBP: number;
  ESI: number;
  EDI: number;
  /** Instruction pointer (32-bit; in real-mode use low 16 bits as IP). */
  EIP: number;
  /** EFLAGS (low 32 bits of the Bitu field). */
  EFLAGS: number;
  /** Segment selectors (16-bit). */
  ES: number;
  CS: number;
  SS: number;
  DS: number;
  FS: number;
  GS: number;
  /** Cached linear bases (= selector << 4 in real mode). */
  ES_PHYS: number;
  CS_PHYS: number;
  SS_PHYS: number;
  DS_PHYS: number;
  FS_PHYS: number;
  GS_PHYS: number;
  /** Real-mode flag: from CR0.PE. */
  protectedMode: boolean;
  /** IDT limit — should be 0x3FF in real mode (sanity check). */
  IDT_LIMIT: number;
  /** CR0 control register. */
  CR0: number;
  /** DOSBox-X version string from the save zip (for layout-version diagnostics). */
  dosboxVersion: string;
}

const EXPECTED_VERSION_PREFIX = 'DOSBox-X 2026.05.02';

/** Read a u32 little-endian from a Uint8Array at offset. */
function u32(buf: Uint8Array, off: number): number {
  return (
    buf[off]! |
    (buf[off + 1]! << 8) |
    (buf[off + 2]! << 16) |
    (buf[off + 3]! << 24)
  ) >>> 0;
}

/** Read the low 16 bits of an 8-byte Bitu (LE u64) at offset. */
function bituSelector(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8);
}

/**
 * Decode the CPU register snapshot from a DOSBox-X save-state zip.
 *
 * Throws if the zip lacks a CPU entry or the DOSBox-X version string is
 * incompatible with the hardcoded 64-bit 2026.05.02 layout.
 */
export function decodeCpuRegisters(savePath: string): CpuRegisters {
  const zip = new AdmZip(readFileSync(savePath));
  const cpuEntry = zip.getEntry('CPU');
  if (!cpuEntry) throw new Error(`save state ${savePath} has no CPU entry`);
  const cpu = new Uint8Array(cpuEntry.getData());
  if (cpu.length < 0x173) {
    throw new Error(
      `CPU entry in ${savePath} is too short for the register snapshot ` +
        `(got ${cpu.length} bytes, need at least 0x173)`,
    );
  }

  // Validate DOSBox-X version. The layout is build-sensitive (Bitu width
  // changes between 32- and 64-bit hosts), and the field order may shift
  // between releases. Refuse to decode if we don't recognize the version.
  const versionEntry = zip.getEntry('DOSBox-X_Version');
  const dosboxVersion = versionEntry
    ? new TextDecoder('ascii').decode(versionEntry.getData()).replace(/\0+$/, '')
    : '(missing)';
  if (!dosboxVersion.startsWith(EXPECTED_VERSION_PREFIX)) {
    throw new Error(
      `DOSBox-X save format version mismatch: expected '${EXPECTED_VERSION_PREFIX}*' ` +
        `but save reports '${dosboxVersion}'. The CPU register layout is version- ` +
        `and bit-width-sensitive; see docs/re/findings/dosbox-x-cpu-blob-layout.json.`,
    );
  }

  const cr0 = u32(cpu, 0x40);
  const protectedMode = cpu[0x48] !== 0;

  // Sanity check: in real mode (CR0.PE=0), the IDT limit should be 0x3FF.
  // If it's not, we're either in protected mode or the layout is wrong.
  const idtLimit = u32(cpu, 0x6d);
  if (!protectedMode && idtLimit !== 0x3ff) {
    throw new Error(
      `CPU blob layout sanity check failed: real-mode save should have IDT limit ` +
        `0x3FF but got 0x${idtLimit.toString(16)}. The 64-bit layout may not apply ` +
        `to this DOSBox-X build (got version '${dosboxVersion}').`,
    );
  }

  return {
    EAX: u32(cpu, 0x00),
    ECX: u32(cpu, 0x04),
    EDX: u32(cpu, 0x08),
    EBX: u32(cpu, 0x0c),
    ESP: u32(cpu, 0x10),
    EBP: u32(cpu, 0x14),
    ESI: u32(cpu, 0x18),
    EDI: u32(cpu, 0x1c),
    EIP: u32(cpu, 0x20),
    EFLAGS: u32(cpu, 0x28),
    ES: bituSelector(cpu, 0xeb),
    CS: bituSelector(cpu, 0xf3),
    SS: bituSelector(cpu, 0xfb),
    DS: bituSelector(cpu, 0x103),
    FS: bituSelector(cpu, 0x10b),
    GS: bituSelector(cpu, 0x113),
    ES_PHYS: u32(cpu, 0x12b),
    CS_PHYS: u32(cpu, 0x12f),
    SS_PHYS: u32(cpu, 0x133),
    DS_PHYS: u32(cpu, 0x137),
    FS_PHYS: u32(cpu, 0x13b),
    GS_PHYS: u32(cpu, 0x13f),
    protectedMode,
    IDT_LIMIT: idtLimit,
    CR0: cr0,
    dosboxVersion,
  };
}

/**
 * Look up which loaded segment a given CS:EIP lives in, using a segment
 * map (per-binary load bases). Useful for answering "what overlay is
 * executing at the moment of save?". Returns null if no segment claims
 * the CS_PHYS+EIP linear address.
 */
export function identifyCsCode(
  csPhys: number,
  eip: number,
  segmentMap: Record<string, { physBase: number }>,
  /** On-disk file sizes per segment, keyed by space name. Lets us
   *  bound how far into the binary's loaded extent a CS:EIP can fall. */
  segmentSizes: Record<string, number>,
): { space: string; fileOffset: number } | null {
  const linear = (csPhys + eip) >>> 0;
  let best: { space: string; fileOffset: number } | null = null;
  for (const [space, entry] of Object.entries(segmentMap)) {
    const fileOffset = linear - entry.physBase;
    if (fileOffset < 0) continue;
    const size = segmentSizes[space];
    if (size === undefined) continue;
    if (fileOffset >= size) continue;
    // Prefer the segment whose load base is closest below linear (innermost match).
    if (!best || fileOffset < best.fileOffset) {
      best = { space, fileOffset };
    }
  }
  return best;
}
