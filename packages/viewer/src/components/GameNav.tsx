import { NavLink, Link } from 'react-router-dom';
import styles from './GameNav.module.css';

const LINKS: { label: string; to: string; end?: boolean }[] = [
  { label: 'Title', to: '/', end: true },
  { label: 'Castle', to: '/castle' },
  { label: 'Roster', to: '/roster' },
];

export function GameNav() {
  return (
    <nav className={styles.bar} aria-label="Game">
      <Link to="/" className={styles.title}>
        Wizardry VI
      </Link>
      <ul className={styles.links}>
        {LINKS.map(({ label, to, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end ?? false}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <Link to="/explore" className={styles.explore}>
        Data explorer →
      </Link>
    </nav>
  );
}
