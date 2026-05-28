/**
 * draftFromCharacter — adapt a stored Character back into a DraftState shape
 * so the creation `drawCharSheet` renderer can display it on the review screen.
 *
 * The engine's `wpcmk_view_character` (file 0x545c) reads a 432-byte character
 * record into the same staging buffer the creation flow uses, then calls the
 * same `ui_print_character_header` / `ui_redraw_character_sheet` /
 * `ui_render_stat_panel` routines. We mirror that by adapting the Character
 * back into the DraftState shape those renderers expect.
 *
 * Critical: `bonusPool` is set to **-1** so `drawStatPanel` hides the BONUS
 * row (matches the `*0x56ac = 0xffff` sentinel the engine writes at
 * `wpcmk_load_and_draw_character` line 3).
 *
 * Source: docs/re/findings/wpcmk-review-character.json.
 */

import type { Character } from '@wiz6/data';
import { type DraftState, blankDraft } from '../state.js';

export function draftFromCharacter(character: Character): DraftState {
  const base = blankDraft();
  return {
    ...base,
    name: character.name,
    race: character.race,
    sex: character.sex,
    class: character.class,
    attributes: { ...character.attributes },
    skills: [...character.skills],
    portrait: character.portraitIndex ?? 0,
    bonusPool: -1, // sentinel — hide BONUS row (engine *0x56ac = 0xffff)
    derived: {
      age: character.age ?? 0,
      // secondAge: not stored on Character; engine value at *0x5496 = 1
      // post-creation; we render "  1" to match the engine's char-sheet output.
      secondAge: 1,
      hpInitial: character.hpMax ?? character.hpCurrent ?? 0,
      stamina:   character.staminaMax ?? character.staminaCurrent ?? 0,
      goldInitial: character.gold,
      level: character.level,
      xp: character.xp,
    },
  };
}
