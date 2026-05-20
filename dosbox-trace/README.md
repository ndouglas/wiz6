# DOSBox-X trace artifacts (Stage 1f.2)

Captured PNG screenshots from running Wizardry VI in DOSBox-X. Used to extract the in-engine palette state for the title sequence — see `docs/re/ega-screen.md` "Palette" section for how these PNGs were turned into the `wiz6-title` palette in `packages/viewer/src/palettes/`.

## Files

- `captures/wroot_000.png`, `wroot_001.png` — title-screen frames captured during the intro/credits sequence. The credits text is overlaid on top of the title art, but the art is fully visible behind it. Both frames are 320×200 indexed PNGs with exactly 16 unique colors (the active EGA palette).

## How to recreate

Install DOSBox-X via Homebrew (`brew install --cask dosbox-x`). Remove the macOS quarantine attribute if you hit the "Killed: 9" error: `xattr -dr com.apple.quarantine /Applications/dosbox-x.app`.

Write a `wiz6.conf` (gitignored because the paths are machine-specific) with:

```ini
[dosbox]
machine=ega
captures=<absolute path to this captures/ directory>
memsize=4

[render]
aspect=true
scaler=normal2x

[autoexec]
mount c <absolute path to the project's original/ directory>
c:
```

Launch with `/Applications/dosbox-x.app/Contents/MacOS/dosbox-x -conf wiz6.conf -fastlaunch`, then in the DOSBox-X window type `bane`, wait for the title screen, press **Ctrl+F5** to capture, then close DOSBox-X.
