import { NavLink, Link } from 'react-router-dom';
import styles from './TopNav.module.css';

type NavItem = { label: string; to: string };

const DATA_SECTIONS: NavItem[] = [
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
];

const TOOL_SECTIONS: NavItem[] = [
  { label: 'Calibrate', to: '/explore/calibrate' },
  { label: 'Docs', to: '/explore/docs' },
  { label: 'Files', to: '/explore/files' },
];

function NavItemLi({ label, to }: NavItem) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          isActive ? `${styles.link} ${styles.linkActive}` : styles.link
        }
      >
        {label}
      </NavLink>
    </li>
  );
}

export function TopNav() {
  return (
    <nav className={styles.bar} aria-label="Primary">
      <Link to="/explore" className={styles.title}>
        Wiz6 Data Explorer
      </Link>
      <ul className={styles.links} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {DATA_SECTIONS.map((s) => (
          <NavItemLi key={s.to} {...s} />
        ))}
        <li className={styles.divider} aria-hidden="true" />
        {TOOL_SECTIONS.map((s) => (
          <NavItemLi key={s.to} {...s} />
        ))}
      </ul>
      <Link to="/" className={styles.gameLink}>
        ← Wizardry VI
      </Link>
    </nav>
  );
}
