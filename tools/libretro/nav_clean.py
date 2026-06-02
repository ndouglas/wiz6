from drive import Host
h = Host()
def state():
    b=int(h.cmd('anchor').split('=')[1],16)
    hx=h.cmd(f'read {b+0x363a:x} 2').split()[1]
    return int(hx[0:2],16)|(int(hx[2:4],16)<<8)
h.cmd('step 2000'); print('title state:', hex(state()))
h.cmd('key enter tap'); h.cmd('step 1500'); print('after 1 ENTER:', hex(state()))
h.cmd('step 2000'); print('settle:', hex(state()))
h.cmd('fb /tmp/wiz6-libretro/after_enter.rgba')
h.close()
