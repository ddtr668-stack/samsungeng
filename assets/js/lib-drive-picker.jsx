/* ═══════════════════════════════════════════════════════════════
   Google Drive Picker + 로컬 파일 하이브리드 · 엑셀 파싱 유틸

   기능:
   - loadXlsxLib()        : SheetJS(xlsx.js) 동적 로드
   - loadGoogleApis()     : Google API + GIS 스크립트 로드
   - pickFromDrive()      : Google Drive Picker 팝업으로 xlsx 선택 → Blob 반환
   - pickFromLocal()      : 로컬 파일 선택 다이얼로그 → Blob 반환
   - parseInstallXlsx()   : 설치비 내역서 xlsx → 항목 배열
   - parseProductXlsx()   : 제품내역서 xlsx → 항목 배열 + 요약
   - hasDriveCredentials(): API Key + Client ID 저장 여부
═══════════════════════════════════════════════════════════════ */

// ─── 인증 정보 관리 (localStorage) ───
const GDRIVE_KEYS = {
  apiKey: 'hb.gdrive.apiKey',
  clientId: 'hb.gdrive.clientId',
};

const getGDriveApiKey = () => (localStorage.getItem(GDRIVE_KEYS.apiKey) || '').trim();
const getGDriveClientId = () => (localStorage.getItem(GDRIVE_KEYS.clientId) || '').trim();
const setGDriveApiKey = (v) => v ? localStorage.setItem(GDRIVE_KEYS.apiKey, v.trim()) : localStorage.removeItem(GDRIVE_KEYS.apiKey);
const setGDriveClientId = (v) => v ? localStorage.setItem(GDRIVE_KEYS.clientId, v.trim()) : localStorage.removeItem(GDRIVE_KEYS.clientId);
const hasDriveCredentials = () => !!(getGDriveApiKey() && getGDriveClientId());

// ─── 스크립트 동적 로드 헬퍼 ───
const _loadedScripts = {};
function loadScript(src) {
  if (_loadedScripts[src]) return _loadedScripts[src];
  _loadedScripts[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('스크립트 로드 실패: ' + src));
    document.head.appendChild(s);
  });
  return _loadedScripts[src];
}

// ─── SheetJS(xlsx.js) 로드 (CDN 폴백 3중) ───
async function loadXlsxLib() {
  if (window.XLSX) return window.XLSX;
  const cdns = [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  ];
  let lastErr;
  for (const url of cdns) {
    try {
      await loadScript(url);
      if (window.XLSX) return window.XLSX;
    } catch (e) { lastErr = e; }
  }
  throw new Error('엑셀 라이브러리(XLSX) 로드 실패. 인터넷 연결을 확인해주세요.' + (lastErr ? ' (' + lastErr.message + ')' : ''));
}

// ─── Google API + GIS 로드 ───
let _gapiInited = false;
let _gisInited = false;
let _tokenClient = null;
let _accessToken = null;

async function loadGoogleApis() {
  if (!hasDriveCredentials()) {
    throw new Error('Google Drive 인증 정보가 설정되지 않았습니다. 설정 화면에서 API Key와 Client ID를 등록하세요.');
  }
  await Promise.all([
    loadScript('https://apis.google.com/js/api.js'),
    loadScript('https://accounts.google.com/gsi/client'),
  ]);
  // gapi 로드
  if (!_gapiInited) {
    await new Promise((resolve) => window.gapi.load('client:picker', resolve));
    await window.gapi.client.init({
      apiKey: getGDriveApiKey(),
      discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
    });
    _gapiInited = true;
  }
  // GIS 토큰 클라이언트 초기화
  if (!_gisInited) {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: getGDriveClientId(),
      // drive: 폴더 생성/수정 (SiteFoldersCard 에서 필요)
      // 기존 drive.readonly 로도 xlsx 다운로드는 가능하지만 폴더 생성을 위해 확장
      scope: 'https://www.googleapis.com/auth/drive',
      callback: '', // 매번 콜백 지정
    });
    _gisInited = true;
  }
}

// ─── OAuth 액세스 토큰 획득 ───
// 토큰을 받으면 gapi.client 에도 자동으로 주입 → gapi.client.drive.files.list 등이
// 인증된 요청을 보낼 수 있게 된다 (이걸 안 하면 400 Bad Request 발생)
function _applyTokenToGapi(token) {
  try {
    if (token && window.gapi?.client?.setToken) {
      window.gapi.client.setToken({ access_token: token });
    }
  } catch (e) { /* gapi.client 아직 미로드 */ }
}

