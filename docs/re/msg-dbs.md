# `msg.dbs` — Game Text Database

**Status:** Format decoded. Game text is Huffman-compressed using a shared tree (in `misc.hdr`). All ~765 records decode to readable Wizardry strings (class names, commands, spell names, dialog text). A residual "record internal delimiter" question remains (see "Open question" below).

## Files

- `original/msg.dbs` — 81920 bytes. The compressed message database.
- `original/msg.hdr` — 5102 bytes. Index into `msg.dbs` (encoding not fully decoded yet; see "Open question").
- `original/misc.hdr` — 1024 bytes. The shared Huffman tree used to decompress msg.dbs records (and probably other compressed text files in the game).

## `msg.dbs` record layout

A flat stream of length-prefixed records, no header:

```
record:
  BYTE  length       // total record size including this byte (so length 1 = no payload)
  ...   length-1 bytes of Huffman bit stream
```

Parsing the entire 81920-byte file as length-prefixed records yields **765 records consuming 100% of the bytes** (with 36 bytes trailing that aren't a complete record — likely zero padding).

A few records have `length=1` (just the length byte, no payload) — possibly empty/sentinel entries.

## Huffman tree (`misc.hdr`)

The shared decompression tree. 1024 bytes = **256 nodes × 4 bytes per node**. Same encoding as the decoder we identified in `wroot.exe` (`FUN_33e9` from Stage 1f):

```
node @ offset N (N = 0, 4, 8, ..., 1020):
  WORD left_link   // bytes N, N+1 (little-endian)
  WORD right_link  // bytes N+2, N+3
```

For each link:
- If the high bit (`0x8000`) is set: **internal node**. The link's true value is `-(link & 0xffff)` (i.e., negated as a 16-bit signed value); multiply by 4 to get the byte offset of the next node.
- If the high bit is not set: **leaf**. The low byte of the link is the ASCII character to emit.

Tree dump confirms the leaf values are common English letters in frequency order — `0x20` (SPACE), `0x45` (E), `0x54` (T), `0x41` (A), `0x4F` (O), `0x53` (S), `0x4E` (N), and so on.

## Decoding algorithm

Mirrors `FUN_33e9` in wroot.exe (Stage 1f investigation):

```
def huff_decode(tree: bytes, bit_stream: bytes) -> bytes:
    output = []
    bx = 0           # current node, byte offset in tree
    bit_buf = 0
    bits_left = 0
    si = 0           # byte offset in bit stream
    while True:
        if bits_left == 0:
            if si >= len(bit_stream): return bytes(output)
            bit_buf = bit_stream[si]; si += 1; bits_left = 8
        bit = (bit_buf >> 7) & 1
        bit_buf = (bit_buf << 1) & 0xff
        bits_left -= 1
        link = read_word(tree, bx + (2 if bit else 0))
        if link & 0x8000:
            bx = ((-link) & 0xffff) * 4
        else:
            output.append(link & 0xff)
            bx = 0
```

## Sample decoded records

```
record  0 ( 4 compressed bytes): "E  HUMA"
record  1 (223 compressed bytes): "...DWARF...GNOME...ELEM...FIGHTER...MAGE...MAGIC...RANGER..."
record  2 (  2 compressed bytes): "ES I"
record  3 (219 compressed bytes): "...EQUIP...SPELL...TRADE...ASSAY...ITEM...SKILL..."
record  4 ( 56 compressed bytes): "...TRADE WHICH ITEM?...TRADE GOLD (AMOUNT) >..."
...
```

The strings include all class names, item-action commands, spell categories, character options, and dialog text — clearly the game's UI/dialog text database.

## Per-message delimiters (Stage 1g.1 — msg.hdr resolved)

Initially we worried that each record contained multiple sub-messages with implicit delimiters. Stage 1g.1 cracked `msg.hdr` and revealed that **msg.dbs is more naturally read as one continuous Huffman bit stream**, with `msg.hdr` providing 718 (byte_offset, char_offset) indices into that stream. See `docs/re/msg-hdr.md` for the full layout.

The "E as separator" appearance in raw-record decoding turned out to be a side effect of the records each containing multiple bit-stream messages back-to-back — the 'E' chars are real letters from the decoded text, just at the boundaries between encoded messages.

## Stage 1g.2: leading-noise heuristic

Even with msg.hdr indexing, each indexed-message slice typically has **1-8 chars of leading "noise"** before the real text begins — either a per-message header (length / type byte that decodes through the Huffman tree to gibberish letters) or a bit-stream resynchronization artifact at the message boundary.

Empirical analysis over all 718 indexed messages:
- 402 of 718 are empty (sentinel slots).
- 91 of the non-empty messages start with an uppercase letter at position 0.
- 19 more start with uppercase at position 1, 6 at position 2.
- The most common 2-char prefixes are `"EE"` (20×), `"E "` (18×), `"TE"` (11×), `"  "` (7×).

The decoder now produces a `cleanedText` field alongside `decodedText`:

- If `decodedText` already starts with an uppercase letter `A-Z`, digit `0-9`, or sentence-starting punctuation (`"`, `'`, `*`, `(`), `cleanedText === decodedText`.
- Otherwise, scan the first 10 chars for any of those "clean-start" characters and strip everything before it.
- If nothing clean is found in the first 10 chars, leave the text alone.

This is conservative — it strips obvious leading whitespace and single-char lowercase prefixes, but leaves messages with stubborn multi-char noise intact. On real data, 71 messages get cleaning applied; the remaining 647 are passed through unchanged.

`MessageGallery` defaults to showing `cleanedText` with a "strip leading garbage (heuristic)" checkbox to toggle back to `decodedText`. The JSON ships both fields.

### Why the leading noise exists (open)

We don't yet know why each message has a small leading prefix. Best guesses:

1. **Per-message header byte(s)** — Wiz6 may store a length or type byte at the start of each message in msg.dbs, before the actual text. The Huffman tree encodes that byte alongside the text, decoding to seemingly-random letters when read.
2. **Bit-stream resync artifacts** — Huffman codes are self-synchronizing, but starting decode mid-bit-stream produces a few garbage chars until alignment. Our section-based decoder starts on byte boundaries (col_a values), but the *previous section's last message may have ended mid-byte*, leaving leftover bits that decode to noise.
3. **A specific control byte (e.g., 0x00) that we're treating as a literal character** — unlikely since the Huffman tree's known leaves are all 0x20+ ASCII range.

Resolving this would require tracing the actual text-display routine in `wbase.ovr` / `wmaze.ovr` / etc. and watching how it interprets the bit stream byte by byte.
