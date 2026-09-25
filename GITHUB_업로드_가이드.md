# GitHub 업로드 · 내 PC 서버 검증 가이드

지출품의서 **A4 세로 출력 · 손익 계산 · 수금 내역(계약금/중도금/잔금) · 설치비 기성 · 도급업체 대표자/목록 · 출력 회사명 선택**을 내 컴퓨터(서버)에서 검증하기 위한 절차입니다.
순서: ① 저장소 만들기 → ② 파일 올리기 → ③ 내 PC 에서 서버 실행 → ④ 검증 체크리스트

---

## 0. ⚠️ 먼저 확인 — 저장소는 반드시 Private

`assets/data/app-data.json` 에는 **실제 거래처(사업자번호·대표자·주소), 계약금액, 마진** 정보가 들어 있습니다.
GitHub 에서 저장소를 만들 때 **Private** 을 선택하세요. (Public 으로 올리면 누구나 볼 수 있습니다.)

- 이 프로젝트 파일 안에는 API 키·비밀번호가 **없습니다.** (GAS URL, Drive 키는 브라우저에만 저장됨)
- 실제 계약 원장 엑셀(`assets/samples/계약관리.xlsx`)은 앱에서 쓰지 않아 `.gitignore` 로 제외했습니다.

---

## 1. 올려야 할 파일 (전체 목록)

압축을 푼 `samsung-eng-dashboard` 폴더 **안의 내용 전부**를 올립니다. (`.gitignore` 같은 점(.)으로 시작하는 숨김 파일 포함)

| 구분 | 파일 | 필수 | 설명 |
|---|---|:--:|---|
| 진입점 | `index.html` | ● | 화면 시작 파일 · 스크립트 로딩 순서 |
| 스타일 | `assets/app.css` | ● | 전체 디자인 |
| 화면 코드 | `assets/js/*.jsx` (총 21개) | ● | 아래 표 참고 |
| 데이터 | `assets/data/app-data.json` | ● | GAS 미연결 시 화면에 표시되는 저장 데이터 (Private 필수) |
| 이미지 | `assets/images/*.png` (10개) | ○ | 로고 등 |
| 엑셀 양식 | `assets/samples/install_sample.xlsx`, `product_sample.xlsx` | ○ | 설치비·제품 내역서 가져오기용 양식 |
| 백엔드 | `gas-backend/DashboardApi.gs`, `ExpenseRequest.gs`, `PATCH_EDITABLE_FIELDS.gs` | ● | Apps Script 에 붙여넣는 코드 (보관용) |
| 실행 | `서버_실행_Windows.bat`, `서버_실행_Mac.command`, `서버_실행_Python.py` | ● | 내 PC 서버 실행 |
| 문서 | `README.md`, `사용법.txt`, `변경사항_v2.md`, `GITHUB_업로드_가이드.md` | ○ | 설명서 |
| 진단 | `진단.html` | ○ | 연결 진단 페이지 |
| Git 설정 | `.gitignore`, `.gitattributes` | ● | 올리지 않을 파일 · 줄바꿈 규칙 |

**이번 수정(지출품의서 개선)과 직접 관련된 파일**

| 파일 | 상태 | 내용 |
|---|---|---|
| `assets/js/expense-print.jsx` | 🆕 신규 | A4 세로 인쇄 문서 · 손익 계산 · 수금 내역 · 설치비 기성 · 미리보기 |
| `assets/js/modal-expense.jsx` | 🔄 수정 | 상단 헤더 디자인 · 출력 회사명 선택 · 수금이력 연동 · 출력/미리보기 |
| `assets/js/modal-expense-parts.jsx` | 🔄 수정 | 도급업체 선택(대표자 칸 · 목록 확장) · 수금 타일 |
| `index.html` | 🔄 수정 | `expense-print.jsx` 로딩 추가 |
| `gas-backend/DashboardApi.gs` | 🔄 수정 (선택) | 도급업체 시트 읽기 — **쓰려면 Apps Script 에 붙여넣고 "새 버전" 재배포** |

