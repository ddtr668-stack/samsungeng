// ============================================================
// 한별상회 계약관리 대시보드 · Web API
// ============================================================
//
// 사용 방법:
//   1. 기존 계약관리 스프레드시트의 Apps Script 편집기에서
//      새 스크립트 파일을 만들고 이 파일 전체를 붙여넣습니다.
//   2. 오른쪽 위 "배포" → "새 배포" → 유형: "웹 앱"
//      · 다음 사용자로 실행: 나
//      · 액세스 권한: 모든 사용자 (로그인은 대시보드 관리자 계정으로 확인)
//   3. 배포 URL 을 저장소의 assets/config.js 의 apiUrl 에 넣습니다.
//      (Auth.gs 도 같은 프로젝트에 추가하고 SG_setAdminPassword 를 한 번 실행)
//   4. 새 시트 컬럼이나 로직이 바뀌면 "새 버전 배포"로 재배포합니다.
//
// 이 파일은 기존 Code.gs / BusinessTools.gs / ExpenseRequest.gs 에
// 정의된 상수·헬퍼(DB_SHEET_NAME, DATA_START_ROW, PARTNER_SHEET_NAME,
// PROJECT_COL, getDbSheet_(), lookupPartnerInfo_(), resolveExpensePayload_(),
// buildExpenseRequestHtml_() 등)를 그대로 재사용합니다.
// ============================================================

// ─── 배포 버전 확인용 (설정 화면 "연결 테스트"에 표시) ───
// 이 값이 바뀌지 않으면 Apps Script 에 최신 코드가 반영·재배포되지 않은 것입니다.
var BUILD_VERSION_ = '2026-09-25-02 (로그인 · 이름 충돌 방지 SG_)';

// ─── DB 컬럼 매핑 (계약관리_v1.3 시트 기준) ───
var COL_MAP_ = {
  no: 1, contractDate: 2, category: 3, client: 4, projectName: 5,
  totalAmount: 6, paidAmount: 7, balance: 8,
  taxInvoiceIssued: 9, taxInvoicePending: 10,
  productCost: 11, subcontractor: 12, subcontractAmount: 13,
  subcontractPaid: 14, subcontractBalance: 15,
  incidental: 16, salesCost: 17, drawing: 18, siteInfo: 19,
  profit: 20, marginRate: 21, status: 22,
  chk배관: 23, chk실내기: 24, chk실외기: 25, chk시운전: 26, chk인수인계: 27,
  progress: 28, note: 29
};
var DB_LAST_COL_ = 29;

// ─── CORS 대응 helper ───
function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorOut_(msg, code) {
  return jsonOut_({ ok: false, error: msg, code: code || 'ERROR' });
}

// ─── Router ───
function doGet(e) {
  return handleRequest_(e, 'GET');
}
function doPost(e) {
  return handleRequest_(e, 'POST');
}

function handleRequest_(e, method) {
  try {
    var params = (e && e.parameter) || {};
    var route = params.route || 'summary';

    // POST payload
    var payload = {};
    if (method === 'POST' && e.postData && e.postData.contents) {
      try { payload = JSON.parse(e.postData.contents) || {}; }
      catch (err) { return errorOut_('잘못된 JSON 형식: ' + err.message, 'BAD_JSON'); }
      if (payload.route) route = payload.route;
    }

    // ─── 로그인 확인 (Auth.gs) ───
    var token = params.token || payload.token || '';
    if (route === 'login')  return SG_apiLogin_(payload);
    if (route === 'logout') return SG_apiLogout_(token);
    var session = null;
    if (route !== 'ping') {
      session = SG_getSession_(token);
      if (!session) return errorOut_('로그인이 필요합니다.', 'AUTH_REQUIRED');
    }

    switch (route) {
      case 'me':            return jsonOut_({ ok:true, user:{ id: session.id, role:'admin' } });
      case 'appSettings':   return SG_apiGetAppSettings_();
      case 'saveAppSettings': return SG_apiSaveAppSettings_(payload);
      case 'changePassword':  return SG_apiChangePassword_(payload, session);
      case 'ping':          return jsonOut_({ ok:true, message:'pong', ts:new Date().toISOString(), version: BUILD_VERSION_ });
      case 'bootstrap':     return apiBootstrap_();
      case 'contracts':     return apiListContracts_();
      case 'contract':      return apiGetContract_(params.no || payload.no);
      case 'update':        return apiUpdateContract_(payload);
      case 'create':        return apiCreateContract_(payload);
      case 'clients':       return apiListClients_();
      case 'saveClient':    return apiSaveClient_(payload);
      case 'subcontractors':return jsonOut_({ ok: true, subcontractors: readSubcontractors_() });
      case 'saveSubcontractor': return apiSaveSubcontractor_(payload);
      case 'expenseHistory':return apiExpenseHistory_();
      case 'expensePdf':    return apiGenerateExpensePdf_(payload);
      // ─── 신규: 수금 누적 관리 ───
      case 'payments':      return apiListPayments_(params.contractNo || payload.contractNo);
      case 'createPayment': return apiCreatePayment_(payload);
      case 'updatePayment': return apiUpdatePayment_(payload);
      case 'deletePayment': return apiDeletePayment_(payload);
      // ─── 신규: 지출품의서 확장 (모달용 이력 조회) ───
      case 'expenseByContract': return apiExpenseHistoryByContract_(params.contractNo || payload.contractNo);
      case 'saveExpense':   return apiSaveExpense_(payload);
      case 'cancelExpenseRound': return apiCancelExpenseRound_(payload);
      // ─── 신규: 변경 이력 조회 ───
      case 'changeLog':     return apiChangeLog_();
      // ─── 신규: 자동 백업(30일 보관) ───
      case 'backupSettings':     return apiGetBackupSettings_();
      case 'saveBackupSettings': return apiSaveBackupSettings_(payload);
      case 'backupList':         return apiListBackups_();
      case 'runBackupNow':       return apiRunBackupNow_();
      case 'restoreBackup':      return apiRestoreBackup_(payload);
      default:
        return errorOut_('알 수 없는 라우트: ' + route, 'UNKNOWN_ROUTE');
    }
  } catch (err) {
    return errorOut_(err.message + ' @ ' + err.stack, 'EXCEPTION');
  }
}

// ============================================================
// Bootstrap · 대시보드 초기 로딩용 통합 엔드포인트
// (한 번의 요청으로 요약·계약·거래처·지출이력을 모두 반환)
// ============================================================

function apiBootstrap_() {
  var contracts = readContracts_();
  var clients = readClients_();
  var subcontractors = readSubcontractors_();
  var expenseHistory = readExpenseHistory_();

  return jsonOut_({
    ok: true,
    meta: {
      company: '한별상회',
      ceo: '정한별',
      industry: '냉난방·설비공사',
      generatedAt: new Date().toISOString(),
      totalContracts: contracts.length
    },
    summary: computeSummary_(contracts),
    contracts: contracts,
    clients: clients,
    subcontractors: subcontractors,
    clientStats: aggregateClients_(contracts),
    categoryStats: aggregateCategory_(contracts),
    monthlyStats: aggregateMonthly_(contracts),
    topBalance: topBalance_(contracts, 10),
    expenseHistory: expenseHistory
  });
}

// ============================================================
// 계약 목록 조회
// ============================================================

function apiListContracts_() {
  var contracts = readContracts_();
  return jsonOut_({ ok: true, contracts: contracts });
}

function apiGetContract_(no) {
  no = Number(no);
  if (!no) return errorOut_('계약 번호가 필요합니다.', 'BAD_PARAM');
  var contracts = readContracts_();
  var found = null;
  for (var i = 0; i < contracts.length; i++) {
    if (Number(contracts[i].no) === no) { found = contracts[i]; break; }
  }
  if (!found) return errorOut_('계약을 찾을 수 없습니다: #' + no, 'NOT_FOUND');
  return jsonOut_({ ok: true, contract: found });
}

// ============================================================
// 계약 수정 (특정 필드만)
// payload: { no: number, patch: { field1: val1, ... } }
// 허용 필드는 EDITABLE_FIELDS_ 참조
// ============================================================

var EDITABLE_FIELDS_ = {
  category:'category', client:'client', projectName:'projectName',
  totalAmount:'totalAmount', paidAmount:'paidAmount',
  taxInvoiceIssued:'taxInvoiceIssued', taxInvoicePending:'taxInvoicePending',
  productCost:'productCost', subcontractor:'subcontractor',
  subcontractAmount:'subcontractAmount', subcontractPaid:'subcontractPaid',
  incidental:'incidental', salesCost:'salesCost',
  status:'status', progress:'progress', note:'note',
  chk배관:'chk배관', chk실내기:'chk실내기', chk실외기:'chk실외기',
  chk시운전:'chk시운전', chk인수인계:'chk인수인계',
  contractDate:'contractDate',
  drawing:'drawing', siteInfo:'siteInfo'
};

// 변경 이력에 표시할 필드 한글 라벨
var FIELD_LABELS_ = {
  category:'구분', client:'거래처', projectName:'공사명',
  totalAmount:'총 계약금액', paidAmount:'수금액',
  taxInvoiceIssued:'세금계산서 발행', taxInvoicePending:'세금계산서 미발행',
  productCost:'제품대', subcontractor:'도급업체',
  subcontractAmount:'도급금액', subcontractPaid:'도급 지급액',
  incidental:'기타경비', salesCost:'영업수수료',
  status:'진행상태', progress:'진행률', note:'비고',
  chk배관:'배관', chk실내기:'실내기', chk실외기:'실외기',
  chk시운전:'시운전', chk인수인계:'인수인계',
  contractDate:'계약일', drawing:'도면', siteInfo:'현장설치정보'
};

function apiUpdateContract_(payload) {
  var no = Number(payload.no);
  var patch = payload.patch || {};
  if (!no) return errorOut_('계약 번호가 필요합니다.', 'BAD_PARAM');
  var result = applyContractPatch_(no, patch);
  if (!result.ok) return errorOut_(result.error, result.code || 'ERROR');
  return jsonOut_(result);
}