function requestAccessToken() {
  return new Promise((resolve, reject) => {
    _tokenClient.callback = (resp) => {
      if (resp.error) {
        // resp.error 는 문자열 OR 객체일 수 있음
        // 예: 'popup_closed', 'access_denied', 'invalid_client', 'idpiframe_initialization_failed'
        const code = typeof resp.error === 'string' ? resp.error : (resp.error?.type || JSON.stringify(resp.error));
        const desc = resp.error_description || resp.error_uri || resp.details || '';
        // 코드별 사람이 읽을 수 있는 메시지
        const HUMAN = {
          'popup_closed_by_user': '사용자가 로그인 팝업을 닫았습니다. 다시 시도하세요.',
          'popup_closed': '로그인 팝업이 닫혔습니다. 팝업 차단 여부를 확인하세요.',
          'access_denied': 'Google 계정 접근이 거부되었습니다. OAuth 동의 화면의 테스트 사용자 목록에 로그인한 계정을 추가하세요.',
          'invalid_client': 'OAuth Client ID가 잘못되었거나, 승인된 JavaScript 원본에 현재 주소가 등록되지 않았습니다.',
          'idpiframe_initialization_failed': 'OAuth 초기화 실패 — Cloud Console에서 승인된 JavaScript 원본에 현재 주소를 등록했는지 확인하세요.',
          'immediate_failed': '자동 로그인에 실패했습니다. 팝업을 통해 다시 시도해주세요.',
          'unauthorized_client': '이 앱이 승인되지 않았습니다. OAuth 클라이언트 설정을 확인하세요.',
          'unsupported_response_type': 'OAuth 응답 유형이 지원되지 않습니다.',
        };
        const humanMsg = HUMAN[code] || `OAuth 실패: ${code}`;
        const full = desc ? `${humanMsg} · ${desc}` : humanMsg;
        // 원본 응답도 콘솔에 남김
        console.error('[OAuth] Token request failed', resp);
        return reject(new Error(full));
      }
      _accessToken = resp.access_token;
      _applyTokenToGapi(resp.access_token);
      resolve(resp.access_token);
    };
    // 이미 토큰 있으면 재사용 (silent), 없으면 팝업
    if (_accessToken) {
      _applyTokenToGapi(_accessToken);
      resolve(_accessToken);
    } else {
      // prompt: 'consent' → 매번 동의 화면 → 팝업 닫힘/차단 시 실패
      // 처음이면 'consent', 이후는 prompt 없이 silent 시도가 자연스러움
      _tokenClient.requestAccessToken({ prompt: 'consent' });
    }
  });
}