`assets/js/` 21개: `api-client`, `app`, `components-modal`, `components-site-folders`, `expense-print`, `lib-drive-folders`, `lib-drive-picker`, `modal-expense`, `modal-expense-parts`, `modal-new-contract`, `modal-payment`, `modal-site-info`, `screens-clients`, `screens-contracts`, `screens-dashboard`, `screens-detail`, `screens-expense`, `screens-receivable`, `screens-reports`, `screens-settings`, `shared` (.jsx)

### 올리지 않는 것
- `assets/samples/계약관리.xlsx` — 실제 원장(실데이터), 앱에서 미사용 → `.gitignore` 로 자동 제외
- `node_modules/`, `*.log`, `*.pdf`, `.DS_Store`, `Thumbs.db` → `.gitignore` 로 자동 제외
- 개인 설정(GAS URL, Drive 키) → 브라우저에만 저장되어 파일에 없음

---

## 2. GitHub 에 올리는 방법 (3가지 중 하나)

### 사전 준비 (공통)
1. https://github.com 가입 · 로그인
2. 우측 상단 **+ → New repository**
   - Repository name: `samsung-eng-dashboard` (원하는 이름)
   - **Private** 선택 ← 중요
   - "Add a README file" 등 **체크하지 않음** (이미 파일이 있으므로 빈 저장소로 생성)
   - **Create repository**

### 방법 A. GitHub Desktop (가장 쉬움 · 추천)
1. https://desktop.github.com 설치 → GitHub 계정으로 로그인
2. 메뉴 **File → Add local repository…** → `samsung-eng-dashboard` 폴더 선택
   - "This directory does not appear to be a Git repository" 가 나오면 **create a repository** 링크 클릭 → **Create Repository**
3. 왼쪽 목록에 올라갈 파일이 보입니다. (`계약관리.xlsx` 가 목록에 **없어야** 정상)
4. 왼쪽 아래 Summary 에 `지출품의서 개선 (A4 세로 · 손익 · 수금 내역 · 설치비 기성)` 입력 → **Commit to main**
5. 상단 **Publish repository** → **"Keep this code private" 체크 확인** → **Publish repository**

### 방법 B. 명령어 (Git)
Git 설치: https://git-scm.com/download/win (기본 옵션으로 Next 계속)

폴더에서 우클릭 → **Git Bash Here** (또는 터미널로 폴더 이동) 후:

```bash
# 최초 1회 (컴퓨터에 처음 설치했다면) 이름/메일 등록
git config --global user.name "내이름"
git config --global user.email "ddtr668@gmail.com"
git config --global core.quotepath false     # 한글 파일명이 깨져 보이지 않게

# 저장소 만들기 → 올리기
git init
git add .
git status                                   # 올라갈 파일 확인 (계약관리.xlsx 가 없어야 정상)
git commit -m "지출품의서 개선 (A4 세로 · 손익 · 수금 내역 · 설치비 기성)"
git branch -M main
git remote add origin https://github.com/내계정/samsung-eng-dashboard.git
git push -u origin main
```

- `git push` 때 브라우저 로그인 창이 뜨면 GitHub 로그인 → 승인
- 비밀번호를 물으면 GitHub 비밀번호가 아니라 **Personal Access Token** 을 입력해야 합니다.
  (GitHub → Settings → Developer settings → Personal access tokens → Generate, `repo` 권한)

