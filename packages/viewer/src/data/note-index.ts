/**
 * Lightweight summaries of each Engineering Notes card — id, title, pitch,
 * tags. Used by RECommentary to render contextual "director's commentary"
 * badges on data-explorer pages without dragging in the full Notes page
 * component (which keeps the card bodies inline as React nodes).
 *
 * INVARIANT: this list must be kept in sync with the NOTES array in
 * EngineeringNotes.tsx. If you add a card there, mirror its {id, title,
 * pitch, tags} here. Eventually we'll refactor to a single source of truth;
 * for now this minor duplication trades for keeping the card bodies
 * (which use JSX, code blocks, tables, etc.) localized to the Notes page.
 */

export interface NoteIndexEntry {
  id: string;
  title: string;
  pitch: string;
  tags: string[];
}

export const NOTE_INDEX: NoteIndexEntry[] = [
  {
    id: 'bonus-point-lottery',
    title: 'The Bonus-Point Lottery',
    pitch:
      'Wiz6 character creation hides a two-tier 1-in-20 lottery on top of a uniform 5–10 roll. The elite-eligible result lands at 0.25% — and certain values are mathematically unreachable.',
    tags: ['character-creation', 'design-choice', 'quirk'],
  },
  {
    id: 'class-change-tax',
    title: 'The Hidden Class-Change Tax',
    pitch:
      'Changing class costs you your level and your XP — that part is documented. The hidden cost is a saved old-level cap that throttles every stat, HP, and skill gain on the way back up.',
    tags: ['character-progression', 'design-choice', 'undocumented'],
  },
  {
    id: 'faerie-tax',
    title: 'The Faerie Race Pays a Penalty In Three Places',
    pitch:
      'Faerie characters get a -2 AC bonus and a -1 level cap and a separate HP/SP regen penalty. The race is hard-coded into three independent engine paths.',
    tags: ['character-progression', 'design-choice', 'arbitrary'],
  },
  {
    id: 'stat-creep-three-try-filter',
    title: 'Why Your Last Attribute Creeps Up But Doesn\'t Lock',
    pitch:
      'On level-up the stat roller picks 3 attributes with rng(7) and tries to bump them. When 6 of 7 are capped at 18, the last one bumps roughly 82% of the time. Hence the slow ascent, never the certain one.',
    tags: ['character-progression', 'design-choice', 'quirk'],
  },
  {
    id: 'npc-keyword-synonyms',
    title: 'NPC Dialogue Has Synonyms But Not Typos',
    pitch:
      'The Wiz6 NPC parser silently expands GET → TAKE, DRAGON → WYRM, HELLO → HI. A 38-entry alias table normalizes player input before any keyword lookup runs. But TAEK never matches anything — it handles canonical alternatives, not edit-distance.',
    tags: ['dialogue', 'design-choice', 'undocumented'],
  },
  {
    id: 'npc-cumulative-bribery',
    title: 'NPCs Remember Every Gold Piece You Hand Them (For This Encounter)',
    pitch:
      'Gifting an NPC gold doesn\'t just earn a one-shot reaction bump. A 32-bit running total accumulates across the encounter, and crossing each of 7 secret thresholds unlocks a previously-hidden dialogue option.',
    tags: ['dialogue', 'design-choice', 'undocumented'],
  },
  {
    id: 'npc-charm-save-scum-penalty',
    title: 'The Charm Roll That Punishes Reload-Spammers',
    pitch:
      'Every charm attempt in an encounter gets ~10 harder than the previous one — and a critical-failed charm permanently drops the NPC\'s reaction AND forces combat. Save-scum at your peril.',
    tags: ['dialogue', 'design-choice', 'undocumented'],
  },
  {
    id: 'npc-duplicated-renderer',
    title: 'The 3D Wall Renderer Lives In Seven Overlays',
    pitch:
      'Wiz6 carries seven independent copies of the same 2192-byte 3D wall-rendering code — the dungeon-traversal original plus mirror copies in every overlay that draws over the corridor: NPC dialogue, chest encounter, three combat states, and dungeon-cast / use-item. Hand-synchronized constants across all seven.',
    tags: ['dialogue', 'treasure', 'combat', 'engine', 'quirk', 'maze'],
  },
  {
    id: 'items-as-dungeon-keys',
    title: 'Items Only Do Anything At Scripted Dungeon Cells',
    pitch:
      'Wiz6 has no global "use" action for items. The silver key does nothing until you\'re standing on the silver-locked door. Use-item triggers fire only when the current cell has a matching type-0x13 marker — anywhere else, nothing happens.',
    tags: ['dialogue', 'design-choice', 'undocumented'],
  },
  {
    id: 'spell-picker-duplicated',
    title: 'There Are Two Independent Copies Of The Spell-School Picker',
    pitch:
      'The in-combat spell picker (wpops) and the in-dungeon spell picker (wdopt) are independently-drifted copies of the same code. Common ancestor, divergent grids, divergent exit semantics.',
    tags: ['combat', 'engine', 'quirk', 'undocumented'],
  },
  {
    id: 'dungeon-overcast-backfire',
    title: 'Overcasting In The Dungeon Doesn\'t Fail — It Hits You With A Status Effect',
    pitch:
      'In combat, an unaffordable spell silently fizzles. In the dungeon, the same overcast applies a random status effect (6 + rng(6)) to the caster. Same engine, different consequence — the asymmetry is intentional.',
    tags: ['combat', 'design-choice', 'quirk'],
  },
  {
    id: 'trap-misidentify-equals-critical-fail',
    title: 'Picking The Wrong Trap Name Is A Critical Fail',
    pitch:
      'Disarming a chest trap requires picking the correct trap name from a list of candidates first. Guessing wrong sets the trap off — same outcome as botching the dice roll. The penalty for not knowing the game is identical to the penalty for failing the skill check.',
    tags: ['treasure', 'design-choice', 'undocumented'],
  },
  {
    id: 'calfo-word-puzzle',
    title: 'Calfo Doesn\'t Reveal The Trap — It Builds A Word Puzzle',
    pitch:
      'Each INSPECT or Calfo cast adds a few letters to a persistent display buffer — some real (rendered white), some fake decoys (rendered dark gray). Players see a partial word with mixed real and decoy letters and have to deduce the trap. Multiple casts compound; nothing guarantees a clean answer.',
    tags: ['treasure', 'design-choice', 'quirk'],
  },
  {
    id: 'tpk-loot-forfeit',
    title: 'Wipe On The Killing Blow And You Forfeit The Loot',
    pitch:
      'The post-combat loot rolls happen first, then the alive-count check happens. If everyone died killing the last monster, the engine rolls treasure and then throws it away because nobody is alive to claim it.',
    tags: ['treasure', 'combat', 'design-choice', 'quirk'],
  },
  {
    id: 'combat-initiative-countdown',
    title: 'Wiz6 Combat Is A 100-Down Initiative Tick, Not A Turn Queue',
    pitch:
      'Combat doesn\'t sort combatants by initiative and step through them in order. The engine counts down from 100, firing every combatant whose initiative byte matches the current tick — plus a random pause-jitter that staggers each action by 5–14 ticks.',
    tags: ['combat', 'design-choice', 'undocumented'],
  },
  {
    id: 'four-sub-action-queue',
    title: 'Fast Monsters Get Four Attacks Per Round (Hence Dragons)',
    pitch:
      'Every combatant has a 4-slot sub-action queue with four independent initiative bytes. A fast monster fires four times per round at four different ticks.',
    tags: ['combat', 'design-choice', 'quirk'],
  },
  {
    id: 'morale-asymmetry',
    title: 'Party Morale Rolls Get 10× The Monster Reward',
    pitch:
      'On the same morale-check roll, the party draws from a {0, 5, 10, 20, 40} bucket while monsters draw from {0, 0, 1, 2, 4}. A structural bias in the player\'s favor, baked into the engine.',
    tags: ['combat', 'design-choice', 'arbitrary'],
  },
  {
    id: 'animation-queue-crash',
    title: 'The 12-Slot Animation Queue Will Hang The Game If You Overflow It',
    pitch:
      'wmexe.ovr\'s animation queue has a hardcoded 12-slot limit and no overflow guard. A combat round that tries to enqueue more than 12 animations falls into an infinite play_sound(0) loop and never returns.',
    tags: ['combat', 'bug', 'engine'],
  },
  {
    id: 'combat-back-reset-navigator',
    title: 'Wiz6 Lets You Walk Back The Whole Combat Round',
    pitch:
      'Action selection in combat is a stack, not a queue. You can press BACK to undo any character\'s pick and RESET to clear the whole round. Uncommon player-forgiveness UX for a 1990 CRPG.',
    tags: ['combat', 'design-choice'],
  },
  {
    id: 'spell-picker-shows-unaffordable',
    title: 'The Spell Picker Shows Spells You Can\'t Afford',
    pitch:
      'When a caster picks SPELL in combat, the picker shows every spell they know — including ones they don\'t have mana for, rendered greyed. Picking a greyed spell still tries to cast it (and silently fails). Designed pedagogy.',
    tags: ['combat', 'design-choice', 'undocumented'],
  },
  {
    id: 'monster-prejudice-table',
    title: 'Monsters Have A Three-Slot Grudge List That Sometimes Targets Each Other',
    pitch:
      'Every monster type has a 3-byte "prejudice" table identifying other monster types it likes to target. The target picker rolls a slot and may fire on another monster group instead of the party. Mixed encounters sometimes turn into intra-monster brawls.',
    tags: ['combat', 'design-choice', 'quirk'],
  },
  {
    id: 'two-palettes-never-used',
    title: 'The Two Engine Palettes That Are Never Active',
    pitch:
      'wroot.exe carefully constructs two custom EGA palettes via INT 10h AX=1002h. We found both. Neither is active when the game actually draws anything we\'ve looked at.',
    tags: ['palette', 'undocumented', 'quirk'],
  },
  {
    id: 'title-scroll-cpu-bound',
    title: 'The Title Scroll Ran At Different Speeds On Different CPUs',
    pitch:
      'Wiz6\'s intro timing is calibrated against the original CPU\'s busy-wait at boot. On a 486 it ran ~6 seconds wall-clock. On a 386 it ran much slower. There\'s no frame-time clock.',
    tags: ['intro', 'engine', 'quirk'],
  },
  {
    id: 'twelve-facing-maze-four-facing-player',
    title: 'A 12-Facing Maze Hiding Behind a 4-Direction Player',
    pitch:
      'The dungeon stores wall data with 12-direction granularity. The player can only ever face N/E/S/W. The unused 8 facings are baked into every level file anyway.',
    tags: ['maze', 'design-choice', 'arbitrary'],
  },
  {
    id: 'wpcmk-not-a-state',
    title: 'wpcmk Isn\'t a Game State — It\'s a Library',
    pitch:
      'Every other Wiz6 overlay is a state handler with its own dispatch loop. The character-creation overlay is a one-way callable — its dispatch stub is a no-op that returns to the main menu.',
    tags: ['character-creation', 'engine', 'design-choice'],
  },
  {
    id: 'snd-format-bug-distribution',
    title: 'The .snd Decoder That Sounded Right And Played Noise',
    pitch:
      'For hours we chased LUT transforms and sample rates to fix the .snd Huffman decoder. Output looked perfect statistically — centred at 128, 32 quantized levels, plausible mean diff. The bug was 2 bytes of misalignment at the start.',
    tags: ['audio', 'bug'],
  },
  {
    id: 'carry-capacity-frozen',
    title: 'Carry Capacity Is Rolled Once And Never Updated Again',
    pitch:
      "A character's carrying-capacity limit is computed once, at creation, from STR/VIT. The engine then never recomputes it — train STR from 10 to 18 over a dozen levels and your carry limit is still your level-1 self's.",
    tags: ['character-progression', 'bug', 'engine'],
  },
  {
    id: 'cursor-leak-three-screens',
    title: 'The Cursor That Leaked Through Three Screens',
    pitch:
      'Our reimplementation drew the RACE, SEX, and PROFESSION pickers with one React component — so its cursor leaked between them: choosing ELF silently rolled a female mage. Every unit test passed; only driving the real browser caught it.',
    tags: ['reimplementation', 'bug', 'character-creation'],
  },
  {
    id: 'skill-name-map-correction',
    title: 'The Skill Names Hiding In Plain Sight',
    pitch:
      'The community skill-slot map (and ours, copied from it) had the weapon skills reordered and five slots marked as empty "holes." The engine settles it in one instruction — and those holes are real skills: DEFENSE, SPEED, MOVEMENT, AIM, POWER.',
    tags: ['reimplementation', 'undocumented', 'character-progression'],
  },
  {
    id: 'maze-renderer-hidden-in-driver',
    title: 'The 3D Renderer Wasn’t Where We Looked — Three Times',
    pitch:
      'Three reverse-engineering passes disassembled the wrong binary. The first-person maze renderer isn’t in the dungeon overlay at all — it’s a service inside the EGA graphics driver that copies itself into scratch RAM to run, so every breakpoint we set logged zero hits.',
    tags: ['maze', 'engine', 'reimplementation', 'quirk'],
  },
  {
    id: 'maze-four-greys-no-perspective',
    title: 'Four Greys and No Perspective',
    pitch:
      'The Wiz6 stone corridor is four EGA greys dithered into brickwork, textured by integer per-depth column tables with no perspective correction, composed to an off-screen page and then copied to the screen whole.',
    tags: ['maze', 'design-choice', 'quirk', 'engine'],
  },
  {
    id: 'maze-textures-not-in-maze-file',
    title: 'The Maze Textures Aren’t In The Maze File',
    pitch:
      'mazedata.ega holds no wall pixels — it’s a 153-entry index. The actual textures are decompressed by the exact same RLE decoder that draws monster portraits, and our first decode produced pure noise for two completely different reasons at once.',
    tags: ['maze', 'reimplementation', 'undocumented'],
  },
  {
    id: 'maze-emission-not-geometric',
    title: 'Walking a Corridor Backwards Isn’t the Mirror of Walking It Forwards',
    pitch:
      'The same dungeon corridor, viewed from opposite ends, renders differently — and we briefly concluded the engine wasn’t drawing from geometry at all. We were wrong: a door is a directional object, and the renderer reads every wall relative to your facing. It’s fully deterministic geometry.',
    tags: ['maze', 'engine', 'quirk', 'reimplementation'],
  },
  {
    id: 'maze-no-placement-table',
    title: 'The Decompiler Hunted For a Table That Isn’t There',
    pitch:
      'To draw the corridor, the engine picks which floor/ceiling/wall tile goes where by a placement INDEX. We spent a long time looking for the lookup table that produces those indices. There is no table. The index is literally base + depth, and the “base” is a constant baked into each draw instruction.',
    tags: ['maze', 'reimplementation', 'engine'],
  },
  {
    id: 'maze-dither-was-a-door',
    title: 'The Dither That Was a Door',
    pitch:
      'A stubborn smear of mismatched pixels at the corridor’s vanishing point looked like dithered-stone texture noise and capped the renderer for a dozen passes. It wasn’t noise. It was a single door-leaf tile animating between two frames — a 1-pixel flicker — and our static screenshot had frozen the other frame.',
    tags: ['maze', 'reimplementation', 'quirk', 'engine'],
  },
];

export function findNote(id: string): NoteIndexEntry | undefined {
  return NOTE_INDEX.find((n) => n.id === id);
}
