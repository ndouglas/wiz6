/**
 * Wichmann-Hill 1982 three-stream Lehmer LCG — byte-perfect port of wroot.exe.
 *
 * ## Engine functions
 *
 * - `rng_advance`      @ wroot image 0x25b9 (file 0x27b9)  — updates all 3 streams in CS memory
 * - `rng_sample`       @ wroot image 0x2556 (file 0x2756)  — calls advance, combines to 15-bit raw
 * - `rng_next_bounded` @ wroot image 0x9e2  (file 0xbe2)   — calls sample, reduces via signed IDIV
 *
 * ## Per-stream update (rng_advance, verified from asm)
 *
 * Classic Wichmann-Hill Lehmer LCG:
 *   s = a*(s mod q) − c*(s div q);  if s < 0: s += m
 *
 * | Stream | q    | a    | c   | m (reseed) |
 * |--------|------|------|-----|------------|
 * | 1      | 0xb1 | 0xab |   2 | 0x763d     |
 * | 2      | 0xb0 | 0xac |  35 | 0x7663     |
 * | 3      | 0xb2 | 0xaa |  63 | 0x7673     |
 *
 * All arithmetic is 16-bit signed (IMUL/IDIV); for valid inputs (1..m−1)
 * the signed and unsigned results are identical, so plain JS integer math works.
 *
 * ## Combine step (rng_sample, verified from asm)
 *
 * After rng_advance updates the three streams:
 *   part_i = Math.floor(10000 * s_i / m_i) & 0x7fff
 *   raw    = ((part1 + part2) & 0x7fff + part3) & 0x7fff
 *
 * The asm uses `XOR DX,DX; DIV m_i` (unsigned) to compute s_i % m_i (= s_i itself
 * since s_i < m_i), then `MOV AX,0x2710; MUL DX; DIV m_i` for the scaled quotient.
 * Each intermediate result is masked to 15 bits by `AND AX, 0x7fff`.
 *
 * ## Reduction (rng_next_bounded, verified from asm)
 *
 * `rng(n)`: call rng_sample, then `CWD; IDIV n; MOV AX, DX` → raw % n.
 * raw is always 0..0x7fff (positive); n is positive → signed % = unsigned %.
 * If n ≤ 0, the engine returns 0 (guarded by `CMP n, 0; JNG skip`).
 *
 * ## Boot seeds (docs/re/wpcmk-screens.md §12, docs/re/findings/wpcmk-rng-seed-at-creation.json)
 *
 * Streams 1 and 3 are never explicitly seeded; their initial values come from
 * the raw wroot.exe code bytes at CS offsets 0x1d3b and 0x1d3f:
 *   stream1 = 0x0bb8 = 3000 (bytes: b8 0b LE)
 *   stream3 = 0x752f = 29999 (bytes: 2f 75 LE)
 * Stream 2 is seeded once at boot from the BIOS tick counter + 2 (non-deterministic).
 * For deterministic tests use the static boot triple: (3000, 1, 29999).
 *
 * ## Ground-truth validation
 *
 * DOSBox save 1.sav: wroot phys_base=0x82c8; physical 0xa003 = CS:0x1d3b.
 * Bytes read: da 05 be 57 4a 6d → s1=1498, s2=22462, s3=27978.
 * Matches docs/re/findings/wpcmk-rng-seed-at-creation.json save_1_stream_* exactly.
 */

/** Moduli (reseed constants) for each Wichmann-Hill stream. */
const M1 = 0x763d; // 30269
const M2 = 0x7663; // 30307
const M3 = 0x7673; // 30323

/** Per-stream LCG constants decoded from rng_advance asm. */
const Q1 = 0xb1, A1 = 0xab, C1 = 2;
const Q2 = 0xb0, A2 = 0xac, C2 = 0x23; // 35
const Q3 = 0xb2, A3 = 0xaa, C3 = 0x3f; // 63

