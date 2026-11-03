"""ELEVATR AI interview service.

Runs the live interview: questions, speech and proctoring signals. The main app hands over each
interview server-to-server, and this service reports the transcript back the same way, so the
candidate's browser never holds the resume, the callback URL or the shared secret.
"""
import hmac
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from uuid import uuid4

import requests
import speech_recognition as sr
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from gtts import gTTS
from pypdf import PdfReader
from werkzeug.middleware.proxy_fix import ProxyFix

from question_engine import (
    QuestionEngine,
    extract_keywords,
    extract_priority_topics,
)

# Real environment variables take priority over this file. All services share the root .env.local.
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env.local"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("interview-service")

SERVICE_SECRET = os.environ.get("INTERVIEW_SERVICE_SECRET", "")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("INTERVIEW_ALLOWED_ORIGINS", os.environ.get("NEXT_PUBLIC_APP_URL", "http://localhost:3000")).split(",")
    if origin.strip()
]

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_ANSWER_CHARS = 6000
MAX_FIELD_CHARS = 60_000
# Long enough for a full interview, after which sessions and their personal data are discarded.
SESSION_TTL_SECONDS = 6 * 60 * 60
AUDIO_TTL_SECONDS = 60 * 60

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
if os.environ.get("TRUST_PROXY_HEADERS") == "true":
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
CORS(app, resources={r"/health": {"origins": ALLOWED_ORIGINS}})

engine = QuestionEngine()
audio_dir = os.path.join(app.static_folder, "audio")
os.makedirs(audio_dir, exist_ok=True)

HANDOFFS = {}
SESSIONS = {}
store_lock = threading.Lock()


def now():
    return time.time()


def parse_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def clamp(value, default, low, high):
    return max(low, min(parse_int(value, default), high))


def purge_expired():
    """Removes expired interviews and old audio, so personal data doesn't accumulate."""
    cutoff = now() - SESSION_TTL_SECONDS
    with store_lock:
        for store in (HANDOFFS, SESSIONS):
            for key in [key for key, item in store.items() if item["created_at"] < cutoff]:
                del store[key]
    try:
        for entry in os.scandir(audio_dir):
            if entry.name.endswith(".mp3") and entry.stat().st_mtime < now() - AUDIO_TTL_SECONDS:
                os.remove(entry.path)
    except OSError:
        logger.exception("Audio cleanup failed")


def text_to_speech(text):
    """Returns an audio URL, or None. Speech is optional: the question also appears on screen."""
    filename = f"{uuid4().hex}.mp3"
    try:
        gTTS(text=text.replace("**", "").strip() or "Please continue.", lang="en").save(os.path.join(audio_dir, filename))
        return f"/static/audio/{filename}"
    except Exception as exc:
        logger.warning("Text-to-speech failed: %s", type(exc).__name__)
        return None


def extract_pdf_text(file_storage, max_chars=20_000):
    try:
        reader = PdfReader(file_storage.stream)
        parts, total = [], 0
        for page in reader.pages:
            text = page.extract_text() or ""
            parts.append(text)
            total += len(text)
            if total > max_chars:
                break
        return "\n".join(parts).strip()[:max_chars]
    except Exception as exc:
        logger.warning("Could not read uploaded PDF: %s", type(exc).__name__)
        return ""


def find_ffmpeg():
    return os.environ.get("FFMPEG_BINARY") or shutil.which("ffmpeg") or next(
        (path for path in [
            r"C:\ffmpeg\bin\ffmpeg.exe",
            os.path.join(os.path.expanduser("~"), "Downloads", "Projects", "ffmpeg-8.1-essentials_build", "bin", "ffmpeg.exe"),
        ] if os.path.exists(path)),
        None,
    )


FFMPEG = find_ffmpeg()


