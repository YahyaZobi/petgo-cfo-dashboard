"""
PETGO Finance — Data Server
============================
Runs locally and feeds the CFO Dashboard with live data from Excel,
OneDrive, SharePoint, or any database.

Usage:
    python server.py
    Then open: http://localhost:8000

Requirements:
    pip install -r requirements.txt
"""

import json
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ─── App Setup ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PETGO Finance Data Server",
    description="Live data bridge for the PETGO CFO Dashboard",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Allow dashboard from file:// or any localhost port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR   = Path(__file__).parent
CONFIG_PATH = BASE_DIR / "config.json"
DASHBOARD  = BASE_DIR / "PETGO Finance CFO Dashboard.html"

# ─── In-Memory Cache ──────────────────────────────────────────────────────────

DATA_CACHE:    Dict[str, List[Dict]] = {}   # module -> records
LAST_REFRESH:  Dict[str, str]        = {}   # module -> ISO timestamp
SOURCE_STATUS: Dict[str, str]        = {}   # module -> "ok" | "error" | "pending"
SOURCE_ERROR:  Dict[str, str]        = {}   # module -> last error message
_refresh_lock = threading.Lock()

# ─── Config ───────────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "refresh_interval": 60,
    "server_port": 8000,
    "sources": {}
}

def load_config() -> Dict:
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            # Merge with defaults to ensure all keys exist
            for k, v in DEFAULT_CONFIG.items():
                cfg.setdefault(k, v)
            return cfg
        except Exception as e:
            print(f"[PETGO] Config load error: {e}")
    return dict(DEFAULT_CONFIG)

