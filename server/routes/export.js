import express from 'express';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { runExport } from '../utils/ffmpeg.js';

const router = express.Router();

// Store active export jobs
const jobs = new Map();

router.post('/', async (req, res) => {
  try {
    const { fileId, segments } = req.body;
    
    if (!fileId || !segments || !Array.isArray(segments)) {
      return res.status(400).json({ error: 'fileId and segments array are required.' });
    }

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const exportDir = process.env.EXPORT_DIR || './exports';
    const videoPath = path.join(uploadDir, fileId);
    
    if (!fs.existsSync(videoPath)) {
      return res.status(404).json({ error: 'Source video file not found.' });
    }

    const jobId = uuidv4();
    const outputFilename = `export_${jobId}.mp4`;
    const outputPath = path.join(exportDir, outputFilename);

    jobs.set(jobId, {
        status: 'processing',
        progress: 0,
        filename: outputFilename
    });

    // Start FFmpeg process asynchronously
    runExport(videoPath, segments, outputPath, (progressData) => {
        // Calculate progress percentage. We need total duration of the exported video.
        // The total duration is sum of all segment durations.
        const totalDuration = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
        
        let percentage = 0;
        if (totalDuration > 0) {
            percentage = Math.min((progressData.currentSeconds / totalDuration) * 100, 99);
        }
        
        jobs.set(jobId, {
            ...jobs.get(jobId),
            progress: percentage
        });
    }).then((finalPath) => {
        jobs.set(jobId, {
            status: 'completed',
            progress: 100,
            filename: outputFilename,
            url: `/api/downloads/${outputFilename}`
        });
    }).catch((err) => {
        console.error(`Export Job ${jobId} Failed:`, err);
        jobs.set(jobId, {
            status: 'failed',
            error: err.message
        });
    });

    // Respond immediately with the jobId so client can track progress
    res.json({ jobId });

  } catch (error) {
    console.error('Export Initiation Error:', error);
    res.status(500).json({ error: 'Internal server error while starting export.' });
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
            res.write(`data: ${JSON.stringify({ status: 'error', error: 'Job not found' })}\n\n`);
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
