import type { ScenarioMonster } from '@wiz6/data';
import { HexGrid } from '../../../components/HexGrid.js';
import { MONSTER_BYTE_MAP } from '../../../lib/monster-byte-map.js';
import { useMonsterDetail } from '../MonsterDetailContext.js';

interface RawBytesTabProps {
  monster: ScenarioMonster;
}

export function RawBytesTab({ monster }: RawBytesTabProps) {
  const { highlightedField, setHighlightedField } = useMonsterDetail();
  return (
    <HexGrid
      bytes={monster.statBytes}
      byteMap={MONSTER_BYTE_MAP}
      highlightedField={highlightedField}
      onHover={(offset) => {
        if (offset === null) {
          setHighlightedField(null);
          return;
        }
        for (const entry of MONSTER_BYTE_MAP) {
          if (offset >= entry.offset && offset < entry.offset + entry.length) {
            setHighlightedField(entry.fieldName);
            return;
          }
        }
        setHighlightedField(null);
      }}
      showLegend
    />
  );
}
