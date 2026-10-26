"""Tiny static file server used for Interline's demo workspace.

Run with:
    python demo/server.py --port 8420 --root demo
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

SKIP = {".git", "node_modules", "__pycache__", ".venv"}


class InterlineHandler(BaseHTTPRequestHandler):
    server_version = "Interline/1.0"
    root: Path = Path(".")

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        started = time.perf_counter()
        path = self.resolve(self.path)

        if path is None:
            self.reply(HTTPStatus.FORBIDDEN, "Forbidden")
            return

        if path.is_dir():
            entries = sorted(
                item.name for item in path.iterdir() if item.name not in SKIP
            )
            self.reply_json({"path": str(path), "entries": entries})
        elif path.is_file():
            mime, _ = mimetypes.guess_type(path.name)
            body = path.read_bytes()
            self.reply(HTTPStatus.OK, body, mime or "application/octet-stream")
        else:
            self.reply(HTTPStatus.NOT_FOUND, "Not found")

        elapsed = (time.perf_counter() - started) * 1000
        print(f"{self.command} {self.path} -> {self.status_code} in {elapsed:.1f} ms")

    def resolve(self, raw_path: str) -> Path | None:
        parsed = urlparse(raw_path)
        candidate = (self.root / unquote(parsed.path).lstrip("/")).resolve()
        try:
            candidate.relative_to(self.root.resolve())
        except ValueError:
            return None
        return candidate

    def reply(self, status: HTTPStatus, body: bytes | str, content_type: str = "text/plain") -> None:
        payload = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def reply_json(self, value: dict) -> None:
        self.reply(HTTPStatus.OK, json.dumps(value, indent=2), "application/json")


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve a folder for the Interline demo")
    parser.add_argument("--port", type=int, default=8420)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    options = parser.parse_args()

    InterlineHandler.root = options.root
    server = ThreadingHTTPServer(("127.0.0.1", options.port), InterlineHandler)
    print(f"Serving {options.root.resolve()} at http://127.0.0.1:{options.port}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
