import { SaveSchema, type Save } from '@wiz6/data';
import { gzip, ungzip } from 'pako';

/**
 * Encode a `Save` as gzipped JSON bytes. Pure — no I/O.
 *
 * Pipeline: Save -> JSON string -> UTF-8 bytes -> gzip -> Uint8Array
 *
 * Use `encodeSaveBase64` if you need a URL-safe / localStorage-safe string.
 */
export function encodeSave(save: Save): Uint8Array {
  const json = JSON.stringify(save);
  const utf8 = new TextEncoder().encode(json);
  return gzip(utf8);
}

/**
 * Decode bytes produced by `encodeSave` back into a `Save`. Validates
 * against `SaveSchema` — throws if the payload is malformed.
 */
export function decodeSave(bytes: Uint8Array): Save {
  const utf8 = ungzip(bytes);
  const json = new TextDecoder().decode(utf8);
  const parsed = JSON.parse(json);
  return SaveSchema.parse(parsed);
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

/** Encode a Save as a base64 string. Suitable for localStorage. */
export function encodeSaveBase64(save: Save): string {
  return bytesToBase64(encodeSave(save));
}

/** Decode a base64 string back into a Save. Validates via SaveSchema. */
export function decodeSaveBase64(b64: string): Save {
  return decodeSave(base64ToBytes(b64));
}
