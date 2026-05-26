import { describe, expect, it } from 'vitest';
import { WichmannHill } from '../../src/rng/wichmann-hill.js';

/**
 * Tests for the Wichmann-Hill RNG decoded from wroot.exe.
 *
 * Algorithm verified against asm at wroot image 0x25b9 (rng_advance),
 * 0x2556 (rng_sample), and 0x9e2 (rng_next_bounded). All three functions
 * disassembled via ndisasm from wroot.exe file offsets 0x27b9, 0x2756, 0xbe2.
 *
 * Ground-truth stream values cross-checked against DOSBox save state 1.sav:
 *   wroot phys_base=0x82c8 + CS:0x1d3b -> physical 0xa003
 *   bytes: da 05 be 57 4a 6d -> s1=0x05da=1498, s2=0x57be=22462, s3=0x6d4a=27978
 *   Matches docs/re/findings/wpcmk-rng-seed-at-creation.json save_1_stream_* exactly.
 *
 * Golden values computed via Python simulation against the exact asm:
 *   seed (3000, 1, 29999) is the static boot triple (docs/re/wpcmk-screens.md §12).
 */

describe('WichmannHill constructor and streams()', () => {
  it('stores the initial seed as the stream state', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    expect(rng.streams()).toEqual([3000, 1, 29999]);
  });

  it('accepts arbitrary valid seeds', () => {
    const rng = new WichmannHill(1498, 22462, 27978); // from save 1
    expect(rng.streams()).toEqual([1498, 22462, 27978]);
  });
});

describe('WichmannHill.nextRaw() — rng_sample golden values', () => {
  /**
   * Golden sequence from boot seed (3000, 1, 29999).
   * Derived by simulating rng_sample (calls rng_advance then combines streams).
   *
   * Stream update per rng_advance (asm 0x25b9–0x2622):
   *   s1: 171*(s1%177) − 2*(s1÷177); if <0 add 30269
   *   s2: 172*(s2%176) − 35*(s2÷176); if <0 add 30307
   *   s3: 170*(s3%178) − 63*(s3÷178); if <0 add 30323
   *
   * Combine (rng_sample asm 0x2556–0x25b8, unsigned div):
   *   part_i = (10000 * s_i / m_i) & 0x7fff
   *   raw = ((part1 + part2) & 0x7fff + part3) & 0x7fff
   */
  it('first raw value is 11371 (0x2c6b)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    expect(rng.nextRaw()).toBe(11371);
  });

  it('second raw value is 12942 (0x328e)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.nextRaw(); // advance past first
    expect(rng.nextRaw()).toBe(12942);
  });

  it('third raw value is 21174 (0x52b6)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.nextRaw();
    rng.nextRaw();
    expect(rng.nextRaw()).toBe(21174);
  });

  it('fourth raw value is 12032 (0x2f00)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.nextRaw();
    rng.nextRaw();
    rng.nextRaw();
    expect(rng.nextRaw()).toBe(12032);
  });

  it('fifth raw value is 23123 (0x5a53)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.nextRaw();
    rng.nextRaw();
    rng.nextRaw();
    rng.nextRaw();
    expect(rng.nextRaw()).toBe(23123);
  });

  it('raw value is always in [0, 0x7fff]', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (let i = 0; i < 10000; i++) {
      const raw = rng.nextRaw();
      expect(raw).toBeGreaterThanOrEqual(0);
      expect(raw).toBeLessThanOrEqual(0x7fff);
    }
  });
});

describe('WichmannHill stream state after nextRaw()', () => {
  /**
   * After the first nextRaw(), streams should reflect the advanced state.
   * rng_advance from (3000, 1, 29999):
   *   s1: 171*(3000%177) - 2*(3000÷177) = 171*168 - 2*16 = 28728 - 32 = 28696
   *   s2: 172*(1%176)    - 35*(1÷176)   = 172*1   - 35*0 = 172
   *   s3: 170*(29999%178)- 63*(29999÷178)= 170*55  - 63*168 = 9350-10584 = -1234+30323 = 5566? wait
   * Actually s3: 170*(29999%178) - 63*(29999÷178)
   *   29999÷178=168 (floor), 29999%178=29999-168*178=29999-29904=95?
   *   168*178=29904, 29999-29904=95
   *   170*95 - 63*168 = 16150 - 10584 = 5566 ✓
   */
  it('streams update correctly after first nextRaw()', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.nextRaw();
    expect(rng.streams()).toEqual([28696, 172, 5566]);
  });

  it('streams update correctly after second nextRaw()', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.nextRaw();
    rng.nextRaw();
    expect(rng.streams()).toEqual([3438, 29584, 6207]);
  });
});

