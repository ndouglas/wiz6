# Phase 1 game shell — design

**Status:** approved 2026-05-22. Live URL `wiz6.goldentooth.net` will host the game shell at `/`; current data viewer moves to `/explore`.

## Why

We have a meaningful amount of byte-accurate decoded data (sprites, fonts, portraits, scenarios, messages, screens) and the .pic decoder is parity-verified. A static "game shell" that uses only this verified data makes the project visibly a *game* rather than a *data viewer*, without committing to game-logic simulation that hasn't been parity-tested yet.

The shell also creates demand-pull for the simulation work: each screen the player can't yet *do* something on names the next RE target.

## Scope — Phase 1 (this iteration)

**In scope (static, no simulation):**

1. **Title screen** at `/` — renders `titlepag.json` (the Wizardry VI title art) full-canvas. One CTA: "Enter". Footer link to `/explore` for the data viewer.
2. **Castle / Town selector** at `/castle` — placeholder screen with the 5 Wizardry-canonical destinations as inert buttons (Tavern, Stables, Smithy, Inn, Temple, Edge of Town). Clicking a button shows a "not yet implemented" message but doesn't 404.
3. **Roster view** at `/roster` — display 6 party slots using `newgame.dbs` data. Read-only: portrait + name + class + level + HP/SP. Static party (e.g. the default party from newgame.dbs).
4. **Bestiary** at `/bestiary` — rebrand of `/explore/pics`; one route entry that re-uses the same component (or imports from there) framed as an in-fiction monster catalogue.
5. **Route split** — move all current 14 viewer routes under `/explore/*`. Current `Landing.tsx` becomes `/explore` index.

**Out of scope (Phase 2+):**

- Maze view, party movement, combat, town shops, character creation, save/load.
- Any logic that depends on unverified RE.

## Architecture

```
App
├── GameLayout (route element at /)
│   ├── GameNav (minimal: Title / Castle / Roster / Bestiary / "Data Explorer →")
│   └── <Outlet />
│       ├── /         → GameTitle
│       ├── /castle   → CastleScreen
│       ├── /roster   → RosterView
│       └── /bestiary → re-export of PicsIndex
│
└── ExploreLayout (route element at /explore)
    ├── ExploreNav (current TopNav, retitled "Wiz6 Data Explorer")
    └── <Outlet />
        ├── /explore  → ExploreLanding (current Landing.tsx)
        ├── /explore/monsters, /explore/items, ... (all existing routes, prefixed)
```

React Router v6 layout routes handle nav-switching naturally. No app-level state, no auth, no client-side data fetch beyond the existing `data-loader.ts` (which already serves the extracted JSON).

## Visual style

Inherit the existing dark theme. The game pages should feel slightly *richer* than the explore pages (the explore pages are intentionally utilitarian) — bigger margins, more emphasis on the rendered art, less data tabling. Concretely:

- Title screen: full-bleed title art, centered "Enter" button beneath.
- Castle: title at top, EGA-style screen frame around inert button column.
- Roster: 2×3 portrait grid, name/class beneath each, stat block in a sidebar.
- Bestiary: same as `/explore/pics` (already grid-based and pretty).

## Out-of-scope decisions deliberately punted

- **Authentication / saved party state**: out. Use a fixed default party for now.
- **Game state persistence**: out. Each page reload starts fresh from defaults.
- **Sound**: out. We don't have audio decoders yet anyway.
- **Mobile responsive**: out for Phase 1. Game is desktop-first.
- **Animations / transitions**: out. Plain navigation.

## Success criteria

- `pnpm dev:viewer` boots → `/` shows the title screen with verified title art.
- Clicking "Enter" navigates to `/castle` showing inert buttons.
- `/roster` renders 6 character cards using real `newgame.dbs` data.
- `/explore` and all existing data-viewer routes still work under their new prefix.
- TopNav makes context obvious (game nav vs explore nav).
- No new client-side dependencies introduced.

## Phase 2 hook

Once any simulation primitive is parity-tested (likely `maze_step` first), the shell gains a `/dungeon` route showing the 3D-corridor view. Each subsequent verified primitive adds another action the player can take. The shell scaffolding from Phase 1 doesn't need to change to accommodate this — new pages slot in alongside existing ones.