def save_config(config: Dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

# ─── Connector Factory ────────────────────────────────────────────────────────

def get_connector(source_type: str):
    if source_type == "excel_local":
        from connectors.excel_local import ExcelLocalConnector
        return ExcelLocalConnector
    elif source_type == "excel_graph":
        from connectors.excel_graph import ExcelGraphConnector
        return ExcelGraphConnector
    elif source_type in ("mysql", "postgresql"):
        from connectors.database import DatabaseConnector
        return DatabaseConnector
    else:
        raise ValueError(f"Unknown connector type: '{source_type}'. "
                         f"Supported: excel_local, excel_graph, mysql, postgresql")

# ─── Refresh Logic ────────────────────────────────────────────────────────────

def refresh_module(module: str, source_cfg: Dict) -> None:
    with _refresh_lock:
        try:
            ConnectorClass = get_connector(source_cfg["type"])
            connector = ConnectorClass(source_cfg)
            data = connector.fetch()
            DATA_CACHE[module]   = data
            LAST_REFRESH[module] = datetime.now().isoformat(timespec="seconds")
            SOURCE_STATUS[module] = "ok"
            SOURCE_ERROR.pop(module, None)
            print(f"[PETGO] ✓  {module}: {len(data)} records  ({LAST_REFRESH[module]})")
        except Exception as exc:
            SOURCE_STATUS[module] = "error"
            SOURCE_ERROR[module]  = str(exc)
            print(f"[PETGO] ✗  {module}: {exc}")

def refresh_all() -> None:
    config = load_config()
    for module, source_cfg in config.get("sources", {}).items():
        if source_cfg.get("enabled", True):
            refresh_module(module, source_cfg)

def auto_refresh_loop() -> None:
    """Background thread: refresh every N seconds."""
    print("[PETGO] Auto-refresh loop started.")
    while True:
        refresh_all()
        interval = load_config().get("refresh_interval", 60)
        time.sleep(interval)

# Start background refresh immediately
_bg_thread = threading.Thread(target=auto_refresh_loop, daemon=True)
_bg_thread.start()

# ─── API Routes ───────────────────────────────────────────────────────────────

@app.get("/api/status")
def api_status():
    """Health check + per-source status."""
    config = load_config()
    sources_info = {}
    for name, cfg in config.get("sources", {}).items():
        sources_info[name] = {
            "type":         cfg.get("type"),
            "enabled":      cfg.get("enabled", True),
            "status":       SOURCE_STATUS.get(name, "pending"),
            "error":        SOURCE_ERROR.get(name),
            "last_refresh": LAST_REFRESH.get(name),
            "record_count": len(DATA_CACHE.get(name, [])),
        }
    return {
        "status":           "online",
        "version":          "1.0.0",
        "refresh_interval": config.get("refresh_interval", 60),
        "sources":          sources_info,
    }


@app.get("/api/config")
def api_get_config():
    return load_config()


@app.post("/api/config")
async def api_save_config(request: Request):
    body = await request.json()
    save_config(body)
    return {"ok": True, "message": "Config saved. Changes apply on next refresh."}


@app.get("/api/{module}")
def api_get_module(module: str):
    """Return cached data for a module. Triggers a fresh load if not yet cached."""
    config = load_config()
    sources = config.get("sources", {})

    if module not in DATA_CACHE:
        if module not in sources:
            raise HTTPException(
                status_code=404,
                detail=f"Module '{module}' is not configured. Add it to config.json."
            )
        refresh_module(module, sources[module])

    return {
        "module":       module,
        "data":         DATA_CACHE.get(module, []),
        "last_refresh": LAST_REFRESH.get(module),
        "record_count": len(DATA_CACHE.get(module, [])),
        "status":       SOURCE_STATUS.get(module, "pending"),
    }


@app.post("/api/{module}/refresh")
def api_force_refresh(module: str):
    """Force an immediate re-read of a specific module."""
    config = load_config()
    sources = config.get("sources", {})
    if module not in sources:
        raise HTTPException(404, f"Module '{module}' not configured.")
    refresh_module(module, sources[module])
    return {
        "ok":           True,
        "module":       module,
        "record_count": len(DATA_CACHE.get(module, [])),
        "last_refresh": LAST_REFRESH.get(module),
        "status":       SOURCE_STATUS.get(module),
        "error":        SOURCE_ERROR.get(module),
    }


@app.post("/api/refresh-all")
def api_refresh_all():
    """Force refresh of every configured module."""
    refresh_all()
    return {"ok": True, "refreshed": list(load_config().get("sources", {}).keys())}


@app.get("/api/sources/available")
def api_available_sources():
    """List connector types supported by this server."""
    return {
        "connectors": [
            {
                "type":        "excel_local",
                "label":       "Excel — Local / Network Drive",
                "description": "Reads an .xlsx file from any path on this machine or a mapped network drive.",
                "required_fields": ["path", "sheet"],
                "optional_fields": ["skip_rows", "column_map"],
            },
            {
                "type":        "excel_graph",
                "label":       "Excel — OneDrive / SharePoint",
                "description": "Reads an .xlsx file stored in OneDrive or SharePoint via Microsoft Graph API.",
                "required_fields": ["file_path", "sheet"],
                "optional_fields": ["tenant_id", "client_id", "client_secret", "site_id", "drive_id", "access_token"],
            },
            {
                "type":        "mysql",
                "label":       "MySQL Database",
                "description": "Query a MySQL database directly. Requires pymysql installed.",
                "required_fields": ["host", "database", "username", "password", "query"],
                "optional_fields": ["port"],
            },
            {
                "type":        "postgresql",
                "label":       "PostgreSQL Database",
                "description": "Query a PostgreSQL database directly. Requires psycopg2 installed.",
                "required_fields": ["host", "database", "username", "password", "query"],
                "optional_fields": ["port"],
            },
        ]
    }


# ─── Serve Dashboard ──────────────────────────────────────────────────────────

@app.get("/")
def serve_dashboard():
    if DASHBOARD.exists():
        return FileResponse(DASHBOARD, media_type="text/html")
    return JSONResponse({"error": "Dashboard HTML not found next to server.py"}, status_code=404)


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    config = load_config()
    port   = config.get("server_port", 8000)

    print("=" * 55)
    print("  PETGO Finance — Data Server")
    print("=" * 55)
    print(f"  Dashboard  →  http://localhost:{port}")
    print(f"  API docs   →  http://localhost:{port}/docs")
    print(f"  Config     →  {CONFIG_PATH}")
    print(f"  Refresh    →  every {config.get('refresh_interval', 60)}s")
    print("=" * 55)

    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=False, log_level="warning")