// ─── Drive Picker 열기 → 파일 선택 → Blob 다운로드 ───
// Google Picker DOM 을 찾아 z-index 를 최상위로 강제 (모달 backdrop · 리사이즈 가능한
// 모달의 transform 스태킹 컨텍스트 위). 최대 z-index 값(2147483647)을 써서 다른 어떤
// 요소보다도 반드시 위에 오도록 한다.
const PICKER_MAX_Z = 2147483647;
// 구글 피커가 창 위치를 window.screen(모니터 전체 해상도) 기준으로 계산하는 경우가 있어,
// 멀티 모니터·디스플레이 배율(125%/150% 등)이 섞인 환경에서는 다이얼로그가 실제 브라우저
// 뷰포트 밖으로 밀려나 보이는 문제가 있었다. z-index 강제와 같은 타이밍(뮤테이션 관찰)에
// 다이얼로그 위치도 함께 뷰포트 안으로 당겨온다.
function _forceZ(el) {
  try {
    const cls = String(el.className || (el.getAttribute && el.getAttribute('class')) || '');
    const isBg = /dialog-bg|picker-bg/i.test(cls);
    // 배경(반투명 딤드)은 다이얼로그보다 1 낮게 — 그래도 페이지의 다른 모든 요소보다는 위
    el.style.setProperty('z-index', isBg ? String(PICKER_MAX_Z - 1) : String(PICKER_MAX_Z), 'important');
    if (getComputedStyle(el).position === 'static') el.style.setProperty('position', 'fixed', 'important');

    if (isBg) {
      // 배경은 항상 브라우저 뷰포트 전체를 덮도록 강제 (잘못된 좌표로 계산되어도 무관하게)
      el.style.setProperty('position', 'fixed', 'important');
      el.style.setProperty('top', '0', 'important');
      el.style.setProperty('left', '0', 'important');
      el.style.setProperty('right', '0', 'important');
      el.style.setProperty('bottom', '0', 'important');
      el.style.setProperty('width', '100%', 'important');
      el.style.setProperty('height', '100%', 'important');
    } else if (/picker-dialog/i.test(cls) && !/content|buttons/i.test(cls)) {
      // 다이얼로그 본체: 계산된 위치가 실제 브라우저 창(뷰포트) 밖이면 안쪽으로 당겨온다
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const vw = window.innerWidth, vh = window.innerHeight;
        let left = rect.left, top = rect.top;
        if (rect.right > vw) left = Math.max(0, vw - rect.width);
        if (rect.bottom > vh) top = Math.max(0, vh - rect.height);
        if (left < 0) left = 0;
        if (top < 0) top = 0;
        if (Math.abs(left - rect.left) > 1 || Math.abs(top - rect.top) > 1) {
          el.style.setProperty('position', 'fixed', 'important');
          el.style.setProperty('left', Math.round(left) + 'px', 'important');
          el.style.setProperty('top', Math.round(top) + 'px', 'important');
          el.style.setProperty('margin', '0', 'important');
        }
      }
    }
  } catch (e) { /* ignore */ }
}
function forcePickerZIndex() {
  try {
    document.querySelectorAll(
      '.picker-dialog, .picker-dialog-bg, .picker-dialog-content, .picker-dialog-buttons, ' +
      '.picker, .picker-frame, .picker-tooltip, [class*="picker-dialog"], [class*="picker-frame"]'
    ).forEach(_forceZ);
  } catch (e) { /* ignore */ }
}
// setTimeout 몇 번만으로는 로딩이 느린 환경(네트워크 지연)에서 픽커가 늦게 그려지면
// z-index 적용 타이밍을 놓칠 수 있다. document.body 에 새로 삽입되는 노드를 감시해서
// 구글 피커가 실제로 DOM 에 나타나는 즉시(+ 잠깐의 지연 렌더링까지) z-index 를 강제한다.
function watchPickerZIndex() {
  forcePickerZIndex();
  let observer;
  try {
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes && m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const cls = String(n.className || '');
          if (/picker/i.test(cls)) _forceZ(n);
          if (n.querySelectorAll) n.querySelectorAll('[class*="picker"]').forEach(_forceZ);
        });
      }
      forcePickerZIndex();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (e) { /* ignore */ }
  // 안전망: 옵저버가 못 잡는 뒤늦은 스타일 변경 대비, 짧게 몇 번 더 강제
  const timers = [50, 150, 300, 600, 1000, 2000].map((ms) => setTimeout(forcePickerZIndex, ms));
  // 픽커가 열려있는 동안 창 크기를 바꾸거나(리사이즈) 다른 모니터로 옮기면
  // 다시 한 번 위치를 재계산해서 화면 밖으로 나가지 않도록 한다.
  const onResize = () => forcePickerZIndex();
  window.addEventListener('resize', onResize);
  return () => {
    try { observer && observer.disconnect(); } catch (e) {}
    timers.forEach(clearTimeout);
    window.removeEventListener('resize', onResize);
  };
}