// 계약 한 행에 patch 를 적용하는 실제 로직 (apiUpdateContract_ 와 지출품의서 연동
// 동기화 양쪽에서 공용으로 사용) — ContentService 로 감싸지 않은 순수 객체를 돌려준다.
// categoryLabel: 변경 이력에 남길 구분(직접 수정 vs 지출품의서 금액 반영 등)
function applyContractPatch_(no, patch, categoryLabel) {
  no = Number(no);
  patch = patch || {};
  if (!no) return { ok: false, error: '계약 번호가 필요합니다.', code: 'BAD_PARAM' };

  var sheet = getDbSheet_();
  var lastRow = sheet.getLastRow();
  var noValues = sheet.getRange(DATA_START_ROW, COL_MAP_.no, lastRow - DATA_START_ROW + 1, 1).getValues();

  var targetRow = -1;
  for (var i = 0; i < noValues.length; i++) {
    if (Number(noValues[i][0]) === no) { targetRow = DATA_START_ROW + i; break; }
  }
  if (targetRow < 0) return { ok: false, error: '계약 행을 찾지 못했습니다: #' + no, code: 'NOT_FOUND' };

  var projectNameForLog = sheet.getRange(targetRow, COL_MAP_.projectName).getValue() || '';
  var changesForLog = [];
  var updated = [];
  Object.keys(patch).forEach(function(field) {
    if (!EDITABLE_FIELDS_[field] || !COL_MAP_[field]) return;
    var col = COL_MAP_[field];
    var value = patch[field];

    var before = sheet.getRange(targetRow, col).getValue();
    var beforeStr = before instanceof Date ? Utilities.formatDate(before, Session.getScriptTimeZone(), 'yyyy-MM-dd') : before;
    var afterStr = value instanceof Date ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd') : value;
    if (String(beforeStr == null ? '' : beforeStr) !== String(afterStr == null ? '' : afterStr)) {
      changesForLog.push({ field: field, label: FIELD_LABELS_[field] || field, before: beforeStr, after: afterStr });
    }

    // 잔금/기성잔액/이윤/마진율은 자동 계산으로 갱신 (수정 후)
    sheet.getRange(targetRow, col).setValue(value);
    updated.push(field);
  });

  // 자동 계산 필드 재계산: 잔금·기성잔액·이윤·마진율
  recomputeDerivedFields_(sheet, targetRow);

  SpreadsheetApp.flush();

  if (changesForLog.length) {
    logChange_(categoryLabel || '계약정보 수정', '#' + no + ' ' + projectNameForLog, changesForLog);
  }

  // 갱신된 행 전체 다시 읽어서 반환
  var row = sheet.getRange(targetRow, 1, 1, DB_LAST_COL_).getValues()[0];
  return { ok: true, updated: updated, contract: rowToContract_(row) };
}

// ============================================================
// 지출품의서 저장 → 계약 금액 동기화
//  - 설치비(subcontractAmount)/제품대(productCost)/영업수수료(salesCost)/
//    기타경비(incidental) 를 계약에서 따로 또 입력하지 않도록, 지출품의서를
//    저장할 때 이번 회차에 실제로 입력한 금액으로 계약의 총액을 덮어쓴다.
//  - 이번 회차에 해당 항목을 아예 입력하지 않은 경우(0원)까지 덮어쓰면
//    이전에 기록해둔 금액이 지워지므로, 0보다 큰 값이 들어온 항목만 반영한다.
//    (예: 이번 회차에 제품 내역서를 입력하지 않았으면 계약의 제품대는 그대로 유지)
// ============================================================
function syncContractAmountsFromExpense_(contractNo, p) {
  try {
    var productTotal = 0;
    if (p.productSummary && Number(p.productSummary.totalMaterial)) {
      productTotal = Number(p.productSummary.totalMaterial) || 0;
    } else if (Array.isArray(p.productItems)) {
      p.productItems.forEach(function (it) {
        productTotal += (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      });
    }

    var candidates = {
      subcontractAmount: Number(p.amount) || 0,      // 금회 요청금액(설치비)
      productCost: productTotal,                      // 제품 내역서 합계
      salesCost: Number(p.commission) || 0,           // 영업 수수료 합계
      incidental: Number(p.etcCost) || 0              // 기타 경비 합계
    };

    var patch = {};
    Object.keys(candidates).forEach(function (field) {
      if (candidates[field] > 0) patch[field] = candidates[field];
    });
    if (Object.keys(patch).length === 0) return { ok: true, updated: [] };

    return applyContractPatch_(contractNo, patch, '지출품의서 금액 반영');
  } catch (err) {
    // 동기화 실패가 지출품의서 저장 자체를 막지 않도록 조용히 무시(로그만 남김)
    Logger.log('syncContractAmountsFromExpense_ 실패: ' + err.message);
    return { ok: false, error: err.message };
  }
}

function recomputeDerivedFields_(sheet, row) {
  var total = Number(sheet.getRange(row, COL_MAP_.totalAmount).getValue()) || 0;
  var paid = Number(sheet.getRange(row, COL_MAP_.paidAmount).getValue()) || 0;
  var subA = Number(sheet.getRange(row, COL_MAP_.subcontractAmount).getValue()) || 0;
  var subP = Number(sheet.getRange(row, COL_MAP_.subcontractPaid).getValue()) || 0;
  var product = Number(sheet.getRange(row, COL_MAP_.productCost).getValue()) || 0;
  var inc = Number(sheet.getRange(row, COL_MAP_.incidental).getValue()) || 0;
  var sales = Number(sheet.getRange(row, COL_MAP_.salesCost).getValue()) || 0;

  sheet.getRange(row, COL_MAP_.balance).setValue(total - paid);
  sheet.getRange(row, COL_MAP_.subcontractBalance).setValue(subA - subP);
  var profit = total - product - subA - inc - sales;
  sheet.getRange(row, COL_MAP_.profit).setValue(profit);
  sheet.getRange(row, COL_MAP_.marginRate).setValue(total > 0 ? profit / total : 0);

  // 진행률 = 5개 체크박스 평균
  var checks = [
    sheet.getRange(row, COL_MAP_.chk배관).getValue(),
    sheet.getRange(row, COL_MAP_.chk실내기).getValue(),
    sheet.getRange(row, COL_MAP_.chk실외기).getValue(),
    sheet.getRange(row, COL_MAP_.chk시운전).getValue(),
    sheet.getRange(row, COL_MAP_.chk인수인계).getValue()
  ];
  var done = checks.filter(function(x){ return x === true || x === 'TRUE' || x === 1; }).length;
  sheet.getRange(row, COL_MAP_.progress).setValue(done / 5);
}

// ============================================================
// 신규 계약 등록
// ============================================================

// 신규 계약 등록 시 계약번호(NO) 채번 + 행 추가를 하나의 잠금(LockService) 안에서 처리한다.
// (잠금이 없으면 거의 동시에 두 번 등록될 때 두 계약이 같은 NO를 배정받는 경우가 생길 수 있다.)
function apiCreateContract_(payload) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // 최대 10초 대기
  } catch (e) {
    return errorOut_('다른 저장 작업이 진행 중입니다. 잠시 후 다시 시도해주세요.', 'LOCK_TIMEOUT');
  }
  try {
    var sheet = getDbSheet_();
    var lastRow = sheet.getLastRow();

    // 다음 NO
    var noValues = lastRow >= DATA_START_ROW
      ? sheet.getRange(DATA_START_ROW, COL_MAP_.no, lastRow - DATA_START_ROW + 1, 1).getValues()
      : [];
    var maxNo = 0;
    noValues.forEach(function(r) { if (Number(r[0]) > maxNo) maxNo = Number(r[0]); });
    var newNo = maxNo + 1;
    var newRow = lastRow + 1;
    if (newRow < DATA_START_ROW) newRow = DATA_START_ROW;

    var contract = payload.contract || {};
    var rowData = new Array(DB_LAST_COL_).fill('');
    rowData[COL_MAP_.no - 1] = newNo;
    rowData[COL_MAP_.contractDate - 1] = contract.contractDate ? new Date(contract.contractDate) : new Date();
    rowData[COL_MAP_.category - 1] = contract.category || '민수';
    rowData[COL_MAP_.client - 1] = contract.client || '';
    rowData[COL_MAP_.projectName - 1] = contract.projectName || '';
    rowData[COL_MAP_.totalAmount - 1] = Number(contract.totalAmount) || 0;
    rowData[COL_MAP_.paidAmount - 1] = Number(contract.paidAmount) || 0;
    rowData[COL_MAP_.productCost - 1] = Number(contract.productCost) || 0;
    rowData[COL_MAP_.subcontractor - 1] = contract.subcontractor || '';
    rowData[COL_MAP_.subcontractAmount - 1] = Number(contract.subcontractAmount) || 0;
    rowData[COL_MAP_.subcontractPaid - 1] = Number(contract.subcontractPaid) || 0;
    rowData[COL_MAP_.incidental - 1] = Number(contract.incidental) || 0;
    rowData[COL_MAP_.salesCost - 1] = Number(contract.salesCost) || 0;
    rowData[COL_MAP_.status - 1] = contract.status || '미진행';
    rowData[COL_MAP_.note - 1] = contract.note || '';

    sheet.getRange(newRow, 1, 1, DB_LAST_COL_).setValues([rowData]);
    recomputeDerivedFields_(sheet, newRow);
    SpreadsheetApp.flush();

    var savedRow = sheet.getRange(newRow, 1, 1, DB_LAST_COL_).getValues()[0];
    return jsonOut_({ ok: true, contract: rowToContract_(savedRow) });
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 거래처 조회
// ============================================================

function apiListClients_() {
  return jsonOut_({ ok: true, clients: readClients_() });
}

// ============================================================
// 지출품의서 이력 조회
// ============================================================

function apiExpenseHistory_() {
  return jsonOut_({ ok: true, history: readExpenseHistory_() });
}

// ============================================================
// 지출품의서 PDF 생성 (base64 반환 → 브라우저에서 다운로드)
// generateExpenseRequestPdfDownload() 는 ExpenseRequest.gs에 이미 정의됨
// ============================================================

function apiGenerateExpensePdf_(payload) {
  try {
    if (typeof generateExpenseRequestPdfDownload !== 'function') {
      return errorOut_('ExpenseRequest.gs가 GAS 프로젝트에 없습니다. 먼저 붙여넣어 주세요.', 'MISSING_MODULE');
    }
    var result = generateExpenseRequestPdfDownload(payload.row, payload.payload || {});
    return jsonOut_(result.error ? { ok:false, error:result.error } : { ok:true, pdf:result });
  } catch (err) {
    return errorOut_(err.message, 'PDF_EXCEPTION');
  }
}

// ============================================================
// Sheet → Object 변환 유틸
// ============================================================

function readContracts_() {
  var sheet = getDbSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return [];

  var values = sheet.getRange(DATA_START_ROW, 1, lastRow - DATA_START_ROW + 1, DB_LAST_COL_).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row[0] === '' || row[0] == null) continue;
    var contract = rowToContract_(row);
    if (contract.no > 0) out.push(contract);
  }
  return out;
}

