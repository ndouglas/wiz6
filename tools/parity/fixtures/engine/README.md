# Engine screen fixtures — committed pixel-perfect ground truth

Each screen here is a **permanent, exact derivative of a DOSBox-X save state** —
the engine's real 320×200 framebuffer. Saves are ephemeral (the `tools/dosbox/save/`
slots get overwritten constantly); these committed derivatives are not. Tests
read these, never a `.sav`.

Two files per screen:

- `<name>.idx.gz` — gzipped 64000-byte array of 4-bit EGA palette **indices**
  (320×200, one byte per pixel). Palette-independent ground truth; apply the
  wiz6-main AC→DAC palette (`indicesToRgba`) to get exact RGB.
- `<name>.png` — the same frame as a lossless RGBA PNG, for human viewing/diffing.

Regenerate one from a save with:

```
pnpm tsx tools/parity/gen-fixture.ts --save <path|N> --name <name>
```

## Inventory

| Fixture | Screen |
|---|---|
| `sirtech-logo` | Boot splash 1 — SIR-TECH publisher logo (red dragon) |
| `author-credit` | Boot splash 2 — "A Fantasy Role-Playing Simulation by D.W. Bradley" |
| `title-art` | Title art (Wizardry VI / Bane of the Cosmic Forge), pre-copyright |
| `title-art-copyright` | Title art + "COPYRIGHT 1990 by SIR-TECH …" overlay |
| `title-page` / `title-page-2` | Wizardry VI title + scrolling credits (two scroll frames) |
| `main-menu` / `main-menu-2` | MASTER OPTIONS menu (two door-animation frames) |
| `character-menu-empty` | CHARACTER MENU, empty roster (CREATE PC / EXIT only; CREATE PC selected) |
| `character-menu-populated` | CHARACTER MENU, populated roster (all 6 options) |
| `creation-name-input` | Character creation — CHARACTER NAME prompt |
| `creation-race-select` | Character creation — SELECT CHARACTER RACE (NATHAN, HUMAN selected) |
| `creation-class-select` | Character creation — SELECT PROFESSION (NATHAN, M-HUMAN, pool 17 → 12 qualifying classes, 2 columns) |
| `creation-portrait-select` | Character creation — CHARACTER PORTRAIT picker (NATHAN samurai, portrait 0; 3×3 wfont2 tile grid) |
| `creation-skill-train` | Character creation — ASSIGN INITIAL SKILL BONUS, WEAPONRY category (NATHAN samurai, 9 weaponry skills + 5 pool) — parity TBD, fixture only |
| `character-delete-confirm` | DELETE THIS CHARACTER? confirm (with char sheet) |
