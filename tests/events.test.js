import { describe, it, expect, vi, beforeEach } from 'vitest';
import { on, off, emit } from '../src/utils/events.js';

describe('events utils', () => {
  beforeEach(() => {
    // Reset the internal state of the module
    // We can work around this by using unique event names per test.
  });

  describe('on and emit', () => {
    it('should register a callback and trigger it on emit', () => {
      const callback = vi.fn();
      const eventName = 'test-event-1';

      on(eventName, callback);
      emit(eventName, { data: 123 });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ data: 123 });
    });

    it('should support multiple callbacks for the same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const eventName = 'test-event-2';

      on(eventName, callback1);
      on(eventName, callback2);
      emit(eventName);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should not throw when emitting an event with no listeners', () => {
      expect(() => emit('non-existent-event')).not.toThrow();
    });
  });

  describe('off', () => {
    it('should remove a registered callback', () => {
      const callback = vi.fn();
      const eventName = 'test-event-3';

      on(eventName, callback);
      off(eventName, callback);
      emit(eventName);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should only remove the specified callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const eventName = 'test-event-4';

      on(eventName, callback1);
      on(eventName, callback2);
      off(eventName, callback1);
      emit(eventName);

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should not throw when removing an unregistered callback', () => {
      const callback = vi.fn();
      expect(() => off('non-existent-event', callback)).not.toThrow();
    });

    it('should not throw when removing a callback from an event with no listeners', () => {
      const callback = vi.fn();
      const eventName = 'test-event-5';
      on(eventName, vi.fn());
      expect(() => off(eventName, callback)).not.toThrow();
    });
  });
});