// opts: { folderId?: string, title?: string } — folderId 가 있으면 Drive 전체가 아니라
// 그 폴더(보통 계약의 Drive 현장 폴더 하위 카테고리) 안에서만 파일을 고를 수 있도록 스코프한다.
async function pickFromDrive(opts) {
  const options = opts || {};
  await loadGoogleApis();
  const token = await requestAccessToken();

  // Picker UI 표시
  const fileId = await new Promise((resolve, reject) => {
    // folderId 가 있으면 DocsView 로 해당 폴더 안에서만 탐색(스코프)하고,
    // 없으면 기존처럼 전체 Drive에서 스프레드시트 검색 뷰를 사용한다.
    const view = options.folderId
      ? new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
          .setParent(options.folderId)
          .setIncludeFolders(false)
      : new window.google.picker.View(window.google.picker.ViewId.SPREADSHEETS);
    view.setMimeTypes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.google-apps.spreadsheet');

    // 업로드 뷰도 같은 폴더로 스코프 — 이 폴더가 비어 있어도 피커 안에서 바로
    // "업로드" 탭으로 새 엑셀 파일을 끌어다 놓으면 정확히 이 폴더에 저장된다.
    const uploadView = new window.google.picker.DocsUploadView();
    if (options.folderId) uploadView.setParent(options.folderId);

    const picker = new window.google.picker.PickerBuilder()
      .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
      .setAppId(getGDriveClientId().split('-')[0])
      .setOAuthToken(token)
      .addView(view)
      .addView(uploadView)
      .setDeveloperKey(getGDriveApiKey())
      .setTitle(options.title || '엑셀 파일 선택')
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0];
          // doc.url: 구글 피커가 주는 "이 파일 열기" 링크(구글시트는 편집화면, 일반 파일은 보기화면).
          // 목록에서 파일을 더블클릭해도, 단일클릭 후 Select를 눌러도 동일하게 PICKED 로 들어오며
          // 피커 자체는(구글이 만든 프레임이라) 우리 쪽에서 "열기 전용" 버튼을 따로 넣을 수 없어서,
          // 대신 이 url 을 돌려줘서 호출부(모달)에서 "🔗 파일 열기" 버튼으로 새 탭에 띄울 수 있게 한다.
          resolve({ id: doc.id, name: doc.name, mimeType: doc.mimeType, url: doc.url || null });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('취소되었습니다'));
        }
      })
      .build();
    picker.setVisible(true);
    // z-index 강제 (모달 backdrop · 드래그 중인 모달의 transform 스태킹 위로)
    const stopWatch = watchPickerZIndex();
    const _resolve = resolve, _reject = reject;
    resolve = (v) => { stopWatch(); _resolve(v); };
    reject = (e) => { stopWatch(); _reject(e); };
  });

  // 파일 다운로드 (Drive API)
  let downloadUrl, filename;
  if (fileId.mimeType === 'application/vnd.google-apps.spreadsheet') {
    // Google Sheets → xlsx로 export
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId.id}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    filename = fileId.name + '.xlsx';
  } else {
    // xlsx 파일 → 바로 다운로드
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId.id}?alt=media`;
    filename = fileId.name;
  }

  const res = await fetch(downloadUrl, {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (!res.ok) throw new Error('파일 다운로드 실패 (' + res.status + ')');
  const blob = await res.blob();
  return { blob, filename, url: fileId.url || `https://drive.google.com/file/d/${fileId.id}/view` };
}

// ─── 로컬 파일 선택 ───
function pickFromLocal() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    let handled = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
      window.removeEventListener('focus', onFocus);
    };

    input.onchange = () => {
      handled = true;
      const f = input.files && input.files[0];
      cleanup();
      if (!f) return reject(new Error('파일이 선택되지 않았습니다'));
      resolve({ blob: f, filename: f.name });
    };
    input.oncancel = () => {
      handled = true;
      cleanup();
      reject(new Error('취소되었습니다'));
    };

    // Fallback: 창 포커스 복귀 후에도 change 이벤트 없으면 취소로 간주
    const onFocus = () => {
      setTimeout(() => {
        if (!handled) {
          cleanup();
          reject(new Error('취소되었습니다'));
        }
      }, 500);
    };
    window.addEventListener('focus', onFocus, { once: true });

    input.click();
  });
}

// ─── xlsx → 2D 배열 로드 ───
async function xlsxToSheets(blob) {
  const XLSX = await loadXlsxLib();
  const buf = await blob.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets = {};
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
  }
  return { sheets, sheetNames: wb.SheetNames, firstSheet: sheets[wb.SheetNames[0]] };
}

const num = (v) => {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[,\s원]/g, ''));
  return isNaN(n) ? 0 : n;
};

// ─── 설치비 내역서 파서 ───
// 컬럼: A품목 B규격 C수량 D단위 E단가 F금액 G비고
// 헤더 1행, 데이터 2행부터, "합계" 행은 자동 제외
function parseInstallXlsx(sheet2d) {
  const items = [];
  for (let i = 1; i < sheet2d.length; i++) {
    const row = sheet2d[i];
    if (!row) continue;
    const name = String(row[0] || '').trim();
    if (!name) continue;
    // "합계" 행 제외
    if (name.includes('합계') || name.includes('합 계') || name.toLowerCase().includes('total')) continue;
    // 수량 또는 단가가 없으면 스킵
    const qty = num(row[2]);
    const unitPrice = num(row[4]);
    if (qty === 0 && unitPrice === 0 && num(row[5]) === 0) continue;
    items.push({
      name,
      spec: String(row[1] || '').trim(),
      qty: String(qty || ''),
      unit: String(row[3] || '식').trim(),
      unitPrice: String(unitPrice || ''),
      note: String(row[6] || '').trim(),
    });
  }
  return items;
}

