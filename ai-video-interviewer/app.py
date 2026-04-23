import flask
import random
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from gradio_client import Client, handle_file
from gtts import gTTS
import os
import datetime
import speech_recognition as sr
import shutil
import subprocess
import sys
import re
import io
import tempfile
from contextlib import redirect_stdout, redirect_stderr
from uuid import uuid4

try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.utils import simpleSplit
    from reportlab.pdfgen import canvas
except Exception:
    letter = None
    simpleSplit = None
    canvas = None

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None


INTERVIEW_SESSIONS = {}
HANDOFF_CONTEXTS = {}

STOPWORDS = {
    "about", "after", "again", "against", "their", "there", "these", "those", "would", "could",
    "should", "where", "which", "while", "your", "with", "from", "have", "been", "into", "that",
    "this", "when", "what", "were", "they", "them", "ours", "over", "under", "more", "most",
    "very", "just", "like", "than", "then", "also", "such", "used", "using", "does", "done",
    "into", "role", "work", "years", "year", "tell", "give", "some", "many", "each", "across",
    "are", "highly", "seeking", "skilled", "strong", "excellent", "responsible", "ability",
    "requirements", "requirement", "preferred", "mandatory", "must", "nice", "plus",
}

NOISE_KEYWORDS = {
    "seeking", "highly", "skilled", "strong", "excellent", "responsible", "ability", "detail",
    "communication", "team", "player", "dynamic", "fast", "paced", "environment", "candidate",
    "experience", "professional", "resume", "curriculum", "vitae",
}

PRIORITY_TOPICS = [
    "machine learning", "deep learning", "natural language processing", "computer vision",
    "data science", "data analysis", "data visualization", "tableau", "power bi",
    "sql", "mysql", "postgresql", "python", "pandas", "scikit-learn", "tensorflow", "pytorch",
    "forecasting", "demand forecasting", "route optimization", "optimization", "or-tools",
    "statistics", "experimentation", "a/b testing", "feature engineering", "model deployment",
]


def _clean_line(line):
    return line.replace("**", "").strip()


