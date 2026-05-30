import { TranscriptionProvider } from './provider.js';
import { api } from '../api.js';

export class GoogleSTTProvider extends TranscriptionProvider {
  transcribe(fileId, onProgress, options = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        let jobId = options.jobId;

        if (!jobId) {
          // Check if we have a GCS operation name to resume
          if (options.resumeOperationName) {
            const res = await api.resumeTranscription(options.resumeOperationName);
            jobId = res.jobId;
            if (options.onJobId) {
              options.onJobId(jobId);
            }
          } else {
            const res = await api.transcribeVideo(fileId);
            jobId = res.jobId;
            if (options.onJobId) {
              options.onJobId(jobId);
            }
          }
        }

        const eventSource = new EventSource(`/api/transcribe/${jobId}/progress`);
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          
          // Capture the GCS operation name when the server sends it
          if (data.operationName && options.onOperationName) {
            options.onOperationName(data.operationName);
          }
          
          if (data.status === 'completed') {
            eventSource.close();
            resolve(data.words);
          } else if (data.status === 'error' || data.status === 'failed') {
            eventSource.close();
            reject(new Error(data.error || 'Transcription failed'));
          } else if (onProgress) {
            onProgress(data.status, data.progress);
          }
        };
        
        eventSource.onerror = () => {
          eventSource.close();
          reject(new Error('Connection lost while tracking transcription progress.'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }
}
