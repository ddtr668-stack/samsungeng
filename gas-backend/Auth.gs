// ============================================================
// 로그인 · 공용 설정 저장 (DashboardApi.gs 와 같은 프로젝트에 추가)
// ============================================================
//
// ▶ 최초 1회: 관리자 비밀번호 설정
//   1. 아래 setAdminPassword() 함수의 NEW_PASSWORD 에 비밀번호를 입력
//   2. 편집기 상단에서 함수 "setAdminPassword" 선택 → ▶ 실행
//   3. 실행 로그에 "관리자 비밀번호가 설정되었습니다" 확인 후
//      NEW_PASSWORD 를 다시 '' 로 지우고 저장 (코드에 비밀번호를 남기지 않기 위함)
//   이후 비밀번호 변경은 대시보드 설정 화면에서 할 수 있습니다.
//
// ▶ 관리자 아이디 기본값은 admin 입니다.
//   바꾸려면 setAdminPassword() 의 NEW_ID 를 함께 입력하세요.
//
// ▶ 로그인 유지 기간: SESSION_DAYS_ (기본 30일)
// ============================================================

var SESSION_DAYS_ = 30;
var AUTH_ID_KEY_ = 'AUTH_ADMIN_ID';
var AUTH_HASH_KEY_ = 'AUTH_ADMIN_HASH';
var AUTH_SALT_KEY_ = 'AUTH_ADMIN_SALT';
var SESSION_PREFIX_ = 'SESS_';
var APP_SETTINGS_KEY_ = 'APP_SETTINGS';
// 브라우저가 달라도 공통으로 유지할 설정 항목
var APP_SETTINGS_FIELDS_ = ['sheetUrl', 'sheetName', 'driveApiKey', 'driveClientId'];
var LOGIN_MAX_FAILS_ = 10;        // 15분 동안 연속 실패 허용 횟수
var LOGIN_LOCK_SECONDS_ = 900;

// 편집기에서 직접 실행하는 함수 (위 설명 참고)
function setAdminPassword() {
  var NEW_ID = '';          // 비워두면 admin (또는 기존 아이디 유지)
  var NEW_PASSWORD = '';    // ← 여기에 입력 후 실행, 실행 뒤에는 다시 지우세요
  if (!NEW_PASSWORD) throw new Error('NEW_PASSWORD 에 비밀번호를 입력한 뒤 실행하세요.');
  if (NEW_PASSWORD.length < 6) throw new Error('비밀번호는 6자 이상으로 해주세요.');
  var props = PropertiesService.getScriptProperties();
  if (NEW_ID) props.setProperty(AUTH_ID_KEY_, NEW_ID.trim());
  storePassword_(NEW_PASSWORD);
  clearAllSessions_();
  Logger.log('관리자 비밀번호가 설정되었습니다. 아이디: ' + getAdminId_() + ' (NEW_PASSWORD 를 지우고 저장하세요)');
}

function getAdminId_() {
  return PropertiesService.getScriptProperties().getProperty(AUTH_ID_KEY_) || 'admin';
}

function hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '::' + password, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function storePassword_(password) {
  var salt = Utilities.getUuid();
  var props = PropertiesService.getScriptProperties();
  props.setProperty(AUTH_SALT_KEY_, salt);
  props.setProperty(AUTH_HASH_KEY_, hashPassword_(password, salt));
}

function checkPassword_(password) {
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty(AUTH_HASH_KEY_);
  var salt = props.getProperty(AUTH_SALT_KEY_);
  if (!hash || !salt) return false;
  return hashPassword_(String(password || ''), salt) === hash;
}

function isAuthConfigured_() {
  return !!PropertiesService.getScriptProperties().getProperty(AUTH_HASH_KEY_);
}

// ─── 세션 ───
function createSession_(id) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var exp = Date.now() + SESSION_DAYS_ * 24 * 3600 * 1000;
  PropertiesService.getScriptProperties().setProperty(SESSION_PREFIX_ + token, JSON.stringify({ id: id, exp: exp }));
  return { token: token, exp: exp };
}

function getSession_(token) {
  if (!token) return null;
  var raw = PropertiesService.getScriptProperties().getProperty(SESSION_PREFIX_ + token);
  if (!raw) return null;
  try {
    var s = JSON.parse(raw);
    if (!s.exp || s.exp < Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX_ + token);
      return null;
    }
    return s;
  } catch (err) {
    return null;
  }
}

function purgeExpiredSessions_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX_) !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); }
    catch (err) { props.deleteProperty(k); }
  });
}

function clearAllSessions_() {
  var props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX_) === 0) props.deleteProperty(k);
  });
}

// ─── API ───
function apiLogin_(payload) {
  var p = payload || {};
  if (!isAuthConfigured_()) {
    return errorOut_('관리자 비밀번호가 아직 설정되지 않았습니다. Apps Script 편집기에서 setAdminPassword 함수를 실행해 주세요.', 'AUTH_NOT_CONFIGURED');
  }
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('LOGIN_FAILS') || 0);
  if (fails >= LOGIN_MAX_FAILS_) {
    return errorOut_('로그인 실패가 너무 많습니다. 15분 후 다시 시도해 주세요.', 'AUTH_LOCKED');
  }
  var id = String(p.id || '').trim();
  if (id !== getAdminId_() || !checkPassword_(p.password)) {
    cache.put('LOGIN_FAILS', String(fails + 1), LOGIN_LOCK_SECONDS_);
    return errorOut_('아이디 또는 비밀번호가 올바르지 않습니다.', 'AUTH_FAILED');
  }
  cache.remove('LOGIN_FAILS');
  purgeExpiredSessions_();
  var s = createSession_(id);
  return jsonOut_({ ok: true, token: s.token, exp: s.exp, user: { id: id, role: 'admin' }, settings: readAppSettings_() });
}

function apiLogout_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX_ + token);
  return jsonOut_({ ok: true });
}

function apiChangePassword_(payload, session) {
  var p = payload || {};
  if (!checkPassword_(p.currentPassword)) return errorOut_('현재 비밀번호가 올바르지 않습니다.', 'AUTH_FAILED');
  var next = String(p.newPassword || '');
  if (next.length < 6) return errorOut_('새 비밀번호는 6자 이상으로 해주세요.', 'BAD_PASSWORD');
  storePassword_(next);
  // 다른 브라우저의 로그인은 모두 해제하고, 현재 브라우저는 새 세션 발급
  clearAllSessions_();
  var s = createSession_(session.id);
  return jsonOut_({ ok: true, token: s.token, exp: s.exp });
}

function readAppSettings_() {
  var raw = PropertiesService.getScriptProperties().getProperty(APP_SETTINGS_KEY_);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (err) { return {}; }
}

function apiGetAppSettings_() {
  return jsonOut_({ ok: true, settings: readAppSettings_() });
}

function apiSaveAppSettings_(payload) {
  var incoming = (payload && payload.settings) || {};
  var current = readAppSettings_();
  APP_SETTINGS_FIELDS_.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(incoming, f)) current[f] = String(incoming[f] == null ? '' : incoming[f]);
  });
  PropertiesService.getScriptProperties().setProperty(APP_SETTINGS_KEY_, JSON.stringify(current));
  return jsonOut_({ ok: true, settings: current });
}