function rowToContract_(row) {
  var date = row[COL_MAP_.contractDate - 1];
  var iso = null;
  if (date instanceof Date && !isNaN(date.getTime())) {
    iso = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } else if (typeof date === 'string' && date) {
    var m = date.match(/(\d{4})년\s*(\d{1,2})월/);
    if (m) iso = m[1] + '-' + String(m[2]).padStart(2,'0') + '-01';
    else iso = date;
  }
  var totalAmount = Number(row[COL_MAP_.totalAmount - 1]) || 0;
  var paidAmount = Number(row[COL_MAP_.paidAmount - 1]) || 0;
  var balanceCell = Number(row[COL_MAP_.balance - 1]);
  var profit = Number(row[COL_MAP_.profit - 1]) || 0;
  var marginRate = Number(row[COL_MAP_.marginRate - 1]) || (totalAmount ? profit/totalAmount : 0);
  var productCostCell = row[COL_MAP_.productCost - 1];
  var productCostNum = Number(productCostCell);

  function toBool(v){ return v === true || v === 'TRUE' || v === 1 || v === '1'; }

  return {
    no: Number(row[COL_MAP_.no - 1]) || 0,
    contractDate: iso,
    contractDateRaw: date instanceof Date ? date.toISOString() : date,
    category: row[COL_MAP_.category - 1] || '기타',
    client: row[COL_MAP_.client - 1] || '',
    projectName: String(row[COL_MAP_.projectName - 1] || '').trim(),
    totalAmount: totalAmount,
    paidAmount: paidAmount,
    balance: isNaN(balanceCell) ? (totalAmount - paidAmount) : balanceCell,
    taxInvoiceIssued: Number(row[COL_MAP_.taxInvoiceIssued - 1]) || 0,
    taxInvoicePending: Number(row[COL_MAP_.taxInvoicePending - 1]) || 0,
    productCost: isNaN(productCostNum) ? 0 : productCostNum,
    productCostNote: typeof productCostCell === 'string' ? productCostCell : null,
    subcontractor: row[COL_MAP_.subcontractor - 1] || null,
    subcontractAmount: Number(row[COL_MAP_.subcontractAmount - 1]) || 0,
    subcontractPaid: Number(row[COL_MAP_.subcontractPaid - 1]) || 0,
    subcontractBalance: Number(row[COL_MAP_.subcontractBalance - 1]) || 0,
    incidental: Number(row[COL_MAP_.incidental - 1]) || 0,
    salesCost: Number(row[COL_MAP_.salesCost - 1]) || 0,
    profit: profit,
    marginRate: marginRate,
    status: row[COL_MAP_.status - 1] || '미입력',
    progress: Number(row[COL_MAP_.progress - 1]) || 0,
    checks: {
      배관: toBool(row[COL_MAP_.chk배관 - 1]),
      실내기: toBool(row[COL_MAP_.chk실내기 - 1]),
      실외기: toBool(row[COL_MAP_.chk실외기 - 1]),
      시운전: toBool(row[COL_MAP_.chk시운전 - 1]),
      인수인계: toBool(row[COL_MAP_.chk인수인계 - 1])
    },
    note: row[COL_MAP_.note - 1] || null,
    drawing: row[COL_MAP_.drawing - 1] || null,
    siteInfo: row[COL_MAP_.siteInfo - 1] || null
  };
}

function readClients_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(typeof PARTNER_SHEET_NAME !== 'undefined' ? PARTNER_SHEET_NAME : '거래처관리');
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  // A:사업자번호 B:상호 C:대표자 D:주소 E:업태 F:종목 G:구분 H:최근프로젝트 I:등록증링크 J:최초등록일 K:최종수정일 L:전화번호
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0] && !r[1]) continue;
    out.push({
      bizNo: r[0] || '',
      name: r[1] || '',
      ceo: r[2] || '',
      address: r[3] || '',
      bizType: r[4] || '',
      bizItem: r[5] || '',
      category: r[6] || '',
      recentProject: r[7] || '',
      registryUrl: r[8] || '',
      regDate: r[9] instanceof Date ? Utilities.formatDate(r[9], Session.getScriptTimeZone(), 'yyyy-MM-dd') : (r[9] || null),
      updatedAt: r[10] instanceof Date ? Utilities.formatDate(r[10], Session.getScriptTimeZone(), 'yyyy-MM-dd') : (r[10] || null),
      tel: r[11] || null
    });
  }
  return out;
}

// ============================================================
// 거래처 정보 수정 · 신규 등록 — 거래처 관리 화면의 "✏️ 수정" / "+ 거래처 등록"
//  - 거래처관리(PARTNER_SHEET_NAME) 시트에만 반영한다(도급업체 등록 시트는 건드리지 않음).
//  - 사업자등록번호가 있으면 그것으로, 없으면 정규화한 상호명(_gNorm_)으로 기존 행을 찾아
//    갱신하고, 없으면 새 줄로 추가한다. 상호(name)는 계약 데이터의 거래처명과 매칭되는
//    키이므로 비워둘 수 없다.
// ============================================================
function apiSaveClient_(payload) {
  var p = payload || {};
  var name = String(p.name || '').trim();
  if (!name) return errorOut_('거래처명을 입력하세요.', 'BAD_PARAM');
  var bizNo = String(p.bizNo || '').trim();
  var nk = _gNorm_(name);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pname = typeof PARTNER_SHEET_NAME !== 'undefined' ? PARTNER_SHEET_NAME : '거래처관리';
    var psheet = ss.getSheetByName(pname);
    if (!psheet) {
      psheet = ss.insertSheet(pname);
      var pheaders = ['사업자번호', '상호', '대표자', '주소', '업태', '종목', '구분', '최근프로젝트', '등록증링크', '최초등록일', '최종수정일', '전화번호'];
      psheet.getRange(1, 1, 1, pheaders.length).setValues([pheaders])
        .setBackground('#1D2330').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
      psheet.setFrozenRows(1);
    }
    var plastRow = psheet.getLastRow();
    var ptargetRow = 0;
    if (plastRow >= 2) {
      var pvals = psheet.getRange(2, 1, plastRow - 1, 12).getValues();
      for (var j = 0; j < pvals.length; j++) {
        var pRowBizNo = String(pvals[j][0] || '').trim();
        var pRowName = String(pvals[j][1] || '').trim();
        if (bizNo && pRowBizNo && pRowBizNo === bizNo) { ptargetRow = j + 2; break; }
        if (!bizNo && pRowName && _gNorm_(pRowName) === nk) { ptargetRow = j + 2; break; }
      }
    }
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var result;
    if (ptargetRow) {
      var oldRow = pvals[ptargetRow - 2];
      var beforeVals = { bizNo: oldRow[0] || '', name: oldRow[1] || '', ceo: oldRow[2] || '', address: oldRow[3] || '', tel: oldRow[11] || '' };
      var afterVals = { bizNo: bizNo, name: name, ceo: p.ceo || '', address: p.address || '', tel: p.tel || '' };
      var clientLabels_ = { bizNo:'사업자번호', name:'상호', ceo:'대표자', address:'주소', tel:'전화번호' };
      var changesForLog = [];
      Object.keys(clientLabels_).forEach(function(k) {
        if (String(beforeVals[k]) !== String(afterVals[k])) {
          changesForLog.push({ field: k, label: clientLabels_[k], before: beforeVals[k], after: afterVals[k] });
        }
      });

      psheet.getRange(ptargetRow, 1).setValue(bizNo);
      psheet.getRange(ptargetRow, 2).setValue(name);
      psheet.getRange(ptargetRow, 3).setValue(p.ceo || '');
      psheet.getRange(ptargetRow, 4).setValue(p.address || '');
      psheet.getRange(ptargetRow, 12).setValue(p.tel || '');
      psheet.getRange(ptargetRow, 11).setValue(today);
      result = 'updated';
      if (changesForLog.length) logChange_('거래처정보 수정', name, changesForLog);
    } else {
      psheet.appendRow([bizNo, name, p.ceo || '', p.address || '', '', '', '', '', '', today, today, p.tel || '']);
      result = 'created';
      logChange_('거래처 신규 등록', name, [{ field:'name', label:'신규 등록', before:'', after: name + (bizNo ? ' (' + bizNo + ')' : '') }]);
    }
    return jsonOut_({ ok: true, name: name, bizNo: bizNo, result: result });
  } catch (err) {
    return errorOut_(err.message, 'SAVE_FAILED');
  }
}

// ============================================================
// 도급업체 목록 · 지출품의서 "지급 대상(도급업체)" 선택용
//  - 시트 이름 후보 중 처음 발견되는 시트를 사용 (없으면 빈 배열)
//  - 1행 = 헤더. 열 순서는 자유이며 헤더 이름으로 인식합니다.
//    사업자등록번호(사업자번호) · 상호(업체명/회사명) · 대표자(대표) · 전화번호(연락처)
//    담당자(소장) · 주소 · 은행(은행명) · 계좌번호 · 예금주
// ============================================================
var SUBCONTRACTOR_SHEET_NAMES_ = ['도급업체관리', '도급업체', '도급업체 대장', '설치팀'];

