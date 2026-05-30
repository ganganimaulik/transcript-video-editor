import { $, createElement } from '../utils/dom.js';
import { store } from '../state.js';
import { seekVideo } from '../video/player.js';

class Timeline {
  constructor() {
    this.container = $('.timeline-container');
    this.content = $('#timeline-content');
    this.segmentsContainer = $('#timeline-segments');
    this.playhead = $('#playhead');
    
    this.isDragging = false;
    this.duration = 0;
    this.zoom = 1;
    this.selectedSegmentIndex = null;
    
    if (this.container && this.content && this.segmentsContainer && this.playhead) {
      this.bindEvents();
      this.setupStateListeners();
    }
  }

  bindEvents() {
    // Click to seek
    this.segmentsContainer.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.seekFromMouseEvent(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.seekFromMouseEvent(e);
      }
    });

    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  seekFromMouseEvent(e) {
    if (this.duration <= 0) return;
    
    const rect = this.content.getBoundingClientRect();
    let x = e.clientX - rect.left;
    
    // Clamp to bounds
    x = Math.max(0, Math.min(x, rect.width));
    
    const percentage = x / rect.width;
    const time = percentage * this.duration;
    
    seekVideo(time);
  }

  setupStateListeners() {
    store.subscribe((state) => {
      if (this.duration !== state.duration) {
        this.duration = state.duration;
        this.renderSegments(state.segments);
      }
      
      // Re-render if segments changed (e.g. deletions)
      if (this.lastSegments !== state.segments || this.selectedSegmentIndex !== state.selectedSegmentIndex) {
        this.selectedSegmentIndex = state.selectedSegmentIndex;
        this.renderSegments(state.segments);
        this.lastSegments = state.segments;
      }
      
      // Update Zoom
      if (this.zoom !== state.zoom) {
        this.zoom = state.zoom;
        this.content.style.width = `${this.zoom * 100}%`;
      }

      // Update playhead
      this.updatePlayhead(state.currentTime);
    });
  }

  renderSegments(segments) {
    this.segmentsContainer.innerHTML = '';
    if (this.duration <= 0 || !segments) return;
    
    const frag = document.createDocumentFragment();
    
    let lastEnd = 0;
    
    segments.forEach((seg, index) => {
      // Add gap if there's space between last end and current start
      if (seg.start > lastEnd + 0.1) {
        const gap = createElement('div', 'segment-gap');
        const gapStartPct = (lastEnd / this.duration) * 100;
        const gapWidthPct = ((seg.start - lastEnd) / this.duration) * 100;
        
        gap.style.left = `${gapStartPct}%`;
        gap.style.width = `${gapWidthPct}%`;
        frag.appendChild(gap);
      }
      
      const block = createElement('div', 'segment-block');
      if (index === this.selectedSegmentIndex) {
        block.classList.add('selected');
      }
      const startPct = (seg.start / this.duration) * 100;
      const widthPct = ((seg.end - seg.start) / this.duration) * 100;
      
      block.style.left = `${startPct}%`;
      block.style.width = `${widthPct}%`;

      block.addEventListener('click', (e) => {
        // Prevent default seek if we just want to select
        // Actually, we probably want both: seek to start and select
        // Let's stop propagation so the container mousedown doesn't handle it
        e.stopPropagation();
        store.dispatch('SELECT_SEGMENT', index);
        seekVideo(seg.start);
      });

      frag.appendChild(block);
      
      lastEnd = seg.end;
    });
    
    // Add final gap if needed
    if (lastEnd < this.duration - 0.1) {
      const gap = createElement('div', 'segment-gap');
      const gapStartPct = (lastEnd / this.duration) * 100;
      const gapWidthPct = ((this.duration - lastEnd) / this.duration) * 100;
      
      gap.style.left = `${gapStartPct}%`;
      gap.style.width = `${gapWidthPct}%`;
      frag.appendChild(gap);
    }
    
    this.segmentsContainer.appendChild(frag);
  }

  updatePlayhead(time) {
    if (this.duration <= 0) return;
    
    const percentage = (time / this.duration) * 100;
    this.playhead.style.left = `${percentage}%`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Timeline();
});
