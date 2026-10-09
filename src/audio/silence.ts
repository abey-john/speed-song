/**
 * Default amplitude threshold to consider audio "non-silent" (out of 1.0 peak).
 * AAC primes can have low-level noise/silence below 0.01.
 */
export const DEFAULT_SILENCE_THRESHOLD = 0.01;

export interface SilenceDetectionResult {
  offsetSeconds: number;
  thresholdUsed: number;
}

/**
 * Scans decoded AudioBuffer channels to locate the first audio sample
 * exceeding the silence threshold, returning leading silence duration in seconds.
 */
export function detectLeadingSilence(
  buffer: AudioBuffer,
  threshold: number = DEFAULT_SILENCE_THRESHOLD
): SilenceDetectionResult {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;

  if (length === 0 || sampleRate <= 0) {
    return { offsetSeconds: 0, thresholdUsed: threshold };
  }

  // Pre-fetch channel data arrays
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  // Scan sample by sample
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const channelData = channels[c];
      if (channelData && Math.abs(channelData[i] ?? 0) >= threshold) {
        const offsetSeconds = i / sampleRate;
        return {
          offsetSeconds,
          thresholdUsed: threshold,
        };
      }
    }
  }

  // If entire buffer is below threshold, start from 0
  return { offsetSeconds: 0, thresholdUsed: threshold };
}
