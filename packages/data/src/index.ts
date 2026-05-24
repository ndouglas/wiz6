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
  PALETTE_CATALOG,
  EGA_DEFAULT,
  WIZ6_MAIN,
  WIZ6_DUNGEON,
} from './palettes/index.js';
export type { PaletteName } from './palettes/index.js';

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
