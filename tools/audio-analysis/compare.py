#!/usr/bin/env python3
"""Compare a DOSBox-X audio recording to our decoder's output for a single .snd.

Usage:
    python3 tools/audio-analysis/compare.py <recording.wav> <sound_id>

Examples:
    python3 tools/audio-analysis/compare.py tools/dosbox/recordings/sound00.wav sound00

The recording is whatever WAV DOSBox-X dumped. The sound_id is the .snd basename
(without extension) — sound00 / sound04 / etc.

Outputs:
    - Stdout summary: engine duration vs our duration, sample rate, peak amplitude
    - /tmp/audio-compare-<id>.png — side-by-side waveforms + FFT plots
      (requires numpy + scipy + matplotlib; install with
       `pip3 install --break-system-packages numpy scipy matplotlib` if missing)
"""

import argparse
import os
import struct
import sys


def read_wav(path: str):
    """Return (samples_int, sample_rate). Handles 8-bit unsigned + 16-bit signed."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ValueError(f"not a WAV file: {path}")
    pos = 12
    sample_rate = None
    bits = None
    channels = None
    data_bytes = None
    while pos < len(data) - 8:
        chunk = data[pos : pos + 4]
        size = struct.unpack("<I", data[pos + 4 : pos + 8])[0]
        if chunk == b"fmt ":
            channels = struct.unpack("<H", data[pos + 10 : pos + 12])[0]
            sample_rate = struct.unpack("<I", data[pos + 12 : pos + 16])[0]
            bits = struct.unpack("<H", data[pos + 22 : pos + 24])[0]
        if chunk == b"data":
            data_bytes = data[pos + 8 : pos + 8 + size]
            break
        pos += 8 + size + (size & 1)
    if data_bytes is None or bits is None or sample_rate is None:
        raise ValueError("no data chunk found")
    if bits == 8:
        samples = [b - 128 for b in data_bytes]  # u8 → centered s8
    elif bits == 16:
        samples = list(struct.unpack(f"<{len(data_bytes)//2}h", data_bytes))
    else:
        raise ValueError(f"unsupported bits/sample: {bits}")
    if channels == 2:
        samples = samples[::2]  # mono-ize: take left channel
    return samples, sample_rate


def decode_snd(path: str):
    with open(path, "rb") as f:
        data = f.read()
    tree_size = data[0] | (data[1] << 8)
    rate_word = data[2] | (data[3] << 8)
    if tree_size == 0:
        return list(data[4:]), rate_word
    n_nodes = tree_size // 4
    tree = struct.unpack(f"<{n_nodes*2}H", data[4 : 4 + tree_size])
    out, node = [], 0
    for byte in data[4 + tree_size :]:
        for shift in range(7, -1, -1):
            bit = (byte >> shift) & 1
            child = tree[node * 2 + bit]
            if (child & 0x8000) == 0:
                out.append(child & 0xFF)
                node = 0
            else:
                node = 0x10000 - child
                if node >= n_nodes:
                    return out, rate_word
    return out, rate_word


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("wav", help="DOSBox-X recording (any standard WAV)")
    ap.add_argument("sound_id", help="sound ID like sound00")
    args = ap.parse_args()

    samples, sr = read_wav(args.wav)
    peak = max(abs(s) for s in samples) if samples else 0
    print(
        f"engine WAV:  {len(samples):,} samples @ {sr} Hz = {len(samples)/sr:.3f}s  peak={peak}"
    )

    snd_path = f"original/{args.sound_id}.snd"
    if not os.path.exists(snd_path):
        print(f"  (no matching .snd at {snd_path}; skipping decode comparison)")
        return 0
    decoded, rate_word = decode_snd(snd_path)
    our_rate = 1193182 // 150 // 2  # default placeholder
    rate_word_str = "default" if rate_word == 0xFFFF else f"div {rate_word}"
    print(
        f"our decode:  {len(decoded):,} samples  rate_word={rate_word:#06x} ({rate_word_str})"
    )
    print(f"             → {len(decoded)/our_rate:.3f}s at our default {our_rate} Hz")
    print(f"             samples[0..15]: {decoded[:16]}")
    print(
        f"             samples[0..15] as hex: {' '.join(f'{x:02x}' for x in decoded[:16])}"
    )

    # Implied sample rate from engine recording vs our sample count:
    implied_rate = len(decoded) / (len(samples) / sr)
    print(
        f"implied:     if both render the same audio, our sample rate should be ~{implied_rate:.0f} Hz"
    )
    print(
        f"             vs PIT_freq formulas:  /150 = {1193182//150} Hz, /150/2 = {1193182//150//2} Hz, /100 = {1193182//100} Hz"
    )

    # Try to draw the side-by-side plots.
    try:
        import numpy as np  # noqa
        import matplotlib  # noqa

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from scipy.fft import rfft, rfftfreq

        engine = np.array(samples, dtype=np.float32)
        ours = np.array(decoded, dtype=np.float32) - 128

        fig, axes = plt.subplots(2, 2, figsize=(14, 8))
        axes[0, 0].plot(engine)
        axes[0, 0].set_title(f"engine WAV @ {sr}Hz  ({len(samples)} samples)")
        axes[0, 1].plot(ours)
        axes[0, 1].set_title(f"our decoded bytes ({len(decoded)} samples)")
        for ax, sig, rate in [(axes[1, 0], engine, sr), (axes[1, 1], ours, our_rate)]:
            fft = np.abs(rfft(sig))
            freqs = rfftfreq(len(sig), 1 / rate)
            ax.semilogy(freqs, fft + 1e-3)
            ax.set_xlabel("Hz")
            ax.set_xlim(0, min(8000, rate // 2))
        axes[1, 0].set_title(f"engine FFT (sr={sr})")
        axes[1, 1].set_title(f"our FFT (assumed sr={our_rate})")
        out = f"/tmp/audio-compare-{args.sound_id}.png"
        plt.tight_layout()
        plt.savefig(out, dpi=100)
        print(f"\n→ wrote comparison plot: {out}")
    except ImportError as e:
        print(f"\n(skipping plot: {e})")
        print("  install with: pip3 install --break-system-packages numpy scipy matplotlib")

    return 0


if __name__ == "__main__":
    sys.exit(main())
