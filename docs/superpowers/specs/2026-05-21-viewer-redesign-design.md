# Wiz6 Viewer Redesign — Design Spec

**Status**: draft
**Author**: Nathan + Claude
**Date**: 2026-05-21
**Supersedes**: section "Viewer" of `2026-05-19-wiz6-webapp-design.md` (the original viewer was a single-page scroll; this spec replaces that interaction model).

## Goal

Turn the existing single-page viewer into a real research site for the reverse-engineered Wiz6 data: comprehensive top-level navigation, deep treatment of the monster table (the centerpiece), respectable treatment of every other parsed file, and an always-on dev experience suitable for running locally or hosting from a Raspberry Pi over LAN.

The site is a tool, not a showcase. It exists so that decoding new bytes during data archaeology immediately becomes a visible, browseable artifact.

## Scope

**In v1**:
- Routing-based multi-page SPA replacing the current monolithic `App.tsx`
- Landing page using the rendered `titlepag` as a hero
- Monster section with split-view UX, six detail tabs, search/filter/sort, byte-field highlighting, compare mode, family-grouped view
- Items page with split-view UX and the same byte-highlighting treatment
- Quest-records page exposing the three `questData` records and the strings embedded in their raw bytes
- Files overview page summarising every parsed `.dbs` file and its sections
- Per-route pages for screens, portraits, fonts, msg, newgame — same functionality as today, distributed across routes
- Hybrid theme (thematic chrome with the actual game font, clean data tables)
- URL-driven state (selection, filters, tab, view mode all reflected in the URL so links and reloads work)
- `pnpm dev:viewer` always-on script

**Deferred (not v1)**:
- Actual monster sprite rendering (waits on `unknownPreMonster` decoding — stage 1j.6)
- Monster combat animations
- Sound effects
- Curated per-monster lore from manual
- Pi deployment scripts (architecture supports it; not built in v1)
- SSG / Astro migration (revisit if cold-load becomes a real complaint)

**Explicitly not in scope**: server-side rendering, authentication, multi-user state, a backend of any kind. This is a static-files SPA.

## Architecture

### Stack

- React 18 + TypeScript (unchanged)
- Vite (unchanged)
- `react-router-dom` v6 — new dependency for routing
- Route-based code splitting via `React.lazy` so visiting `/items` doesn't pull in monster-detail components
- Data still loaded at runtime from JSON files in `packages/viewer/public/` (extracted by the parser CLI)
- No CSS framework; per-component CSS modules + a shared `theme.css` for tokens

### Routes

```
/                       Landing (titlepag hero + section cards)
/monsters               Monster section, no selection (shows roster, empty detail)
/monsters/:slug         Monster section, specific monster selected
/monsters/compare       Compare mode (with ?ids=slug1,slug2,...)
/items                  Items section (XP tables + items table)
/items/:slug            Items section, specific item selected
/quest                  Quest-records page (the 3 questData entries)
/screens                Screens index
/screens/:name          Specific screen viewer + alignment tool
/portraits              Portraits index
/portraits/:set         Specific portrait set
/fonts                  Fonts index (5 fonts on one page; small enough)
/msg                    Message text viewer
/newgame                Newgame.dbs character templates
/files                  Files overview (every parsed file and its section layout)
```

Slugs derive from `nameIdSingular` (monsters) or `name1` (items), lowercased with spaces → hyphens, special chars stripped. Helper `slugify(name)` lives in `src/lib/slug.ts`.

### File-level component structure

The component tree is designed so each file has one clear responsibility and is small enough to hold in one screen.

