/**
 * Manifest of every overlay/binary that has a published naming-pass findings
 * JSON. Add a new entry when a fresh overlay gets a naming pass. Slug is the
 * URL-visible identifier; findingsPath is the JSON served at /docs/re/findings/...;
 * docPath is the canonical prose doc served at /explore/docs/re/...
 */

export interface OverlayManifestEntry {
  slug: string;
  /** Display label — typically the binary filename. */
  label: string;
  /** One-line subtitle describing the overlay's role. */
  subtitle: string;
  /** Findings JSON path under /docs/re/findings/ (e.g. "wmele-naming-pass.json"). */
  findingsFile: string;
  /** Canonical doc filename under /explore/docs/re/ (e.g. "wmele-combat.md"). */
  docFile: string;
  /** Replay script under /tools/ghidra/scripts/ (not browsable; link is informational). */
  applyScript?: string;
}

export const OVERLAY_MANIFEST: OverlayManifestEntry[] = [
  {
    slug: 'wroot',
    label: 'wroot.exe',
    subtitle: 'Root binary — outer state-machine loop, BIOS I/O wrappers, thunks',
    findingsFile: 'wroot-naming-pass.json',
    docFile: 'wroot-functions.md',
    applyScript: 'apply_wroot_names.py',
  },
  {
    slug: 'winit',
    label: 'winit.ovr',
    subtitle: 'Startup — title/credits, asset preload, graveyard recovery',
    findingsFile: 'startup-sequence.json',
    docFile: 'startup-sequence.md',
    applyScript: 'apply_winit_names.py',
  },
  {
    slug: 'wbase',
    label: 'wbase.ovr',
    subtitle: 'Main menu (MASTER OPTIONS) — state 4',
    findingsFile: 'wbase-main-menu.json',
    docFile: 'wbase-main-menu.md',
    applyScript: 'apply_wbase_names.py',
  },
  {
    slug: 'wmaze',
    label: 'wmaze.ovr',
    subtitle: 'Dungeon traversal — states 5, 6, 0x17',
    findingsFile: 'wmaze-naming-pass.json',
    docFile: 'wmaze-functions.md',
    applyScript: 'apply_wmaze_names.py',
  },
  {
    slug: 'wmele',
    label: 'wmele.ovr',
    subtitle: 'Combat: encounter / round loop / end-of-round — states 0x0a, 0x0b, 0x0e',
    findingsFile: 'wmele-naming-pass.json',
    docFile: 'wmele-combat.md',
    applyScript: 'apply_wmele_names.py',
  },
  {
    slug: 'wmexe',
    label: 'wmexe.ovr',
    subtitle: 'Combat action execution — state 0x0d (initiative-down-from-100 loop)',
    findingsFile: 'wmexe-naming-pass.json',
    docFile: 'wmexe-action-execution.md',
    applyScript: 'apply_wmexe_names.py',
  },
  {
    slug: 'wmnpc',
    label: 'wmnpc.ovr',
    subtitle: 'NPC dialogue / encounter — library overlay called from wmaze',
    findingsFile: 'wmnpc-naming-pass.json',
    docFile: 'wmnpc-npc-dialogue.md',
    applyScript: 'apply_wmnpc_names.py',
  },
  {
    slug: 'wpops',
    label: 'wpops.ovr',
    subtitle: 'Combat action selection (party + monster-AI pickers) — state 0x0c',
    findingsFile: 'wpops-naming-pass.json',
    docFile: 'wpops-action-selection.md',
    applyScript: 'apply_wpops_names.py',
  },
  {
    slug: 'wpcmk',
    label: 'wpcmk.ovr',
    subtitle: 'Character creation — library overlay called from wbase main-menu slot 5',
    findingsFile: 'wpcmk-naming-pass.json',
    docFile: 'wpcmk-character-creation.md',
    applyScript: 'apply_wpcmk_names.py',
  },
  {
    slug: 'wpcvw',
    label: 'wpcvw.ovr',
    subtitle: 'Character view + post-combat level-up — states 0x11, 0x16',
    findingsFile: 'wpcvw-naming-pass.json',
    docFile: 'wpcvw-character-view.md',
    applyScript: 'apply_wpcvw_names.py',
  },
  {
    slug: 'wtrea',
    label: 'wtrea.ovr',
    subtitle: 'Treasure / chest / trap — states 0x0f, 0x15',
    findingsFile: 'wtrea-naming-pass.json',
    docFile: 'wtrea-treasure.md',
    applyScript: 'apply_wtrea_names.py',
  },
];

export interface RenamedFunctionEntry {
  addr: string;
  old: string;
  new: string;
  category: string;
}

export interface KeyDiscovery {
  /** Free-form prose (single sentence or short paragraph). */
  text: string;
}

export interface NamingPassFindings {
  topic: string;
  binaries: string[];
  summary: string;
  stats?: {
    total_functions?: number;
    renamed?: number;
    remaining_FUN_XXXX?: number;
    categories?: Record<string, number>;
  };
  key_discoveries?: (string | KeyDiscovery)[];
  renamed_full_list?: RenamedFunctionEntry[];
}
