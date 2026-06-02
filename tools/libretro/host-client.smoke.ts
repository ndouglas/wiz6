import { HostClient } from './host-client.js';
const h = new HostClient();
await h.step(3000);
const base = await h.anchor();
console.log('DGROUP base:', '0x' + base.toString(16));
const gs = await h.read(base + 0x363a, 2);
console.log('game_state:', '0x' + (gs[0] | (gs[1] << 8)).toString(16));
// find the DGROUP anchor pattern; should sit at base + 0x5d6
const phys = await h.find('44 49 53 4b 2e 48 44 52 00 4d 53 47 2e 44 42 53 00');
console.log('find(DISK.HDR..) phys:', '0x' + phys.toString(16),
            '=> base+0x5d6 =', '0x' + (base + 0x5d6).toString(16),
            phys === base + 0x5d6 ? 'MATCH' : 'MISMATCH');
const fb = await h.fb('/tmp/wiz6-libretro/ts-frame.rgba');
console.log('framebuffer:', fb);
h.close();
