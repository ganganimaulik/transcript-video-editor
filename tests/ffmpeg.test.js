import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkFFmpeg, checkVideoToolboxSupport } from '../server/utils/ffmpeg.js';
import * as child_process from 'child_process';

vi.mock('child_process', () => {
  return {
    execSync: vi.fn(),
  };
});

describe('ffmpeg utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('checkFFmpeg', () => {
    it('should return true if ffmpeg exists', () => {
      child_process.execSync.mockReturnValueOnce('');
      expect(checkFFmpeg()).toBe(true);
      expect(child_process.execSync).toHaveBeenCalledWith('ffmpeg -version', { stdio: 'ignore' });
    });

    it('should return false if ffmpeg does not exist', () => {
      child_process.execSync.mockImplementationOnce(() => {
        throw new Error('Command failed');
      });
      expect(checkFFmpeg()).toBe(false);
      expect(child_process.execSync).toHaveBeenCalledWith('ffmpeg -version', { stdio: 'ignore' });
    });
  });

  describe('checkVideoToolboxSupport', () => {
    // Note: checkVideoToolboxSupport caches the result.
    // To test it properly, we need to reset the module to clear the cache.
    let checkVideoToolboxSupportLocal;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('../server/utils/ffmpeg.js');
      checkVideoToolboxSupportLocal = module.checkVideoToolboxSupport;
    });

    it('should return true if h264_videotoolbox is in encoders list', () => {
      child_process.execSync.mockReturnValueOnce('... h264_videotoolbox ...');
      expect(checkVideoToolboxSupportLocal()).toBe(true);
      expect(child_process.execSync).toHaveBeenCalledWith('ffmpeg -encoders', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    });

    it('should return false if h264_videotoolbox is not in encoders list', async () => {
      child_process.execSync.mockReturnValueOnce('... libx264 ...');
      expect(checkVideoToolboxSupportLocal()).toBe(false);
      expect(child_process.execSync).toHaveBeenCalledWith('ffmpeg -encoders', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    });

    it('should return false if execSync throws an error', async () => {
      child_process.execSync.mockImplementationOnce(() => {
        throw new Error('Command failed');
      });
      expect(checkVideoToolboxSupportLocal()).toBe(false);
      expect(child_process.execSync).toHaveBeenCalledWith('ffmpeg -encoders', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    });
  });
});
