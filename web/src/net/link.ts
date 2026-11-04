/** One end of a message connection (a socket, a browser channel, or an in-memory pipe). */
export interface Link {
  send(data: string): void;
  close(): void;
}

export interface LinkHandlers {
  onData(data: string): void;
  onClose(reason: string): void;
}

/**
 * In-memory connection pair, used for the host's own player and for offline CPU matches.
 * Delivery is asynchronous (microtask) so ordering behaves like a real network.
 */
export function loopbackPair(): { a: LoopEnd; b: LoopEnd } {
  const a = new LoopEnd();
  const b = new LoopEnd();
  a.peer = b;
  b.peer = a;
  return { a, b };
}

export class LoopEnd implements Link {
  peer: LoopEnd | null = null;
  handlers: LinkHandlers | null = null;
  private closed = false;
  private queue: string[] = [];
  private scheduled = false;

  send(data: string): void {
    const peer = this.peer;
    if (this.closed || !peer) return;
    peer.queue.push(data);
    peer.schedule();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const items = this.queue;
      this.queue = [];
      for (const d of items) if (!this.closed) this.handlers?.onData(d);
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const peer = this.peer;
    this.peer = null;
    if (peer && !peer.closed) {
      peer.closed = true;
      peer.peer = null;
      queueMicrotask(() => peer.handlers?.onClose('closed'));
    }
  }
}
