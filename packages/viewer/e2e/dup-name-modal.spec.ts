/**
 * dup-name-modal.spec.ts — e2e regression for the audio path that the
 * character-creation duplicate-name modal relies on.
 *
 * Browsers won't expose audio output to automation (privacy/anti-tracking),
 * so this test verifies the chain DOWN TO `AudioBufferSourceNode.start()`:
 *
 *   1) Hook `AudioContext.prototype.createBufferSource` at page-init time and
 *      count `start()` invocations on every node it returns.
 *   2) Visit /sounds (which calls `installAudioUnlockListener` on mount).
 *   3) Press a key to unlock the audio context.
 *   4) Click the "engine rate" button for sound00 — same code path as the
 *      dup-name modal's `playInvalidActionBeep` call (both use `loadSnd` for
 *      `/sounds/sound00.snd` + `playSnd`).
 *   5) Assert the start counter went up.
 *
 * What this guards against:
 *   - The JSON-vs-SND URL bug we just fixed (sound00.snd missing → counter
 *     never increments).
 *   - Decoder regressions that make sound00.snd produce zero samples.
 *   - playSnd refactors that skip `createBufferSource().start()`.
 *
 * What this does NOT verify:
 *   - That speakers/headphones are actually receiving audio (impossible from
 *     automation; if this test passes but you hear nothing, check system
 *     volume / OS audio routing).
 *   - That the dup-name modal specifically triggers this path. We rely on
 *     the unit test (NameInputScreen "dup-name modal" describe block) for
 *     the dispatch wiring + spy-on-playInvalidActionBeep.
 */

import { test, expect } from '@playwright/test';

test('sound00 plays through Web Audio (createBufferSource.start invoked)', async ({ page }) => {
  // Hook BEFORE any page script. Count every AudioBufferSourceNode.start call.
  await page.addInitScript(() => {
    interface AudioWindow extends Window {
      __audioStartCount?: number;
    }
    const w = window as AudioWindow;
    w.__audioStartCount = 0;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const origCreate = Ctor.prototype.createBufferSource;
    Ctor.prototype.createBufferSource = function patchedCreate() {
      const node = origCreate.call(this);
      const origStart = node.start.bind(node);
      node.start = ((...args: Parameters<AudioBufferSourceNode['start']>) => {
        w.__audioStartCount = (w.__audioStartCount ?? 0) + 1;
        return origStart(...args);
      }) as AudioBufferSourceNode['start'];
      return node;
    };
  });

  // /explore/sounds installs the audio unlock listener on mount and exposes
  // per-slot "engine rate" buttons that call the same loadSnd+playSnd path
  // the dup-name modal uses.
  await page.goto('/explore/sounds');
  await page.waitForLoadState('networkidle');

  // Press any key to satisfy the user-gesture requirement for AudioContext.
  await page.keyboard.press('Space');

  // Locate sound00's row and click its "engine rate" button. The SoundsPage
  // renders each row keyed on the file ID; the engine-rate button title
  // includes the slot duration hex. Match by accessible text + nearest row.
  const sound00Row = page.locator('tr').filter({ has: page.locator('td', { hasText: /^sound00$/ }) });
  await sound00Row.waitFor({ state: 'visible', timeout: 10_000 });
  const engineRateBtn = sound00Row.getByRole('button', { name: /engine rate/i });
  await engineRateBtn.click();

  // sound00.snd is tiny (~1.3KB); 1.5s is plenty for fetch + decode + play.
  await page.waitForTimeout(1500);

  const startCount = await page.evaluate(() => {
    interface AudioWindow extends Window {
      __audioStartCount?: number;
    }
    return (window as AudioWindow).__audioStartCount ?? 0;
  });

  expect(startCount).toBeGreaterThan(0);
});