def normalize_question(text):
    if not text:
        return ""
    lowered = _clean_line(text).lower()
    lowered = re.sub(r"^🤖\s*interviewer:\s*", "", lowered)
    lowered = re.sub(r"^ai\s*interviewer:\s*", "", lowered)
    lowered = re.sub(r"[^a-z0-9\s]", "", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def extract_keywords(text, top_n=12):
    if not text:
        return []
    words = re.findall(r"[a-zA-Z][a-zA-Z0-9+#.-]{2,}", text.lower())
    unique = []
    seen = set()
    for word in words:
        if word in STOPWORDS or word in NOISE_KEYWORDS:
            continue
        if word.isdigit():
            continue
        if word in seen:
            continue
        seen.add(word)
        unique.append(word)
        if len(unique) >= top_n:
            break
    return unique


def extract_priority_topics(text, top_n=8):
    if not text:
        return []
    lowered = text.lower()
    topics = []
    for phrase in PRIORITY_TOPICS:
        if phrase in lowered and phrase not in topics:
            topics.append(phrase)
            if len(topics) >= top_n:
                break
    return topics


def extract_resume_text(pdf_path, max_chars=4000):
    if not PdfReader:
        return ""
    try:
        reader = PdfReader(pdf_path)
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
            if sum(len(p) for p in parts) > max_chars:
                break
        text = "\n".join(parts).strip()
        return text[:max_chars]
    except Exception:
        return ""


def create_temp_resume_pdf(resume_text, resume_name="resume_from_handoff.txt"):
    if not canvas or not letter or not simpleSplit:
        raise RuntimeError("PDF generation support is unavailable. Install reportlab to continue.")

    safe_name = os.path.splitext(os.path.basename(resume_name or "resume"))[0] or "resume"
    temp_file = tempfile.NamedTemporaryFile(prefix=f"temp_{safe_name}_", suffix=".pdf", delete=False)
    temp_file.close()

    page_width, page_height = letter
    margin = 48
    line_height = 13
    y = page_height - margin

    pdf = canvas.Canvas(temp_file.name, pagesize=letter)
    pdf.setTitle(safe_name)
    pdf.setFont("Helvetica", 11)

    text = (resume_text or "").strip() or "Resume content not provided."
    paragraphs = text.splitlines() or [text]

    for paragraph in paragraphs:
        wrapped_lines = simpleSplit(paragraph or " ", "Helvetica", 11, page_width - (margin * 2)) or [""]
        for line in wrapped_lines:
            if y < margin:
                pdf.showPage()
                pdf.setFont("Helvetica", 11)
                y = page_height - margin
            pdf.drawString(margin, y, line)
            y -= line_height

        y -= 4

    pdf.save()
    return temp_file.name


def extract_last_interviewer_question(conversation_text):
    """Return the latest interviewer question line from a conversation transcript."""
    if not conversation_text:
        return ""

    lines = [_clean_line(line) for line in conversation_text.splitlines() if _clean_line(line)]
    interviewer_lines = [
        line for line in lines
        if line.lower().startswith("🤖 interviewer:") or line.lower().startswith("ai interviewer:")
    ]

    if interviewer_lines:
        return interviewer_lines[-1]
    return lines[-1] if lines else ""


def extract_recent_turns(conversation_text, max_lines=8):
    """Return the most recent meaningful conversation lines."""
    if not conversation_text:
        return ""

    lines = [_clean_line(line) for line in conversation_text.splitlines() if _clean_line(line)]
    return "\n".join(lines[-max_lines:])


def build_contextual_followup_prompt(user_response_text, conversation_history, job_desc, resume_name, resume_text):
    """Build a context-rich response payload to guide personalized follow-up questions."""
    recent_turns = extract_recent_turns(conversation_history, max_lines=6)
    trimmed_jd = (job_desc or "").strip()
    if len(trimmed_jd) > 700:
        trimmed_jd = trimmed_jd[:700] + "..."

    trimmed_resume = (resume_text or "").strip()
    if len(trimmed_resume) > 700:
        trimmed_resume = trimmed_resume[:700] + "..."

    topic_hints = extract_priority_topics(trimmed_jd + "\n" + trimmed_resume, top_n=5)
    if not topic_hints:
        topic_hints = extract_keywords(trimmed_jd + "\n" + trimmed_resume, top_n=5)

    resume_label = resume_name or "uploaded resume"

    prompt_sections = [
        "Context for next interview turn:",
        f"- Resume source: {resume_label}",
        f"- Resume excerpt: {trimmed_resume if trimmed_resume else 'Not available'}",
        f"- Job description summary: {trimmed_jd if trimmed_jd else 'Not provided'}",
        f"- Priority technical topics: {', '.join(topic_hints) if topic_hints else 'Not detected'}",
        "- Recent conversation:",
        recent_turns if recent_turns else "(No previous turns)",
        "- Candidate latest answer:",
        user_response_text,
        (
            "Instruction: Ask one new, non-repetitive, personalized next question that follows logically "
            "from the candidate's latest answer and aligns with the job description and resume. "
            "Do not repeat previous questions. Do not ask generic 'tell me about your experience' style questions."
        ),
    ]

    return "\n".join(prompt_sections)


def generate_fallback_question(session_data, user_response_text):
    covered_topics = session_data.setdefault("covered_topics", [])
    jd_keywords = session_data.get("jd_topics", []) or session_data.get("jd_keywords", [])
    resume_keywords = session_data.get("resume_topics", []) or session_data.get("resume_keywords", [])

    topic = ""
    for keyword in jd_keywords + resume_keywords:
        if keyword not in covered_topics:
            covered_topics.append(keyword)
            topic = keyword
            break

    if not topic:
        # Pull context from stored resume + JD text for richer extraction
        resume_text = session_data.get("resume_text", "")
        job_desc = session_data.get("job_desc", "")
        combined_ctx = (resume_text + "\n" + job_desc + "\n" + user_response_text).strip()
        answer_topics = extract_priority_topics(combined_ctx, top_n=5)
        answer_keywords = extract_keywords(combined_ctx, top_n=8)
        # Prefer uncovered topics
        all_candidates = answer_topics + answer_keywords
        topic = next((t for t in all_candidates if t not in covered_topics), (all_candidates + [""])[0])
        if topic:
            covered_topics.append(topic)

    templates = [
        "Can you walk me through a project where {topic} was central, including your exact ownership and final outcome?",
        "When using {topic}, what trade-offs did you evaluate and how did you validate that your approach was effective?",
        "Tell me about a challenging moment in your {topic} work and how you debugged or improved the solution.",
        "How did your {topic} work influence business metrics, and what would you improve if you repeated that project today?",
        "What specific tools or libraries did you use for {topic}, and why did you choose them over alternatives?",
        "Walk me through the architecture or design decisions you made when working with {topic}.",
        "How did you measure success or correctness in your {topic} implementation?",
        "If a junior engineer asked you to explain {topic} from scratch, what key concepts would you start with?",
        "Describe a time when your {topic} solution didn't work as expected — what did you learn from that?",
        "How did you stay current with best practices in {topic}, and did those practices influence your work?",
        "What was the biggest scalability or performance challenge you faced while working with {topic}?",
        "How did you collaborate with your team when {topic} was a shared responsibility?",
        "If you were to redo your {topic} project with no constraints, what would you change and why?",
        "What assumptions did you make early on about {topic} that turned out to be wrong?",
        "How did stakeholder requirements shape the way you approached {topic} in that project?",
    ]

    # Pick a random template that hasn't been used recently
    used_templates = session_data.setdefault("used_templates", [])
    unused = [t for t in templates if t not in used_templates]
    if not unused:
        # All used — reset and start fresh
        used_templates.clear()
        unused = templates[:]
    template = random.choice(unused)
    used_templates.append(template)
    # Keep memory bounded
    if len(used_templates) > len(templates):
        used_templates.pop(0)
    session_data["fallback_counter"] = session_data.get("fallback_counter", 0) + 1

    if topic:
        return template.format(topic=topic)

    return "Could you walk me through one impactful project from your resume and explain your role, approach, and results?"


def parse_int(value, default_value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default_value


def build_completion_response(conversation_history, user_response_text, session_id, completion_reason):
    message = completion_reason or "Interview completed. Thank you for your time."
    updated_conversation = conversation_history
    if user_response_text:
        updated_conversation += f"\n\n**You:** {user_response_text}"
    updated_conversation += f"\n\n🤖 Interviewer: {message}"
    audio_url = text_to_speech(message, "closing")
    return {
        "conversation": updated_conversation,
        "audio_url": audio_url,
        "transcription": user_response_text,
        "ai_response": message,
        "session_id": session_id,
        "interview_complete": True,
        "completion_reason": message,
    }, 200


def handle_user_response_text(user_response_text, conversation_history, session_id, job_desc, resume_name, active_interview_seconds):
    session_data = INTERVIEW_SESSIONS.get(session_id, {
        "resume_name": resume_name,
        "resume_text": "",
        "job_desc": job_desc,
        "jd_keywords": extract_keywords(job_desc, top_n=14),
        "jd_topics": extract_priority_topics(job_desc, top_n=14),
        "resume_keywords": [],
        "resume_topics": [],
        "asked_questions": [],
        "covered_topics": [],
        "fallback_counter": 0,
        "max_questions": 8,
        "max_active_seconds": 20 * 60,
    })

    user_response_text = (user_response_text or "").strip()
    if not user_response_text:
        return {
            "error": "No clear speech detected.",
            "details": "Please speak a bit louder and pause briefly after your answer.",
        }, 400

    max_active_seconds = session_data.get("max_active_seconds", 20 * 60)
    max_questions = session_data.get("max_questions", 8)
    asked_questions = session_data.setdefault("asked_questions", [])

    if max_active_seconds > 0 and active_interview_seconds >= max_active_seconds:
        return build_completion_response(
            conversation_history,
            user_response_text,
            session_id,
            "Time limit reached. Great work completing this mock interview.",
        )

    if max_questions > 0 and len(asked_questions) >= max_questions:
        return build_completion_response(
            conversation_history,
            user_response_text,
            session_id,
            "Question limit reached. Great work completing this mock interview.",
        )

    contextual_response = build_contextual_followup_prompt(
        user_response_text=user_response_text,
        conversation_history=conversation_history,
        job_desc=session_data.get("job_desc", job_desc),
        resume_name=session_data.get("resume_name", resume_name),
        resume_text=session_data.get("resume_text", ""),
    )

    try:
        result = client.predict(response=contextual_response, api_name="/gradio_handle_response")
    except Exception as e:
        return {"error": f"Failed to communicate with AI: {e}"}, 500

    ai_full_response = result[0]
    previous_question = extract_last_interviewer_question(conversation_history)
    new_ai_part = extract_last_interviewer_question(ai_full_response)
    previous_question_norm = normalize_question(previous_question)

    repeat_attempts = 0
    while repeat_attempts < 1 and new_ai_part:
        normalized_new = normalize_question(new_ai_part)
        repeat_phrase = "more about your experience"
        is_repeat = (
            normalized_new == previous_question_norm or
            normalized_new in asked_questions or
            (repeat_phrase in normalized_new and repeat_phrase in previous_question_norm)
        )
        if not is_repeat:
            break

        topic_hint = ", ".join(session_data.get("jd_keywords", [])[:5]) or "the job requirements"
        nudge = (
            f"Your previous question was repeated: '{previous_question}'. "
            f"Ask one different question focused on {topic_hint}. "
            "Do not ask about general experience again unless explicitly needed."
        )
        try:
            retry_result = client.predict(response=nudge, api_name="/gradio_handle_response")
            retry_conversation = retry_result[0]
            retry_question = extract_last_interviewer_question(retry_conversation)
            if retry_question:
                ai_full_response = retry_conversation
                new_ai_part = retry_question
        except Exception:
            break
        repeat_attempts += 1

    normalized_new = normalize_question(new_ai_part)
    if (not new_ai_part) or (normalized_new == previous_question_norm) or (normalized_new in asked_questions):
        new_ai_part = generate_fallback_question(session_data, user_response_text)
        ai_full_response = conversation_history + f"\n\n**You:** {user_response_text}\n\n🤖 Interviewer: {new_ai_part}"
        normalized_new = normalize_question(new_ai_part)

    if normalized_new:
        asked_questions.append(normalized_new)
        if len(asked_questions) > 50:
            del asked_questions[0]

    session_data["last_active_seconds"] = active_interview_seconds
    if session_id:
        INTERVIEW_SESSIONS[session_id] = session_data

    audio_url = text_to_speech(new_ai_part, "question")
    return {
        "conversation": ai_full_response,
        "audio_url": audio_url,
        "transcription": user_response_text,
        "ai_response": new_ai_part,
        "session_id": session_id,
        "interview_complete": False,
        "completion_reason": "",
    }, 200

def configure_ffmpeg_paths():
    """Find local FFmpeg binaries and expose them through environment variables."""
    candidates = []

    ffmpeg_env = os.environ.get("FFMPEG_BINARY") or os.environ.get("FFMPEG_PATH")
    ffprobe_env = os.environ.get("FFPROBE_BINARY") or os.environ.get("FFPROBE_PATH")

    if ffmpeg_env:
        candidates.append((ffmpeg_env, ffprobe_env or ffmpeg_env.replace("ffmpeg", "ffprobe")))

    which_ffmpeg = shutil.which("ffmpeg")
    which_ffprobe = shutil.which("ffprobe")
    if which_ffmpeg:
        candidates.append((which_ffmpeg, which_ffprobe or which_ffmpeg.replace("ffmpeg", "ffprobe")))

    user_home = os.path.expanduser("~")
    candidates.extend([
        (
            r"C:\\ffmpeg\\bin\\ffmpeg.exe",
            r"C:\\ffmpeg\\bin\\ffprobe.exe",
        ),
        (
            os.path.join(user_home, "Downloads", "Projects", "ffmpeg-8.1-essentials_build", "bin", "ffmpeg.exe"),
            os.path.join(user_home, "Downloads", "Projects", "ffmpeg-8.1-essentials_build", "bin", "ffprobe.exe"),
        ),
    ])

    for ffmpeg_path, ffprobe_path in candidates:
        if ffmpeg_path and os.path.exists(ffmpeg_path):
            ffmpeg_dir = os.path.dirname(ffmpeg_path)
            current_path = os.environ.get("PATH", "")
            if ffmpeg_dir and ffmpeg_dir not in current_path.split(os.pathsep):
                os.environ["PATH"] = ffmpeg_dir + os.pathsep + current_path if current_path else ffmpeg_dir
            os.environ["FFMPEG_BINARY"] = ffmpeg_path
            if ffprobe_path and os.path.exists(ffprobe_path):
                os.environ["FFPROBE_BINARY"] = ffprobe_path
            elif ffmpeg_dir:
                inferred_ffprobe = os.path.join(ffmpeg_dir, "ffprobe.exe")
                if os.path.exists(inferred_ffprobe):
                    os.environ["FFPROBE_BINARY"] = inferred_ffprobe
            return ffmpeg_path, ffprobe_path if ffprobe_path and os.path.exists(ffprobe_path) else None

    return None, None


FFMPEG_BINARY, FFPROBE_BINARY = configure_ffmpeg_paths()
FFMPEG_AVAILABLE = bool(FFMPEG_BINARY)


def convert_webm_to_wav(input_path, output_path):
    """Convert browser-recorded WebM audio to WAV using ffmpeg directly."""
    if not FFMPEG_BINARY:
        raise RuntimeError("FFmpeg binary is not configured.")

    command = [
        FFMPEG_BINARY,
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "16000",
        output_path,
    ]

    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except FileNotFoundError as exc:
        raise RuntimeError(f"FFmpeg executable not found: {FFMPEG_BINARY}") from exc
    except subprocess.CalledProcessError as exc:
        stderr_text = (exc.stderr or "").strip()
        raise RuntimeError(stderr_text or "ffmpeg failed to convert audio.") from exc

# --- Initialize Flask App and CORS ---
app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.jinja_env.auto_reload = True
CORS(app, resources={r"/*": {"origins": "*"}})

# --- Initialize Gradio Client with Error Handling ---
try:
    with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
        client = Client("ahmedatk/ai_interviewer")
except Exception as e:
    print(f"Startup error: could not initialize AI client: {e}")
    sys.exit(1)

# --- Helper Functions ---
def text_to_speech(text, filename_prefix="response"):
    """Converts text to an MP3 file and returns its URL."""
    audio_folder = os.path.join(app.static_folder, 'audio')
    os.makedirs(audio_folder, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{filename_prefix}_{timestamp}.mp3"
    filepath = os.path.join(audio_folder, filename)
    
    cleaned_text = text.replace('**', '')
    if not cleaned_text.strip():
        cleaned_text = "I did not get a response."
        
    tts = gTTS(text=cleaned_text, lang='en', slow=False)
    tts.save(filepath)
    return f"/static/audio/{filename}?v={timestamp}"

# --- API Endpoints ---
@app.route('/')
def index():
    """Serves the main HTML page."""
    context_id = (request.args.get('context_id') or '').strip()
    handoff_context = HANDOFF_CONTEXTS.get(context_id, {})
    return render_template('index.html', handoff_context=handoff_context)


@app.route('/favicon.ico')
def favicon():
    return ("", 204)


@app.route('/handoff-context', methods=['POST'])
def handoff_context():
    """Accept context from the main app and return a launch URL with a context ID."""
    payload = request.get_json(silent=True) or {}
    job_desc = (payload.get('job_desc') or '').strip()
    resume_text = (payload.get('resume_text') or '').strip()

    if not job_desc:
        return jsonify({"error": "Missing job description for handoff."}), 400

    context_id = str(uuid4())
    HANDOFF_CONTEXTS[context_id] = {
        "interview_id": payload.get('interview_id', ''),
        "candidate_email": payload.get('candidate_email', ''),
        "callback_url": payload.get('callback_url', ''),
        "callback_token": payload.get('callback_token', ''),
        "resume_name": payload.get('resume_name', 'resume_from_handoff.txt'),
        "resume_text": resume_text,
        "job_desc": job_desc,
        "max_questions": max(1, min(parse_int(payload.get('max_questions'), 8), 30)),
        "time_limit_minutes": max(1, min(parse_int(payload.get('time_limit_minutes'), 20), 180)),
    }

    return jsonify({
        "success": True,
        "context_id": context_id,
        "launch_url": f"/?context_id={context_id}"
    })

@app.route('/start-interview', methods=['POST'])
def start_interview():
    """Starts the interview using the Gradio client on the server."""
    has_resume_file = 'resume' in request.files and request.files['resume'].filename
    resume_text_input = (request.form.get('resume_text') or '').strip()
    if (not has_resume_file and not resume_text_input) or 'job_desc' not in request.form:
        return jsonify({"error": "Missing resume (file or text) or job description"}), 400

    resume_file = request.files['resume'] if has_resume_file else None
    job_desc = request.form['job_desc']
    resume_name = request.form.get('resume_name', '')
    max_questions = max(1, min(parse_int(request.form.get('max_questions'), 8), 30))
    time_limit_minutes = max(1, min(parse_int(request.form.get('time_limit_minutes'), 20), 180))

    temp_resume_path = None
    if resume_file:
        temp_resume_temp = tempfile.NamedTemporaryFile(prefix="temp_resume_", suffix=".pdf", delete=False)
        temp_resume_path = temp_resume_temp.name
        temp_resume_temp.close()
        resume_file.save(temp_resume_path)
        resume_text = extract_resume_text(temp_resume_path)
        if not resume_text:
            resume_text = resume_text_input
        if not resume_name:
            resume_name = resume_file.filename
    else:
        resume_name = resume_name or "resume_from_handoff.txt"
        temp_resume_path = create_temp_resume_pdf(resume_text_input, resume_name)
        resume_text = resume_text_input
    
    try:
        result = client.predict(
            resume=handle_file(temp_resume_path),
            job_desc=job_desc,
            api_name="/gradio_start_interview"
        )
    except Exception as e:
        return jsonify({"error": f"Failed to communicate with AI: {e}"}), 500
    finally:
        if temp_resume_path and os.path.exists(temp_resume_path):
            os.remove(temp_resume_path)
    
    conversation_text = result[0]
    first_question = extract_last_interviewer_question(conversation_text)
    session_id = str(uuid4())
    INTERVIEW_SESSIONS[session_id] = {
        "resume_name": resume_name,
        "resume_text": resume_text,
        "job_desc": job_desc,
        "jd_keywords": extract_keywords(job_desc, top_n=14),
        "jd_topics": extract_priority_topics(job_desc, top_n=14),
        "resume_keywords": extract_keywords(resume_text, top_n=14),
        "resume_topics": extract_priority_topics(resume_text, top_n=14),
        "asked_questions": [normalize_question(first_question)] if first_question else [],
        "covered_topics": [],
        "fallback_counter": 0,
        "max_questions": max_questions,
        "max_active_seconds": time_limit_minutes * 60,
    }
    audio_url = text_to_speech(first_question, "question_0")
    
    return jsonify({
        "conversation": conversation_text,
        "audio_url": audio_url,
        "session_id": session_id,
        "max_questions": max_questions,
        "time_limit_minutes": time_limit_minutes,
    })

@app.route('/process-response', methods=['POST'])
def process_response():
    """Transcribes user audio and gets the next AI response."""
    if 'audio' not in request.files or 'conversation_history' not in request.form:
        return jsonify({"error": "Missing audio or conversation history"}), 400

    if not FFMPEG_AVAILABLE:
        return jsonify({
            "error": "FFmpeg is not configured on this server.",
            "details": "Install ffmpeg/ffprobe or set FFMPEG_BINARY and FFPROBE_BINARY before uploading audio."
        }), 500

    audio_file = request.files['audio']
    conversation_history = request.form['conversation_history']
    session_id = request.form.get('session_id', '')
    job_desc = request.form.get('job_desc', '')
    resume_name = request.form.get('resume_name', '')
    active_interview_seconds = max(0, parse_int(request.form.get('active_interview_seconds'), 0))
    
    # 1. Transcribe audio to text
    try:
        input_filename = "temp_user_audio.webm"
        wav_filename = "temp_user_audio.wav"
        audio_file.save(input_filename)
        convert_webm_to_wav(input_filename, wav_filename)
        
        recognizer = sr.Recognizer()
        with sr.AudioFile(wav_filename) as source:
            audio_data = recognizer.record(source)
            user_response_text = recognizer.recognize_google(audio_data)
    except sr.UnknownValueError:
        return jsonify({
            "error": "No clear speech detected.",
            "details": "Please speak a bit louder and pause briefly after your answer."
        }), 400
    except Exception as e:
        print(f"Audio Processing Error: {e}")
        return jsonify({
            "error": "Audio processing failed.",
            "details": str(e)
        }), 500
    finally:
        if os.path.exists(input_filename): os.remove(input_filename)
        if os.path.exists(wav_filename): os.remove(wav_filename)

    payload, status_code = handle_user_response_text(
        user_response_text=user_response_text,
        conversation_history=conversation_history,
        session_id=session_id,
        job_desc=job_desc,
        resume_name=resume_name,
        active_interview_seconds=active_interview_seconds,
    )
    return jsonify(payload), status_code


@app.route('/process-text-response', methods=['POST'])
def process_text_response():
    """Fast path: process already-transcribed text response from browser speech recognition."""
    if 'text_response' not in request.form or 'conversation_history' not in request.form:
        return jsonify({"error": "Missing text response or conversation history"}), 400

    user_response_text = request.form.get('text_response', '')
    conversation_history = request.form.get('conversation_history', '')
    session_id = request.form.get('session_id', '')
    job_desc = request.form.get('job_desc', '')
    resume_name = request.form.get('resume_name', '')
    active_interview_seconds = max(0, parse_int(request.form.get('active_interview_seconds'), 0))

    payload, status_code = handle_user_response_text(
        user_response_text=user_response_text,
        conversation_history=conversation_history,
        session_id=session_id,
        job_desc=job_desc,
        resume_name=resume_name,
        active_interview_seconds=active_interview_seconds,
    )
    return jsonify(payload), status_code


if __name__ == '__main__':
    app.run(debug=False, port=5001)