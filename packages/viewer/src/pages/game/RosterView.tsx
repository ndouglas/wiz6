import styles from './RosterView.module.css';

export function RosterView() {
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Roster</h1>
      <p className={styles.lede}>
        Character data lives in <code>newgame.dbs</code> — 779 templates. A live roster will plug
        in once the character schema is fully decoded and a save-file model is in place.
      </p>
      <div className={styles.stub}>
        <p>Roster view placeholder.</p>
      </div>
    </main>
  );
}
