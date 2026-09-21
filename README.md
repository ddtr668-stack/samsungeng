# 삼성이엔지 계약관리 대시보드

주식회사 삼성이엔지의 계약·수금·매입·거래처 통합 관리 대시보드입니다.
Google 스프레드시트를 데이터베이스로 사용하며, Google Apps Script Web API를 통해 실시간으로 연동됩니다.

---

## 🌐 라이브 데모

배포 후 아래 URL로 접속: `https://<GitHub-사용자명>.github.io/<저장소명>/`

---

## 📦 파일 구조

```
├── index.html              ← 진입점
├── assets/
│   ├── app.css             ← 전체 스타일
│   └── js/                 ← React 컴포넌트 (14개)
│       ├── app.jsx
│       ├── shared.jsx
│       ├── api-client.jsx
│       ├── components-modal.jsx
│       ├── screens-*.jsx   ← 각 화면
│       └── modal-*.jsx     ← 모달
├── .gitignore
└── README.md
```

---

## 🚀 GitHub Pages 배포 방법

### 1. GitHub 저장소 만들기
1. https://github.com/new 이동
2. Repository name 입력 (예: `contract-dashboard`)
3. **Public** 또는 **Private** 선택
   - Private을 원하면 계정이 **GitHub Pro (유료)** 이거나 조직 계정이어야 GitHub Pages 사용 가능
4. **Create repository** 클릭

### 2. 파일 업로드
**옵션 A — 웹에서 드래그 앤 드롭 (가장 쉬움)**
1. 방금 만든 저장소 페이지에서 **"uploading an existing file"** 링크 클릭
2. 이 폴더의 **모든 파일**을 브라우저로 드래그 앤 드롭
3. Commit changes 클릭

**옵션 B — Git 명령어**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<사용자명>/<저장소명>.git
git push -u origin main
```

### 3. GitHub Pages 활성화
1. 저장소 → **Settings** → 좌측 **Pages** 메뉴
2. **Source** : `Deploy from a branch` 선택
3. **Branch** : `main` / `/ (root)` 선택 → **Save**
4. 1~2분 후 상단에 URL 표시: `https://<사용자명>.github.io/<저장소명>/`

### 4. Apps Script URL 등록
1. 배포된 URL로 접속 → 자동으로 **설정 화면**으로 이동됨
2. Apps Script 웹앱 URL 붙여넣기 → **저장** → **연결 테스트**
3. "pong 응답 확인" 이 뜨면 성공 ✅

---

## ⚠️ 보안 주의사항

### 🔴 절대 커밋하면 안 되는 파일
- `계약관리.xlsx` (원본 엑셀 데이터)
- 실제 거래처·매출 데이터가 담긴 JSON
- Apps Script 웹앱 URL 자체 (코드에 하드코딩 금지)

`.gitignore`에 이미 위 파일 확장자들이 등록되어 있습니다.

### 🔒 Private 저장소 권장
계약·매출 정보를 다루는 시스템이므로 **Private 저장소** 사용을 강력히 권장합니다.

### 🔐 접근 제어 옵션
GitHub Pages는 기본적으로 URL만 알면 누구나 접속 가능합니다.

**Public URL 노출을 막으려면:**
1. **Cloudflare Access** 앞단에 붙이기 (Google 로그인 필수화)
2. **Netlify + Password Protection** 으로 배포 대체
3. 또는 사내망 웹서버에 배포

**데이터 자체는 안전:** Apps Script 웹앱을 "조직 내 사용자"로 배포했다면 URL을 알아도 로그인 없이는 데이터 조회 불가능합니다.

---

## 🔧 백엔드 설정 (Apps Script)

이 저장소는 **프런트엔드만** 포함합니다. 백엔드(`DashboardApi.gs`)는 별도로 Google Apps Script에 붙여넣어야 합니다.

**설치 절차:** 별도 배포한 `연동 가이드.html` 참조

**요약:**
1. 계약관리 스프레드시트 → 확장 프로그램 → Apps Script
2. 새 파일 생성 → `DashboardApi.gs` 코드 붙여넣기
3. 배포 → 새 배포 → 웹 앱
4. 발급된 URL을 대시보드 설정에 등록

---

## 🐛 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 화면이 하얗게 뜸 | Babel 로딩 실패 | 콘솔 확인, 인터넷 재확인 |
| "연결 실패" | Apps Script 배포 오류 | 액세스 권한을 "조직 내" 이상으로 재배포 |
| Mixed Content 오류 | HTTP로 접속 | https:// 로 접속 (GitHub Pages는 기본 HTTPS) |
| CORS 오류 | 배포 설정 문제 | Apps Script 재배포 후 새 URL 등록 |
| 한글 깨짐 | 파일 인코딩 | UTF-8로 저장되어 있는지 확인 |

---

## 📝 라이선스

내부 사용 전용 (Proprietary)

---

_v1.0 · 2026.09_
