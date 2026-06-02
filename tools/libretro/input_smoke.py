from drive import Host
h = Host()
print('boot:', h.cmd('step 2000'))
def gs():
    base = int(h.cmd('anchor').split('=')[1],16)
    r = h.cmd(f'read {base+0x363a:x} 2')  # "ok LLHH"
    hx = r.split()[1]; return int(hx[0:2],16) | (int(hx[2:4],16)<<8), base
s0,_ = gs(); print('state after boot:', hex(s0))
# tap ENTER / SPACE a few times, stepping, to advance title -> main menu
for k in ['enter','space','enter']:
    h.cmd(f'key {k} tap'); h.cmd('step 400')
s1,_ = gs(); print('state after key taps:', hex(s1))
# settle more
h.cmd('step 1500'); s2,_ = gs(); print('state after settle:', hex(s2))
h.cmd('fb /tmp/wiz6-libretro/menu.rgba')
h.close()
print('INPUT REACHED GAME' if s1!=s0 or s2!=s0 else 'NO STATE CHANGE (input may not be wired)')
