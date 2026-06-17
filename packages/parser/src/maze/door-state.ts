import { step } from './maze-geometry.js';

/**
 * DoorStateOverlay — session door-state overlay (pure, no I/O).
 *
 * Records which door edges the party has opened or jammed-shut (welded)
 * during play. Layered over the static passability data from maze records:
 * an opened edge becomes passable; a welded edge stays permanently blocked.
 *
 * A door is one physical EDGE shared by two (cell, facing) representations:
 * (gx, gy, facing) and its RECIPROCAL (destCell, (facing+2)%4) — i.e. the same
 * wall seen from the cell on the other side. The engine stores walls as a single
 * shared bit, so opening/welding affects both sides. We mirror that: open() and
 * weld() record BOTH representations, so a door opened from one side is passable
 * walking back the other way (the #091 walk-back fix). The door-record list /
 * detectDoorAtParty are still one-sided (the side the player approaches from);
 * only the runtime open/weld state needs to be edge-symmetric.
 */
export class DoorStateOverlay {
  private state = new Map<string, { open?: boolean; welded?: boolean }>();

  private key(gx: number, gy: number, facing: number): string {
    return `${gx},${gy},${facing}`;
  }

  /** The same physical edge seen from the adjacent cell: (destCell, (facing+2)%4). */
  private reciprocal(gx: number, gy: number, facing: number): [number, number, number] {
    const [dgx, dgy] = step(gx, gy, facing, 0, 1);
    return [dgx, dgy, (facing + 2) % 4];
  }

  /** Mark the door edge at (gx, gy, facing) — and its reciprocal — opened (passable). */
  open(gx: number, gy: number, facing: number): void {
    for (const [x, y, f] of [[gx, gy, facing], this.reciprocal(gx, gy, facing)]) {
      const k = this.key(x!, y!, f!);
      this.state.set(k, { ...this.state.get(k), open: true });
    }
  }

  /** Mark the door edge at (gx, gy, facing) — and its reciprocal — welded (jammed). */
  weld(gx: number, gy: number, facing: number): void {
    for (const [x, y, f] of [[gx, gy, facing], this.reciprocal(gx, gy, facing)]) {
      const k = this.key(x!, y!, f!);
      this.state.set(k, { ...this.state.get(k), welded: true });
    }
  }

  /** Returns true iff this edge has been opened. */
  isOpen(gx: number, gy: number, facing: number): boolean {
    return this.state.get(this.key(gx, gy, facing))?.open === true;
  }

  /** Returns true iff this edge has been welded shut. */
  isWelded(gx: number, gy: number, facing: number): boolean {
    return this.state.get(this.key(gx, gy, facing))?.welded === true;
  }
}
