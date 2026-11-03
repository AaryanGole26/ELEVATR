@echo off
setlocal

:: Runs all four servers in this one terminal, with coloured labels. Press Ctrl+C to stop them all.
:: Works from any folder, because every path is based on this script's location.
set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

:: Stop early with a clear message if setup steps are missing.
set "PROBLEM="
if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Python environment not found.
    echo         Run: python -m venv venv
    echo         Then: venv\Scripts\pip install -r "Client Side\backend\requirements.txt" -r ai-video-interviewer\requirements.txt
    set "PROBLEM=1"
)
if not exist "node_modules\.bin\concurrently.cmd" (
    echo [ERROR] Packages not installed for the main app. Run: npm install
    set "PROBLEM=1"
)
if not exist "Client Side\ai-skill-analyzer-main\node_modules" (
    echo [ERROR] Packages not installed for the resume tools. Run: npm install in "Client Side\ai-skill-analyzer-main"
    set "PROBLEM=1"
)
if not exist ".env.local" (
    echo [ERROR] .env.local not found. Copy .env.example to .env.local and fill it in.
    set "PROBLEM=1"
)

:: A taken port would make a server fail, or silently move it to a port the others don't know about.
call :check_port 3000 "Main app"
call :check_port 5001 "AI interviewer"
call :check_port 8000 "Resume API"
call :check_port 8080 "Resume tools"

if defined PROBLEM (
    echo.
    echo Nothing was started. Fix the items above and run this again.
    pause
    exit /b 1
)

:: Without this, Python holds back its logs when they are shown through concurrently.
set "PYTHONUNBUFFERED=1"

echo.
echo   [APP]      Main app        http://localhost:3000
echo   [AI-V]     AI interviewer  http://127.0.0.1:5001
echo   [BACKEND]  Resume API      http://127.0.0.1:8000
echo   [ANALYZE]  Resume tools    http://localhost:8080
echo.
echo   Press Ctrl+C to stop all servers.
echo.

call npm run start-all
exit /b %errorlevel%

:check_port
:: Tries a real connection on IPv4 and IPv6, because netstat can omit listening ports.
powershell -NoProfile -NonInteractive -Command "$open = $false; foreach ($address in '127.0.0.1', '::1') { $client = New-Object Net.Sockets.TcpClient; try { if ($client.ConnectAsync($address, %~1).Wait(500)) { $open = $true } } catch {} finally { $client.Close() } }; if ($open) { exit 1 } else { exit 0 }"
if not errorlevel 1 exit /b 0
echo [ERROR] Port %~1 is already in use, so the %~2 can't start. It may already be running in another terminal.
set "PROBLEM=1"
exit /b 0
