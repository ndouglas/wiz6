# packages/mcp/tests/ — test isolation rules

## Don't bind a test to a mutable workspace artifact

Engine ground truth comes from the **pinned, committed** source image
(`test-fixtures/original/` + the frozen states under `test-fixtures/states/`),
driven via the dosbox-pure harness — NOT from anything a live session writes at
runtime. Don't point a test at `tools/dosbox/save/*` or any scratch dir whose
contents are "whatever ran last"; such a test passes or fails on incidental state
and tends to silently `skip` when the file is absent, masking breakage.

## Instead

- **Prefer synthesizing** the minimal artifact the code under test needs, at test
  time — a deterministic byte buffer at a known offset is enough to assert the
  *exact* result rather than "> 0". The current tests follow this: `server.test.ts`
  exercises the registered tool surface, and `read-struct.test.ts` decodes a known
  struct from synthetic bytes — neither depends on a live emulator or a captured
  save.
- If a test genuinely needs **real captured bytes**, vendor a stable committed
  fixture under `packages/mcp/tests/fixtures/` (decoupled from any workspace,
  mirroring `test-fixtures/original/`) and gate it `skipIf(!existsSync(FIXTURE))`.
- Tests that would need a **running** dosbox-pure session (launch → drive → read)
  belong with the driving-based parity tooling, not in the default unit suite —
  keep these tests harness-free.
