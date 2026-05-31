import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('audio utils', () => {
  let mockFetch;
  let mockAudioContext;
  let mockDecodeAudioData;
  let mockGetChannelData;

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock AudioContext and its methods
    mockGetChannelData = vi.fn().mockReturnValue(new Float32Array([0.1, -0.2, 0.3, -0.4, 0.5]));
    mockDecodeAudioData = vi.fn().mockResolvedValue({
      getChannelData: mockGetChannelData
    });

    mockAudioContext = {
      state: 'running',
      decodeAudioData: mockDecodeAudioData,
    };

    class MockAudioContext {
      constructor() {
        return mockAudioContext;
      }
    }

    global.window = {
      AudioContext: vi.fn().mockImplementation(() => new MockAudioContext())
    };
    global.window.AudioContext = MockAudioContext;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete global.fetch;
    delete global.window;
    vi.resetModules();
  });

  describe('generateWaveformData', () => {
    let generateWaveformDataLocal;
    beforeEach(async () => {
        const module = await import('../src/utils/audio.js');
        generateWaveformDataLocal = module.generateWaveformData;
    });

    it('should generate waveform data correctly', async () => {
      // Mock fetch response
      const mockArrayBuffer = new ArrayBuffer(8);
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValueOnce(mockArrayBuffer)
      });

      const samples = 2;
      const waveform = await generateWaveformDataLocal('mock-url', samples);

      expect(mockFetch).toHaveBeenCalledWith('mock-url');
      expect(mockDecodeAudioData).toHaveBeenCalledWith(mockArrayBuffer);
      expect(mockGetChannelData).toHaveBeenCalledWith(0);

      expect(waveform.length).toBe(2);
      expect(waveform[0]).toBeCloseTo(0.4285714285714286);
      expect(waveform[1]).toBe(1.0);
    });

    it('should handle fetch errors gracefully and return zeroed array', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const samples = 5;
      const waveform = await generateWaveformDataLocal('mock-url', samples);

      expect(waveform.length).toBe(samples);
      expect(waveform.every(val => val === 0)).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle decodeAudioData errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(8))
      });
      mockDecodeAudioData.mockRejectedValueOnce(new Error('Decode error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const samples = 5;
      const waveform = await generateWaveformDataLocal('mock-url', samples);

      expect(waveform.length).toBe(samples);
      expect(waveform.every(val => val === 0)).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle cases where max is 0 (silence)', async () => {
        mockFetch.mockResolvedValueOnce({
            arrayBuffer: vi.fn().mockResolvedValueOnce(new ArrayBuffer(8))
        });

        mockGetChannelData.mockReturnValueOnce(new Float32Array([0, 0, 0, 0, 0]));

        const samples = 2;
        const waveform = await generateWaveformDataLocal('mock-url', samples);

        expect(waveform.length).toBe(2);
        expect(waveform[0]).toBe(0);
        expect(waveform[1]).toBe(0);
    });
  });
});
