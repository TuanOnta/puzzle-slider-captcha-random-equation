/**
 * Linear Congruential Generator (LCG) — fast deterministic PRNG.
 * Using Numerical Recipes constants: a=1664525, c=1013904223, m=2³².
 * The same seed always produces the same sequence, which lets the server
 * reproduce any challenge purely from its seed.
 */
export class LCG {
  private seed: number;
  private readonly a = 1664525;
  private readonly c = 1013904223;
  private readonly m = 2 ** 32;

  constructor(seed: number) {
    this.seed = seed >>> 0; // Ensure unsigned 32-bit integer
  }

  /** Advance the state and return a float in [0, 1). */
  next(): number {
    this.seed = (this.a * this.seed + this.c) % this.m;
    return this.seed / this.m;
  }

  /** Return a random integer in the inclusive range [min, max]. */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Return the current internal seed value. */
  getSeed(): number { return this.seed; }
}
