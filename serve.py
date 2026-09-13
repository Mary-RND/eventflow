import http.server
import socketserver
import os
import sys

PORT = 4173
ROOT = os.path.dirname(os.path.abspath(sys.argv[0]))
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(format % args)

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    print(f"Сервер запущен: http://localhost:{PORT}/app/")
    print("Нажмите Ctrl+C для остановки.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nСервер остановлен.")
