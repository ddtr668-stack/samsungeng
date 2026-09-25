#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
삼성이엔지 계약관리 대시보드 · 로컬 서버 (Python 전용)
─────────────────────────────────────────────────────────────
Python 3.6 이상만 있으면 Node.js 없이도 즉시 실행 가능합니다.

사용법:
    python 서버_실행_Python.py
    python3 서버_실행_Python.py         (macOS/Linux)

Windows 에서 파일 더블클릭 시 실행되도록 Python 설치 시
"Add Python to PATH" 를 체크하세요.
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import threading
import time
import mimetypes

PORT = 3000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# .jsx 파일이 브라우저에서 JS로 로드되도록 MIME 매핑 추가
mimetypes.add_type('application/javascript', '.jsx')
mimetypes.add_type('text/plain', '.gs')

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """캐시 비활성 + UTF-8 로그 (기존 프론트 코드의 실시간 개발과 동일한 경험)"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # 브라우저 캐시 무효화 (수정 즉시 반영)
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, format, *args):
        # 접속 로그를 간결하게
        try:
            sys.stdout.write(f"  · {self.address_string()} → {format % args}\n")
            sys.stdout.flush()
        except Exception:
            pass


def open_browser_soon():
    time.sleep(2)
    try:
        webbrowser.open(f'http://localhost:{PORT}')
    except Exception:
        pass


def main():
    print()
    print('═══════════════════════════════════════════════════════════')
    print('  삼성이엔지 계약관리 대시보드 · 로컬 서버 (Python)')
    print('═══════════════════════════════════════════════════════════')
    print()
    print(f'  Python {sys.version.split()[0]} · 포트 {PORT}')
    print(f'  작업 디렉터리: {DIRECTORY}')
    print()
    print('═══════════════════════════════════════════════════════════')
    print(f'  접속 주소:  http://localhost:{PORT}')
    print('═══════════════════════════════════════════════════════════')
    print()
    print('  중단하려면 Ctrl+C 를 누르세요.')
    print()

    threading.Thread(target=open_browser_soon, daemon=True).start()

    # 포트 재사용 허용 (Ctrl+C 후 즉시 재실행 시 "Address already in use" 회피)
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(('', PORT), NoCacheHandler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n  서버를 종료합니다. 감사합니다.\n')
        sys.exit(0)
    except OSError as e:
        if 'Address already in use' in str(e) or getattr(e, 'errno', None) == 98:
            print(f'\n  [X] 포트 {PORT} 이 이미 사용 중입니다.')
            print(f'      다른 프로그램을 종료하거나, 이 파일의 상단 PORT 값을 변경하세요.\n')
        else:
            print(f'\n  [X] 서버 시작 실패: {e}\n')
        sys.exit(1)


if __name__ == '__main__':
    main()