function readSubcontractors_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  for (var i = 0; i < SUBCONTRACTOR_SHEET_NAMES_.length; i++) {
    sheet = ss.getSheetByName(SUBCONTRACTOR_SHEET_NAMES_[i]);
    if (sheet) break;
  }
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var head = values[0].map(function (h) { return String(h || '').replace(/\s/g, ''); });
  function col(re) {
    for (var c = 0; c < head.length; c++) { if (re.test(head[c])) return c; }
    return -1;
  }
  var C = {
    bizNo:   col(/사업자|등록번호/),
    name:    col(/^(상호|업체명|회사명|사업자명|도급업체)/),
    ceo:     col(/대표/),
    tel:     col(/전화|연락처|휴대폰/),
    manager: col(/담당|소장/),
    address: col(/주소/),
    bank:    col(/은행/),
    account: col(/계좌/),
    holder:  col(/예금주/)
  };
  if (C.name < 0) return [];
  function cell(r, idx) { return idx >= 0 && r[idx] != null ? String(r[idx]).trim() : ''; }
  var out = [];
  for (var j = 1; j < values.length; j++) {
    var r = values[j];
    if (!cell(r, C.name)) continue;
    out.push({
      bizNo: cell(r, C.bizNo), name: cell(r, C.name), ceo: cell(r, C.ceo),
      tel: cell(r, C.tel), manager: cell(r, C.manager), address: cell(r, C.address),
      bank: cell(r, C.bank), account: cell(r, C.account), holder: cell(r, C.holder)
    });
  }
  return out;
}

// ============================================================
// 도급업체 신규 등록 · 정보 수정 저장
//  - 지출품의서 "지급 대상(도급업체)" 블록에서 업체를 새로 입력하거나
//    수정한 뒤 저장하면, 아래 두 시트에 함께 반영한다.
//    ① 도급업체 등록 시트 (SUBCONTRACTOR_SHEET_NAMES_) — 은행·계좌·예금주·담당자까지 전체 보관
//    ② 거래처관리(PARTNER_SHEET_NAME) — 사업자번호·상호·대표자·주소·전화번호만 반영(있으면 갱신, 없으면 신규)
//    사업자등록번호가 있으면 그것으로, 없으면 정규화한 상호명으로 기존 행을 찾아 갱신하고
//    없으면 새 줄로 추가한다(신규 거래처 자동 등록).
// ============================================================
function _gNorm_(v) {
  return String(v || '')
    .replace(/\(주\)|㈜|주식회사/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s/g, '')
    .toLowerCase();
}

// 도급업체 등록 시트를 찾거나(없으면 첫 번째 후보 이름으로) 새로 만들고, 헤더 열 위치를 돌려준다.
function getOrCreateSubcontractorSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = null;
  for (var i = 0; i < SUBCONTRACTOR_SHEET_NAMES_.length; i++) {
    sheet = ss.getSheetByName(SUBCONTRACTOR_SHEET_NAMES_[i]);
    if (sheet) break;
  }
  var headers = ['사업자등록번호', '상호', '대표자', '전화번호', '담당자', '주소', '은행', '계좌번호', '예금주'];
  if (!sheet) {
    sheet = ss.insertSheet(SUBCONTRACTOR_SHEET_NAMES_[0]);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#1D2330').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').replace(/\s/g, ''); });
  function col(re) { for (var c = 0; c < head.length; c++) { if (re.test(head[c])) return c; } return -1; }
  var C = {
    bizNo: col(/사업자|등록번호/), name: col(/^(상호|업체명|회사명|사업자명|도급업체)/), ceo: col(/대표/),
    tel: col(/전화|연락처|휴대폰/), manager: col(/담당|소장/), address: col(/주소/),
    bank: col(/은행/), account: col(/계좌/), holder: col(/예금주/)
  };
  // 방금 만든 시트라면 위 헤더 순서 그대로 컬럼이 매핑되어 있어야 한다 — 혹시 인식 실패 시 순서대로 강제
  if (C.name < 0 && sheet.getLastRow() <= 1 && lastCol >= headers.length) {
    C = { bizNo: 0, name: 1, ceo: 2, tel: 3, manager: 4, address: 5, bank: 6, account: 7, holder: 8 };
  }
  return { sheet: sheet, C: C, width: lastCol };
}

function apiSaveSubcontractor_(payload) {
  var p = payload || {};
  var name = String(p.name || '').trim();
  if (!name) return errorOut_('업체명을 입력하세요.', 'BAD_PARAM');
  var bizNo = String(p.bizNo || '').trim();
  var nk = _gNorm_(name);

  var result = { registry: 'skip', partner: 'skip' };
  var changesForLog = [];

  // ① 도급업체 등록 시트
  try {
    var reg = getOrCreateSubcontractorSheet_();
    var sheet = reg.sheet, C = reg.C;
    var lastRow = sheet.getLastRow();
    var targetRow = 0;
    var oldRow = null;
    if (lastRow >= 2 && C.name >= 0) {
      var vals = sheet.getRange(2, 1, lastRow - 1, reg.width).getValues();
      for (var i = 0; i < vals.length; i++) {
        var rowBizNo = C.bizNo >= 0 ? String(vals[i][C.bizNo] || '').trim() : '';
        var rowName = C.name >= 0 ? String(vals[i][C.name] || '').trim() : '';
        if (bizNo && rowBizNo && rowBizNo === bizNo) { targetRow = i + 2; oldRow = vals[i]; break; }
        if (!bizNo && rowName && _gNorm_(rowName) === nk) { targetRow = i + 2; oldRow = vals[i]; break; }
      }
    }
    var setCol = function (row, idx, val) { if (idx >= 0 && val !== undefined && val !== null) sheet.getRange(row, idx + 1).setValue(val); };
    if (targetRow) {
      var regLabels_ = { ceo:'대표자', tel:'전화번호', manager:'담당자', address:'주소', bank:'은행', account:'계좌번호', holder:'예금주' };
      var newRegVals_ = { ceo: p.ceo || '', tel: p.tel || '', manager: p.manager || '', address: p.address || '', bank: p.bank || '', account: p.account || '', holder: p.holder || '' };
      Object.keys(regLabels_).forEach(function(k) {
        var idx = C[k];
        if (idx == null || idx < 0) return;
        var before = String((oldRow && oldRow[idx]) || '');
        var after = String(newRegVals_[k]);
        if (before !== after) changesForLog.push({ field: k, label: regLabels_[k], before: before, after: after });
      });

      setCol(targetRow, C.bizNo, bizNo); setCol(targetRow, C.name, name); setCol(targetRow, C.ceo, p.ceo || '');
      setCol(targetRow, C.tel, p.tel || ''); setCol(targetRow, C.manager, p.manager || ''); setCol(targetRow, C.address, p.address || '');
      setCol(targetRow, C.bank, p.bank || ''); setCol(targetRow, C.account, p.account || ''); setCol(targetRow, C.holder, p.holder || '');
      result.registry = 'updated';
    } else {
      var row = new Array(reg.width).fill('');
      setCol2(row, C.bizNo, bizNo); setCol2(row, C.name, name); setCol2(row, C.ceo, p.ceo || '');
      setCol2(row, C.tel, p.tel || ''); setCol2(row, C.manager, p.manager || ''); setCol2(row, C.address, p.address || '');
      setCol2(row, C.bank, p.bank || ''); setCol2(row, C.account, p.account || ''); setCol2(row, C.holder, p.holder || '');
      function setCol2(arr, idx, val) { if (idx >= 0) arr[idx] = val; }
      sheet.appendRow(row);
      result.registry = 'created';
    }
  } catch (err) {
    result.registry = 'error: ' + err.message;
  }

  // ② 거래처관리 (사업자번호·상호·대표자·주소·전화번호만)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var pname = typeof PARTNER_SHEET_NAME !== 'undefined' ? PARTNER_SHEET_NAME : '거래처관리';
    var psheet = ss.getSheetByName(pname);
    if (!psheet) {
      psheet = ss.insertSheet(pname);
      var pheaders = ['사업자번호', '상호', '대표자', '주소', '업태', '종목', '구분', '최근프로젝트', '등록증링크', '최초등록일', '최종수정일', '전화번호'];
      psheet.getRange(1, 1, 1, pheaders.length).setValues([pheaders])
        .setBackground('#1D2330').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
      psheet.setFrozenRows(1);
    }
    var plastRow = psheet.getLastRow();
    var ptargetRow = 0;
    if (plastRow >= 2) {
      var pvals = psheet.getRange(2, 1, plastRow - 1, 12).getValues();
      for (var j = 0; j < pvals.length; j++) {
        var pRowBizNo = String(pvals[j][0] || '').trim();
        var pRowName = String(pvals[j][1] || '').trim();
        if (bizNo && pRowBizNo && pRowBizNo === bizNo) { ptargetRow = j + 2; break; }
        if (!bizNo && pRowName && _gNorm_(pRowName) === nk) { ptargetRow = j + 2; break; }
      }
    }
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (ptargetRow) {
      psheet.getRange(ptargetRow, 1).setValue(bizNo);
      psheet.getRange(ptargetRow, 2).setValue(name);
      psheet.getRange(ptargetRow, 3).setValue(p.ceo || '');
      if (p.address) psheet.getRange(ptargetRow, 4).setValue(p.address);
      if (p.tel) psheet.getRange(ptargetRow, 12).setValue(p.tel);
      psheet.getRange(ptargetRow, 11).setValue(today);
      // 구분이 비어있으면 도급업체로 채워둔다 (기존 값이 있으면 보존)
      if (!String(psheet.getRange(ptargetRow, 7).getValue() || '').trim()) psheet.getRange(ptargetRow, 7).setValue('도급업체');
      result.partner = 'updated';
    } else {
      psheet.appendRow([bizNo, name, p.ceo || '', p.address || '', '', '', '도급업체', '', '', today, today, p.tel || '']);
      result.partner = 'created';
    }
  } catch (err) {
    result.partner = 'error: ' + err.message;
  }

  if (changesForLog.length) {
    logChange_('도급업체정보 수정', name, changesForLog);
  } else if (result.registry === 'created') {
    logChange_('도급업체 신규 등록', name, [{ field:'name', label:'신규 등록', before:'', after: name + (bizNo ? ' (' + bizNo + ')' : '') }]);
  }

  return jsonOut_({ ok: true, name: name, bizNo: bizNo, result: result });
}

