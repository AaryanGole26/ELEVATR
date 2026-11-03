"""Service tests for the interview API. AI and speech are disabled, so these run offline."""
import importlib
import os
import sys
import threading
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["INTERVIEW_SERVICE_SECRET"] = "test-secret"
os.environ["GEMINI_API_KEY"] = ""
os.environ["GOOGLE_API_KEY"] = ""

interview_app = importlib.import_module("app")
from question_engine import QuestionEngine, extract_priority_topics, normalize_question  # noqa: E402

HEADERS = {"X-Elevatr-Service-Secret": "test-secret"}
HANDOFF = {
    "interview_id": "abc",
    "job_title": "Data Engineer",
    "job_desc": "We need Python, SQL and machine learning experience for data pipelines.",
    "resume_text": "SECRET-RESUME built Python pipelines and SQL warehouses at Acme.",
    "max_questions": 2,
    "time_limit_minutes": 20,
    "callback_url": "http://app.test/api/interviews/abc/result",
    "callback_token": "SECRET-TOKEN",
}


@pytest.fixture(autouse=True)
def isolated():
    interview_app.HANDOFFS.clear()
    interview_app.SESSIONS.clear()
    interview_app.engine = QuestionEngine(api_key="")
    with patch.object(interview_app, "text_to_speech", return_value=None):
        yield


@pytest.fixture
def client():
    return interview_app.app.test_client()


def handoff(client):
    response = client.post("/handoff-context", json=HANDOFF, headers=HEADERS)
    assert response.status_code == 200
    return response.get_json()["context_id"]


def test_handoff_requires_secret(client):
    assert client.post("/handoff-context", json=HANDOFF).status_code == 401
    assert client.post("/handoff-context", json=HANDOFF, headers={"X-Elevatr-Service-Secret": "wrong"}).status_code == 401


def test_page_does_not_expose_private_context(client):
    context_id = handoff(client)
    page = client.get(f"/?context_id={context_id}").get_data(as_text=True)
    assert "Data Engineer" in page
    assert "SECRET-TOKEN" not in page
    assert "SECRET-RESUME" not in page
    assert "app.test" not in page


def test_interview_runs_to_limit_and_reports_server_transcript(client):
    context_id = handoff(client)
    started = client.post("/start-interview", data={"context_id": context_id}).get_json()
    assert started["questions_asked"] == 1
    session_id = started["session_id"]

    first = client.post("/process-text-response", data={"session_id": session_id, "text_response": "I built pipelines."}).get_json()
    assert first["interview_complete"] is False
    assert first["questions_asked"] == 2

    last = client.post("/process-text-response", data={"session_id": session_id, "text_response": "I tuned the warehouse."}).get_json()
    assert last["interview_complete"] is True

    captured = {}

    class Ok:
        ok = True
        status_code = 200

    def fake_post(url, json, headers, timeout):
        captured.update(url=url, json=json, headers=headers)
        return Ok()

    with patch.object(interview_app.requests, "post", fake_post):
        # The body's transcript is ignored: the service reports what it recorded itself.
        done = client.post("/complete-interview", json={"session_id": session_id, "reason": "done", "proctor_violations": 1, "transcript": "FORGED"})
    assert done.status_code == 200
    assert captured["url"] == HANDOFF["callback_url"]
    assert captured["headers"]["X-Elevatr-Service-Secret"] == "test-secret"
    assert captured["json"]["callback_token"] == "SECRET-TOKEN"
    assert captured["json"]["questions_answered"] == 2
    assert captured["json"]["proctor_violations"] == 1
    assert "I built pipelines." in captured["json"]["transcript"]
    assert "FORGED" not in captured["json"]["transcript"]

    after = client.post("/process-text-response", data={"session_id": session_id, "text_response": "One more"})
    assert after.status_code == 409


def test_reloading_resumes_the_same_session(client):
    context_id = handoff(client)
    first = client.post("/start-interview", data={"context_id": context_id}).get_json()
    second = client.post("/start-interview", data={"context_id": context_id}).get_json()
    assert first["session_id"] == second["session_id"]
    assert len(second["turns"]) == 1


def test_failed_delivery_can_be_retried(client):
    context_id = handoff(client)
    session_id = client.post("/start-interview", data={"context_id": context_id}).get_json()["session_id"]

    class Bad:
        ok = False
        status_code = 500

    class Ok:
        ok = True
        status_code = 200

    with patch.object(interview_app.requests, "post", return_value=Bad()):
        assert client.post("/complete-interview", json={"session_id": session_id}).status_code == 502
    with patch.object(interview_app.requests, "post", return_value=Ok()) as post:
        assert client.post("/complete-interview", json={"session_id": session_id}).status_code == 200
        assert client.post("/complete-interview", json={"session_id": session_id}).status_code == 200
        assert post.call_count == 1


def test_sessions_are_isolated_under_concurrency(client):
    """The old service shared one upstream conversation and fixed temp filenames between candidates."""
    def run(index, results):
        local = interview_app.app.test_client()
        context_id = local.post("/handoff-context", json={**HANDOFF, "max_questions": 5, "interview_id": str(index)}, headers=HEADERS).get_json()["context_id"]
        session_id = local.post("/start-interview", data={"context_id": context_id}).get_json()["session_id"]
        local.post("/process-text-response", data={"session_id": session_id, "text_response": f"answer-from-{index}"})
        results[index] = session_id

    results = {}
    threads = [threading.Thread(target=run, args=(i, results)) for i in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert len(set(results.values())) == 8
    for index, session_id in results.items():
        answers = [t["text"] for t in interview_app.SESSIONS[session_id]["turns"] if t["role"] == "candidate"]
        assert answers == [f"answer-from-{index}"]


def test_expired_sessions_are_purged(client):
    context_id = handoff(client)
    interview_app.HANDOFFS[context_id]["created_at"] -= interview_app.SESSION_TTL_SECONDS + 1
    interview_app.purge_expired()
    assert context_id not in interview_app.HANDOFFS


def test_empty_answer_is_rejected(client):
    context_id = handoff(client)
    session_id = client.post("/start-interview", data={"context_id": context_id}).get_json()["session_id"]
    assert client.post("/process-text-response", data={"session_id": session_id, "text_response": "   "}).status_code == 400


def test_unknown_session_is_rejected(client):
    assert client.post("/process-text-response", data={"session_id": "nope", "text_response": "hello"}).status_code == 404


def test_template_questions_do_not_repeat():
    engine = QuestionEngine(api_key="")
    session = {
        "turns": [],
        "job_desc": HANDOFF["job_desc"],
        "resume_text": HANDOFF["resume_text"],
        "jd_topics": extract_priority_topics(HANDOFF["job_desc"]),
        "resume_topics": [],
        "jd_keywords": [],
        "resume_keywords": [],
    }
    seen = set()
    for _ in range(4):
        question, source = engine.next_question(session)
        assert source == "template"
        normalized = normalize_question(question)
        assert normalized not in seen
        seen.add(normalized)
        session["turns"].append({"role": "interviewer", "text": question})


def test_topic_matching_uses_whole_terms():
    assert "aws" not in extract_priority_topics("Experience with labor laws and draws")
    assert "aws" in extract_priority_topics("Deployed on AWS")
