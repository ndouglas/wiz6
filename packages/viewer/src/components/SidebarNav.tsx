import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import styles from './SidebarNav.module.css';

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
  { label: 'Notes', to: '/explore/notes' },
  { label: 'Calibrate', to: '/explore/calibrate' },
  { label: 'Docs', to: '/explore/docs' },
  { label: 'Files', to: '/explore/files' },
];

const STORAGE_KEY = 'wiz6:explore-sidebar-open';

function readInitialOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

function NavRow({ label, to }: NavItem) {
  return (
    <li>
      <NavLink
        to={to}
        className={({ isActive }) =>
          isActive ? `${styles.link} ${styles.linkActive}` : styles.link
        }
        end
      >
        {label}
      </NavLink>
    </li>
  );
}

export function SidebarNav() {
  const [open, setOpen] = useState<boolean>(readInitialOpen);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
    } catch {
      /* private mode etc — ignore */
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={open}
        title={open ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {open ? '◀' : '☰'}
      </button>

      <aside
        className={`${styles.sidebar} ${open ? styles.sidebarOpen : styles.sidebarClosed}`}
        aria-hidden={!open}
      >
        <div className={styles.inner}>
          <Link to="/explore" className={styles.title}>
            Wiz6 Data Explorer
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            <div className={styles.groupLabel}>Data</div>
            <ul className={styles.list}>
              {DATA_SECTIONS.map((s) => (
                <NavRow key={s.to} {...s} />
              ))}
            </ul>

            <div className={styles.groupLabel}>Tools</div>
            <ul className={styles.list}>
              {TOOL_SECTIONS.map((s) => (
                <NavRow key={s.to} {...s} />
              ))}
            </ul>
          </nav>

          <Link to="/" className={styles.backLink}>
            ← Wizardry VI
          </Link>
        </div>
      </aside>
    </>
  );
}