function readExpenseHistory_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = typeof EXPENSE_LOG_SHEET_NAME !== 'undefined' ? EXPENSE_LOG_SHEET_NAME : '지출품의서이력';
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  // A:문서번호 B:작성일 C:현장명 D:거래처 E:도급업체 F:요청금액 G:전회기성 H:누계기성 I:도급금액 J:잔액 K:작성자
  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    out.push({
      docNo: r[0], date: r[1] instanceof Date ? Utilities.formatDate(r[1], Session.getScriptTimeZone(), 'yyyy-MM-dd') : r[1],
      site: r[2], client: r[3], subcontractor: r[4],
      requestAmount: Number(r[5]) || 0, prevProgress: Number(r[6]) || 0, totalProgress: Number(r[7]) || 0,
      contractAmount: Number(r[8]) || 0, balance: Number(r[9]) || 0, author: r[10]
    });
  }
  return out;
}

// ============================================================
// 집계 유틸 (백엔드에서 계산 → 프론트 부하 감소)
// ============================================================

function computeSummary_(contracts) {
  var total = 0, paid = 0, balance = 0, profit = 0;
  var 완료 = 0, 진행중 = 0, 미진행 = 0;
  contracts.forEach(function(c) {
    total += c.totalAmount || 0;
    paid += c.paidAmount || 0;
    balance += c.balance || 0;
    profit += c.profit || 0;
    if (c.status === '완료') 완료++;
    else if (c.status === '진행중') 진행중++;
    else 미진행++;
  });
  return { totalAmount: total, paidAmount: paid, balance: balance, profit: profit,
           statusCounts: { 완료: 완료, 진행중: 진행중, 미진행: 미진행 } };
}

function aggregateCategory_(contracts) {
  var m = {};
  contracts.forEach(function(c) {
    var key = c.category || '기타';
    if (!m[key]) m[key] = { name:key, count:0, total:0, paid:0, balance:0, profit:0 };
    m[key].count++; m[key].total += c.totalAmount; m[key].paid += c.paidAmount;
    m[key].balance += c.balance; m[key].profit += c.profit;
  });
  return Object.keys(m).map(function(k) {
    var v = m[k]; v.marginRate = v.total ? v.profit/v.total : 0; return v;
  }).sort(function(a,b) { return b.total - a.total; });
}

function aggregateClients_(contracts) {
  var m = {};
  contracts.forEach(function(c) {
    var name = c.client;
    if (!m[name]) m[name] = { name:name, count:0, total:0, paid:0, balance:0, categories:{} };
    m[name].count++; m[name].total += c.totalAmount; m[name].paid += c.paidAmount; m[name].balance += c.balance;
    m[name].categories[c.category] = true;
  });
  return Object.keys(m).map(function(k) {
    var v = m[k]; v.categories = Object.keys(v.categories); return v;
  }).sort(function(a,b) { return b.total - a.total; });
}

function aggregateMonthly_(contracts) {
  var m = {};
  contracts.forEach(function(c) {
    if (!c.contractDate) return;
    var ym = c.contractDate.substring(0,7);
    if (!m[ym]) m[ym] = { month:ym, count:0, total:0, paid:0, balance:0, profit:0 };
    m[ym].count++; m[ym].total += c.totalAmount; m[ym].paid += c.paidAmount;
    m[ym].balance += c.balance; m[ym].profit += c.profit;
  });
  return Object.keys(m).sort().map(function(k) { return m[k]; });
}

function topBalance_(contracts, n) {
  return contracts.filter(function(c) { return c.balance > 0; })
    .sort(function(a,b) { return b.balance - a.balance; })
    .slice(0, n);
}

// ============================================================
// ═══════════════════════════════════════════════════════════════
//  수금 누적 관리 · 수금이력 시트
// ═══════════════════════════════════════════════════════════════
// 시트: 수금이력
// 컬럼: A no · B contractNo · C roundNo · D paymentDate ·
//       E amount · F method · G note · H createdAt · I createdBy
// ============================================================

var PAYMENT_SHEET_NAME_ = '수금이력';
var PAYMENT_COL_MAP_ = {
  no: 1, contractNo: 2, roundNo: 3, paymentDate: 4,
  amount: 5, method: 6, note: 7, createdAt: 8, createdBy: 9
};
var PAYMENT_LAST_COL_ = 9;

function getPaymentSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PAYMENT_SHEET_NAME_);
  if (!sheet) {
    sheet = ss.insertSheet(PAYMENT_SHEET_NAME_);
    // 헤더 작성
    sheet.getRange(1, 1, 1, PAYMENT_LAST_COL_).setValues([[
      'no', 'contractNo', 'roundNo', 'paymentDate',
      'amount', 'method', 'note', 'createdAt', 'createdBy'
    ]]);
    sheet.getRange(1, 1, 1, PAYMENT_LAST_COL_)
         .setBackground('#F3F3EE').setFontWeight('bold').setFontSize(10);
    sheet.setFrozenRows(1);
    // 컬럼 폭
    sheet.setColumnWidth(1, 50);   // no
    sheet.setColumnWidth(2, 80);   // contractNo
    sheet.setColumnWidth(3, 60);   // roundNo
    sheet.setColumnWidth(4, 100);  // paymentDate
    sheet.setColumnWidth(5, 110);  // amount
    sheet.setColumnWidth(6, 100);  // method
    sheet.setColumnWidth(7, 240);  // note
  }
  return sheet;
}

function paymentRowToObj_(row) {
  var d = row[PAYMENT_COL_MAP_.paymentDate - 1];
  var dateStr = null;
  if (d instanceof Date && !isNaN(d.getTime())) {
    dateStr = Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } else if (d) {
    dateStr = String(d);
  }
  var created = row[PAYMENT_COL_MAP_.createdAt - 1];
  var createdIso = created instanceof Date ? created.toISOString() : (created || null);
  return {
    no: Number(row[PAYMENT_COL_MAP_.no - 1]) || 0,
    contractNo: Number(row[PAYMENT_COL_MAP_.contractNo - 1]) || 0,
    roundNo: Number(row[PAYMENT_COL_MAP_.roundNo - 1]) || 0,
    paymentDate: dateStr,
    amount: Number(row[PAYMENT_COL_MAP_.amount - 1]) || 0,
    method: row[PAYMENT_COL_MAP_.method - 1] || '',
    note: row[PAYMENT_COL_MAP_.note - 1] || '',
    createdAt: createdIso,
    createdBy: row[PAYMENT_COL_MAP_.createdBy - 1] || ''
  };
}

// 특정 계약의 수금 목록 (roundNo 순 정렬)
function apiListPayments_(contractNo) {
  contractNo = Number(contractNo);
  if (!contractNo) return errorOut_('계약 번호가 필요합니다.', 'BAD_PARAM');
  var sheet = getPaymentSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return jsonOut_({ ok: true, payments: [] });
  var values = sheet.getRange(2, 1, lastRow - 1, PAYMENT_LAST_COL_).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    if (Number(values[i][PAYMENT_COL_MAP_.contractNo - 1]) === contractNo) {
      out.push(paymentRowToObj_(values[i]));
    }
  }
  out.sort(function(a, b) { return a.roundNo - b.roundNo; });
  return jsonOut_({ ok: true, payments: out });
}

// 수금 회차 추가
// payload: { contractNo, paymentDate, amount, method, note }
function apiCreatePayment_(payload) {
  var contractNo = Number(payload.contractNo);
  if (!contractNo) return errorOut_('계약 번호가 필요합니다.', 'BAD_PARAM');
  var amount = Number(payload.amount);
  if (!(amount > 0)) return errorOut_('수금액은 0보다 커야 합니다.', 'BAD_PARAM');

  var sheet = getPaymentSheet_();
  var lastRow = sheet.getLastRow();

  // 다음 no · 이 계약의 다음 roundNo
  var nextNo = 1;
  var nextRound = 1;
  if (lastRow >= 2) {
    var values = sheet.getRange(2, 1, lastRow - 1, PAYMENT_LAST_COL_).getValues();
    for (var i = 0; i < values.length; i++) {
      var n = Number(values[i][PAYMENT_COL_MAP_.no - 1]) || 0;
      if (n >= nextNo) nextNo = n + 1;
      if (Number(values[i][PAYMENT_COL_MAP_.contractNo - 1]) === contractNo) {
        var r = Number(values[i][PAYMENT_COL_MAP_.roundNo - 1]) || 0;
        if (r >= nextRound) nextRound = r + 1;
      }
    }
  }

  var newRow = Math.max(lastRow + 1, 2);
  var user = Session.getActiveUser().getEmail() || '';
  var paymentDate = payload.paymentDate ? new Date(payload.paymentDate) : new Date();

  var rowData = new Array(PAYMENT_LAST_COL_).fill('');
  rowData[PAYMENT_COL_MAP_.no - 1] = nextNo;
  rowData[PAYMENT_COL_MAP_.contractNo - 1] = contractNo;
  rowData[PAYMENT_COL_MAP_.roundNo - 1] = nextRound;
  rowData[PAYMENT_COL_MAP_.paymentDate - 1] = paymentDate;
  rowData[PAYMENT_COL_MAP_.amount - 1] = amount;
  rowData[PAYMENT_COL_MAP_.method - 1] = payload.method || '';
  rowData[PAYMENT_COL_MAP_.note - 1] = payload.note || '';
  rowData[PAYMENT_COL_MAP_.createdAt - 1] = new Date();
  rowData[PAYMENT_COL_MAP_.createdBy - 1] = user;

  sheet.getRange(newRow, 1, 1, PAYMENT_LAST_COL_).setValues([rowData]);

  // 계약관리 시트의 paidAmount 합계 자동 갱신
  syncContractPaidAmount_(contractNo);

  SpreadsheetApp.flush();
  var saved = paymentRowToObj_(sheet.getRange(newRow, 1, 1, PAYMENT_LAST_COL_).getValues()[0]);
  return jsonOut_({ ok: true, payment: saved });
}

