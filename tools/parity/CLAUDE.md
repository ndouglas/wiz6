# tools/parity/ — engine ground truth vs disposable saves

Two kinds of artifact flow through this workflow. **Don't cross the streams:**

- `fixtures/engine/*.{idx.gz,png}` — **committed ground truth.** The engine's
  framebuffer decoded from a known save. Parity tests compare our render against
  these byte-for-byte. Treat as immutable evidence; regenerate only deliberately
  via `gen-fixture.ts`, and record provenance (which save, which game state) in
  the parity test's `CASES` comment — not in folklore.
- `tools/dosbox/save/*.sav` — **disposable scratch** (see
  `tools/dosbox/CLAUDE.md`). `build-castle-saves.ts` writes here; gameplay
  clobbers it. Never commit a `.sav`; never treat a slot as a stable fixture.

## Rules

- Pixel-parity tolerance defaults to 0. Don't widen it to paper over a render
  bug — prefer per-region overrides (see root `CLAUDE.md`).
- Cell-grid parity is a diagnostic, not a gate. The pixel test is the gate.
