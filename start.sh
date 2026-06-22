#!/bin/bash
# PETGO Finance — Start Data Server (Mac / Linux)
# Double-click or run: bash start.sh

cd "$(dirname "$0")"

echo "================================================"
echo "  PETGO Finance — Data Server"
echo "================================================"

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 not found. Install from https://python.org"
    read -p "Press Enter to exit..."
    exit 1
fi

# Install dependencies if needed
if ! python3 -c "import fastapi" &>/dev/null; then
    echo "Installing dependencies..."
    python3 -m pip install -r requirements.txt
fi

echo ""
echo "  Dashboard  →  http://localhost:8000"
echo "  API docs   →  http://localhost:8000/docs"
echo ""
echo "  Press Ctrl+C to stop."
echo "================================================"
echo ""

# Open browser after 2s
(sleep 2 && open "http://localhost:8000") &

python3 server.py