// 수금 회차 수정
// payload: { no, paymentDate?, amount?, method?, note? }
function apiUpdatePayment_(payload) {
  var no = Number(payload.no);
  if (!no) return errorOut_('수금 no 가 필요합니다.', 'BAD_PARAM');
  var sheet = getPaymentSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return errorOut_('수금 이력이 없습니다.', 'NOT_FOUND');
  var noValues = sheet.getRange(2, PAYMENT_COL_MAP_.no, lastRow - 1, 1).getValues();
  var targetRow = -1;
  var contractNo = 0;
  for (var i = 0; i < noValues.length; i++) {
    if (Number(noValues[i][0]) === no) {
      targetRow = 2 + i;
      contractNo = Number(sheet.getRange(targetRow, PAYMENT_COL_MAP_.contractNo).getValue());
      break;
    }
  }
  if (targetRow < 0) return errorOut_('수금 행을 찾지 못했습니다: #' + no, 'NOT_FOUND');

  if (payload.paymentDate) sheet.getRange(targetRow, PAYMENT_COL_MAP_.paymentDate).setValue(new Date(payload.paymentDate));
  if (payload.amount != null) sheet.getRange(targetRow, PAYMENT_COL_MAP_.amount).setValue(Number(payload.amount) || 0);
  if (payload.method != null) sheet.getRange(targetRow, PAYMENT_COL_MAP_.method).setValue(payload.method);
  if (payload.note != null) sheet.getRange(targetRow, PAYMENT_COL_MAP_.note).setValue(payload.note);

  syncContractPaidAmount_(contractNo);
  SpreadsheetApp.flush();
  var saved = paymentRowToObj_(sheet.getRange(targetRow, 1, 1, PAYMENT_LAST_COL_).getValues()[0]);
  return jsonOut_({ ok: true, payment: saved });
}

// 수금 회차 삭제
// payload: { no }
function apiDeletePayment_(payload) {
  var no = Number(payload.no);
  if (!no) return errorOut_('수금 no 가 필요합니다.', 'BAD_PARAM');
  var sheet = getPaymentSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return errorOut_('수금 이력이 없습니다.', 'NOT_FOUND');
  var noValues = sheet.getRange(2, PAYMENT_COL_MAP_.no, lastRow - 1, 1).getValues();
  var targetRow = -1;
  var contractNo = 0;
  for (var i = 0; i < noValues.length; i++) {
    if (Number(noValues[i][0]) === no) {
      targetRow = 2 + i;
      contractNo = Number(sheet.getRange(targetRow, PAYMENT_COL_MAP_.contractNo).getValue());
      break;
    }
  }
  if (targetRow < 0) return errorOut_('수금 행을 찾지 못했습니다: #' + no, 'NOT_FOUND');

  sheet.deleteRow(targetRow);
  syncContractPaidAmount_(contractNo);
  SpreadsheetApp.flush();
  return jsonOut_({ ok: true, deleted: no });
}