### 방법 C. 웹에서 끌어다 놓기 (Git 설치 없이)
1. 만든 저장소 페이지에서 **uploading an existing file** 클릭
2. 폴더 **안의 파일·폴더를 전부 선택**해서 브라우저에 드래그 (폴더 자체가 아니라 안의 내용)
3. 숨김 파일(`.gitignore`, `.gitattributes`)이 빠지면 별도로 한 번 더 드래그
4. 한 번에 올릴 수 있는 파일은 **100개 미만**입니다. (현재 약 50개 → 한 번에 가능)
5. **Commit changes**
- 단점: `계약관리.xlsx` 같은 제외 대상은 **직접 빼고** 올려야 합니다. (이 zip 에는 이미 빠져 있음)

---

## 3. 내 PC 를 서버로 돌려 검증하기

GitHub 에 올린 뒤 **다른 폴더에 새로 받아서** 실행하면 "올린 파일만으로 정상 동작하는지"까지 확인됩니다.

1. **받기**
   - GitHub Desktop: **File → Clone repository** → 저장소 선택 → Clone
   - 또는 명령어: `git clone https://github.com/내계정/samsung-eng-dashboard.git`
2. **서버 실행** (Node.js 또는 Python 중 하나 설치되어 있어야 함)
   - Windows: `서버_실행_Windows.bat` 더블클릭
   - macOS: `서버_실행_Mac.command` (처음이면 우클릭 → 열기)
   - 그 외: `python 서버_실행_Python.py`
3. 3초 뒤 브라우저가 열림 → `http://localhost:3000`
   - 인터넷 연결 필요 (React 라이브러리를 CDN 에서 받음)
   - 검은 창(터미널)을 **닫지 마세요.** 닫으면 서버가 꺼집니다.
4. GAS 를 연결하지 않아도 **출력 / 미리보기 검증은 가능**합니다. (저장·PDF 다운로드만 GAS 필요)

---

## 4. 검증 체크리스트

### 4-1. 기본 동작
- [ ] 대시보드 화면이 뜬다 (무한 로딩 아님)
- [ ] [계약 관리] → 계약 클릭 → 상세 화면 → **지출품의서 생성** 버튼 → 모달이 열린다

### 4-2. A4 세로 출력
- [ ] **👁 출력 미리보기** → 흰 종이(A4 세로 비율)로 표시된다
- [ ] **🖨️ 출력** → 인쇄 창에서 **용지 A4 / 방향 세로** 로 표시된다 (Chrome: "레이아웃 = 세로")
- [ ] 인쇄 미리보기가 **2페이지 내외**이고, 표가 페이지 경계에서 잘리지 않는다
- [ ] "PDF로 저장" 으로 저장한 파일을 열면 세로 A4 이다
- [ ] 계약 상세 화면 등 **다른 화면 인쇄는 기존처럼 가로**다 (영향 없음)

> 인쇄 창에서 "배경 그래픽" 옵션을 켜면 표 머리글 회색 음영이 함께 인쇄됩니다.

### 4-3. 손익 계산 숫자 검증 (직접 계산해서 비교)
**계약 #7 · 에이치원건설 · 평택하츠공장** (총 계약금액 42,900,000원)을 열고 아래처럼 입력:

| 입력 위치 | 입력값 |
|---|---|
| 설치비 내역서 → 1행 | 품목 `설치공사` / 수량 `1` / 단가 `12600000` |
| 제품 내역서 → **+ 제품 항목 직접 추가** | 품명 `시스템에어컨` / 수량 `1` / **단가** 열(맨 오른쪽 입력칸) `26232000` |
| 기타 경비 → **+ 항목 추가** | 항목 `크레인` / 수량 `1` / 금액 `450000` |
| 영업 수수료 → **+ 항목 추가** | 항목 `수수료` / 수량 `1` / 금액 `300000` |
| 영업담당 / 금회 요청금액 | 아무 값 (예: `이상규 이사` / `5000000`) |

→ **출력 미리보기** 2페이지 하단 "손익 계산" 표가 다음과 같아야 합니다.

