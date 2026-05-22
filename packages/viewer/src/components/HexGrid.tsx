import type { MonsterByteField, MonsterByteGroup, MonsterFieldName } from '../lib/monster-byte-map.js';
import { fieldAtOffset } from '../lib/monster-byte-map.js';
import styles from './HexGrid.module.css';

const GROUP_CLASS: Record<MonsterByteGroup, string> = {
  core: styles.groupCore!,
  attack: styles.groupAttack!,
  save: styles.groupSave!,
  sprite: styles.groupSprite!,
  family: styles.groupFamily!,
  meta: styles.groupMeta!,
};

const GROUP_ORDER: MonsterByteGroup[] = ['core', 'attack', 'save', 'sprite', 'family', 'meta'];

interface HexGridProps {
  bytes: readonly number[];
  byteMap: readonly MonsterByteField[];
  highlightedField?: MonsterFieldName | null;
  onHover?: (offset: number | null) => void;
  showLegend?: boolean;
}

function toHex(b: number): string {
  return b.toString(16).padStart(2, '0');
}

export function HexGrid({
  bytes,
  byteMap,
  highlightedField,
  onHover,
  showLegend = false,
}: HexGridProps) {
  const total = bytes.length;
  const rows = Math.ceil(total / 16);

  // Compute which offsets belong to the highlighted field (if any).
  const highlightOffsets = new Set<number>();
  if (highlightedField) {
    for (const entry of byteMap) {
      if (entry.fieldName === highlightedField) {
        for (let i = 0; i < entry.length; i++) highlightOffsets.add(entry.offset + i);
      }
    }
  }

  const cells: React.ReactNode[] = [];

  // Top-left corner + 16 column headers
  cells.push(
    <div key="corner" className={styles.headerCorner} />,
    ...Array.from({ length: 16 }, (_, c) => (
      <div key={`col-${c}`} className={styles.colHeader}>
        {c.toString(16)}
      </div>
    )),
  );

  for (let row = 0; row < rows; row++) {
    cells.push(
      <div key={`row-${row}`} className={styles.rowHeader}>
        {(row * 16).toString(16).padStart(3, '0')}
      </div>,
    );
    for (let col = 0; col < 16; col++) {
      const offset = row * 16 + col;
      if (offset >= total) {
        cells.push(<div key={`empty-${offset}`} />);
        continue;
      }
      const entry = fieldAtOffset(offset);
      const groupClass = entry ? GROUP_CLASS[entry.group] : '';
      const isHighlighted = highlightOffsets.has(offset);
      const className = `${styles.cell} ${groupClass} ${isHighlighted ? styles.highlight : ''}`.trim();
      const title = entry
        ? `byte ${offset}: ${entry.label} (${entry.fieldName})`
        : `byte ${offset}: unmapped`;
      cells.push(
        <div
          key={offset}
          role="cell"
          className={className}
          title={title}
          onMouseEnter={() => onHover?.(offset)}
          onMouseLeave={() => onHover?.(null)}
        >
          {toHex(bytes[offset]!)}
        </div>,
      );
    }
  }

  return (
    <div>
      <div className={styles.grid}>{cells}</div>
      {showLegend ? (
        <div className={styles.legend}>
          <span>legend:</span>
          {GROUP_ORDER.map((g) => (
            <span key={g} className={styles.legendItem}>
              <span
                className={`${styles.legendSwatch} ${GROUP_CLASS[g] ?? ''}`.trim()}
              />
              {g}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
