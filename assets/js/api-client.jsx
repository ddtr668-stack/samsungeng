/* ═══════════════════════════════════════════════════════════════
   Google Apps Script Web App API 클라이언트
   - localStorage에 저장된 API URL로 fetch
   - 미설정/실패 시 정적 JSON으로 fallback (오프라인 프리뷰용)
═══════════════════════════════════════════════════════════════ */

const API_URL_KEY = 'hb.apiUrl';
const API_CACHE_KEY = 'hb.dataCache';
const API_CACHE_TS_KEY = 'hb.dataCacheTs';
const SHEET_URL_KEY = 'hb.sheetUrl';
const SHEET_NAME_KEY = 'hb.sheetName';

// 기본값 (기존 하드코딩 값 - 사용자가 재설정하면 덮어씀)
const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1rUq7yu0pHrp-rln4JjGIslIib_d033ZuzwLD6odtORs/edit';
const DEFAULT_SHEET_NAME = '계약관리_v1.3';

// ─── API URL 관리 ───
// 모든 브라우저 공통 URL 은 assets/config.js 의 apiUrl, 이 브라우저에서만 바꾸려면 설정 화면에서 저장
const getConfigApiUrl = () => ((window.APP_CONFIG && window.APP_CONFIG.apiUrl) || '').trim();
const getApiUrl = () => (localStorage.getItem(API_URL_KEY) || getConfigApiUrl()).trim();
const setApiUrl = (url) => {
  const trimmed = (url || '').trim();
  if (trimmed) localStorage.setItem(API_URL_KEY, trimmed);
  else localStorage.removeItem(API_URL_KEY);
};
const hasApiUrl = () => !!getApiUrl();

// ─── 스프레드시트 정보 관리 (표시·바로가기용) ───
const getSheetUrl = () => (localStorage.getItem(SHEET_URL_KEY) || DEFAULT_SHEET_URL).trim();
const setSheetUrl = (url) => {
  const trimmed = (url || '').trim();
  if (trimmed) localStorage.setItem(SHEET_URL_KEY, trimmed);
  else localStorage.removeItem(SHEET_URL_KEY);
};
const getSheetName = () => (localStorage.getItem(SHEET_NAME_KEY) || DEFAULT_SHEET_NAME).trim();
const setSheetName = (name) => {
  const trimmed = (name || '').trim();
  if (trimmed) localStorage.setItem(SHEET_NAME_KEY, trimmed);
  else localStorage.removeItem(SHEET_NAME_KEY);
};

// ─── 로그인 토큰 ───
const AUTH_TOKEN_KEY = 'hb.authToken';
const AUTH_USER_KEY = 'hb.authUser';
const getAuthToken = () => { try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; } };
const getAuthUser = () => { try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY)) || null; } catch { return null; } };
const setAuth = (token, user) => {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token); else localStorage.removeItem(AUTH_TOKEN_KEY);
  if (user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); else localStorage.removeItem(AUTH_USER_KEY);
};
const isLoggedIn = () => !!getAuthToken();

// ─── 공용 설정 (서버에 저장 → 어느 브라우저에서 로그인해도 동일) ───
const SYNCED_SETTINGS = {
  sheetUrl: SHEET_URL_KEY,
  sheetName: SHEET_NAME_KEY,
  driveApiKey: 'hb.gdrive.apiKey',
  driveClientId: 'hb.gdrive.clientId',
};
function applyServerSettings(settings) {
  if (!settings) return;
  Object.entries(SYNCED_SETTINGS).forEach(([field, key]) => {
    if (!Object.prototype.hasOwnProperty.call(settings, field)) return;
    const v = (settings[field] || '').trim();
    if (v) localStorage.setItem(key, v); else localStorage.removeItem(key);
  });
}
async function pushAppSettings() {
  const settings = {};
  Object.entries(SYNCED_SETTINGS).forEach(([field, key]) => { settings[field] = localStorage.getItem(key) || ''; });
  return apiFetch('saveAppSettings', { method:'POST', body:{ settings } });
}

