/**
 * DoorStateOverlay — session door-state overlay (pure, no I/O).
 *
 * Records which door edges the party has opened or jammed-shut (welded)
 * during play. Layered over the static passability data from maze records:
 * an opened edge becomes passable; a welded edge stays permanently blocked.
 *
 * Keyed by (gx, gy, facing) — the same triple that identifies a door in
 * the decoded door-record list and the detectDoorAtParty result.
 */
export class DoorStateOverlay {
  private state = new Map<string, { open?: boolean; welded?: boolean }>();

  private key(gx: number, gy: number, facing: number): string {
    return `${gx},${gy},${facing}`;
  }

  /** Mark the door edge at (gx, gy, facing) as opened (passable). */
  open(gx: number, gy: number, facing: number): void {
    const k = this.key(gx, gy, facing);
    this.state.set(k, { ...this.state.get(k), open: true });
  }

  /** Mark the door edge at (gx, gy, facing) as welded (permanently jammed). */
  weld(gx: number, gy: number, facing: number): void {
    const k = this.key(gx, gy, facing);
    this.state.set(k, { ...this.state.get(k), welded: true });
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
