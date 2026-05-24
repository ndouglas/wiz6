import { describe, expect, it } from 'vitest';
import {
  findSegmentsInMemory,
  resolveSegAddr,
  type SegmentAnchor,
} from '../../src/segments/index.js';

describe('findSegmentsInMemory', () => {
  it('locates segments whose signatures match in the blob', () => {
    // Build a fake "memory" with two segments at known positions:
    // - SegA's content at offset 1000
    // - SegB's content at offset 5000
    const mem = new Uint8Array(10000);
    mem.set([0x55, 0xaa, 0xde, 0xad, 0xbe, 0xef, 0x01, 0x02], 1000);
    mem.set([0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97], 5000);

    const anchors: SegmentAnchor[] = [
      { space: 'wbase.ovr', diskPath: '', anchorFileOffset: 0, anchorLength: 8 },
      { space: 'wmaze.ovr', diskPath: '', anchorFileOffset: 0, anchorLength: 8 },
      { space: 'winit.ovr', diskPath: '', anchorFileOffset: 0, anchorLength: 8 },
    ];

    const map = findSegmentsInMemory(mem, [
      { anchor: anchors[0]!, signature: new Uint8Array([0x55, 0xaa, 0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]) },
      { anchor: anchors[1]!, signature: new Uint8Array([0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97]) },
      { anchor: anchors[2]!, signature: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]) }, // absent
    ]);

    expect(map['wbase.ovr']?.physBase).toBe(1000);
    expect(map['wmaze.ovr']?.physBase).toBe(5000);
    expect(map['winit.ovr']).toBeUndefined();
  });

  it('applies loadHeaderSkipBytes when computing physBase', () => {
    const mem = new Uint8Array(10000);
    mem.set([0x44, 0x49, 0x53, 0x4b], 0x1000); // "DISK" placed at phys 0x1000

    const anchor: SegmentAnchor = {
      space: 'wroot.exe',
      diskPath: '',
      anchorFileOffset: 0x500, // file offset 0x500 contains the anchor
      anchorLength: 4,
      loadHeaderSkipBytes: 0x200, // header stripped at load
    };

    const map = findSegmentsInMemory(mem, [
      { anchor, signature: new Uint8Array([0x44, 0x49, 0x53, 0x4b]) },
    ]);

    // physBase = phys_anchor - (file_offset - header_skip)
    //          = 0x1000 - (0x500 - 0x200)
    //          = 0x1000 - 0x300
    //          = 0xD00
    expect(map['wroot.exe']?.physBase).toBe(0xd00);
    expect(map['wroot.exe']?.anchorPhys).toBe(0x1000);
  });

  it('resolveSegAddr returns phys = physBase + offset', () => {
    const map = {
      'wbase.ovr': { physBase: 0xc82c, anchorPhys: 0xc86c },
    };
    expect(resolveSegAddr(map, { space: 'wbase.ovr', offset: 0x2b36 })).toBe(0xc82c + 0x2b36);
  });

  it('resolveSegAddr throws for unloaded segments', () => {
    expect(() => resolveSegAddr({}, { space: 'wmaze.ovr', offset: 0x100 })).toThrow(
      /not loaded/,
    );
  });
});
