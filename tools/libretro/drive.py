#!/usr/bin/env python3
"""Minimal driver for the libretro host: spawn, send line commands, read replies."""
import subprocess, sys, os

class Host:
    def __init__(self):
        self.log = open('/tmp/wiz6-libretro/host.log', 'wb')
        self.p = subprocess.Popen(['./host'], cwd=os.path.dirname(os.path.abspath(__file__)),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=self.log, bufsize=1, text=True)
    def cmd(self, c):
        self.p.stdin.write(c + '\n'); self.p.stdin.flush()
        return self.p.stdout.readline().strip()
    def close(self):
        try: self.cmd('quit')
        except Exception: pass
        self.p.wait(timeout=5)

if __name__ == '__main__':
    h = Host()
    print('step 3000 ->', h.cmd('step 3000'))
    base_reply = h.cmd('anchor'); print('anchor ->', base_reply)
    assert base_reply.startswith('ok base='), 'anchor not found'
    base = int(base_reply.split('=')[1], 16)
    gs = h.cmd(f'read {base+0x363a:x} 2'); print('game_state(+0x363a) ->', gs)
    psz = h.cmd(f'read {base+0x43ce:x} 1'); print('party_size(+0x43ce) ->', psz)
    fb = h.cmd('fb /tmp/wiz6-libretro/frame.rgba'); print('fb ->', fb)
    # framebuffer sanity: count non-black pixels
    import struct
    data = open('/tmp/wiz6-libretro/frame.rgba','rb').read()
    nonblack = sum(1 for i in range(0, len(data), 4) if data[i] or data[i+1] or data[i+2])
    print(f'framebuffer: {len(data)} bytes, {nonblack} non-black px')
    h.close()
