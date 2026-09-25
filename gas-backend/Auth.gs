// ============================================================
// 로그인 · 사용자(담당자) · 권한 · 공용 설정 (DashboardApi.gs 와 같은 프로젝트에 추가)
// ============================================================
//
// ※ 다른 .gs 파일과 이름이 겹치지 않도록 모든 이름에 SG_ 를 붙였습니다.
//
// ▶ 최초 1회: 관리자 비밀번호 설정 (이미 했다면 다시 할 필요 없음)
//   1. 아래 SG_setAdminPassword() 함수의 NEW_PASSWORD 에 비밀번호를 입력
//   2. 편집기 상단에서 함수 "SG_setAdminPassword" 선택 → ▶ 실행
//   3. 실행 로그 확인 후 NEW_PASSWORD 를 다시 '' 로 지우고 저장
//
// ▶ 사용자
//   - 누구나 로그인 화면의 "회원가입"으로 신청 (아이디·비밀번호·이름·전화번호·부서명)
//   - 관리자가 설정 → 사용자 관리에서 승인하고 권한을 지정해야 로그인 가능
//   - 권한: admin(관리자) · editor(편집) · viewer(조회)
//           + ownOnly: 본인이 담당자인 계약만 보기/수정
//
// ▶ 계약 담당자: 스프레드시트의 "계약담당자" 시트 (계약번호 · 담당자 · 담당자번호)
//   자동 생성되며, 기존 계약은 모두 SG_DEFAULT_MANAGER_ 로 채워집니다.
//   화면에는 담당자별 번호 "이상규-001" 로 표시 (담당자가 바뀌면 새 담당자의 다음 번호)
// ============================================================

var SG_SESSION_DAYS_ = 30;
var SG_USERS_KEY_ = 'SG_USERS';
var SG_SESSION_PREFIX_ = 'SG_SESS_';
var SG_APP_SETTINGS_KEY_ = 'SG_APP_SETTINGS';
var SG_APP_SETTINGS_FIELDS_ = ['sheetUrl', 'sheetName', 'driveApiKey', 'driveClientId'];
var SG_LOGIN_MAX_FAILS_ = 10;        // 15분 동안 연속 실패 허용 횟수
var SG_LOGIN_LOCK_SECONDS_ = 900;
var SG_DEFAULT_MANAGER_ = '이상규';   // 담당자가 지정되지 않은 계약의 기본 담당자
var SG_ADMIN_DEFAULT_NAME_ = '이상규';
var SG_MANAGER_SHEET_ = '계약담당자';
var SG_ROLES_ = { admin: '관리자', editor: '편집', viewer: '조회' };

// 편집기에서 직접 실행하는 함수 (위 설명 참고)
function SG_setAdminPassword() {
  var NEW_ID = '';          // 비워두면 admin (또는 기존 관리자 아이디 유지)
  var NEW_PASSWORD = '';    // ← 여기에 입력 후 실행, 실행 뒤에는 다시 지우세요
  if (!NEW_PASSWORD) throw new Error('NEW_PASSWORD 에 비밀번호를 입력한 뒤 실행하세요.');
  if (NEW_PASSWORD.length < 6) throw new Error('비밀번호는 6자 이상으로 해주세요.');
  var users = SG_loadUsers_();
  var id = (NEW_ID || '').trim() || SG_firstAdminId_(users) || 'admin';
  var u = users[id] || { id: id, name: SG_ADMIN_DEFAULT_NAME_, phone: '', dept: '', createdAt: new Date().toISOString() };
  u.role = 'admin'; u.ownOnly = false; u.status = 'active';
  SG_setUserPassword_(u, NEW_PASSWORD);
  users[id] = u;
  SG_saveUsers_(users);
  SG_clearSessions_(id);
  Logger.log('관리자 비밀번호가 설정되었습니다. 아이디: ' + id + ' (NEW_PASSWORD 를 지우고 저장하세요)');
}

