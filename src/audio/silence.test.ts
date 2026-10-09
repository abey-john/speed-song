import { describe, it, expect } from 'vitest';
import { detectLeadingSilence } from './silence';

describe('detectLeadingSilence', () => {
  // Helper to mock minimal AudioBuffer interface
  function createMockBuffer(channelData: number[], sampleRate = 44100): AudioBuffer {
    const floatArray = new Float32Array(channelData);
    return {
      sampleRate,
      length: channelData.length,
      duration: channelData.length / sampleRate,
      numberOfChannels: 1,
      getChannelData: () => floatArray,
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
  }

  it('detects 0 offset when sound starts immediately at sample 0', () => {
    const data = [0.05, 0.1, 0.2];
    const buffer = createMockBuffer(data);
    const result = detectLeadingSilence(buffer, 0.01);
    expect(result.offsetSeconds).toBe(0);
  });

  it('detects offset correctly when silence precedes sound', () => {
    const sampleRate = 44100;
    // 441 samples of silence = 10ms (0.01s)
    const silenceSamples = 441;
    const data = new Array(silenceSamples).fill(0).concat([0.05, 0.1]);

    const buffer = createMockBuffer(data, sampleRate);
    const result = detectLeadingSilence(buffer, 0.01);
    expect(result.offsetSeconds).toBeCloseTo(0.01, 4);
  });

  it('handles completely silent buffers safely', () => {
    const data = [0, 0, 0.001, 0.002, 0];
    const buffer = createMockBuffer(data);
    const result = detectLeadingSilence(buffer, 0.01);
    expect(result.offsetSeconds).toBe(0);
  });
});
