/**
 * Java's numbers, exactly (Phase 7a, DESIGN-PHASE7.md): java.util.Random, String.hashCode and
 * Java long arithmetic, so Play mode picks the same pool entry as SagaLib from the same seed
 * (golden case pools.json). BigInt for the 64-bit parts.
 */
const MASK64 = (1n << 64n) - 1n
const MASK48 = (1n << 48n) - 1n
const MULT = 0x5DEECE66Dn

/** A Java long (signed 64-bit) from any BigInt. */
export const long = (v: bigint): bigint => BigInt.asIntN(64, v)

/** Java's String.hashCode (an int). */
export function javaHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

/** java.util.Random: the same sequence as Java for the same seed. */
export class JavaRandom {
  private seed: bigint
  constructor(seed: bigint) { this.seed = (BigInt.asUintN(64, seed) ^ MULT) & MASK48 }
  private next(bits: number): number {
    this.seed = (this.seed * MULT + 0xBn) & MASK48
    // (int)(seed >>> (48 - bits)): the top bits, as a signed 32-bit int
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)))
  }
  nextInt(): number { return this.next(32) }
  /** next(24) / 2^24, as Java's float. */
  nextFloat(): number { return Math.fround(this.next(24) / (1 << 24)) }
}

/** SplitMix64, as SagaLib's Pools.scramble. */
export function scramble(z: bigint): bigint {
  z = BigInt.asUintN(64, z + 0x9E3779B97F4A7C15n)
  z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n)
  z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94D049BB133111EBn)
  return long(z ^ (z >> 31n))
}

/** Pools.mix: the seed with the pool id (Java: base ^ ((long) id.hashCode() * 0x9E3779B97F4A7C15L)). */
export const mix = (base: bigint, poolId: string): bigint => long(base ^ long(BigInt(javaHash(poolId)) * 0x9E3779B97F4A7C15n))

/** Pools.drawSeed. */
export const drawSeed = (base: bigint, poolId: string, draws: number): bigint => scramble(long(mix(base, poolId) + long(BigInt(draws) * 0x2545F4914F6CDD1Dn)))

export { MASK64 }
