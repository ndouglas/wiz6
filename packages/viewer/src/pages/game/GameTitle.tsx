import { Link } from 'react-router-dom';
import { ScreenGallery } from '../../views/ScreenGallery.js';
import { WIZ6_TITLE_PALETTE } from '../../palettes/index.js';
import styles from './GameTitle.module.css';

export function GameTitle() {
  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Wizardry VI: Bane of the Cosmic Forge</h1>
      <div className={styles.hero} data-testid="game-title-hero">
        <ScreenGallery url="/screens/titlepag.json" palette={WIZ6_TITLE_PALETTE} hideHeader />
      </div>
      <div className={styles.cta}>
        <Link to="/castle" className={styles.enter}>
          Enter
        </Link>
      </div>
      <p className={styles.footer}>
        Wizardry VI: Bane of the Cosmic Forge © 1990 Sir-Tech Software, Inc.
        Reimplementation in progress; see <Link to="/explore">the data explorer</Link> for the
        decoded source assets.
      </p>
    </main>
  );
}
