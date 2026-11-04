/**
 * Bridge to the Android shell (see android/app/src/main/java/.../NetBridge.java).
 * When the game runs in a normal browser the bridge is absent and callers fall back.
 */

export interface AndroidBridge {
  hostStart(port: number, info: string): string;
  hostUpdateInfo(info: string): void;
  hostStop(): void;
  hostSend(conn: number, data: string): void;
  hostClose(conn: number): void;
  clientConnect(address: string, port: number): void;
  clientSend(data: string): void;
  clientClose(): void;
  discoverStart(): void;
  discoverStop(): void;
  localAddresses(): string;
  vibrate(ms: number): void;
  setKeepScreenOn(on: boolean): void;
  exitApp(): void;
  openUrl(url: string): void;
  appVersion(): string;
}

export type NativeEvent =
  | { type: 'host:open'; conn: number; addr: string }
  | { type: 'host:data'; conn: number; data: string }
  | { type: 'host:close'; conn: number }
  | { type: 'client:open' }
  | { type: 'client:data'; data: string }
  | { type: 'client:close'; reason: string }
  | { type: 'disc:found'; address: string; info: string }
  | { type: 'back' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'insets'; top: number; bottom: number; left: number; right: number };

declare global {
  interface Window {
    BSANative?: AndroidBridge;
    __bsaNative?: (events: NativeEvent[] | string) => void;
  }
}

type Listener = (e: NativeEvent) => void;
const listeners = new Set<Listener>();

export const native: AndroidBridge | null = typeof window !== 'undefined' && window.BSANative ? window.BSANative : null;
export const isAndroidApp = !!native;

if (typeof window !== 'undefined') {
  window.__bsaNative = (events) => {
    const list: NativeEvent[] = typeof events === 'string' ? JSON.parse(events) : events;
    for (const e of list) for (const l of [...listeners]) l(e);
  };
}

export function onNative(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function vibrate(ms: number): void {
  if (native) native.vibrate(ms);
  else if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms);
}

export function keepScreenOn(on: boolean): void {
  native?.setKeepScreenOn(on);
}

export function exitApp(): void {
  native?.exitApp();
}

export function openUrl(url: string): void {
  if (native) native.openUrl(url);
  else window.open(url, '_blank', 'noopener');
}

export function appVersion(): string {
  return native ? native.appVersion() : `${__APP_VERSION__} (web)`;
}

declare const __APP_VERSION__: string;
