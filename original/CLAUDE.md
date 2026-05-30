# original/ — the Wiz6 game install (DOSBox WORKSPACE)

These are the 1990 game binaries **and** a live DOSBox workspace. Playing the
game in DOSBox-X mutates files here in place: `pcfile.dbs` (roster),
`scenario.hdr`, `SAVEGAME.DBS`, and others.

## Rules

- **Never commit gameplay mutations** (e.g. a dirty `pcfile.dbs`). If
  `git status` shows one, it's workspace churn — leave it unstaged or discard
  it. It is not a change to ship.
- **Never make a test read from `original/`.** The test suite reads the pristine
  vendored copy at `test-fixtures/original/`, decoupled from DOSBox churn. Point
  new extractors and tests there.
- `SAVEGAME.DBS` is gitignored (user playthrough artifact).