// ─── 저수준 fetch ───
async function apiFetch(route, opts = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('API URL이 설정되지 않았습니다. 설정 화면에서 GAS 웹앱 URL을 등록해주세요.');

  const method = opts.method || 'GET';
  const body = opts.body;

  // GAS 웹앱은 CORS preflight 회피를 위해 application/x-www-form-urlencoded 또는 text/plain을 선호
  // 또한 fetch에서 mode: 'no-cors'는 응답을 읽지 못하니 정상 CORS로 요청
  const qs = new URLSearchParams({ route });
  const token = getAuthToken();
  if (token) qs.set('token', token);
  if (opts.params) Object.entries(opts.params).forEach(([k,v]) => qs.set(k, v));

  let fetchUrl = url + (url.includes('?') ? '&' : '?') + qs.toString();
  const fetchOpts = { method, redirect: 'follow' };

  if (method === 'POST') {
    // GAS webapp: text/plain 본문 사용 시 preflight 없이 통과
    fetchOpts.body = JSON.stringify(body || {});
    fetchOpts.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
  }

  const res = await fetch(fetchUrl, fetchOpts);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error('응답이 JSON이 아닙니다. GAS 웹앱이 로그인 페이지로 리다이렉트됐거나 접근 권한이 없습니다.\n원문: ' + text.substring(0,200)); }
  if (data.ok === false) {
    if (data.code === 'AUTH_REQUIRED') {
      setAuth(null, null);
      window.dispatchEvent(new Event('hb:auth-required'));
    }
    const err = new Error(data.error || '알 수 없는 오류');
    err.code = data.code;
    throw err;
  }
  return data;
}

// ─── 고수준 API ───
const api = {
  ping: () => apiFetch('ping'),
  // ─── 로그인 · 공용 설정 ───
  async login(id, password) {
    const r = await apiFetch('login', { method:'POST', body:{ id, password } });
    setAuth(r.token, r.user);
    applyServerSettings(r.settings);
    return r;
  },
  async logout() {
    const token = getAuthToken();
    setAuth(null, null);
    cache.clear();
    if (token) { try { await apiFetch('logout', { params:{ token } }); } catch {} }
  },
  async changePassword(currentPassword, newPassword) {
    const r = await apiFetch('changePassword', { method:'POST', body:{ currentPassword, newPassword } });
    setAuth(r.token, getAuthUser());
    return r;
  },
  getAppSettings: () => apiFetch('appSettings'),
  saveAppSettings: pushAppSettings,
  bootstrap: () => apiFetch('bootstrap'),
  listContracts: () => apiFetch('contracts'),
  getContract: (no) => apiFetch('contract', { params: { no } }),
  updateContract: (no, patch) => apiFetch('update', { method:'POST', body:{ no, patch } }),
  createContract: (contract) => apiFetch('create', { method:'POST', body:{ contract } }),
  listClients: () => apiFetch('clients'),
  expenseHistory: () => apiFetch('expenseHistory'),
  generateExpensePdf: (row, payload) => apiFetch('expensePdf', { method:'POST', body:{ row, payload } }),
  // ─── 수금 누적 관리 ───
  listPayments: (contractNo) => apiFetch('payments', { params: { contractNo } }),
  createPayment: (payload) => apiFetch('createPayment', { method:'POST', body: payload }),
  updatePayment: (payload) => apiFetch('updatePayment', { method:'POST', body: payload }),
  deletePayment: (no) => apiFetch('deletePayment', { method:'POST', body: { no } }),
  // ─── 지출품의서 확장 ───
  expenseByContract: (contractNo) => apiFetch('expenseByContract', { params: { contractNo } }),
  saveExpense: (payload) => apiFetch('saveExpense', { method:'POST', body: payload }),
  // 저장된 지출품의서 회차(설치비 기성) 삭제(취소 처리) — payload: { contractNo, no }
  cancelExpenseRound: (payload) => apiFetch('cancelExpenseRound', { method:'POST', body: payload }),
  // 도급업체 신규 등록/정보 수정 저장 (도급업체 등록 시트 + 거래처관리 시트에 함께 반영)
  saveSubcontractor: (payload) => apiFetch('saveSubcontractor', { method:'POST', body: payload }),
  // 거래처 정보 수정/신규 등록 저장 (거래처관리 시트에만 반영)
  saveClient: (payload) => apiFetch('saveClient', { method:'POST', body: payload }),
  // ─── 변경 이력 (상단바 🔔) ───
  changeLog: () => apiFetch('changeLog'),
  // ─── 자동 백업(30일 보관) ───
  getBackupSettings: () => apiFetch('backupSettings'),
  saveBackupSettings: (payload) => apiFetch('saveBackupSettings', { method:'POST', body: payload }),
  listBackups: () => apiFetch('backupList'),
  runBackupNow: () => apiFetch('runBackupNow', { method:'POST', body:{} }),
  restoreBackup: (payload) => apiFetch('restoreBackup', { method:'POST', body: payload }),
};

