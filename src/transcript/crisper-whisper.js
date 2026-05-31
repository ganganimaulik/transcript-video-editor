import { api } from '../api.js';
import { TranscriptionProvider } from './provider.js';

export class CrisperWhisperProvider extends TranscriptionProvider {
  constructor(providerName = 'crisperwhisper') {
    super();
    this.providerName = providerName;
  }

  /**
   * Transcribe a video file using CrisperWhisper
   * @param {string} fileId 
   * @param {Function} onProgress Callback for status updates
   * @param {Object} options Options like jobId for resume
   * @returns {Promise<Array>}
   */
  async transcribe(fileId, onProgress, options = {}) {
    try {
      let jobId = options.jobId;

      if (!jobId) {
        onProgress('uploading', 0);
        try {
          const res = await api.transcribeVideo(fileId, this.providerName);
          jobId = res.jobId;
          if (options.onJobId) options.onJobId(jobId);
        } catch(e) {
            throw new Error(`Failed to start CrisperWhisper transcription: ${e.message}`);
        }
      }

      return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`/api/transcribe/${jobId}/progress`);
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          if (data.status === 'completed') {
            eventSource.close();
            resolve(data.words);
          } else if (data.status === 'failed') {
            eventSource.close();
            reject(new Error(data.error || 'Transcription failed'));
          } else {
            onProgress(data.status, data.progress);
          }
        };

        eventSource.onerror = (error) => {
          eventSource.close();
          reject(new Error('Connection to transcription server lost'));
        };
      });
    } catch (error) {
      console.error('CrisperWhisper Provider Error:', error);
      throw error;
    }
  }
}
