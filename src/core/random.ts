/** A source of uniform random integers in [0, n). Injectable so tests can be deterministic. */
export type RandomInt = (n: number) => number;

/**
 * Cryptographically secure, unbiased random integer in [0, n).
 * Uses rejection sampling so every value is exactly equally likely.
 */
export const secureRandomInt: RandomInt = (n) => {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) {
    throw new RangeError(`secureRandomInt: invalid range ${n}`);
  }
  const limit = Math.floor(2 ** 32 / n) * n;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % n;
};