// 계약관리 시트의 paidAmount 를 수금이력 합계로 동기화
function syncContractPaidAmount_(contractNo) {
  if (!contractNo) return;
  var pSheet = getPaymentSheet_();
  var lastRow = pSheet.getLastRow();
  var total = 0;
  if (lastRow >= 2) {
    var values = pSheet.getRange(2, 1, lastRow - 1, PAYMENT_LAST_COL_).getValues();
    for (var i = 0; i < values.length; i++) {
      if (Number(values[i][PAYMENT_COL_MAP_.contractNo - 1]) === contractNo) {
        total += Number(values[i][PAYMENT_COL_MAP_.amount - 1]) || 0;
      }
    }
  }
  // 계약관리 시트에서 해당 계약 행 찾아 paidAmount 업데이트
  var cSheet = getDbSheet_();
  var cLastRow = cSheet.getLastRow();
  if (cLastRow < DATA_START_ROW) return;
  var noValues = cSheet.getRange(DATA_START_ROW, COL_MAP_.no, cLastRow - DATA_START_ROW + 1, 1).getValues();
  for (var j = 0; j < noValues.length; j++) {
    if (Number(noValues[j][0]) === contractNo) {
      var row = DATA_START_ROW + j;
      cSheet.getRange(row, COL_MAP_.paidAmount).setValue(total);
      recomputeDerivedFields_(cSheet, row);
      return;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  지출품의서이력 · 확장 라우트
// ═══════════════════════════════════════════════════════════════

// 특정 계약의 지출품의서 이력 (드롭박스용)
// 저장 버튼으로 쌓인 행(O열 계약번호 기준)을 회차 순으로 돌려준다.
function apiExpenseHistoryByContract_(contractNo) {
  contractNo = Number(contractNo);
  if (!contractNo) return errorOut_('계약 번호가 필요합니다.', 'BAD_PARAM');
  var out = [];
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(expenseLogName_());
    if (sheet && sheet.getLastRow() >= 2 && sheet.getLastColumn() >= EXPENSE_EXT_FIRST_COL_) {
      var n = sheet.getLastRow() - 1;
      var vals = sheet.getRange(2, 1, n, EXPENSE_EXT_FIRST_COL_ + EXPENSE_EXT_HEADERS_.length - 1).getValues();
      for (var i = 0; i < vals.length; i++) {
        var r = vals[i];
        if (!r[0]) continue;
        if (Number(r[EXPENSE_EXT_FIRST_COL_ - 1]) !== contractNo) continue;
        var detail = {};
        try { detail = JSON.parse(r[EXPENSE_EXT_FIRST_COL_ + 2] || '{}') || {}; } catch (e) { detail = {}; }
        var d = r[1];
        out.push({
          no: i + 2,                                   // 시트 행번호 (선택 키)
          docNo: r[0],
          roundNo: Number(r[EXPENSE_EXT_FIRST_COL_]) || 0,
          docDate: d instanceof Date ? Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd') : (d || ''),
          amount: Number(r[5]) || 0,
          prevProgress: Number(r[6]) || 0,
          totalProgress: Number(r[7]) || 0,
          subcontractor: r[4] || '',
          author: r[10] || '',
          note: detail.note || '',
          status: String(r[11]) === '정상' ? 'active' : 'cancelled',
          pdfLink: r[12] || '',
          // 지급 대상(도급업체) 스냅샷 — 전회 기성 이력 선택 시 함께 복원
          subBizNo: detail.subBizNo || '', subCeo: detail.subCeo || '',
          subManager: detail.subManager || '', subManagerTel: detail.subManagerTel || '',
          subBank: detail.subBank || '', subAccount: detail.subAccount || '', subHolder: detail.subHolder || '', subAddress: detail.subAddress || '',
          companyName: detail.companyName || '',
          productItems_JSON: JSON.stringify(detail.productItems || []),
          installItems_JSON: JSON.stringify(detail.installItems || []),
          expenseItems_JSON: JSON.stringify(detail.expenseItems || []),
          commissionItems_JSON: JSON.stringify(detail.commissionItems || []),
          // 🆕 항목별 기성 관리 — 이 회차에 설치비/제품대/영업수수료/기타경비가 실제로 포함됐는지
          // (includeInstall 이 없는 과거 저장 건은 포함(true)으로 취급)
          includeInstall: detail.includeInstall === undefined ? true : !!detail.includeInstall,
          includeProduct: !!detail.includeProduct, includeCommission: !!detail.includeCommission, includeEtc: !!detail.includeEtc,
          // 🆕 v3: 구분 · 항목별 "금회 요청" 금액(품목표 합계와 독립적으로 저장된 값 — 없으면
          // 프론트에서 품목표 합계로 폴백) · 항목별 업체명 오버라이드
          docCategory: detail.docCategory || 'install',
          productAmount: detail.productAmount === undefined ? undefined : Number(detail.productAmount) || 0,
          commissionAmount: detail.commission === undefined ? undefined : Number(detail.commission) || 0,
          etcAmount: detail.etcCost === undefined ? undefined : Number(detail.etcCost) || 0,
          productVendorName: detail.productVendorName || '', commissionVendorName: detail.commissionVendorName || '', etcVendorName: detail.etcVendorName || ''
        });
      }
    }
  } catch (err) {
    return errorOut_('지출품의서 이력 조회 실패: ' + err.message, 'HISTORY_FAILED');
  }
  out.sort(function(a, b) { return a.roundNo - b.roundNo; });
  return jsonOut_({ ok: true, history: out });
}

// 지출품의서 저장 (PDF 없이 이력만) · 저장 버튼 전용
// payload: { contractNo, roundNo, docDate, manager, subcontractor, amount, prevProgress, note,
//            productItems, installItems, expenseItems, commissionItems, attachments,
//            subBizNo, subCeo, subManager, subManagerTel, subBank, subAccount, subHolder,
//            companyName, commission, etcCost, grandTotal }
// ※ 지출품의서이력 시트 A~N 은 PDF 생성(ExpenseRequest.gs)과 공유하고,
//   O~R(계약번호·회차·저장일시·상세JSON)열은 이 저장 기능이 추가로 사용한다.
function apiSaveExpense_(payload) {
  try {
    var p = payload || {};
    var saved = appendExpenseLogEntry_(p);
    // 지출품의서에 입력한 설치비/제품대/영업수수료/기타경비를 계약 총액에도 반영
    var sync = syncContractAmountsFromExpense_(Number(p.contractNo), p);
    return jsonOut_({ ok: true, entry: saved, contractSync: sync });
  } catch (err) {
    return errorOut_(err.message, 'SAVE_FAILED');
  }
}

// 저장된 회차(지출품의서이력 한 줄)를 취소 처리 — 기록/상세 JSON은 시트에 그대로 남기고
// 상태(L열)만 "취소됨"으로 바꾼다. 화면의 "설치비 기성" 표·전회 기성 이력에서는
// status:'cancelled' 인 행을 걸러내므로 목록에서 즉시 사라진다.
// payload: { contractNo, no }  ※ no = apiExpenseHistoryByContract_ 가 돌려준 시트 행번호
function apiCancelExpenseRound_(payload) {
  var p = payload || {};
  var contractNo = Number(p.contractNo);
  var row = Number(p.no);
  if (!contractNo || !row || row < 2) return errorOut_('삭제할 회차 정보가 올바르지 않습니다.', 'BAD_PARAM');
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(expenseLogName_());
    if (!sheet || row > sheet.getLastRow()) return errorOut_('해당 회차 기록을 찾을 수 없습니다.', 'NOT_FOUND');
    var docNo = sheet.getRange(row, 1).getValue();
    if (!docNo) return errorOut_('해당 회차 기록을 찾을 수 없습니다.', 'NOT_FOUND');
    var rowContractNo = Number(sheet.getRange(row, EXPENSE_EXT_FIRST_COL_).getValue());
    if (rowContractNo !== contractNo) return errorOut_('계약 번호가 일치하지 않아 삭제할 수 없습니다.', 'MISMATCH');
    var curStatus = String(sheet.getRange(row, 12).getValue() || '');
    if (curStatus === '취소됨') return jsonOut_({ ok: true, alreadyCancelled: true, docNo: docNo });
    sheet.getRange(row, 12).setValue('취소됨');
    return jsonOut_({ ok: true, docNo: docNo });
  } catch (err) {
    return errorOut_(err.message, 'CANCEL_FAILED');
  }
}

var EXPENSE_EXT_FIRST_COL_ = 15;   // O열
var EXPENSE_EXT_HEADERS_ = ['계약번호', '회차', '저장일시', '상세(JSON)'];

function expenseLogName_() {
  return typeof EXPENSE_LOG_SHEET_NAME !== 'undefined' ? EXPENSE_LOG_SHEET_NAME : '지출품의서이력';
}

// 이력 시트 확보 (ExpenseRequest.gs 가 없어도 동작) + O~R 열 머리글 보장
function getExpenseLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(expenseLogName_());
  if (!sheet) {
    if (typeof ensureExpenseLogSheet_ === 'function') {
      sheet = ensureExpenseLogSheet_();
    } else {
      sheet = ss.insertSheet(expenseLogName_());
      var headers = ['문서번호','작성일','현장명','거래처','도급업체','요청금액','전회기성','누계기성','도급금액','잔액','작성자','상태','PDF','파일ID'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  var lastCol = EXPENSE_EXT_FIRST_COL_ + EXPENSE_EXT_HEADERS_.length - 1;
  if (sheet.getMaxColumns() < lastCol) sheet.insertColumnsAfter(sheet.getMaxColumns(), lastCol - sheet.getMaxColumns());
  var cur = sheet.getRange(1, EXPENSE_EXT_FIRST_COL_).getValue();
  if (String(cur) !== EXPENSE_EXT_HEADERS_[0]) {
    sheet.getRange(1, EXPENSE_EXT_FIRST_COL_, 1, EXPENSE_EXT_HEADERS_.length)
      .setValues([EXPENSE_EXT_HEADERS_])
      .setBackground('#1D2330').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
  }
  return sheet;
}

// 같은 계약·같은 회차·같은 도급업체(정상 상태)를 다시 저장하면 새 줄을 만들지 않고
// "수정 지급건"으로 인식해서 그 줄을 갱신한다(누적에 새로 더해지지 않음).
// 회차 번호는 같은데 도급업체가 다르면(예: 회차 채번이 우연히 겹친 경우) 서로 다른
// 업체의 기록을 실수로 덮어쓰지 않도록 별도의 새 줄로 저장한다.
function appendExpenseLogEntry_(p) {
  var contractNo = Number(p.contractNo);
  if (!contractNo) throw new Error('계약 번호가 없습니다.');
  var roundNo = Number(p.roundNo) || 1;
  var amount = Number(p.amount) || 0;
  var prev = Number(p.prevProgress) || 0;

  var contract = null;
  var all = readContracts_();
  for (var i = 0; i < all.length; i++) { if (Number(all[i].no) === contractNo) { contract = all[i]; break; } }
  contract = contract || {};
  var subcontractorName = String(p.subcontractor || contract.subcontractor || '').trim();

  var detail = {
    note: p.note || '', attachments: p.attachments || '',
    subBizNo: p.subBizNo || '', subCeo: p.subCeo || '', subManager: p.subManager || '', subManagerTel: p.subManagerTel || '',
    subBank: p.subBank || '', subAccount: p.subAccount || '', subHolder: p.subHolder || '', subAddress: p.subAddress || '',
    companyName: p.companyName || '', commission: Number(p.commission) || 0, etcCost: Number(p.etcCost) || 0,
    grandTotal: Number(p.grandTotal) || 0,
    installItems: p.installItems || [], productItems: p.productItems || [],
    expenseItems: p.expenseItems || [], commissionItems: p.commissionItems || [],
    // 🆕 항목별 기성 관리 — 이번 회차에 설치비/제품대/영업수수료/기타경비가 실제로 청구(지급)에
    // 포함됐는지 여부. true 인 항목만 apiExpenseHistoryByContract_ 의 항목별 회차 이력·진행률·
    // 출력양식(지급대상/지급 내역 요약)에 "지급된 회차"로 집계된다. 값이 없는 과거 저장 건은
    // (includeInstall 제외) 모두 false 로 취급(하위 호환 — 과거엔 이 개념이 없었으므로 참고
    // 내역으로만 표시됨). includeInstall 이 없는 과거 저장 건은 포함(true)으로 취급한다
    // (v3 이전엔 설치비가 항상 포함이었으므로).
    includeInstall: p.includeInstall === undefined ? true : !!p.includeInstall,
    includeProduct: !!p.includeProduct, includeCommission: !!p.includeCommission, includeEtc: !!p.includeEtc,
    // 🆕 v3: 구분(이 문서의 대표 항목) · 제품대 금회 요청금액(품목표 합계와 독립적으로 저장) ·
    // 항목별(제품대/영업수수료/기타경비) 업체명 오버라이드 — 스프레드시트 컬럼은 그대로 두고
    // 이 JSON 상세 블록에만 추가(비파괴적 확장).
    docCategory: p.docCategory || 'install',
    productAmount: p.productAmount === undefined ? undefined : Number(p.productAmount) || 0,
    productVendorName: p.productVendorName || '', commissionVendorName: p.commissionVendorName || '', etcVendorName: p.etcVendorName || ''
  };
  var json = JSON.stringify(detail);
  if (json.length > 49000) {            // 셀 한도(5만자) 보호 - 제품 상세는 생략
    detail.productItems = [];
    detail.productOmitted = true;
    json = JSON.stringify(detail);
  }

  var sheet = getExpenseLogSheet_();
  var extCol = EXPENSE_EXT_FIRST_COL_;
  var width = extCol + EXPENSE_EXT_HEADERS_.length - 1;
  var lastRow = sheet.getLastRow();

  // 기존 행 찾기
  var targetRow = 0, docNo = '';
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, 1, lastRow - 1, width).getValues();
    for (var k = 0; k < keys.length; k++) {
      var sameContract = Number(keys[k][extCol - 1]) === contractNo;
      var sameRound = Number(keys[k][extCol]) === roundNo;
      var isActive = String(keys[k][11]) === '정상';
      var sameSubcontractor = String(keys[k][4] || '').trim() === subcontractorName;
      if (sameContract && sameRound && isActive && sameSubcontractor) {
        targetRow = k + 2; docNo = keys[k][0]; break;
      }
    }
  }
  if (!docNo) {
    docNo = typeof generateDocNumber_ === 'function'
      ? generateDocNumber_()
      : 'EXP-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  }

  var subAmt = Number(contract.subcontractAmount) || 0;
  var row = [
    docNo, p.docDate || '', contract.projectName || '', contract.client || '', subcontractorName,
    amount, prev, prev + amount, subAmt, subAmt - (prev + amount), p.manager || '', '정상', '', '',
    contractNo, roundNo, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'), json
  ];

  if (targetRow) {
    // PDF 링크·파일ID(M,N열)는 PDF 생성 기능이 채운 값을 보존
    var keep = sheet.getRange(targetRow, 13, 1, 2).getValues()[0];
    row[12] = keep[0]; row[13] = keep[1];
    sheet.getRange(targetRow, 1, 1, width).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
  return { docNo: docNo, roundNo: roundNo, updated: !!targetRow };
}

// ============================================================
// 변경 이력 로그 — 상단바 🔔 버튼에서 최근 10건 조회
//  - 계약정보/거래처정보/도급업체정보 수정 시 어떤 항목이 어떻게
//    바뀌었는지 "변경이력" 시트에 한 줄씩 남긴다(항목별 상세는 E열 JSON).
//  - 시트가 너무 커지지 않도록 최근 CHANGE_LOG_MAX_ROWS_건만 보관한다.
// ============================================================
var CHANGE_LOG_SHEET_NAME_ = '변경이력';
var CHANGE_LOG_MAX_ROWS_ = 500;

function getChangeLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CHANGE_LOG_SHEET_NAME_);
  if (!sheet) {
    sheet = ss.insertSheet(CHANGE_LOG_SHEET_NAME_);
    var headers = ['시간', '구분', '대상', '요약', '상세JSON'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setBackground('#1D2330').setFontColor('#FFFFFF').setFontWeight('bold').setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// changes: [{ field, label, before, after }, ...] — 실제로 값이 달라진 항목만 넘겨야 한다.
function logChange_(category, target, changes) {
  try {
    if (!changes || !changes.length) return;
    var sheet = getChangeLogSheet_();
    var summary = changes.map(function (c) {
      var before = (c.before === '' || c.before == null) ? '(없음)' : String(c.before);
      var after = (c.after === '' || c.after == null) ? '(없음)' : String(c.after);
      return c.label + ': ' + before + ' → ' + after;
    }).join(', ');
    sheet.appendRow([new Date(), category, target, summary, JSON.stringify(changes)]);

    // 오래된 기록 정리 (최근 CHANGE_LOG_MAX_ROWS_건만 유지)
    var lastRow = sheet.getLastRow();
    if (lastRow > CHANGE_LOG_MAX_ROWS_ + 1) {
      sheet.deleteRows(2, lastRow - (CHANGE_LOG_MAX_ROWS_ + 1));
    }
  } catch (err) {
    Logger.log('logChange_ 실패: ' + err.message);
  }
}

function apiChangeLog_() {
  try {
    var sheet = getChangeLogSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonOut_({ ok: true, log: [] });
    var count = Math.min(10, lastRow - 1);
    var values = sheet.getRange(lastRow - count + 1, 1, count, 4).getValues();
    var out = [];
    for (var i = values.length - 1; i >= 0; i--) {
      var r = values[i];
      out.push({
        time: r[0] instanceof Date ? Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : String(r[0]),
        category: r[1], target: r[2], summary: r[3]
      });
    }
    return jsonOut_({ ok: true, log: out });
  } catch (err) {
    return errorOut_(err.message, 'CHANGELOG_FAILED');
  }
}

// ============================================================
// 자동 백업(30일 보관) — 설정 화면에서 대상을 선택하면 매일 새벽 3시에
// Google Drive의 "계약관리_자동백업" 폴더에 시트별 JSON 스냅샷을 저장하고,
// 보관 기간이 지난 백업은 자동으로 삭제한다. 필요 시 특정 백업 시점으로
// 해당 시트를 되돌릴 수 있다(복원 직전 현재 상태도 별도로 안전 백업한다).
// ============================================================
var BACKUP_FOLDER_NAME_ = '계약관리_자동백업';
var BACKUP_SETTINGS_KEY_ = 'BACKUP_SETTINGS_';
var BACKUP_TARGETS_ = {
  contracts: { label: '계약 정보 (계약관리 시트)', getSheet: function () { return getDbSheet_(); } },
  clients: {
    label: '거래처 정보 (거래처관리 시트)',
    getSheet: function () {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return ss.getSheetByName(typeof PARTNER_SHEET_NAME !== 'undefined' ? PARTNER_SHEET_NAME : '거래처관리');
    }
  },
  subcontractors: { label: '도급업체 정보', getSheet: function () { return getOrCreateSubcontractorSheet_().sheet; } },
  expenseLog: { label: '지출품의서 이력', getSheet: function () { return getExpenseLogSheet_(); } }
};

function getBackupFolder_() {
  var root = DriveApp.getRootFolder();
  var it = root.getFoldersByName(BACKUP_FOLDER_NAME_);
  if (it.hasNext()) return it.next();
  return root.createFolder(BACKUP_FOLDER_NAME_);
}

function getBackupSettings_() {
  var def = { sheets: { contracts: true, clients: true, subcontractors: true, expenseLog: true }, retentionDays: 30 };
  var raw = PropertiesService.getScriptProperties().getProperty(BACKUP_SETTINGS_KEY_);
  if (!raw) return def;
  try {
    var parsed = JSON.parse(raw);
    return { sheets: Object.assign({}, def.sheets, parsed.sheets || {}), retentionDays: Number(parsed.retentionDays) || 30 };
  } catch (err) {
    return def;
  }
}

function apiGetBackupSettings_() {
  try {
    return jsonOut_({
      ok: true,
      settings: getBackupSettings_(),
      targets: Object.keys(BACKUP_TARGETS_).map(function (k) { return { key: k, label: BACKUP_TARGETS_[k].label }; })
    });
  } catch (err) {
    return errorOut_(err.message, 'BACKUP_SETTINGS_FAILED');
  }
}

function apiSaveBackupSettings_(payload) {
  var p = payload || {};
  var settings = { sheets: p.sheets || {}, retentionDays: Number(p.retentionDays) || 30 };
  PropertiesService.getScriptProperties().setProperty(BACKUP_SETTINGS_KEY_, JSON.stringify(settings));

  // 매일 새벽 3시에 자동 실행되는 트리거를 (재)설치
  try {
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function (t) { if (t.getHandlerFunction() === 'runDailyBackup_') ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('runDailyBackup_').timeBased().atHour(3).everyDays(1).create();
  } catch (err) {
    return jsonOut_({ ok: true, settings: settings, triggerWarning: '자동 실행 예약에 실패했습니다(Apps Script 편집기에서 runDailyBackup_ 함수를 한 번 직접 실행해 권한을 승인해주세요): ' + err.message });
  }
  return jsonOut_({ ok: true, settings: settings });
}

// 매일 자동 실행(트리거) — "지금 백업" 버튼으로 수동 실행도 가능
function runDailyBackup_() {
  var settings = getBackupSettings_();
  var folder = getBackupFolder_();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var created = [];

  Object.keys(BACKUP_TARGETS_).forEach(function (key) {
    if (!settings.sheets[key]) return;
    try {
      var sheet = BACKUP_TARGETS_[key].getSheet();
      if (!sheet) return;
      var values = sheet.getDataRange().getValues();
      var payload = {
        key: key, label: BACKUP_TARGETS_[key].label, sheetName: sheet.getName(),
        backedUpAt: new Date().toISOString(), rows: values
      };
      var filename = 'backup_' + key + '_' + today + '.json';
      var existing = folder.getFilesByName(filename);
      while (existing.hasNext()) existing.next().setTrashed(true); // 같은 날 재실행 시 최신 내용으로 교체
      folder.createFile(filename, JSON.stringify(payload), MimeType.PLAIN_TEXT);
      created.push(filename);
    } catch (err) {
      Logger.log('runDailyBackup_ 실패(' + key + '): ' + err.message);
    }
  });

  // 보관 기간이 지난 백업 삭제
  try {
    var cutoff = new Date(Date.now() - (settings.retentionDays || 30) * 24 * 60 * 60 * 1000);
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      if (f.getDateCreated() < cutoff) f.setTrashed(true);
    }
  } catch (err) {
    Logger.log('백업 정리 실패: ' + err.message);
  }

  return created;
}

function apiRunBackupNow_() {
  try {
    var created = runDailyBackup_();
    return jsonOut_({ ok: true, created: created });
  } catch (err) {
    return errorOut_(err.message, 'BACKUP_FAILED');
  }
}

function apiListBackups_() {
  try {
    var folder = getBackupFolder_();
    var files = folder.getFiles();
    var out = [];
    while (files.hasNext()) {
      var f = files.next();
      var name = f.getName();
      var m = name.match(/^backup_([a-zA-Z]+)_(\d{4}-\d{2}-\d{2})\.json$/);
      if (!m) continue; // restore-before_* 안전백업 등은 목록에 노출하지 않음
      out.push({
        id: f.getId(), name: name, key: m[1], date: m[2],
        label: BACKUP_TARGETS_[m[1]] ? BACKUP_TARGETS_[m[1]].label : name,
        createdAt: f.getDateCreated().toISOString(), size: f.getSize()
      });
    }
    out.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
    return jsonOut_({ ok: true, backups: out.slice(0, 60) });
  } catch (err) {
    return errorOut_(err.message, 'BACKUP_LIST_FAILED');
  }
}

// 선택한 백업 파일 시점으로 해당 시트를 되돌린다(시트 전체 덮어쓰기).
// 되돌리기 직전 현재 상태도 "복원 전" 안전 백업으로 별도 저장해둔다.
function apiRestoreBackup_(payload) {
  var p = payload || {};
  var fileId = p.fileId;
  if (!fileId) return errorOut_('백업 파일 ID가 필요합니다.', 'BAD_PARAM');
  try {
    var file = DriveApp.getFileById(fileId);
    var data = JSON.parse(file.getBlob().getDataAsString());
    var key = data.key;
    if (!BACKUP_TARGETS_[key]) return errorOut_('알 수 없는 백업 대상입니다: ' + key, 'BAD_TARGET');
    var sheet = BACKUP_TARGETS_[key].getSheet();
    if (!sheet) return errorOut_('복원할 시트를 찾지 못했습니다.', 'NOT_FOUND');

    try {
      var folder = getBackupFolder_();
      var nowTag = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
      var preValues = sheet.getDataRange().getValues();
      folder.createFile(
        'restore-before_' + key + '_' + nowTag + '.json',
        JSON.stringify({ key: key, label: BACKUP_TARGETS_[key].label, sheetName: sheet.getName(), backedUpAt: new Date().toISOString(), rows: preValues }),
        MimeType.PLAIN_TEXT
      );
    } catch (err) {
      Logger.log('복원 전 안전 백업 실패: ' + err.message);
    }

    sheet.clearContents();
    if (data.rows && data.rows.length) {
      sheet.getRange(1, 1, data.rows.length, data.rows[0].length).setValues(data.rows);
    }
    SpreadsheetApp.flush();

    logChange_('백업 복원', BACKUP_TARGETS_[key].label, [
      { field: 'restore', label: '복원', before: '현재 데이터', after: (data.backedUpAt || file.getName()) + ' 시점으로 복원' }
    ]);

    return jsonOut_({ ok: true, key: key, restoredRows: data.rows ? data.rows.length : 0 });
  } catch (err) {
    return errorOut_(err.message, 'RESTORE_FAILED');
  }
}

// ============================================================
// 로컬 테스트 (편집기에서 실행해서 결과 확인)
// ============================================================
function testBootstrap() {
  var out = apiBootstrap_();
  Logger.log(out.getContent().substring(0, 1500));
}

function testPayments() {
  Logger.log(apiListPayments_(58).getContent());
}
