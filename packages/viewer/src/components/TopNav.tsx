import { NavLink, Link } from 'react-router-dom';
import styles from './TopNav.module.css';

const SECTIONS: { label: string; to: string }[] = [
  { label: 'Monsters', to: '/explore/monsters' },
  { label: 'Items', to: '/explore/items' },
  { label: 'Quest', to: '/explore/quest' },
  { label: 'Screens', to: '/explore/screens' },
  { label: 'Portraits', to: '/explore/portraits' },
  { label: 'Fonts', to: '/explore/fonts' },
  { label: 'Messages', to: '/explore/msg' },
  { label: 'Newgame', to: '/explore/newgame' },
  { label: 'Pics', to: '/explore/pics' },
  { label: 'Sounds', to: '/explore/sounds' },
  { label: 'Docs', to: '/explore/docs' },
  { label: 'Files', to: '/explore/files' },
];

export function TopNav() {
  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link to="/explore" className={styles.title}>
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
      <Link to="/" className={styles.gameLink}>
        ← Wizardry VI
      </Link>
    </nav>
  );
}