// 로그인이 안 될 때 편집기에서 실행해 확인 (ID·PASSWORD 입력 → 실행 → 로그 확인 → 다시 지우기)
function SG_checkLogin() {
  var ID = 'admin';
  var PASSWORD = '';
  Logger.log('배포 코드 버전: ' + (typeof BUILD_VERSION_ !== 'undefined' ? BUILD_VERSION_ : '(DashboardApi.gs 없음)'));
  var users = SG_loadUsers_();
  Logger.log('등록 사용자: ' + Object.keys(users).map(function (k) { return k + '(' + users[k].role + '/' + users[k].status + ')'; }).join(', '));
  var u = users[ID];
  Logger.log(ID + ' 존재: ' + !!u);
  if (u && PASSWORD) Logger.log('입력한 비밀번호 일치: ' + SG_checkUserPassword_(u, PASSWORD));
  CacheService.getScriptCache().remove('SG_LOGIN_FAILS');
  Logger.log('로그인 실패 잠금 해제됨');
}

// ─── 사용자 저장소 (Script Properties) ───
function SG_loadUsers_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(SG_USERS_KEY_);
  var users = {};
  if (raw) { try { users = JSON.parse(raw) || {}; } catch (err) { users = {}; } }
  // 이전 버전(관리자 1명)에서 옮겨오기
  var oldHash = props.getProperty('SG_AUTH_ADMIN_HASH');
  if (oldHash) {
    var oldId = props.getProperty('SG_AUTH_ADMIN_ID') || 'admin';
    if (!users[oldId]) {
      users[oldId] = {
        id: oldId, name: SG_ADMIN_DEFAULT_NAME_, phone: '', dept: '',
        role: 'admin', ownOnly: false, status: 'active',
        salt: props.getProperty('SG_AUTH_ADMIN_SALT'), hash: oldHash,
        createdAt: new Date().toISOString()
      };
    }
    SG_saveUsers_(users);
    props.deleteProperty('SG_AUTH_ADMIN_HASH');
    props.deleteProperty('SG_AUTH_ADMIN_SALT');
    props.deleteProperty('SG_AUTH_ADMIN_ID');
  }
  return users;
}

function SG_saveUsers_(users) {
  PropertiesService.getScriptProperties().setProperty(SG_USERS_KEY_, JSON.stringify(users));
}

function SG_firstAdminId_(users) {
  var ids = Object.keys(users).filter(function (k) { return users[k].role === 'admin'; });
  return ids.length ? ids[0] : null;
}

function SG_hashPassword_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '::' + password, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function SG_setUserPassword_(u, password) {
  u.salt = Utilities.getUuid();
  u.hash = SG_hashPassword_(String(password), u.salt);
}

function SG_checkUserPassword_(u, password) {
  if (!u || !u.hash || !u.salt) return false;
  return SG_hashPassword_(String(password || ''), u.salt) === u.hash;
}

// 브라우저로 보내는 사용자 정보 (비밀번호 해시 제외)
function SG_publicUser_(u) {
  return {
    id: u.id, name: u.name || '', phone: u.phone || '', dept: u.dept || '',
    role: u.role || 'viewer', roleLabel: SG_ROLES_[u.role] || '조회',
    ownOnly: !!u.ownOnly, status: u.status || 'pending', createdAt: u.createdAt || ''
  };
}

// ─── 세션 ───
function SG_createSession_(id) {
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var exp = Date.now() + SG_SESSION_DAYS_ * 24 * 3600 * 1000;
  PropertiesService.getScriptProperties().setProperty(SG_SESSION_PREFIX_ + token, JSON.stringify({ id: id, exp: exp }));
  return { token: token, exp: exp };
}

