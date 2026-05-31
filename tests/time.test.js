import { describe, it, expect } from 'vitest';
import { formatTime } from '../src/utils/time.js';

describe('formatTime', () => {
  it('should format 0 correctly', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('should format seconds correctly', () => {
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(59)).toBe('00:59');
  });

  it('should format minutes and seconds correctly', () => {
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(119)).toBe('01:59');
    expect(formatTime(3599)).toBe('59:59');
  });

  it('should format hours, minutes, and seconds correctly', () => {
    expect(formatTime(3600)).toBe('01:00:00');
    expect(formatTime(3665)).toBe('01:01:05');
    expect(formatTime(7322)).toBe('02:02:02');
  });

  it('should handle fractional seconds', () => {
    expect(formatTime(5.5)).toBe('00:05');
    expect(formatTime(65.9)).toBe('01:05');
  });

  it('should handle NaN', () => {
    expect(formatTime(NaN)).toBe('00:00');
  });
});
