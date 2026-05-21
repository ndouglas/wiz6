import { useEffect, useMemo, useState } from 'react';
import type { ScenarioDb } from '@wiz6/data';
import { loadScenarioDb } from '../data-loader.js';

interface Props {
  url: string;
}

function fmtByte(b: number): string {
  return b.toString(16).padStart(2, '0');
}

const EQUIP_SLOT_LABELS: Record<number, string> = {
  0: 'weapon-1H',
  1: 'pole',
  2: 'thrown',
  3: 'ranged',
  4: 'ammo',
  5: 'cloak',
  6: 'head',
  7: 'body',
  8: 'legs',
  9: 'hands',
  10: 'feet',
  11: 'shield',
  12: 'potion',
  13: 'scroll',
  14: 'instrument/book',
  15: 'key',
  16: 'dust',
};

function fmtDamage(count: number, sides: number, bonus: number): string {
  if (count === 0 && sides === 0) return '—';
  const base = `${count}d${sides}`;
  return bonus ? `${base}+${bonus}` : base;
}

function fmtClasses(mask: number): string {
  if (mask === 0) return '—';
  if (mask === 0x3fff) return 'all 14';
  const bits: number[] = [];
  for (let i = 0; i < 14; i++) {
    if ((mask >> i) & 1) bits.push(i);
  }
  return bits.join(',');
}

