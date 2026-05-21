import type { ScenarioMonster } from '@wiz6/data';
import { HeatmapRow } from '../../../components/HeatmapRow.js';

interface SavesTabProps {
  monster: ScenarioMonster;
}

export function SavesTab({ monster: m }: SavesTabProps) {
  return (
    <div>
      <HeatmapRow label="saveTable" values={m.saveTable} startOffset={113} />
      <HeatmapRow label="effectChanceTable" values={m.effectChanceTable} startOffset={121} />
      <HeatmapRow label="extendedSaves" values={m.extendedSaves} startOffset={85} />
      <HeatmapRow label="attributeSaves" values={m.attributeSaves} startOffset={144} />
    </div>
  );
}