// 토큰 → 현재 사용자 (권한 변경·사용 중지가 즉시 반영되도록 매 요청마다 사용자 정보를 다시 읽음)
function SG_getSessionUser_(token) {
  if (!token) return null;
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(SG_SESSION_PREFIX_ + token);
  if (!raw) return null;
  var s;
  try { s = JSON.parse(raw); } catch (err) { return null; }
  if (!s.exp || s.exp < Date.now()) { props.deleteProperty(SG_SESSION_PREFIX_ + token); return null; }
  var u = SG_loadUsers_()[s.id];
  if (!u || u.status !== 'active') { props.deleteProperty(SG_SESSION_PREFIX_ + token); return null; }
  return u;
}

function SG_purgeExpiredSessions_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SG_SESSION_PREFIX_) !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); }
    catch (err) { props.deleteProperty(k); }
  });
}

// id 를 주면 그 사용자의 세션만, 없으면 전체
function SG_clearSessions_(id) {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SG_SESSION_PREFIX_) !== 0) return;
    if (!id) { props.deleteProperty(k); return; }
    try { if (JSON.parse(all[k]).id === id) props.deleteProperty(k); }
    catch (err) { props.deleteProperty(k); }
  });
}

// ─── 권한 ───
// 쓰기 요청 (조회 권한은 불가)
var SG_WRITE_ROUTES_ = ['update', 'create', 'saveClient', 'saveSubcontractor', 'expensePdf',
  'createPayment', 'updatePayment', 'deletePayment', 'saveExpense', 'cancelExpenseRound'];
// 관리자 전용
var SG_ADMIN_ROUTES_ = ['saveAppSettings', 'backupSettings', 'saveBackupSettings', 'backupList',
  'runBackupNow', 'restoreBackup', 'users', 'updateUser', 'deleteUser', 'setManager'];

function SG_checkPermission_(route, user) {
  if (SG_ADMIN_ROUTES_.indexOf(route) >= 0 && user.role !== 'admin') return '관리자만 사용할 수 있는 기능입니다.';
  if (SG_WRITE_ROUTES_.indexOf(route) >= 0 && user.role === 'viewer') return '조회 권한만 있습니다. 수정·등록은 관리자에게 권한을 요청하세요.';
  return null;
}

// ownOnly 사용자가 다른 담당자의 계약에 접근하는지 확인
function SG_canAccessContract_(user, contractNo) {
  if (!user.ownOnly || user.role === 'admin') return true;
  var no = Number(contractNo);
  if (!no) return true;
  return SG_getManagerOf_(no) === (user.name || '');
}

// 요청 본문/파라미터에서 계약번호 추출
function SG_contractNoOf_(route, params, payload) {
  var p = payload || {};
  if (route === 'contract') return params.no || p.no;
  if (route === 'update') return p.no;
  if (route === 'payments' || route === 'expenseByContract') return params.contractNo || p.contractNo;
  if (route === 'createPayment' || route === 'updatePayment' || route === 'saveExpense' || route === 'cancelExpenseRound') return p.contractNo;
  return null;
}

// ─── 계약 담당자 시트 (계약번호 · 담당자 · 담당자번호) ───
// 담당자번호: 담당자마다 따로 매기는 번호 → 화면에는 "이상규-001" 처럼 표시
// 내부 계약번호(NO)는 그대로 두므로 수금·지출 기록은 영향 없음
function SG_getManagerSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SG_MANAGER_SHEET_);
  if (!sh) {
    sh = ss.insertSheet(SG_MANAGER_SHEET_);
    sh.setFrozenRows(1);
  }
  if (String(sh.getRange(1, 3).getValue() || '') !== '담당자번호') {
    sh.getRange(1, 1, 1, 3).setValues([['계약번호', '담당자', '담당자번호']]).setFontWeight('bold');
  }
  return sh;
}

// 시트 전체 읽기 → { no: { name, seq, row } }
function SG_readManagerRows_(sh) {
  var last = sh.getLastRow();
  var map = {};
  if (last < 2) return map;
  sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r, i) {
    var no = Number(r[0]);
    if (!no || (no in map)) return;
    map[no] = { name: String(r[1] || '').trim() || SG_DEFAULT_MANAGER_, seq: Number(r[2]) || 0, row: i + 2 };
  });
  return map;
}

