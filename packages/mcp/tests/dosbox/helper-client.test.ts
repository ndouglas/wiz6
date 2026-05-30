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
});
