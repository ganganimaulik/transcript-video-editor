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
      transcriptionProvider: 'google',
      gcsOperationName: null,
      projectId: null,
      revision: 0,
      zoom: 1,
      cuts: [],
      deletedRegions: [],
      selectedSegmentIndex: null
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

  _pushUndo() {
    this.state.undoStack.push(JSON.parse(JSON.stringify({
      words: this.state.words,
      cuts: this.state.cuts,
      deletedRegions: this.state.deletedRegions
    })));
    this.state.redoStack = []; // Clear redo stack on new action
  }

  dispatch(action, payload) {
    const prevState = { ...this.state };
    
    switch (action) {
      case 'SET_VIDEO':
        this.state.fileId = payload.fileId;
        this.state.videoUrl = payload.url;
        this.state.duration = payload.duration;
        this.state.words = [];
        this.state.cuts = [];
        this.state.deletedRegions = [];
        this.state.segments = [{ start: 0, end: payload.duration }];
        this.state.selectedSegmentIndex = null;
        this.state.undoStack = [];
        this.state.redoStack = [];
        this.state.revision++;
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
          currentTime: 0,
          revision: payload.revision || 0,
          cuts: payload.cuts || [],
          deletedRegions: payload.deletedRegions || [],
          zoom: payload.zoom || 1,
          selectedSegmentIndex: null
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
        this.state.revision++;
        break;
        
      case 'SET_TRANSCRIPTION_JOB_ID':
        this.state.transcriptionJobId = payload;
        this.state.revision++;
        break;
        
      case 'SET_TRANSCRIPTION_PROVIDER':
        this.state.transcriptionProvider = payload;
        this.state.revision++;
        break;

      case 'SET_GCS_OPERATION_NAME':
        this.state.gcsOperationName = payload;
        this.state.revision++;
        break;
        
      case 'SET_WORDS':
        this.state.words = payload;
        this._recalculateSegments();
        this.state.revision++;
        break;
        
      case 'DELETE_SELECTION':
        if (this.state.selection.startId !== -1 && this.state.selection.endId !== -1) {
          this._pushUndo();
          
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
          this.state.revision++;
          emit('segments-changed', this.state.segments);
        }
        break;

      case 'RESTORE_SELECTION':
        if (this.state.selection.startId !== -1 && this.state.selection.endId !== -1) {
          this._pushUndo();
          
          const start = Math.min(this.state.selection.startId, this.state.selection.endId);
          const end = Math.max(this.state.selection.startId, this.state.selection.endId);
          
          this.state.words = this.state.words.map(w => {
            if (w.id >= start && w.id <= end) {
              return { ...w, deleted: false };
            }
            return w;
          });
          
          this.state.selection = { startId: -1, endId: -1 };
          this._recalculateSegments();
          this.state.revision++;
          emit('segments-changed', this.state.segments);
        }
        break;

        
      case 'SET_SELECTION':
        this.state.selection = payload;
        break;
        
      case 'UNDO':
        if (this.state.undoStack.length > 0) {
          this.state.redoStack.push(JSON.parse(JSON.stringify({
            words: this.state.words,
            cuts: this.state.cuts,
            deletedRegions: this.state.deletedRegions
          })));
          const lastState = this.state.undoStack.pop();
          this.state.words = lastState.words || [];
          this.state.cuts = lastState.cuts || [];
          this.state.deletedRegions = lastState.deletedRegions || [];
          this.state.selection = { startId: -1, endId: -1 };
          this.state.selectedSegmentIndex = null;
          this._recalculateSegments();
          this.state.revision++;
          emit('segments-changed', this.state.segments);
        }
        break;
        
      case 'REDO':
        if (this.state.redoStack.length > 0) {
          this.state.undoStack.push(JSON.parse(JSON.stringify({
            words: this.state.words,
            cuts: this.state.cuts,
            deletedRegions: this.state.deletedRegions
          })));
          const nextState = this.state.redoStack.pop();
          this.state.words = nextState.words || [];
          this.state.cuts = nextState.cuts || [];
          this.state.deletedRegions = nextState.deletedRegions || [];
          this.state.selection = { startId: -1, endId: -1 };
          this.state.selectedSegmentIndex = null;
          this._recalculateSegments();
          this.state.revision++;
          emit('segments-changed', this.state.segments);
        }
        break;
        
      case 'AUTO_CLEAN': {
        const threshold = payload.silenceThreshold || 1.5;
        
        // Check if there's anything to clean
        const hasCleanable = this.state.words.some(w =>
          !w.deleted && (
            w.isFiller ||
            (w.isPause && (w.end - w.start) >= threshold)
          )
        );
        
        if (!hasCleanable) break;
        
        this._pushUndo();
        
        this.state.words = this.state.words.map(w => {
          if (w.deleted) return w;
          
          // Remove filler words
          if (w.isFiller) {
            return { ...w, deleted: true };
          }
          
          // Remove silences above threshold
          if (w.isPause && (w.end - w.start) >= threshold) {
            return { ...w, deleted: true };
          }
          
          return w;
        });
        
        this.state.selection = { startId: -1, endId: -1 };
        this._recalculateSegments();
        this.state.revision++;
        emit('segments-changed', this.state.segments);
        break;
      }

      case 'SET_ZOOM':
        this.state.zoom = payload;
        break;

      case 'SPLIT_SEGMENT':
        if (this.state.currentTime > 0 && this.state.currentTime < this.state.duration) {
          // Verify we're not splitting inside a deleted segment or exactly at an existing cut
          const isInDeleted = this.state.segments.every(s => this.state.currentTime < s.start || this.state.currentTime > s.end);
          if (!isInDeleted && !this.state.cuts.includes(this.state.currentTime)) {
            this._pushUndo();
            this.state.cuts.push(this.state.currentTime);
            this.state.cuts.sort((a, b) => a - b);
            this._recalculateSegments();
            this.state.revision++;
            emit('segments-changed', this.state.segments);
          }
        }
        break;

      case 'DELETE_SEGMENT':
        if (this.state.selectedSegmentIndex !== null && this.state.segments[this.state.selectedSegmentIndex]) {
          this._pushUndo();
          const seg = this.state.segments[this.state.selectedSegmentIndex];
          this.state.deletedRegions.push({ start: seg.start, end: seg.end });

          // Also mark words in this segment as deleted
          if (this.state.words) {
            this.state.words = this.state.words.map(w => {
              if (w.start >= seg.start && w.end <= seg.end) {
                return { ...w, deleted: true };
              }
              return w;
            });
          }

          this.state.selectedSegmentIndex = null;
          this._recalculateSegments();
          this.state.revision++;
          emit('segments-changed', this.state.segments);
        }
        break;

      case 'RESTORE_REGION': {
        const { start, end } = payload;
        this._pushUndo();
        
        const threshold = 0.1; // Handle floating point inaccuracies
        
        // Remove deletedRegions that fall inside or overlap with this region
        this.state.deletedRegions = this.state.deletedRegions.filter(region => {
           const overlaps = (region.start < end + threshold && region.end > start - threshold);
           return !overlaps;
        });

        // Restore words
        if (this.state.words) {
          this.state.words = this.state.words.map(w => {
            if (w.deleted && w.start < end + threshold && w.end > start - threshold) {
              return { ...w, deleted: false };
            }
            return w;
          });
        }
        
        this.state.selection = { startId: -1, endId: -1 };
        this._recalculateSegments();
        this.state.revision++;
        emit('segments-changed', this.state.segments);
        break;
      }

      case 'SELECT_SEGMENT':
        this.state.selectedSegmentIndex = payload;
        break;
    }
    
    this.notify();
  }
  
  _recalculateSegments() {
    if (this.state.duration <= 0) {
      this.state.segments = [];
      return;
    }
    
    // Start with the full duration of the video
    let segments = [{ start: 0, end: this.state.duration || 0 }];
    
    // Subtract times of deleted words if we have words
    if (this.state.words && this.state.words.length > 0) {
      for (const word of this.state.words) {
        if (word.deleted) {
          segments = this._subtractRange(segments, word.start, word.end);
        }
      }
    }

    // Subtract deleted timeline regions
    if (this.state.deletedRegions && this.state.deletedRegions.length > 0) {
      for (const region of this.state.deletedRegions) {
        segments = this._subtractRange(segments, region.start, region.end);
      }
    }
    
    // Split segments at cuts
    if (this.state.cuts && this.state.cuts.length > 0) {
      let cutSegments = [];
      for (const seg of segments) {
        let currentSegStart = seg.start;
        for (const cut of this.state.cuts) {
          if (cut > currentSegStart && cut < seg.end) {
            cutSegments.push({ start: currentSegStart, end: cut });
            currentSegStart = cut;
          }
        }
        if (currentSegStart < seg.end) {
          cutSegments.push({ start: currentSegStart, end: seg.end });
        }
      }
      segments = cutSegments;
    }

    // Filter out effectively zero-length segments
    this.state.segments = segments.filter(s => s.end - s.start > 0.05);

    // Ensure selected index is still valid, else nullify
    if (this.state.selectedSegmentIndex !== null && this.state.selectedSegmentIndex >= this.state.segments.length) {
      this.state.selectedSegmentIndex = null;
    }
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
