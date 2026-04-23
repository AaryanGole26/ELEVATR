document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = window.location.origin;
    const handoffContext = window.ELEVATR_HANDOFF || {};

    // --- Element References ---
    const userVideo = document.getElementById('userVideo');
    const startButton = document.getElementById('startButton');
    const resumeFile = document.getElementById('resumeFile');
    const jobDescription = document.getElementById('jobDescription');
    const maxQuestionsInput = document.getElementById('maxQuestions');
    const timeLimitMinutesInput = document.getElementById('timeLimitMinutes');
    const chatLog = document.getElementById('chatLog');
    const interviewerAudio = document.getElementById('interviewerAudio');
    const setupDiv = document.getElementById('setup');
    const responseControlsDiv = document.getElementById('responseControls');
    const recordButton = document.getElementById('recordButton');
    const statusDiv = document.getElementById('status');
    const timerStatusDiv = document.getElementById('timerStatus');
    const questionCounterDiv = document.getElementById('questionCounter');
    const proctorStatusDiv = document.getElementById('proctorStatus');

    // --- State Variables ---
    let conversationHistory = "";
    let sessionId = "";
    let mediaStream;
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let isProcessingResponse = false;
    let interviewStarted = false;
    let selectedResumeName = '';
    let selectedJobDescription = '';
    let selectedMaxQuestions = 8;
    let selectedTimeLimitMinutes = 20;
    let prefilledResumeText = '';
    let prefilledResumeName = '';
    let askedQuestionsCount = 0;
    let activeInterviewSeconds = 0;
    let activeTimerHandle = null;
    let isAiSpeaking = false;
    const autoListenEnabled = true;
    const MAX_RECORDING_MS = 90000;
    const MIN_RECORDING_MS = 1200;
    const SILENCE_MS = 1700;
    const SILENCE_THRESHOLD = 0.018;
    let audioContext = null;
    let analyser = null;
    let micSourceNode = null;
    let lastRecordingWasAuto = false;
    let useSpeechRecognition = false;
    let speechRecognizer = null;
    let speechFinalTranscript = '';
    let pendingSpeechSubmit = false;
    let speechTimeoutHandle = null;
    let proctorIntervalHandle = null;
    let proctorViolationCount = 0;
    let tabSwitchCount = 0;
    let faceOffCenterCount = 0;
    let faceMissingCount = 0;
    let darkFrameCount = 0;
    let frameProbeCanvas = null;
    let frameProbeContext = null;
    let faceDetector = null;
    const MAX_VIOLATIONS = 3;
    let fullscreenEnforced = false;
    let inputLockEnabled = false;
    let lastInputLockWarningAt = 0;
    const VIOLATION_COOLDOWN_MS = 3500;
    const violationLastSeenAt = {};
    let focusLossHandled = false;
    let completionSubmitted = false;
    let setupLockedFromHandoff = false;
    const VIDEO_MIN_WIDTH = 960;
    const VIDEO_MIN_HEIGHT = 540;
    const VIDEO_MIN_FPS = 20;

    if (handoffContext && Object.keys(handoffContext).length) {
        if (handoffContext.job_desc) {
            jobDescription.value = handoffContext.job_desc;
            selectedJobDescription = handoffContext.job_desc;
        }
        if (handoffContext.max_questions) {
            maxQuestionsInput.value = String(handoffContext.max_questions);
            selectedMaxQuestions = Number(handoffContext.max_questions);
        }
        if (handoffContext.time_limit_minutes) {
            timeLimitMinutesInput.value = String(handoffContext.time_limit_minutes);
            selectedTimeLimitMinutes = Number(handoffContext.time_limit_minutes);
        }
        if (handoffContext.resume_text) {
            prefilledResumeText = handoffContext.resume_text;
        }
        if (handoffContext.resume_name) {
            prefilledResumeName = handoffContext.resume_name;
            selectedResumeName = handoffContext.resume_name;
        }

        setupLockedFromHandoff = Boolean(handoffContext.job_desc && prefilledResumeText);

        if (setupLockedFromHandoff) {
            resumeFile.disabled = true;
            jobDescription.readOnly = true;
            maxQuestionsInput.readOnly = true;
            timeLimitMinutesInput.readOnly = true;
            statusDiv.textContent = `Interview setup is prefilled and locked for ${prefilledResumeName || 'your resume'}.`;
        } else if (prefilledResumeText && prefilledResumeName) {
            statusDiv.textContent = `Handoff loaded for ${prefilledResumeName}. You can start interview without uploading resume again.`;
        }
    }

    // --- UI & Media Functions ---
    function addMessageToLog(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        messageDiv.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        chatLog.appendChild(messageDiv);
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    function formatTimer(seconds) {
        const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
        const ss = (seconds % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    }

    function updateQuestionCounter() {
        if (!questionCounterDiv) return;
        questionCounterDiv.textContent = `Questions : ${askedQuestionsCount} / ${selectedMaxQuestions}`;
    }

    function setProctorStatus(text, level = 'neutral') {
        if (!proctorStatusDiv) return;
        proctorStatusDiv.textContent = text;
        proctorStatusDiv.classList.remove('alert', 'good');
        if (level === 'alert') {
            proctorStatusDiv.classList.add('alert');
        } else if (level === 'good') {
            proctorStatusDiv.classList.add('good');
        }
    }

    async function submitInterviewCompletion(reason) {
        if (completionSubmitted) return;
        const callbackUrl = (handoffContext.callback_url || '').trim();
        const interviewId = (handoffContext.interview_id || '').trim();
        if (!callbackUrl || !interviewId) return;

        completionSubmitted = true;
        const answeredCount = Math.max(0, askedQuestionsCount);
        const ratio = selectedMaxQuestions > 0 ? Math.min(1, answeredCount / selectedMaxQuestions) : 0;
        const qualityScore = Math.max(0, Math.min(100, Math.round((ratio * 80) + Math.max(0, 20 - (proctorViolationCount * 6)))));

        try {
            await fetch(callbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    candidate_email: handoffContext.candidate_email || '',
                    callback_token: handoffContext.callback_token || '',
                    decision: 'pending',
                    result_json: {
                        overall_score: qualityScore,
                        questions_answered: answeredCount,
                        max_questions: selectedMaxQuestions,
                        active_interview_seconds: activeInterviewSeconds,
                        proctor_violations: proctorViolationCount,
                        completion_reason: reason || 'Interview completed',
                        transcript: conversationHistory,
                        ai_recommendation: qualityScore >= 70 ? 'selected' : 'pending',
                    },
                }),
            });
        } catch (error) {
            console.error('Failed to submit interview completion callback:', error);
        }
    }

    function endInterview(reason) {
        submitInterviewCompletion(reason);
        interviewStarted = false;
        fullscreenEnforced = false;
        stopActiveTimer();
        stopProctoringChecks();
        disableInputLock();
        if (isRecording) {
            isRecording = false;
            if (useSpeechRecognition && speechRecognizer) {
                pendingSpeechSubmit = false;
                speechRecognizer.stop();
            } else if (mediaRecorder) {
                mediaRecorder.stop();
            }
        }
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen().catch(() => {
                // Ignore browser-specific fullscreen exit errors.
            });
        }
        recordButton.disabled = true;
        statusDiv.textContent = reason;
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 80px 20px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2b3a4a; font-size: 32px; margin-bottom: 20px;">Interview Complete</h2>
                    <p style="font-size: 18px; color: #e03131; font-weight: 500; margin-bottom: 30px; padding: 15px; background: #fff5f5; border-radius: 8px;">
                        ${reason}
                    </p>
                    <p style="font-size: 18px; color: #4a5a6a; line-height: 1.6;">
                        Your session has been securely recorded and finalized.
                        <br><br>
                        <strong>We will get back to you shortly. You may now safely close this browser tab.</strong>
                    </p>
                </div>
            `;
        }
    }

    function warnInputLock(message) {
        const now = Date.now();
        if (now - lastInputLockWarningAt < 1800) return;
        lastInputLockWarningAt = now;
        setProctorStatus(message, 'alert');
    }

    function handleLockedInputEvent(event) {
        if (!inputLockEnabled || !interviewStarted) return;

        if (event.type === 'contextmenu') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            registerViolation('Right-click is not allowed during interview mode.', 'right_click');
            return;
        }

        const target = event.target;
        if (target && typeof target.closest === 'function') {
            if (target.closest('#recordButton') || target.closest('#responseControls')) {
                return;
            }
        }

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const type = event.type || '';
        if (type.startsWith('key')) {
            registerViolation('Keyboard input is disabled during interview mode.', 'keyboard_input');
        } else {
            registerViolation('Mouse and touch input are disabled during interview mode.', 'pointer_input');
        }
    }

    function enableInputLock() {
        if (inputLockEnabled) return;
        inputLockEnabled = true;

        const blockedEvents = [
            'keydown', 'keyup', 'keypress',
            'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel',
            'touchstart', 'touchmove', 'touchend',
            'pointerdown', 'pointerup',
            'copy', 'cut', 'paste',
            'dragstart', 'drop', 'selectstart',
        ];

        blockedEvents.forEach((eventName) => {
            document.addEventListener(eventName, handleLockedInputEvent, { capture: true, passive: false });
        });

        document.addEventListener('contextmenu', handleLockedInputEvent, { capture: true, passive: false });
    }

    function disableInputLock() {
        if (!inputLockEnabled) return;
        inputLockEnabled = false;

        const blockedEvents = [
            'keydown', 'keyup', 'keypress',
            'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'wheel',
            'touchstart', 'touchmove', 'touchend',
            'pointerdown', 'pointerup',
            'copy', 'cut', 'paste',
            'dragstart', 'drop', 'selectstart',
        ];

        blockedEvents.forEach((eventName) => {
            document.removeEventListener(eventName, handleLockedInputEvent, { capture: true });
        });

        document.removeEventListener('contextmenu', handleLockedInputEvent, { capture: true });
    }

    function registerViolation(reason, violationKey = 'general') {
        if (!interviewStarted) return;

        const now = Date.now();
        const lastSeen = violationLastSeenAt[violationKey] || 0;
        if (now - lastSeen < VIOLATION_COOLDOWN_MS) {
            return;
        }
        violationLastSeenAt[violationKey] = now;

        proctorViolationCount += 1;
        const isCameraViolation = violationKey.startsWith('camera_') || violationKey === 'face_missing';
        const recoveryHint = isCameraViolation
            ? ' Fix: uncover lens, enable camera permission, and keep your face visible.'
            : '';
        setProctorStatus(`${reason}${recoveryHint} (Warnings: ${proctorViolationCount}/${MAX_VIOLATIONS})`, 'alert');
        if (proctorViolationCount >= MAX_VIOLATIONS) {
            endInterview('Interview ended: proctoring policy violations exceeded.');
        }
    }

    function evaluateFaceAndVisibility() {
        if (!interviewStarted || !userVideo) return;

        const stream = userVideo.srcObject;
        if (!stream || stream.getVideoTracks().length === 0) {
            registerViolation('Camera is off or blocked. Please enable your camera.', 'camera_missing');
            return;
        }

        const track = stream.getVideoTracks()[0];
        if (track.readyState !== 'live' || track.muted) {
            registerViolation('Camera is blocked or turned off. Please enable your camera.', 'camera_blocked');
            return;
        }

        const videoSettings = track.getSettings ? track.getSettings() : {};
        if (videoSettings.width && videoSettings.height) {
            if (videoSettings.width < VIDEO_MIN_WIDTH || videoSettings.height < VIDEO_MIN_HEIGHT) {
                registerViolation('Camera quality too low. Please improve camera visibility/position.', 'camera_quality');
                return;
            }
        }
        if (videoSettings.frameRate && videoSettings.frameRate < VIDEO_MIN_FPS) {
            registerViolation('Camera frame rate too low. Keep camera stable and unobstructed.', 'camera_fps');
            return;
        }

        if (userVideo.readyState < 2) {
            registerViolation('Camera feed is not visible. Please enable camera and stay in frame.', 'camera_not_ready');
            return;
        }

        // Detect covered/blocked camera by sampling frame brightness.
        try {
            if (!frameProbeCanvas) {
                frameProbeCanvas = document.createElement('canvas');
                frameProbeCanvas.width = 64;
                frameProbeCanvas.height = 36;
                frameProbeContext = frameProbeCanvas.getContext('2d', { willReadFrequently: true });
            }
            if (frameProbeContext) {
                frameProbeContext.drawImage(userVideo, 0, 0, frameProbeCanvas.width, frameProbeCanvas.height);
                const pixels = frameProbeContext.getImageData(0, 0, frameProbeCanvas.width, frameProbeCanvas.height).data;
                let luminanceSum = 0;
                let samples = 0;
                for (let i = 0; i < pixels.length; i += 32) {
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    luminanceSum += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
                    samples += 1;
                }
                const avgLuminance = samples > 0 ? (luminanceSum / samples) : 255;
                if (avgLuminance < 22) {
                    darkFrameCount += 1;
                    if (darkFrameCount >= 2) {
                        registerViolation('Camera appears blocked or too dark. Please uncover lens and improve lighting.', 'camera_dark');
                        darkFrameCount = 0;
                    }
                    return;
                }
                darkFrameCount = 0;
            }
        } catch {
            // Ignore frame probe failures and continue with other checks.
        }

        if (faceDetector) {
            faceDetector.detect(userVideo).then((faces) => {
                if (!interviewStarted) return;

                if (!faces || faces.length === 0) {
                    faceMissingCount += 1;
                    if (faceMissingCount >= 2) {
                        registerViolation('Face not detected. Keep your face visible in camera.', 'face_missing');
                        faceMissingCount = 0;
                    }
                    return;
                }

                faceMissingCount = 0;

                if (faces.length > 1) {
                    registerViolation('Multiple faces detected. Only one candidate is allowed.', 'multiple_faces');
                    return;
                }

                const face = faces[0].boundingBox;
                const centerX = face.x + face.width / 2;
                const centerY = face.y + face.height / 2;
                const normX = Math.abs((centerX / userVideo.videoWidth) - 0.5);
                const normY = Math.abs((centerY / userVideo.videoHeight) - 0.5);
                if (normX > 0.22 || normY > 0.24) {
                    faceOffCenterCount += 1;
                    if (faceOffCenterCount >= 2) {
                        setProctorStatus('Please look straight into the camera.', 'alert');
                        faceOffCenterCount = 0;
                    }
                } else {
                    faceOffCenterCount = 0;
                    if (proctorViolationCount === 0) {
                        setProctorStatus('Proctor mode: You are visible and focused.', 'good');
                    }
                }
            }).catch(() => {
                // Ignore detector errors silently.
            });
        } else if (proctorViolationCount === 0) {
            setProctorStatus('Proctor mode: Camera active. Keep face visible and centered.', 'good');
        }
    }

    function startProctoringChecks() {
        if (proctorIntervalHandle) clearInterval(proctorIntervalHandle);
        proctorIntervalHandle = setInterval(evaluateFaceAndVisibility, 2500);
    }

    function stopProctoringChecks() {
        if (proctorIntervalHandle) {
            clearInterval(proctorIntervalHandle);
            proctorIntervalHandle = null;
        }
    }

    function startActiveTimer() {
        if (activeTimerHandle) clearInterval(activeTimerHandle);
        activeTimerHandle = setInterval(() => {
            if (!interviewStarted) return;
            if (isProcessingResponse) return;
            activeInterviewSeconds += 1;
            if (timerStatusDiv) {
                timerStatusDiv.textContent = `Timer : ${formatTimer(activeInterviewSeconds)}`;
            }
        }, 1000);
    }

    function stopActiveTimer() {
        if (activeTimerHandle) {
            clearInterval(activeTimerHandle);
            activeTimerHandle = null;
        }
    }

    function initializeSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        speechRecognizer = new SpeechRecognition();
        speechRecognizer.lang = 'en-US';
        speechRecognizer.interimResults = true;
        speechRecognizer.continuous = true;
        useSpeechRecognition = true;

        speechRecognizer.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    speechFinalTranscript += ` ${transcript}`;
                } else {
                    interim += ` ${transcript}`;
                }
            }
            if (isRecording) {
                const preview = `${speechFinalTranscript} ${interim}`.trim();
                statusDiv.textContent = preview
                    ? `Listening... ${preview}`
                    : 'Listening... please answer now.';
            }
        };

        speechRecognizer.onerror = () => {
            if (isRecording) {
                stopRecordingSession(true);
            }
        };

        speechRecognizer.onend = async () => {
            if (speechTimeoutHandle) {
                clearTimeout(speechTimeoutHandle);
                speechTimeoutHandle = null;
            }

            if (pendingSpeechSubmit) {
                pendingSpeechSubmit = false;
                const transcript = speechFinalTranscript.trim();
                speechFinalTranscript = '';
                if (!transcript) {
                    statusDiv.textContent = 'Could not detect speech clearly. Please answer again.';
                    if (lastRecordingWasAuto) {
                        setTimeout(() => startRecordingSession(true), 500);
                    }
                    return;
                }
                await handleTextResponse(transcript);
            }
        };
    }

    async function requestInterviewFullscreen() {
        if (!document.documentElement.requestFullscreen) {
            return false;
        }
        if (document.fullscreenElement) {
            return true;
        }
        try {
            await document.documentElement.requestFullscreen();
            return true;
        } catch {
            return false;
        }
    }

    function stopRecordingSession(triggeredByAuto = false) {
        if (!isRecording) return;
        isRecording = false;
        recordButton.textContent = 'Record Answer';
        recordButton.classList.remove('recording');
        if (useSpeechRecognition && speechRecognizer) {
            pendingSpeechSubmit = true;
            speechRecognizer.stop();
        } else if (mediaRecorder) {
            mediaRecorder.stop();
        }
        if (triggeredByAuto) {
            statusDiv.textContent = 'Recording stopped. Processing your answer...';
        }
    }

    function startRecordingSession(triggeredByAuto = false) {
        if ((!mediaRecorder && !useSpeechRecognition) || isRecording || isProcessingResponse || !interviewStarted) return;

        lastRecordingWasAuto = triggeredByAuto;
        audioChunks = [];
        speechFinalTranscript = '';
        pendingSpeechSubmit = false;
        if (useSpeechRecognition && speechRecognizer) {
            speechRecognizer.start();
            speechTimeoutHandle = setTimeout(() => {
                if (isRecording) {
                    stopRecordingSession(true);
                }
            }, MAX_RECORDING_MS);
        } else {
            mediaRecorder.start();
        }
        isRecording = true;
        recordButton.textContent = 'Stop Recording';
        recordButton.classList.add('recording');
        statusDiv.textContent = triggeredByAuto
            ? 'Listening... please answer now.'
            : 'Recording...';

        if (triggeredByAuto && !useSpeechRecognition) {
            startSilenceMonitor();
        }
    }

    function startSilenceMonitor() {
        if (!mediaStream) return;

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume().catch(() => {});
        }

        if (!analyser) {
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            micSourceNode = audioContext.createMediaStreamSource(mediaStream);
            micSourceNode.connect(analyser);
        }

        const data = new Uint8Array(analyser.fftSize);
        const startedAt = Date.now();
        let lastSpeechAt = Date.now();

        const tick = () => {
            if (!isRecording) return;

            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) {
                const normalized = (data[i] - 128) / 128;
                sum += normalized * normalized;
            }
            const rms = Math.sqrt(sum / data.length);
            const now = Date.now();

            if (rms > SILENCE_THRESHOLD) {
                lastSpeechAt = now;
            }

            if (now - startedAt >= MAX_RECORDING_MS) {
                stopRecordingSession(true);
                return;
            }

            if (now - startedAt >= MIN_RECORDING_MS && now - lastSpeechAt >= SILENCE_MS) {
                stopRecordingSession(true);
                return;
            }

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }

    function playAiAudio(audioUrl) {
        isAiSpeaking = true;
        interviewerAudio.src = audioUrl;
        interviewerAudio.onended = () => {
            isAiSpeaking = false;
            if (autoListenEnabled && interviewStarted && !isProcessingResponse) {
                startRecordingSession(true);
            }
        };
        interviewerAudio.play().catch(() => {
            statusDiv.textContent = 'Audio is ready. Press play, then answer when it ends.';
        });
    }
    
    async function setupMedia() {
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'user' },
                        width: { min: VIDEO_MIN_WIDTH, ideal: 1280, max: 1920 },
                        height: { min: VIDEO_MIN_HEIGHT, ideal: 720, max: 1080 },
                        frameRate: { min: VIDEO_MIN_FPS, ideal: 24, max: 30 },
                        aspectRatio: { ideal: 16 / 9 },
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'user' },
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 24, max: 30 },
                    },
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                    },
                });
            }
            mediaStream = stream;
            userVideo.srcObject = stream;
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.ondataavailable = event => event.data.size > 0 && audioChunks.push(event.data);
            mediaRecorder.onstop = handleRecordingStop;
            initializeSpeechRecognition();
            if ('FaceDetector' in window) {
                faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
            }
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack && videoTrack.getSettings ? videoTrack.getSettings() : {};
            if (
                (settings.width && settings.width < VIDEO_MIN_WIDTH)
                || (settings.height && settings.height < VIDEO_MIN_HEIGHT)
                || (settings.frameRate && settings.frameRate < VIDEO_MIN_FPS)
            ) {
                setProctorStatus(
                    `Camera below target constraints (${settings.width || '?'}x${settings.height || '?'} @ ${Math.round(settings.frameRate || 0)}fps). Interview may be auto-ended if quality drops further.`,
                    'alert',
                );
            }
            startButton.disabled = false;
            statusDiv.textContent = useSpeechRecognition
                ? "Ready. Fast speech mode is enabled."
                : "Ready. Please fill out the setup.";
        } catch (err) {
            statusDiv.innerHTML = "<strong>Error:</strong> Webcam/Mic access denied. Please grant permissions and refresh.";
        }
    }

    async function handleTextResponse(transcript) {
        isProcessingResponse = true;
        recordButton.disabled = true;
        statusDiv.textContent = 'Processing your answer...';

        const formData = new FormData();
        formData.append('text_response', transcript);
        formData.append('conversation_history', conversationHistory);
        formData.append('session_id', sessionId);
        formData.append('job_desc', selectedJobDescription);
        formData.append('resume_name', selectedResumeName);
        formData.append('active_interview_seconds', String(activeInterviewSeconds));

        try {
            const response = await fetch(`${API_BASE}/process-text-response`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (!response.ok) {
                const detailMessage = data.details ? ` (${data.details})` : '';
                throw new Error((data.error || 'Unknown server error') + detailMessage);
            }

            if (data.session_id) {
                sessionId = data.session_id;
            }

            addMessageToLog(`<strong>You:</strong> ${data.transcription || transcript}`, 'user');
            addMessageToLog(data.ai_response, 'ai');
            conversationHistory = data.conversation;

            if (data.interview_complete) {
                askedQuestionsCount += 1;
                updateQuestionCounter();
                endInterview(data.completion_reason || 'Interview completed.');
                return;
            }

            askedQuestionsCount += 1;
            updateQuestionCounter();
            playAiAudio(data.audio_url);
            statusDiv.textContent = 'AI is asking the next question...';
        } catch (error) {
            console.error('Error processing text response:', error);
            statusDiv.textContent = `Error: ${error.message}. Please try again.`;
            if (lastRecordingWasAuto && interviewStarted) {
                setTimeout(() => startRecordingSession(true), 900);
            }
        } finally {
            isProcessingResponse = false;
            if (interviewStarted) {
                recordButton.disabled = false;
            }
        }
    }

    async function handleRecordingStop() {
        if (audioChunks.length === 0) return;

        isProcessingResponse = true;
        statusDiv.textContent = 'Processing your answer...';
        recordButton.disabled = true;

        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];

        if (audioBlob.size < 3500) {
            isProcessingResponse = false;
            recordButton.disabled = false;
            statusDiv.textContent = 'Could not hear enough audio. Please answer again.';
            if (lastRecordingWasAuto) {
                setTimeout(() => startRecordingSession(true), 500);
            }
            return;
        }

        const formData = new FormData();
        formData.append('audio', audioBlob, 'response.webm');
        formData.append('conversation_history', conversationHistory);
        formData.append('session_id', sessionId);
        formData.append('job_desc', selectedJobDescription);
        formData.append('resume_name', selectedResumeName);
        formData.append('active_interview_seconds', String(activeInterviewSeconds));

        try {
            const response = await fetch(`${API_BASE}/process-response`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                const detailMessage = errorData.details ? ` (${errorData.details})` : '';
                throw new Error((errorData.error || 'Unknown server error') + detailMessage);
            }

            const data = await response.json();
            if (data.session_id) {
                sessionId = data.session_id;
            }
            
            addMessageToLog(`<strong>You:</strong> ${data.transcription}`, 'user');
            addMessageToLog(data.ai_response, 'ai');
            
            conversationHistory = data.conversation;

            if (data.interview_complete) {
                askedQuestionsCount += 1;
                updateQuestionCounter();
                endInterview(data.completion_reason || 'Interview completed.');
                return;
            }

            askedQuestionsCount += 1;
            updateQuestionCounter();
            playAiAudio(data.audio_url);
            statusDiv.textContent = 'AI is asking the next question...';
        } catch (error) {
            console.error('Error processing response:', error);
            statusDiv.textContent = `Error: ${error.message}. Please try again.`;
            if (lastRecordingWasAuto) {
                setTimeout(() => startRecordingSession(true), 900);
            }
        } finally {
            isProcessingResponse = false;
            if (interviewStarted) {
                recordButton.disabled = false;
            }
        }
    }

    // --- Event Listeners ---
    startButton.addEventListener('click', async () => {
        const hasUploadedResume = !!(resumeFile.files && resumeFile.files.length);
        const hasPrefilledResume = !!prefilledResumeText;
        if ((!hasUploadedResume && !hasPrefilledResume) || !jobDescription.value) {
            alert('Please upload a resume (or use handed-off resume context) and provide a job description.');
            return;
        }

        const fullscreenOk = await requestInterviewFullscreen();
        if (!fullscreenOk) {
            setProctorStatus('Please allow fullscreen to start interview mode.', 'alert');
            statusDiv.textContent = 'Fullscreen permission is required to start the interview.';
            return;
        }
        fullscreenEnforced = true;

        startButton.textContent = 'Starting...';
        startButton.disabled = true;
        statusDiv.textContent = 'Contacting AI... This may take a moment.';

        const formData = new FormData();
        if (hasUploadedResume) {
            formData.append('resume', resumeFile.files[0]);
            selectedResumeName = resumeFile.files[0]?.name || '';
        } else {
            formData.append('resume_text', prefilledResumeText);
            formData.append('resume_name', prefilledResumeName || 'resume_from_handoff.txt');
            selectedResumeName = prefilledResumeName || 'resume_from_handoff.txt';
        }
        formData.append('job_desc', jobDescription.value);

        selectedJobDescription = jobDescription.value;
        selectedMaxQuestions = Number(maxQuestionsInput.value || 8);
        selectedTimeLimitMinutes = Number(timeLimitMinutesInput.value || 20);
        askedQuestionsCount = 1;
        activeInterviewSeconds = 0;
        proctorViolationCount = 0;
        faceOffCenterCount = 0;
        faceMissingCount = 0;
        darkFrameCount = 0;
        Object.keys(violationLastSeenAt).forEach((key) => delete violationLastSeenAt[key]);
        if (timerStatusDiv) {
            timerStatusDiv.textContent = 'Timer : 00:00';
        }
        updateQuestionCounter();
        setProctorStatus('Proctor mode enabled. Stay in this tab, keep fullscreen, and remain visible.', 'good');

        formData.append('max_questions', String(selectedMaxQuestions));
        formData.append('time_limit_minutes', String(selectedTimeLimitMinutes));

        try {
            const response = await fetch(`${API_BASE}/start-interview`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                const detailMessage = errorData.details ? ` (${errorData.details})` : '';
                throw new Error((errorData.error || 'Unknown server error') + detailMessage);
            }

            const data = await response.json();
            conversationHistory = data.conversation;
            sessionId = data.session_id || '';
            
            chatLog.innerHTML = '';
            
            // ================================================================
            // === FINAL FIX FOR MULTIPLE STARTING MESSAGES ===
            // ================================================================
            const initialText = data.conversation;
            
            // This is the robust fix: Split by the newline character.
            // This will correctly handle any number of starting lines.
            const lines = initialText.split('\n').filter(line => line.trim() !== '');

            // Loop through each line and create a separate, clean chat bubble for it.
            lines.forEach(line => {
                addMessageToLog(line, 'ai');
            });
            // ================================================================

            // The server correctly generates audio for just the last line (the actual question),
            // so we can play the audio URL directly without any changes.
            playAiAudio(data.audio_url);
            
            setupDiv.style.display = 'none';
            responseControlsDiv.style.display = 'flex';
            interviewStarted = true;
            focusLossHandled = false;
            enableInputLock();
            startActiveTimer();
            startProctoringChecks();

            statusDiv.textContent = 'Interview started. Input lock and proctor mode are active.';
        } catch (error) {
            console.error('Error starting interview:', error);
            statusDiv.textContent = `Error: ${error.message}. Please refresh and try again.`;
            startButton.textContent = 'Start Interview';
            startButton.disabled = false;
            stopActiveTimer();
            stopProctoringChecks();
            disableInputLock();
        }
    });

    recordButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecordingSession(false);
        } else {
            startRecordingSession(false);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!interviewStarted) return;
        if (document.hidden) {
            registerViolation('Tab switching detected. Stay on interview tab.', 'tab_switch');
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!interviewStarted) return;
        if (fullscreenEnforced && !document.fullscreenElement) {
            registerViolation('Fullscreen disabled. Please return to fullscreen.', 'fullscreen_exit');
        }
    });

    window.addEventListener('blur', () => {
        if (!interviewStarted || focusLossHandled) return;
        focusLossHandled = true;
        try {
            window.focus();
        } catch {
            // Ignore focus errors.
        }
        registerViolation('Window focus lost. Stay focused on this interview screen.', 'focus_lost');
        setTimeout(() => {
            focusLossHandled = false;
        }, VIOLATION_COOLDOWN_MS);
    });

    // --- Initial Call ---
    updateQuestionCounter();
    setupMedia();
});