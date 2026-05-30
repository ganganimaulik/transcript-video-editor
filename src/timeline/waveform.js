import { $ } from '../utils/dom.js';
import { generateWaveformData } from '../utils/audio.js';
import { store } from '../state.js';

class Waveform {
  constructor() {
    this.canvas = $('#waveform-canvas');
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      this.data = [];
      this.duration = 0;
      this.segments = [];
      
      this.resize();
      window.addEventListener('resize', () => this.resize());
      
      const resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      resizeObserver.observe(this.canvas.parentElement);

      this.setupStateListeners();
    }
  }

  resize() {
    if (!this.canvas) return;
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.draw();
  }

  setupStateListeners() {
    let lastUrl = '';
    
    store.subscribe(async (state) => {
      this.duration = state.duration;
      this.segments = state.segments || [];
      
      // If segments changed, redraw to reflect active vs deleted colors
      if (this.lastSegments !== state.segments) {
        this.lastSegments = state.segments;
        this.draw();
      }
      
      // Load new waveform data if video changed
      if (state.videoUrl && state.videoUrl !== lastUrl) {
        lastUrl = state.videoUrl;
        
        // Use the generated waveform utility
        this.data = await generateWaveformData(state.videoUrl, 300); // 300 bars
        this.draw();
      }
    });
  }

  draw() {
    if (!this.ctx || this.data.length === 0 || this.duration <= 0) return;
    
    const width = this.canvas.width;
    const height = this.canvas.height;
    
    this.ctx.clearRect(0, 0, width, height);
    
    const barWidth = width / this.data.length;
    
    // Draw each bar
    for (let i = 0; i < this.data.length; i++) {
      const val = this.data[i];
      const barHeight = val * height * 0.8; // Max 80% height
      
      const x = i * barWidth;
      const y = (height - barHeight) / 2; // Center vertically
      
      // Calculate time for this bar
      const time = (i / this.data.length) * this.duration;
      
      // Check if this time is within an active segment
      let isActive = false;
      for (const seg of this.segments) {
        if (time >= seg.start && time <= seg.end) {
          isActive = true;
          break;
        }
      }
      
      this.ctx.fillStyle = isActive ? 'rgba(67, 97, 238, 0.6)' : 'rgba(107, 114, 128, 0.2)';
      this.ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Waveform();
});