```
packages/viewer/src/
├── main.tsx                          (unchanged entry point)
├── router.tsx                        (route table, lazy-loaded routes)
├── App.tsx                           (shell: top nav, theme provider, <Outlet />)
├── theme/
│   ├── theme.css                     (CSS variables: colors, spacing, type scale)
│   ├── wiz6-font.tsx                 (renders the decoded wfont3 as React for h1)
│   └── palettes.ts                   (existing palette definitions moved here)
├── lib/
│   ├── slug.ts                       (name → URL slug)
│   ├── data-loader.ts                (existing; trimmed/refactored)
│   ├── hooks/
│   │   ├── useScenarioDb.ts          (fetches /scenario/scenario.json once)
│   │   ├── useMonsterBySlug.ts
│   │   ├── useItemBySlug.ts
│   │   └── useUrlState.ts            (filter/search/tab state in query params)
│   └── monster-byte-map.ts           (byte → field metadata; see "Byte-field map")
├── components/
│   ├── TopNav.tsx                    (persistent nav bar)
│   ├── PageHeader.tsx
│   ├── HexGrid.tsx                   (reusable 16-column hex grid with field colouring)
│   ├── HeatmapRow.tsx                (resistance % row)
│   ├── ElementBadge.tsx
│   ├── ClassPill.tsx
│   ├── FamilyPill.tsx
│   └── KeyboardHint.tsx
├── pages/
│   ├── Landing.tsx
│   ├── monsters/
│   │   ├── MonstersPage.tsx          (split-view shell)
│   │   ├── MonsterList.tsx           (left rail)
│   │   ├── MonsterListRow.tsx
│   │   ├── MonsterFilters.tsx
│   │   ├── MonsterDetail.tsx         (right pane shell with tabs)
│   │   ├── tabs/
│   │   │   ├── OverviewTab.tsx
│   │   │   ├── AttacksTab.tsx
│   │   │   ├── SavesTab.tsx
│   │   │   ├── SpritesIdsTab.tsx
│   │   │   ├── RawBytesTab.tsx
│   │   │   └── FamilyTab.tsx
│   │   ├── CompareView.tsx
│   │   └── FamiliesView.tsx          (family-grouped index)
│   ├── items/
│   │   ├── ItemsPage.tsx
│   │   ├── ItemList.tsx
│   │   ├── ItemDetail.tsx
│   │   └── XpTablesPanel.tsx
│   ├── QuestRecords.tsx
│   ├── screens/
│   │   ├── ScreensIndex.tsx
│   │   └── ScreenDetail.tsx          (wraps existing ScreenGallery + alignment tool)
│   ├── portraits/
│   │   ├── PortraitsIndex.tsx
│   │   └── PortraitDetail.tsx
│   ├── FontsPage.tsx
│   ├── MsgPage.tsx
│   ├── NewgamePage.tsx
│   └── FilesOverview.tsx
└── views/                            (existing files, gradually deprecated)
```

The existing `views/*Gallery.tsx` components are not rewritten from scratch — they get wrapped by the new `pages/` files where their behaviour is still appropriate (screens, portraits, fonts, msg, newgame). The monster/item paths get genuine new components because they are deeply reworked.

### State

- **Filter, search, tab, sort, view-mode**: in URL search params via `useUrlState`. Reloading preserves them.
- **Selected monster/item**: in URL path segment (`:slug`).
- **Compare mode selections**: in URL `?ids=…` on `/monsters/compare`.
- **Hover-highlight**: ephemeral; React local state in the monster detail.
- **Palette picker** (still needed for fonts/portraits/screens): URL search param `?palette=wiz6-title`.

No global store (no Redux, Zustand, etc.). All shared state is either URL or a single fetched JSON cached by a small `useScenarioDb` hook.

## Page-by-page treatment

### Landing (`/`)

- Top of page: `titlepag` rendered in a `<canvas>`, full content-width, capped at ~600px tall, framed with a thin border.
- Below: a CSS-grid of section cards (Monsters, Items, Screens, Portraits, Fonts, Messages, Newgame, Quest, Files). Each card has the section name (in wfont3), a one-line description, a count badge ("250 monsters · 189 filled"), and links to the route.
- Footer: small "rev'd from Wizardry VI: Bane of the Cosmic Forge, DOS, 1990" plus a link to the data-archaeology docs.

### Monsters (`/monsters`, `/monsters/:slug`) — the deep dive

Two-pane layout with a fixed-width left rail (320px) and a flexible right pane.

**Left rail (`MonsterList`)**:
- Top: search box (debounced 100ms; matches against all four name slots case-insensitively)
- Filter chips row: family, monsterClass, creatureKind, specialAttackElement, monsterSex, monsterBehaviorClass. Each chip is a popover with checkboxes; active filters show inline as removable pills.
- Sort dropdown: name (default), level, AC, HP, XP-on-kill, gold; asc/desc toggle.
- Toggle: "include empty slots" (default off), "include quest records" (default off; shows 3 quest entries with a `QUEST` badge).
- Virtualised list (250 entries × per-row height ~48px = 12000px — `react-window` or hand-rolled; pick whichever is simpler).
- Row layout: name, level/levelMax (e.g. "5-10" if range), AC, family pill (colored by hash of `familyId`), class pill.
- Selected row gets a left border in the class-tier colour.
- Footer: "showing N / 189 filled".

