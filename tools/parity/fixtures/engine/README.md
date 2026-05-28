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
| `creation-skill-train` | Character creation — ASSIGN INITIAL SKILL BONUS, WEAPONRY category mid-allocation (NATHAN samurai, portrait 21, 5 pool remaining; row 3 = "PRESS ▶ FOR NEXT CATEGORY") |
| `creation-skill-train-done` | Character creation — skill-train fully spent (0 pool, WAND&DAGGER +5; row 3 = "PRESS ▶ TO EXIT" — engine does NOT auto-advance) |
| `creation-skill-train-physical` | Character creation — PHYSICAL category (NATHAN Rawulf Fighter; 1 skill SCOUTING; verifies per-category bracket icons 0x25/0x26) |
| `creation-confirm` | Character creation — "SAVE THIS CHARACTER? YES NO" (post-exit; skillTrain panel persists with residual cursor marker; YES selected) |
| `creation-review-picker` | REVIEW PC — "REVIEW WHO?" roster picker (NATHAN Rawulf Fighter in slot 0; scrollbar at menuPanel col 0; CANCEL row at bottomBar row 3) |
| `creation-review-character` | REVIEW PC — char sheet of NATHAN Rawulf Fighter (BONUS row hidden; "PRESS ▶ TO EXIT" centered at bottomBar row 1) |
| `creation-delete-picker` | DELETE PC — "DELETE WHO?" roster picker (same layout as REVIEW WHO?, different title msg) |
| `creation-delete-confirm` | DELETE PC — "DELETE THIS CHARACTER? YES NO" confirm; NO highlighted by default (safer for destructive action) |
| `creation-rename-picker` | RENAME PC — "RENAME WHO?" roster picker (same layout as REVIEW/DELETE WHO?, different title msg) |
| `creation-rename-input` | RENAME PC — char-sheet + " NEW NAME >a       " input prompt (empty buffer; cursor block at col 11) |
| `creation-portrait-target-picker` | PORTRAIT PC — "PORTRAIT FOR WHOM?" roster picker (fourth consumer of composeReviewPickerFrame) |
| `creation-portrait-change` | PORTRAIT PC — char sheet + active portrait picker (CHARACTER PORTRAIT panel, ◄►/▶ prompts; cycles wfont2 0x48..0x50) |
| `creation-portrait-done` | PORTRAIT PC — post-change preview (char sheet with new portrait baked in + "PRESS ▶ TO EXIT") |
| `character-delete-confirm` | DELETE THIS CHARACTER? confirm (with char sheet) |
