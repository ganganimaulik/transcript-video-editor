import { $, $$ } from '../utils/dom.js';
import { formatTime } from '../utils/time.js';
import { store } from '../state.js';
import { emit } from '../utils/events.js';

class VideoPlayer {
  constructor() {
    this.video = $('#video-preview');
    this.btnPlay = $('#btn-play');
    this.iconPlay = this.btnPlay?.querySelector('.icon-play');
    this.iconPause = this.btnPlay?.querySelector('.icon-pause');
    this.timeCurrent = $('#time-current');
    this.timeDuration = $('#time-duration');
    
    this.currentSegmentIndex = 0;
    
    if (this.video && this.btnPlay) {
      this.bindEvents();
      this.setupStateListeners();
    }
  }

  bindEvents() {
    // Play/Pause toggle
    this.btnPlay.addEventListener('click', () => {
      if (this.video.paused) {
        this.play();
      } else {
        this.pause();
      }
    });
    
    // Video click to play/pause
    this.video.addEventListener('click', () => {
        if (this.video.paused) this.play();
        else this.pause();
    });

    // Native video events
    this.video.addEventListener('play', () => {
      this.iconPlay.classList.add('hidden');
      this.iconPause.classList.remove('hidden');
      store.dispatch('SET_PLAYING', true);
    });

    this.video.addEventListener('pause', () => {
      this.iconPause.classList.add('hidden');
      this.iconPlay.classList.remove('hidden');
      store.dispatch('SET_PLAYING', false);
    });

    this.video.addEventListener('timeupdate', () => {
      this.handleTimeUpdate();
    });

    this.video.addEventListener('loadedmetadata', () => {
      this.timeDuration.textContent = formatTime(this.video.duration);
    });
  }

  setupStateListeners() {
    let lastUrl = '';
    
    store.subscribe((state) => {
      // Load new video
      if (state.videoUrl && state.videoUrl !== lastUrl) {
        lastUrl = state.videoUrl;
        this.video.src = state.videoUrl;
        this.video.load();
      }
    });
  }

  play() {
    const state = store.getState();
    const segments = state.segments;
    
    if (!segments || segments.length === 0) return;
    
    // Check if we are currently in a valid segment
    const time = this.video.currentTime;
    let inSegment = false;
    
    for (let i = 0; i < segments.length; i++) {
        if (time >= segments[i].start && time < segments[i].end) {
            inSegment = true;
            this.currentSegmentIndex = i;
            break;
        }
    }
    
    // If not in a segment, jump to the first segment
    if (!inSegment) {
        if (segments.length > 0) {
            this.currentSegmentIndex = 0;
            this.video.currentTime = segments[0].start;
        }
    }
    
    this.video.play().catch(e => console.warn("Playback prevented:", e));
  }

  pause() {
    this.video.pause();
  }

  handleTimeUpdate() {
    const time = this.video.currentTime;
    const state = store.getState();
    
    store.dispatch('SET_TIME', time);
    this.timeCurrent.textContent = formatTime(time);
    
    // Segment-aware playback logic
    const segments = state.segments;
    if (!segments || segments.length === 0) return;
    
    // We only actively enforce segment skipping if playing
    if (!this.video.paused) {
      const currentSegment = segments[this.currentSegmentIndex];
      
      // If we've played past the end of the current segment
      if (currentSegment && time >= currentSegment.end) {
        // Find next segment
        this.currentSegmentIndex++;
        
        if (this.currentSegmentIndex < segments.length) {
          // Jump to start of next segment
          this.video.currentTime = segments[this.currentSegmentIndex].start;
        } else {
          // Reached end of last segment, pause
          this.pause();
          this.video.currentTime = segments[segments.length - 1].end;
        }
      }
    }
  }
}

// Global instance to allow seeking from outside
let playerInstance = null;

document.addEventListener('DOMContentLoaded', () => {
  playerInstance = new VideoPlayer();
});

export function seekVideo(time) {
  const video = $('#video-preview');
  if (video) {
    video.currentTime = time;
  }
}