// ─── 캐시 관리 ───
const cache = {
  set(data) {
    try {
      localStorage.setItem(API_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(API_CACHE_TS_KEY, String(Date.now()));
    } catch (e) { /* quota exceeded 무시 */ }
  },
  get() {
    try {
      const raw = localStorage.getItem(API_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  ts() {
    const t = localStorage.getItem(API_CACHE_TS_KEY);
    return t ? Number(t) : 0;
  },
  clear() {
    localStorage.removeItem(API_CACHE_KEY);
    localStorage.removeItem(API_CACHE_TS_KEY);
  }
};

// ─── 초기 데이터 로더 ───
// 우선순위: (1) API 시도 → (2) 캐시 → (3) 정적 JSON
function ensureIds(data) {
  if (data && Array.isArray(data.contracts)) {
    data.contracts.forEach((c, i) => { if (c.id == null) c.id = i + 1; });
  }
  return data;
}

async function loadInitialData() {
  const errors = [];

  // 로그인 전에는 데이터를 불러오지 않음 (서버 주소가 없으면 로그인 화면에서 입력)
  if (!hasApiUrl() || !isLoggedIn()) return { data: null, source: null, needLogin: true, errors };

  if (hasApiUrl()) {
    try {
      const [boot, st] = await Promise.all([api.bootstrap(), api.getAppSettings().catch(() => null)]);
      if (st) applyServerSettings(st.settings);
      const data = ensureIds(boot);
      const enriched = { ...data, _source: 'api', _fetchedAt: Date.now() };
      cache.set(enriched);
      return { data: enriched, source: 'api' };
    } catch (e) {
      if (e.code === 'AUTH_REQUIRED') return { data: null, source: null, needLogin: true, errors };
      errors.push('API 오류: ' + e.message);
    }
  }

  // 캐시가 있으면 사용
  const cached = ensureIds(cache.get());
  if (cached) {
    return { data: { ...cached, _source: 'cache', _cacheTs: cache.ts() }, source: 'cache', errors };
  }

  // 마지막 fallback: 정적 JSON (브라우저 캐시 회피)
  try {
    const res = await fetch('assets/data/app-data.json?v=' + Date.now(), { cache: 'no-cache' });
    if (!res.ok) throw new Error('static JSON 로드 실패');
    const data = await res.json();
    // 안전장치: contracts에 id가 없으면 index로 부여
    if (Array.isArray(data.contracts)) {
      data.contracts.forEach((c, i) => { if (c.id == null) c.id = i + 1; });
    }
    return { data: { ...data, _source: 'static' }, source: 'static', errors };
  } catch (e) {
    errors.push('정적 데이터 로드 실패: ' + e.message);
    // 정적 JSON 없이 배포된 경우(공개 저장소): 빈 데이터로 앱을 띄우고 설정 화면으로 안내
    const empty = {
      meta: {}, summary: { totalAmount: 0, paidAmount: 0, balance: 0, profit: 0, statusCounts: {} },
      contracts: [], clients: [], clientStats: [], categoryStats: [],
      monthlyStats: [], topBalance: [], expenseHistory: [],
    };
    return { data: { ...empty, _source: 'empty' }, source: 'empty', errors };
  }
}

// ─── 데이터 refresh ───
async function refreshData() {
  if (!hasApiUrl()) throw new Error('API URL이 설정되지 않았습니다.');
  const data = ensureIds(await api.bootstrap());
  const enriched = { ...data, _source: 'api', _fetchedAt: Date.now() };
  cache.set(enriched);
  return enriched;
}

// Global
Object.assign(window, {
  apiClient: api,
  loadInitialData,
  refreshData,
  getApiUrl,
  getConfigApiUrl,
  setApiUrl,
  getAuthToken,
  getAuthUser,
  isLoggedIn,
  pushAppSettings,
  hasApiUrl,
  getSheetUrl,
  setSheetUrl,
  getSheetName,
  setSheetName,
  apiCache: cache,
});
