import type { Character } from '@wiz6/data';
import { computeTotalAttributes, type CharacterDraft } from './draft.js';

export function buildCharacter(draft: CharacterDraft): Character {
  const attrs = computeTotalAttributes(draft);
  if (attrs === null) {
    throw new Error('buildCharacter: draft has no race; cannot compute attributes');
  }
  if (draft.classIdx === null) {
    throw new Error('buildCharacter: draft has no class');
  }
  const skills = Array<number>(30).fill(0);
  for (const [slotIdxStr, pts] of Object.entries(draft.skillPoints)) {
    skills[Number(slotIdxStr)] = pts;
  }
  return {
    id: crypto.randomUUID(),
    name: draft.name,
    race: draft.raceIdx ?? 0,
    class: draft.classIdx,
    level: 1,
    savedOldLevel: 0,
    xp: 0,
    gold: 0,
    conditions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    dead: false,
    paralyzed: false,
    attributes: { ...attrs, int: attrs.iq, kar: draft.karma },
    schoolMana: [0, 0, 0, 0, 0, 0],
    schoolManaMax: [0, 0, 0, 0, 0, 0],
    skills,
    reaction: 50,
    portraitIndex: attrs.spd + 1,
  };
}
