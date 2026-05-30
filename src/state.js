import { emit } from './utils/events.js';

class StateStore {
  constructor() {
    this.state = {
      fileId: null,
      videoUrl: '',
      duration: 0,
      currentTime: 0,
      isPlaying: false,
      words: [],
      segments: [],
      selection: { startId: -1, endId: -1 },
      undoStack: [],
      redoStack: [],
      transcriptionStatus: 'idle',
      transcriptionJobId: null,
      projectId: null
    };
    
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(listener => listener(this.state));
  }

  dispatch(action, payload) {
    const prevState = { ...this.state };
    
    switch (action) {
      case 'SET_VIDEO':
        this.state.fileId = payload.fileId;
        this.state.videoUrl = payload.url;
        this.state.duration = payload.duration;
        this.state.words = [];
        this.state.segments = [{ start: 0, end: payload.duration }];
        this.state.undoStack = [];
        this.state.redoStack = [];
        if (payload.projectId) {
          this.state.projectId = payload.projectId;
        } else if (!this.state.projectId) {
          this.state.projectId = null;
        }
        break;
        
      case 'SET_PROJECT_ID':
        this.state.projectId = payload;
        break;
        
      case 'LOAD_PROJECT':
        this.state = {
          ...this.state,
          ...payload,
          selection: { startId: -1, endId: -1 }, // Reset selection on load
          undoStack: [],
          redoStack: [],
          isPlaying: false,
          currentTime: 0
        };
        this._recalculateSegments();
        break;
        
      case 'SET_TIME':
        this.state.currentTime = payload;
        break;
        
      case 'SET_PLAYING':
        this.state.isPlaying = payload;
        break;
        
      case 'SET_TRANSCRIPTION_STATUS':
        this.state.transcriptionStatus = payload;
        break;
        
      case 'SET_TRANSCRIPTION_JOB_ID':
        this.state.transcriptionJobId = payload;
        break;
        
      case 'SET_WORDS':
        this.state.words = payload;
        this._recalculateSegments();
        break;
        
      case 'DELETE_SELECTION':
        if (this.state.selection.startId !== -1 && this.state.selection.endId !== -1) {
          // Save for undo
          this.state.undoStack.push(JSON.parse(JSON.stringify(this.state.words)));
          this.state.redoStack = []; // Clear redo stack on new action
          
          const start = Math.min(this.state.selection.startId, this.state.selection.endId);
          const end = Math.max(this.state.selection.startId, this.state.selection.endId);
          
          this.state.words = this.state.words.map(w => {
            if (w.id >= start && w.id <= end) {
              return { ...w, deleted: true };
            }
            return w;
          });
          
          this.state.selection = { startId: -1, endId: -1 };
          this._recalculateSegments();
          emit('segments-changed', this.state.segments);
        }
        break;
        
      case 'SET_SELECTION':
        this.state.selection = payload;
        break;
        
      case 'UNDO':
        if (this.state.undoStack.length > 0) {
          this.state.redoStack.push(JSON.parse(JSON.stringify(this.state.words)));
          this.state.words = this.state.undoStack.pop();
          this.state.selection = { startId: -1, endId: -1 };
          this._recalculateSegments();
          emit('segments-changed', this.state.segments);
        }
        break;
        
      case 'REDO':
        if (this.state.redoStack.length > 0) {
          this.state.undoStack.push(JSON.parse(JSON.stringify(this.state.words)));
          this.state.words = this.state.redoStack.pop();
          this.state.selection = { startId: -1, endId: -1 };
          this._recalculateSegments();
          emit('segments-changed', this.state.segments);
        }
        break;
    }
    
    this.notify();
  }
  
  _recalculateSegments() {
    if (this.state.words.length === 0) {
      if (this.state.duration > 0) {
        this.state.segments = [{ start: 0, end: this.state.duration }];
      } else {
        this.state.segments = [];
      }
      return;
    }
    
    // Start with the full duration of the video
    let segments = [{ start: 0, end: this.state.duration || 0 }];
    
    // Subtract times of deleted words
    for (const word of this.state.words) {
      if (word.deleted) {
        segments = this._subtractRange(segments, word.start, word.end);
      }
    }
    
    // Filter out effectively zero-length segments
    this.state.segments = segments.filter(s => s.end - s.start > 0.05);
  }

  _subtractRange(segments, start, end) {
    const result = [];
    for (const seg of segments) {
      // If the segment is completely outside the range to delete
      if (seg.end <= start || seg.start >= end) {
        result.push(seg);
      } else {
        // Segment overlaps, might need to split it
        if (seg.start < start) {
          result.push({ start: seg.start, end: start });
        }
        if (seg.end > end) {
          result.push({ start: end, end: seg.end });
        }
      }
    }
    return result;
  }
}

export const store = new StateStore();
