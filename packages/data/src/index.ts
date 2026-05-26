export {
  ManifestSchema,
  ManifestAssetSchema,
  type Manifest,
  type ManifestAsset,
} from './schemas/manifest.js';
export {
  FontSchema,
  FontGlyphSchema,
  type Font,
  type FontGlyph,
} from './schemas/font.js';
export {
  Font4bppSchema,
  Font4bppGlyphSchema,
  type Font4bpp,
  type Font4bppGlyph,
} from './schemas/font-4bpp.js';
export {
  PaletteSchema,
  RgbTupleSchema,
  type Palette,
  type RgbTuple,
} from './schemas/palette.js';
export {
  PortraitSchema,
  PortraitSetSchema,
  type Portrait,
  type PortraitSet,
} from './schemas/portrait.js';
export { EgaScreenSchema, type EgaScreen } from './schemas/ega-screen.js';
export {
  MessageRecordSchema,
  IndexedMessageSchema,
  MessageDbSchema,
  type MessageRecord,
  type IndexedMessage,
  type MessageDb,
} from './schemas/message-db.js';
export {
  NewgameRecordSchema,
  NewgameDbSchema,
  type NewgameRecord,
  type NewgameDb,
} from './schemas/newgame-db.js';
export {
  XpTableSchema,
  ScenarioItemSchema,
  ScenarioMonsterSchema,
  ScenarioQuestDataSchema,
  ScenarioDbSchema,
  type XpTable,
  type ScenarioItem,
  type ScenarioMonster,
  type ScenarioQuestData,
  type ScenarioDb,
} from './schemas/scenario-db.js';
export {
  PicSchema,
  PicSegmentSchema,
  PicOpSchema,
  PicLitOpSchema,
  PicRunOpSchema,
  PicDescriptorSchema,
  type Pic,
  type PicSegment,
  type PicOp,
  type PicLitOp,
  type PicRunOp,
  type PicDescriptor,
} from './schemas/pic.js';
export { SndSchema, type Snd } from './schemas/snd.js';
export {
  CharacterSchema,
  AttributesSchema,
  InventoryItemSchema,
  PartyMemberSchema,
  type Character,
  type Attributes,
  type InventoryItem,
  type PartyMember,
} from './schemas/character.js';
export { RosterSchema, type Roster } from './schemas/roster.js';
export {
  SaveSchema,
  SaveMetadataSchema,
  PositionSchema,
  MazeStateSchema,
  ScenarioFlagsSchema,
  type Save,
  type SaveMetadata,
  type Position,
  type MazeState,
  type ScenarioFlags,
} from './schemas/save.js';
export {
  PcfileHeaderSchema,
  PcfileInventoryItemSchema,
  PcfileSlotSchema,
  DecodedPcfileSchema,
  type PcfileHeader,
  type PcfileInventoryItem,
  type PcfileSlot,
  type DecodedPcfile,
} from './schemas/pcfile.js';
export {
  HouseRulesSchema,
  STOCK_HOUSE_RULES,
  DEFAULT_HOUSE_RULES,
  HOUSE_RULES_META,
  type HouseRules,
  type HouseRuleMeta,
} from './schemas/house-rules.js';
export {
  RACE_BASE_STATS,
  getRaceBaseStats,
  type RaceBaseStats,
} from './character-creation/race-base-stats.js';
export {
  CLASS_REQUIREMENTS,
  getClassRequirements,
  meetsClassRequirements,
  eligibleClasses,
  type ClassRequirements,
  type AttributeSet,
} from './character-creation/class-requirements.js';
export {
  CLASS_SKILL_AVAILABILITY,
  SKILL_SLOT_NAMES,
  CLASS_INDEX_TO_NAME,
  availableSkillSlots,
  classCanTrainSkill,
} from './character-creation/class-skill-availability.js';
export {
  PALETTE_CATALOG,
  EGA_DEFAULT,
  WIZ6_MAIN,
  WIZ6_DUNGEON,
} from './palettes/index.js';
export type { PaletteName } from './palettes/index.js';

export {
  KARMA_ROLL,
  rollKarma,
  KARMA_MIN,
  KARMA_MAX,
  KARMA_MAX_WITH_BONUS,
} from './character-creation/karma-roll.js';
export {
  SPELL_PICKER_CLASSES,
  classHasSpellPicker,
  STARTER_SPELLS_ARE_PLAYER_SELECTED,
} from './character-creation/starter-spells.js';
export {
  CLASS_SPELLBOOKS,
  SPELLBOOK_NAMES,
  SPELLBOOK_SCHOOLS,
  SCHOOL_NAMES,
  CLASS_SCHOOLS,
  classIsCaster,
  classCanCastSchool,
  classCastingSchools,
  type SpellbookPickCount,
} from './character-creation/spell-schools.js';
export {
  PORTRAIT_PICKER_CHOICES_PER_CLASS,
  PORTRAIT_POOL_BY_CLASS,
  computePortraitIndex,
  PORTRAIT_INDEX_MIN,
  PORTRAIT_INDEX_MAX_SPD18,
} from './character-creation/portrait-pools.js';

// BSS struct schemas (Wiz6 engine memory layouts) — pure declarative data
// used by the eventual DOSBox-X MCP server (#017), the save-state viewer,
// and the TS port's runtime introspection. See packages/data/src/structs/.
export {
  ALL_STRUCTS,
  CHARACTER_RECORD,
  COMBAT_SLOT,
  MONSTER_PREJUDICE,
  POSITION_STATE,
  SOUND_TABLE_ENTRY,
  decodeBssStruct,
  sizeOfType,
  buildStructRegistry,
} from './structs/index.js';
export type {
  BssField,
  BssFieldType,
  BssScalarType,
  BssStruct,
  DecodedStruct,
} from './structs/index.js';

// Symbol resolver — name-↔-address index across wroot.exe + overlays.
// Built from docs/re/findings/*-naming-pass.json by a Node-side loader
// (see @wiz6/cli). Pure data + pure lookups here; no I/O.
export {
  WROOT_THUNK_DELTA,
  buildSymbolIndex,
  parseAllFindingsDocs,
  parseFindingsDoc,
  resolveThunkToWrootOffset,
  wrootOffsetToThunkAddress,
} from './symbols/index.js';
export type {
  Binary,
  Confidence,
  RawFinding,
  RawFindingsDoc,
  SymbolEntry,
  SymbolIndex,
} from './symbols/index.js';

// Engine sound-table snapshot (per-slot rate/volume/alias data).
// Captured via DOSBox-X MCP server from a live save state — see file
// header for provenance. Used by the viewer to play each .snd at the
// engine's actual per-slot rate instead of the global default.
export {
  PIT_CLOCK_HZ,
  SOUND_TABLE,
  slotPlaybackRateHz,
  slotIsAliased,
  resolveSlot,
} from './sound-table.js';
export type { SoundTableSlot } from './sound-table.js';

// Segment-map abstraction — per-save typed address spaces. Use when an RE
// finding refers to a binary's data without specifying the global address;
// e.g. "wbase.ovr + 0x07b7" instead of "DGROUP 0xXXXX" (which has bitten
// us multiple times across overlay-swap contexts).
export {
  SEGMENT_ANCHORS,
  findSegmentsInMemory,
  resolveSegAddr,
} from './segments/index.js';
export type {
  SegAddr,
  SegmentAnchor,
  SegmentEntry,
  SegmentMap,
  SegmentSpace,
} from './segments/index.js';
