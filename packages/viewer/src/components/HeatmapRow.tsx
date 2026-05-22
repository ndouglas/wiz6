import styles from './HeatmapRow.module.css';

const COLD = [12, 12, 20]; // var(--color-heatmap-cold) #2a2f44 ≈ (42,47,68); using darker for low-saturation start
const HOT = [216, 168, 80]; // var(--color-heatmap-hot) #d8a850
const IMMUNITY = 125;

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function cellColor(value: number): string {
  if (value >= IMMUNITY) return ''; // immunity styling applied via class
  const t = Math.min(1, Math.max(0, value / 100));
  const r = lerp(COLD[0]!, HOT[0]!, t);
  const g = lerp(COLD[1]!, HOT[1]!, t);
  const b = lerp(COLD[2]!, HOT[2]!, t);
  return `rgb(${r}, ${g}, ${b})`;
}

interface HeatmapRowProps {
  label: string;
  values: readonly number[];
  startOffset: number;
  onHover?: (entered: boolean) => void;
}

export function HeatmapRow({ label, values, startOffset, onHover }: HeatmapRowProps) {
  return (
    <div
      className={styles.row}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <div className={styles.label}>{label}</div>
      <div className={styles.cells} role="row">
        {values.map((v, i) => {
          const offset = startOffset + i;
          const isImmunity = v >= IMMUNITY;
          const className = `${styles.cell} ${isImmunity ? styles.immunity : ''}`.trim();
          const inlineColor = isImmunity ? undefined : cellColor(v);
          return (
            <div
              key={i}
              role="cell"
              className={className}
              style={inlineColor ? { background: inlineColor } : undefined}
              title={`byte ${offset}: ${v}${isImmunity ? ' (immunity)' : '%'}`}
            >
              {v}
            </div>
          );
        })}
      </div>
    </div>
  );
}
