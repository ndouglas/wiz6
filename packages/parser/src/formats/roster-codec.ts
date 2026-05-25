import { RosterSchema, type Roster } from '@wiz6/data';
import { gzip, ungzip } from 'pako';

/**
 * Encode a `Roster` as gzipped JSON bytes. Pure — no I/O.
 *
 * Pipeline: Roster -> JSON string -> UTF-8 bytes -> gzip -> Uint8Array
 *
 * Use `encodeRosterBase64` if you need a URL-safe / localStorage-safe string.
 */
export function encodeRoster(roster: Roster): Uint8Array {
  const json = JSON.stringify(roster);
  const utf8 = new TextEncoder().encode(json);
  return gzip(utf8);
}

/**
 * Decode bytes produced by `encodeRoster` back into a `Roster`. Validates
 * against `RosterSchema` — throws if the payload is malformed.
 */
export function decodeRoster(bytes: Uint8Array): Roster {
  const utf8 = ungzip(bytes);
  const json = new TextDecoder().decode(utf8);
  const parsed = JSON.parse(json);
  return RosterSchema.parse(parsed);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Encode a Roster as a base64 string. Suitable for localStorage. */
export function encodeRosterBase64(roster: Roster): string {
  return bytesToBase64(encodeRoster(roster));
}

/** Decode a base64 string back into a Roster. Validates via RosterSchema. */
export function decodeRosterBase64(b64: string): Roster {
  return decodeRoster(base64ToBytes(b64));
}
