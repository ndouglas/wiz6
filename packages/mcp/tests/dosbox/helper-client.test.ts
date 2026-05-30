import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { HelperClient } from '../../src/dosbox/helper-client.js';

// A fake "helper" that reads lines and echoes back canned responses. Used to
// unit-test HelperClient without the real Swift binary.
function spawnFakeHelper(): ReturnType<typeof spawn> {
  return spawn('node', ['-e', `
    process.stdin.setEncoding('utf8');
    let buf = '';
    process.stdin.on('data', chunk => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        const req = JSON.parse(line);
        if (req.op === 'ping') process.stdout.write('{"ok":true}\\n');
        else if (req.op === 'findWindow') process.stdout.write('{"ok":true,"windowId":42}\\n');
        else process.stdout.write('{"ok":false,"error":"unknown"}\\n');
      }
    });
  `]);
}

// A fake "helper" that exits immediately after receiving the first request
// without ever writing a response — exercises the child-exit handler.
function spawnFakeHelperThatExits(): ReturnType<typeof spawn> {
  return spawn('node', ['-e', `
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', () => {
      process.exit(7);
    });
  `]);
}

describe('HelperClient', () => {
  let client: HelperClient | null = null;

  afterEach(async () => {
    if (client) await client.shutdown();
    client = null;
  });

  it('round-trips a ping', async () => {
    client = new HelperClient(spawnFakeHelper);
    const res = await client.send({ op: 'ping' });
    expect(res).toEqual({ ok: true });
  });

  it('returns windowId on findWindow', async () => {
    client = new HelperClient(spawnFakeHelper);
    const res = await client.send({ op: 'findWindow', appName: 'finder' });
    expect(res).toEqual({ ok: true, windowId: 42 });
  });

  it('propagates failure responses', async () => {
    client = new HelperClient(spawnFakeHelper);
    const res = await client.send({ op: 'bogus' as 'ping' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('unknown');
  });

  it('rejects pending callers with an actionable error when the helper exits unexpectedly', async () => {
    client = new HelperClient(spawnFakeHelperThatExits);
    const res = await client.send({ op: 'ping' });
    expect(res.ok).toBe(false);
    // Should mention "helper exited" and include the exit code (7).
    expect(res.error ?? '').toMatch(/helper exited/);
    expect(res.error ?? '').toMatch(/code=7/);
  });

  it('rejects pending callers with "shutdown" when shutdown() is called mid-flight', async () => {
    client = new HelperClient(spawnFakeHelperThatExits);
    const pending = client.send({ op: 'ping' });
    await client.shutdown();
    const res = await pending;
    expect(res.ok).toBe(false);
    expect(res.error ?? '').toMatch(/shutdown|helper exited/);
    client = null; // prevent afterEach double-shutdown
  });
});
