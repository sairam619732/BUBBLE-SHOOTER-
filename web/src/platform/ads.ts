import { native, onNative } from './native';

/**
 * Google AdMob, through the Android app (see AdsManager.java). In a browser there are no ads:
 * every check says "not ready" and every call resolves straight away.
 */

export interface AdsStatus {
  rewarded: boolean;
  interstitial: boolean;
  /** The player may change ad consent (Settings > Privacy choices). */
  privacy: boolean;
}

const NONE: AdsStatus = { rewarded: false, interstitial: false, privacy: false };

/** Extra shots a rewarded ad gives on a level. */
export const AD_EXTRA_SHOTS = 5;

/** Interstitials: at most one per this many natural breaks, and never closer than this gap. */
const BREAKS_PER_INTERSTITIAL = 3;
const MIN_GAP_MS = 3 * 60_000;
/** No interstitial in the first minute of play. */
const WARMUP_MS = 60_000;

const sessionStart = Date.now();
let lastAdAt = 0;
let breaks = 0;

export function adsStatus(): AdsStatus {
  if (!native?.adsStatus) return NONE;
  try {
    return { ...NONE, ...JSON.parse(native.adsStatus()) };
  } catch {
    return NONE;
  }
}

/** Waits for the app to report that the ad of this kind closed. Resolves with "reward earned". */
function waitClosed(kind: 'rewarded' | 'interstitial'): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (rewarded: boolean) => {
      if (done) return;
      done = true;
      off();
      clearTimeout(timer);
      lastAdAt = Date.now();
      resolve(rewarded);
    };
    const off = onNative((e) => {
      if (e.type === 'ad:closed' && e.kind === kind) finish(!!e.rewarded);
    });
    // Safety net in case the close event never arrives. Page timers keep running while an ad
    // is open, so allow plenty of time: a player may sit on an ad's end screen for a while.
    const timer = setTimeout(() => finish(false), 15 * 60_000);
  });
}

/** Shows a rewarded ad. Resolves true only if the player watched it to the end. */
export async function showRewardedAd(): Promise<boolean> {
  if (!native?.showRewarded || !adsStatus().rewarded) return false;
  const closed = waitClosed('rewarded');
  native.showRewarded();
  return closed;
}

/**
 * Call when the player leaves a finished game (a natural break). Now and then this shows an
 * interstitial first; resolves once it's gone, or right away.
 */
export async function adBreak(): Promise<void> {
  breaks++;
  if (!native?.showInterstitial) return;
  const now = Date.now();
  if (breaks < BREAKS_PER_INTERSTITIAL || now - lastAdAt < MIN_GAP_MS || now - sessionStart < WARMUP_MS) return;
  if (!adsStatus().interstitial) return;
  breaks = 0;
  const closed = waitClosed('interstitial');
  native.showInterstitial();
  await closed;
}

export function showPrivacyOptions(): void {
  native?.showPrivacyOptions?.();
}
