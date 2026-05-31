# Viewer e2e (Playwright)

Real-browser screen driving + canvas pixel-parity. **Runs in CI** via
`.github/workflows/test.yml` (push to `main` + every PR), alongside the unit/
parity suites — and runnable locally any time (below).

## Run

```bash
pnpm --filter @wiz6/viewer exec playwright install chromium   # once
pnpm --filter @wiz6/viewer test:e2e                           # all specs
pnpm --filter @wiz6/viewer test:e2e creation-spell-pick       # one spec
pnpm --filter @wiz6/viewer test:e2e creation-spell-pick -- --headed  # watch it drive
```

`playwright.config.ts` auto-starts `vite --port 5199` as the webServer; no manual
dev-server management.

## How it works

- Creation/castle screens render to a `<canvas>` and listen on `window` keydown,
  so Playwright drives them with `page.keyboard.press(...)` and verifies via
  **screenshots of the internal 320×200 buffer** (not the DOM).
- `e2e/lib/canvas.ts` — `captureCanvas`, `waitForNonBlankCanvas`.
- `e2e/lib/drive.ts` — `gotoCreation(page, injected?)`, `pressKeys(page, keys)`,
  `expectCanvasMatchesFixture(page, name, tolerance=0)` (byte-exact vs
  `tools/parity/fixtures/engine/<name>.idx.gz`).
- `e2e/lib/creation-states.ts` — named JSON `{ screen, draft }` partials.
- **State injection (DEV-only):** `gotoCreation` sets `window.__WIZ6_E2E_STATE__`
  via `addInitScript` before navigation; `CreationPage` reads it ONLY under
  `import.meta.env.DEV`, so it's stripped from production builds. This lets a
  test jump straight to a mid-flow screen (e.g. the spell picker) with a known
  draft, instead of driving the whole flow each time.

## Why this exists (the gap it closes)

The vitest parity tests render the screen *composers* directly. The browser e2e
mounts the **actual React app** — so it catches prop-wiring, key-handler,
routing, asset-loading, and component↔composer divergence bugs the unit gate
structurally can't. (On its first run it caught a `MenuPickerScreen` cursor
carried across race→sex→class, and the original blank-char-sheet bug would have
been caught here too.)

## Interactive → committed (the convergence recipe)

The same `drive.ts` helpers power ad-hoc interactive driving (a throwaway script
run while reading screenshots, like the DOSBox loop) and the committed specs. To
promote an interactive drive into a permanent gate:

1. Save the key sequence into a `*.spec.ts` `pressKeys(...)` call.
2. Capture + commit the engine fixture for the target state:
   `pnpm tsx tools/parity/gen-fixture.ts --save <N> --name <fixture>` (from a
   DOSBox save at that state).
3. Add `await expectCanvasMatchesFixture(page, '<fixture>')`.
