import type { WichmannHill } from '@wiz6/data';

/** The per-member fields the maze status tick reads/writes. */
export interface StatusTickMember {
  hpCurrent: number;
  hpMax: number;
  staminaCurrent: number;
  staminaMax: number;
  conditions: number[];
  statusLevel: number;
  poisonAmount: number;
  vitRegen: readonly [number, number, number] | number[];
  schoolMana: number[];
  schoolManaMax: number[];
  schoolSkill: number[];
}

/**
 * Engine-faithful maze per-turn status tick (#089; wmaze dungeon_main_loop +
 * FUN_0000_1c94). Pure: returns a NEW roster, never mutates. The `rng` is the
 * session WichmannHill (scripted in tests). See the design spec for the verified
 * mechanic; `uniform(n)` returns 0..n-1 (engine rng(n)).
 */
export function applyMazeTurnStatus(
  roster: readonly StatusTickMember[],
  turnCounter: number,
  rng: WichmannHill,
): { roster: StatusTickMember[]; allDead: boolean } {
  const out: StatusTickMember[] = roster.map((m) => ({
    ...m,
    conditions: [...m.conditions],
    schoolMana: [...m.schoolMana],
  }));

  if (turnCounter % 10 === 5) {
    const selected = Math.floor((turnCounter % 60) / 10);
    for (let i = 0; i < out.length; i++) {
      const m = out[i]!;
      if (m.statusLevel >= 3) continue; // dead/incapacitated: no tick

      // 1. poison stamina drain (selected member only), FIRST.
      if (i === selected) {
        m.staminaCurrent = Math.max(0, m.staminaCurrent - (m.poisonAmount + 1));
      }
      // 2. conditions decay (-1, floor 0, skip sentinels 0 and 0xFF).
      m.conditions = m.conditions.map((b) => (b === 0 || b === 0xff ? b : Math.max(0, b - 1)));
      // 3. HP regen (VIT triple), cap at hpMax; death if < 1.
      const v = m.vitRegen;
      const hp = Math.min(m.hpMax, m.hpCurrent + (v[0]! - v[1]! - v[2]!));
      if (hp < 1) {
        m.statusLevel = 3;
        m.hpCurrent = 0;
        m.staminaCurrent = 0;
        continue; // dead: skip stamina-empty + mana
      }
      m.hpCurrent = hp;
      // 4. stamina-empty exhaustion side-effect.
      if (m.staminaCurrent < 1) {
        m.staminaCurrent = 0;
        m.conditions[2] = 6 + rng.uniform(6);
      }
      // 5. mana regen (selected member only).
      if (i === selected) {
        for (let s = 0; s < 6; s++) {
          const sk = m.schoolSkill[s] === 0 ? 1 : m.schoolSkill[s]!;
          m.schoolMana[s] = Math.min(m.schoolManaMax[s] ?? 0, (m.schoolMana[s] ?? 0) + rng.uniform(sk + 1));
        }
      }
    }
  }

  // TODO(#089): confirm graveyard threshold (===0 vs <3) when producers/graveyard land
  const allDead = !out.some((m) => m.statusLevel === 0);
  return { roster: out, allDead };
}
