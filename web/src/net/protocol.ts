import type { Outcome } from '../core/rules';

/** Bump when messages change in an incompatible way. */
export const PROTOCOL_VERSION = 1;
export const GAME_PORT = 47777;
export const DISCOVERY_PORT = 47778;
export const MAX_PLAYERS = 4;

export type CpuLevel = 'easy' | 'normal' | 'hard';
export type Phase = 'lobby' | 'countdown' | 'playing' | 'results';

export interface PlayerInfo {
  id: number;
  name: string;
  cpu: CpuLevel | null;
  host: boolean;
  /** Disconnected mid-match. */
  left?: boolean;
}

export interface BoardSnap {
  cells: string;
  cur: number;
  nxt: number;
  score: number;
  alive: boolean;
  rank: number;
}

export interface MatchSettings {
  /** Number of bubble colors (4-6). */
  colors: number;
  startRows: number;
}

export const DEFAULT_SETTINGS: MatchSettings = { colors: 5, startRows: 6 };

/** What a host advertises to players scanning the network. */
export interface RoomAd {
  room: string;
  address: string;
  port: number;
  players: number;
  max: number;
  phase: Phase;
  v: number;
}

// ---- Client -> server ----
export type C2S =
  | { t: 'hello'; v: number; name: string }
  | { t: 'shoot'; seq: number; angle: number }
  | { t: 'swap' }
  | { t: 'ping'; ts: number }
  | { t: 'resync'; id: number };

// ---- Server -> client ----
export type S2C =
  | { t: 'welcome'; id: number; room: string }
  | { t: 'reject'; reason: string }
  | { t: 'lobby'; players: PlayerInfo[]; settings: MatchSettings; phase: Phase }
  | {
      t: 'start';
      players: PlayerInfo[];
      boards: Record<number, BoardSnap>;
      palette: number[];
      countdown: number;
    }
  | { t: 'go'; pushIn: number }
  | {
      t: 'shot';
      id: number;
      seq: number;
      angle: number;
      piece: number;
      o: Outcome;
      cur: number;
      nxt: number;
      score: number;
      combo: number;
      reward: number;
      /** Garbage sent by this shot. */
      atk: { to: number; n: number } | null;
      /** Board hash after the shot. */
      h: number;
    }
  | { t: 'nack'; seq: number }
  | { t: 'swap'; id: number; cur: number; nxt: number }
  | { t: 'garbage'; id: number; from: number; cells: [number, number][]; h: number }
  | { t: 'push'; rows: Record<number, number[]>; pushIn: number }
  | { t: 'out'; id: number; rank: number }
  | { t: 'end'; ranking: number[] }
  | { t: 'snap'; id: number; board: BoardSnap }
  | { t: 'pong'; ts: number }
  | { t: 'closed'; reason: string };

export function encode(msg: C2S | S2C): string {
  return JSON.stringify(msg);
}

export function decode<T>(data: string): T | null {
  try {
    const v = JSON.parse(data);
    return v && typeof v === 'object' && typeof v.t === 'string' ? (v as T) : null;
  } catch {
    return null;
  }
}

/** Keep player names short and printable. */
export function cleanName(name: unknown, max = 14): string {
  const s = typeof name === 'string' ? name : '';
  const cleaned = s.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
  return cleaned || 'Player';
}
