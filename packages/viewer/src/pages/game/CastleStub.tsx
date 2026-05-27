import { Link, useParams } from 'react-router-dom';
import styles from './CastleStub.module.css';

const STUB_INFO: Record<string, { title: string; description: string }> = {
  'add-party': {
    title: 'Add Party Member',
    description:
      'Pick from PCFILE.DBS. Requires the character-data subsystem and PCFILE I/O — not yet implemented.',
  },
  'choose-leader': {
    title: 'Choose Leader',
    description: 'Select a party member as leader. Transitions to WPCVW (state 0x11).',
  },
  'remove-party': {
    title: 'Remove Party Member',
    description: 'Send a member back to PCFILE.DBS. Requires party-state mutation.',
  },
  resume: {
    title: 'Resume Saved Game',
    description: 'Load SAVEGAME.DBS and resume gameplay. Requires save-load subsystem.',
  },
  configuration: {
    title: 'Game Configuration',
    description:
      'Audio settings, video mode, controls. Transitions to wbase state 0x18 (config submenu).',
  },
  quit: {
    title: 'Quit Game',
    description: 'Thanks for playing. (In a real browser this would just close the tab.)',
  },
};

export function CastleStub() {
  const { stub } = useParams<{ stub: string }>();
  const info = (stub ? STUB_INFO[stub] : undefined) ?? {
    title: 'Unknown',
    description: 'No such menu option.',
  };
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{info.title}</h1>
      <p className={styles.lede}>{info.description}</p>
      <Link to="/castle" className={styles.back}>
        ← back to Master Options
      </Link>
    </main>
  );
}
