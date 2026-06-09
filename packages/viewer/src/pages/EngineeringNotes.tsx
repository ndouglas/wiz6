import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
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
  | 'engine'
  | 'reimplementation'
  | 'resolved-2026-05-25';

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
      { label: 'wpcmk-character-creation.md', href: '/explore/docs/wpcmk-character-creation.md' },
      { label: 'findings JSON', href: '/explore/docs/findings/wpcmk-naming-pass.json' },
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
      { label: 'wpcvw-character-view.md', href: '/explore/docs/wpcvw-character-view.md' },
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
      { label: 'wpcvw-character-view.md', href: '/explore/docs/wpcvw-character-view.md' },
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
      { label: 'wpcvw-character-view.md', href: '/explore/docs/wpcvw-character-view.md' },
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
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/wmnpc-npc-dialogue.md' },
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
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/wmnpc-npc-dialogue.md' },
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
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/wmnpc-npc-dialogue.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'npc-duplicated-renderer',
    title: 'The 3D Wall Renderer Lives In Seven Overlays',
    tags: ['dialogue', 'treasure', 'combat', 'engine', 'quirk', 'maze'],
    pitch:
      'Wiz6 carries seven independent copies of the same 2192-byte 3D wall-rendering code — the dungeon-traversal original plus mirror copies in every overlay that draws over the corridor: NPC dialogue, chest encounter, three combat states, and dungeon-cast / use-item. Hand-synchronized constants across all seven.',
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
            <tr><td><Code>wdopt.ovr</Code></td><td>Dungeon cast-spell / use-item backdrop</td></tr>
          </tbody>
        </table>
        <ProseRow>
          All seven copies:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>Read the same wall-bitmaps at <Code>*0x4faa + 0x43a</Code> and <Code>+0x49a</Code>.</li>
          <li>Apply the same facing-rotation math.</li>
          <li>Use <em>identical</em> hardcoded pixel coordinates — <Code>0x48</Code>, <Code>0xf8</Code>, <Code>0x7a</Code>, <Code>0x82</Code>, and others.</li>
        </ul>
        <ProseRow>
          The constants aren't shared via a header or data table — they're
          hand-copied into all seven files. Any tweak to wmaze's wall
          positions would silently desync the other six views unless
          someone hand-edited every copy. The original developers almost
          certainly noticed this and just lived with it: maybe the cost of
          overlay-to-overlay code sharing was higher than the cost of
          seven synchronized copies, on a platform where every byte of
          overlay space was budgeted.
        </ProseRow>
        <Aside title="The port's chance">
          We can do better here than the original. The wall-render math
          should live in <Code>@wiz6/parser</Code> exactly once; the seven
          overlay contexts just call into it. No drift possible.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wmnpc-npc-dialogue.md', href: '/explore/docs/wmnpc-npc-dialogue.md' },
      { label: 'wmaze-functions.md', href: '/explore/docs/wmaze-functions.md' },
      { label: 'wtrea-treasure.md', href: '/explore/docs/wtrea-treasure.md' },
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
      { label: 'wtrea-treasure.md', href: '/explore/docs/wtrea-treasure.md' },
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
      { label: 'wtrea-treasure.md', href: '/explore/docs/wtrea-treasure.md' },
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
      { label: 'wtrea-treasure.md', href: '/explore/docs/wtrea-treasure.md' },
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
      { label: 'wmexe-action-execution.md', href: '/explore/docs/wmexe-action-execution.md' },
      { label: 'wmele-combat.md', href: '/explore/docs/wmele-combat.md' },
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
      { label: 'wmexe-action-execution.md', href: '/explore/docs/wmexe-action-execution.md' },
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
      { label: 'wmexe-action-execution.md', href: '/explore/docs/wmexe-action-execution.md' },
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
      { label: 'wmexe-action-execution.md', href: '/explore/docs/wmexe-action-execution.md' },
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
      { label: 'wpops-action-selection.md', href: '/explore/docs/wpops-action-selection.md' },
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
          The cast-time mana check has an underflow bug (no
          clamp; can go negative). But the picker's display layer is
          innocent of that bug — it just lets you select. The mana
          accounting that breaks is downstream, in <Code>wmexe</Code>.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpops-action-selection.md', href: '/explore/docs/wpops-action-selection.md' },
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
      { label: 'wpops-action-selection.md', href: '/explore/docs/wpops-action-selection.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'two-palettes-actually-used',
    title: 'Those Two Engine Palettes ARE Used — We Just Misread Them',
    tags: ['palette', 'resolved-2026-05-25'],
    pitch:
      'For weeks we thought wroot.exe built two custom EGA palettes that nobody loaded. Wrong. They load fine — we were treating Attribute Controller register values as if they were RGB triples, so the runtime DAC looked unchanged and we assumed nothing happened.',
    body: (
      <>
        <ProseRow>
          The Wiz6 binary contains two 17-byte palette tables at file offsets{' '}
          <Code>0x2043</Code> and <Code>0x2054</Code>, loaded into the EGA Attribute
          Controller by <Code>INT 10h AX=1002h</Code> at <Code>0x209B</Code> and{' '}
          <Code>0x2105</Code>. The naming convention was right (<Code>wiz6-main</Code>
          and <Code>wiz6-dungeon</Code>) — the interpretation was wrong.
        </ProseRow>
        <ProseRow>
          The EGA color system is a two-stage chain. The framebuffer stores a 4-bit
          color attribute per pixel. That attribute is mapped through the AC palette
          registers (16 entries, each a 6-bit DAC index) to a DAC entry. The DAC then
          holds the actual RGB. <em>Wiz6's 17-byte tables are AC values, not DAC
          values.</em>{' '}
          <Code>wiz6-main</Code> remaps attribute 5 to DAC index <Code>0x16</Code> = 22,
          and BIOS DAC[22] is <Code>(255, 255, 85)</Code> bright yellow — which is
          exactly what the original engine renders as the selected-menu-row highlight.
        </ProseRow>
        <ProseRow>
          We were sampling the DAC and comparing it against{' '}
          <Code>EGA_DEFAULT</Code>'s RGB triples. The DAC <em>is</em> at BIOS default
          in every captured save (we verified). What changed was the AC, which we
          weren't checking. Vga-blob byte-grep across saves confirmed{' '}
          <Code>wiz6-main</Code>'s AC bytes are programmed across every captured state
          — title sequence, menu, post-character-creation, everything.
        </ProseRow>
        <ProseRow>
          As a side-effect, the <Code>EGA_FILE_INDEX_PERMUTATION</Code> we'd been
          using to render <Code>.pic</Code> and <Code>.ega</Code> assets turned out
          to be an empirical reconstruction of the AC→DAC chain through a permutation
          over <Code>EGA_DEFAULT</Code>. It's right at 14 of 16 file colors and
          off-by-shade (dim vs light magenta swap) at indices 3 and 11. The renderers
          now look up <Code>palette.colors[fileIdx]</Code> directly against{' '}
          <Code>WIZ6_MAIN</Code>; the permutation table is retained as deprecated.
        </ProseRow>
        <Aside title="Lessons">
          (1) "Programmed into the EGA Attribute Controller" doesn't mean what we
          assumed it meant. Read the BIOS docs before naming things.
          (2) A working empirical calibration can hide a structural misunderstanding for
          weeks. If two different theoretical models produce nearly-identical output,
          you might not notice the model is wrong until something with no calibration
          slack (the menu cursor highlight, here) forces the issue.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'palette-discovery.md', href: '/explore/docs/palette-discovery.md' },
      { label: 'menu-cursor-render-path.json', href: '/explore/docs/findings/menu-cursor-render-path.json' },
      { label: 'state4-runtime-palette.json', href: '/explore/docs/findings/state4-runtime-palette.json' },
      { label: 'palette calibration tool', href: '/explore/calibrate' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'items-as-dungeon-keys',
    title: 'Items Only Do Anything At Scripted Dungeon Cells',
    tags: ['dialogue', 'design-choice', 'undocumented'],
    pitch:
      'Wiz6 has no global "use" action for items. The silver key does nothing until you\'re standing on the silver-locked door. Use-item triggers fire only when the current cell has a matching type-0x13 marker — anywhere else, nothing happens.',
    body: (
      <>
        <ProseRow>
          You'd think the way to use an item in Wiz6 is to select it and
          have something happen. That's not how it works. The item-use
          handler in <Code>wdopt_dungeon_item_trigger_check</Code> at{' '}
          <Code>0x1ffd</Code> validates first:
        </ProseRow>
        <CodeBlock>
{`for each entry in current_cell's spell-cell trigger table:
    if entry.type == 0x13 and entry.item_id == selected_item_id:
        setbit(*0x363c * 10 + 0x4eec, entry.bit)   ; fire cell effect
        play_sound(entry.sound_id)
        return SUCCESS
return NO_EFFECT`}
        </CodeBlock>
        <ProseRow>
          The silver key only works at the silver-locked door because only
          that cell carries a type-0x13 entry referencing the silver key's
          item ID. The healing potion at full HP does nothing visible — the
          dungeon-cast layer doesn't care that you've selected a healing
          item if no scripted trigger matches. Identify scrolls outside of
          the appropriate identification room are inert.
        </ProseRow>
        <ProseRow>
          The activation bitmap at <Code>*0x363c * 10 + 0x4eec</Code> is
          per-scenario-zone (the multiplication keys it to current-zone
          index). Once a trigger fires, the bit is set — re-using the same
          item on the same cell does nothing. The silver key opens the
          door <em>once</em>, then becomes inert dead weight in your
          inventory.
        </ProseRow>
        <Aside title="Design takeaway">
          This is a tight content-design tool, not just an engineering
          quirk. The designers can place an item-triggered event without
          worrying about the player using the item somewhere else. The
          cost is a player mental model that's harder to develop: trying
          items at every door eventually teaches you which items are
          context-keyed, but the game never tells you.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wdopt-dungeon-cast-use.md', href: '/explore/docs/wdopt-dungeon-cast-use.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'spell-picker-duplicated',
    title: 'There Are Two Independent Copies Of The Spell-School Picker',
    tags: ['combat', 'engine', 'quirk', 'undocumented'],
    pitch:
      'The in-combat spell picker (wpops) and the in-dungeon spell picker (wdopt) are independently-drifted copies of the same code. Common ancestor, divergent grids, divergent exit semantics. Maintaining both was clearly the path of least resistance.',
    body: (
      <>
        <ProseRow>
          When you cast a spell in Wiz6, you go through a spell-school
          picker — six schools in a grid, with the schools you don't have
          spells in greyed out. Same UI in combat, same UI in the dungeon.
        </ProseRow>
        <ProseRow>
          Except it's not the same UI. There are <strong>two independent
          copies</strong> of the spell-school picker in the binary:
        </ProseRow>
        <ul className={styles.bullets}>
          <li><Code>wpops_ui_picker_spell</Code> at <Code>0x1ee6</Code> — used in combat (state 0x0c).</li>
          <li><Code>wdopt_ui_picker_spell</Code> at <Code>0x2699</Code> — used in the dungeon (state 0x13).</li>
        </ul>
        <ProseRow>
          They look like they descend from a common ancestor — both
          present six schools, both filter against the caster's known-
          spells bitmap, both gate power-level selection. But they've{' '}
          <strong>drifted</strong>:
        </ProseRow>
        <ul className={styles.bullets}>
          <li>Rendering order is slightly different.</li>
          <li>Exit semantics differ (combat returns to action-picker; dungeon returns to wmaze).</li>
          <li>The cancel option lives at a different grid slot in each.</li>
        </ul>
        <ProseRow>
          Whichever copy was authored first, the other was probably
          duplicated from it with intent-to-share that never happened.
          Both copies got maintained independently from then on. Players
          noticing the small UX inconsistencies between in-combat and
          in-dungeon spell casting were noticing real divergence.
        </ProseRow>
      </>
    ),
    seeAlso: [
      { label: 'wpops-action-selection.md', href: '/explore/docs/wpops-action-selection.md' },
      { label: 'wdopt-dungeon-cast-use.md', href: '/explore/docs/wdopt-dungeon-cast-use.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'dungeon-overcast-backfire',
    title: 'Overcasting In The Dungeon Doesn\'t Fail — It Hits You With A Status Effect',
    tags: ['combat', 'design-choice', 'quirk'],
    pitch:
      'In combat, an unaffordable spell silently fizzles. In the dungeon, the same overcast applies a random status effect (6 + rng(6)) to the caster. Same engine, different consequence — the asymmetry is intentional.',
    body: (
      <>
        <ProseRow>
          Wiz6 spells can cost HP, not just MP — some of the more powerful
          ones drain both. The cast handlers deduct the cost from the
          caster's pool and check whether it would drop the caster below
          zero. The interesting part is what happens then.
        </ProseRow>
        <ProseRow>
          <strong>In combat</strong> (via <Code>wmexe</Code>): the spell
          silently fizzles. The mana / HP pool goes negative due to the
          underflow bug{' '}
          (see <a href="#spell-picker-shows-unaffordable">that card</a>);
          the caster suffers no visible consequence beyond the wasted
          action.
        </ProseRow>
        <ProseRow>
          <strong>In the dungeon</strong> (via <Code>wdopt</Code>): the
          engine takes a different path. At <Code>wdopt_state_13_cast_spell</Code>{' '}
          (0x39cc):
        </ProseRow>
        <CodeBlock>
{`if (char.hp - spell_hp_cost < 0):
    char.status (+0x450c) = 6 + rng(6)   ; status code 6..11`}
        </CodeBlock>
        <ProseRow>
          The caster gets a random status effect — code 6..11 (the exact
          mapping is unmapped but likely paralysis / confusion / stun /
          poison-of-some-sort). The caster <em>survives</em> the attempt
          but is temporarily incapacitated.
        </ProseRow>
        <Aside title="Why the asymmetry">
          The combat path can afford to be lenient — failed casts there
          cost a round, which is already a serious penalty. The dungeon
          path has to <em>actively</em> punish overcasts because the
          alternative is reload-spamming until the cast lucks into a
          favorable RNG outcome. The dungeon fizzle penalty makes
          save-scumming a low-HP cast harder than just retrying.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wdopt-dungeon-cast-use.md', href: '/explore/docs/wdopt-dungeon-cast-use.md' },
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
      { label: 'startup-sequence.md', href: '/explore/docs/startup-sequence.md' },
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
      { label: 'wmaze-functions.md', href: '/explore/docs/wmaze-functions.md' },
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
      { label: 'wpcmk-character-creation.md', href: '/explore/docs/wpcmk-character-creation.md' },
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
      { label: 'snd-format.md', href: '/explore/docs/snd-format.md' },
    ],
  },
  {
    id: 'carry-capacity-frozen',
    title: 'Carry Capacity Is Rolled Once And Never Updated Again',
    tags: ['character-progression', 'bug', 'engine'],
    pitch:
      "A character's carrying-capacity limit is computed once, at creation, from STR/VIT. The engine then never recomputes it — train STR from 10 to 18 over a dozen levels and your carry limit is still your level-1 self's.",
    body: (
      <>
        <ProseRow>
          When you create a character, Wiz6 rolls a maximum carrying capacity from
          STR and VIT and stores it in the character record at offset{' '}
          <Code>+0x22</Code>:
        </ProseRow>
        <CodeBlock>{`base = (STR*2 + VIT) * 3
if STR >= 16: base += STR
if STR >= 18: base += STR
cap = base * 15            ; Faerie (race 5): cap = cap * 2/3`}</CodeBlock>
        <ProseRow>
          That value is written exactly once. We traced every path that rewrites the
          character record on level-up and class re-init: they update HP and stamina
          (record <Code>+0x18</Code>/<Code>+0x1a</Code> and <Code>+0x1c</Code>/
          <Code>+0x1e</Code>) but <em>never</em> touch the carry-capacity field at{' '}
          <Code>+0x22</Code>. There is no other writer — the cap is frozen the moment
          the character is rolled.
        </ProseRow>
        <ProseRow>
          So a Fighter who starts at STR 10 (cap 135 lb) and trains up to STR 18 over
          a dozen levels — which the creation formula would value at ~261 lb, nearly
          double — keeps the carry limit of their level-1 self for the entire game.
          The stat that most directly governs how much you can haul is the one input
          the engine forgets to re-read.
        </ProseRow>
        <Aside title="Fixable in House Rules">
          We carry the real formula (verified 6-for-6 against save-state records), so
          the port can just recompute the cap from current STR/VIT whenever it's
          needed. The <Code>recomputeCarryCapacity</Code> house rule does exactly that:
          ON (default) recomputes on every check so the cap tracks your stats; OFF
          reproduces the original frozen-at-creation behavior.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'wpcvw-character-view.md', href: '/explore/docs/wpcvw-character-view.md' },
    ],
  },
  {
    id: 'cursor-leak-three-screens',
    title: 'The Cursor That Leaked Through Three Screens',
    tags: ['reimplementation', 'bug', 'character-creation'],
    pitch:
      'Our reimplementation drew the RACE, SEX, and PROFESSION pickers with one React component — so its cursor leaked between them: choosing ELF silently rolled a female mage. Every unit test passed; only driving the real browser caught it.',
    body: (
      <>
        <ProseRow>
          This one is ours, not the original game&rsquo;s &mdash; a cautionary tale
          from the reimplementation. Character creation walks three back-to-back menu
          screens (RACE &rarr; SEX &rarr; PROFESSION), and we render all three with the
          same <Code>MenuPickerScreen</Code> component.
        </ProseRow>
        <ProseRow>
          React, seeing the same component type at the same spot in the tree across
          those transitions, <strong>reuses the instance</strong> instead of remounting
          it &mdash; and with it, the component&rsquo;s internal cursor{' '}
          <Code>useState</Code>. So the cursor index <em>persisted</em> from one screen
          to the next: pick ELF (index 1) on RACE, and SEX opens with the cursor already
          on index 1 (FEMALE); confirm that, and PROFESSION opens on index 1 (MAGE). A
          silent wrong-selection cascade &mdash; no error, no beep, just the wrong
          character.
        </ProseRow>
        <ProseRow>
          Every unit test passed. They check <em>pieces</em>: the picker renders the
          right options; the composer&rsquo;s pixels match the engine fixture. But this
          bug exists in no piece &mdash; it lives in the <em>mounted, navigated</em> app,
          in React&rsquo;s identity decisions across screen transitions. A test that
          never mounts the real flow can&rsquo;t see it.
        </ProseRow>
        <ProseRow>
          What caught it: a browser end-to-end gate that drives the real app by keyboard
          and pixel-asserts the canvas against the engine. On its{' '}
          <strong>very first run</strong>, the &ldquo;create a Mage&rdquo; golden path
          committed a character with the wrong race, sex, and class &mdash; and the
          assertion failed.
        </ProseRow>
        <ProseRow>The fix is one prop:</ProseRow>
        <CodeBlock>
{`// Force a fresh mount per screen so the cursor resets:
return <MenuPickerScreen key={state.screen} {...sharedProps} />;`}
        </CodeBlock>
        <Aside title="The thesis">
          Unit parity is necessary but not sufficient &mdash; it proves the parts, not
          the assembled, mounted whole. Drive the real thing and pixel-assert it against
          ground truth. See <Code>docs/driving-based-testing.md</Code>.
        </Aside>
      </>
    ),
  },

  // -------------------------------------------------------------------
  {
    id: 'skill-name-map-correction',
    title: 'The Skill Names Hiding In Plain Sight',
    tags: ['reimplementation', 'undocumented', 'character-progression'],
    pitch:
      'The community skill-slot map (and ours, copied from it) had the weapon skills reordered and five slots marked as empty "holes." The engine settles it in one instruction — and those holes are real skills: DEFENSE, SPEED, MOVEMENT, AIM, POWER.',
    body: (
      <>
        <ProseRow>
          A Wiz6 character record stores 30 skill levels in a flat array. But which
          array slot is which skill? The widely-cited community RE (martydill&rsquo;s
          open-source repo) published an ordering &mdash; Sword, Axe, Polearm, &hellip;
          &mdash; and we copied it, cross-checking it against a few stock characters&rsquo;
          nonzero values. It looked right. It wasn&rsquo;t.
        </ProseRow>
        <ProseRow>
          The engine ends the argument in a single instruction. When the SKILL viewer
          draws a row, it computes the name&rsquo;s message id straight from the slot:
        </ProseRow>
        <CodeBlock>
{`mov ax,[bp-2]      ; ax = skill slot (0..29)
add ax,0x157c      ; msg id = 5500 + slot   <-- 1:1, no lookup table
push ax
call draw_msg_in_window`}
        </CodeBlock>
        <ProseRow>
          So slot N&rsquo;s name is just message <Code>5500 + N</Code>. Dump those 30
          messages and the real map falls out &mdash; and it disagrees with the
          community map in two big ways. The weapon block is reordered, and{' '}
          <strong>five slots everyone marked as &ldquo;holes&rdquo; are real skills</strong>:
        </ProseRow>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Slot</th>
              <th>Community map</th>
              <th>Engine (msg 5500+slot)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>0</td><td>Sword</td><td><strong>WAND&amp;DAGGER</strong></td></tr>
            <tr><td>1</td><td>Axe</td><td><strong>SWORD</strong></td></tr>
            <tr><td>8</td><td>Bow</td><td><strong>SHIELD</strong></td></tr>
            <tr><td>9</td><td>Thrown Weapons</td><td><strong>HANDS&amp;FEET</strong></td></tr>
            <tr><td>17&ndash;21</td><td><em>(holes)</em></td><td><strong>DEFENSE / SPEED / MOVEMENT / AIM / POWER</strong></td></tr>
            <tr><td>22</td><td>Scouting</td><td><strong>ARTIFACTS</strong></td></tr>
          </tbody>
        </table>
        <ProseRow>
          The fix even makes the stock data read better: THESUS, a level-1 Fighter,
          has <Code>10</Code> in slot 1. The old map called that &ldquo;Axe.&rdquo; The
          engine calls it <strong>SWORD</strong> &mdash; exactly what a starting
          fighter should be good at.
        </ProseRow>
        <Aside title="The lesson">
          A cross-check against stock data can <em>agree</em> with a wrong map &mdash;
          coincidence is cheap when the bitmaps are sparse. The ground truth was in the
          binary the whole time: follow the bytes the engine actually draws, not the
          map that happens to fit. An entire skill category (PERSONAL) was missing from
          the community model.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: wpcvw-skill-names.json', href: '/explore/docs/findings/wpcvw-skill-names.json' },
      { label: 'findings: wpcvw-skill-action.json', href: '/explore/docs/findings/wpcvw-skill-action.json' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'maze-renderer-hidden-in-driver',
    title: 'The 3D Renderer Wasn’t Where We Looked — Three Times',
    tags: ['maze', 'engine', 'reimplementation', 'quirk'],
    pitch:
      'Three reverse-engineering passes disassembled the wrong binary. The first-person maze renderer isn’t in the dungeon overlay at all — it’s a service inside the EGA graphics driver that copies itself into scratch RAM to run, so every breakpoint we set logged zero hits.',
    body: (
      <>
        <ProseRow>
          We went looking for the wall-drawing code in <Code>wmaze.ovr</Code>,
          the dungeon-traversal overlay. We found code that looked exactly
          right &mdash; a back-to-front depth loop, vertex-column tables, edge
          emitters &mdash; named all of it, and wrote it up. Three separate
          passes did this. Then we set a breakpoint on it during an actual
          corridor redraw, and it never fired. Not once.
        </ProseRow>
        <ProseRow>
          Two things were hiding the renderer. First, it isn&rsquo;t in wmaze at
          all: it&rsquo;s a far-called service inside <Code>ega.drv</Code>, the
          EGA graphics driver. The wmaze code we&rsquo;d so carefully named was
          the geometry <em>generator</em> that feeds it &mdash; real, but one
          stage upstream of the pixels.
        </ProseRow>
        <ProseRow>
          Second, and stranger: <Code>ega.drv</Code> copies its own blit
          routine out of the loaded driver image into a scratch work buffer and
          jumps into the <em>copy</em>. A breakpoint on the original bytes in
          the driver image is watching code that is never executed. The same
          trick hid the texture decompressor too &mdash; so our first
          &ldquo;is the <Code>.pic</Code> RLE decoder involved? No, zero
          hits&rdquo; was measuring a corpse.
        </ProseRow>
        <Aside title="How we finally pinned it">
          We caught the relocated code mid-frame with a one-shot RAM snapshot
          armed on the breakpoint, then proved it was the real renderer with
          arithmetic: the live caller&rsquo;s return address minus the static
          call-site equals <Code>0x4564</Code> &mdash; exactly the documented
          offset at which the overlay loads into the host&rsquo;s code segment.
          The scratch copy is byte-identical to the driver image, so the static
          disassembly was authoritative all along; it just never ran where we
          were watching.
        </Aside>
        <Aside title="The lesson">
          Zero breakpoint hits doesn&rsquo;t mean &ldquo;wrong function.&rdquo;
          It can mean &ldquo;right function, wrong copy.&rdquo; On a 1990 overlay
          engine, self-relocating code is ordinary &mdash; trust the bytes, then
          go find where they actually run.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: egadrv-blit-internals.json', href: '/explore/docs/findings/egadrv-blit-internals.json' },
      { label: 'findings: maze-planar-transform.json', href: '/explore/docs/findings/maze-planar-transform.json' },
      { label: 'wmaze-functions.md', href: '/explore/docs/wmaze-functions.md' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'maze-four-greys-no-perspective',
    title: 'Four Greys and No Perspective',
    tags: ['maze', 'design-choice', 'quirk', 'engine'],
    pitch:
      'The Wiz6 stone corridor is four EGA greys dithered into brickwork, textured by integer per-depth column tables with no perspective correction, composed to an off-screen page and then copied to the screen whole.',
    body: (
      <>
        <ProseRow>
          The dungeon view reads as stone, but it&rsquo;s built from four greys
          &mdash; black, dark, light, white &mdash; dithered into brick courses.
          That&rsquo;s the whole wall palette. The colour comes from the
          dither, not the data.
        </ProseRow>
        <ProseRow>
          The texturing has no <Code>1/z</Code> term anywhere. Each wall column
          is placed by a sub-byte bit-shift (<Code>shr ax,cl</Code>) and a
          per-depth seam table; the corridor&rsquo;s convergence is a
          hand-tuned lookup &mdash; <Code>{'{0, 104, 128, 144}'}</Code> on the
          left edge, <Code>{'{0, 216, 192, 176}'}</Code> on the right, for the
          four depth bands &mdash; not anything computed from a projection. So
          the corridor doesn&rsquo;t recede smoothly; it <em>steps</em> toward
          the vanishing point in four discrete bands, the texture column-replicated
          within each.
        </ProseRow>
        <ProseRow>
          And it never draws to the screen directly. The renderer composes the
          whole view into an off-screen 4-plane EGA page, then copies that page
          into video memory plane-by-plane with a byte-offset-preserving move
          &mdash; an identity copy. The off-screen page already <em>is</em> the
          screen layout; the perspective was baked in at compose time, one
          column and one bit-shift at a time.
        </ProseRow>
        <Aside title="The port&rsquo;s payoff">
          Because the page is laid out exactly like the screen, our TypeScript
          decoder of that 4-plane page matches the engine&rsquo;s framebuffer
          pixel-for-pixel &mdash; and re-running the column compositor from the
          geometry tables reproduces the wall faces byte-exact.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: maze-planar-transform.json', href: '/explore/docs/findings/maze-planar-transform.json' },
      { label: 'findings: maze-stage1-compositor.json', href: '/explore/docs/findings/maze-stage1-compositor.json' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'maze-textures-not-in-maze-file',
    title: 'The Maze Textures Aren’t In The Maze File',
    tags: ['maze', 'reimplementation', 'undocumented'],
    pitch:
      'mazedata.ega holds no wall pixels — it’s a 153-entry index. The actual textures are decompressed by the exact same RLE decoder that draws monster portraits, and our first decode produced pure noise for two completely different reasons at once.',
    body: (
      <>
        <ProseRow>
          <Code>mazedata.ega</Code> &mdash; the file literally named for the
          maze graphics &mdash; contains a header, a 153-entry descriptor table,
          and a second 366-entry table. What it does <em>not</em> contain is
          wall pixels in any readable form. It&rsquo;s an index. The descriptors
          even get rewritten in place as the file loads (offsets shifted by
          <Code>0xA2</Code>, the width field rewritten into an EGA edge-mask).
        </ProseRow>
        <ProseRow>
          The pixels themselves are decompressed at load by the <Code>.pic</Code>
          RLE decoder &mdash; the <em>same</em> routine that decodes monster
          portraits and other sprites. There is no bespoke maze-texture format:
          the wall tiles are plain 8&times;8 four-plane EGA cells, like
          everything else the game draws.
        </ProseRow>
        <Aside title="Two ways to get noise at once">
          Our first decode of the texture buffer was pure static. Two
          independent bugs, both classics: (1) we read the bytes as
          4-bits-per-pixel <em>packed</em> when the format is four separate
          1-bit <em>planes</em> &mdash; identical bytes, scrambled layout; and
          (2) the buffer we&rsquo;d captured was a half-drawn intermediate
          (snapshotted at the first store of the frame instead of the last). Fix
          either alone and you still get noise. Fix both and the grey brick
          snaps into focus.
        </Aside>
        <Aside title="The lesson">
          Structurally-plausible noise &mdash; right entropy, right histogram,
          looks like data &mdash; is the signature of a layout or timing bug, not
          a wrong file. (We learned this on the <Code>.snd</Code> decoder and got
          to relearn it here.) We had the right bytes the whole time.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: maze-texture-decode.json', href: '/explore/docs/findings/maze-texture-decode.json' },
      { label: 'findings: egadrv-blit-internals.json', href: '/explore/docs/findings/egadrv-blit-internals.json' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'maze-emission-not-geometric',
    title: 'Walking a Corridor Backwards Isn’t the Mirror of Walking It Forwards',
    tags: ['maze', 'engine', 'quirk', 'reimplementation'],
    pitch:
      'The same dungeon corridor, viewed from opposite ends, renders differently — and we briefly concluded the engine wasn’t drawing from geometry at all. We were wrong: a door is a directional object, and the renderer reads every wall relative to your facing. It’s fully deterministic geometry.',
    body: (
      <>
        <ProseRow>
          We set out to reimplement the first-person maze renderer as a pure
          function: feed it the map cells + where you stand + which way you face,
          get the engine’s exact view back. Then it broke on a frame pair that
          should have been trivial.
        </ProseRow>
        <ProseRow>
          Two frames, <em>same spot</em>, opposite facings: looking one way the
          engine drew a doorway and no side walls; looking back the other way it
          drew four solid side walls. The cells looked symmetric. We brute-forced
          ten rules over the map and none fit — and a per-frame gate that wiped
          itself by frame-end looked like proof that emission came from
          <em> transient</em> state, not the map. We wrote it down as
          &ldquo;not a pure function of geometry.&rdquo;
        </ProseRow>
        <ProseRow>
          <strong>That was wrong.</strong> It <em>is</em> pure geometry — we’d just
          built an incomplete model of the geometry. Two things we’d missed: a
          door is a <em>directional</em> object (the map stores each cell’s door
          orientation in its own plane), and the renderer reads each wall
          <em> relative to your facing</em> — looking south, the wall ahead is the
          <em> south</em> neighbour’s face, not the cell’s own. Facing the door
          head-on, its orientation matches your facing and it draws as a recess
          with flanking walls; facing away, the same door reads as open corridor.
          Same cells, opposite facings, completely determined by (geometry +
          facing). The &ldquo;transient gate&rdquo; was just per-frame scratch
          computed <em>from</em> that geometry; the &ldquo;symmetric&rdquo; cells
          weren’t — we’d been comparing the wrong fields, so we never actually fed
          it the same geometry.
        </ProseRow>
        <Aside title="The lesson">
          &ldquo;It’s not geometric&rdquo; was the wrong conclusion — and what
          saved us was refusing to believe it. A discrete grid-stepper from 1990 is
          finite, deterministic code; its view <em>must</em> be a function of local
          geometry. Holding that line through several wrong turns is what finally
          shook out the door-orientation plane and the per-facing wall read. A
          disproof that looks decisive — &ldquo;same geometry in, different picture
          out&rdquo; — is worth re-checking when it implies something impossible;
          ours just meant the inputs weren’t actually the same.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: maze-classify-determinism.json', href: '/explore/docs/findings/maze-classify-determinism.json' },
      { label: 'findings: maze-classify-projection.json', href: '/explore/docs/findings/maze-classify-projection.json' },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: 'maze-no-placement-table',
    title: 'The Decompiler Hunted For a Table That Isn’t There',
    tags: ['maze', 'reimplementation', 'engine'],
    pitch:
      'To draw the corridor, the engine picks which floor/ceiling/wall tile goes where by a placement INDEX. We spent a long time looking for the lookup table that produces those indices. There is no table. The index is literally base + depth, and the “base” is a constant baked into each draw instruction.',
    body: (
      <>
        <ProseRow>
          The first-person maze paints its background by OR-blitting a list of
          sub-images into an off-screen page &mdash; one per <em>placement</em>,
          each identified by a numeric index into the asset’s piece table. Crack
          how the engine chooses those indices for any <em>(cell, facing)</em> and
          you can regenerate the whole view from the map instead of screenshotting
          it. So: where does the index come from?
        </ProseRow>
        <ProseRow>
          The decompiler was sure it came from a table. Every attempt to lift the
          slot-helper routines produced something shaped like{' '}
          <Code>table[slotCode * stride + depth]</Code> &mdash; and every attempt
          was wrong, because that table never resolves to the indices we captured
          live. We chased the supposed table for an embarrassingly long time.
        </ProseRow>
        <ProseRow>
          Hand-disassembling the emit functions settled it. The index is just:
        </ProseRow>
        <CodeBlock>{`placementIndex = base + depth        ; depth = 0..3 down the corridor

; …and "base" is an IMMEDIATE pushed at the call site:
mov   ax, 0x7a        ; 122 = the ceiling base, a literal
add   ax, [bp+4]      ; + depth
push  ax              ; placement index for this slot
call  emit_or_blit`}</CodeBlock>
        <ProseRow>
          That’s the whole law. The ceiling base is 122, the floor base is 150
          (= 122 + 28), and both just add the depth. There is no array, no
          arithmetic on a slot code, no indirection &mdash; the &ldquo;table&rdquo;
          is a scattering of <Code>mov ax, IMM</Code> constants, one frozen into
          each draw site at compile time in 1990. The decompiler kept inventing a
          data structure because that’s the shape modern code would take; the
          original just open-coded a different literal everywhere.
        </ProseRow>
        <Aside title="Why this was the keystone">
          Once the law was &ldquo;base + depth,&rdquo; the rest of the renderer
          fell quickly: the side walls turned out to be exact left/right mirrors
          (an apparent asymmetry was our own decomposition bug, reading the index
          instead of <Code>index − depth</Code>), and the near-wall flanks are
          drawn by mirroring one column onto the other. Our reimplementation now
          regenerates the entrance corridor from the map at 99.9% of the engine’s
          own pixels &mdash; no screenshot required.
        </Aside>
        <Aside title="The lesson">
          A decompiler models the past in the idioms of the present. When its
          output looks like a clean table lookup that <em>doesn’t reproduce the
          data</em>, suspect that the table is a fiction and the real code is
          open-coded constants. Read the actual instructions.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: maze-index-arithmetic.json', href: '/explore/docs/findings/maze-index-arithmetic.json' },
      { label: 'findings: maze-wall-family-seeding.json', href: '/explore/docs/findings/maze-wall-family-seeding.json' },
      { label: 'findings: maze-masked-generation.json', href: '/explore/docs/findings/maze-masked-generation.json' },
    ],
  },
  {
    id: 'maze-dither-was-a-door',
    title: 'The Dither That Was a Door',
    tags: ['maze', 'reimplementation', 'quirk', 'engine'],
    pitch:
      'A stubborn smear of mismatched pixels at the corridor’s vanishing point looked like dithered-stone texture noise and capped the renderer for a dozen passes. It wasn’t noise. It was a single door-leaf tile animating between two frames — a 1-pixel flicker — and our static screenshot had frozen the other frame.',
    body: (
      <>
        <ProseRow>
          The reimplemented dungeon corridor matched the engine almost perfectly,
          except for a stubborn 18-pixel smudge right at the vanishing point &mdash;
          the far door at the end of the hall. It moved when we changed almost
          nothing; it survived every generation fix. We filed it as
          &ldquo;dither-phase&rdquo;: the stone is a two-shade dithered pattern, and
          we assumed our composed frame simply landed a different dither phase than
          the engine&rsquo;s, so a scatter of pixels would always disagree. Several
          larger views were capped the same way. For about eleven reverse-engineering
          passes, &ldquo;it&rsquo;s just dither&rdquo; was the accepted ceiling.
        </ProseRow>
        <ProseRow>
          It was not dither. The trick to seeing it was a capture-timing one. The
          engine only fully redraws the far door on a <em>real move into a cell</em>;
          turning in place is a dirty repaint that reuses the cached deep tile. Every
          prior capture had turned in place, so the door tile was never re-emitted and
          our generator never learned it existed. Forcing a full redraw &mdash; by
          stepping <em>out</em> of the cell, which repaints the origin frame in full
          &mdash; finally exposed it: the &ldquo;dither&rdquo; was a single wall-tile
          the generator wasn&rsquo;t drawing at all.
        </ProseRow>
        <ProseRow>
          And reading the engine&rsquo;s own settled draw list for that frame showed
          why it shimmered. The far-door piece doesn&rsquo;t use one tile &mdash; it
          alternates between two adjacent tiles in the atlas, frame by frame:
        </ProseRow>
        <CodeBlock>{`; the corridor far-door is ONE compositor span at the vanishing point:
{ x0: 158, x1: 68, clip: 72/248, walltype: 1, depthField: 2, seamIdx: 5 }
;                                                              ^^^^^^^^^
; …and on alternate frames the engine emits the very same span with seamIdx 6.
; seamIdx selects the atlas sub-tile, so the door-stile detail flickers 5 <-> 6
; — a one-pixel shimmer at screen (160, 68).`}</CodeBlock>
        <ProseRow>
          So the residual was two unrelated mistakes wearing one disguise. First, the
          door tile was missing from our generated frame (the dirty-capture blind
          spot). Second, even once drawn, a <em>single</em> committed reference
          screenshot can only ever freeze <em>one</em> of the two animation frames
          &mdash; so any honest renderer disagrees with it by exactly the flickering
          pixel, forever, no matter how correct it is. That second pixel is what we
          had been calling &ldquo;dither phase.&rdquo;
        </ProseRow>
        <ProseRow>
          The fix is to model the animation instead of fighting it: each animated
          span carries both tiles (<Code>seamIdx</Code> and <Code>seamAlt</Code>), the
          composer takes a phase, the parity tests render phase 0 (the frozen-fixture
          frame, byte-exact), and the live viewer toggles the phase on a clock so the
          door shimmers the way it did in 1990. With the tile generated and the phase
          modeled, the entrance corridor reaches 100% of the engine&rsquo;s pixels.
        </ProseRow>
        <Aside title="The lesson">
          &ldquo;It&rsquo;s just dither noise&rdquo; is the renderer-RE equivalent of
          &ldquo;it&rsquo;s just rounding error&rdquo; &mdash; a comforting label for a
          residual you haven&rsquo;t explained. A structurally-correct frame that
          disagrees in a small, <em>stable</em> patch of pixels is usually hiding
          something specific: a tile you didn&rsquo;t draw, or a frame of animation the
          fixture froze. Localized and persistent beats &ldquo;noise&rdquo; &mdash;
          look closer.
        </Aside>
      </>
    ),
    seeAlso: [
      { label: 'findings: maze-deepdoor-drawpath.json', href: '/explore/docs/findings/maze-deepdoor-drawpath.json' },
      { label: 'findings: maze-callist-generation.json', href: '/explore/docs/findings/maze-callist-generation.json' },
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
  'reimplementation',
  'resolved-2026-05-25',
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
  const { hash } = useLocation();

  // SPA navigation doesn't trigger the browser's native hash-fragment scroll,
  // so permalinks like /explore/notes#bonus-point-lottery (and the inline
  // RECommentary badges) land at the top instead of the card. Scroll the
  // matching <article id={note.id}> into view after layout. (#048)
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [hash]);

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
