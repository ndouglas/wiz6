# tools/parity/ — engine ground truth (rebuilt from the pinned image)

Engine framebuffer fixtures are **committed ground truth, regenerated from the
pinned `test-fixtures/` image** — never from a disposable workspace save:

- `fixtures/engine/*.{idx.gz,png}` — **committed.** The engine's framebuffer
  (4-bit EGA index per pixel). Parity tests compare our render against these
  byte-for-byte. Treat as immutable evidence; regenerate only deliberately via
  `tools/libretro/build-state.ts <recipe>` (the dosbox-pure harness). Record
  provenance (which recipe / state) in `tools/dosbox/state-catalog.ts` and the
  parity test's `CASES` comment — not in folklore.
- `fixtures/engine/<name>.character.json` — **committed sidecar** for
  non-deterministic creation-roll fixtures. Written by `build-state.ts --mint`
  (the engine draft decoded from DGROUP `0x5470` via `LiveSession.dumpDraft`).
  Parity render fns load it via `draftFromEngineDump` so the test matches the
  actual engine roll, not a hardcode.

## Rebuild / verify

```bash
pnpm tsx tools/libretro/build-state.ts <recipe>           # deterministic recipe-replay
pnpm tsx tools/libretro/build-state.ts <recipe> --mint    # non-deterministic roll: freeze state + sidecar
pnpm tsx tools/libretro/build-state.ts <recipe> --check    # re-mint + diff vs committed (100% gate, exit 0/1)
```

`pcfileFixture` recipes boot a fresh image overlaid with a committed
`test-fixtures/states/<name>.pcfile.dbs` roster; `bootCapture` recipes capture
cold-boot intro frames. See the header of `build-state.ts` and `README.md`.

## Standalone RE byte tools (no fixture path)

`extract.py` / `diff.py` / `decode-pic.ts` / `decode-character.ts` remain for
decoder/RNG/struct ground-truth checks against a raw image — they are NOT the
fixture pipeline. (`gen-fixture.ts` and `build-castle-saves.ts` are gone.)

## Rules

- Pixel-parity tolerance defaults to 0. Don't widen it to paper over a render
  bug — prefer per-region overrides (see root `CLAUDE.md`).
- Cell-grid parity is a diagnostic, not a gate. The pixel test is the gate.
