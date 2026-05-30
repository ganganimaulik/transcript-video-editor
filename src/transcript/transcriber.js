import { $ } from '../utils/dom.js';
import { store } from '../state.js';
import { GoogleSTTProvider } from './google-stt.js';

class Transcriber {
  constructor() {
    this.btnTranscribe = $('#btn-transcribe');
    this.emptyState = $('#transcript-empty');
    this.loadingState = $('#transcript-loading');
    this.editorContainer = $('#transcript-editor');
    this.statusText = $('#transcribe-status-text');
    
    // Default provider
    this.provider = new GoogleSTTProvider();

    // Subscribe to state to resume transcription on reload
    store.subscribe((state) => {
      if (state.transcriptionStatus === 'transcribing' && state.transcriptionJobId && !this.isTranscribing) {
        this.resumeTranscription(state);
      }
    });

    if (this.btnTranscribe) {
      this.bindEvents();
    }
  }

  bindEvents() {
    this.btnTranscribe.addEventListener('click', () => {
      const state = store.getState();
      this.startTranscription(state);
    });
  }

  async resumeTranscription(state) {
    this.startTranscription(state, { jobId: state.transcriptionJobId });
  }

  async startTranscription(state, options = {}) {
    if (!state.fileId) return;

    this.isTranscribing = true;

    // UI Updates
    this.btnTranscribe.classList.add('hidden');
    this.emptyState.classList.add('hidden');
    this.loadingState.classList.remove('hidden');
    this.statusText.textContent = options.jobId ? 'Resuming transcription...' : 'Transcribing with Google Cloud STT...';
    
    if (!options.jobId) {
      store.dispatch('SET_TRANSCRIPTION_STATUS', 'transcribing');
    }

    try {
      const words = await this.provider.transcribe(state.fileId, (status, progress) => {
        if (status === 'extracting') {
          this.statusText.textContent = 'Extracting audio...';
        } else if (status === 'uploading') {
          this.statusText.textContent = `Uploading to Google Storage: ${progress}%`;
        } else if (status === 'transcribing') {
          if (progress !== undefined) {
            this.statusText.textContent = `Transcribing with Google Cloud STT: ${progress}%`;
          } else {
            this.statusText.textContent = 'Transcribing with Google Cloud STT...';
          }
        }
      }, {
        jobId: options.jobId,
        onJobId: (id) => store.dispatch('SET_TRANSCRIPTION_JOB_ID', id)
      });
      
      store.dispatch('SET_WORDS', words);
      store.dispatch('SET_TRANSCRIPTION_STATUS', 'done');
      this.isTranscribing = false;
      
      // UI Updates
      this.loadingState.classList.add('hidden');
      this.editorContainer.classList.remove('hidden');
      
    } catch (err) {
      console.error(err);
      this.statusText.textContent = `Error: ${err.message}`;
      if (err.message === 'Job not found') {
        store.dispatch('SET_TRANSCRIPTION_STATUS', 'idle');
        store.dispatch('SET_TRANSCRIPTION_JOB_ID', null);
      } else {
        store.dispatch('SET_TRANSCRIPTION_STATUS', 'error');
      }
      this.btnTranscribe.classList.remove('hidden');
      
      const currentState = store.getState();
      if (!currentState.words || currentState.words.length === 0) {
        this.emptyState.classList.remove('hidden');
      }
      
      this.isTranscribing = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Transcriber();
});