def transcribe(audio_file):
    """Each request gets its own temp directory, so concurrent candidates can't mix up audio."""
    with tempfile.TemporaryDirectory(prefix="elevatr_audio_") as folder:
        source, target = os.path.join(folder, "in.webm"), os.path.join(folder, "out.wav")
        audio_file.save(source)
        subprocess.run(
            [FFMPEG, "-y", "-i", source, "-ac", "1", "-ar", "16000", target],
            check=True, capture_output=True, timeout=60,
        )
        recognizer = sr.Recognizer()
        with sr.AudioFile(target) as stream:
            return recognizer.recognize_google(recognizer.record(stream))


def new_session(job_title, job_desc, resume_text, max_questions, time_limit_minutes, interview_id=None, callback_url=None, callback_token=None):
    session = {
        "id": str(uuid4()),
        "created_at": now(),
        "lock": threading.Lock(),
        "job_title": job_title,
        "job_desc": job_desc,
        "resume_text": resume_text,
        "jd_keywords": extract_keywords(job_desc, 14),
        "jd_topics": extract_priority_topics(job_desc, 14),
        "resume_keywords": extract_keywords(resume_text, 14),
        "resume_topics": extract_priority_topics(resume_text, 14),
        "covered_topics": [],
        "used_templates": [],
        "turns": [],
        "max_questions": max_questions,
        "max_active_seconds": time_limit_minutes * 60,
        "started_at": now(),
        "complete": False,
        "submitted": False,
        "interview_id": interview_id,
        "callback_url": callback_url,
        "callback_token": callback_token,
    }
    with store_lock:
        SESSIONS[session["id"]] = session
    return session


def get_session():
    session_id = (request.form.get("session_id") or (request.get_json(silent=True) or {}).get("session_id") or "").strip()
    with store_lock:
        return SESSIONS.get(session_id)


def questions_asked(session):
    return sum(1 for turn in session["turns"] if turn["role"] == "interviewer")


def public_turns(session):
    return [{"role": turn["role"], "text": turn["text"]} for turn in session["turns"]]


def transcript_text(session):
    return "\n".join(
        f"{'Candidate' if turn['role'] == 'candidate' else 'Interviewer'}: {turn['text']}"
        for turn in session["turns"]
    )


def submit_results(session, reason, proctor_violations, active_seconds):
    """Reports a finished interview to the main app. Runs at most once per session."""
    if not session["callback_url"] or session["submitted"]:
        return True
    payload = {
        "callback_token": session["callback_token"],
        "transcript": transcript_text(session),
        "questions_answered": sum(1 for turn in session["turns"] if turn["role"] == "candidate"),
        "max_questions": session["max_questions"],
        "active_interview_seconds": active_seconds,
        "proctor_violations": proctor_violations,
        "completion_reason": (reason or "Interview completed")[:500],
    }
    try:
        # The evaluation runs inside this request, so it gets a generous timeout.
        response = requests.post(
            session["callback_url"],
            json=payload,
            headers={"X-Elevatr-Service-Secret": SERVICE_SECRET},
            timeout=120,
        )
    except requests.RequestException as exc:
        logger.error("Result callback failed for %s: %s", session["interview_id"], type(exc).__name__)
        return False
    # 409 means this interview was already recorded, which is a success from here.
    if response.ok or response.status_code == 409:
        session["submitted"] = True
        return True
    logger.error("Result callback for %s returned %s", session["interview_id"], response.status_code)
    return False


