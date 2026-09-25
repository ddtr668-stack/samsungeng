# 삼성이엔지 계약관리 대시보드 · 내 PC 서버판

로컬 PC 를 웹서버로 돌려 대시보드를 구동하는 프로젝트입니다.
(React 18 + Babel Standalone · 빌드 없이 실행 · 데이터는 Google 스프레드시트 + Apps Script)

> ⚠️ **이 저장소는 반드시 Private(비공개)로 유지하세요.**
> `assets/data/app-data.json` 에 실제 거래처·계약금액 정보가 들어 있습니다.

## 빠른 시작

| OS | 실행 파일 |
|----|-----------|
| Windows | `서버_실행_Windows.bat` (더블클릭) |
| macOS / Linux | `서버_실행_Mac.command` (더블클릭) |
| Node.js 없이 | `서버_실행_Python.py` (Python 3.6+) |

3초 뒤 브라우저가 자동으로 `http://localhost:3000` 을 엽니다.
(React 등 라이브러리를 인터넷(CDN)에서 받아오므로 **인터넷 연결이 필요**합니다.)

사전 준비: Node.js LTS 또는 Python 3 중 **하나만** 설치.
(Python 은 설치 시 "Add Python to PATH" 체크)

## 첫 실행 후 설정

설정 값은 **브라우저(localStorage)에 저장**되므로 저장소에는 올라가지 않습니다. PC/브라우저를 바꾸면 다시 입력해야 합니다.

1. **[설정] → GAS 웹앱 URL** — 스프레드시트 Apps Script 배포 URL
2. **[설정] → 연결된 스프레드시트** — 표시 이름 · 시트 URL
3. **[설정] → Google Drive 인증 정보** (선택) — API Key + Client ID
4. **GAS 재배포** — `gas-backend/` 의 최신 `.gs` 로 교체 후 "새 버전" 배포

GAS URL 을 등록하지 않으면 `assets/data/app-data.json` 의 저장된 데이터로 화면만 표시됩니다(읽기 전용 데모).

## 폴더 구조

```
samsung-eng-dashboard/
├── index.html                    진입점 (스크립트 로딩 순서 정의)
├── assets/
│   ├── app.css                   전체 스타일
│   ├── data/app-data.json        GAS 미연결 시 표시되는 저장 데이터 (실데이터 · Private 필수)
│   ├── images/                   로고 · 이미지
│   ├── samples/                  엑셀 가져오기용 양식 (설치비 / 제품 내역서)
│   └── js/                       React 컴포넌트 (.jsx)
│       ├── modal-expense.jsx         지출품의서 작성 화면
│       ├── modal-expense-parts.jsx   지출품의서 하위 컴포넌트
│       └── expense-print.jsx         지출품의서 A4 세로 인쇄물 · 미리보기 (손익 계산 포함)
├── gas-backend/                  Google Apps Script 백엔드
│   ├── DashboardApi.gs
│   ├── ExpenseRequest.gs
│   └── PATCH_EDITABLE_FIELDS.gs
├── 서버_실행_Windows.bat · 서버_실행_Mac.command · 서버_실행_Python.py
├── 사용법.txt · 변경사항_v2.md · 진단.html
├── GITHUB_업로드_가이드.md       GitHub 에 올리고 내 PC 에서 검증하는 방법
├── .gitignore · .gitattributes
└── README.md
```

## 트러블슈팅

- **포트 3000 사용 중** — `서버_실행_Python.py` 상단 `PORT = 3000` 변경, 또는 `netstat -ano | findstr :3000` 로 점유 프로그램 종료
- **macOS "확인되지 않은 개발자"** — 파일 우클릭 → 열기
- **무한 로딩 / JSX 오류** — F12 → Console 확인. `index.html` 을 더블클릭(file://)으로 열지 말고 반드시 서버 스크립트로 접속
- **GAS 저장 실패** — 설정의 웹앱 URL 확인, `.gs` 수정 후 "새 버전"으로 재배포했는지 확인

## 라이선스

내부 사용 (주식회사 삼성이엔지 · 한별상회)