function SG_readManagers_() {
  var map = SG_readManagerRows_(SG_getManagerSheet_());
  var out = {};
  Object.keys(map).forEach(function (no) { out[no] = map[no].name; });
  return out;
}

function SG_maxSeq_(map, name) {
  var max = 0;
  Object.keys(map).forEach(function (no) { if (map[no].name === name && map[no].seq > max) max = map[no].seq; });
  return max;
}

// 시트에 없는 계약(기본 담당자로 추가)과 번호가 비어 있는 행을 채움 (계약번호 순)
function SG_syncManagers_(contracts) {
  var sh = SG_getManagerSheet_();
  var map = SG_readManagerRows_(sh);
  var nos = [];
  var seen = {};
  contracts.forEach(function (c) { var n = Number(c.no); if (n && !seen[n]) { seen[n] = true; nos.push(n); } });
  nos.sort(function (a, b) { return a - b; });

  var appends = [];
  var fills = [];
  nos.forEach(function (no) {
    var m = map[no];
    if (m && m.seq) return;
    var name = m ? m.name : SG_DEFAULT_MANAGER_;
    var seq = SG_maxSeq_(map, name) + 1;
    if (m) { m.seq = seq; fills.push(m); }
    else { map[no] = { name: name, seq: seq, row: 0 }; appends.push([no, name, seq]); }
  });
  fills.forEach(function (m) { sh.getRange(m.row, 3).setValue(m.seq); });
  if (appends.length) sh.getRange(sh.getLastRow() + 1, 1, appends.length, 3).setValues(appends);
  return map;
}

function SG_getManagerOf_(no) {
  return SG_readManagers_()[Number(no)] || SG_DEFAULT_MANAGER_;
}

// 담당자 지정 (바뀌면 새 담당자의 다음 번호를 부여) → { name, seq }
function SG_setManagerOf_(no, name) {
  var sh = SG_getManagerSheet_();
  var map = SG_readManagerRows_(sh);
  no = Number(no);
  var m = map[no];
  if (m && m.name === name && m.seq) return { name: name, seq: m.seq };
  var seq = SG_maxSeq_(map, name) + 1;
  var last = sh.getLastRow();
  var found = false;
  if (last >= 2) {
    var col = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      if (Number(col[i][0]) === no) { sh.getRange(i + 2, 2, 1, 2).setValues([[name, seq]]); found = true; }
    }
  }
  if (!found) sh.appendRow([no, name, seq]);
  return { name: name, seq: seq };
}

function SG_managerCode_(name, seq) {
  return name + '-' + ('00' + seq).slice(-Math.max(3, String(seq).length));
}

// 계약 목록에 담당자·담당자번호를 붙이고, ownOnly 사용자는 본인 담당만 남김
function SG_applyManagers_(contracts, user) {
  var map = SG_syncManagers_(contracts);
  contracts.forEach(function (c) {
    var m = map[Number(c.no)] || { name: SG_DEFAULT_MANAGER_, seq: 0 };
    c.manager = m.name;
    c.managerNo = m.seq;
    c.managerCode = m.seq ? SG_managerCode_(m.name, m.seq) : '';
  });
  if (user && user.ownOnly && user.role !== 'admin') {
    return contracts.filter(function (c) { return c.manager === (user.name || ''); });
  }
  return contracts;
}