**Right pane (`MonsterDetail`)**:
- Header strip: monster name (large, wfont3), small subhead with id-singular / id-plural / unid-singular / unid-plural, action buttons ("Copy raw bytes hex", "Copy as JSON").
- Tab bar: Overview / Attacks / Saves & Resistances / Sprites & IDs / Raw bytes / Family. Active tab in URL: `?tab=raw`.

**Tab: Overview**
- Two-column key-value grid. Left col labels, right col values. Fields:
  - 4 names (id sing/plur, unid sing/plur)
  - `monsterClass` + `monsterSubClass` (with enum labels: "1 animal/beast", "2 humanoid/undead", "3 demon/elite", "4 ultimate boss")
  - `monsterLevel` + `monsterLevelMax` ("5-10" when they differ)
  - `monsterAC` (with "Wiz6 AC: lower = better" tooltip)
  - `hpDice` ("6d6") + `groupDice`
  - `xpOnKill`
  - `goldStat` (with "≈ N × 10 gp" derived display)
  - `monsterSex` + `creatureKind` + `spriteGroup` (enum labels)
  - `moveStat` + `monsterBehaviorClass`
  - `specialAttackElement` (badge)
  - `familyId[4]` as a 4-pip pattern + link to family tab

**Tab: Attacks**
- Three columns labelled Atk 1 / Atk 2 / Atk 3 side by side.
- Each column shows: dice (count d sides), damage bonus, style (enum label), special-effect chance %, poison/drain/stun/HP-drain/age/decapitate chances, poison strength, `attackNExtra[2]` raw.
- Unused attacks visibly "—" with the column dimmed.

**Tab: Saves & Resistances**
- Three sub-sections, each a horizontal heatmap row:
  - `saveTable[5]` — 5 cells
  - `effectChanceTable[5]` — 5 cells
  - `extendedSaves[12]` — 12 cells (the cluster from stage 1j.2.14)
  - `attributeSaves[4]` — 4 cells
- Cell colour: cold slate → amber. The 125 immunity sentinel renders with a glow.
- Hover a cell: tooltip with the byte offset and decoded percentage.

**Tab: Sprites & IDs**
- Rows for: `combatSpriteId`, `combatSpriteAlt`, `secondarySpriteId`, `combatTraitId`, `magicResistChance`, `spellPowerChance`, `auxSave103`, `auxSave106`, `flyEvadeChance`.
- Each row: byte offset, field name, decoded value, and (when available) a list of other monsters with the same value (e.g. "shared with: HUGE BAT, VAMPIRE BAT, …"). The family-sharing patterns we've documented become live.
- Placeholder rectangle where the actual sprite render will go once `unknownPreMonster` is decoded.

**Tab: Raw bytes**
- The 158-byte `statBytes` array rendered as a 10-row × 16-column hex grid (last row partial).
- Each byte cell is coloured by which decoded field it belongs to (using the `monster-byte-map.ts` metadata). Unmapped bytes are uncoloured.
- Hover a byte: tooltip with offset + decoded field name + decoded value.
- Hover a field on any other tab: those bytes pulse on the Raw tab. (Implemented via a shared `highlightedField` React context scoped to `MonsterDetail`.)
- A field legend below the grid lists each field, its byte range, and its color swatch.

**Tab: Family**
- Header: the current monster's `familyId[4]` as a 4-pip pattern.
- Body: list of every other monster sharing the same `familyId`. Each entry is a link to that monster's detail view (replaces the right pane on click, list stays visible on the left). Useful for spotting the family templates we've documented.

**Compare mode (`/monsters/compare?ids=…`)**:
- Triggered by `c` keyboard or a "Compare" button after multi-selecting list rows (`shift+click`, max 4).
- Right pane is replaced by a comparison table: rows = every decoded field, columns = up to 4 monsters.
- Cells where values differ are highlighted (e.g. bold + accent border).
- "Add" / "Remove" buttons per column. "Clear all" button.
- Direct linkable: `?ids=giant-rat,zombie,wraith,pit-fiend` works on fresh load.

