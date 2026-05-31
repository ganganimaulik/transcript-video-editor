import express from 'express';
import path from 'path';
import fs from 'fs';
import speech from '@google-cloud/speech';
import { Storage } from '@google-cloud/storage';
import { extractAudio, extractAudioMp3 } from '../utils/ffmpeg.js';
import OpenAI from 'openai';

import { v4 as uuidv4 } from 'uuid';
import { exec, spawn } from 'child_process';

const router = express.Router();

let openai;
try {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} catch(e) {
  console.error(e.message);
  console.warn("OpenAI initialized failed or missing API key");
}

// Store active transcribe jobs
const jobs = new Map();

function processCrisperWhisperResults(data) {
  const words = [];
  let wordId = 0;
  let lastEnd = 0;

  if (data.chunks) {
    for (const chunk of data.chunks) {
      let start = chunk.timestamp[0];
      let end = chunk.timestamp[1] || start + 0.5;

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

      const wordText = chunk.text.trim();
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

  return words;
}

/**
 * Process transcription results into word objects with pauses and filler detection.
 * @param {Object} data - The LongRunningRecognize response
 * @returns {Array} Processed word objects
 */
function processOpenAITranscriptionResults(data) {
  const words = [];
  let wordId = 0;
  let lastEnd = 0;

  if (data.words) {
    for (const wordInfo of data.words) {
      let start = wordInfo.start;
      let end = wordInfo.end;

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

  return words;
}

function processTranscriptionResults(data) {
  const words = [];
  let wordId = 0;
  let lastEnd = 0;

  if (data.results) {
    for (const result of data.results) {
      if (result.alternatives && result.alternatives[0] && result.alternatives[0].words) {
        for (const wordInfo of result.alternatives[0].words) {
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

  return words;
}

router.post('/', async (req, res) => {
  try {
    const { fileId, provider = 'google' } = req.body;
    
    if (!fileId) {
      return res.status(400).json({ error: 'fileId is required' });
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const videoPath = path.join(uploadDir, fileId);

    // Prevent path traversal attacks
    if (!path.resolve(videoPath).startsWith(path.resolve(uploadDir))) {
      return res.status(400).json({ error: 'Invalid file ID.' });
    }
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Video file not found.' });
    }

    if (provider === 'google') {
      // Need credentials configuration for STT and Storage
      const bucketName = process.env.GCS_BUCKET_NAME;
      if (!bucketName) {
         return res.status(500).json({ error: 'GCS_BUCKET_NAME not configured on the server.'});
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
          try {
            if (fs.existsSync(audioPath)) {
              fs.unlinkSync(audioPath);
            }
          } catch (e) {}
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
            try {
              if (fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath);
              }
            } catch (e) {}
            return;
        }

        jobs.set(jobId, { status: 'transcribing', progress: 0 });
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
          // Store the GCS operation name so the frontend can persist it for resume
          jobs.set(jobId, { status: 'transcribing', progress: 0, operationName: operation.name });
          operation.on('progress', (metadata) => {
              if (metadata && metadata.progressPercent !== undefined) {
                  jobs.set(jobId, { status: 'transcribing', progress: metadata.progressPercent, operationName: operation.name });
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
          try {
            if (fs.existsSync(audioPath)) {
              fs.unlinkSync(audioPath);
            }
          } catch (e) {}
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
      const words = processTranscriptionResults(data);
      jobs.set(jobId, { status: 'completed', words });

      })(); // End of async IIFE
    } else if (provider === 'openai') {
      if (!openai) {
        return res.status(500).json({ error: 'OpenAI is not configured on the server.'});
      }

      const jobId = uuidv4();
      jobs.set(jobId, { status: 'extracting', progress: 0 });

      // Respond immediately with jobId
      res.json({ jobId });

      (async () => {
        // 1. Extract audio
        const audioFileName = `${fileId}.mp3`;
        const audioPath = path.join(uploadDir, audioFileName);

        try {
          await extractAudioMp3(videoPath, audioPath);
        } catch(err) {
          console.error('Audio extraction failed:', err);
          jobs.set(jobId, { status: 'failed', error: 'Failed to extract mp3 audio from video.' });
          try {
            if (fs.existsSync(audioPath)) {
              fs.unlinkSync(audioPath);
            }
          } catch (e) {}
          return;
        }

        jobs.set(jobId, { status: 'transcribing', progress: 0 });

        // 2. Transcribe using OpenAI Whisper API
        let data;
        try {
          const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"],
          });
          data = transcription;
        } catch (err) {
          console.error('OpenAI Transcription failed:', err);
          try {
            if (fs.existsSync(audioPath)) {
              fs.unlinkSync(audioPath);
            }
          } catch (e) {}
          jobs.set(jobId, { status: 'failed', error: err.message || 'Transcription failed.' });
          return;
        }

        // 3. Clean up local audio
        try {
          fs.unlinkSync(audioPath);
        } catch(e) {
          console.warn("Failed to delete temp local audio file", e);
        }

        // 4. Process results
        const words = processOpenAITranscriptionResults(data);
        jobs.set(jobId, { status: 'completed', words });
      })();
    } else if (provider === 'crisperwhisper') {
      const jobId = uuidv4();
      jobs.set(jobId, { status: 'extracting', progress: 0 });

      // Respond immediately with jobId
      res.json({ jobId });

      (async () => {
        // 1. Extract audio
        const audioFileName = `${fileId}-crisper.wav`;
        const audioPath = path.join(uploadDir, audioFileName);

        try {
          await extractAudio(videoPath, audioPath);
        } catch(err) {
          console.error('Audio extraction failed:', err);
          jobs.set(jobId, { status: 'failed', error: 'Failed to extract audio for CrisperWhisper.' });
          return;
        }

        jobs.set(jobId, { status: 'transcribing', progress: 0 });

        // 2. Run Python Script (use venv python for CrisperWhisper's custom transformers fork)
        const scriptPath = path.resolve('server/transcribe.py');
        const venvPython = path.resolve('.venv/bin/python3');
        const pythonProcess = spawn(venvPython, [scriptPath, audioPath]);
        
        let stdoutData = '';
        let stderrData = '';

        pythonProcess.stdout.on('data', (data) => {
          stdoutData += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
          const str = data.toString();
          stderrData += str;
          
          const lines = str.split('\n');
          for (const line of lines) {
            if (line.includes('PROGRESS:')) {
              // Extract the value after PROGRESS:
              const match = line.match(/PROGRESS:(\d+)/);
              if (match) {
                const progressVal = parseInt(match[1], 10);
                if (!isNaN(progressVal)) {
                  jobs.set(jobId, { status: 'transcribing', progress: progressVal });
                }
              }
            }
          }
        });

        pythonProcess.on('close', (code) => {
          // Clean up audio
          try {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          } catch(e) {}

          if (code !== 0) {
            console.error('CrisperWhisper script error code:', code);
            console.error('stderr:', stderrData);
            jobs.set(jobId, { status: 'failed', error: 'Failed to run local CrisperWhisper transcription.' });
            return;
          }

          try {
            const data = JSON.parse(stdoutData);
            if (data.error) {
              jobs.set(jobId, { status: 'failed', error: data.error });
              return;
            }
            const words = processCrisperWhisperResults(data);
            jobs.set(jobId, { status: 'completed', words });
          } catch (err) {
            console.error('Failed to parse CrisperWhisper JSON output:', err);
            jobs.set(jobId, { status: 'failed', error: 'Invalid output from CrisperWhisper script.' });
          }
        });
      })();
    } else {
      res.status(400).json({ error: 'Invalid provider specified' });
    }
  } catch (error) {
    console.error('Transcription Init Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error initializing transcription.' });
  }
});

// Resume an existing Google Cloud operation after server restart
router.post('/resume', async (req, res) => {
  try {
    const { operationName } = req.body;

    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    const jobId = uuidv4();
    jobs.set(jobId, { status: 'transcribing', progress: 0, operationName });
    res.json({ jobId });

    // Reconnect to the existing Google Cloud operation in the background
    (async () => {
      try {
        const client = new speech.SpeechClient();
        const operation = await client.checkLongRunningRecognizeProgress(operationName);

        if (operation.done) {
          // Operation already completed on Google's side
          const words = processTranscriptionResults(operation.result);
          jobs.set(jobId, { status: 'completed', words });
          return;
        }

        // Operation still in progress — attach progress listener and wait
        operation.on('progress', (metadata) => {
          if (metadata && metadata.progressPercent !== undefined) {
            jobs.set(jobId, { status: 'transcribing', progress: metadata.progressPercent, operationName });
          }
        });

        const [response] = await operation.promise();
        const words = processTranscriptionResults(response);
        jobs.set(jobId, { status: 'completed', words });
      } catch (err) {
        console.error('Resume transcription failed:', err);
        jobs.set(jobId, { status: 'failed', error: err.message || 'Failed to resume transcription.' });
      }
    })();

  } catch (error) {
    console.error('Resume Init Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error resuming transcription.' });
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