describe('WichmannHill.uniform(n) — rng_next_bounded reduction', () => {
  /**
   * rng_next_bounded (asm 0x9e2): calls rng_sample, then does:
   *   CWD; IDIV n; MOV AX, DX  → returns raw % n
   * raw is always 0..0x7fff (positive), n is positive → signed IDIV
   * equals unsigned mod for this range.
   */
  it('uniform(6) first call = 1 (11371 % 6)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    expect(rng.uniform(6)).toBe(1);
  });

  it('uniform(9) second call = 0 (12942 % 9)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.uniform(6); // first call
    expect(rng.uniform(9)).toBe(0);
  });

  it('uniform(20) third call = 14 (21174 % 20)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    rng.uniform(6);
    rng.uniform(9);
    expect(rng.uniform(20)).toBe(14);
  });

  it('uniform(n) always returns value in [0, n)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (const n of [1, 2, 6, 9, 20, 1000]) {
      for (let i = 0; i < 100; i++) {
        const v = rng.uniform(n);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(n);
      }
    }
  });

  it('uniform(0) returns 0 (guarded: n<=0 path in rng_next_bounded)', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    expect(rng.uniform(0)).toBe(0);
  });

  it('uniform(1) always returns 0', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (let i = 0; i < 100; i++) {
      expect(rng.uniform(1)).toBe(0);
    }
  });
});

describe('WichmannHill.clone()', () => {
  it('clone has same initial state', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const cloned = rng.clone();
    expect(cloned.streams()).toEqual(rng.streams());
  });

  it('clone advances independently from the original', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const cloned = rng.clone();

    const origFirst = rng.nextRaw();
    const cloneFirst = cloned.nextRaw();
    expect(origFirst).toBe(cloneFirst); // same value since same state

    // After advancing original more, clone is still behind
    const origSecond = rng.nextRaw();
    const cloneSecond = cloned.nextRaw();
    expect(origSecond).toBe(cloneSecond); // both at second call
  });

  it('advancing original does not affect clone', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    const cloned = rng.clone();

    rng.nextRaw(); // advance original
    // clone should still produce first value
    expect(cloned.nextRaw()).toBe(11371);
  });
});

describe('WichmannHill streams stay in valid range', () => {
  it('all stream values remain positive after many advances', () => {
    const rng = new WichmannHill(3000, 1, 29999);
    for (let i = 0; i < 50000; i++) {
      rng.nextRaw();
      const [s1, s2, s3] = rng.streams();
      expect(s1).toBeGreaterThan(0);
      expect(s2).toBeGreaterThan(0);
      expect(s3).toBeGreaterThan(0);
      expect(s1).toBeLessThan(30269); // m1
      expect(s2).toBeLessThan(30307); // m2
      expect(s3).toBeLessThan(30323); // m3
    }
  });
});

describe('WichmannHill — save-state cross-validation', () => {
  /**
   * Ground truth: DOSBox save 1.sav, wroot phys_base=0x82c8.
   * Read 6 bytes at physical 0xa003 (= 0x82c8 + CS:0x1d3b):
   *   da 05 be 57 4a 6d → s1=1498, s2=22462, s3=27978
   * This matches docs/re/findings/wpcmk-rng-seed-at-creation.json.
   *
   * After one rng_advance from (1498, 22462, 27978):
   *   s1: 171*(1498%177) - 2*(1498÷177) = 171*97 - 2*8 = 16587-16 = 16571?
   *   Wait: 1498÷177=8, 1498%177=1498-8*177=1498-1416=82
   *   s1: 171*82 - 2*8 = 14022 - 16 = 14006
   *   s2: 1498÷176... wait s2=22462
   *   s2: 22462÷176=127, 22462%176=22462-22352=110
   *   172*110 - 35*127 = 18920 - 4445 = 14475
   *   s3: 27978÷178=157, 27978%178=27978-27946=32
   *   170*32 - 63*157 = 5440 - 9891 = -4451 + 30323 = 25872
   */
  it('one advance from save-1 state matches formula', () => {
    const rng = new WichmannHill(1498, 22462, 27978);
    rng.nextRaw();
    expect(rng.streams()).toEqual([14006, 14475, 25872]);
  });
});
