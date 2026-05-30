import express from 'express';
import path from 'path';
import fs from 'fs';
import speech from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { extractAudio } from '../utils/ffmpeg.js';

import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Store active transcribe jobs
const jobs = new Map();

router.post('/', async (req, res) => {
  try {
    const { fileId } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    // Need credentials configuration for STT and Storage
    const bucketName = process.env.GCS_BUCKET_NAME;
    if (!bucketName) {
       return res.status(500).json({ error: 'GCS_BUCKET_NAME not configured on the server.'});
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const videoPath = path.join(uploadDir, fileId);
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found.' });
    }

    const jobId = uuidv4();
    jobs.set(jobId, { status: 'extracting', progress: 0 });

    // Respond immediately with jobId
    res.json({ jobId });

    // Run transcription asynchronously
    (async () => {
      // 1. Extract audio
      const audioFileName = `${fileId}.wav`;
      const audioPath = path.join(uploadDir, audioFileName);
      
      try {
        await extractAudio(videoPath, audioPath);
      } catch(err) {
        console.error('Audio extraction failed:', err);
        jobs.set(jobId, { status: 'failed', error: 'Failed to extract audio from video.' });
        return;
      }

      // Get audio file size for progress calculation
      let audioSize = 1;
      try {
        audioSize = fs.statSync(audioPath).size;
      } catch (e) {
        console.warn('Failed to get audio file size', e);
      }

      jobs.set(jobId, { status: 'uploading', progress: 0 });

      // 2. Upload to GCS
      const storage = new Storage();
      const bucket = storage.bucket(bucketName);
      const destination = `audio-${Date.now()}-${audioFileName}`;
      const file = bucket.file(destination);

      try {
          await bucket.upload(audioPath, {
              destination: destination,
              onUploadProgress: (progressEvent) => {
                  let uploaded = progressEvent.bytesWritten || progressEvent.bytesRetained || progressEvent.loaded || 0;
                  let total = progressEvent.bytesTotal || progressEvent.total || audioSize;
                  if (total === 0) total = 1;
                  const progress = Math.min(Math.round((uploaded / total) * 100), 99);
                  jobs.set(jobId, { status: 'uploading', progress });
              }
          });
      } catch(err) {
          console.error('GCS Upload failed:', err);
          jobs.set(jobId, { status: 'failed', error: 'Failed to upload audio to Google Cloud Storage.' });
          return;
      }

      jobs.set(jobId, { status: 'transcribing' });
      const gcsUri = `gs://${bucketName}/${destination}`;

    // 3. Transcribe using LongRunningRecognize
    let data;
    try {
        const client = new speech.SpeechClient();
        const audio = {
            uri: gcsUri,
        };
        const config = {
            encoding: 'LINEAR16',
            sampleRateHertz: 16000,
            languageCode: 'en-US',
            enableWordTimeOffsets: true,
        };
        const request = {
            audio: audio,
            config: config,
        };

        const [operation] = await client.longRunningRecognize(request);
        operation.on('progress', (metadata) => {
            if (metadata && metadata.progressPercent !== undefined) {
                jobs.set(jobId, { status: 'transcribing', progress: metadata.progressPercent });
            }
        });
        const [response] = await operation.promise();
        data = response;
    } catch(err) {
        console.error('STT Transcription failed:', err);
        // Attempt to clean up GCS file before throwing
        try {
            await file.delete();
        } catch (e) {
            console.warn('Failed to delete file from GCS after error', e);
        }
        jobs.set(jobId, { status: 'failed', error: err.message || 'Transcription failed.' });
        return;
    }

    // 4. Clean up GCS
    try {
        await file.delete();
    } catch (e) {
        console.warn('Failed to delete file from GCS', e);
    }
    
    // 5. Clean up local audio
    try {
      fs.unlinkSync(audioPath);
    } catch(e) {
      console.warn("Failed to delete temp local audio file", e);
    }

    // 6. Process results
    const words = [];
    let wordId = 0;
    let lastEnd = 0;
    
    if (data.results) {
        for (const result of data.results) {
            if (result.alternatives && result.alternatives[0] && result.alternatives[0].words) {
                for (const wordInfo of result.alternatives[0].words) {
                    // Google SDK returns { startTime: { seconds: '1', nanos: 500000000 } }
                    let start = 0;
                    if (wordInfo.startTime) {
                        start = parseInt(wordInfo.startTime.seconds || 0) + (wordInfo.startTime.nanos || 0) / 1e9;
                    }
                    let end = 0;
                    if (wordInfo.endTime) {
                        end = parseInt(wordInfo.endTime.seconds || 0) + (wordInfo.endTime.nanos || 0) / 1e9;
                    }
                    
                    const gap = start - lastEnd;
                    if (gap >= 0.5) {
                        words.push({
                            id: wordId++,
                            text: `[Pause ${(gap).toFixed(1)}s]`,
                            start: lastEnd,
                            end: start,
                            deleted: false,
                            isPause: true
                        });
                    }

                    const wordText = wordInfo.word;
                    const normalizedWord = wordText.toLowerCase().replace(/[^a-z]/g, '');
                    const fillerWords = ['uh', 'um', 'ah', 'er', 'hmm', 'mhm'];
                    const isFiller = fillerWords.includes(normalizedWord);

                    words.push({
                        id: wordId++,
                        text: wordText,
                        start,
                        end,
                        deleted: false,
                        isFiller
                    });
                    
                    lastEnd = end;
                }
            }
        }
    }

    jobs.set(jobId, { status: 'completed', words });
    
    })(); // End of async IIFE
    
  } catch (error) {
    console.error('Transcription Init Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error initializing transcription.' });
  }
});

// Server-Sent Events endpoint for progress
router.get('/:jobId/progress', (req, res) => {
    const { jobId } = req.params;
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const checkInterval = setInterval(() => {
        const job = jobs.get(jobId);
        
        if (!job) {
            res.write(`data: ${JSON.stringify({ status: 'failed', error: 'Job not found' })}\n\n`);
            clearInterval(checkInterval);
            res.end();
            return;
        }

        res.write(`data: ${JSON.stringify(job)}\n\n`);

        if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(checkInterval);
            res.end();
            // Optional: remove job from map after some time
            setTimeout(() => jobs.delete(jobId), 1000 * 60 * 60); // 1 hour
        }
    }, 1000); // Check every second

    req.on('close', () => {
        clearInterval(checkInterval);
    });
});

export default router;
