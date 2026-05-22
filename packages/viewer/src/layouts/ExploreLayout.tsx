import { Outlet } from 'react-router-dom';
import { TopNav } from '../components/TopNav.js';

export function ExploreLayout() {
  return (
    <>
      <TopNav />
      <Outlet />
    </>
  );
}
