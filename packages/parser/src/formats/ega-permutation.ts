/**
 * @deprecated
 *
 * Historical artifact. This table was an empirical calibration to make
 * `.pic` and `.ega` assets render approximately correctly when looked up
 * through `EGA_DEFAULT`. It is essentially an attempt to reconstruct the
 * engine's runtime AC->DAC chain through a permutation over BIOS-default
 * DAC indices. The reconstruction is correct at 14 of the 16 file colors
 * and off-by-shade at colors 3 and 11.
 *
 * The current renderers (wfont-4bpp-render, ega-screen-render, pic-render)
 * no longer use this table. They look up `palette.colors[fileIdx]`
 * directly, requiring callers to pass a palette whose `colors[i]` is the
 * final RGB the framebuffer's color attribute `i` displays as — i.e.
 * `WIZ6_MAIN` (the AC->DAC chain for the engine's main-game scenes).
 *
 * Retained as an export only for backwards compatibility with any external
 * consumer that may still depend on it. See
 * `docs/re/findings/menu-cursor-render-path.json` for the full story.
 */
export const EGA_FILE_INDEX_PERMUTATION = [
  0, 15, 9, 5, 12, 14, 10, 11, 8, 7, 1, 13, 4, 6, 2, 3,
] as const;
