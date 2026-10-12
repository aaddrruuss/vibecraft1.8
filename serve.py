"""Local server for Vibecraft that never lets the browser cache the game files.

`python -m http.server` sends no Cache-Control header, so browsers keep serving
stale JS after an edit. Usage: python serve.py [port]
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'Vibecraft en http://localhost:{port}')
    http.server.ThreadingHTTPServer(('', port), NoCacheHandler).serve_forever()
