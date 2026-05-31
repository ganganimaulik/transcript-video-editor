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

### 1. General Setup

Clone the repository and install the frontend/backend Node.js dependencies:

```bash
# Clone the repository
git clone <repo-url>
cd video-editor

# Install Node.js dependencies
npm install

# Copy environment template
cp .env.example .env
```

### 2. Transcription Setup

You can choose one of the following transcription providers:

#### Option A: Modal.com (Recommended for Speed)
This offloads the heavy machine learning model to a cloud GPU (e.g., NVIDIA T4) on Modal, which is much faster and doesn't require local GPU resources.

1. Create a free account at [Modal.com](https://modal.com/).
2. Install the Modal client:
   ```bash
   pip install modal
   ```
3. Authenticate with your Modal account:
   ```bash
   modal setup
   ```
4. Deploy the transcription endpoint:
   ```bash
   modal deploy server/modal_whisper.py
   ```
5. Copy the deployment URL printed in your terminal (e.g. `https://<username>--crisper-whisper-app-transcribe-endpoint.modal.run`) and set it in your `.env` file:
   ```env
   MODAL_CRISPER_URL=https://your-username--crisper-whisper-app-transcribe-endpoint.modal.run
   ```

#### Option B: Local CrisperWhisper (Offline)
Runs the model locally using your machine's CPU or local GPU.

1. Create and activate a Python virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
2. Install the required Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

#### Option C: Google Cloud STT
Uses Google Cloud Speech-to-Text API.
1. Create a Google Cloud Project and enable the Speech-to-Text API.
2. Create a GCS bucket.
3. Configure `GOOGLE_CLOUD_API_KEY` and `GCS_BUCKET_NAME` in your `.env` file.

#### Option D: OpenAI Whisper
Uses OpenAI's Whisper API.
1. Create an OpenAI API key.
2. Configure `OPENAI_API_KEY` in your `.env` file.

### 3. Run the Project

Start both the frontend Vite dev server and the backend Express server concurrently:

```bash
npm run dev
```

- **Frontend:** `http://localhost:5173`
- **Backend:** `http://localhost:3001`

---

## Environment Variables

Configure these variables in your `.env` file:

| Variable | Required | Description |
|----------|----------|-------------|
| `UPLOAD_DIR` | Yes | Directory for uploaded videos (default: `./uploads`) |
| `EXPORT_DIR` | Yes | Directory for exported videos (default: `./exports`) |
| `PORT` | No | Backend server port (default: `3001`) |
| `MODAL_CRISPER_URL` | No | Your deployed Modal endpoint URL (required for Modal provider) |
| `GOOGLE_CLOUD_API_KEY` | No | Google Cloud API key (required for Google STT provider) |
| `GCS_BUCKET_NAME` | No | Google Cloud Storage bucket name (required for Google STT provider) |
| `OPENAI_API_KEY` | No | OpenAI API key (required for OpenAI Whisper provider) |

---

## Tech Stack

- **Frontend** — Vanilla JS + Vite
- **Backend** — Node.js + Express
- **Transcription** — [CrisperWhisper](https://github.com/nyrahealth/CrisperWhisper) (local/Modal GPU) / Google Cloud STT / OpenAI Whisper

