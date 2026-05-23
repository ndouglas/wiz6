import { SectionCard } from '../components/SectionCard.js';
import { ScreenGallery } from '../views/ScreenGallery.js';
import { WIZ6_TITLE_PALETTE } from '../palettes/index.js';
import styles from './Landing.module.css';

const SECTIONS = [
  {
    title: 'Monsters',
    to: '/explore/monsters',
    description: 'Rogue’s gallery: 250 combat-monster records with full stat, attack, save, and raw-byte views.',
    meta: '250 records',
  },
  {
    title: 'Items',
    to: '/explore/items',
    description: '500 item records — weapons, armor, scrolls, instruments, dust.',
    meta: '500 records',
  },
  {
    title: 'Quest records',
    to: '/explore/quest',
    description: 'Three special records reusing the monster layout for NPC / minigame / quest data.',
    meta: '3 records',
  },
  {
    title: 'Screens',
    to: '/explore/screens',
    description: 'EGA screen images: title, graveyard, dragon. Palette picker + alignment tool.',
    meta: '3 screens',
  },
  {
    title: 'Portraits',
    to: '/explore/portraits',
    description: 'NPC and party portrait sets, 4bpp.',
    meta: '3 sets',
  },
  {
    title: 'Fonts',
    to: '/explore/fonts',
    description: 'Game fonts: 1bpp UI font plus four 4bpp display fonts.',
    meta: '5 fonts',
  },
  {
    title: 'Messages',
    to: '/explore/msg',
    description: 'Huffman-decompressed text from msg.dbs.',
  },
  {
    title: 'Newgame',
    to: '/explore/newgame',
    description: '779 × 64-byte character-creation templates.',
    meta: '779 records',
  },
  {
    title: 'Pics',
    to: '/explore/pics',
    description: '59 monster sprites + credits — outer-envelope decoded (pixel rendering Stage B).',
    meta: '60 entries',
  },
  {
    title: 'Files',
    to: '/explore/files',
    description: 'Every parsed .dbs file with its section layout and parse status.',
  },
  {
    title: 'Sounds',
    to: '/explore/sounds',
    description: '35 sound effects (.snd) — Huffman-decoded 8-bit PCM with per-sound metadata and inline preview.',
    meta: '35 entries',
  },
];

export function Landing() {
  return (
    <main className={styles.page}>
      <div className={styles.hero} data-testid="landing-hero">
        <ScreenGallery url="/screens/titlepag.json" palette={WIZ6_TITLE_PALETTE} hideHeader />
      </div>
      <h1 className={styles.heading}>Wiz6 Data Explorer</h1>
      <p className={styles.lede}>
        A live, browseable view of every byte we have decoded from Wizardry VI: Bane of the
        Cosmic Forge (DOS, 1990). Open a section to poke around — the site is the data, raw and
        decoded.
      </p>
      <div className={styles.grid}>
        {SECTIONS.map((s) => (
          <SectionCard key={s.to} {...s} />
        ))}
      </div>
      <p className={styles.footer}>
        Reverse-engineered from <code>scenario.dbs</code>, <code>newgame.dbs</code>,{' '}
        <code>msg.dbs</code>, <code>wfont*</code>, <code>wport*</code>, and the .scr screens.
      </p>
    </main>
  );
}