def answer_and_continue(session, answer_text):
    """Records an answer and returns the next step. Interview state lives here, never in the browser."""
    answer_text = (answer_text or "").strip()[:MAX_ANSWER_CHARS]
    if not answer_text:
        return {"error": "No clear speech detected.", "details": "Please speak a little louder and pause after your answer."}, 400

    with session["lock"]:
        if session["complete"]:
            return {"error": "This interview has already ended."}, 409

        session["turns"].append({"role": "candidate", "text": answer_text})

        out_of_time = now() - session["started_at"] >= session["max_active_seconds"]
        out_of_questions = questions_asked(session) >= session["max_questions"]

        if out_of_time or out_of_questions:
            session["complete"] = True
            message = "That's all the time we have. Thank you for your answers." if out_of_time else "That was the final question. Thank you for your time."
            session["turns"].append({"role": "interviewer", "text": message})
            return {
                "transcription": answer_text,
                "ai_response": message,
                "audio_url": text_to_speech(message),
                "interview_complete": True,
                "completion_reason": message,
                "questions_asked": questions_asked(session) - 1,
            }, 200

        question, source = engine.next_question(session)
        session["turns"].append({"role": "interviewer", "text": question})
        return {
            "transcription": answer_text,
            "ai_response": question,
            "question_source": source,
            "audio_url": text_to_speech(question),
            "interview_complete": False,
            "questions_asked": questions_asked(session),
        }, 200


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "That file is too large."}), 413


@app.route("/")
def index():
    purge_expired()
    context_id = (request.args.get("context_id") or "").strip()
    with store_lock:
        handoff = HANDOFFS.get(context_id)
    # Only what the page displays. The resume, callback URL and token stay on the server.
    page_context = {
        "context_id": context_id,
        "job_title": handoff["job_title"],
        "max_questions": handoff["max_questions"],
        "time_limit_minutes": handoff["time_limit_minutes"],
    } if handoff else {}
    return render_template("index.html", handoff_context=page_context)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "ai_questions": engine.ai_enabled, "server_transcription": bool(FFMPEG)})


@app.route("/favicon.ico")
def favicon():
    return ("", 204)


@app.route("/handoff-context", methods=["POST"])
def handoff_context():
    """Accepts an interview from the main app. Only callers holding the shared secret are allowed."""
    provided = request.headers.get("X-Elevatr-Service-Secret", "")
    if not SERVICE_SECRET or not hmac.compare_digest(provided.encode(), SERVICE_SECRET.encode()):
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    job_desc = (payload.get("job_desc") or "").strip()[:MAX_FIELD_CHARS]
    callback_url = (payload.get("callback_url") or "").strip()
    if not job_desc or not callback_url.startswith(("http://", "https://")):
        return jsonify({"error": "Missing job description or callback URL."}), 400

    purge_expired()
    context_id = str(uuid4())
    with store_lock:
        HANDOFFS[context_id] = {
            "created_at": now(),
            "interview_id": str(payload.get("interview_id") or ""),
            "job_title": str(payload.get("job_title") or "this role")[:200],
            "job_desc": job_desc,
            "resume_text": (payload.get("resume_text") or "").strip()[:MAX_FIELD_CHARS],
            "max_questions": clamp(payload.get("max_questions"), 8, 1, 30),
            "time_limit_minutes": clamp(payload.get("time_limit_minutes"), 20, 1, 180),
            "callback_url": callback_url,
            "callback_token": str(payload.get("callback_token") or ""),
            "session_id": None,
        }
    return jsonify({"success": True, "context_id": context_id, "launch_url": f"/?context_id={context_id}"})


def session_response(session, audio_url):
    return jsonify({
        "session_id": session["id"],
        "turns": public_turns(session),
        "audio_url": audio_url,
        "questions_asked": questions_asked(session),
        "max_questions": session["max_questions"],
        "time_limit_minutes": session["max_active_seconds"] // 60,
        "elapsed_seconds": int(now() - session["started_at"]),
    })