// ─── API ───
function SG_apiLogin_(payload) {
  var p = payload || {};
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('SG_LOGIN_FAILS') || 0);
  if (fails >= SG_LOGIN_MAX_FAILS_) {
    return errorOut_('로그인 실패가 너무 많습니다. 15분 후 다시 시도해 주세요.', 'AUTH_LOCKED');
  }
  var users = SG_loadUsers_();
  if (!Object.keys(users).length) {
    return errorOut_('관리자 비밀번호가 아직 설정되지 않았습니다. Apps Script 편집기에서 SG_setAdminPassword 함수를 실행해 주세요.', 'AUTH_NOT_CONFIGURED');
  }
  var id = String(p.id || '').trim();
  var u = users[id];
  if (!u || !SG_checkUserPassword_(u, p.password)) {
    cache.put('SG_LOGIN_FAILS', String(fails + 1), SG_LOGIN_LOCK_SECONDS_);
    return errorOut_('아이디 또는 비밀번호가 올바르지 않습니다.', 'AUTH_FAILED');
  }
  if (u.status === 'pending') return errorOut_('가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있습니다.', 'AUTH_PENDING');
  if (u.status !== 'active') return errorOut_('사용이 중지된 계정입니다. 관리자에게 문의하세요.', 'AUTH_DISABLED');
  cache.remove('SG_LOGIN_FAILS');
  SG_purgeExpiredSessions_();
  var s = SG_createSession_(id);
  return jsonOut_({ ok: true, token: s.token, exp: s.exp, user: SG_publicUser_(u), settings: SG_readAppSettings_() });
}

function SG_apiSignup_(payload) {
  var p = payload || {};
  var id = String(p.id || '').trim();
  var name = String(p.name || '').trim();
  var phone = String(p.phone || '').trim();
  var dept = String(p.dept || '').trim();
  if (!/^[A-Za-z0-9._-]{3,20}$/.test(id)) return errorOut_('아이디는 영문·숫자 3~20자로 입력해 주세요.', 'BAD_INPUT');
  if (String(p.password || '').length < 6) return errorOut_('비밀번호는 6자 이상으로 해주세요.', 'BAD_INPUT');
  if (!name) return errorOut_('이름을 입력해 주세요.', 'BAD_INPUT');
  if (!/^[0-9-]{9,14}$/.test(phone)) return errorOut_('전화번호를 확인해 주세요. (예: 010-1234-5678)', 'BAD_INPUT');
  if (!dept) return errorOut_('부서명을 입력해 주세요.', 'BAD_INPUT');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var users = SG_loadUsers_();
    if (users[id]) return errorOut_('이미 사용 중인 아이디입니다.', 'DUPLICATE_ID');
    if (Object.keys(users).filter(function (k) { return users[k].status === 'pending'; }).length >= 30) {
      return errorOut_('승인 대기 중인 가입 신청이 너무 많습니다. 관리자에게 문의하세요.', 'TOO_MANY_PENDING');
    }
    var u = { id: id, name: name, phone: phone, dept: dept, role: 'viewer', ownOnly: true, status: 'pending', createdAt: new Date().toISOString() };
    SG_setUserPassword_(u, p.password);
    users[id] = u;
    SG_saveUsers_(users);
  } finally {
    lock.releaseLock();
  }
  return jsonOut_({ ok: true, message: '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.' });
}

function SG_apiLogout_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty(SG_SESSION_PREFIX_ + token);
  return jsonOut_({ ok: true });
}

function SG_apiChangePassword_(payload, user) {
  var p = payload || {};
  if (!SG_checkUserPassword_(user, p.currentPassword)) return errorOut_('현재 비밀번호가 올바르지 않습니다.', 'AUTH_FAILED');
  var next = String(p.newPassword || '');
  if (next.length < 6) return errorOut_('새 비밀번호는 6자 이상으로 해주세요.', 'BAD_PASSWORD');
  var users = SG_loadUsers_();
  SG_setUserPassword_(users[user.id], next);
  SG_saveUsers_(users);
  // 이 사용자의 다른 브라우저 로그인은 해제하고, 현재 브라우저는 새 세션 발급
  SG_clearSessions_(user.id);
  var s = SG_createSession_(user.id);
  return jsonOut_({ ok: true, token: s.token, exp: s.exp });
}

// 관리자: 사용자 목록
function SG_apiListUsers_() {
  var users = SG_loadUsers_();
  var list = Object.keys(users).map(function (k) { return SG_publicUser_(users[k]); });
  list.sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || String(a.createdAt).localeCompare(String(b.createdAt)); });
  return jsonOut_({ ok: true, users: list, roles: SG_ROLES_ });
}

