import { describe, it, expect, beforeEach } from 'vitest';
import { $, $$, createElement, escapeHtml } from '../src/utils/dom.js';

describe('dom utils', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('$', () => {
    it('should select a single element', () => {
      const el = document.createElement('div');
      el.id = 'test-id';
      document.body.appendChild(el);

      expect($('#test-id')).toBe(el);
    });

    it('should return null if element not found', () => {
      expect($('#non-existent')).toBeNull();
    });
  });

  describe('$$', () => {
    it('should select multiple elements', () => {
      const el1 = document.createElement('div');
      el1.className = 'test-class';
      document.body.appendChild(el1);

      const el2 = document.createElement('div');
      el2.className = 'test-class';
      document.body.appendChild(el2);

      const els = $$('.test-class');
      expect(els.length).toBe(2);
      expect(els[0]).toBe(el1);
      expect(els[1]).toBe(el2);
    });

    it('should return empty NodeList if no elements found', () => {
      const els = $$('.non-existent');
      expect(els.length).toBe(0);
    });
  });

  describe('createElement', () => {
    it('should create an element with given tag', () => {
      const el = createElement('span');
      expect(el.tagName.toLowerCase()).toBe('span');
    });

    it('should create an element with given class', () => {
      const el = createElement('div', 'my-class');
      expect(el.className).toBe('my-class');
    });

    it('should create an element with given text content', () => {
      const el = createElement('p', '', 'Hello World');
      expect(el.textContent).toBe('Hello World');
    });

    it('should create an element with all parameters', () => {
      const el = createElement('button', 'btn primary', 'Click Me');
      expect(el.tagName.toLowerCase()).toBe('button');
      expect(el.className).toBe('btn primary');
      expect(el.textContent).toBe('Click Me');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML characters', () => {
      const input = '<div>Test & "Quote" \'Single\'</div>';
      const expected = '&lt;div&gt;Test &amp; "Quote" \'Single\'&lt;/div&gt;';

      const el = document.createElement('div');
      el.textContent = input;
      const expectedInner = el.innerHTML;

      expect(escapeHtml(input)).toBe(expectedInner);
    });

    it('should handle empty strings', () => {
      expect(escapeHtml('')).toBe('');
    });
  });
});
