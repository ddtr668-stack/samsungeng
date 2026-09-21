/* ═══════════════════════════════════════════════════════════════
   Google Apps Script Web App API 클라이언트
   - localStorage에 저장된 API URL로 fetch
   - 미설정/실패 시 정적 JSON으로 fallback (오프라인 프리뷰용)
═══════════════════════════════════════════════════════════════ */

const API_URL_KEY = 'hb.apiUrl';
const API_CACHE_KEY = 'hb.dataCache';
const API_CACHE_TS_KEY = 'hb.dataCacheTs';

// ─── API URL 관리 ───
const getApiUrl = () => (localStorage.getItem(API_URL_KEY) || '').trim();
const setApiUrl = (url) => {
  const trimmed = (url || '').trim();
  if (trimmed) localStorage.setItem(API_URL_KEY, trimmed);
  else localStorage.removeItem(API_URL_KEY);
};
const hasApiUrl = () => !!getApiUrl();

// ─── 저수준 fetch ───
async function apiFetch(route, opts = {}) {
  const url = getApiUrl();
  if (!url) throw new Error('API URL이 설정되지 않았습니다. 설정 화면에서 GAS 웹앱 URL을 등록해주세요.');

  const method = opts.method || 'GET';
  const body = opts.body;

  // GAS 웹앱은 CORS preflight 회피를 위해 application/x-www-form-urlencoded 또는 text/plain을 선호
  // 또한 fetch에서 mode: 'no-cors'는 응답을 읽지 못하니 정상 CORS로 요청
  const qs = new URLSearchParams({ route });
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
  if (data.ok === false) throw new Error(data.error || '알 수 없는 오류');
  return data;
}

// ─── 고수준 API ───
const api = {
  ping: () => apiFetch('ping'),
  bootstrap: () => apiFetch('bootstrap'),
  listContracts: () => apiFetch('contracts'),
  getContract: (no) => apiFetch('contract', { params: { no } }),
  updateContract: (no, patch) => apiFetch('update', { method:'POST', body:{ no, patch } }),
  createContract: (contract) => apiFetch('create', { method:'POST', body:{ contract } }),
  listClients: () => apiFetch('clients'),
  expenseHistory: () => apiFetch('expenseHistory'),
  generateExpensePdf: (row, payload) => apiFetch('expensePdf', { method:'POST', body:{ row, payload } }),
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

  if (hasApiUrl()) {
    try {
      const data = ensureIds(await api.bootstrap());
      const enriched = { ...data, _source: 'api', _fetchedAt: Date.now() };
      cache.set(enriched);
      return { data: enriched, source: 'api' };
    } catch (e) {
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
    return { data: null, source: null, errors };
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
  setApiUrl,
  hasApiUrl,
  apiCache: cache,
});
