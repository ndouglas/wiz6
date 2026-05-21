import { NavLink, Link } from 'react-router-dom';
import styles from './TopNav.module.css';

const SECTIONS: { label: string; to: string }[] = [
  { label: 'Monsters', to: '/monsters' },
  { label: 'Items', to: '/items' },
  { label: 'Quest', to: '/quest' },
  { label: 'Screens', to: '/screens' },
  { label: 'Portraits', to: '/portraits' },
  { label: 'Fonts', to: '/fonts' },
  { label: 'Messages', to: '/msg' },
  { label: 'Newgame', to: '/newgame' },
  { label: 'Files', to: '/files' },
];

export function TopNav() {
  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link to="/" className={styles.title}>
        Wiz6 Data Explorer
      </Link>
      <ul className={styles.links} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {SECTIONS.map(({ label, to }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.linkActive}` : styles.link
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
