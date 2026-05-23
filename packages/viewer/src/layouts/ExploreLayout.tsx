import { Outlet } from 'react-router-dom';
import { SidebarNav } from '../components/SidebarNav.js';
import styles from './ExploreLayout.module.css';

export function ExploreLayout() {
  return (
    <div className={styles.shell}>
      <SidebarNav />
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
