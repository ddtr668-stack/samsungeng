#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  삼성이엔지 계약관리 대시보드 · 로컬 서버 (macOS / Linux)
# ═══════════════════════════════════════════════════════════

# 이 스크립트가 있는 폴더로 이동
cd "$(dirname "$0")"

clear
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  삼성이엔지 계약관리 대시보드 · 로컬 서버"
echo "═══════════════════════════════════════════════════════════"
echo ""

open_browser() {
  ( sleep 3 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null) ) &
}

# ─── Node.js 우선 ───
if command -v node > /dev/null 2>&1; then
  echo "  [OK] Node.js 확인 완료"
  echo ""
  echo "  서버를 시작합니다... (잠시만 기다려주세요)"
  echo "  중단하려면 이 창을 닫거나 Ctrl+C 를 누르세요."
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  접속 주소:  http://localhost:3000"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  open_browser
  npx --yes serve -l 3000 -n .
  exit 0
fi

# ─── Python 3 폴백 ───
if command -v python3 > /dev/null 2>&1; then
  echo "  [OK] Python 3 확인 완료 (Node.js 없음 - Python 사용)"
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  접속 주소:  http://localhost:3000"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  open_browser
  python3 -m http.server 3000
  exit 0
fi

if command -v python > /dev/null 2>&1; then
  echo "  [OK] Python 확인 완료 (Node.js 없음 - Python 사용)"
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  접속 주소:  http://localhost:3000"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  open_browser
  python -m http.server 3000
  exit 0
fi

echo ""
echo "  [X] Node.js 또는 Python이 설치되어 있지 않습니다."
echo ""
echo "  다음 중 하나를 설치한 후 다시 실행하세요:"
echo ""
echo "    Node.js LTS  ->  https://nodejs.org"
echo "    Python 3     ->  brew install python  (macOS)"
echo "                     또는 https://www.python.org/downloads/"
echo ""
read -p "  Enter 키를 누르면 종료됩니다..."
exit 1
