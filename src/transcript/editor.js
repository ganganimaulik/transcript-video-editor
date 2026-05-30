import { $, createElement } from '../utils/dom.js';
import { store } from '../state.js';
import { seekVideo } from '../video/player.js';

class TranscriptEditor {
  constructor() {
    this.container = $('#transcript-editor');
    
    // State
    this.isDragging = false;
    this.selectionStartWordId = -1;
    this.activeWordId = -1;

    // Map of word id -> DOM element for targeted updates
    this.wordElements = new Map();
    
    if (this.container) {
      this.bindEvents();
      this.setupStateListeners();
    }
  }

  bindEvents() {
    // Selection logic (mouse drag)
    this.container.addEventListener('mousedown', (e) => {
      const wordEl = e.target.closest('.word');
      if (wordEl) {
        this.isDragging = true;
        const id = parseInt(wordEl.dataset.id, 10);
        this.selectionStartWordId = id;
        store.dispatch('SET_SELECTION', { startId: id, endId: id });
        
        // Also seek on click
        const start = parseFloat(wordEl.dataset.start);
        seekVideo(start);
      } else {
        // Clicked outside, clear selection
        store.dispatch('SET_SELECTION', { startId: -1, endId: -1 });
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      const wordEl = e.target.closest('.word');
      if (wordEl) {
        const id = parseInt(wordEl.dataset.id, 10);
        store.dispatch('SET_SELECTION', { startId: this.selectionStartWordId, endId: id });
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Delete/Backspace to cut words
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const state = store.getState();
        if (state.selection.startId !== -1) {
          store.dispatch('DELETE_SELECTION');
        }
      }

      // Enter or 'r' to restore words
      if (e.key === 'Enter' || e.key.toLowerCase() === 'r') {
        const state = store.getState();
        if (state.selection.startId !== -1) {
          store.dispatch('RESTORE_SELECTION');
        }
      }
      
      // Ctrl+Z / Cmd+Z for Undo/Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          store.dispatch('REDO');
        } else {
          store.dispatch('UNDO');
        }
      }
    });
  }

  setupStateListeners() {
    store.subscribe((state) => {
      // Re-render words if they changed
      if (this.lastWords !== state.words) {
        this.patchWords(state.words);
        this.lastWords = state.words;
      }
      
      this.updateVisualStates(state);
    });
  }

  /**
   * Targeted DOM patching — only adds, removes, or updates word elements
   * that actually changed, instead of rebuilding the entire transcript.
   * This preserves scroll position and avoids flickering.
   */
  patchWords(words) {
    if (!words || words.length === 0) {
      this.container.innerHTML = '';
      this.wordElements.clear();
      return;
    }

    // Build a set of current word IDs for quick lookup
    const newWordIds = new Set(words.map(w => w.id));

    // Remove DOM elements for words that no longer exist
    for (const [id, el] of this.wordElements) {
      if (!newWordIds.has(id)) {
        // Remove the element and its trailing text node (space)
        const nextSibling = el.nextSibling;
        el.remove();
        if (nextSibling && nextSibling.nodeType === Node.TEXT_NODE) {
          nextSibling.remove();
        }
        this.wordElements.delete(id);
      }
    }

    // Walk the new words array and add/update as needed
    let previousElement = null; // Track insertion position

    for (const word of words) {
      let el = this.wordElements.get(word.id);

      if (el) {
        // Element exists — update it if needed
        this._updateWordElement(el, word);
        previousElement = el.nextSibling || el; // move past the trailing space
      } else {
        // Create new element
        el = createElement('span', 'word fade-in', word.text);
        el.dataset.id = word.id;
        el.dataset.start = word.start;
        el.dataset.end = word.end;
        el.id = `word-${word.id}`;

        this._applyWordClasses(el, word);

        const space = document.createTextNode(' ');

        // Insert after the previous element, or at the beginning
        if (previousElement && previousElement.parentNode === this.container) {
          // Insert after previousElement
          const refNode = previousElement.nextSibling;
          this.container.insertBefore(el, refNode);
          this.container.insertBefore(space, refNode);
        } else {
          // Prepend to container
          this.container.insertBefore(el, this.container.firstChild);
          this.container.insertBefore(space, el.nextSibling);
        }

        this.wordElements.set(word.id, el);
        previousElement = space;
      }

      // Advance previousElement past the trailing space
      if (el.nextSibling && el.nextSibling.nodeType === Node.TEXT_NODE) {
        previousElement = el.nextSibling;
      } else {
        previousElement = el;
      }
    }
  }

  /**
   * Update an existing word element to match the current word data.
   */
  _updateWordElement(el, word) {
    // Update text if changed
    if (el.textContent !== word.text) {
      el.textContent = word.text;
    }

    // Update data attributes if changed
    if (el.dataset.start !== String(word.start)) el.dataset.start = word.start;
    if (el.dataset.end !== String(word.end)) el.dataset.end = word.end;

    // Update classes
    this._applyWordClasses(el, word);
  }

  /**
   * Apply the correct CSS classes based on word state.
   */
  _applyWordClasses(el, word) {
    el.classList.toggle('deleted', !!word.deleted);
    el.classList.toggle('pause', !!word.isPause);
    el.classList.toggle('filler', !!word.isFiller);
  }

  updateVisualStates(state) {
    const time = state.currentTime;
    
    // Find active word via binary search
    const activeId = this.findActiveWordId(state.words, time);
    
    if (activeId !== this.activeWordId) {
      if (this.activeWordId !== -1) {
        const oldActive = this.wordElements.get(this.activeWordId);
        if (oldActive) oldActive.classList.remove('active');
      }
      
      if (activeId !== -1) {
        const newActive = this.wordElements.get(activeId);
        if (newActive) {
          newActive.classList.add('active');
          // Auto scroll
          if (state.isPlaying) {
             newActive.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }
      
      this.activeWordId = activeId;
    }
    
    // Update selection highlight
    const selStart = Math.min(state.selection.startId, state.selection.endId);
    const selEnd = Math.max(state.selection.startId, state.selection.endId);
    
    for (const [id, el] of this.wordElements) {
      if (selStart !== -1 && id >= selStart && id <= selEnd) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    }
  }

  findActiveWordId(words, time) {
    if (!words || words.length === 0) return -1;
    
    let low = 0;
    let high = words.length - 1;
    
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const word = words[mid];
      
      if (time >= word.start && time <= word.end) {
        return word.id;
      } else if (time < word.start) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    
    return -1;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new TranscriptEditor();
});
