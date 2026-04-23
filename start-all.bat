@echo off
setlocal

:: Start in the root directory (where this script is located)
set BASE_DIR=%~dp0
set VENV_PATH=%BASE_DIR%venv

echo [1/4] Starting Main Dev Server (npm run dev)...
start "Main Dev Server" cmd /k "cd app && npm run dev"

echo [2/4] Starting AI Video Interviewer...
start "AI Video Interviewer" cmd /k "call \"%VENV_PATH%\\Scripts\\activate\" && cd ai-video-interviewer && python app.py"

echo [3/4] Starting Client Side Backend...
start "Client Side Backend" cmd /k "call \"%VENV_PATH%\\Scripts\\activate\" && cd \"Client Side/backend\" && python main.py"

echo [4/4] Starting Client Side Frontend (ai-skill-analyzer)...
start "Client Side Frontend" cmd /k "cd \"Client Side/ai-skill-analyzer-main\" && npm run dev"

echo.
echo All servers are launching in separate windows.
echo You can close this window now.
pause
