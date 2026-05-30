/**
 * Input layer — resolves logical key names to macOS virtual key codes + flags,
 * sends key events via the Swift helper.
 *
 * Spec: docs/superpowers/specs/2026-05-30-dosbox-mcp-dynamic-driving-design.md
 */

import type { HelperClient } from './helper-client.js';

const FLAG_SHIFT = 0x00020000;
const FLAG_CONTROL = 0x00040000;
const FLAG_OPTION = 0x00080000;
const FLAG_COMMAND = 0x00100000;

const MODIFIER_FLAGS: Record<string, number> = {
  Shift: FLAG_SHIFT,
  Ctrl: FLAG_CONTROL,
  Control: FLAG_CONTROL,
  Alt: FLAG_OPTION,
  Option: FLAG_OPTION,
  Cmd: FLAG_COMMAND,
  Command: FLAG_COMMAND,
};

// Map of logical key names → macOS virtual key codes. Authoritative for the project.
const KEY_CODES: Record<string, number> = {
  Enter: 0x24,
  Return: 0x24,
  Tab: 0x30,
  Space: 0x31,
  Backspace: 0x33,
  Escape: 0x35,
  ArrowUp: 0x7e,
  ArrowDown: 0x7d,
  ArrowLeft: 0x7b,
  ArrowRight: 0x7c,
  F1: 0x7a, F2: 0x78, F3: 0x63, F4: 0x76, F5: 0x60, F6: 0x61,
  F7: 0x62, F8: 0x64, F9: 0x65, F10: 0x6d, F11: 0x67, F12: 0x6f,
  // Letters
  a: 0x00, b: 0x0b, c: 0x08, d: 0x02, e: 0x0e, f: 0x03, g: 0x05,
  h: 0x04, i: 0x22, j: 0x26, k: 0x28, l: 0x25, m: 0x2e, n: 0x2d,
  o: 0x1f, p: 0x23, q: 0x0c, r: 0x0f, s: 0x01, t: 0x11, u: 0x20,
  v: 0x09, w: 0x0d, x: 0x07, y: 0x10, z: 0x06,
  // Digits
  '0': 0x1d, '1': 0x12, '2': 0x13, '3': 0x14, '4': 0x15,
  '5': 0x17, '6': 0x16, '7': 0x1a, '8': 0x1c, '9': 0x19,
};

// Short macro aliases — case-insensitive.
const MACRO_ALIASES: Record<string, string> = {
  down: 'ArrowDown',
  up: 'ArrowUp',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  enter: 'Enter',
  return: 'Return',
  esc: 'Escape',
  escape: 'Escape',
  tab: 'Tab',
  space: 'Space',
  backspace: 'Backspace',
};

export interface ResolvedKey {
  keyCode: number;
  flags: number;
}

export function resolveKey(spec: string): ResolvedKey {
  // Split modifier+key, e.g. "Ctrl+F5" → ["Ctrl", "F5"].
  const parts = spec.split('+');
  const keyName = parts[parts.length - 1]!;
  const modifierParts = parts.slice(0, -1);
  let flags = 0;
  for (const m of modifierParts) {
    const f = MODIFIER_FLAGS[m];
    if (f === undefined) throw new Error(`unknown modifier: ${m}`);
    flags |= f;
  }
  // Letter case → implicit shift for uppercase ASCII letters.
  if (keyName.length === 1 && keyName >= 'A' && keyName <= 'Z') {
    const kc = KEY_CODES[keyName.toLowerCase()];
    if (kc === undefined) throw new Error(`unknown key: ${keyName}`);
    return { keyCode: kc, flags: flags | FLAG_SHIFT };
  }
  const kc = KEY_CODES[keyName];
  if (kc === undefined) throw new Error(`unknown key: ${keyName}`);
  return { keyCode: kc, flags };
}

export function parseMacro(macro: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < macro.length) {
    // Skip whitespace.
    while (i < macro.length && /\s/.test(macro[i]!)) i++;
    if (i >= macro.length) break;
    // Quoted "type" segment → expand to per-character keys.
    if (macro[i] === '"') {
      i++;
      while (i < macro.length && macro[i] !== '"') {
        tokens.push(macro[i]!);
        i++;
      }
      if (macro[i] === '"') i++;
      continue;
    }
    // Whitespace-delimited token.
    let j = i;
    while (j < macro.length && !/\s/.test(macro[j]!)) j++;
    const tok = macro.slice(i, j);
    i = j;
    // Case-insensitive alias lookup.
    const aliased = MACRO_ALIASES[tok.toLowerCase()];
    tokens.push(aliased ?? tok);
  }
  return tokens;
}

export interface SendMacroOptions {
  interKeyDelayMs?: number;
}

export async function sendKey(client: HelperClient, spec: string): Promise<void> {
  const { keyCode, flags } = resolveKey(spec);
  const down = await client.send({ op: 'keyDown', keyCode, flags });
  if (!down.ok) throw new Error(`sendKey: keyDown failed: ${down.error ?? '?'}`);
  const up = await client.send({ op: 'keyUp', keyCode, flags });
  if (!up.ok) throw new Error(`sendKey: keyUp failed: ${up.error ?? '?'}`);
}

export async function sendMacro(
  client: HelperClient,
  macro: string,
  opts: SendMacroOptions = {},
): Promise<void> {
  const delayMs = opts.interKeyDelayMs ?? 30;
  const keys = parseMacro(macro);
  for (const k of keys) {
    await sendKey(client, k);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }
}
