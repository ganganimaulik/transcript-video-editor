import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkFFmpeg } from './utils/ffmpeg.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const EXPORT_DIR = process.env.EXPORT_DIR || './exports';

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '500mb' }));

// Routes
import uploadRoutes from './routes/upload.js';
import transcribeRoutes from './routes/transcribe.js';
import exportRoutes from './routes/export.js';
import projectRoutes from './routes/projects.js';

app.use('/api/upload', uploadRoutes);
app.use('/api/transcribe', transcribeRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/projects', projectRoutes);

// Serve uploaded files statically for playback
app.use('/api/files', express.static(UPLOAD_DIR));
// Serve exported files statically for download
app.use('/api/downloads', express.static(EXPORT_DIR));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ffmpeg: checkFFmpeg() });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  
  if (!checkFFmpeg()) {
    console.error('ERROR: FFmpeg is not installed or not in PATH.');
    console.error('Please install FFmpeg to use this application.');
  } else {
    console.log('FFmpeg is available.');
  }
});
