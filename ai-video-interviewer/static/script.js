document.addEventListener('DOMContentLoaded', () => {
    const handoff = window.ELEVATR_HANDOFF || {};
    const isHandoff = Boolean(handoff.context_id);

    const el = (id) => document.getElementById(id);
    const userVideo = el('userVideo');
    const startButton = el('startButton');
    const chatLog = el('chatLog');
    const audioPlayer = el('interviewerAudio');
    const setupDiv = el('setup');
    const setupStatus = el('setupStatus');
    const responseControls = el('responseControls');
    const recordButton = el('recordButton');
    const typeToggle = el('typeToggle');
    const typedForm = el('typedForm');
    const typedAnswer = el('typedAnswer');
    const statusDiv = el('status');
    const timerDiv = el('timerStatus');
    const counterDiv = el('questionCounter');
    const proctorDiv = el('proctorStatus');
    const speakingState = el('speakingState');
    const interviewerCard = document.querySelector('.interviewer');

    const MAX_RECORDING_MS = 90000;
    const MIN_RECORDING_MS = 1200;
    const SILENCE_MS = 1700;
    const SILENCE_THRESHOLD = 0.018;
    const MAX_VIOLATIONS = 3;
    const VIOLATION_COOLDOWN_MS = 3500;
    const MIN_AUDIO_BYTES = 3500;
    const RECOMMENDED_WIDTH = 960;
    const RECOMMENDED_HEIGHT = 540;

    let sessionId = '';
    let mediaStream = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let isProcessing = false;
    let interviewStarted = false;
    let maxQuestions = Number(handoff.max_questions) || 8;
    let timeLimitSeconds = (Number(handoff.time_limit_minutes) || 20) * 60;
    let questionsAsked = 0;
    let activeSeconds = 0;
    let timerHandle = null;
    let proctorHandle = null;
    let violationCount = 0;
    const violationLastSeen = {};
    let darkFrames = 0;
    let missingFaceChecks = 0;
    let offCenterChecks = 0;
    let probeCanvas = null;
    let probeContext = null;
    let faceDetector = null;
    let audioContext = null;
    let analyser = null;
    let lastRecordingWasAuto = false;
    let speechRecognizer = null;
    let useSpeechRecognition = false;
    let speechTranscript = '';
    let pendingSpeechSubmit = false;
    let speechTimeout = null;
    let inputLocked = false;
    let finishing = false;

    // ── Display ──────────────────────────────────────────
    function addMessage(text, sender) {
        const empty = chatLog.querySelector('.chat-empty');
        if (empty) empty.remove();
        const bubble = document.createElement('div');
        bubble.className = `message ${sender}-message`;
        // textContent, not innerHTML: answers and model output are untrusted.
        bubble.textContent = text;
        chatLog.appendChild(bubble);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    const formatTimer = (seconds) =>
        `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

    function updateCounter() {
        counterDiv.textContent = `Question ${questionsAsked} of ${maxQuestions}`;
    }

    function setProctorStatus(text, level) {
        proctorDiv.textContent = text;
        proctorDiv.classList.remove('alert', 'good');
        if (level) proctorDiv.classList.add(level);
    }

    function setSpeaking(speaking) {
        interviewerCard.classList.toggle('speaking', speaking);
        speakingState.textContent = speaking ? 'Speaking...' : 'Listening';
    }

    // ── Finishing ────────────────────────────────────────
    function showFinishScreen(title, message, success) {
        const main = el('main');
        main.replaceChildren();
        const card = document.createElement('section');
        card.className = 'glass finish';
        if (success) {
            const icon = document.createElement('div');
            icon.className = 'finish-icon';
            icon.textContent = '✓';
            icon.setAttribute('aria-hidden', 'true');
            card.appendChild(icon);
        }
        const heading = document.createElement('h1');
        heading.textContent = title;
        const text = document.createElement('p');
        text.className = 'muted';
        text.textContent = message;
        card.append(heading, text);
        main.appendChild(card);
    }

    async function reportCompletion(reason) {
        // Retries cover a brief outage. The service keeps the transcript until the session expires.
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const response = await fetch('/complete-interview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId, reason, proctor_violations: violationCount }),
                });
                if (response.ok) return true;
            } catch (error) {
                console.warn('Could not report completion', error);
            }
            await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
        }
        return false;
    }

    async function endInterview(reason) {
        if (finishing) return;
        finishing = true;
        interviewStarted = false;
        clearInterval(timerHandle);
        clearInterval(proctorHandle);
        disableInputLock();
        pendingSpeechSubmit = false;
        if (isRecording) {
            isRecording = false;
            if (useSpeechRecognition && speechRecognizer) speechRecognizer.stop();
            else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.onstop = null;
                mediaRecorder.stop();
            }
        }
        audioPlayer.pause();
        if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        if (mediaStream) mediaStream.getTracks().forEach((track) => track.stop());

        showFinishScreen('Saving your interview...', 'Please keep this tab open for a moment.', false);
        const saved = await reportCompletion(reason);

        if (!saved) {
            showFinishScreen('We could not save your interview', 'Your answers are still held on our server. Please keep this tab open and reload it in a minute, or contact the hiring team.', false);
            return;
        }
        if (isHandoff) {
            showFinishScreen('Interview complete', `${reason} The hiring team will review your interview, and you can now close this tab.`, true);
        } else {
            showFinishScreen('Practice complete', 'Nice work. Reload this page to practice again.', true);
        }
    }

    // ── Proctoring ───────────────────────────────────────
    function registerViolation(reason, key) {
        if (!interviewStarted) return;
        const now = Date.now();
        if (now - (violationLastSeen[key] || 0) < VIOLATION_COOLDOWN_MS) return;
        violationLastSeen[key] = now;

        violationCount += 1;
        setProctorStatus(`${reason} (Warning ${violationCount} of ${MAX_VIOLATIONS})`, 'alert');
        if (violationCount >= MAX_VIOLATIONS) {
            endInterview('The interview ended because of repeated proctoring warnings.');
        }
    }

    function checkCamera() {
        if (!interviewStarted) return;

        const track = userVideo.srcObject && userVideo.srcObject.getVideoTracks()[0];
        if (!track || track.readyState !== 'live' || track.muted) {
            registerViolation('Your camera is off or blocked. Please turn it back on.', 'camera');
            return;
        }
        if (userVideo.readyState < 2) return;

        try {
            if (!probeCanvas) {
                probeCanvas = document.createElement('canvas');
                probeCanvas.width = 64;
                probeCanvas.height = 36;
                probeContext = probeCanvas.getContext('2d', { willReadFrequently: true });
            }
            probeContext.drawImage(userVideo, 0, 0, 64, 36);
            const pixels = probeContext.getImageData(0, 0, 64, 36).data;
            let total = 0;
            let samples = 0;
            for (let i = 0; i < pixels.length; i += 32) {
                total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
                samples += 1;
            }
            if (total / samples < 22) {
                darkFrames += 1;
                if (darkFrames >= 2) {
                    registerViolation('Your camera looks covered or too dark.', 'camera');
                    darkFrames = 0;
                }
                return;
            }
            darkFrames = 0;
        } catch {
            // A frame that can't be sampled says nothing about the candidate, so it isn't a warning.
        }

        if (!faceDetector) {
            if (violationCount === 0) setProctorStatus('Camera active. Keep your face visible and centered.', 'good');
            return;
        }

        faceDetector.detect(userVideo).then((faces) => {
            if (!interviewStarted) return;
            if (!faces.length) {
                missingFaceChecks += 1;
                if (missingFaceChecks >= 2) {
                    registerViolation('We can\'t see your face. Please stay in frame.', 'face');
                    missingFaceChecks = 0;
                }
                return;
            }
            missingFaceChecks = 0;
            if (faces.length > 1) {
                registerViolation('More than one face is visible. Only the candidate should be on camera.', 'faces');
                return;
            }
            const box = faces[0].boundingBox;
            const offX = Math.abs((box.x + box.width / 2) / userVideo.videoWidth - 0.5);
            const offY = Math.abs((box.y + box.height / 2) / userVideo.videoHeight - 0.5);
            if (offX > 0.22 || offY > 0.24) {
                offCenterChecks += 1;
                if (offCenterChecks >= 2) {
                    setProctorStatus('Please look toward the camera.', 'alert');
                    offCenterChecks = 0;
                }
            } else {
                offCenterChecks = 0;
                if (violationCount === 0) setProctorStatus('You are visible and centered.', 'good');
            }
        }).catch(() => {});
    }

    // Keys that trigger on input in the answer controls are allowed; everything else is blocked.
    const LOCKED_EVENTS = ['keydown', 'mousedown', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'pointerdown', 'copy', 'cut', 'paste', 'dragstart', 'drop', 'selectstart'];

    function handleLockedInput(event) {
        if (!inputLocked || !interviewStarted) return;
        const inControls = event.target && typeof event.target.closest === 'function' && event.target.closest('#responseControls');
        if (event.type === 'contextmenu' || !inControls) {
            event.preventDefault();
            event.stopPropagation();
            if (event.type === 'contextmenu' || event.type === 'keydown' || event.type === 'copy' || event.type === 'paste') {
                registerViolation('Please use only the answer controls during the interview.', 'input');
            }
        } else if (event.type === 'paste' || event.type === 'copy' || event.type === 'cut') {
            event.preventDefault();
        }
    }

    function enableInputLock() {
        inputLocked = true;
        LOCKED_EVENTS.forEach((name) => document.addEventListener(name, handleLockedInput, { capture: true, passive: false }));
    }

    function disableInputLock() {
        inputLocked = false;
        LOCKED_EVENTS.forEach((name) => document.removeEventListener(name, handleLockedInput, { capture: true }));
    }

    // One alt-tab fires tab, focus and fullscreen events together. They share a key so it counts once.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) registerViolation('Please stay on the interview tab.', 'focus');
    });
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) registerViolation('Please return to fullscreen.', 'focus');
    });
    window.addEventListener('blur', () => registerViolation('Please keep this window focused.', 'focus'));

    // ── Recording ────────────────────────────────────────
    function initializeSpeechRecognition() {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) return;

        speechRecognizer = new Recognition();
        speechRecognizer.lang = 'en-US';
        speechRecognizer.interimResults = true;
        speechRecognizer.continuous = true;
        useSpeechRecognition = true;

        speechRecognizer.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const text = event.results[i][0].transcript;
                if (event.results[i].isFinal) speechTranscript += ` ${text}`;
                else interim += ` ${text}`;
            }
            if (isRecording) {
                const preview = `${speechTranscript} ${interim}`.trim();
                statusDiv.textContent = preview ? `Listening... ${preview}` : 'Listening... please answer now.';
            }
        };

        speechRecognizer.onerror = (event) => {
            // Some browsers expose the API but can't reach a speech service: fall back to recording.
            if (event.error === 'network' || event.error === 'service-not-allowed' || event.error === 'not-allowed') {
                useSpeechRecognition = false;
                pendingSpeechSubmit = false;
                isRecording = false;
                setRecordingUi(false);
                statusDiv.textContent = 'Voice capture switched modes. Press Record answer, or type your answer.';
            } else if (isRecording) {
                stopRecording(true);
            }
        };

        speechRecognizer.onend = async () => {
            clearTimeout(speechTimeout);
            if (!pendingSpeechSubmit) return;
            pendingSpeechSubmit = false;
            const transcript = speechTranscript.trim();
            speechTranscript = '';
            if (!transcript) {
                statusDiv.textContent = 'We couldn\'t hear that clearly. Please answer again.';
                if (lastRecordingWasAuto) setTimeout(() => startRecording(true), 500);
                return;
            }
            await submitAnswer(() => {
                const form = new FormData();
                form.append('text_response', transcript);
                return ['/process-text-response', form];
            });
        };
    }

    function setRecordingUi(recording) {
        recordButton.textContent = recording ? 'Stop and send' : 'Record answer';
        recordButton.classList.toggle('recording', recording);
    }

    function startRecording(auto) {
        if (isRecording || isProcessing || !interviewStarted) return;
        if (!useSpeechRecognition && !mediaRecorder) return;

        lastRecordingWasAuto = auto;
        audioChunks = [];
        speechTranscript = '';
        pendingSpeechSubmit = false;
        try {
            if (useSpeechRecognition) {
                speechRecognizer.start();
                speechTimeout = setTimeout(() => isRecording && stopRecording(true), MAX_RECORDING_MS);
            } else {
                mediaRecorder.start();
                if (auto) monitorSilence();
            }
        } catch (error) {
            console.warn('Could not start recording', error);
            return;
        }
        isRecording = true;
        setRecordingUi(true);
        statusDiv.textContent = 'Listening... please answer now.';
    }

    function stopRecording(auto) {
        if (!isRecording) return;
        isRecording = false;
        setRecordingUi(false);
        if (useSpeechRecognition) {
            pendingSpeechSubmit = true;
            speechRecognizer.stop();
        } else if (mediaRecorder) {
            mediaRecorder.stop();
        }
        if (auto) statusDiv.textContent = 'Processing your answer...';
    }

    function monitorSilence() {
        if (!mediaStream) return;
        audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            audioContext.createMediaStreamSource(mediaStream).connect(analyser);
        }
        const data = new Uint8Array(analyser.fftSize);
        const startedAt = Date.now();
        let lastSpeechAt = startedAt;

        const tick = () => {
            if (!isRecording) return;
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) {
                const value = (data[i] - 128) / 128;
                sum += value * value;
            }
            const now = Date.now();
            if (Math.sqrt(sum / data.length) > SILENCE_THRESHOLD) lastSpeechAt = now;
            if (now - startedAt >= MAX_RECORDING_MS || (now - startedAt >= MIN_RECORDING_MS && now - lastSpeechAt >= SILENCE_MS)) {
                stopRecording(true);
                return;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    function playQuestion(audioUrl) {
        if (!audioUrl) {
            // Speech generation is optional. The question is on screen, so the candidate can just answer.
            setSpeaking(false);
            statusDiv.textContent = 'Please read the question above, then record or type your answer.';
            return;
        }
        setSpeaking(true);
        audioPlayer.src = audioUrl;
        audioPlayer.onended = () => {
            setSpeaking(false);
            if (interviewStarted && !isProcessing) startRecording(true);
        };
        audioPlayer.play().catch(() => {
            setSpeaking(false);
            statusDiv.textContent = 'Please read the question above, then record or type your answer.';
        });
    }

    // ── Conversation ─────────────────────────────────────
    async function submitAnswer(buildRequest) {
        isProcessing = true;
        recordButton.disabled = true;
        typeToggle.disabled = true;
        el('sendTyped').disabled = true;
        statusDiv.textContent = 'Processing your answer...';

        const [url, form] = buildRequest();
        form.append('session_id', sessionId);

        try {
            const response = await fetch(url, { method: 'POST', body: form });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.details ? `${data.error} ${data.details}` : (data.error || 'Something went wrong.'));
            }

            addMessage(data.transcription, 'user');
            addMessage(data.ai_response, 'ai');
            typedAnswer.value = '';

            if (data.interview_complete) {
                endInterview(data.completion_reason || 'Interview completed.');
                return true;
            }

            questionsAsked = data.questions_asked;
            updateCounter();
            statusDiv.textContent = 'The interviewer is asking the next question...';
            playQuestion(data.audio_url);
            return true;
        } catch (error) {
            console.error('Error processing answer:', error);
            statusDiv.textContent = `${error.message} Please try again.`;
            if (lastRecordingWasAuto && interviewStarted) setTimeout(() => startRecording(true), 900);
            return false;
        } finally {
            isProcessing = false;
            if (interviewStarted) {
                recordButton.disabled = false;
                typeToggle.disabled = false;
                el('sendTyped').disabled = false;
            }
        }
    }

    async function handleRecordingStop() {
        if (audioChunks.length === 0) return;
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        if (blob.size < MIN_AUDIO_BYTES) {
            statusDiv.textContent = 'We couldn\'t hear enough audio. Please answer again.';
            if (lastRecordingWasAuto) setTimeout(() => startRecording(true), 500);
            return;
        }
        await submitAnswer(() => {
            const form = new FormData();
            form.append('audio', blob, 'response.webm');
            return ['/process-response', form];
        });
    }

    // ── Setup ────────────────────────────────────────────
    async function setupMedia() {
        try {
            const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
                audio,
            });
            userVideo.srcObject = mediaStream;
            mediaRecorder = new MediaRecorder(mediaStream);
            mediaRecorder.ondataavailable = (event) => event.data.size > 0 && audioChunks.push(event.data);
            mediaRecorder.onstop = handleRecordingStop;
            initializeSpeechRecognition();
            if ('FaceDetector' in window) faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });

            // A low-resolution webcam is a tip, not a violation: hardware should not fail a candidate.
            const settings = mediaStream.getVideoTracks()[0]?.getSettings?.() || {};
            if ((settings.width && settings.width < RECOMMENDED_WIDTH) || (settings.height && settings.height < RECOMMENDED_HEIGHT)) {
                setProctorStatus('Your camera resolution is low. Good lighting will help keep you visible.');
            }
            startButton.disabled = false;
            startButton.textContent = isHandoff ? 'Start interview' : 'Start practice';
        } catch (error) {
            console.warn('Media setup failed', error);
            startButton.textContent = 'Camera and microphone needed';
            setupStatus.textContent = 'Please allow camera and microphone access in your browser, then reload this page.';
        }
    }

    function applySession(data) {
        sessionId = data.session_id;
        maxQuestions = data.max_questions;
        timeLimitSeconds = data.time_limit_minutes * 60;
        questionsAsked = data.questions_asked;
        activeSeconds = data.elapsed_seconds || 0;
        updateCounter();
        timerDiv.textContent = formatTimer(activeSeconds);

        chatLog.replaceChildren();
        data.turns.forEach((turn) => addMessage(turn.text, turn.role === 'candidate' ? 'user' : 'ai'));

        setupDiv.hidden = true;
        setupStatus.textContent = '';
        responseControls.hidden = false;
        interviewStarted = true;

        enableInputLock();
        timerHandle = setInterval(() => {
            if (!interviewStarted || isProcessing) return;
            activeSeconds += 1;
            timerDiv.textContent = formatTimer(activeSeconds);
            if (activeSeconds >= timeLimitSeconds) endInterview('The time limit for this interview was reached.');
        }, 1000);
        proctorHandle = setInterval(checkCamera, 2500);

        statusDiv.textContent = 'Answer when you are ready.';
        setProctorStatus('Proctoring is on. Stay in this tab, keep fullscreen, and remain visible.', 'good');
        playQuestion(data.audio_url);
    }

    startButton.addEventListener('click', async () => {
        const form = new FormData();
        if (isHandoff) {
            form.append('context_id', handoff.context_id);
        } else {
            const resume = el('resumeFile').files[0];
            const jobDescription = el('jobDescription').value.trim();
            if (!resume || !jobDescription) {
                setupStatus.textContent = 'Please choose a PDF resume and enter a job description.';
                return;
            }
            form.append('resume', resume);
            form.append('job_desc', jobDescription);
            form.append('max_questions', el('maxQuestions').value || '8');
            form.append('time_limit_minutes', el('timeLimitMinutes').value || '20');
        }

        try {
            await document.documentElement.requestFullscreen();
        } catch {
            setupStatus.textContent = 'Please allow fullscreen to start the interview.';
            return;
        }

        startButton.disabled = true;
        startButton.textContent = 'Starting...';
        setupStatus.textContent = 'Preparing your first question...';

        try {
            const response = await fetch('/start-interview', { method: 'POST', body: form });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Could not start the interview.');
            applySession(data);
        } catch (error) {
            console.error('Error starting interview:', error);
            setupStatus.textContent = error.message;
            startButton.textContent = isHandoff ? 'Start interview' : 'Start practice';
            startButton.disabled = false;
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        }
    });

    recordButton.addEventListener('click', () => {
        if (isRecording) stopRecording(false);
        else startRecording(false);
    });

    typeToggle.addEventListener('click', () => {
        typedForm.hidden = !typedForm.hidden;
        typeToggle.textContent = typedForm.hidden ? 'Type instead' : 'Hide typing';
        if (!typedForm.hidden) {
            if (isRecording) {
                isRecording = false;
                pendingSpeechSubmit = false;
                setRecordingUi(false);
                if (useSpeechRecognition) speechRecognizer.stop();
                else if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                    audioChunks = [];
                    const restore = mediaRecorder.onstop;
                    mediaRecorder.onstop = () => { mediaRecorder.onstop = restore; };
                    mediaRecorder.stop();
                }
            }
            typedAnswer.focus();
        }
    });

    typedForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const answer = typedAnswer.value.trim();
        if (!answer || isProcessing) return;
        lastRecordingWasAuto = false;
        await submitAnswer(() => {
            const form = new FormData();
            form.append('text_response', answer);
            return ['/process-text-response', form];
        });
    });

    updateCounter();
    setupMedia();
});
