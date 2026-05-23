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
  | 'treasure'
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
    title: 'The 3D Wall Renderer Lives In Six Overlays',
    tags: ['dialogue', 'treasure', 'combat', 'engine', 'quirk', 'maze'],
    pitch:
      'Wiz6 carries six independent copies of the same 2192-byte 3D wall-rendering code — dungeon-traversal original plus mirror copies in the NPC dialogue, chest encounter, combat loop, combat-action-execution, and combat-action-selection overlays. Constants hand-copied across all six.',
    body: (
      <>
        <ProseRow>
          When you talk to an NPC, the corridor stays drawn behind the
          dialogue panel. When you open a chest, the corridor stays drawn
          behind the chest UI. When combat starts, the corridor stays drawn
          behind the combat layout. None of these overlays take over the
          screen — they composite on top of the dungeon view. So each one
          ships <em>its own</em> copy of the 3D wall-rendering code:
        </ProseRow>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Overlay</th>
              <th>Used when</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><Code>wmaze.ovr</Code></td><td>Walking around the dungeon (the canonical copy)</td></tr>
            <tr><td><Code>wmnpc.ovr</Code></td><td>An NPC dialogue is open over the corridor</td></tr>
            <tr><td><Code>wtrea.ovr</Code></td><td>A chest UI is open over the corridor</td></tr>
            <tr><td><Code>wmele.ovr</Code></td><td>Combat-round redraw backdrop</td></tr>
            <tr><td><Code>wmexe.ovr</Code></td><td>Combat-action-execution backdrop</td></tr>
            <tr><td><Code>wpops.ovr</Code></td><td>Combat-action-selection backdrop</td></tr>
          </tbody>
        </table>
        <ProseRow>
          All six copies:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>Read the same wall-bitmaps at <Code>*0x4faa + 0x43a</Code> and <Code>+0x49a</Code>.</li>
          <li>Apply the same facing-rotation math.</li>
          <li>Use <em>identical</em> hardcoded pixel coordinates — <Code>0x48</Code>, <Code>0xf8</Code>, <Code>0x7a</Code>, <Code>0x82</Code>, and others.</li>
        </ul>
        <ProseRow>
          The constants aren't shared via a header or data table — they're
          hand-copied into all six files. Any tweak to wmaze's wall
          positions would silently desync the other five views unless
          someone hand-edited every copy. The original developers almost
          certainly noticed this and just lived with it: maybe the cost of
          overlay-to-overlay code sharing was higher than the cost of six
          synchronized copies, on a platform where every byte of overlay
          space was budgeted.
        </ProseRow>
        <Aside title="The port's chance">
          We can do better here than the original. The wall-render math
          should live in <Code>@wiz6/parser</Code> exactly once; the six
          overlay contexts just call into it. No drift possible.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/re/wmnpc-npc-dialogue.md' },
      { label: 'wmaze-functions.md', href: '/explore/docs/re/wmaze-functions.md' },
      { label: 'wtrea-treasure.md', href: '/explore/docs/re/wtrea-treasure.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'trap-misidentify-equals-critical-fail',
    title: 'Picking The Wrong Trap Name Is A Critical Fail',
    tags: ['treasure', 'design-choice', 'undocumented'],
    pitch:
      'Disarming a chest trap requires picking the correct trap name from a list of candidates first. Guessing wrong sets the trap off — same outcome as botching the dice roll. The penalty for not knowing the game is identical to the penalty for failing the skill check.',
    body: (
      <>
        <ProseRow>
          When the player chooses DISARM at a chest in Wiz6, the engine
          presents a list of candidate trap names. The player has to pick
          which one is actually present before the disarm roll even happens.
        </ProseRow>
        <ProseRow>
          The dispatch is brutal:
        </ProseRow>
        <CodeBlock>
{`if guess != actual_trap:
    return -1                ; CRITICAL FAIL — trap auto-triggers
else:
    score = thief_skill/2 + dex/2 + level - depth*2 + class_bonus
    score = clamp(score, 5, 95)
    roll = rng(100)
    if roll < score:                            SUCCESS
    if roll > 100 - (100 - score)/3 or roll > 94:  CRITICAL FAIL
    else:                                        MISS (no progress, no trap)`}
        </CodeBlock>
        <ProseRow>
          A miss is fine — the player just doesn't progress. A critical fail
          drops the trap on the party. <strong>Misidentifying the trap name
          is structurally identical to a critical fail.</strong> If the player
          guesses the wrong name from the candidate list, the trap goes off
          before any skill check even runs.
        </ProseRow>
        <ProseRow>
          A non-Thief who guesses wrong eats the trap; a non-Thief who guesses
          right and then rolls a miss gets a do-over. The penalty for not
          knowing the game is identical to the penalty for the worst possible
          dice roll. (This pairs interestingly with the Calfo word-puzzle
          mechanic below — Wiz6 wants you to <em>identify</em> the trap before
          you try to disarm it.)
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wtrea-treasure.md', href: '/explore/docs/re/wtrea-treasure.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'calfo-word-puzzle',
    title: 'Calfo Doesn\'t Reveal The Trap — It Builds A Word Puzzle',
    tags: ['treasure', 'design-choice', 'quirk'],
    pitch:
      'Each INSPECT or Calfo cast adds a few letters to a persistent display buffer — some real (rendered white), some fake decoys (rendered dark gray). Players see a partial word with mixed real and decoy letters and have to deduce the trap. Multiple casts compound; nothing guarantees a clean answer.',
    body: (
      <>
        <ProseRow>
          Naive understanding: the Calfo spell tells you the chest's trap.
          Reality: Calfo (and INSPECT — they call the same routine with
          different skill parameters) runs a multi-attempt letter-by-letter
          reveal that's much more interesting.
        </ProseRow>
        <ProseRow>
          Each invocation walks a persistent display buffer at <Code>*0x51bc</Code>:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>
            <strong>For each existing decoy slot</strong>: roll{' '}
            <Code>rng(100)</Code>. If it passes a skill gate, try to "promote"
            the decoy to a real letter — but only if the real trap name
            actually contains that character.
          </li>
          <li>
            <strong>For each remaining reveal allowance</strong>: roll again.
            On a success, add a random character from the real trap name
            (rendered as color 6, <strong>white</strong>). On a failure, add a
            random decoy letter <Code>rng(26) + 'A'</Code> (rendered as color
            12, <strong>dark gray</strong>).
          </li>
        </ul>
        <ProseRow>
          The state persists across multiple casts. The player sees a partial
          word with white and dark letters interleaved, and has to guess the
          trap from incomplete information. Subsequent casts can fill in more
          real letters and replace some decoys — but a low-skill caster may
          add decoys faster than real letters surface, so the puzzle gets
          <em> worse </em> the more you try.
        </ProseRow>
        <Aside title="What this means">
          Calfo isn't a "skill check that returns true / false." It's a
          structured information game. Players who learned to play it well
          (cast high-skill characters, learn to read partial reveals, take
          calculated risks on the guess) were rewarded; players who treated
          it as a yes/no roll were repeatedly mauled by traps they'd
          misidentified.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wtrea-treasure.md', href: '/explore/docs/re/wtrea-treasure.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'tpk-loot-forfeit',
    title: 'Wipe On The Killing Blow And You Forfeit The Loot',
    tags: ['treasure', 'combat', 'design-choice', 'quirk'],
    pitch:
      'The post-combat loot rolls happen first, then the alive-count check happens. If everyone died killing the last monster, the engine rolls treasure and then throws it away because nobody is alive to claim it.',
    body: (
      <>
        <ProseRow>
          When combat ends in a victory, the engine drops into post-combat
          state 0x0f, which rolls the loot table. The distribution loop:
        </ProseRow>
        <CodeBlock>
{`alive = sum(1 for c in party if c.status == 0)
if alive == 0:
    *0x363a = 8     ; graveyard (winit.ovr 0xdf6)
    return          ; skip distribution entirely
else:
    divide_gold(alive)
    award_xp_full(each_alive_character)
    insert_items_into_inventory(...)`}
        </CodeBlock>
        <ProseRow>
          If your party wipes mid-combat against the killing blow that drops
          the last monster, the engine still rolls the loot table — and then
          forfeits everything because nobody's alive to claim it. You go to
          the graveyard with the same dead party <em>and</em> with no
          consolation prize for the encounter you technically won.
        </ProseRow>
        <ProseRow>
          The fix on the engine side: keep at least one party member alive
          through the kill-the-last-monster moment. The fix on the player
          side: don't take the last hit on the last monster with a sliver of
          HP unless you're sure your front-liners can soak.
        </ProseRow>
        <Aside title="Did the rolls actually happen?">
          They did — they just got discarded. The engine doesn't roll
          conditionally; it rolls unconditionally and then checks who's alive.
          So there's a deterministic-RNG argument for save-scumming the
          combat to play out differently, since the loot rolls themselves
          consumed RNG state.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wtrea-treasure.md', href: '/explore/docs/re/wtrea-treasure.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'combat-initiative-countdown',
    title: 'Wiz6 Combat Is A 100-Down Initiative Tick, Not A Turn Queue',
    tags: ['combat', 'design-choice', 'undocumented'],
    pitch:
      'Combat doesn\'t sort combatants by initiative and step through them in order. The engine counts down from 100, firing every combatant whose initiative byte matches the current tick — plus a random pause-jitter that staggers each action by 5–14 ticks. That\'s why Wiz6 fights feel like they\'re "winding up" rather than going around a table.',
    body: (
      <>
        <ProseRow>
          The naive understanding of combat: roll initiative, sort combatants
          by it, take turns in order. That's not what Wiz6 does. The engine
          runs:
        </ProseRow>
        <CodeBlock>
{`counter = 100
while counter > 0:
    for each combatant in all 7 groups:
        if combatant.initiative_byte == counter:
            fire_action(combatant)
    counter -= 1`}
        </CodeBlock>
        <ProseRow>
          So initiative is a continuous-time index from 100 down to 0, and a
          combatant whose initiative byte happens to land on 72 fires when
          the counter hits 72. Two combatants on the same initiative fire on
          the same tick.
        </ProseRow>
        <ProseRow>
          The interesting part: when an action becomes eligible, the engine
          introduces a random <strong>pause-jitter</strong>:
        </ProseRow>
        <CodeBlock>
{`counter -= rng(10) - 5    ; ±5 tick jitter on top of the base init`}
        </CodeBlock>
        <ProseRow>
          So the same character with init 72 fires somewhere between tick 67
          and tick 77 from one round to the next. This is the engine reason
          Wiz6 combat <em>feels</em> like a stagger of actions — not turns
          marching past, but moments of action separated by anticipation —
          even though no animation pause-loop explicitly causes it. The pause
          is in the counter math itself.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wmexe-action-execution.md', href: '/explore/docs/re/wmexe-action-execution.md' },
      { label: 'wmele-combat.md', href: '/explore/docs/re/wmele-combat.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'four-sub-action-queue',
    title: 'Fast Monsters Get Four Attacks Per Round (Hence Dragons)',
    tags: ['combat', 'design-choice', 'quirk'],
    pitch:
      'Every combatant has a 4-slot sub-action queue with four independent initiative bytes. A fast monster fires four times per round at four different ticks. That\'s how a single dragon can deliver a flurry of claw/claw/bite/tail-swipe in what feels like one action.',
    body: (
      <>
        <ProseRow>
          Each combatant in Wiz6 has a four-slot sub-action queue at offset{' '}
          <Code>+0x18..+0x1b</Code>, with four corresponding initiative
          values at <Code>+0x192..+0x195</Code>. The initiative tick loop
          checks all four for every combatant on every counter step.
        </ProseRow>
        <ProseRow>
          A slow combatant — most player characters with one melee attack —
          uses slot 0 only; the other three init bytes are 0 (never match
          the counter, never fire).
        </ProseRow>
        <ProseRow>
          A fast monster — a dragon with claw / claw / bite / tail-swipe —
          fills all four slots with different initiative values. Over the
          course of a single round it fires <strong>four times</strong>, at
          four spread-out ticks, hitting the party in succession.
        </ProseRow>
        <ProseRow>
          From the player's perspective: the dragon goes once and does four
          things. From the engine's perspective: the dragon was four
          independent combatants for four independent initiative checks.
          Combined with the random pause-jitter from the initiative card,
          this is why high-level Wiz6 monsters feel <em>relentless</em> —
          they're not "taking their turn"; they're injecting four actions
          into the round at four different moments.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wmexe-action-execution.md', href: '/explore/docs/re/wmexe-action-execution.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'morale-asymmetry',
    title: 'Party Morale Rolls Get 10× The Monster Reward',
    tags: ['combat', 'design-choice', 'arbitrary'],
    pitch:
      'On the same morale-check roll, the party draws from a {0, 5, 10, 20, 40} bucket while monsters draw from {0, 0, 1, 2, 4}. A structural bias in the player\'s favor, baked into the engine.',
    body: (
      <>
        <ProseRow>
          When a morale event fires (a character is killed, a monster gets
          critical-hit, the party flees, etc.), the engine rolls a single
          random index and looks up the reward in one of two tables — one
          for party characters, one for monsters:
        </ProseRow>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Roll outcome</th>
              <th>Party gets</th>
              <th>Monster gets</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Common</td><td>0</td><td>0</td></tr>
            <tr><td>Less common</td><td>5</td><td>0</td></tr>
            <tr><td>Rare</td><td>10</td><td>1</td></tr>
            <tr><td>Rarer</td><td>20</td><td>2</td></tr>
            <tr><td>Rarest</td><td>40</td><td>4</td></tr>
          </tbody>
        </table>
        <ProseRow>
          On the same underlying roll, the party can get up to <strong>10×
          the morale boost</strong> a monster gets. Combined with the way
          morale gates fleeing, surrender, and berserker-style temporary
          attack bonuses, this is a structural party-favoring bias.
          Monsters never get the spikes that turn fights around; players
          do.
        </ProseRow>
        <Aside title="A design choice, not a bug">
          The asymmetric tables are intentional — they're separate lookups,
          not a single shared table accidentally indexed wrong. Sir-Tech
          deliberately stacked the morale system in the player's favor,
          presumably because Wiz6 was already mean enough.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wmexe-action-execution.md', href: '/explore/docs/re/wmexe-action-execution.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'animation-queue-crash',
    title: 'The 12-Slot Animation Queue Will Hang The Game If You Overflow It',
    tags: ['combat', 'bug', 'engine'],
    pitch:
      'wmexe.ovr\'s animation queue has a hardcoded 12-slot limit and no overflow guard. A combat round that tries to enqueue more than 12 animations falls into an infinite play_sound(0) loop and never returns. A genuine bug that ships in the game.',
    body: (
      <>
        <ProseRow>
          During combat, hits, spell effects, status-flag flashes, and
          morale visuals all get pushed into an animation queue with{' '}
          <strong>12 fixed slots</strong>. The push routine in{' '}
          <Code>wmexe_animation_queue_push</Code> at <Code>0x1cd5</Code> has
          no overflow guard:
        </ProseRow>
        <CodeBlock>
{`for slot in 0..11:
    if queue[slot].empty:
        queue[slot] = new_anim
        return
; fell off the end — no slot found
while true:
    play_sound(0)         ; plays nothing audible
; never returns`}
        </CodeBlock>
        <ProseRow>
          When the queue is full, the function infinite-loops on{' '}
          <Code>play_sound(0)</Code> — which doesn't play anything audible.
          The game hangs silently. No crash, no error message, just a
          freeze. The same pattern appears in the 30-slot sprite-queue push
          at <Code>0x9978</Code>.
        </ProseRow>
        <ProseRow>
          A combat round that tries to enqueue more than 12 animations will
          hit this. The situations that produce that many animations are
          rare in normal play — most combat encounters never come close —
          but a large AoE spell hitting many monsters with elaborate visual
          effects, or a chain of status applications across a full enemy
          group, can plausibly land you there.
        </ProseRow>
        <Aside title="The bug is real, and it ships">
          Sir-Tech presumably either never triggered this or never noticed
          because the bug is silent. Players who experienced "the game just
          froze in combat one time" with no other explanation almost
          certainly hit this. The port will fix it by either growing the
          queue, dropping overflow anims, or rendering directly without
          queuing.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wmexe-action-execution.md', href: '/explore/docs/re/wmexe-action-execution.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'combat-back-reset-navigator',
    title: 'Wiz6 Lets You Walk Back The Whole Combat Round',
    tags: ['combat', 'design-choice'],
    pitch:
      'Action selection in combat is a stack, not a queue. You can press BACK to undo any character\'s pick and RESET to clear the whole round. Uncommon player-forgiveness UX for a 1990 CRPG.',
    body: (
      <>
        <ProseRow>
          When you pick actions for your party at the start of a combat
          round, most contemporary CRPGs of the era committed each pick
          immediately. Bard's Tale, Might & Magic, Wizardry I-IV — once you
          pressed the action key for a character, that pick was locked.
          Misclick on character #3 with a healing spell selected when you
          meant attack? Live with it.
        </ProseRow>
        <ProseRow>
          Wiz6 doesn't work that way. The action picker in{' '}
          <Code>wpops.ovr</Code> maintains a per-character stack-frame
          indexed by slot. The navigator UI supports:
        </ProseRow>
        <ul className={styles.bullets}>
          <li><strong>BACK</strong> — undo the previous character's choice; the cursor moves back to them.</li>
          <li><strong>RESET</strong> — clear every pick in the current round; restart from character 1.</li>
        </ul>
        <ProseRow>
          Until every character has confirmed an action, the player can
          revise earlier picks at any time. The implementation cost is
          small — one extra per-character stack-frame in BSS — but the
          player-experience consequence is significant: no rage-quitting
          because you fat-fingered character #3.
        </ProseRow>
        <Aside title="Why this matters as a design choice">
          This is a deliberate decision that contemporary games skipped to
          save memory or development time. Wiz6 spent the bytes. The result
          is a combat UX that feels modern in a way the rest of the game's
          UI conspicuously doesn't.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpops-action-selection.md', href: '/explore/docs/re/wpops-action-selection.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'spell-picker-shows-unaffordable',
    title: 'The Spell Picker Shows Spells You Can\'t Afford',
    tags: ['combat', 'design-choice', 'undocumented'],
    pitch:
      'When a caster picks SPELL in combat, the picker shows every spell they know — including ones they don\'t have mana for, rendered greyed. Picking a greyed spell still tries to cast it (and silently fails). Designed pedagogy: the player learns what spells exist by seeing them.',
    body: (
      <>
        <ProseRow>
          The naive UI: only show spells the caster has mana for. Cleaner,
          shorter list, no wasted clicks. Wiz6 doesn't do this.
        </ProseRow>
        <ProseRow>
          The combat spell picker shows <strong>every spell the character
          knows</strong>. Spells the caster can't afford are rendered
          greyed but remain selectable. Picking a greyed spell triggers a
          cost check at action-execution time — and silently fails (or
          pops up an error) if mana is insufficient.
        </ProseRow>
        <ProseRow>
          This is <strong>designed pedagogy</strong>. A new Bishop with 20
          MP can see "oh, I'll get Tiltowait at higher levels — that's the
          end of the picker, that's what I'm working toward." Hiding
          unaffordable spells would have been simpler and probably
          cheaper to implement, but worse for the player's mental model of
          their character's spell repertoire. Sir-Tech made the player-
          knowledge choice over the UI-cleanliness choice.
        </ProseRow>
        <Aside title="A note on the underlying bug">
          The cast-time mana check has{' '}
          <a href="#two-palettes-never-used">an underflow bug</a> (no
          clamp; can go negative). But the picker's display layer is
          innocent of that bug — it just lets you select. The mana
          accounting that breaks is downstream, in <Code>wmexe</Code>.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpops-action-selection.md', href: '/explore/docs/re/wpops-action-selection.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'monster-prejudice-table',
    title: 'Monsters Have A Three-Slot Grudge List That Sometimes Targets Each Other',
    tags: ['combat', 'design-choice', 'quirk'],
    pitch:
      'Every monster type has a 3-byte "prejudice" table identifying other monster types it likes to target. The target picker rolls a slot and may fire on another monster group instead of the party. That\'s why mixed encounters sometimes turn into intra-monster brawls.',
    body: (
      <>
        <ProseRow>
          Each monster type in Wiz6 has a 3-byte field at offset{' '}
          <Code>+0x80..+0x82</Code> in its data record. Each byte is
          either zero (target the party) or another monster type ID
          (target a group of that type if present). Call it the prejudice
          table.
        </ProseRow>
        <ProseRow>
          When a monster picks a target, the engine runs:
        </ProseRow>
        <CodeBlock>
{`slot = rng(3)               ; pick one of the three prejudice slots
if prejudice[slot] == 0:
    target = party            ; default behavior
else:
    target = first_present_group_of_type(prejudice[slot])
    if target is None:
        target = party        ; fallback
`}
        </CodeBlock>
        <ProseRow>
          So if encounters spawn multiple monster types and at least one
          type's prejudice table references another <em>present</em> type,
          those monsters will start swinging at each other instead of the
          party. Players who've seen the orcs gang up on the demon, or
          the dragons turn on the rogues, were watching the prejudice
          table at work.
        </ProseRow>
        <ProseRow>
          Mechanically this is a passive "let the enemies fight"
          opportunity — bringing a mixed group of monsters together can
          sometimes thin them for you. The mechanic isn't documented, but
          it's discoverable: if you keep seeing one type of monster die
          first without your party touching it, you're seeing prejudice.
        </ProseRow>
        <Aside title="A latent infinite-loop risk">
          If a monster's prejudice table is all zeros — never happens with
          shipped data, but possible in modded scenarios — the target
          loop has no termination guarantee in some code paths. The
          shipped game presumably avoids the case, but the bug is
          structurally present.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpops-action-selection.md', href: '/explore/docs/re/wpops-action-selection.md' },
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
  'treasure',
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
