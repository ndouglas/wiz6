import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, deflateSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFullCallList, composeCallList } from '../../packages/parser/src/maze/callist.js';
import { renderMazeViewport } from '../../packages/parser/src/maze/render.js';
import { loadMazeAssets } from '../../packages/parser/src/maze/assets.js';
import { expandMazeData } from '../../packages/parser/src/maze/maze-data.js';
import { loadLevel0 } from '../parity/maze-view-cases.js';
const VP = { x: 72, y: 32, w: 176, h: 112 };
const EGA: number[][] = [[0,0,0],[0,0,170],[0,170,0],[0,170,170],[170,0,0],[170,0,170],[170,85,0],[170,170,170],[85,85,85],[85,85,255],[85,255,85],[85,255,255],[255,85,85],[255,85,255],[255,255,85],[255,255,255]];
const here=dirname(fileURLToPath(import.meta.url)); const ROOT=resolve(here,'../..');
const FIX=resolve(ROOT,'tools/parity/fixtures/engine');
const BLOCK=loadLevel0().block; const assets=loadMazeAssets(); const wb=expandMazeData(assets.mazedata);
function engVp(v:string){const raw=gunzipSync(readFileSync(resolve(FIX,`maze-freeroam-${v}.idx.gz`)));const f=new Uint8Array(raw.buffer,raw.byteOffset,raw.byteLength);const o=new Uint8Array(VP.w*VP.h);for(let r=0;r<VP.h;r++)for(let c=0;c<VP.w;c++)o[r*VP.w+c]=f[(VP.y+r)*320+VP.x+c]!;return o;}
function encodePng(rgba:Uint8Array,W:number,H:number):Buffer{const raw=Buffer.alloc((W*3+1)*H);let q=0;for(let y=0;y<H;y++){raw[q++]=0;for(let x=0;x<W;x++){const o=(y*W+x)*4;raw[q++]=rgba[o]!;raw[q++]=rgba[o+1]!;raw[q++]=rgba[o+2]!;}}const crc=(buf:Buffer)=>{let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i]!;for(let k=0;k<8;k++)c=(c>>>1)^(0xedb88320&-(c&1));}return(~c)>>>0;};const chunk=(t:string,d:Buffer)=>{const tt=Buffer.concat([Buffer.from(t),d]);const len=Buffer.alloc(4);len.writeUInt32BE(d.length);const c=Buffer.alloc(4);c.writeUInt32BE(crc(tt));return Buffer.concat([len,tt,c]);};const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(W,0);ihdr.writeUInt32BE(H,4);ihdr[8]=8;ihdr[9]=2;return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
function sbs(gen:Uint8Array,eng:Uint8Array){const W=VP.w*2+4,H=VP.h;const out=new Uint8Array(W*H*4);const put=(idx:Uint8Array,xo:number)=>{for(let r=0;r<H;r++)for(let c=0;c<VP.w;c++){const p=EGA[idx[r*VP.w+c]!]??[0,0,0];const di=(r*W+xo+c)*4;out[di]=p[0]!;out[di+1]=p[1]!;out[di+2]=p[2]!;out[di+3]=255;}};put(gen,0);put(eng,VP.w+4);return{rgba:out,W,H};}
for(const v of process.argv.slice(2)){const m=v.match(/gx(\d+)-gy(\d+)-f(\d+)/)!;const party={gx:+m[1]!,gy:+m[2]!,z:0,facing:+m[3]!};const gen=renderMazeViewport(BLOCK,party,assets,{page:composeCallList(wb,generateFullCallList(BLOCK,party))});const{rgba,W,H}=sbs(gen,engVp(v));const out=`/tmp/eyeball-${v}.png`;writeFileSync(out,encodePng(rgba,W,H));console.log('wrote',out);}
