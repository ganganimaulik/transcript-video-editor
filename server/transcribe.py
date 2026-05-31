import sys
import json
import argparse
import warnings
import torch
import wave
import contextlib
import math
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

def get_audio_duration(file_path):
    try:
        with contextlib.closing(wave.open(file_path, 'r')) as f:
            frames = f.getnframes()
            rate = f.getframerate()
            return frames / float(rate)
    except Exception:
        return 0

def main():
    parser = argparse.ArgumentParser(description="Transcribe audio using CrisperWhisper")
    parser.add_argument("audio_path", help="Path to the audio file")
    args = parser.parse_args()

    # Suppress warnings for clean JSON output
    warnings.filterwarnings("ignore")

    try:
        device = "cuda:0" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
        torch_dtype = torch.float16 if device == "cuda:0" else torch.float32

        model_id = "nyrahealth/CrisperWhisper"

        # Load model and processor explicitly (required for CrisperWhisper)
        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id,
            torch_dtype=torch_dtype,
            low_cpu_mem_usage=True,
            use_safetensors=True
        )
        model.to(device)
        processor = AutoProcessor.from_pretrained(model_id)

        pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            chunk_length_s=30,
            batch_size=1,
            return_timestamps="word",
            torch_dtype=torch_dtype,
            device=device
        )

        duration = get_audio_duration(args.audio_path)
        step = 20 # 30 - 5(left) - 5(right)
        total_chunks = max(1, math.ceil((duration - 30) / step) + 1) if duration > 30 else 1

        orig_forward = pipe.forward
        chunks_done = 0

        def patched_forward(*args_fw, **kwargs_fw):
            nonlocal chunks_done
            chunks_done += 1
            progress = min(99, int((chunks_done / total_chunks) * 100))
            print(f"PROGRESS:{progress}", file=sys.stderr, flush=True)
            return orig_forward(*args_fw, **kwargs_fw)

        pipe.forward = patched_forward

        result = pipe(args.audio_path)
        
        # Ensure only JSON is printed to stdout
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
