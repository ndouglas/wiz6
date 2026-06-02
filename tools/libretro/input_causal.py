from drive import Host
h = Host()
def state():
    b = int(h.cmd('anchor').split('=')[1],16)
    hx = h.cmd(f'read {b+0x363a:x} 2').split()[1]
    return int(hx[0:2],16)|(int(hx[2:4],16)<<8), b
h.cmd('step 800')
# (a) autonomous: step a lot with NO input, watch where state settles
seq=[]
for _ in range(8):
    h.cmd('step 1000'); s,_=state(); seq.append(hex(s))
print('autonomous states:', seq)
s_auto,_ = state()
# (b) now inject keys and see if state advances beyond the autonomous resting state
for k in ['enter','enter','space','enter']:
    h.cmd(f'key {k} tap'); h.cmd('step 600')
s_key, base = state()
print(f'resting(no-input)={hex(s_auto)}  after-keys={hex(s_key)}')
# (c) if at the menu (state 4), prove arrow moves the cursor (input-only, frame diff)
verdict = 'inconclusive'
if s_key == 4:
    h.cmd('fb /tmp/wiz6-libretro/m0.rgba')
    h.cmd('key down tap'); h.cmd('step 30')
    h.cmd('fb /tmp/wiz6-libretro/m1.rgba')
    a=open('/tmp/wiz6-libretro/m0.rgba','rb').read(); b=open('/tmp/wiz6-libretro/m1.rgba','rb').read()
    diff=sum(1 for i in range(0,len(a),4) if a[i:i+3]!=b[i:i+3])
    print(f'menu reached; arrow-down frame diff = {diff} px')
    verdict = 'INPUT CAUSAL (menu cursor moved on arrow)' if diff>20 else 'arrow had no visible effect'
elif s_key != s_auto:
    verdict = f'INPUT CAUSAL (state advanced {hex(s_auto)}->{hex(s_key)} only after keys)'
print('VERDICT:', verdict)
h.close()
