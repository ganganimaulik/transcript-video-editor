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
      if (state.transcriptionStatus === 'transcribing' && !this.isTranscribing) {
        // Resume if we have either a job ID or a GCS operation name
        if (state.transcriptionJobId || state.gcsOperationName) {
          this.resumeTranscription(state);
        }
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
    if (state.transcriptionJobId) {
      // Try reconnecting to the existing server-side job first
      this.startTranscription(state, { jobId: state.transcriptionJobId });
    } else if (state.gcsOperationName) {
      // No server job but we have the GCS operation — resume directly
      this.startTranscription(state, { resumeOperationName: state.gcsOperationName });
    }
  }

  async startTranscription(state, options = {}) {
    if (!state.fileId) return;

    this.isTranscribing = true;

    // UI Updates
    this.btnTranscribe.classList.add('hidden');
    this.emptyState.classList.add('hidden');
    this.loadingState.classList.remove('hidden');
    
    if (options.resumeOperationName) {
      this.statusText.textContent = 'Reconnecting to Google Cloud operation...';
    } else if (options.jobId) {
      this.statusText.textContent = 'Resuming transcription...';
    } else {
      this.statusText.textContent = 'Transcribing with Google Cloud STT...';
    }
    
    if (!options.jobId && !options.resumeOperationName) {
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
        resumeOperationName: options.resumeOperationName,
        onJobId: (id) => store.dispatch('SET_TRANSCRIPTION_JOB_ID', id),
        onOperationName: (name) => store.dispatch('SET_GCS_OPERATION_NAME', name)
      });
      
      store.dispatch('SET_WORDS', words);
      store.dispatch('SET_TRANSCRIPTION_STATUS', 'done');
      store.dispatch('SET_GCS_OPERATION_NAME', null); // Clean up after completion
      this.isTranscribing = false;
      
      // UI Updates
      this.loadingState.classList.add('hidden');
      this.editorContainer.classList.remove('hidden');
      
    } catch (err) {
      console.error(err);
      
      // If the server-side job was lost but we have a GCS operation name, try resuming it
      if (err.message === 'Job not found' && options.jobId && !options._isRetry) {
        const currentState = store.getState();
        if (currentState.gcsOperationName) {
          console.log('Server job lost, reconnecting to GCS operation:', currentState.gcsOperationName);
          this.statusText.textContent = 'Reconnecting to Google Cloud operation...';
          store.dispatch('SET_TRANSCRIPTION_JOB_ID', null);
          this.isTranscribing = false;
          this.startTranscription(state, {
            resumeOperationName: currentState.gcsOperationName,
            _isRetry: true
          });
          return;
        }
        
        // No GCS operation name stored — fall back to restarting transcription
        console.log('No GCS operation name stored, restarting transcription from scratch...');
        this.statusText.textContent = 'Previous job expired. Restarting transcription...';
        store.dispatch('SET_TRANSCRIPTION_JOB_ID', null);
        this.isTranscribing = false;
        this.startTranscription(state, { _isRetry: true });
        return;
      }
      
      this.statusText.textContent = `Error: ${err.message}`;
      store.dispatch('SET_TRANSCRIPTION_STATUS', 'error');
      store.dispatch('SET_GCS_OPERATION_NAME', null);
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
