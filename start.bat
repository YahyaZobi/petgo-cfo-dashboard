@echo off
:: PETGO Finance — Start Data Server (Windows)
:: Double-click this file to launch

cd /d "%~dp0"

echo ================================================
echo   PETGO Finance - Data Server
echo ================================================

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: Install dependencies if needed
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies...
    python -m pip install -r requirements.txt
)

echo.
echo   Dashboard  -^>  http://localhost:8000
echo   API docs   -^>  http://localhost:8000/docs
echo.
echo   Press Ctrl+C to stop.
echo ================================================
echo.

:: Open browser after 2 seconds
start "" timeout /t 2 >nul && start http://localhost:8000

python server.py
pause
