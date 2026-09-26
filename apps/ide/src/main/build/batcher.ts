/** Collects log lines and flushes them at most every `intervalMs` (PLAN.md 3.2 step 9: batched ~30 ms). */
export class LineBatcher {
  readonly #flush: (lines: string[]) => void;
  readonly #intervalMs: number;
  #lines: string[] = [];
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(flush: (lines: string[]) => void, intervalMs = 30) {
    this.#flush = flush;
    this.#intervalMs = intervalMs;
  }

  push(...lines: string[]): void {
    if (lines.length === 0) return;
    this.#lines.push(...lines);
    this.#timer ??= setTimeout(() => this.flush(), this.#intervalMs);
  }

  /** Sends whatever is pending now (at exit, before a result is returned). */
  flush(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (this.#lines.length === 0) return;
    const lines = this.#lines;
    this.#lines = [];
    this.#flush(lines);
  }
}
