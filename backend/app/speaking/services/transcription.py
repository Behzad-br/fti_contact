"""
services/transcription.py — Local Whisper transcription service.

Adapted from scripts/transcribe.py in the original repo.

Key design decisions:
  - Whisper model is loaded ONCE at startup and cached — not reloaded per request.
  - Accepts WebM, OGG, MP4, WAV (whatever browser MediaRecorder produces).
  - Uses FFmpeg (via subprocess) for audio conversion to 16kHz mono WAV.
  - Temporary files are deleted after transcription.
  - FFmpeg must be installed and on PATH. See README.md for install instructions.
"""
import logging
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional

from app.config import settings

# ── FFmpeg path resolution ──────────────────────────────────────────────────
# winget installs ffmpeg but the PATH update only takes effect in new shells.
# We search common install locations so the server works without a restart.
_FFMPEG_FALLBACK_DIRS = [
    # WinGet install path (Windows)
    Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages",
    # Chocolatey
    Path("C:/ProgramData/chocolatey/bin"),
    # Scoop
    Path.home() / "scoop" / "shims",
]


def _find_ffmpeg() -> str:
    """Return the ffmpeg executable path, searching fallback dirs if needed."""
    import shutil
    # 1. Already on PATH?
    found = shutil.which("ffmpeg")
    if found:
        return found
    # 2. Search known install locations
    for base in _FFMPEG_FALLBACK_DIRS:
        if not base.exists():
            continue
        for exe in base.rglob("ffmpeg.exe"):
            return str(exe)
    # 3. Give up — return bare name and let subprocess raise FileNotFoundError
    return "ffmpeg"


_FFMPEG_EXE = _find_ffmpeg()
logger_tmp = logging.getLogger(__name__)
logger_tmp.info("FFmpeg executable resolved to: %s", _FFMPEG_EXE)

logger = logging.getLogger(__name__)

# Cached Whisper model — loaded lazily on first use
_whisper_model = None
_loaded_model_name: Optional[str] = None


def get_whisper_model():
    """Load (or return cached) Whisper model."""
    global _whisper_model, _loaded_model_name
    model_name = settings.WHISPER_MODEL

    if _whisper_model is not None and _loaded_model_name == model_name:
        return _whisper_model

    logger.info("Loading Whisper model '%s' — this may take a moment...", model_name)
    try:
        import whisper
        _whisper_model = whisper.load_model(model_name)
        _loaded_model_name = model_name
        logger.info("Whisper model '%s' loaded successfully.", model_name)
        return _whisper_model
    except Exception as exc:
        logger.error("Failed to load Whisper model: %s", exc)
        raise RuntimeError(
            f"Cannot load Whisper model '{model_name}'. "
            f"Make sure openai-whisper is installed: pip install openai-whisper"
        ) from exc


def _convert_to_wav(input_path: str, output_path: str) -> float:
    """
    Convert any audio format to 16kHz mono WAV using FFmpeg.
    Returns duration in seconds.

    Raises:
        RuntimeError if FFmpeg is not found or conversion fails.
    """
    cmd = [
        _FFMPEG_EXE, "-y",
        "-i", input_path,
        "-ar", "16000",    # 16kHz sample rate (Whisper requirement)
        "-ac", "1",        # mono
        "-f", "wav",
        output_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            "FFmpeg not found. Please install FFmpeg and add it to your PATH.\n"
            "Windows: winget install ffmpeg  OR  choco install ffmpeg\n"
            "See README.md for full installation instructions."
        ) from exc

    if result.returncode != 0:
        logger.error("FFmpeg stderr: %s", result.stderr[:500])
        raise RuntimeError(f"FFmpeg conversion failed: {result.stderr[:200]}")

    # Extract duration from FFmpeg stderr
    duration = 0.0
    for line in result.stderr.split("\n"):
        if "Duration:" in line:
            try:
                time_str = line.split("Duration:")[1].split(",")[0].strip()
                h, m, s = time_str.split(":")
                duration = int(h) * 3600 + int(m) * 60 + float(s)
            except Exception:
                pass
            break

    return duration


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> dict:
    """
    Transcribe audio bytes using local Whisper.

    Args:
        audio_bytes: Raw audio file bytes from browser
        filename: Original filename (used to preserve extension hint)

    Returns:
        dict: {
            "transcript": str,
            "duration": float (seconds),
            "word_count": int,
            "language": str,
        }

    Raises:
        RuntimeError on FFmpeg or Whisper failure.
    """
    # Create temp directory
    tmp_dir = Path(settings.TEMP_DIR)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    uid = str(uuid.uuid4())[:8]
    ext = Path(filename).suffix or ".webm"
    input_path = str(tmp_dir / f"upload_{uid}{ext}")
    wav_path = str(tmp_dir / f"converted_{uid}.wav")

    try:
        # Write uploaded bytes to temp file
        with open(input_path, "wb") as f:
            f.write(audio_bytes)

        # Convert to 16kHz mono WAV
        duration = _convert_to_wav(input_path, wav_path)

        # Load Whisper model (cached after first call)
        model = get_whisper_model()

        # Transcribe
        language = settings.WHISPER_LANGUAGE if settings.WHISPER_LANGUAGE else None
        result = model.transcribe(
            wav_path,
            language=language,
            fp16=False,  # fp16=False for CPU compatibility
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
        )

        transcript = result.get("text", "").strip()
        detected_language = result.get("language", "en")

        from app.speaking.services.speech_quality import wav_rms

        rms = wav_rms(wav_path)
        no_speech_probs = [
            seg.get("no_speech_prob", 0)
            for seg in (result.get("segments") or [])
            if isinstance(seg, dict)
        ]
        no_speech_prob = max(no_speech_probs) if no_speech_probs else None

        # If FFmpeg couldn't extract duration, try from Whisper segments
        if duration == 0.0 and result.get("segments"):
            try:
                duration = result["segments"][-1]["end"]
            except Exception:
                pass

        word_count = len(transcript.split()) if transcript else 0

        return {
            "transcript": transcript,
            "duration": round(duration, 2),
            "word_count": word_count,
            "language": detected_language,
            "rms": round(rms, 1),
            "no_speech_prob": no_speech_prob,
        }

    finally:
        # Always clean up temp files
        for path in [input_path, wav_path]:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
