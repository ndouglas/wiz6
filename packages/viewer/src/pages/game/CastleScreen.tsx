import { Link } from 'react-router-dom';
import styles from './CastleScreen.module.css';

const DESTINATIONS: { label: string; to: string; description: string; disabled?: boolean }[] = [
  {
    label: "Gilgamesh's Tavern",
    to: '/castle/tavern',
    description: 'Form your party from idle adventurers.',
    disabled: true,
  },
  {
    label: 'Roscoe E. Dexter Inn',
    to: '/castle/inn',
    description: 'Rest and recover; level up.',
    disabled: true,
  },
  {
    label: "Boltac's Trading Post",
    to: '/castle/shop',
    description: 'Buy, sell, and identify items.',
    disabled: true,
  },
  {
    label: 'Temple of Cant',
    to: '/castle/temple',
    description: 'Heal wounds, cure status, resurrect the fallen.',
    disabled: true,
  },
  {
    label: 'The Edge of Town',
    to: '/castle/edge',
    description: 'Step out into the world.',
    disabled: true,
  },
  {
    label: 'Roster',
    to: '/roster',
    description: 'Inspect your characters.',
  },
];

export function CastleScreen() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Castle</h1>
      <p className={styles.lede}>Choose your destination.</p>
      <ul className={styles.list}>
        {DESTINATIONS.map((d) => {
          const inner = (
            <>
              <span className={styles.label}>{d.label}</span>
              <span className={styles.desc}>{d.description}</span>
              {d.disabled && <span className={styles.todo}>not yet playable</span>}
            </>
          );
          return (
            <li key={d.to} className={styles.item}>
              {d.disabled ? (
                <span className={`${styles.button} ${styles.disabled}`} aria-disabled="true">
                  {inner}
                </span>
              ) : (
                <Link to={d.to} className={styles.button}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
