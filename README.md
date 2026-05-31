# Transcript Video Editor

A transcript-based video editor that lets you edit video by editing text. Upload a video, get a word-level transcription with timestamps, then cut, rearrange, and remove sections by simply editing the transcript.

## Features

- 📝 **Transcript-based editing** — Edit video by editing text
- 🎯 **Word-level timestamps** — Precise timing for every word
- 🔍 **Filler word detection** — Automatically identifies "um", "uh", and other fillers
- ⏸️ **Pause detection** — Highlights gaps and silences
- 📤 **Export** — Export your edited video

## Transcription Providers

| Provider | Description |
|----------|-------------|
| **CrisperWhisper** | Local, verbatim transcription with accurate word timestamps and filler detection (recommended) |
| **Google Cloud STT** | Cloud-based, requires GCS bucket and API key |
| **OpenAI Whisper** | Cloud-based, requires OpenAI API key |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Python 3.10+](https://www.python.org/)
- [FFmpeg](https://ffmpeg.org/) installed and available in PATH

## Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd video-editor

# 2. Install Node.js dependencies
npm install

# 3. Set up Python virtual environment (required for CrisperWhisper)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 4. Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys (optional, only needed for Google/OpenAI providers)

# 5. Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173` with the backend API on port `3001`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UPLOAD_DIR` | Yes | Directory for uploaded videos (default: `./uploads`) |
| `EXPORT_DIR` | Yes | Directory for exported videos (default: `./exports`) |
| `PORT` | No | Backend server port (default: `3001`) |
| `GOOGLE_CLOUD_API_KEY` | No | Google Cloud API key (for Google STT provider) |
| `GCS_BUCKET_NAME` | No | Google Cloud Storage bucket name (for Google STT provider) |
| `OPENAI_API_KEY` | No | OpenAI API key (for OpenAI Whisper provider) |

## Tech Stack

- **Frontend** — Vanilla JS + Vite
- **Backend** — Node.js + Express
- **Transcription** — [CrisperWhisper](https://github.com/nyrahealth/CrisperWhisper) (local) / Google Cloud STT / OpenAI Whisper
