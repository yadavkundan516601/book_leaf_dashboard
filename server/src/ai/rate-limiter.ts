/**
 * Process-wide, provider-independent request limiter (sliding window).
 *
 * Free-tier LLM quotas are a few requests per minute and are not published
 * precisely, so the app paces itself instead of collecting 429s. At most
 * `limit` calls start in any `windowMs` window. When the window is full a
 * call waits in a FIFO queue for up to `maxWaitMs`; if its slot cannot come
 * in time (or the queue is full) it is rejected at once with
 * AiError("rate_limited") so the caller falls back to rules/templates
 * instead of hanging.
 */
import { AiError } from "./provider.js";

export interface LimiterClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/**
 * Timers stay ref'd: they only exist while a call is waiting, and a waiting
 * call must keep a script (e.g. the classifier eval) alive.
 */
const realClock: LimiterClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface RateLimiterOptions {
  /** Calls admitted per window. */
  limit: number;
  windowMs?: number;
  /** Longest a call may wait for a slot before it is rejected. */
  maxWaitMs: number;
  /** Waiting calls beyond this are rejected immediately. */
  maxQueue?: number;
  clock?: LimiterClock;
}

interface Waiter {
  resolve: () => void;
  reject: (e: AiError) => void;
  timer: unknown;
}

export interface RateLimiter {
  /** Resolves when the call may start; rejects with AiError("rate_limited"). */
  acquire(): Promise<void>;
  /** Calls currently waiting (tests, diagnostics). */
  queued(): number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const windowMs = opts.windowMs ?? 60_000;
  const maxQueue = opts.maxQueue ?? 20;
  const clock = opts.clock ?? realClock;
  /** Start times of admitted calls inside the current window, oldest first. */
  const grants: number[] = [];
  const queue: Waiter[] = [];
  let pumpTimer: unknown = null;

  const prune = (now: number) => {
    while (grants.length > 0 && grants[0]! <= now - windowMs) grants.shift();
  };

  const reject = (why: string) => new AiError("rate_limited", `AI request limit reached (${opts.limit}/min): ${why}`);

  function schedulePump() {
    if (pumpTimer !== null || queue.length === 0 || grants.length === 0) return;
    const delay = Math.max(0, grants[0]! + windowMs - clock.now());
    pumpTimer = clock.setTimeout(() => {
      pumpTimer = null;
      pump();
    }, delay);
  }

  function pump() {
    const now = clock.now();
    prune(now);
    while (queue.length > 0 && grants.length < opts.limit) {
      const w = queue.shift()!;
      clock.clearTimeout(w.timer);
      grants.push(now);
      w.resolve();
    }
    schedulePump();
  }

  return {
    queued: () => queue.length,
    acquire() {
      const now = clock.now();
      prune(now);
      if (queue.length === 0 && grants.length < opts.limit) {
        grants.push(now);
        return Promise.resolve();
      }
      if (queue.length >= maxQueue) return Promise.reject(reject("queue full"));
      // Waiters are served in order as the oldest grants expire, so the slot
      // this call would get is predictable: refuse now rather than after a
      // pointless wait. (Beyond the current window it is a lower bound; the
      // waiter's own timer still enforces maxWaitMs.)
      const slotIndex = grants.length - opts.limit + queue.length;
      const slotAt = slotIndex < 0 ? now : slotIndex < grants.length ? grants[slotIndex]! + windowMs : now + windowMs;
      if (slotAt - now > opts.maxWaitMs) return Promise.reject(reject("no slot within the wait limit"));

      return new Promise<void>((resolve, rej) => {
        const waiter: Waiter = { resolve, reject: rej, timer: null };
        waiter.timer = clock.setTimeout(() => {
          const i = queue.indexOf(waiter);
          if (i >= 0) queue.splice(i, 1);
          rej(reject("waited too long"));
        }, opts.maxWaitMs);
        queue.push(waiter);
        schedulePump();
      });
    },
  };
}
