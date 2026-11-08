import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { COLS, GRID_ROWS } from '../src/core/constants';
import { hittableColors } from '../src/core/queue';
import { GAME_PORT } from '../src/net/protocol';
import { CODE_ALPHABET, addressForCode, makeRoomCode, parseRoomCode } from '../src/net/roomCode';

describe('room codes', () => {
  it('are 5 characters from the safe alphabet and round-trip the address', () => {
    const ips = ['192.168.1.23', '192.168.43.1', '10.0.0.5', '172.20.10.2', '192.168.0.255', '10.255.255.254'];
    for (const ip of ips) {
      for (const port of [GAME_PORT, GAME_PORT + 1]) {
        const code = makeRoomCode(ip, port)!;
        expect(code).toHaveLength(5);
        expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
        const parsed = parseRoomCode(code.toLowerCase())!;
        expect(parsed.port).toBe(port);
        expect(addressForCode(parsed, [], [ip.split('.')[0] + '.1.2.3'])).toBe(ip);
      }
    }
  });

  it('gives neighbouring addresses different codes', () => {
    const codes = new Set<string>();
    for (let i = 1; i < 255; i++) codes.add(makeRoomCode(`192.168.1.${i}`, GAME_PORT)!);
    expect(codes.size).toBe(254);
  });

  it('rejects bad input and uncodable hosts', () => {
    expect(parseRoomCode('ABC')).toBeNull();
    expect(parseRoomCode('AB0O1')).toBeNull();
    expect(makeRoomCode('not an ip', GAME_PORT)).toBeNull();
    expect(makeRoomCode('192.168.1.2', GAME_PORT + 5)).toBeNull();
  });

  it('prefers an address already seen on the network', () => {
    const parsed = parseRoomCode(makeRoomCode('10.1.2.3', GAME_PORT)!)!;
    expect(addressForCode(parsed, ['192.168.9.9', '10.1.2.3'], ['192.168.5.5'])).toBe('10.1.2.3');
  });
});

describe('hittable colors', () => {
  it('only counts bubbles that touch open space reachable from the launcher', () => {
    const b = new Board();
    // Row 0: color 1 everywhere; row 1: color 2 sealing it off from below.
    for (let c = 0; c < b.rowLen(0); c++) b.set(0, c, 1);
    for (let c = 0; c < b.rowLen(1); c++) b.set(1, c, 2);
    const colors = hittableColors(b);
    expect(colors.length).toBeGreaterThan(0);
    expect(colors.every((v) => v === 2)).toBe(true);
    expect(GRID_ROWS * COLS).toBe(b.cells.length);
  });
});