export function ScenarioGallery({ url }: Props) {
  const [db, setDb] = useState<ScenarioDb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideEmpty, setHideEmpty] = useState(true);
  const [showRaw, setShowRaw] = useState(false);
  const [search, setSearch] = useState('');
  const [hideEmptyMonsters, setHideEmptyMonsters] = useState(true);
  const [monsterSearch, setMonsterSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadScenarioDb(url)
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [url]);

  const visibleItems = useMemo(() => {
    if (!db) return [];
    let filtered = db.items;
    if (hideEmpty) filtered = filtered.filter((it) => !it.empty);
    if (search) {
      const q = search.toUpperCase();
      filtered = filtered.filter(
        (it) =>
          it.name1.toUpperCase().includes(q) ||
          it.name2.toUpperCase().includes(q) ||
          String(it.index) === q,
      );
    }
    return filtered;
  }, [db, hideEmpty, search]);

  const visibleMonsters = useMemo(() => {
    if (!db) return [];
    let filtered = db.monsters;
    if (hideEmptyMonsters) filtered = filtered.filter((m) => !m.empty);
    if (monsterSearch) {
      const q = monsterSearch.toUpperCase();
      filtered = filtered.filter(
        (m) =>
          m.nameIdSingular.toUpperCase().includes(q) ||
          m.nameUnidSingular.toUpperCase().includes(q) ||
          String(m.index) === q,
      );
    }
    return filtered;
  }, [db, hideEmptyMonsters, monsterSearch]);

  if (error) return <p>Failed to load {url}: {error}</p>;
  if (!db) return <p>Loading {url}…</p>;

  const nonEmptyItems = db.items.filter((it) => !it.empty).length;
  const nonEmptyMonsters = db.monsters.filter((m) => !m.empty).length;

  return (
    <section>
      <h2>
        {db.id} — {db.xpTables.length} XP tables, {db.itemCount} items ({nonEmptyItems} filled)
        , {db.monsterCount} monsters ({nonEmptyMonsters} filled),{' '}
        {db.unknownPreMonster.length}-byte pre-monster region, {db.unknownTail.length}-byte tail
      </h2>

      <h3 style={{ marginTop: '1em' }}>XP-per-level by character class</h3>
      <table
        style={{
          fontFamily: 'monospace',
          fontSize: '0.78em',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'right' }}>
            <th style={{ textAlign: 'left' }}>class</th>
            {Array.from({ length: 16 }, (_, i) => (
              <th key={i} style={{ paddingLeft: '0.5em' }}>L{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {db.xpTables.map((t) => (
            <tr key={t.classIndex} style={{ borderBottom: '1px solid #222', textAlign: 'right' }}>
              <td style={{ textAlign: 'left', color: '#888' }}>#{t.classIndex}</td>
              {t.levels.map((v, i) => (
                <td key={i} style={{ paddingLeft: '0.5em' }}>{v.toLocaleString()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: '1.5em' }}>Items (74-byte records)</h3>
      <div style={{ marginBottom: '0.5em', fontSize: '0.9em' }}>
        <label style={{ marginRight: '1em' }}>
          <input
            type="checkbox"
            checked={hideEmpty}
            onChange={() => setHideEmpty(!hideEmpty)}
          />{' '}
          hide empty slots
        </label>
        <label style={{ marginRight: '1em' }}>
          <input
            type="checkbox"
            checked={showRaw}
            onChange={() => setShowRaw(!showRaw)}
          />{' '}
          show raw bytes
        </label>
        <label>
          search:{' '}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="DAGGER / 42"
            style={{ width: '12em', fontFamily: 'monospace' }}
          />
        </label>
        <span style={{ marginLeft: '1em', color: '#888' }}>
          showing {visibleItems.length} / {db.itemCount}
        </span>
      </div>
      <table
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: '0.78em',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'left' }}>
            <th style={{ width: '3em' }}>#</th>
            <th style={{ width: '11em' }}>name</th>
            <th style={{ width: '7em' }}>slot</th>
            <th style={{ width: '4em', textAlign: 'right' }}>price</th>
            <th style={{ width: '6em' }}>damage</th>
            <th style={{ width: '4em', textAlign: 'right' }}>wt</th>
            <th style={{ width: '5em' }}>spell/song</th>
            <th>classes (14 bits)</th>
            {showRaw && <th>bytes (hex)</th>}
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((it) => {
            const slotLabel = EQUIP_SLOT_LABELS[it.equipSlot] ?? `slot ${it.equipSlot}`;
            const isWeapon = it.equipSlot <= 4;
            const isCaster = it.equipSlot === 13 || it.equipSlot === 14;
            const name = it.name1 + (it.name2 ? ` (${it.name2})` : '');
            return (
              <tr key={it.index} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ color: it.empty ? '#444' : '#888', verticalAlign: 'top' }}>
                  {it.index}
                </td>
                <td style={{ verticalAlign: 'top' }}>{name}</td>
                <td style={{ verticalAlign: 'top', color: '#aaa' }}>{slotLabel}</td>
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  {it.price > 0 ? it.price.toLocaleString() : '—'}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {isWeapon
                    ? fmtDamage(it.damageDiceCount, it.damageDiceSides, it.hitBonus)
                    : '—'}
                </td>
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  {it.weight > 0 ? (it.weight / 10).toFixed(1) : '—'}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {isCaster && it.spellOrSongId > 0 ? `#${it.spellOrSongId}` : '—'}
                </td>
                <td style={{ verticalAlign: 'top', color: '#aaa' }}>{fmtClasses(it.classMask)}</td>
                {showRaw && (
                  <td style={{ whiteSpace: 'pre' }}>
                    {it.bytes.map((b, i) => {
                      const isZero = b === 0;
                      const sep = (i + 1) % 16 === 0 ? '\n' : ' ';
                      return (
                        <span key={i} style={{ color: isZero ? '#444' : '#ddd' }}>
                          {fmtByte(b)}{sep}
                        </span>
                      );
                    })}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ marginTop: '1.5em' }}>Monsters (222-byte records, 4 name slots + 158 stat bytes)</h3>
      <div style={{ marginBottom: '0.5em', fontSize: '0.9em' }}>
        <label style={{ marginRight: '1em' }}>
          <input
            type="checkbox"
            checked={hideEmptyMonsters}
            onChange={() => setHideEmptyMonsters(!hideEmptyMonsters)}
          />{' '}
          hide empty slots
        </label>
        <label>
          search:{' '}
          <input
            type="text"
            value={monsterSearch}
            onChange={(e) => setMonsterSearch(e.target.value)}
            placeholder="RAT / 42"
            style={{ width: '12em', fontFamily: 'monospace' }}
          />
        </label>
        <span style={{ marginLeft: '1em', color: '#888' }}>
          showing {visibleMonsters.length} / {db.monsterCount}
        </span>
      </div>
      <table
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: '0.78em',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'left' }}>
            <th style={{ width: '3em' }}>#</th>
            <th style={{ width: '13em' }}>identified (sing / plur)</th>
            <th style={{ width: '13em' }}>unidentified (sing / plur)</th>
            <th style={{ width: '6em', textAlign: 'right' }}>XP</th>
            <th style={{ width: '5em' }}>HP</th>
            <th style={{ width: '6em' }}>group</th>
            <th style={{ width: '5em' }}>atk 1</th>
            <th style={{ width: '5em' }}>atk 2</th>
            {showRaw && <th>stat bytes (hex)</th>}
          </tr>
        </thead>
        <tbody>
          {visibleMonsters.map((m) => {
            const idName = m.nameIdSingular + (m.nameIdPlural ? ` / ${m.nameIdPlural}` : '');
            const unidName = m.nameUnidSingular + (m.nameUnidPlural ? ` / ${m.nameUnidPlural}` : '');
            return (
              <tr key={m.index} style={{ borderBottom: '1px solid #222' }}>
                <td style={{ color: m.empty ? '#444' : '#888', verticalAlign: 'top' }}>
                  {m.index}
                </td>
                <td style={{ verticalAlign: 'top' }}>{idName}</td>
                <td style={{ verticalAlign: 'top', color: '#aaa' }}>{unidName}</td>
                <td style={{ verticalAlign: 'top', textAlign: 'right' }}>
                  {m.xpOnKill > 0 ? m.xpOnKill.toLocaleString() : '—'}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {fmtDamage(m.hpDiceCount, m.hpDiceSides, 0)}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {fmtDamage(m.groupDiceCount, m.groupDiceSides, 0)}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {fmtDamage(m.attack1DiceCount, m.attack1DiceSides, 0)}
                </td>
                <td style={{ verticalAlign: 'top', color: '#aaa' }}>
                  {fmtDamage(m.attack2DiceCount, m.attack2DiceSides, 0)}
                </td>
                {showRaw && (
                  <td style={{ whiteSpace: 'pre' }}>
                    {m.statBytes.map((b, i) => {
                      const isZero = b === 0;
                      const sep = (i + 1) % 16 === 0 ? '\n' : ' ';
                      return (
                        <span key={i} style={{ color: isZero ? '#444' : '#ddd' }}>
                          {fmtByte(b)}{sep}
                        </span>
                      );
                    })}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