| 구분 | 기대값 |
|---|---:|
| 총 계약금액 | 42,900,000 |
| (-) 설치비 | 12,600,000 |
| (-) 제품 내역서 | 26,232,000 |
| (-) 기타 경비 | 450,000 |
| (-) 영업 수수료 | 300,000 |
| **예상 손익** | **3,318,000** (수익률 **7.7%**) |

- [ ] 값이 위와 일치한다
- [ ] "금회 지급 총액" 표는 더 이상 나오지 않는다

**입력을 비워둘 때의 기본값** (참고): 설치비 내역서가 비면 도급금액, 제품 내역서가 비면 계약관리 시트의 제품대, 기타 경비/영업 수수료가 비면 시트의 부대비용/영업비용을 사용합니다. "산출 근거" 칸에 출처가 표시됩니다.

### 4-4. 그 밖의 변경 확인
- [ ] 출력물에 **"설치비 기성"** 제목의 표가 있고, "기성 진행 현황" 이라는 문구는 없다 (입력 화면도 동일)
- [ ] 입력 화면 상단(지출품의서 · 품의제목 · 금회 요청금액)이 아래 카드들과 같은 둥근 카드 스타일이다
- [ ] 도급업체 블록: 업체명 선택 ↔ **대표자** ↔ 사업자등록번호 순서로 배치, 업체를 바꾸면 이전 업체의 계좌·담당자가 남지 않는다
- [ ] 도급업체 선택 목록에 "도급업체 (등록) / 계약에 입력된 도급업체 / 그 밖의 거래처" 묶음이 보인다
- [ ] "출력 회사명" 에서 **주식회사 삼성이엔지 / 한별상회 / 직접 입력** 을 바꾸면 출력물 맨 아래 회사명이 바뀐다 (창을 닫았다 다시 열어도 마지막 선택 유지)
- [ ] **수금 내역** (GAS 연결 필요): 대시보드 [수금 관리]에 입금을 등록한 계약에서 계약금(1회차) · 중도금(이후 입금 합산, 잔금이 남았을 때) · 잔금(미수/입금 완료)이 나뉘어 표시된다
  - 예) 총 36,300,000 · 입금 10,890,000 → 7,260,000 → 7,260,000 이면 계약금 10,890,000 / 중도금 14,520,000(2회) / 잔금 미수 10,890,000
  - GAS 를 연결하지 않으면 수금 내역은 "합계만 표시" 로 나옵니다.

---

## 5. 수정 후 다시 올리기

**GitHub Desktop**: 왼쪽에 변경 파일 표시 → Summary 입력 → **Commit to main** → 상단 **Push origin**

**명령어**
```bash
git add .
git commit -m "수정 내용 한 줄 설명"
git push
```

다른 PC 에서 최신본 받기: GitHub Desktop **Fetch/Pull origin** 또는 `git pull`

---

## 6. 문제 해결

| 증상 | 해결 |
|---|---|
| 화면이 "불러오는 중…" 에서 멈춤 | `index.html` 을 더블클릭으로 열지 말고 서버 스크립트로 접속. F12 → Console 에러 확인 |
| 라이브러리 로드 실패 | 인터넷 연결 확인 (회사 방화벽이 unpkg.com / cdn.jsdelivr.net 을 막는지) |
| 포트 3000 사용 중 | `서버_실행_Python.py` 의 `PORT = 3000` 을 3001 등으로 변경 |
| push 가 거부됨 (인증 실패) | 비밀번호 대신 Personal Access Token 사용, 또는 GitHub Desktop 로그인 |
| 한글 파일명이 `"\354\204..."` 로 보임 | `git config --global core.quotepath false` |
| `LF will be replaced by CRLF` 경고 | 정상 (윈도우 줄바꿈 자동 변환). 무시해도 됩니다 |
| 실수로 Public 으로 만들었다 | 저장소 Settings → 맨 아래 **Change visibility → Make private** |
| 수정했는데 화면에 반영 안 됨 | 브라우저 강력 새로고침 `Ctrl + Shift + R` |
