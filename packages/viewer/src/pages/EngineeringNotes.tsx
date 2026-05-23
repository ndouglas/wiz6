import { useMemo, useState } from 'react';
import styles from './EngineeringNotes.module.css';

type Tag =
  | 'bug'
  | 'design-choice'
  | 'quirk'
  | 'arbitrary'
  | 'undocumented'
  | 'combat'
  | 'character-creation'
  | 'character-progression'
  | 'dialogue'
  | 'palette'
  | 'audio'
  | 'maze'
  | 'intro'
  | 'engine';

interface Note {
  id: string;
  title: string;
  tags: Tag[];
  /** One-sentence elevator pitch. Used in the card preview + as the page's TOC summary. */
  pitch: string;
  /** Card body — React content, free-form. */
  body: React.ReactNode;
  /** Optional links to canonical docs / source files. */
  seeAlso?: Array<{ label: string; href: string }>;
}

function ProseRow({ children }: { children: React.ReactNode }) {
  return <p className={styles.prose}>{children}</p>;
}

function Aside({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <aside className={styles.aside}>
      {title && <div className={styles.asideTitle}>{title}</div>}
      <div>{children}</div>
    </aside>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className={styles.codeInline}>{children}</code>;
}

function CopyPermalinkButton({ noteId, title }: { noteId: string; title: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}${window.location.pathname}#${noteId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available (e.g. http on non-localhost) — fall back to a textarea trick
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* swallow; nothing more we can do */
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <button
      type="button"
      className={`${styles.permalinkBtn} ${copied ? styles.permalinkBtnCopied : ''}`}
      onClick={handleCopy}
      aria-label={`Copy permalink to "${title}"`}
      title={copied ? 'Copied!' : 'Copy permalink'}
    >
      {copied ? '✓ Copied' : '🔗'}
    </button>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className={styles.codeBlock}>{children}</pre>;
}

const NOTES: Note[] = [
  // -------------------------------------------------------------------
  {
    id: 'bonus-point-lottery',
    title: 'The Bonus-Point Lottery',
    tags: ['character-creation', 'design-choice', 'quirk'],
    pitch:
      'Wiz6 character creation hides a two-tier 1-in-20 lottery on top of a uniform 5–10 roll. The elite-eligible result lands at 0.25% — and certain values are mathematically unreachable.',
    body: (
      <>
        <ProseRow>
          When you roll up a new character, the game shows a “bonus points” pool you
          can spend to raise attributes. The pool size, despite looking smooth, is
          actually a small mixture of two independent Bernoulli trials:
        </ProseRow>
        <CodeBlock>
{`bonus = 5 + rng(6)             ;  5..10 uniform
if rng(20) == 0:  bonus += 8   ;  independent 1-in-20
if rng(20) == 0:  bonus += 8   ;  another independent 1-in-20`}
        </CodeBlock>
        <ProseRow>
          The three buckets that result:
        </ProseRow>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Outcome</th>
              <th>Range</th>
              <th>Probability</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>No bonus (most common)</td><td>5–10</td><td>(19/20)² = <strong>90.25%</strong></td></tr>
            <tr><td>One +8 bonus</td><td>13–18</td><td>2·(1/20)·(19/20) = <strong>9.50%</strong></td></tr>
            <tr><td>Both +8 bonuses (jackpot)</td><td>21–26</td><td>(1/20)² = <strong>0.25%</strong></td></tr>
          </tbody>
        </table>
        <ProseRow>
          To qualify for an elite class — Samurai, Lord, Ninja, Bishop — you need
          roughly <strong>19+ bonus points</strong> on top of meeting raw attribute
          prerequisites. The +8 quantization sitting on top of a 5–10 base means{' '}
          <strong>values 11, 12, 19, and 20 are unreachable</strong>. There are dead
          zones in the distribution.
        </ProseRow>
        <ProseRow>
          P(bonus ≥ 19) = 1/400. So an average elite roll takes roughly 400 attempts.
          Wiz6 expects a six-character party. Hence the famous re-roll grind — folks
          sat there for hours hoping the second 1/20 would hit.
        </ProseRow>
        <Aside title="Buried debug switch">
          There's a hidden override at <Code>*0x56ce</Code>: if that word is set to{' '}
          <Code>1</Code> the roller skips the lottery and forces{' '}
          <Code>bonus = 21</Code>. The clearing-write for the flag is in the
          character-creation overlay; the <em>setting</em> site is elsewhere — almost
          certainly a developer cheat code we haven't traced. Someone at Sir-Tech had
          mercy on themselves during testing.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpcmk-character-creation.md', href: '/explore/docs/re/wpcmk-character-creation.md' },
      { label: 'findings JSON', href: '/explore/docs/re/findings/wpcmk-naming-pass.json' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'class-change-tax',
    title: 'The Hidden Class-Change Tax',
    tags: ['character-progression', 'design-choice', 'undocumented'],
    pitch:
      'Changing class costs you your level and your XP — that part is documented. The hidden cost is a saved old-level cap that throttles every stat, HP, and skill gain on the way back up.',
    body: (
      <>
        <ProseRow>
          When a Wiz6 character changes class, the engine takes three visible actions:
          level reset to 1, XP wiped to zero, and a fresh class assigned. That's what
          the manual tells you. What it <em>doesn't</em> tell you: the engine also
          saves your previous level in <Code>*0x4597</Code>.
        </ProseRow>
        <ProseRow>
          Six different functions consult that saved value:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>HP/SP regen (<Code>derived_hp_sp_regen</Code>)</li>
          <li>AC recompute (<Code>derived_ac</Code>)</li>
          <li>Level-up driver (<Code>level_up_apply</Code>)</li>
          <li>Skill apply (<Code>skill_apply_growth</Code>)</li>
          <li>Skill rolls (<Code>skill_roll_check</Code>)</li>
          <li>Spell-list display (<Code>spell_list_render</Code>)</li>
        </ul>
        <ProseRow>
          Each one throttles gains until your current level catches back up to the
          saved old-level. So when you change class, you don't just lose your levels —
          you grind through them a second time with massively reduced stat, HP, and
          skill gains the entire way back up to where you used to be.
        </ProseRow>
        <Aside title="The takeaway">
          Class change in Wiz6 is presented as a choice; the engine treats it as a
          mistake. The undocumented tax is several times more punishing than the
          visible cost. Players who change class at high level are paying for that
          decision continuously, every level, for the duration of the catch-up grind.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpcvw-character-view.md', href: '/explore/docs/re/wpcvw-character-view.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'faerie-tax',
    title: 'The Faerie Race Pays a Penalty In Three Places',
    tags: ['character-progression', 'design-choice', 'arbitrary'],
    pitch:
      'Faerie characters get a -2 AC bonus and a -1 level cap and a separate HP/SP regen penalty. The race is hard-coded into three independent engine paths.',
    body: (
      <>
        <ProseRow>
          Faerie is race index 5 in Wiz6's race table. Three different engine
          functions check <Code>race == 5</Code> and apply special-case modifiers,
          rather than reading the modifiers from a per-race data table:
        </ProseRow>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Function</th>
              <th>Effect for Faeries</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><Code>derived_ac</Code></td><td>AC -2 (better AC; this is the compensation)</td></tr>
            <tr><td><Code>derived_hp_sp_regen</Code></td><td>Separate flat negative modifier on HP/SP gain</td></tr>
            <tr><td>Level cap calc</td><td>-1 level cap relative to other races in the same class</td></tr>
          </tbody>
        </table>
        <ProseRow>
          Mechanically: small AC win, smaller HP pool, lower level cap. The race's
          other attributes (raw stats, agility scaling, spell potential) have to
          carry the player past the deficit.
        </ProseRow>
        <ProseRow>
          The interesting bit is that this is <em>baked in</em>, not table-driven.
          Other races' modifiers are looked up from per-race data; Faerie is special-
          cased in three separate places. Likely an artifact of feature evolution —
          the race got tuned post-data-format-freeze.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wpcvw-character-view.md', href: '/explore/docs/re/wpcvw-character-view.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'stat-creep-three-try-filter',
    title: 'Why Your Last Attribute Creeps Up But Doesn\'t Lock',
    tags: ['character-progression', 'design-choice', 'quirk'],
    pitch:
      'On level-up the stat roller picks 3 attributes with rng(7) and tries to bump them. When 6 of 7 are capped at 18, the last one bumps roughly 82% of the time. Hence the slow ascent, never the certain one.',
    body: (
      <>
        <ProseRow>
          Wiz6's stat increases on level-up are not deterministic and they don't
          have a "you have N points to spend" UI. They roll. Here's the actual loop:
        </ProseRow>
        <CodeBlock>
{`for k in 0..3:
  i = rng(7)
  if attr[i] < 18 and not seen[i]:
    attr[i] += 1
    seen[i] = true

while rng(2) == 0:
  retry one more attribute`}
        </CodeBlock>
        <ProseRow>
          Three guaranteed attempts plus a Bernoulli tail (each retry has a 50%
          chance to continue). The <Code>seen[]</Code> set prevents one stat from
          getting bumped twice on the same level-up — once it's selected, it's out
          of the pool for this level.
        </ProseRow>
        <ProseRow>
          The interesting consequence: when 6 of your 7 attributes are capped at 18,
          the one remaining gets selected with probability 3/7 ≈ 43% per pull. Over
          3 pulls, that's ~82% chance per level of bumping the last attribute. So
          late-game characters with one un-maxed stat see it creep upward most levels —
          but not <em>every</em> level. The deliberately stochastic ascent is by
          design.
        </ProseRow>
        <Aside title="And about that 'while rng(2) == 0'">
          The tail loop terminates with probability 1, but it's a geometric
          distribution — most rolls do nothing extra, but you'll occasionally see a
          character get 5 or 6 attribute increases in a single level-up. Always
          legal; always rare; never explained in the manual.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpcvw-character-view.md', href: '/explore/docs/re/wpcvw-character-view.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'npc-keyword-synonyms',
    title: 'NPC Dialogue Has Synonyms But Not Typos',
    tags: ['dialogue', 'design-choice', 'undocumented'],
    pitch:
      'The Wiz6 NPC parser silently expands GET → TAKE, DRAGON → WYRM, HELLO → HI. A 38-entry alias table normalizes player input before any keyword lookup runs. But TAEK never matches anything — it handles canonical alternatives, not edit-distance.',
    body: (
      <>
        <ProseRow>
          When you type a word at a Wiz6 NPC, the engine doesn't immediately look it
          up. First, it normalizes. A <strong>38-entry × 50-byte</strong> keyword
          table at runtime <Code>BSS 0x6316</Code> holds slash-delimited synonym
          lists, populated from <Code>MSG.DBS</Code> at startup:
        </ProseRow>
        <CodeBlock>
{`"GET/TAKE/GRAB/PICK UP/TAKE"
"HELLO/HI/GREETINGS/HELLO"
"DRAGON/WYRM/SERPENT/DRAGON"
(... 35 more)`}
        </CodeBlock>
        <ProseRow>
          The parser iterates every entry, extracts each slash-delimited token,
          and <Code>strncmp</Code>s against the input. On hit, it copies the{' '}
          <em>last</em> token of the entry over the input. So GET / TAKE / GRAB all
          collapse to TAKE before any dialogue logic looks anything up.
        </ProseRow>
        <ProseRow>
          What this means in practice:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>Synonyms work — players don't need to know the NPC's exact keyword.</li>
          <li>Typos don't — TAEK isn't an alias of TAKE, so it doesn't match anything.</li>
          <li>The vocabulary is bounded — 38 entries split between verbs and nouns,
          shared across every NPC in the game. All dialogue draws from a finite set.</li>
        </ul>
        <Aside title="The aging engineering view">
          1990's "good enough" natural language: handle the variations the writers
          could enumerate, ignore everything else. No fuzzy matching, no
          Levenshtein, just a hand-curated alias table. Players who tried odd
          synonyms occasionally got rewarded; players with typos got nowhere.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/re/wmnpc-npc-dialogue.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'npc-cumulative-bribery',
    title: 'NPCs Remember Every Gold Piece You Hand Them (For This Encounter)',
    tags: ['dialogue', 'design-choice', 'undocumented'],
    pitch:
      'Gifting an NPC gold doesn\'t just earn a one-shot reaction bump. A 32-bit running total accumulates across the encounter, and crossing each of 7 secret thresholds unlocks a previously-hidden dialogue option.',
    body: (
      <>
        <ProseRow>
          When you GIVE an NPC gold, the engine doesn't just check the current
          gift's value. It runs an{' '}
          <Code>adc</Code> (add-with-carry) into a 32-bit accumulator at{' '}
          <Code>*0x52cc</Code> / <Code>*0x52ce</Code>. The running total persists
          for the duration of the encounter.
        </ProseRow>
        <ProseRow>
          A <strong>7-entry threshold table</strong> at <Code>*0x5156</Code> holds
          gold values. Each time the cumulative total crosses one of these
          thresholds, a "type-2 trigger" fires and unlocks a previously-hidden
          dialogue option. The NPC reveals something they wouldn't have told you
          if you'd just dropped one big gift on them — or rather, that they
          wouldn't have told you for any single payment below the threshold.
        </ProseRow>
        <ProseRow>
          The accumulator is zeroed by <Code>wmnpc_encounter_init</Code>, so the
          memory is <strong>per-encounter</strong>, not lifetime. You can't
          drip-feed the same NPC across multiple visits to slowly unlock secrets.
          But within one conversation, multiple small gifts compound — three
          50-gold gifts unlock the same option as one 150-gold gift.
        </ProseRow>
        <Aside title="Buried mechanic">
          This was never documented. Players who intuited it ("maybe gold counts
          add up?") and tested it found the unlocks; players who didn't never
          saw the hidden options. The kind of mechanic that made Wiz6 feel
          mysterious in a way modern games don't try to be.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/re/wmnpc-npc-dialogue.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'npc-charm-save-scum-penalty',
    title: 'The Charm Roll That Punishes Reload-Spammers',
    tags: ['dialogue', 'design-choice', 'undocumented'],
    pitch:
      'Every charm attempt in an encounter gets ~10 harder than the previous one — and a critical-failed charm permanently drops the NPC\'s reaction AND forces combat. Save-scum at your peril.',
    body: (
      <>
        <ProseRow>
          The base charm score in Wiz6 is unsurprising:
        </ProseRow>
        <CodeBlock>
{`score = (level - npc_threshold) * 5
      + skill[18] / 2            ; persuasion skill
      + class_bonus
      + CHA
      + reaction / 4
      - 10
score = clamp(score, 0, 95)`}
        </CodeBlock>
        <ProseRow>
          The roll is where it gets mean. The engine keeps a cumulative penalty
          at <Code>*0x5892</Code> that survives across charm attempts within the
          same encounter:
        </ProseRow>
        <CodeBlock>
{`penalty = *0x5892
penalty += rng(10) + 5         ; +5..14 per attempt, compounding
roll = rng(100) + penalty
*0x5892 = penalty              ; persist back`}
        </CodeBlock>
        <ProseRow>
          So the second charm attempt is ~10 harder than the first. The third is
          ~10 harder than the second. The state lives in volatile memory, not in
          the save file, so reloading a save doesn't reset it — but it also
          doesn't help much, because the penalty only zeroes on a <em>fresh</em>{' '}
          encounter, which most NPCs don't let you trigger twice.
        </ProseRow>
        <ProseRow>
          The worse outcome: the critical-failure branch (<Code>2*roll &lt; score</Code>{' '}
          — a hard miss, not just an ordinary failure) does <em>two</em>{' '}
          punishing things:
        </ProseRow>
        <ul className={styles.bullets}>
          <li><Code>reaction -= rng(25) + 25</Code> — the NPC's permanent reaction drops by 25-49.</li>
          <li><Code>*0x363a = 10</Code> — force a transition into combat (wmele state 0xa).</li>
        </ul>
        <ProseRow>
          A single botched charm can turn a previously-peaceful NPC permanently
          hostile <em>and</em> drop you straight into combat against them. The
          engine's most punishing dialogue branch isn't documented anywhere — it
          just exists, waiting.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/re/wmnpc-npc-dialogue.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'npc-duplicated-renderer',
    title: 'The Dialogue View Has Its Own Copy Of The Dungeon Renderer',
    tags: ['dialogue', 'engine', 'quirk', 'maze'],
    pitch:
      'When an NPC dialogue opens, the corridor stays visible behind it. So wmnpc ships a 2192-byte copy of wmaze\'s 3D wall-rendering code — same constants, hand-duplicated. A maintenance hazard the original devs noticed and didn\'t fix.',
    body: (
      <>
        <ProseRow>
          Wiz6's NPC dialogue panel doesn't take over the whole screen. The
          corridor view stays drawn behind it — the NPC stands "in front of"
          the player in the dungeon. To draw that view, <Code>wmnpc.ovr</Code>{' '}
          ships its own copy of <Code>wmaze.ovr</Code>'s 3D wall-rendering code.
          2192 bytes of it.
        </ProseRow>
        <ProseRow>
          This copy:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>Reads the same wall-bitmaps at <Code>*0x4faa + 0x43a</Code> and <Code>+0x49a</Code>.</li>
          <li>Applies the same facing-rotation math.</li>
          <li>Uses <em>identical</em> hardcoded pixel coordinates — <Code>0x48</Code>, <Code>0xf8</Code>, <Code>0x7a</Code>, <Code>0x82</Code>, and others.</li>
        </ul>
        <ProseRow>
          The constants aren't shared via header or data table — they're
          hand-copied into both files. If anyone at Sir-Tech ever tweaked
          wmaze's wall positions without exactly-matching tweaks in wmnpc, the
          encounter view would render slightly different walls than the
          gameplay view. A continuity glitch waiting to happen, that nobody
          would notice in QA because nobody pays attention to the corridor
          behind an open dialogue box.
        </ProseRow>
        <ProseRow>
          The original developers presumably noticed this and just didn't
          refactor away from it — maybe the cost of overlay-to-overlay code
          sharing was higher than maintaining two copies. The port can do
          better: share the constants from a single source so the duplication
          can't drift.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/re/wmnpc-npc-dialogue.md' },
      { label: 'wmaze-functions.md', href: '/explore/docs/re/wmaze-functions.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'two-palettes-never-used',
    title: 'The Two Engine Palettes That Are Never Active',
    tags: ['palette', 'undocumented', 'quirk'],
    pitch:
      'wroot.exe carefully constructs two custom EGA palettes via INT 10h AX=1002h. We found both. Neither is active when the game actually draws anything we’ve looked at.',
    body: (
      <>
        <ProseRow>
          The Wiz6 binary contains two 17-byte palette tables at file offsets{' '}
          <Code>0x2043</Code> and <Code>0x2054</Code>, loaded into the EGA Attribute
          Controller by <Code>INT 10h AX=1002h</Code> calls at <Code>0x209B</Code> and{' '}
          <Code>0x2105</Code>. The first is mostly greens (we named it{' '}
          <Code>wiz6-main</Code>); the second is blue-leaning (<Code>wiz6-dungeon</Code>).
          Both look like deliberate custom palettes — they're not BIOS defaults.
        </ProseRow>
        <ProseRow>
          Calibration against in-game DOSBox-X captures says: when sprites and screens
          actually draw, the EGA hardware is still at its BIOS default palette. Neither
          custom palette is loaded yet — the engine sets them up, then doesn't seem to
          activate them during any gameplay scene we can currently render.
        </ProseRow>
        <ProseRow>
          What asset rendering <em>does</em> use is a permuted bit-pattern in the file
          format (the four EGA planes recombine into a four-bit index that's then
          shuffled through a 16-entry permutation table before palette lookup). The
          permutation handles the colour mapping; the custom palettes appear to be
          dead loaded weight in the boot path.
        </ProseRow>
        <Aside title="Open question">
          Which gameplay state actually exercises <Code>wiz6-main</Code> or{' '}
          <Code>wiz6-dungeon</Code>? A DOSBox-X runtime trace with{' '}
          <Code>int10 = debug</Code> walked through every menu, dungeon, combat, and
          NPC scene would resolve it. Tracked as <Code>#Q-F</Code> in{' '}
          <Code>TODO.md</Code>.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'palette-discovery.md', href: '/explore/docs/re/palette-discovery.md' },
      { label: 'palette-loads.json', href: '/explore/docs/re/findings/palette-loads.json' },
      { label: 'palette calibration tool', href: '/explore/calibrate' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'title-scroll-cpu-bound',
    title: 'The Title Scroll Ran At Different Speeds On Different CPUs',
    tags: ['intro', 'engine', 'quirk'],
    pitch:
      'Wiz6\'s intro timing is calibrated against the original CPU\'s busy-wait at boot. On a 486 it ran ~6 seconds wall-clock. On a 386 it ran much slower. There\'s no frame-time clock.',
    body: (
      <>
        <ProseRow>
          At boot, the engine sits in a tight busy-wait loop and measures how many
          iterations it can grind through in a fixed number of timer ticks. The
          measured rate gets stamped into two memory locations (<Code>*(CS:0x1FE2)</Code> and{' '}
          <Code>*(CS:0x1FE4)</Code>) and is used to scale every subsequent “wait N
          ticks” call throughout the game.
        </ProseRow>
        <ProseRow>
          On a 486DX/33 the effective tick rate was ~20 Hz. The title-credits scroll
          ran 126 iterations of a "60 Hz" frame loop — which, after the busy-wait
          calibration, was actually ~6 seconds of wall-clock time. On a slower 386,
          the same loop took noticeably longer. On a Pentium, it was over before you
          noticed it started.
        </ProseRow>
        <ProseRow>
          This is why we ported the intro for <em>byte parity</em> on the math, not{' '}
          <em>wall-clock parity</em> on the duration. The frame counts in the engine
          are deterministic; the durations were always a function of whatever
          hardware happened to be running it. DOSBox-X's <Code>cycles=fixed</Code>
          doesn't reproduce the calibration faithfully either, so even "the original
          in an emulator" is non-canonical for timing.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'startup-sequence.md', href: '/explore/docs/re/startup-sequence.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'twelve-facing-maze-four-facing-player',
    title: 'A 12-Facing Maze Hiding Behind a 4-Direction Player',
    tags: ['maze', 'design-choice', 'arbitrary'],
    pitch:
      'The dungeon stores wall data with 12-direction granularity. The player can only ever face N/E/S/W. The unused 8 facings are baked into every level file anyway.',
    body: (
      <>
        <ProseRow>
          When you walk around a Wiz6 dungeon, you can rotate in 90° steps. Four
          facings, total. The engine's rotation code in <Code>wmaze.ovr</Code>{' '}
          increments a counter by 1, modulo 4, and that's the player's facing.
        </ProseRow>
        <ProseRow>
          But the per-zone maze data structure on disk has{' '}
          <strong>12-entry</strong> lookup tables for "delta-X by facing" and "delta-Y
          by facing." Twelve facings, not four. The rotation-iterator code that
          consumes these tables uses <Code>(i+1) % 0xc</Code> — i.e. modulo 12.
        </ProseRow>
        <ProseRow>
          The most plausible explanation is a hex-grid map editor that predated the
          shipped four-facing player UI. The data format ships with 12-direction
          support; the gameplay code never uses 8 of them. Whatever was originally
          planned — hex movement, maybe, or 60° rotation — got cut, but the data
          format survived intact.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wmaze-functions.md', href: '/explore/docs/re/wmaze-functions.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'wpcmk-not-a-state',
    title: 'wpcmk Isn\'t a Game State — It\'s a Library',
    tags: ['character-creation', 'engine', 'design-choice'],
    pitch:
      'Every other Wiz6 overlay is a state handler with its own dispatch loop. The character-creation overlay is a one-way callable — its dispatch stub is a no-op that returns to the main menu.',
    body: (
      <>
        <ProseRow>
          Wiz6's game loop reads a state word at <Code>*0x363a</Code> and loads
          whichever overlay handles that state. <Code>winit.ovr</Code> handles
          0/1/2/8. <Code>wbase.ovr</Code> handles 4 (the main menu). <Code>wmaze.ovr</Code>{' '}
          handles 5/6/0x17 (dungeon traversal). <Code>wmele.ovr</Code> handles
          0x0a/0x0b/0x0e (combat). <Code>wpcvw.ovr</Code> handles 0x11/0x16
          (character view + post-combat level-up).
        </ProseRow>
        <ProseRow>
          <Code>wpcmk.ovr</Code> — the character-creation overlay — doesn't own any
          state at all. Its dispatch entry is a 14-byte stub that writes{' '}
          <Code>*0x363a = 4</Code> (return to the main menu) and returns. The actual
          character-creation UI is invoked by direct subroutine calls from{' '}
          <Code>wbase.ovr</Code>'s main-menu slot 5 handler. Synchronous library
          call, not a state transition.
        </ProseRow>
        <ProseRow>
          Even the overlay's <em>header</em> is structurally different — 16 bytes
          where every other overlay is 12 or 14. The format families are real and
          consistent with this distinction: state handlers have one header shape,
          libraries have another. It's a hint that the engine architects thought
          about this seriously, even if the difference isn't visible in the player's
          experience.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wpcmk-character-creation.md', href: '/explore/docs/re/wpcmk-character-creation.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'snd-format-bug-distribution',
    title: 'The .snd Decoder That Sounded Right And Played Noise',
    tags: ['audio', 'bug'],
    pitch:
      'For hours we chased LUT transforms and sample rates to fix the .snd Huffman decoder. Output looked perfect statistically — centred at 128, 32 quantized levels, plausible mean diff. The bug was 2 bytes of misalignment at the start.',
    body: (
      <>
        <ProseRow>
          Wiz6's sound effects use a Huffman-tree-compressed PCM format. We wrote a
          decoder; the output statistics looked exactly like real 8-bit audio —
          centred on 128, well-distributed amplitude, normal byte-to-byte diff. It
          sounded like white noise.
        </ProseRow>
        <ProseRow>
          We spent significant time chasing post-process transformations: was there
          a log-attenuation LUT? A sample-rate confusion? An AdLib loudness-index
          interpretation? Every angle gave a plausible-but-wrong hypothesis to test,
          because the bytes <em>looked</em> like real audio.
        </ProseRow>
        <ProseRow>
          The actual bug was structural: the on-disk format had a 2-byte length
          prefix the decoder wasn't accounting for, so every Huffman tree walk
          started 2 bytes into the bitstream. Every emitted sample was misaligned
          but had byte values in the right ballpark — because Huffman codes plus
          random bit positions still produce things that statistically resemble the
          source distribution.
        </ProseRow>
        <Aside title="The lesson">
          When output looks <em>structurally right</em> but behaves wrong, suspect
          alignment in the decoder, not interpretation downstream. Statistical
          plausibility is not correctness.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'snd-format.md', href: '/explore/docs/re/snd-format.md' },
    ],
  },
];

const ALL_TAGS: Tag[] = [
  'bug',
  'design-choice',
  'quirk',
  'arbitrary',
  'undocumented',
  'combat',
  'character-creation',
  'character-progression',
  'dialogue',
  'palette',
  'audio',
  'maze',
  'intro',
  'engine',
];

// Total cards per tag (independent of current filter selection). Computed at
// module scope since NOTES is static.
const TAG_COUNTS: Record<Tag, number> = (() => {
  const counts = Object.fromEntries(ALL_TAGS.map((t) => [t, 0])) as Record<Tag, number>;
  for (const note of NOTES) {
    for (const t of note.tags) counts[t]++;
  }
  return counts;
})();

export function EngineeringNotes() {
  const [activeTags, setActiveTags] = useState<Set<Tag>>(new Set());

  function toggleTag(t: Tag) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const visible = useMemo(() => {
    if (activeTags.size === 0) return NOTES;
    return NOTES.filter((n) => n.tags.some((t) => activeTags.has(t)));
  }, [activeTags]);

  return (
    <main className={styles.wrapper}>
      <header className={styles.header}>
        <h1>Engineering Notes</h1>
        <p className={styles.subtitle}>
          Notes on Wizardry VI as an <em>engineered artifact</em>. Mechanics, bugs,
          arbitrary decisions, weird quirks, and the consequences of each on how
          the game actually feels to play. Cards are independent — read in any
          order. The opening one is the most famous.
        </p>
      </header>

      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>Filter by tag:</span>
        {ALL_TAGS.map((t) => {
          const active = activeTags.has(t);
          const count = TAG_COUNTS[t];
          return (
            <button
              key={t}
              type="button"
              className={`${styles.tagFilter} ${active ? styles.tagFilterActive : ''}`}
              onClick={() => toggleTag(t)}
              disabled={count === 0}
            >
              <span>{t}</span>
              <span className={styles.tagCount}>{count}</span>
            </button>
          );
        })}
        {activeTags.size > 0 && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => setActiveTags(new Set())}
          >
            clear
          </button>
        )}
      </div>

      <nav className={styles.toc} aria-label="Notes contents">
        <span className={styles.tocLabel}>
          Jump to {activeTags.size > 0 ? `(${visible.length} of ${NOTES.length})` : `(${NOTES.length})`}:
        </span>
        <ul className={styles.tocList}>
          {visible.map((note) => (
            <li key={note.id} className={styles.tocItem}>
              <a href={`#${note.id}`} className={styles.tocLink}>{note.title}</a>
            </li>
          ))}
          {visible.length === 0 && (
            <li className={styles.tocEmpty}>nothing matches</li>
          )}
        </ul>
      </nav>

      <section className={styles.cards}>
        {visible.map((note) => (
          <article key={note.id} id={note.id} className={styles.card}>
            <header className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <h2>
                  <a href={`#${note.id}`} className={styles.anchorLink}>{note.title}</a>
                </h2>
                <CopyPermalinkButton noteId={note.id} title={note.title} />
              </div>
              <div className={styles.tagRow}>
                {note.tags.map((t) => (
                  <span key={t} className={styles.tag}>{t}</span>
                ))}
              </div>
            </header>
            <p className={styles.pitch}>{note.pitch}</p>
            <div className={styles.body}>{note.body}</div>
            {note.seeAlso && note.seeAlso.length > 0 && (
              <footer className={styles.seeAlso}>
                <span className={styles.seeAlsoLabel}>See also:</span>
                {note.seeAlso.map((link, i) => (
                  <span key={link.href}>
                    {i > 0 && <span className={styles.sep}> · </span>}
                    <a href={link.href}>{link.label}</a>
                  </span>
                ))}
              </footer>
            )}
          </article>
        ))}
        {visible.length === 0 && (
          <p className={styles.emptyState}>No cards match the selected tags.</p>
        )}
      </section>
    </main>
  );
}
