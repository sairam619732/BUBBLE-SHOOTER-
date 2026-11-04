import { LEVEL_COUNT } from './core/levels';

export interface Settings {
  sound: boolean;
  music: boolean;
  vibration: boolean;
  symbols: boolean;
  aimGuide: boolean;
  name: string;
}

export interface Progress {
  /** Highest level that can be played. */
  unlocked: number;
  stars: Record<number, number>;
  best: Record<number, number>;
}

export interface Stats {
  arcadeBest: number;
  arcadeBestLevel: number;
  mpWins: number;
  mpGames: number;
}

const KEY = 'bsa.v1.';

function load<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(KEY + name);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function save(name: string, value: unknown): void {
  try {
    localStorage.setItem(KEY + name, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode); progress is kept for this session only */
  }
}

export const settings: Settings = load<Settings>('settings', {
  sound: true,
  music: true,
  vibration: true,
  symbols: false,
  aimGuide: true,
  name: '',
});

export const progress: Progress = load<Progress>('progress', { unlocked: 1, stars: {}, best: {} });
export const stats: Stats = load<Stats>('stats', { arcadeBest: 0, arcadeBestLevel: 0, mpWins: 0, mpGames: 0 });

export function saveSettings(): void {
  save('settings', settings);
}

export function saveStats(): void {
  save('stats', stats);
}

/** Records a level result. Returns true if it is a new best score. */
export function recordLevel(id: number, stars: number, score: number): boolean {
  const newBest = score > (progress.best[id] ?? 0);
  progress.stars[id] = Math.max(progress.stars[id] ?? 0, stars);
  if (newBest) progress.best[id] = score;
  if (stars > 0) progress.unlocked = Math.min(LEVEL_COUNT, Math.max(progress.unlocked, id + 1));
  save('progress', progress);
  return newBest;
}

export function totalStars(): number {
  return Object.values(progress.stars).reduce((a, b) => a + b, 0);
}

export function resetProgress(): void {
  progress.unlocked = 1;
  progress.stars = {};
  progress.best = {};
  stats.arcadeBest = 0;
  stats.arcadeBestLevel = 0;
  stats.mpWins = 0;
  stats.mpGames = 0;
  save('progress', progress);
  saveStats();
}