@app.route("/start-interview", methods=["POST"])
def start_interview():
    """Starts or resumes a handed-off interview, or starts a standalone practice session."""
    context_id = (request.form.get("context_id") or "").strip()

    if context_id:
        with store_lock:
            handoff = HANDOFFS.get(context_id)
        if not handoff:
            return jsonify({"error": "This interview session has expired. Please reopen it from your interview link."}), 404

        # Reloading the page resumes the same interview rather than restarting it.
        with store_lock:
            existing = SESSIONS.get(handoff["session_id"]) if handoff["session_id"] else None
        if existing and not existing["complete"]:
            return session_response(existing, None)
        if existing:
            return jsonify({"error": "This interview has already ended."}), 409

        session = new_session(
            handoff["job_title"], handoff["job_desc"], handoff["resume_text"],
            handoff["max_questions"], handoff["time_limit_minutes"],
            handoff["interview_id"], handoff["callback_url"], handoff["callback_token"],
        )
        with store_lock:
            handoff["session_id"] = session["id"]
    else:
        job_desc = (request.form.get("job_desc") or "").strip()[:MAX_FIELD_CHARS]
        resume_upload = request.files.get("resume")
        resume_text = extract_pdf_text(resume_upload) if resume_upload and resume_upload.filename else ""
        resume_text = resume_text or (request.form.get("resume_text") or "").strip()[:MAX_FIELD_CHARS]
        if not job_desc or not resume_text:
            return jsonify({"error": "Please provide a readable PDF resume and a job description."}), 400
        session = new_session(
            "this role", job_desc, resume_text,
            clamp(request.form.get("max_questions"), 8, 1, 30),
            clamp(request.form.get("time_limit_minutes"), 20, 1, 180),
        )

    with session["lock"]:
        question, source = engine.next_question(session, opening=True)
        session["turns"].append({"role": "interviewer", "text": question})
    logger.info("Interview started (question source: %s)", source)
    return session_response(session, text_to_speech(question))


@app.route("/process-text-response", methods=["POST"])
def process_text_response():
    """Handles an answer already transcribed by the browser's speech recognition."""
    session = get_session()
    if not session:
        return jsonify({"error": "This interview session has expired."}), 404
    payload, status = answer_and_continue(session, request.form.get("text_response"))
    return jsonify(payload), status


@app.route("/process-response", methods=["POST"])
def process_response():
    """Handles recorded audio, for browsers without built-in speech recognition."""
    session = get_session()
    if not session:
        return jsonify({"error": "This interview session has expired."}), 404
    audio = request.files.get("audio")
    if not audio:
        return jsonify({"error": "No audio was received."}), 400
    if not FFMPEG:
        return jsonify({"error": "Voice transcription isn't available on this server.", "details": "Please type your answer instead."}), 503

    try:
        text = transcribe(audio)
    except sr.UnknownValueError:
        return jsonify({"error": "No clear speech detected.", "details": "Please speak a little louder and pause after your answer."}), 400
    except Exception as exc:
        logger.warning("Audio processing failed: %s", type(exc).__name__)
        return jsonify({"error": "We couldn't process that audio.", "details": "Please try again or type your answer."}), 502

    payload, status = answer_and_continue(session, text)
    return jsonify(payload), status


@app.route("/complete-interview", methods=["POST"])
def complete_interview():
    """Ends the interview and reports the server-side transcript to the main app."""
    session = get_session()
    if not session:
        return jsonify({"error": "This interview session has expired."}), 404
    body = request.get_json(silent=True) or {}
    with session["lock"]:
        session["complete"] = True
        elapsed = int(now() - session["started_at"])
        delivered = submit_results(
            session,
            str(body.get("reason") or "Interview completed"),
            max(0, parse_int(body.get("proctor_violations"), 0)),
            elapsed,
        )
    # A failure can be retried by the page, because the transcript stays here until the session expires.
    return jsonify({"delivered": delivered}), 200 if delivered else 502


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    if not SERVICE_SECRET:
        logger.warning("INTERVIEW_SERVICE_SECRET is not set: interviews from the main app will be refused.")
    if not engine.ai_enabled:
        logger.warning("GEMINI_API_KEY is not set: using template questions.")
    try:
        from waitress import serve

        logger.info("Interview service listening on port %s", port)
        serve(app, host="127.0.0.1", port=port, threads=8)
    except ImportError:
        app.run(debug=False, host="127.0.0.1", port=port, threaded=True)
