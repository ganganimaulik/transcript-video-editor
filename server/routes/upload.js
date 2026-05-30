import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getVideoDuration } from '../utils/ffmpeg.js';

const router = express.Router();

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    // Generate a unique filename while preserving extension
    const ext = path.extname(file.originalname);
    const id = uuidv4();
    cb(null, `${id}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10GB limit (adjust as needed)
});

router.post('/', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const fileId = req.file.filename;
    const originalName = req.file.originalname;
    const filePath = req.file.path;

    // Get video duration
    let duration = 0;
    try {
      duration = await getVideoDuration(filePath);
    } catch (err) {
      console.warn(`Could not determine duration for ${originalName}:`, err.message);
    }

    res.json({
      fileId,
      filename: originalName,
      duration,
      url: `/api/files/${fileId}`
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'Internal server error during upload.' });
  }
});

export default router;
