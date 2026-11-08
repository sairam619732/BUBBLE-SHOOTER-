import { GAME_PORT } from './protocol';

/**
 * 5-character room codes like "K7P2M". A code holds the last three parts of the host's
 * Wi-Fi address (players on the same network share the first part) and which of the first
 * two game ports it uses, so joining by code works even where "Games nearby" is blocked.
 * No 0, 1, I or O, so codes can't be misread.
 */
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 5;
const SPACE = 32 ** CODE_LENGTH; // 2^25: 24 bits of address + 1 bit of port
const TAIL = 2 ** 24;
const PORT_SLOTS = SPACE / TAIL;
/** Odd, so it mixes codes one-to-one: neighbouring addresses get unrelated-looking codes. */
const MUL = 12_345_679;
const MUL_INV = modInverse(MUL, SPACE);

export interface RoomCode {
  /** Last three parts of the host's IPv4 address. */
  tail: [number, number, number];
  port: number;
}

/** The code for a host at `ip`:`port`, or null if it can't be expressed as one. */
export function makeRoomCode(ip: string, port: number): string | null {
  const o = parseIPv4(ip);
  const slot = port - GAME_PORT;
  if (!o || slot < 0 || slot >= PORT_SLOTS) return null;
  let n = mulMod(slot * TAIL + o[1] * 65536 + o[2] * 256 + o[3], MUL, SPACE);
  let s = '';
  for (let k = 0; k < CODE_LENGTH; k++) {
    s = CODE_ALPHABET[n % 32] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

/** Tidies what a player typed: upper case, no spaces or dashes. */
export function cleanCode(text: string): string {
  return text.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isRoomCode(text: string): boolean {
  const c = cleanCode(text);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
}

export function parseRoomCode(text: string): RoomCode | null {
  if (!isRoomCode(text)) return null;
  let n = 0;
  for (const ch of cleanCode(text)) n = n * 32 + CODE_ALPHABET.indexOf(ch);
  n = mulMod(n, MUL_INV, SPACE);
  const slot = Math.floor(n / TAIL);
  const t = n % TAIL;
  return { tail: [Math.floor(t / 65536), Math.floor(t / 256) % 256, t % 256], port: GAME_PORT + slot };
}

/**
 * Turns a code into an address to connect to. Prefers a room already seen on the network;
 * otherwise borrows the first part of this phone's own Wi-Fi address.
 */
export function addressForCode(code: RoomCode, seen: string[], myAddresses: string[]): string {
  const tail = code.tail.join('.');
  const hit = seen.find((a) => a.split('.').slice(1).join('.') === tail);
  if (hit) return hit;
  const first = myAddresses.map(parseIPv4).find((o) => o !== null)?.[0] ?? 192;
  return `${first}.${tail}`;
}

function parseIPv4(ip: string): number[] | null {
  const parts = ip.trim().split('.');
  if (parts.length !== 4) return null;
  const o = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  return o.every((v) => v >= 0 && v <= 255) ? o : null;
}

/** (a * b) mod m without losing precision: both inputs stay below 2^25. */
function mulMod(a: number, b: number, m: number): number {
  const hi = Math.floor(b / 4096);
  const lo = b % 4096;
  return (((a * hi) % m) * 4096 + a * lo) % m;
}

function modInverse(a: number, m: number): number {
  let [r0, r1] = [a % m, m];
  let [x0, x1] = [1, 0];
  while (r1) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [x0, x1] = [x1, x0 - q * x1];
  }
  return ((x0 % m) + m) % m;
}
