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
        this.renderWords(state.words);
        this.lastWords = state.words;
      }
      
      this.updateVisualStates(state);
    });
  }

  renderWords(words) {
    this.container.innerHTML = '';
    
    if (!words || words.length === 0) return;

    const frag = document.createDocumentFragment();
    
    words.forEach(word => {
      const el = createElement('span', 'word fade-in', word.text);
      el.dataset.id = word.id;
      el.dataset.start = word.start;
      el.dataset.end = word.end;
      el.id = `word-${word.id}`;
      
      if (word.deleted) {
        el.classList.add('deleted');
      }
      if (word.isPause) {
        el.classList.add('pause');
      }
      if (word.isFiller) {
        el.classList.add('filler');
      }
      
      frag.appendChild(el);
      
      // Add space
      frag.appendChild(document.createTextNode(' '));
    });
    
    this.container.appendChild(frag);
  }

  updateVisualStates(state) {
    const time = state.currentTime;
    
    // Find active word via binary search
    const activeId = this.findActiveWordId(state.words, time);
    
    if (activeId !== this.activeWordId) {
      if (this.activeWordId !== -1) {
        const oldActive = document.getElementById(`word-${this.activeWordId}`);
        if (oldActive) oldActive.classList.remove('active');
      }
      
      if (activeId !== -1) {
        const newActive = document.getElementById(`word-${activeId}`);
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
    
    const wordEls = this.container.querySelectorAll('.word');
    wordEls.forEach(el => {
      const id = parseInt(el.dataset.id, 10);
      if (selStart !== -1 && id >= selStart && id <= selEnd) {
        el.classList.add('selected');
      } else {
        el.classList.remove('selected');
      }
    });
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
