#!/usr/bin/env python3
"""Serve the reviewer on http://127.0.0.1:8765.

Sheet routes are not served here. Reading and writing the report
requires a signed-in person on the published app.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from sheets_job import KEY_PATH

ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}", flush=True)

    def _blocked(self, path: str) -> bool:
        name = urllib.parse.unquote(path).rsplit("/", 1)[-1]
        return name == KEY_PATH.name or name.endswith(".py") or name.endswith(".json")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/report":
            self._json(401, {"ok": False, "error": "ورود لازم است."})
            return
        if self._blocked(path):
            self.send_error(404)
            return
        super().do_GET()

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        if path in ("/save", "/review"):
            self._json(401, {"ok": False, "error": "ورود لازم است."})
            return
        self._json(404, {"ok": False, "error": "مسیر پیدا نشد."})

    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "private, no-store")
        self.end_headers()
        self.wfile.write(raw)


class Server(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def run_check() -> int:
    csvs = [path for path in ROOT.rglob("*") if path.suffix.lower() == ".csv"]
    if csvs:
        print("CSV files must not ship in this folder:", ", ".join(str(p) for p in csvs))
        return 1
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    banned = ["/api/", "/cursor/stores", "innerHTML", "insertAdjacentHTML", "document.write"]
    found = [token for token in banned if token in html]
    if found or "ReviewLogic" not in html or "/review" not in html:
        print("static page check failed", found)
        return 1
    if KEY_PATH.name not in (ROOT / "server.py").read_text(encoding="utf-8") and "KEY_PATH" not in (ROOT / "sheets_job.py").read_text(encoding="utf-8"):
        print("service account path missing")
        return 1
    print("static check ok")
    return 0


def main() -> None:
    if "--check" in sys.argv:
        raise SystemExit(run_check())
    try:
        httpd = Server((HOST, PORT), Handler)
    except OSError as exc:
        print(f"cannot bind {HOST}:{PORT}: {exc}", flush=True)
        raise SystemExit(1) from exc
    print(f"http://{HOST}:{PORT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("stopped", flush=True)


if __name__ == "__main__":
    main()
