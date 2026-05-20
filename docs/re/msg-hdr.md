# `msg.hdr` — Index into `msg.dbs`

**Status:** Format mostly decoded. 718 indexed messages extractable with section-aware Huffman decoding. Some residual noise per message (leading garbage / unprintables) — see "Open questions" below.

## File layout

`original/msg.hdr` is 5102 bytes:

```
offset 0..1     WORD  entry_count  (= 718)
offset 2..4309  718 × 6-byte records
offset 4310..5101  zero padding
```

Each 6-byte record is three little-endian WORDs: `(byteOffset, charOffset, raw)`.

## Decoding model

`msg.dbs` is treated as a single continuous Huffman bit stream (sharing the
tree in `misc.hdr`, format identical to wroot.exe's `FUN_33e9` decoder from
Stage 1f). The 718 entries in `msg.hdr` describe individual messages by
referencing **byte offsets into that bit stream**:

```
byteOffset  = compressed-byte position where this message begins (col_a)
charOffset  = character offset within the current SECTION's decoded output (col_b)
raw         = third WORD; semantics not yet decoded (col_c)
```

### Sections

Entries are grouped into "sections" — runs where `charOffset` is monotonically
increasing. When `charOffset[N+1] < charOffset[N]`, a new section starts at
entry `N+1`. The real `msg.hdr` has 77 sections.

To decode the messages in section `s`:

1. Take all entries in section `s`. Let `start = first entry`, `end = first
   entry of section s+1` (or `entries.length` if `s` is the last section).
2. Compute `byteStart = entries[start].byteOffset`, `byteEnd =
   entries[end].byteOffset`.
3. Huffman-decode `dbsBytes[byteStart..byteEnd)` as a single continuous bit
   stream, producing a string `sectionText`.
4. For each entry `N` in `[start, end)`: this message's text is
   `sectionText.slice(entries[N].charOffset, entries[N+1].charOffset)` (or
   `sectionText.slice(entries[N].charOffset)` if `N` is the last entry in the
   section).

### Last-section cap

The very last section has no "next section's byteStart" to bound it. Without
a cap, the last message decodes from byte 18950 all the way to the end of
msg.dbs (byte 81920) producing a giant multi-message blob. The decoder caps
the last section's `byteEnd` at `byteOffset[last entry] + 256` (p99
compressed message size is ~200 bytes), which contains the runaway but
doesn't eliminate it entirely — the last section's last entry typically
still contains a few stitched-together messages.

## Open questions

### Why the leading garbage on most messages

Many decoded messages still start with a few characters of noise before the
real text. For example `"KCET IRE HE SPELL HAS BEEN SCRIBED..."` (real
message: `"THE SPELL HAS BEEN SCRIBED..."`). This may be:

- A bit-alignment artifact (messages within a section don't start on byte
  boundaries; we decode the entire section into one string and slice by
  `charOffset`, which only gives character-coarse alignment).
- Information encoded in the third WORD (`raw` / col_c) — values cluster
  suspiciously (e.g., `15108` appears 11 times, `13056` 10 times) suggesting
  category/type IDs rather than per-message data, but we haven't decoded
  what they mean.
- A small per-message header (1-2 leader chars to skip) that we don't yet
  identify.

### What `raw` (col_c) means

Range: 1..20235 across the 718 entries. Many values repeat. Plausibly a
game-internal message-category ID, but not yet decoded.

## Stage history

- **Stage 1g**: cracked `msg.dbs` Huffman compression, decoded 765
  length-prefixed records into multi-message blobs.
- **Stage 1g.1** (this work): cracked `msg.hdr` format, split the blobs into
  718 individually-indexed messages. Per-message text quality is much better
  but still has the residual issues above.
