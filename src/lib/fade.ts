/**
 * Linear gain envelope sampled at time `t` for a clip of length
 * `totalDur` with a `fadeIn` ramp at the start and a `fadeOut` ramp at
 * the end. All durations are in seconds, all gains in [0, 1].
 *
 * - Outside `[0, totalDur]` the gain is silent.
 * - When the fade ranges overlap (very short clips with long fades) the
 *   smaller of the two ramps wins, so the envelope never exceeds either.
 *
 * Pure: no Web Audio dependency, so it's unit-tested directly and reused
 * by the audio graph and the offline render pipeline.
 */
export function computeGainAtTime(
  t: number,
  totalDur: number,
  fadeIn: number,
  fadeOut: number
): number {
  if (totalDur <= 0 || t < 0 || t > totalDur) return 0;
  let gain = 1;
  if (fadeIn > 0 && t < fadeIn) {
    gain = Math.min(gain, t / fadeIn);
  }
  if (fadeOut > 0 && t > totalDur - fadeOut) {
    gain = Math.min(gain, (totalDur - t) / fadeOut);
  }
  return Math.max(0, gain);
}
