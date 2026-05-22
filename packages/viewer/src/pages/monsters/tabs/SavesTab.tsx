import type { ScenarioMonster } from '@wiz6/data';
import { HeatmapRow } from '../../../components/HeatmapRow.js';
import { useMonsterDetail } from '../MonsterDetailContext.js';
import type { MonsterFieldName } from '../../../lib/monster-byte-map.js';

interface SavesTabProps {
  monster: ScenarioMonster;
}

export function SavesTab({ monster: m }: SavesTabProps) {
  const { setHighlightedField } = useMonsterDetail();
  const hover = (field: MonsterFieldName) => (entered: boolean) => {
    setHighlightedField(entered ? field : null);
  };
  return (
    <div>
      <HeatmapRow label="saveTable" values={m.saveTable} startOffset={113} onHover={hover('saveTable')} />
      <HeatmapRow label="effectChanceTable" values={m.effectChanceTable} startOffset={121} onHover={hover('effectChanceTable')} />
      <HeatmapRow label="extendedSaves" values={m.extendedSaves} startOffset={85} onHover={hover('extendedSaves')} />
      <HeatmapRow label="attributeSaves" values={m.attributeSaves} startOffset={144} onHover={hover('attributeSaves')} />
    </div>
  );
}
