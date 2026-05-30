import { spawn, execSync } from 'child_process';
import path from 'path';

export function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

export function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        resolve(parseFloat(output.trim()));
      } else {
        reject(new Error('Failed to get video duration'));
      }
    });
  });
}

export function extractAudioMp3(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Extract audio as mp3 for OpenAI Whisper to save size (Whisper accepts 25MB limit)
    const ffmpeg = spawn('ffmpeg', [
      '-y',
      '-i', videoPath,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '2', // VBR quality (approx 190 kbps)
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error('Failed to extract mp3 audio'));
      }
    });
  });
}

export function extractAudio(videoPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Extract audio as 16kHz mono WAV for Google STT
    const ffmpeg = spawn('ffmpeg', [
      '-y', // Overwrite
      '-i', videoPath,
      '-vn', // No video
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      outputPath
    ]);

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error('Failed to extract audio'));
      }
    });
  });
}

export function runExport(videoPath, segments, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    if (!segments || segments.length === 0) {
      return reject(new Error('No segments provided'));
    }

    // Build filter complex
    let filterComplex = '';
    let concatInputs = '';

    segments.forEach((seg, i) => {
      filterComplex += `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}];`;
      filterComplex += `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}];`;
      concatInputs += `[v${i}][a${i}]`;
    });

    filterComplex += `${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`;

    const args = [
      '-y', // Overwrite output
      '-i', videoPath,
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '[outa]',
      // Use efficient encodings
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '22',
      '-c:a', 'aac',
      '-b:a', '128k',
      outputPath
    ];

    const ffmpeg = spawn('ffmpeg', args);

    let errorOutput = '';

    // Parse progress from stderr
    // ffmpeg outputs lines like: frame=  123 fps= 30 q=28.0 size=     256kB time=00:00:04.10 bitrate= 511.0kbits/s speed=1.01x
    ffmpeg.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      
      if (timeMatch && onProgress) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseFloat(timeMatch[3]);
        const currentSeconds = hours * 3600 + minutes * 60 + seconds;
        
        onProgress({
          timeRaw: timeMatch[0],
          currentSeconds: currentSeconds
        });
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        console.error('FFmpeg export error:', errorOutput);
        reject(new Error(`FFmpeg exited with code ${code}. Error: ${errorOutput.split('\\n').slice(-5).join('\\n')}`));
      }
    });
  });
}