// 관리자: 권한·상태·정보 변경, 비밀번호 초기화
function SG_apiUpdateUser_(payload, admin) {
  var p = payload || {};
  var users = SG_loadUsers_();
  var u = users[p.id];
  if (!u) return errorOut_('사용자를 찾을 수 없습니다.', 'NOT_FOUND');
  var patch = p.patch || {};
  var wasActiveAdmin = u.role === 'admin' && u.status === 'active';
  if (patch.role != null) {
    if (!SG_ROLES_[patch.role]) return errorOut_('알 수 없는 권한입니다.', 'BAD_INPUT');
    u.role = patch.role;
  }
  if (patch.ownOnly != null) u.ownOnly = !!patch.ownOnly;
  if (patch.status != null) {
    if (['pending', 'active', 'disabled'].indexOf(patch.status) < 0) return errorOut_('알 수 없는 상태입니다.', 'BAD_INPUT');
    u.status = patch.status;
  }
  ['name', 'phone', 'dept'].forEach(function (f) { if (patch[f] != null) u[f] = String(patch[f]).trim(); });
  if (patch.password) {
    if (String(patch.password).length < 6) return errorOut_('비밀번호는 6자 이상으로 해주세요.', 'BAD_PASSWORD');
    SG_setUserPassword_(u, patch.password);
  }
  // 관리자가 한 명도 남지 않는 변경은 막음
  if (wasActiveAdmin && !(u.role === 'admin' && u.status === 'active')) {
    var others = Object.keys(users).filter(function (k) { return k !== u.id && users[k].role === 'admin' && users[k].status === 'active'; });
    if (!others.length) return errorOut_('활성 관리자가 최소 1명은 있어야 합니다.', 'LAST_ADMIN');
  }
  SG_saveUsers_(users);
  if (u.status !== 'active' || patch.password) SG_clearSessions_(u.id);
  return jsonOut_({ ok: true, user: SG_publicUser_(u) });
}

function SG_apiDeleteUser_(payload, admin) {
  var id = (payload || {}).id;
  if (id === admin.id) return errorOut_('본인 계정은 삭제할 수 없습니다.', 'BAD_INPUT');
  var users = SG_loadUsers_();
  if (!users[id]) return errorOut_('사용자를 찾을 수 없습니다.', 'NOT_FOUND');
  delete users[id];
  SG_saveUsers_(users);
  SG_clearSessions_(id);
  return jsonOut_({ ok: true });
}

// 관리자: 계약 담당자 변경
function SG_apiSetManager_(payload) {
  var p = payload || {};
  var no = Number(p.no);
  var name = String(p.manager || '').trim();
  if (!no || !name) return errorOut_('계약번호와 담당자가 필요합니다.', 'BAD_INPUT');
  var before = SG_getManagerOf_(no);
  var r = SG_setManagerOf_(no, name);
  var code = SG_managerCode_(r.name, r.seq);
  try { logChange_('담당자 변경', '#' + no, [{ field: 'manager', label: '담당자', before: before, after: name + ' (' + code + ')' }]); } catch (err) {}
  return jsonOut_({ ok: true, no: no, manager: name, managerNo: r.seq, managerCode: code });
}

function SG_readAppSettings_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SG_APP_SETTINGS_KEY_);
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (err) { return {}; }
}

function SG_apiGetAppSettings_() {
  return jsonOut_({ ok: true, settings: SG_readAppSettings_() });
}

function SG_apiSaveAppSettings_(payload) {
  var incoming = (payload && payload.settings) || {};
  var current = SG_readAppSettings_();
  SG_APP_SETTINGS_FIELDS_.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(incoming, f)) current[f] = String(incoming[f] == null ? '' : incoming[f]);
  });
  PropertiesService.getScriptProperties().setProperty(SG_APP_SETTINGS_KEY_, JSON.stringify(current));
  return jsonOut_({ ok: true, settings: current });
}
