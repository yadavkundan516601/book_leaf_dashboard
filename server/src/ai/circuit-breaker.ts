/**
 * Circuit breaker: after `threshold` consecutive failures (or one auth
 * failure) the circuit opens and calls short-circuit without touching the
 * network. After `cooldownMs` it half-opens and admits a single trial;
 * success closes it, failure re-opens it for another cooldown.
 */
export type BreakerState = "closed" | "open" | "half_open";

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private opened = false;
  private trialInFlight = false;

  constructor(private readonly opts: { threshold: number; cooldownMs: number; now: () => number }) {}

  state(): BreakerState {
    if (!this.opened) return "closed";
    return this.opts.now() - this.openedAt >= this.opts.cooldownMs ? "half_open" : "open";
  }

  /** Reserve the right to make a call. In half-open state only one trial is admitted at a time. */
  tryAcquire(): boolean {
    const s = this.state();
    if (s === "closed") return true;
    if (s === "open" || this.trialInFlight) return false;
    this.trialInFlight = true;
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.opened = false;
    this.trialInFlight = false;
  }

  onFailure(opts: { immediate?: boolean } = {}): void {
    this.failures += 1;
    this.trialInFlight = false;
    if (opts.immediate || this.opened || this.failures >= this.opts.threshold) {
      this.opened = true;
      this.openedAt = this.opts.now();
    }
  }
}
