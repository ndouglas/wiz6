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

## Open question: per-message delimiters within a record

Many records decode to LONG TEXT containing multiple distinct messages. For example, record 1 decodes to a 223-byte enumeration of all character classes. The boundaries between sub-messages are encoded somehow — the character `'E'` appears as an apparent separator in many records (e.g., `"DWARFEEOE GNOMEEET E LEM..."`), but it may just be a coincidence with the high-frequency `E` letter being a noisy filler at the end of bit streams.

Possibilities for the per-message delimiter:
- A control character (e.g., `0x00` or `0x01`) emitted between messages — but the decoded streams don't show clean nulls.
- `msg.hdr` may give explicit `(record, offset, length)` triplets pointing to specific bytes within each record's decoded text.
- The tree may emit a special "end of message" marker via a leaf with a high-byte value (e.g., 128-255) that we're not handling.

Resolving this would require either:
- Static analysis of the routines in wroot.exe / overlays that READ from msg.dbs to display messages on screen.
- DOSBox-X trace: hit Wizardry menus and capture the displayed text to cross-reference with our decoded records.

For Stage 1g's MVP, the records are exposed as `{recordIndex, compressedLength, decodedText}` and the viewer simply lists them. Sub-message extraction is deferred.

## Open question: `msg.hdr` encoding

5102 bytes. First word = `0x02ce` = 718. Doesn't divide cleanly into 4/6/8-byte records when treated as `header + entries`. Format is unresolved.
