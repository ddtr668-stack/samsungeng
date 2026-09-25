@echo off
chcp 65001 > nul
title 삼성이엔지 계약관리 대시보드
color 0A

echo.
echo  ═══════════════════════════════════════════════════════════
echo   삼성이엔지 계약관리 대시보드 · 로컬 서버
echo  ═══════════════════════════════════════════════════════════
echo.

REM 현재 배치 파일 위치로 이동
cd /d "%~dp0"

REM ─── Node.js 우선 시도 ───
where node >nul 2>nul
if not errorlevel 1 (
    echo  [OK] Node.js 확인 완료
    goto :run_node
)

REM ─── Python 폴백 시도 ───
where python >nul 2>nul
if not errorlevel 1 (
    echo  [OK] Python 확인 완료 ^(Node.js 없음 - Python 사용^)
    goto :run_python
)

where py >nul 2>nul
if not errorlevel 1 (
    echo  [OK] Python Launcher 확인 완료 ^(Node.js 없음 - Python 사용^)
    goto :run_py
)

REM ─── 둘 다 없음 ───
echo.
echo  [X] Node.js 또는 Python이 설치되어 있지 않습니다.
echo.
echo   다음 중 하나를 설치한 후 다시 실행하세요:
echo.
echo     Node.js LTS  ^-^>  https://nodejs.org
echo     Python 3     ^-^>  https://www.python.org/downloads/
echo                       ^(설치 시 "Add Python to PATH" 체크^)
echo.
pause
exit /b 1

:run_node
echo.
echo   서버를 시작합니다... ^(잠시만 기다려주세요^)
echo   중단하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
echo  ═══════════════════════════════════════════════════════════
echo   접속 주소:  http://localhost:3000
echo  ═══════════════════════════════════════════════════════════
echo.

REM 3초 뒤 브라우저 자동 열기
start "" cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3000"

REM npx serve 실행 (포트 3000, 캐시 무효화)
call npx --yes serve -l 3000 -n .
goto :end

:run_python
echo.
echo   서버를 시작합니다... ^(Python http.server^)
echo   중단하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
echo  ═══════════════════════════════════════════════════════════
echo   접속 주소:  http://localhost:3000
echo  ═══════════════════════════════════════════════════════════
echo.
start "" cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3000"
python -m http.server 3000
goto :end

:run_py
echo.
echo   서버를 시작합니다... ^(Python http.server^)
echo   중단하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
echo.
echo  ═══════════════════════════════════════════════════════════
echo   접속 주소:  http://localhost:3000
echo  ═══════════════════════════════════════════════════════════
echo.
start "" cmd /c "timeout /t 3 /nobreak > nul && start http://localhost:3000"
py -3 -m http.server 3000
goto :end

:end
pause
