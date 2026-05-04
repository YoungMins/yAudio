/**
 * Audio amplitude / decibel helpers shared between the live preview
 * (audio.volume) and the analysis utilities (peak / normalize).
 */

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/** Highest |sample| in a flat numeric buffer. Used to feed normalize. */
export function peakOfWaveform(samples: readonly number[]): number {
  let max = 0;
  for (const v of samples) {
    const a = Math.abs(v);
    if (a > max) max = a;
  }
  return max;
}

/**
 * Decibels to add so that `currentPeak` (linear, 0..1) reaches the
 * `targetDb` ceiling. Silence (currentPeak ≤ 0) returns 0 — never tries
 * to apply infinite gain.
 */
export function normalizationGainDb(currentPeak: number, targetDb = -1): number {
  if (currentPeak <= 0) return 0;
  const targetLinear = dbToLinear(targetDb);
  return linearToDb(targetLinear / currentPeak);
}
