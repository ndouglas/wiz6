import { Outlet } from 'react-router-dom';
import { GameNav } from '../components/GameNav.js';

export function GameLayout() {
  return (
    <>
      <GameNav />
      <Outlet />
    </>
  );
}
