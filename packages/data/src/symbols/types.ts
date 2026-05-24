/**
 * Types for the Wiz6 symbol resolver — a name-↔-address index over all
 * functions, globals, and constants pinned by the RE naming-pass JSONs in
 * `docs/re/findings/<overlay>-naming-pass.json`.
 *
 * Pure data + pure lookup; no I/O. A separate Node-side loader reads the
 * JSON files and feeds entries into `buildSymbolIndex`.
 */

/** Confidence label as it appears in the findings JSONs. */
export type Confidence = 'high' | 'medium' | 'low';

/** Which binary the symbol lives in. */
export type Binary =
  | 'wroot.exe'
  | 'winit.ovr'
  | 'wbase.ovr'
  | 'wmaze.ovr'
  | 'wmele.ovr'
  | 'wmnpc.ovr'
  | 'wpcvw.ovr'
  | 'wpcmk.ovr'
  | 'wpops.ovr'
  | 'wtrea.ovr'
  | 'wmexe.ovr'
  | 'wdopt.ovr';

/** One row in the symbol index. */
export interface SymbolEntry {
  /** Binary the address lives in. */
  binary: Binary;
  /** File offset within the binary (image offset for wroot's MZ; raw file offset for overlays). */
  address: number;
  /** Canonical applied name (Ghidra `SourceType.USER_DEFINED`). */
  name: string;
  /** Loose category tag from the finding (e.g. "crt", "maze_state", "audio"). */
  category?: string;
  /** Confidence the finding was published with. */
  confidence?: Confidence;
  /** Human-readable claim associated with this entry, for hover / docs. */
  claim?: string;
  /** Originating finding ID, for back-tracing. */
  source_finding_id?: string;
}
