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
    
    this.btnFullscreen = $('#btn-fullscreen');
    this.iconFullscreen = this.btnFullscreen?.querySelector('.icon-fullscreen');
    this.iconExitFullscreen = this.btnFullscreen?.querySelector('.icon-exit-fullscreen');
    this.playerContainer = $('#player-view');
    
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
      this.startPlaybackLoop();
    });

    this.video.addEventListener('pause', () => {
      this.iconPause.classList.add('hidden');
      this.iconPlay.classList.remove('hidden');
      store.dispatch('SET_PLAYING', false);
      this.stopPlaybackLoop();
    });

    this.video.addEventListener('timeupdate', () => {
      this.handleTimeUpdate();
    });

    this.video.addEventListener('loadedmetadata', () => {
      this.timeDuration.textContent = formatTime(this.video.duration);
    });

    // Fullscreen toggle button click
    if (this.btnFullscreen) {
      this.btnFullscreen.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    // Video double-click to toggle fullscreen
    if (this.video) {
      this.video.addEventListener('dblclick', () => {
        this.toggleFullscreen();
      });
    }

    // Update controls icons when fullscreen state changes
    document.addEventListener('fullscreenchange', () => {
      this.updateFullscreenUI();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if typing in input/textarea/contenteditable
      if (
        e.target.tagName === 'INPUT' || 
        e.target.tagName === 'TEXTAREA' || 
        e.target.isContentEditable
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        this.toggleFullscreen();
      }

      if ((e.key === ' ' || e.code === 'Space') && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        e.preventDefault(); // prevent page scroll
        if (this.video.paused) {
          this.play();
        } else {
          this.pause();
        }
      }
    });
  }

  toggleFullscreen() {
    if (!this.playerContainer) return;
    
    if (!document.fullscreenElement) {
      this.playerContainer.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen().catch(err => {
        console.error(`Error attempting to exit fullscreen: ${err.message}`);
      });
    }
  }

  updateFullscreenUI() {
    const isFullscreen = !!document.fullscreenElement;
    if (isFullscreen) {
      this.iconFullscreen?.classList.add('hidden');
      this.iconExitFullscreen?.classList.remove('hidden');
    } else {
      this.iconExitFullscreen?.classList.add('hidden');
      this.iconFullscreen?.classList.remove('hidden');
    }
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
    
    // If not in a segment, jump to the next valid segment
    if (!inSegment) {
        let nextSegIndex = -1;
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].start >= time) {
                nextSegIndex = i;
                break;
            }
        }
        
        if (nextSegIndex !== -1) {
            this.currentSegmentIndex = nextSegIndex;
            this.video.currentTime = segments[nextSegIndex].start;
        } else if (segments.length > 0) {
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
    
    store.dispatch('SET_TIME', time);
    this.timeCurrent.textContent = formatTime(time);
  }

  startPlaybackLoop() {
    if (this.playbackLoopId) return;
    const loop = () => {
      this.checkSegments();
      if (!this.video.paused) {
        this.playbackLoopId = requestAnimationFrame(loop);
      } else {
        this.playbackLoopId = null;
      }
    };
    this.playbackLoopId = requestAnimationFrame(loop);
  }

  stopPlaybackLoop() {
    if (this.playbackLoopId) {
      cancelAnimationFrame(this.playbackLoopId);
      this.playbackLoopId = null;
    }
  }

  checkSegments() {
    if (this.video.paused || this.video.seeking) return;

    const time = this.video.currentTime;
    const state = store.getState();
    const segments = state.segments;
    
    if (!segments || segments.length === 0) return;
    
    let inSegIndex = -1;
    for (let i = 0; i < segments.length; i++) {
        if (time >= segments[i].start && time < segments[i].end) {
            inSegIndex = i;
            break;
        }
    }

    if (inSegIndex !== -1) {
        this.currentSegmentIndex = inSegIndex;
    } else {
        // We are in a deleted portion (or outside any valid segment).
        // Find the next segment to jump to.
        let nextSegIndex = -1;
        for (let i = 0; i < segments.length; i++) {
            if (segments[i].start >= time) {
                nextSegIndex = i;
                break;
            }
        }

        if (nextSegIndex !== -1) {
            // Prevent getting stuck in a seeking loop if the browser's keyframe
            // lands slightly before the exact start time.
            if (Math.abs(time - segments[nextSegIndex].start) < 0.05) {
                return;
            }
            this.currentSegmentIndex = nextSegIndex;
            this.video.currentTime = segments[nextSegIndex].start;
        } else {
            // Reached end of all valid segments
            this.pause();
            if (segments.length > 0) {
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
