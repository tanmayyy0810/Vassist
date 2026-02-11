#!/usr/bin/env python3
"""
VAssist - Local Development Server
Self-contained Python server with in-memory SQLite DB
No external dependencies - just run: python server.py
Author: Yuvraj Chopra
"""

import http.server
import json
import os
import sys
import sqlite3
import threading
import urllib.parse
from datetime import datetime, timezone

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ===========================================================
# DATABASE - In-memory SQLite (thread-safe)
# ===========================================================

DB_LOCK = threading.Lock()

def get_db():
    """Return a thread-local SQLite connection to the shared in-memory DB."""
    conn = sqlite3.connect("file:vassist_db?mode=memory&cache=shared", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    """Create the requests table on startup."""
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY,
            item TEXT NOT NULL,
            pickup TEXT NOT NULL,
            drop_location TEXT NOT NULL,
            pickup_lat REAL,
            pickup_lng REAL,
            drop_lat REAL,
            drop_lng REAL,
            fare TEXT DEFAULT '0',
            delivery_type TEXT DEFAULT 'walker',
            otp TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            partner_name TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def row_to_dict(row):
    """Convert sqlite3.Row to a plain dict."""
    if row is None:
        return None
    return dict(row)


# ===========================================================
# HTTP REQUEST HANDLER
# ===========================================================

class VAssistHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler: serves static files + API routes."""

    # Map file extensions to MIME types
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.html': 'text/html',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.webp': 'image/webp',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.webm': 'video/webm',
        '.mp4': 'video/mp4',
    }

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # -- API Routes --
        if path == '/api/get-requests':
            return self._handle_get_requests(parsed.query)
        if path == '/api/poll':
            return self._handle_poll(parsed.query)

        # -- Static Files --
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Read body
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            return self._json_response({'error': 'Invalid JSON'}, 400)

        # -- API Routes --
        if path == '/api/create-request':
            return self._handle_create_request(data)
        if path == '/api/accept-request':
            return self._handle_accept_request(data)
        if path == '/api/update-status':
            return self._handle_update_status(data)
        if path == '/api/verify-otp':
            return self._handle_verify_otp(data)

        self._json_response({'error': 'Not found'}, 404)

    # ===========================================================
    # API HANDLERS
    # ===========================================================

    def _handle_create_request(self, data):
        """POST /api/create-request - Insert a new delivery request."""
        required = ['id', 'item', 'pickup', 'drop_location', 'otp']
        if not all(data.get(f) for f in required):
            return self._json_response({'error': 'Missing required fields'}, 400)

        with DB_LOCK:
            conn = get_db()
            try:
                now = datetime.now(timezone.utc).isoformat()
                conn.execute("""
                    INSERT INTO requests
                        (id, item, pickup, drop_location, pickup_lat, pickup_lng,
                         drop_lat, drop_lng, fare, delivery_type, otp, status,
                         created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
                """, (
                    data['id'], data['item'], data['pickup'], data['drop_location'],
                    data.get('pickup_lat'), data.get('pickup_lng'),
                    data.get('drop_lat'), data.get('drop_lng'),
                    data.get('fare', '0'), data.get('delivery_type', 'walker'),
                    str(data['otp']), now, now
                ))
                conn.commit()
            except sqlite3.IntegrityError:
                return self._json_response({'error': 'Request ID already exists'}, 409)
            finally:
                conn.close()

        print(f"  [NEW] Request: {data['id']} - {data['item']}")
        self._json_response({'success': True, 'id': data['id']}, 201)

    def _handle_get_requests(self, query_string):
        """GET /api/get-requests?id=...&status=..."""
        params = urllib.parse.parse_qs(query_string)
        req_id = params.get('id', [None])[0]
        status_filter = params.get('status', ['PENDING'])[0]

        with DB_LOCK:
            conn = get_db()
            try:
                if req_id:
                    row = conn.execute(
                        "SELECT * FROM requests WHERE id = ?", (req_id,)
                    ).fetchone()
                    if not row:
                        return self._json_response({'error': 'Not found'}, 404)
                    result = row_to_dict(row)
                    # Don't expose OTP in GET (security)
                    result.pop('otp', None)
                    return self._json_response(result)
                else:
                    rows = conn.execute(
                        "SELECT * FROM requests WHERE status = ? ORDER BY created_at DESC LIMIT 20",
                        (status_filter,)
                    ).fetchall()
                    results = [row_to_dict(r) for r in rows]
                    return self._json_response(results)
            finally:
                conn.close()

    def _handle_accept_request(self, data):
        """POST /api/accept-request - Accept a pending request."""
        req_id = data.get('id')
        partner_name = data.get('partner_name')

        if not req_id or not partner_name:
            return self._json_response({'error': 'Missing id or partner_name'}, 400)

        with DB_LOCK:
            conn = get_db()
            try:
                # Only accept if still PENDING
                row = conn.execute(
                    "SELECT * FROM requests WHERE id = ? AND status = 'PENDING'",
                    (req_id,)
                ).fetchone()

                if not row:
                    return self._json_response(
                        {'error': 'Request not found or already accepted'}, 409
                    )

                now = datetime.now(timezone.utc).isoformat()
                conn.execute("""
                    UPDATE requests
                    SET status = 'ACCEPTED', partner_name = ?, updated_at = ?
                    WHERE id = ?
                """, (partner_name, now, req_id))
                conn.commit()

                print(f"  [ACCEPTED] Request {req_id} by {partner_name}")
                return self._json_response({
                    'success': True, 'id': req_id,
                    'status': 'ACCEPTED', 'partner_name': partner_name
                })
            finally:
                conn.close()

    def _handle_update_status(self, data):
        """POST /api/update-status - Update request status."""
        req_id = data.get('id')
        new_status = data.get('status')

        if not req_id or not new_status:
            return self._json_response({'error': 'Missing id or status'}, 400)

        valid_statuses = ['PENDING', 'ACCEPTED', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'CANCELLED']
        if new_status not in valid_statuses:
            return self._json_response({'error': 'Invalid status'}, 400)

        with DB_LOCK:
            conn = get_db()
            try:
                now = datetime.now(timezone.utc).isoformat()
                cursor = conn.execute("""
                    UPDATE requests SET status = ?, updated_at = ?
                    WHERE id = ?
                """, (new_status, now, req_id))
                conn.commit()

                if cursor.rowcount == 0:
                    return self._json_response({'error': 'Request not found'}, 404)

                print(f"  [STATUS] Request {req_id} -> {new_status}")
                return self._json_response({
                    'success': True, 'id': req_id, 'status': new_status
                })
            finally:
                conn.close()

    def _handle_verify_otp(self, data):
        """POST /api/verify-otp - Verify OTP and mark as delivered."""
        req_id = data.get('id')
        otp = data.get('otp')

        if not req_id or not otp:
            return self._json_response({'error': 'Missing id or otp'}, 400)

        with DB_LOCK:
            conn = get_db()
            try:
                row = conn.execute(
                    "SELECT otp, status FROM requests WHERE id = ?", (req_id,)
                ).fetchone()

                if not row:
                    return self._json_response({'error': 'Request not found'}, 404)

                if row['status'] == 'DELIVERED':
                    return self._json_response({'error': 'Already delivered'}, 409)

                if str(row['otp']) != str(otp):
                    return self._json_response({
                        'ok': False, 'success': False, 'error': 'Invalid OTP'
                    }, 403)

                now = datetime.now(timezone.utc).isoformat()
                conn.execute("""
                    UPDATE requests SET status = 'DELIVERED', updated_at = ?
                    WHERE id = ?
                """, (now, req_id))
                conn.commit()

                print(f"  [DELIVERED] Request {req_id} - OTP Verified!")
                return self._json_response({
                    'ok': True, 'success': True,
                    'message': 'OTP verified! Delivery complete.'
                })
            finally:
                conn.close()

    def _handle_poll(self, query_string):
        """GET /api/poll?id=... - Poll for request updates (replaces Firebase real-time)."""
        params = urllib.parse.parse_qs(query_string)
        req_id = params.get('id', [None])[0]

        if not req_id:
            return self._json_response({'error': 'Missing id parameter'}, 400)

        with DB_LOCK:
            conn = get_db()
            try:
                row = conn.execute(
                    "SELECT * FROM requests WHERE id = ?", (req_id,)
                ).fetchone()
                if not row:
                    return self._json_response(None)

                result = row_to_dict(row)
                result.pop('otp', None)  # Don't expose OTP
                return self._json_response(result)
            finally:
                conn.close()

    # ===========================================================
    # HELPERS
    # ===========================================================

    def _json_response(self, data, status=200):
        """Send a JSON response with CORS headers."""
        self.send_response(status)
        self._cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data, default=str).encode('utf-8'))

    def _cors_headers(self):
        """Add permissive CORS headers."""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, format, *args):
        """Custom log format."""
        msg = format % args
        if '/api/' in msg:
            print(f"  [API]  {msg}")
        elif '200' in msg or '304' in msg:
            pass  # Suppress static file logs for cleaner output
        else:
            print(f"  [FILE] {msg}")


# ===========================================================
# SERVER STARTUP
# ===========================================================

def main():
    PORT = 8000
    HOST = '0.0.0.0'

    # Change to the project directory (where index.html is)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Initialize the database
    init_db()

    cwd = os.getcwd()
    print()
    print("=" * 58)
    print("    VAssist Local Server v3.0")
    print("    Built by Yuvraj Chopra")
    print("=" * 58)
    print(f"  Server running at: http://localhost:{PORT}")
    print(f"  Serving files from: {cwd}")
    print(f"  Database: In-memory SQLite (fresh on each start)")
    print()
    print("  Press Ctrl+C to stop the server")
    print("=" * 58)
    print()

    server = http.server.HTTPServer((HOST, PORT), VAssistHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped. Goodbye!")
        server.server_close()


if __name__ == '__main__':
    main()