/**
 * Advance one Wichmann-Hill stream by one step.
 *
 * Mirrors the 16-bit asm sequence:
 *   IDIV q  → quot=s÷q, rem=s%q
 *   IMUL c  → AX = quot*c
 *   IMUL a  → AX = a*rem
 *   SUB; if negative ADD m
 */
function advanceStream(s: number, q: number, a: number, c: number, m: number): number {
  const quot = Math.trunc(s / q);
  const rem  = s % q;
  const next = a * rem - c * quot;
  return next < 0 ? next + m : next;
}

/**
 * Seedable 3-stream Wichmann-Hill generator matching the Wiz6 engine RNG.
 *
 * ### Usage
 * ```ts
 * const rng = new WichmannHill(3000, 1, 29999); // static boot seed
 * rng.uniform(6);   // 0..5, like engine rng(6)
 * rng.uniform(20);  // 0..19, like engine rng(20)
 * const raw = rng.nextRaw(); // 0..0x7fff raw sample
 * ```
 *
 * All methods are pure (no I/O, no Math.random).
 */
export class WichmannHill {
  private s1: number;
  private s2: number;
  private s3: number;

  /**
   * @param s1  Stream 1 seed (1..30268). Boot default: 3000.
   * @param s2  Stream 2 seed (1..30306). Boot default: BIOS_tick+2 (use 1 for tests).
   * @param s3  Stream 3 seed (1..30322). Boot default: 29999.
   */
  constructor(s1: number, s2: number, s3: number) {
    this.s1 = s1;
    this.s2 = s2;
    this.s3 = s3;
  }

  /**
   * Advance all three streams and return the combined 15-bit raw sample.
   *
   * Matches `rng_sample` at wroot image 0x2556: calls rng_advance, then
   * computes `part_i = (10000 * s_i / m_i) & 0x7fff` for each stream and
   * sums them with 15-bit masking at each accumulation step.
   *
   * @returns Integer in [0, 0x7fff].
   */
  nextRaw(): number {
    // rng_advance: update all three streams in-place
    this.s1 = advanceStream(this.s1, Q1, A1, C1, M1);
    this.s2 = advanceStream(this.s2, Q2, A2, C2, M2);
    this.s3 = advanceStream(this.s3, Q3, A3, C3, M3);

    // combine: part_i = floor(10000 * s_i / m_i) & 0x7fff
    const p1 = Math.trunc(10000 * this.s1 / M1) & 0x7fff;
    const p2 = Math.trunc(10000 * this.s2 / M2) & 0x7fff;
    const p3 = Math.trunc(10000 * this.s3 / M3) & 0x7fff;

    // accumulate with 15-bit masking after each addition
    const cx = (p1 + p2) & 0x7fff;
    return (cx + p3) & 0x7fff;
  }

  /**
   * Return a uniform integer in `[0, n)`, matching the engine's `rng(n)`.
   *
   * Matches `rng_next_bounded` at wroot image 0x9e2:
   *   call rng_sample; CWD; IDIV n; MOV AX, DX  →  raw % n
   *
   * If `n ≤ 0`, returns 0 without advancing state (mirrors the engine's
   * `CMP [bp+4], 0; JNG skip` guard).
   *
   * @param n  Upper bound (exclusive). Must be ≥ 1 for a meaningful result.
   * @returns  Integer in [0, n), or 0 if n ≤ 0.
   */
  uniform(n: number): number {
    if (n <= 0) return 0;
    return this.nextRaw() % n;
  }

  /**
   * Return the current stream state as a `[s1, s2, s3]` tuple.
   *
   * Useful for capturing state before a deterministic replay sequence.
   */
  streams(): [number, number, number] {
    return [this.s1, this.s2, this.s3];
  }

  /**
   * Return a new `WichmannHill` instance with the same stream state.
   *
   * The clone advances independently; mutations to one do not affect the other.
   */
  clone(): WichmannHill {
    return new WichmannHill(this.s1, this.s2, this.s3);
  }
}