**Family-grouped view (`/monsters?view=families`)**:
- The left rail layout changes: monsters grouped by `familyId`, each family rendered as a collapsible card showing all its members in one row.
- Right pane: the same detail panel — clicking any member selects it.
- Helps visualise the family-shared-resistance / family-shared-sprite patterns at scale.

**Keyboard**:
- `↑` / `↓`: previous / next monster in current filtered list
- `1` … `6`: jump to tab N
- `/`: focus search
- `c`: enter compare mode with current selection
- `?`: show keyboard help overlay

### Items (`/items`, `/items/:slug`)

Same split-view shell, scaled down to item complexity.

**Left rail**:
- Search (matches `name1` and `name2`)
- Filter by `equipSlot` enum, by class restriction (chip per class), "hide empty" toggle (most slots are empty)
- Sort by name, price, damage, weight

**Right pane**:
- Tab: Overview (decoded fields)
- Tab: Raw bytes (74-byte item record as 5×16 hex grid with field colouring)

**XP tables**: collapsible panel at the top of the page or as a sub-route `/items/xp`. 14 classes × 16 levels, rendered as a sortable table matching the existing scenario-gallery treatment.

### Quest records (`/quest`)

Three side-by-side cards (CAPTAIN MATEY, COSMIC FORGE, L'MONTES). Each card:
- The 4 decoded name slots (mostly empty)
- The 222-byte `rawBytes` as a 14×16 hex grid
- Recognised embedded strings rendered as labels pointing into the grid (e.g. "QUEEQUEG @ bytes 130-137", "u16 LE sequence [0..7] @ bytes 64-79")
- The interpretation note from the doc inline (drinking-contest minigame, cosmic-forge quest, L'MONTES quest)

This page makes the data-archaeology discovery visible to a visitor without reading the source.

### Files overview (`/files`)

A table per parsed file (`scenario.dbs`, `newgame.dbs`, `msg.dbs`, `wfont*.bin`, `wport*.bin`, `*.scr`, …). Each file row shows:
- Filename
- Total size
- Decoded sections (with byte ranges)
- Parse status (% of bytes mapped to named fields)
- Link to the relevant viewer page

For `scenario.dbs` specifically: a stacked bar of byte regions (XP tables / items / unknownPreMonster / monsters / quest data / unknownTail) sized proportionally. Visualises the "what's left to decode" landscape.

### Screens / Portraits / Fonts / Msg / Newgame

Same functionality as today, distributed across routes. Light improvements:
- `/screens`: index lists 3 screens with thumbnail previews; `/screens/:name` shows the alignment tool inline.
- `/portraits`: index lists 3 sets; `/portraits/:set` shows the gallery + palette picker.
- `/fonts`: single page with all 5 fonts (small).
- `/msg`: existing gallery + text search box.
- `/newgame`: existing gallery, optionally grouped by record type if we discover types.

## Theme

**Colors** (CSS custom properties on `:root`):

```css
--color-bg: #0c0c14;
--color-surface: #16161e;
--color-surface-elevated: #1e1e28;
--color-border: #2a2f44;
--color-border-strong: #3d4360;
--color-text: #e8e4d8;
--color-text-muted: #8a8b95;
--color-text-faint: #5a5b65;
--color-accent: #6d8bd8;             /* EGA-ish bright blue, for hover/focus */
--color-class-1: #6da870;            /* animal/beast — muted green */
--color-class-2: #9a6dc8;            /* humanoid/undead — dusty violet */
--color-class-3: #c87060;            /* demon/elite — rust red */
--color-class-4: #d8a850;            /* boss — amber gold */
--color-element-fire: #d87038;
--color-element-cold: #6db8d8;
--color-element-poison: #6db870;
--color-element-mental: #d8769a;
--color-heatmap-cold: #2a2f44;
--color-heatmap-hot: #d8a850;
--color-immunity-glow: #f5d870;      /* the 125 sentinel */
```

**Type**:
- Headings (h1 on landing, section banners): use the decoded `wfont3` (chunky 4bpp display font) rendered to canvas and embedded as an `<img>` or via SVG.
- Other headings (h2, h3): geometric sans (Inter via `@fontsource/inter`).
- Body: Inter.
- Numbers / hex / monospace data: JetBrains Mono (via `@fontsource/jetbrains-mono`).
- Font-feature-settings: tabular numbers on table cells.

**Spacing scale**: 4 / 8 / 12 / 16 / 24 / 32 / 48 px.

**Borders**: 1px solid `var(--color-border)`. Strong variants on focus / active.

**Shadows**: none. Flat surfaces, distinguished by background and border.

**Hover**: subtle 1-2px accent border or a faint glow on the `--color-accent` channel. No animation longer than 150ms.

## Data sources

Unchanged from today. Parser CLI extracts JSON into `packages/viewer/public/`:

```
public/
├── manifest.json
├── fonts/wfont0..4.json
├── portraits/wport1..3.json
├── screens/titlepag.json, graveyrd.json, dragonsc.json
├── messages/msg.json
├── newgame/newgame.json
└── scenario/scenario.json
```

The `scenario.json` is fetched once via `useScenarioDb` and cached; all pages that need monster/item data read from that one fetch. Total payload is ~80-100 KB gzipped; one round-trip suffices.

If scenario.json grows above ~1 MB at some future stage, split into `scenario-monsters.json`, `scenario-items.json` etc. Not necessary in v1.

## Byte-field map

The Raw bytes tab depends on a static metadata table mapping each byte offset (0..157) of `statBytes` to a field name. This table lives in `packages/viewer/src/lib/monster-byte-map.ts` and is the single source of truth for the colouring + hover behaviour.

Shape:

```typescript
export interface ByteFieldMapping {
  readonly offset: number;        // byte offset within statBytes
  readonly length: number;        // number of consecutive bytes
  readonly fieldName: string;     // matches ScenarioMonster key, e.g. "xpOnKill"
  readonly label: string;         // human label, e.g. "XP on kill"
  readonly group: 'core' | 'attack' | 'save' | 'sprite' | 'unknown';
}

export const MONSTER_BYTE_MAP: readonly ByteFieldMapping[] = [
  { offset: 0,  length: 2, fieldName: 'xpOnKill',          label: 'XP on kill',           group: 'core' },
  { offset: 6,  length: 1, fieldName: 'attack1DiceCount',  label: 'Atk1 dice count',      group: 'attack' },
  // ... etc, one entry per decoded field
];
```

The map is hand-derived from `packages/parser/src/formats/scenario-db.ts`. A unit test in `packages/viewer/tests/monster-byte-map.test.ts` verifies every field name in the map matches a property of `ScenarioMonster` (compile-time check via TypeScript) and that no offset is double-claimed.

## Always-on dev experience

- Top-level `pnpm dev:viewer` (alias added in root `package.json`) runs Vite on port 5173.
- The user leaves this running; HMR picks up changes instantly.
- If JSON data changes, the user runs `pnpm extract` (existing alias) and the page reloads.

For the Pi (deferred): a `Caddyfile` template in `infra/caddy/` and a `scripts/deploy-pi.sh` will be added when the user is ready to actually deploy. Not in v1 scope.

## Stages

Each stage is independently shippable. The site is usable after stage 2a; each subsequent stage replaces a section with a deeper treatment.

### Stage 2a — Foundation

**Goal**: routed shell with the existing galleries ported, no UX changes to them.

- Add `react-router-dom` dependency.
- New `src/router.tsx`, `src/App.tsx` shell with top nav and `<Outlet />`.
- Theme tokens in `src/theme/theme.css`. Import in `main.tsx`.
- Decode `wfont3` once and ship as an SVG / image for use in h1.
- Routes: `/`, `/monsters` (placeholder), `/items` (placeholder), `/quest` (placeholder), `/screens`, `/screens/:name`, `/portraits`, `/portraits/:set`, `/fonts`, `/msg`, `/newgame`, `/files`.
- Landing renders titlepag hero + section cards.
- Existing `ScenarioGallery`, `MessageGallery`, etc. are wrapped by per-route page components — same component renders, but each on its own URL. The monolithic vertical stack in `App.tsx` is dismantled.
- Top-nav links to every section.
- Tests: routing smoke test (every route renders without error), nav link presence, landing renders titlepag canvas.

### Stage 2b — Monsters core

**Goal**: split-view monster section with Overview / Attacks / Saves tabs and full search/filter/sort.

- `MonstersPage` split-view shell.
- `MonsterList` with search, filter chips, sort, virtualised rendering.
- `MonsterDetail` shell with tab bar.
- `OverviewTab`, `AttacksTab`, `SavesTab` with the field treatments described above.
- `HeatmapRow` component for resistance rows.
- URL state: `?tab`, `?search`, `?family`, `?class`, `?creatureKind`, `?element`, `?sex`, `?behavior`, `?sort`, `?dir`, `?empty`, `?quest`.
- Slugify monster names; routing `/monsters/:slug` resolves to monster by slug.
- Keyboard: `↑/↓`, `1-3` for tabs, `/` for search, `?` for help overlay.
- Tests: filter combinations produce correct count; slugify round-trip; keyboard nav advances selection; heatmap renders correct colour for each value.

### Stage 2c — Monsters depth

**Goal**: Raw bytes tab with bidirectional byte-field highlighting; Family tab; Sprites & IDs tab.

- `monster-byte-map.ts` with full coverage of every decoded field.
- `HexGrid` reusable component with per-byte colour + hover tooltip.
- `RawBytesTab` wires `HexGrid` and the byte map; legend below the grid.
- `FamilyTab` lists family-sharers with click-to-select.
- `SpritesIdsTab` with placeholder for sprite render and "shared with" lookups.
- React context `MonsterDetailContext` carries `highlightedField`; setting it on any tab triggers a pulse on the Raw tab.
- Tests: byte map covers every field in `ScenarioMonster`; no offset double-claimed; hovering a field on Overview highlights the right bytes on Raw; clicking a family-sharer navigates correctly.

### Stage 2d — Monsters power-tools

**Goal**: compare mode + family-grouped view + polished keyboard / shortcuts.

- `CompareView` component with comparison table; up to 4 monsters; shift-click multi-select in the list; diff highlighting.
- `FamiliesView` family-grouped index, accessible via `?view=families`.
- `c` keyboard enters compare mode; "Compare" button as an alternative entry.
- "Copy raw bytes hex" / "Copy as JSON" header buttons.
- Tests: compare URL `?ids=` round-trip; comparing two identical monsters shows no diffs; compare with 0 selections shows empty state; family-grouped view shows correct family count.

### Stage 2e — Items polish

**Goal**: items section with the same split-view treatment.

- `ItemsPage`, `ItemList`, `ItemDetail`, `XpTablesPanel`.
- Item-side byte map (`item-byte-map.ts`, 74 entries).
- Raw bytes tab for items with the same `HexGrid` reuse.
- XP tables panel at the top of the page, sortable.
- Tests: filter by `equipSlot`; raw bytes byte map covers every item field.

### Stage 2f — Breadth polish

**Goal**: quest records page, files overview page, light improvements to remaining sections.

- `QuestRecords` page rendering the three records side-by-side with hex grids + recognised-string annotations.
- `FilesOverview` page with per-file section tables + the scenario.dbs region stacked bar.
- `MsgPage` gains a text-search box.
- `NewgamePage` gains light row-grouping (TBD based on data).
- Final cross-section polish pass: consistent hover states, focus rings, mobile-narrow layout.
- Tests: quest-record strings render at the documented byte offsets; files-overview region bar widths match decoded sizes.

## Open questions for v1

- **wfont3-as-h1 implementation**: SVG vs. canvas-to-image vs. inline `<canvas>` per heading. Pick during stage 2a sketch; not a design-time decision.
- **Virtualised list library vs. hand-rolled**: try hand-rolled first (250 rows is small); switch to `react-window` if scroll perf is bad.
- **Mobile layout for the split view**: probably collapses to single-pane with a "back to list" link in detail; finalise in stage 2b.

## Out of scope for v1, captured for later

- Per-monster sprite rendering (needs `unknownPreMonster` decoded, stage 1j.6 or later)
- Per-monster combat animation playback (much later)
- Sound effect playback (sound parser doesn't exist yet)
- Manual-text lore curation (human-authored content, no parser)
- Pi deployment automation (architecture supports it; scripts pending demand)
- Astro / SSG migration (revisit if cold-load performance becomes a complaint)
- Authentication / multi-user / shared bookmarks (not a thing this tool needs)

## Acceptance

v1 ships when all 6 stages are merged and the site runs via `pnpm dev:viewer` with:
- All existing data viewable, no regressions vs. today
- Monster section meets the deep-dive spec above
- Compare mode and byte-field highlighting both work end-to-end
- Test suite green