// ─── 제품내역서 파서 ───
// 컬럼: A품명 B모델 C단위 D수량 E단가(=재료비) F금액 G출고가 H DC(할인율 0~1)
// 헤더 1-2행 병합, 데이터 3행부터
function parseProductXlsx(sheet2d) {
  const items = [];
  // 헤더가 1행 or 2행일 수 있으니, 첫 숫자 행부터 시작 검색
  let startRow = 2;
  for (let i = 0; i < Math.min(sheet2d.length, 5); i++) {
    const row = sheet2d[i];
    if (row && row[0] && num(row[3]) > 0) { startRow = i; break; }
  }
  for (let i = startRow; i < sheet2d.length; i++) {
    const row = sheet2d[i];
    if (!row) continue;
    const name = String(row[0] || '').trim();
    if (!name) continue;
    if (name.includes('합계')) continue;
    const qty = num(row[3]);
    const unitPrice = num(row[4]); // 재료비 단가 (DC 반영된 실단가)
    const amount = num(row[5]) || qty * unitPrice;
    const listPrice = num(row[6]); // 출고가 (정가)
    const dcRate = num(row[7]); // 0.47 등
    if (qty === 0 && unitPrice === 0 && amount === 0) continue;
    items.push({
      name,
      model: String(row[1] || '').trim(),
      unit: String(row[2] || '대').trim(),
      qty,
      unitPrice,        // 재료비 단가
      amount,           // 재료비 금액 = qty × unitPrice
      listPrice,        // 출고가 (정가) 단가
      listAmount: qty * listPrice, // 출고가 총액
      dcRate,           // 할인율 0~1
    });
  }
  // 요약 계산
  const totalMaterial = items.reduce((s, r) => s + r.amount, 0);      // 재료비 합계 (원가)
  const totalList = items.reduce((s, r) => s + r.listAmount, 0);      // 출고가 합계 (정가)
  const avgDc = items.length > 0
    ? items.reduce((s, r) => s + r.dcRate, 0) / items.length
    : 0;
  const effectiveDc = totalList > 0 ? 1 - (totalMaterial / totalList) : 0;
  return {
    items,
    summary: {
      totalMaterial,      // 재료비 합계 (장비대 A1로 사용)
      totalList,          // 출고가 합계
      dcRate: avgDc,      // 항목 DC율 평균
      effectiveDc,        // 실제 적용된 DC율 (총액 기준)
    },
  };
}

// ─── 도면용 Drive Picker: 모든 파일 타입 허용 → Drive 공유 링크 반환 ───
// (다운로드 없이 링크만 필요할 때 사용. 도면·사진·PDF 등)
async function pickDriveLink(opts) {
  const options = opts || {};
  await loadGoogleApis();
  const token = await requestAccessToken();

  return new Promise((resolve, reject) => {
    // 여러 뷰: 내 드라이브 + 최근 + 업로드
    const docsView = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    const uploadView = new window.google.picker.DocsUploadView();

    const picker = new window.google.picker.PickerBuilder()
      .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
      .setAppId(getGDriveClientId().split('-')[0])
      .setOAuthToken(token)
      .addView(docsView)
      .addView(uploadView)
      .setDeveloperKey(getGDriveApiKey())
      .setTitle(options.title || '도면 파일 선택')
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          const doc = data.docs[0];
          // Drive 공유 링크 형식으로 반환
          const url = doc.url || `https://drive.google.com/file/d/${doc.id}/view?usp=drivesdk`;
          resolve({
            id: doc.id,
            name: doc.name,
            mimeType: doc.mimeType,
            url,
          });
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('취소되었습니다'));
        }
      })
      .build();
    picker.setVisible(true);
    // 픽커 DOM에 z-index 강제 부여 (CSS 로드 순서·지연 렌더링에 관계없이 최상위 보장)
    const stopWatch = watchPickerZIndex();
    const _resolve = resolve, _reject = reject;
    resolve = (v) => { stopWatch(); _resolve(v); };
    reject = (e) => { stopWatch(); _reject(e); };
  });
}

// ─── 전역 노출 ───
Object.assign(window, {
  // 인증 정보
  getGDriveApiKey, setGDriveApiKey,
  getGDriveClientId, setGDriveClientId,
  hasDriveCredentials,
  // Picker
  pickFromDrive, pickFromLocal, pickDriveLink,
  // 파싱
  xlsxToSheets, parseInstallXlsx, parseProductXlsx,
  loadXlsxLib,
  // ─── SiteFoldersCard 등에서 재사용할 저수준 헬퍼 ───
  loadGoogleApis,
  requestAccessToken,
});
