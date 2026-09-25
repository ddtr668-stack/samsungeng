// ============================================================
// 지출품의서 생성 (HTML 문서 + PDF 저장 방식)
//
// 이 파일은 기존 프로젝트(Code.gs, BusinessTools.gs, ProgressPayment.gs)와
// 같은 Apps Script 프로젝트에 새 스크립트 파일로 추가해서 사용합니다.
// DB_SHEET_NAME, DATA_START_ROW, PROJECT_COL, getDbSheet_() 등은 Code.gs에,
// listEstimateFiles/listCostFiles/getOrCreateProjectSubfolder_/
// insertConvertedDriveFile_ 등은 BusinessTools.gs에 이미 정의되어 있으므로
// 이 파일에서는 재사용만 합니다.
//
// 동작 방식: 지출품의서는 더 이상 스프레드시트 탭으로 만들지 않고, 디자인된
// HTML 문서를 만든 뒤 Google Docs로 변환 -> PDF로 내보내 프로젝트 Drive
// 폴더에 저장합니다. "지출품의서이력" 시트는 생성 기록을 모아보는 관리용
// 대장이며, 잘못 만든 건을 취소 처리(기록 보존 + PDF 휴지통 이동)할 수
// 있습니다.
//
// DB 시트 컬럼 참고
// D열: 거래처   E열: 프로젝트명   F열: 총계약금   K열: 제품대
// L열: 도급업체 M열: 도급금액     N열: 기성금액   O열: 잔액
// P열: 부대비용 Q열: 영업비       T열: 이윤       U열: 마진율
// ============================================================

var EXPENSE_DOC_TITLE = '설치비 지급 품의서';
var EXPENSE_LOG_SHEET_NAME = '지출품의서이력';
var EXPENSE_FOLDER_NAME = '지출품의서';

// ============================================================
// 메뉴에서 호출 - 현재 선택된 DB 행 기준으로 다이얼로그 실행
// (Code.gs의 onOpen()에 아래 두 줄을 추가해서 메뉴에 연결하세요)
//   .addItem('🧾 지출품의서 생성', 'showExpenseRequestDialog')
//   .addItem('🚫 지출품의서 취소 처리 (이력 시트에서 행 선택 후 실행)', 'cancelSelectedExpenseRequest')
// ============================================================

function showExpenseRequestDialog() {
  var row = getActiveRowNumber(); // Code.gs에 이미 정의됨

  if (row === 'new') {
    SpreadsheetApp.getUi().alert(
      'DB 시트에서 지출품의서를 만들 프로젝트 행을 먼저 선택해주세요.'
    );
    return;
  }

  var template = HtmlService.createTemplateFromFile('ExpenseRequestDialog');
  template.row = row;

  var html = template.evaluate().setWidth(1010).setHeight(820);

  SpreadsheetApp.getUi().showModelessDialog(html, '🧾 지출품의서 생성'); // 모덜리스 다이얼로그 - 마우스로 위치 이동 가능
}

// ============================================================
// 거래처관리 시트에서 상호로 사업자정보 조회
// ============================================================

function lookupPartnerInfo_(companyName) {
  var empty = {
    bizNo: '', ceo: '', address: '', phone: ''
  };

  if (!companyName) return empty;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(PARTNER_SHEET_NAME);
  if (!sheet) return empty;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return empty;

  // A:사업자등록번호 B:상호 C:대표자 D:주소 ... L:전화번호
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();

  for (var i = 0; i < values.length; i++) {
    var name = (values[i][1] || '').toString().trim();
    if (name === companyName.toString().trim()) {
      return {
        bizNo: values[i][0] || '',
        ceo: values[i][2] || '',
        address: values[i][3] || '',
        phone: values[i][11] || ''
      };
    }
  }

  return empty;
}

// ============================================================
// 업로드된 파일에서 제품내역서 / 설치비 내역서 항목 가져오기
// (Drive 폴더/조회 로직은 BusinessTools.gs의 listEstimateFiles,
//  listCostFiles, getOrCreateProjectSubfolder_, insertConvertedDriveFile_
//  를 그대로 사용합니다)
// ============================================================

var PRODUCT_LABEL_MAP_ = {
  name: ['품명'],
  model: ['모델'],
  unit: ['단위'],
  qty: ['수량'],
  unitPrice: ['단가'],
  listPrice: ['출고가(VAT포함)', '출고가'],
  dc: ['DC']
};

var INSTALL_LABEL_MAP_ = {
  name: ['품목/작업내용', '품목', '작업내용', '구분'],
  spec: ['규격'],
  qty: ['수량'],
  unit: ['단위'],
  unitPrice: ['단가'],
  note: ['비고']
};

var NUMERIC_ITEM_KEYS_ = {
  product: ['qty', 'unitPrice', 'listPrice', 'dc'],
  install: ['qty', 'unitPrice']
};

// 제품대 폴더에 업로드된 파일 목록 (다이얼로그 드롭다운용)
function listProductEstimateFiles(row) {
  return listEstimateFiles(row); // BusinessTools.gs
}

// 설치비및부대비용 폴더에 업로드된 파일 목록 (다이얼로그 드롭다운용)
function listInstallCostFiles(row) {
  return listCostFiles(row, '도급금액'); // BusinessTools.gs
}

function openSheetValues_(row, fileId, folderName) {
  var folder = getOrCreateProjectSubfolder_(row, folderName); // BusinessTools.gs
  var iterator = folder.getFiles();
  var source = null;

  while (iterator.hasNext()) {
    var f = iterator.next();
    if (f.getId() === fileId) { source = f; break; }
  }
  if (!source) throw new Error('선택한 파일을 해당 프로젝트 폴더에서 찾지 못했습니다.');

  var spreadsheetId = source.getId();
  var temporaryId = '';

  if (source.getMimeType() !== MimeType.GOOGLE_SHEETS) {
    var converted = insertConvertedDriveFile_({ // BusinessTools.gs
      title: '[임시가져오기] ' + source.getName(),
      mimeType: MimeType.GOOGLE_SHEETS
    }, source.getBlob(), { convert: true });
    spreadsheetId = converted.id;
    temporaryId = converted.id;
  }

  try {
    var ss = SpreadsheetApp.openById(spreadsheetId);
    var sheets = ss.getSheets().map(function (sheet) {
      var rows = Math.min(Math.max(sheet.getLastRow(), 1), 300);
      var cols = Math.min(Math.max(sheet.getLastColumn(), 1), 30);
      return { name: sheet.getName(), values: sheet.getRange(1, 1, rows, cols).getDisplayValues() };
    });
    return { fileName: source.getName(), sheets: sheets };
  } finally {
    if (temporaryId) {
      try { DriveApp.getFileById(temporaryId).setTrashed(true); } catch (ignore) {}
    }
  }
}

function findLabelColumn_(headerRow, labels) {
  for (var c = 0; c < headerRow.length; c++) {
    var text = String(headerRow[c] || '').replace(/\s/g, '');
    for (var i = 0; i < labels.length; i++) {
      if (text === labels[i].replace(/\s/g, '')) return c;
    }
  }
  return -1;
}

function cleanNumber_(v) {
  var n = Number(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) && String(v).trim() !== '' ? n : '';
}

// values(2차원 배열)에서 labelMap의 헤더가 있는 행을 찾아 그 아래 데이터를 추출.
// 헤더가 2행에 걸쳐 있는 경우(예: '재료비' 아래 '단가'/'금액'이 다음 행에
// 있는 경우)도 대응합니다.
function extractItemsFromValues_(values, labelMap, numericKeys) {
  var keys = Object.keys(labelMap);
  var primaryKey = keys[0];

  for (var r = 0; r < values.length; r++) {
    var cols = {};
    var usedSecondRow = false;

    keys.forEach(function (key) {
      var idx = findLabelColumn_(values[r], labelMap[key]);
      if (idx !== -1) {
        cols[key] = idx;
        return;
      }
      if (r + 1 < values.length) {
        var idx2 = findLabelColumn_(values[r + 1], labelMap[key]);
        if (idx2 !== -1) {
          cols[key] = idx2;
          usedSecondRow = true;
        }
      }
    });

    if (cols[primaryKey] === undefined) continue;

    var dataStart = usedSecondRow ? r + 2 : r + 1;
    var items = [];
    for (var dr = dataStart; dr < values.length; dr++) {
      var nameVal = String(values[dr][cols[primaryKey]] || '').trim();
      var stripped = nameVal.replace(/\s/g, '');
      if (!nameVal || stripped.indexOf('합계') === 0) break;

      var item = {};
      keys.forEach(function (key) {
        if (cols[key] === undefined) return;
        var raw = values[dr][cols[key]];
        item[key] = numericKeys.indexOf(key) !== -1 ? cleanNumber_(raw) : raw;
      });
      items.push(item);
    }

    if (items.length) return { headerRow: r + 1, sheetRow: r, items: items };
  }

  return null;
}

// 다이얼로그에서 파일 선택 후 "가져오기"를 누르면 호출
// kind: 'product'(제품내역서, 제품대 폴더) | 'install'(설치비 내역서, 설치비및부대비용 폴더)
function importItemsFromFile(row, fileId, kind) {
  row = Number(row);
  if (!row || row < DATA_START_ROW) return { error: '올바른 프로젝트 행이 아닙니다.' };

  try {
    var folderName = kind === 'product' ? '제품대' : '설치비및부대비용';
    var labelMap = kind === 'product' ? PRODUCT_LABEL_MAP_ : INSTALL_LABEL_MAP_;
    var numericKeys = NUMERIC_ITEM_KEYS_[kind] || [];

    var data = openSheetValues_(row, fileId, folderName);

    for (var i = 0; i < data.sheets.length; i++) {
      var extracted = extractItemsFromValues_(data.sheets[i].values, labelMap, numericKeys);
      if (extracted) {
        return {
          success: true,
          fileName: data.fileName,
          sheetName: data.sheets[i].name,
          items: extracted.items
        };
      }
    }

    return {
      error: data.fileName + ' 파일에서 표 헤더(' +
        (kind === 'product' ? '품명' : '품목/작업내용') +
        ')를 찾지 못했습니다. 직접 입력해주세요.'
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ============================================================
// 업로드 파일이 없을 때: 정해진 양식으로 신규 엑셀(Google Sheets) 파일을
// Drive의 해당 프로젝트 폴더에 생성 (사용자가 열어서 입력 후, 나중에
// "가져오기"로 다시 불러올 수 있음)
// ============================================================

function nextTemplateFileName_(folder, baseName) {
  var escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  var pattern = new RegExp('^' + escaped + '_ver(\\d+)$', 'i');
  var next = 1;
  var files = folder.getFiles();
  while (files.hasNext()) {
    var m = files.next().getName().match(pattern);
    if (m) next = Math.max(next, Number(m[1]) + 1);
  }
  return baseName + '_ver' + next;
}

var TEMPLATE_BLANK_ROWS_ = 15;

// 설치비 내역서 신규 양식 파일 생성 (품목/작업내용 | 규격 | 수량 | 단위 | 단가 | 금액 | 비고)
function createInstallCostTemplateFile(row) {
  row = Number(row);
  if (!row || row < DATA_START_ROW) return { error: '올바른 프로젝트 행이 아닙니다.' };

  var projectName = getDbSheet_().getRange(row, PROJECT_COL).getDisplayValue().trim() || ('프로젝트_' + row);
  var folder = getOrCreateProjectSubfolder_(row, '설치비및부대비용');
  var name = nextTemplateFileName_(folder, projectName + '_설치비내역서');

  var ss = SpreadsheetApp.create(name);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);

  var sheet = ss.getSheets()[0];
  sheet.setName('설치비내역서');

  var headers = ['품목/작업내용', '규격', '수량', '단위', '단가', '금액', '비고'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#2E5B8A').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');

  var first = 2;
  var last = first + TEMPLATE_BLANK_ROWS_ - 1;
  for (var r = first; r <= last; r++) {
    sheet.getRange(r, 6).setFormula('=IF(C' + r + '="","",C' + r + '*E' + r + ')');
  }
  sheet.getRange(first, 5, TEMPLATE_BLANK_ROWS_, 2).setNumberFormat('#,##0"원"');

  var totalRow = last + 1;
  sheet.getRange(totalRow, 1).setValue('합계 (VAT포함)').setFontWeight('bold');
  sheet.getRange(totalRow, 6).setFormula('=SUM(F' + first + ':F' + last + ')').setNumberFormat('#,##0"원"').setFontWeight('bold');
  sheet.getRange(totalRow, 7).setValue('모든 금액 부가세 포함');

  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 90);
  sheet.setColumnWidth(3, 70);
  sheet.setColumnWidth(4, 70);
  sheet.setColumnWidth(5, 110);
  sheet.setColumnWidth(6, 110);
  sheet.setColumnWidth(7, 200);

  return { success: true, fileId: file.getId(), fileName: name, fileUrl: ss.getUrl() };
}

// 제품내역서 신규 양식 파일 생성 (품명 | 모델 | 단위 | 수량 | 재료비(단가·금액) | 출고가(VAT포함) | DC)
function createProductEstimateTemplateFile(row) {
  row = Number(row);
  if (!row || row < DATA_START_ROW) return { error: '올바른 프로젝트 행이 아닙니다.' };

  var projectName = getDbSheet_().getRange(row, PROJECT_COL).getDisplayValue().trim() || ('프로젝트_' + row);
  var folder = getOrCreateProjectSubfolder_(row, '제품대');
  var name = nextTemplateFileName_(folder, projectName + '_제품내역서');

  var ss = SpreadsheetApp.create(name);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(folder);

  var sheet = ss.getSheets()[0];
  sheet.setName('제품내역서');

  var h1 = 1, h2 = 2;
  ['품명', '모델', '단위', '수량'].forEach(function (h, i) {
    var col = 1 + i;
    sheet.getRange(h1, col, 2, 1).merge();
    sheet.getRange(h1, col).setValue(h);
  });
  sheet.getRange(h1, 5, 1, 2).merge().setValue('재 료 비');
  sheet.getRange(h2, 5).setValue('단 가');
  sheet.getRange(h2, 6).setValue('금 액');
  ['출고가(VAT포함)', 'DC'].forEach(function (h, i) {
    var col = 7 + i;
    sheet.getRange(h1, col, 2, 1).merge();
    sheet.getRange(h1, col).setValue(h);
  });

  sheet.getRange(h1, 1, 2, 8)
    .setBackground('#2E5B8A').setFontColor('#FFFFFF').setFontWeight('bold')
    .setHorizontalAlignment('center');

  var first = h2 + 1;
  var last = first + TEMPLATE_BLANK_ROWS_ - 1;
  for (var r = first; r <= last; r++) {
    sheet.getRange(r, 6).setFormula('=IF(D' + r + '="","",D' + r + '*E' + r + ')');
  }
  sheet.getRange(first, 5, TEMPLATE_BLANK_ROWS_, 2).setNumberFormat('#,##0"원"');
  sheet.getRange(first, 7, TEMPLATE_BLANK_ROWS_, 1).setNumberFormat('#,##0"원"');
  sheet.getRange(first, 8, TEMPLATE_BLANK_ROWS_, 1).setNumberFormat('0%');

  var totalRow = last + 1;
  sheet.getRange(totalRow, 1, 1, 5).merge().setValue('합 계').setFontWeight('bold');
  sheet.getRange(totalRow, 6).setFormula('=SUM(F' + first + ':F' + last + ')').setNumberFormat('#,##0"원"').setFontWeight('bold');

  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 150);
  for (var c = 3; c <= 8; c++) sheet.setColumnWidth(c, 100);

  return { success: true, fileId: file.getId(), fileName: name, fileUrl: ss.getUrl() };
}

// ============================================================
// DB에서 프로젝트 기초 데이터 조회
// ============================================================

function getExpenseRequestSeed(row) {
  row = Number(row);

  if (!row || row < DATA_START_ROW) {
    return { error: '올바른 프로젝트 행이 아닙니다.' };
  }

  var db = getDbSheet_();

  var num = function (col) {
    var v = db.getRange(row, col).getValue();
    return typeof v === 'number' ? v : (Number(v) || 0);
  };

  var text = function (col) {
    return db.getRange(row, col).getDisplayValue().trim();
  };

  var client = text(4);       // D 거래처
  var project = text(5);      // E 프로젝트명
  var contractor = text(12);  // L 도급업체
  var totalContract = num(6); // F 총계약금
  var productCost = num(11);  // K 제품대 (텍스트면 0)
  var subAmount = num(13);    // M 도급금액
  var progressAmount = num(14); // N 기성금액
  var etcCost = num(16);      // P 부대비용
  var salesCost = num(17);    // Q 영업비

  var clientInfo = lookupPartnerInfo_(client);
  var contractorInfo = lookupPartnerInfo_(contractor);

  return {
    row: row,
    client: client,
    project: project,
    contractor: contractor,
    totalContract: totalContract,
    productCost: productCost,
    subAmount: subAmount,
    progressAmount: progressAmount,
    remaining: subAmount - progressAmount,
    etcCost: etcCost,
    salesCost: salesCost,
    clientInfo: clientInfo,
    contractorInfo: contractorInfo
  };
}

// ============================================================
// 숫자 -> 한글 금액 ("일금일천일백만원정" 형식)
// ============================================================

function numberToKoreanMoney_(amount) {
  amount = Math.round(Number(amount) || 0);
  if (amount === 0) return '일금영원정';

  var digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  var smallUnits = ['', '십', '백', '천'];
  var bigUnits = ['', '만', '억', '조'];

  var str = String(amount);
  var groups = [];
  while (str.length > 0) {
    groups.unshift(str.slice(-4));
    str = str.slice(0, -4);
  }

  var result = '';
  for (var g = 0; g < groups.length; g++) {
    var groupNum = groups[g];
    var groupStr = '';
    for (var i = 0; i < groupNum.length; i++) {
      var d = Number(groupNum[i]);
      var place = groupNum.length - i - 1;
      if (d === 0) continue;
      groupStr += digits[d] + smallUnits[place];
    }
    if (groupStr) {
      result += groupStr + bigUnits[groups.length - g - 1];
    }
  }

  return '일금' + result + '원정';
}

// ============================================================
// payload 정리 + 계산 + HTML 생성 + PDF 저장
// ============================================================

// payload(다이얼로그에서 넘어온 값)와 DB 시드값을 합쳐서 계산에 필요한 모든 값을
// 한 번에 정리. generateExpenseRequestOutput()과 computeExpenseRequestPreview()가
// 공통으로 사용 (실제 저장 여부와 무관하게 "무엇을 쓸지"는 동일해야 하므로)
function resolveExpensePayload_(row, payload) {
  row = Number(row);
  payload = payload || {};

  if (!row || row < DATA_START_ROW) {
    throw new Error('올바른 프로젝트 행이 아닙니다.');
  }

  var seed = getExpenseRequestSeed(row);
  if (seed.error) throw new Error(seed.error);

  var requestAmount = Number(payload.requestAmount) || seed.remaining || seed.subAmount;
  var manager = payload.manager || '';
  var docDate = payload.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var installItems = Array.isArray(payload.installItems) ? payload.installItems : [];
  var productItems = Array.isArray(payload.productItems) ? payload.productItems : [];
  var commissionItems = Array.isArray(payload.commissionItems) ? payload.commissionItems : [];
  var etcCostItems = Array.isArray(payload.etcCostItems) ? payload.etcCostItems : [];
  var commission = payload.commission !== '' && payload.commission != null ? Number(payload.commission) : seed.salesCost;
  var etcCost = payload.etcCost !== '' && payload.etcCost != null ? Number(payload.etcCost) : seed.etcCost;
  var attachments = payload.attachments || '세금계산서, 통장사본 1부';
  var prevProgress = Number(payload.prevProgress) || 0;
  var afterProgress = prevProgress + requestAmount;
  var paymentCount = payload.paymentCount || '1';

  return {
    seed: seed, requestAmount: requestAmount, manager: manager, docDate: docDate,
    installItems: installItems, productItems: productItems,
    commissionItems: commissionItems, etcCostItems: etcCostItems,
    commission: commission, etcCost: etcCost,
    attachments: attachments,
    prevProgress: prevProgress, afterProgress: afterProgress, paymentCount: paymentCount
  };
}

// resolveExpensePayload_() 결과를 바탕으로 화면/문서에 필요한 모든 계산값을
// 만든다. computeExpenseRequestPreview()와 generateExpenseRequestOutput()가
// 공통으로 사용 (미리보기와 실제 생성이 항상 같은 숫자를 쓰도록)
function computeCalc_(v) {
  var seed = v.seed;

  var installRows = v.installItems.map(function (item) {
    var qty = Number(item.qty) || 0;
    var unitPrice = Number(item.unitPrice) || 0;
    return {
      name: item.name || '', spec: item.spec || '', qty: qty, unit: item.unit || '',
      unitPrice: unitPrice, amount: qty * unitPrice, note: item.note || ''
    };
  });
  var installTotal = installRows.reduce(function (s, r) { return s + r.amount; }, 0);

  var productRows = v.productItems.map(function (item) {
    var qty = Number(item.qty) || 0;
    var unitPrice = Number(item.unitPrice) || 0;
    return {
      name: item.name || '', model: item.model || '', unit: item.unit || '',
      qty: qty, unitPrice: unitPrice, amount: qty * unitPrice,
      listPrice: item.listPrice === '' || item.listPrice == null ? '' : Number(item.listPrice),
      dc: item.dc === '' || item.dc == null ? '' : Number(item.dc)
    };
  });
  var productTotal = productRows.reduce(function (s, r) { return s + r.amount; }, 0);

  var a = seed.totalContract;
  var a1 = productTotal;              // 장비대(a1) = 제품내역서 합계
  var c = installTotal;               // 도급비(c) = 설치비 내역서 합계
  var f = v.commission;
  var g = v.etcCost;
  var profit = a - a1 - c - f - g;    // 예상손익계 = a - a1 - c - f - g
  var marginRate = a ? profit / a : 0;

  return {
    koreanAmount: numberToKoreanMoney_(v.requestAmount),
    requestAmount: v.requestAmount,
    prevProgress: v.prevProgress,
    afterProgress: v.afterProgress,
    remainingAfter: c - v.afterProgress,   // 설치비 내역서 합계(c) 기준
    paymentCount: v.paymentCount,
    installRows: installRows,
    installTotal: installTotal,
    productRows: productRows,
    productTotal: productTotal,
    commissionItems: v.commissionItems,
    etcCostItems: v.etcCostItems,
    pnl: { a: a, a1: a1, c: c, f: f, g: g, profit: profit, marginRate: marginRate }
  };
}

// 다이얼로그의 "미리보기" 버튼에서 호출 - 시트/파일에 아무것도 쓰지 않고
// 실제 생성될 것과 동일한 HTML을 만들어서 돌려준다
function computeExpenseRequestPreview(row, payload) {
  try {
    var v = resolveExpensePayload_(row, payload);
    var calc = computeCalc_(v);
    var html = buildExpenseRequestHtml_(v, calc, '(생성 시 자동 부여)');
    return { success: true, html: html };
  } catch (err) {
    return { error: err.message };
  }
}

function escapeHtml_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtMoney_(n) {
  return (Math.round(Number(n) || 0)).toLocaleString() + '원';
}

function fmtPct_(rate) {
  return (Math.round((Number(rate) || 0) * 1000) / 10) + '%';
}

// 테이블 기반 레이아웃으로 HTML 문서를 만든다 (Google Docs 변환 호환을 위해
// flex/grid 대신 <table>만 사용)
function buildExpenseRequestHtml_(v, calc, docNumber) {
  var seed = v.seed;
  var p = calc.pnl;

  var installRowsHtml = calc.installRows.map(function (r) {
    return '<tr>' +
      '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.name) + '</td>' +
      '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.spec) + '</td>' +
      '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + r.qty + '</td>' +
      '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.unit) + '</td>' +
      '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + fmtMoney_(r.unitPrice) + '</td>' +
      '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + fmtMoney_(r.amount) + '</td>' +
      '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.note) + '</td>' +
      '</tr>';
  }).join('');

  var productSection = (function () {
    var productRowsHtml = calc.productRows.length
      ? calc.productRows.map(function (r) {
          return '<tr>' +
            '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.name) + '</td>' +
            '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.model) + '</td>' +
            '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(r.unit) + '</td>' +
            '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + r.qty + '</td>' +
            '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + fmtMoney_(r.unitPrice) + '</td>' +
            '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + fmtMoney_(r.amount) + '</td>' +
            '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + (r.listPrice === '' ? '' : fmtMoney_(r.listPrice)) + '</td>' +
            '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + (r.dc === '' ? '' : r.dc + '%') + '</td>' +
            '</tr>';
        }).join('')
      : '<tr><td colspan="8" style="padding:10px 4px;color:#999;border-bottom:1px solid #eee;">등록된 품목이 없습니다.</td></tr>';

    return '<tr><td style="padding-top:24px;">' + sectionTitle_('제품내역서') + '</td></tr>' +
      '<tr><td>' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse;table-layout:fixed;">' +
        '<colgroup><col style="width:20%"><col style="width:16%"><col style="width:7%"><col style="width:7%">' +
        '<col style="width:12%"><col style="width:12%"><col style="width:14%"><col style="width:8%"></colgroup>' +
        '<tr>' +
          headerCell_('품명') + headerCell_('모델') + headerCell_('단위') +
          headerCell_('수량', 'right') + headerCell_('단가', 'right') + headerCell_('금액', 'right') +
          headerCell_('출고가(VAT포함)', 'right') + headerCell_('DC', 'right') +
        '</tr>' +
        productRowsHtml +
        '<tr><td colspan="5" style="padding:8px 4px;font-weight:bold;border-top:1px solid #999;">합계</td>' +
        '<td align="right" style="padding:8px 4px;font-weight:bold;border-top:1px solid #999;">' + fmtMoney_(calc.productTotal) + '</td>' +
        '<td colspan="2" style="border-top:1px solid #999;"></td></tr>' +
        '</table>' +
      '</td></tr>' +
      amountItemsSection_('영업수수료(f) 내역', calc.commissionItems) +
      amountItemsSection_('기타경비(g) 내역', calc.etcCostItems);
  })();

  function amountItemsSection_(title, items) {
    if (!items || !items.length) return '';
    var rowsHtml = items.map(function (item) {
      return '<tr>' +
        '<td align="right" style="padding:6px 4px;border-bottom:1px solid #eee;">' + fmtMoney_(item.amount) + '</td>' +
        '<td style="padding:6px 4px;border-bottom:1px solid #eee;">' + escapeHtml_(item.note) + '</td>' +
        '</tr>';
    }).join('');
    var total = items.reduce(function (s, item) { return s + (Number(item.amount) || 0); }, 0);

    return '<tr><td style="padding-top:20px;">' + sectionTitle_(title) + '</td></tr>' +
      '<tr><td>' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse;">' +
        '<tr>' + headerCell_('금액', 'right') + headerCell_('비고') + '</tr>' +
        rowsHtml +
        '<tr><td align="right" style="padding:8px 4px;font-weight:bold;border-top:1px solid #999;">' + fmtMoney_(total) + '</td>' +
        '<td style="padding:8px 4px;font-weight:bold;border-top:1px solid #999;">합계</td></tr>' +
        '</table>' +
      '</td></tr>';
  }

  function sectionTitle_(text) {
    return '<div style="font-size:13px;font-weight:bold;color:#555;border-bottom:2px solid #185fa5;padding-bottom:4px;margin-bottom:8px;">' + escapeHtml_(text) + '</div>';
  }
  function headerCell_(text, align) {
    return '<td style="padding:6px 4px;color:#888;font-weight:bold;border-bottom:1px solid #ddd;text-align:' + (align || 'left') + ';">' + escapeHtml_(text) + '</td>';
  }
  function infoCard_(label, value, sub) {
    return '<td width="50%" style="background-color:#f7f7f5;padding:12px 14px;vertical-align:top;">' +
      '<div style="font-size:11px;color:#999;">' + escapeHtml_(label) + '</div>' +
      '<div style="font-size:14px;font-weight:bold;margin-top:2px;">' + escapeHtml_(value) + '</div>' +
      (sub ? '<div style="font-size:12px;color:#666;margin-top:4px;">' + escapeHtml_(sub) + '</div>' : '') +
      '</td>';
  }
  function statCard_(label, value, opt) {
    opt = opt || {};
    var bg = opt.highlight ? '#fff2cc' : (opt.source ? '#eaf3de' : (opt.accent ? '#fdeee7' : (opt.tint === 'blue' ? '#e6f1fb' : '#f7f7f5')));
    var labelColor = opt.source ? '#3b6d11' : (opt.accent ? '#993c1d' : (opt.tint === 'blue' ? '#185fa5' : '#999'));
    return '<td width="' + (opt.width || '33%') + '" style="background-color:' + bg + ';padding:12px;vertical-align:top;">' +
      '<div style="font-size:11px;color:' + labelColor + ';">' + escapeHtml_(label) +
      (opt.source ? ' <span style="font-size:9px;">' + escapeHtml_(opt.source) + '</span>' : '') + '</div>' +
      '<div style="font-size:15px;font-weight:bold;margin-top:2px;">' + value + '</div>' +
      '</td>';
  }

  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:\'맑은 고딕\',sans-serif;color:#222;margin:0;padding:8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">' +

    '<tr><td style="font-size:22px;font-weight:bold;">' + escapeHtml_(EXPENSE_DOC_TITLE) + '</td></tr>' +
    '<tr><td style="font-size:11px;color:#888;padding:4px 0 16px;">문서번호 ' + escapeHtml_(docNumber) +
      ' · 작성일 ' + escapeHtml_(v.docDate) + ' · 작성자 ' + escapeHtml_(v.manager || '-') + '</td></tr>' +

    '<tr><td style="background-color:#eef4fb;padding:14px 18px;">' +
      '<table width="100%"><tr>' +
      '<td style="font-size:13px;color:#555;">' + escapeHtml_(calc.koreanAmount) + '</td>' +
      '<td align="right" style="font-size:20px;font-weight:bold;color:#0c447c;">' + fmtMoney_(calc.requestAmount) + '</td>' +
      '</tr></table>' +
    '</td></tr>' +

    '<tr><td style="height:20px;"></td></tr>' +
    '<tr><td>' + sectionTitle_('계약 내역') + '</td></tr>' +
    '<tr><td>' +
      '<table width="100%" cellpadding="0" cellspacing="6"><tr>' +
      infoCard_('거래처', seed.client, (seed.clientInfo.ceo || seed.clientInfo.phone) ? ((seed.clientInfo.ceo || '-') + ' · ' + (seed.clientInfo.phone || '-')) : '') +
      infoCard_('도급업체', seed.contractor, (seed.contractorInfo.ceo || seed.contractorInfo.phone) ? ((seed.contractorInfo.ceo || '-') + ' · ' + (seed.contractorInfo.phone || '-')) : '') +
      '</tr></table>' +
    '</td></tr>' +
    '<tr><td>' +
      '<table width="100%" cellpadding="0" cellspacing="6"><tr>' +
      infoCard_('공사명', seed.project, '') +
      infoCard_('공사계약금액', fmtMoney_(seed.totalContract), '') +
      '</tr></table>' +
    '</td></tr>' +

    '<tr><td style="height:12px;"></td></tr>' +
    '<tr><td>' + sectionTitle_('지급 요청 정보') + '</td></tr>' +
    '<tr><td>' +
      '<table width="100%" cellpadding="0" cellspacing="6"><tr>' +
      statCard_('설치비내역서 총금액', fmtMoney_(calc.installTotal), { tint: 'blue', width: '24%' }) +
      statCard_('기성횟수', escapeHtml_(v.paymentCount) + '회차', { accent: true, width: '13%' }) +
      statCard_('전회기성', fmtMoney_(calc.prevProgress), { width: '21%' }) +
      statCard_('금회 요청', fmtMoney_(calc.requestAmount), { width: '21%' }) +
      statCard_('잔액', fmtMoney_(calc.remainingAfter), { width: '21%' }) +
      '</tr></table>' +
    '</td></tr>' +

    '<tr><td style="height:16px;"></td></tr>' +
    '<tr><td>' + sectionTitle_('설치비 내역서') + '</td></tr>' +
    '<tr><td>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="font-size:12px;border-collapse:collapse;table-layout:fixed;">' +
      '<colgroup><col style="width:24%"><col style="width:14%"><col style="width:8%">' +
      '<col style="width:8%"><col style="width:14%"><col style="width:14%"><col style="width:18%"></colgroup>' +
      '<tr>' +
        headerCell_('품목/작업내용') + headerCell_('규격') + headerCell_('수량', 'right') +
        headerCell_('단위') + headerCell_('단가', 'right') + headerCell_('금액', 'right') + headerCell_('비고') +
      '</tr>' +
      installRowsHtml +
      '<tr><td colspan="5" style="padding:8px 4px;font-weight:bold;border-top:1px solid #999;">합계 (VAT포함)</td>' +
      '<td align="right" style="padding:8px 4px;font-weight:bold;border-top:1px solid #999;">' + fmtMoney_(calc.installTotal) + '</td><td style="border-top:1px solid #999;"></td></tr>' +
      '</table>' +
    '</td></tr>' +

    '<tr><td style="height:16px;"></td></tr>' +
    '<tr><td>' + sectionTitle_('손익계산서') + '</td></tr>' +
    '<tr><td>' +
      '<table width="100%" cellpadding="0" cellspacing="6">' +
      '<tr>' + statCard_('공사계약금액(a)', fmtMoney_(p.a)) + statCard_('장비대(a1)', fmtMoney_(p.a1), { source: '제품내역서 합계' }) + statCard_('도급비(c)', fmtMoney_(p.c), { source: '설치비내역서 합계' }) + '</tr>' +
      '<tr>' + statCard_('영업수수료(f)', fmtMoney_(p.f)) + statCard_('기타경비(g)', fmtMoney_(p.g)) + statCard_('예상손익계 (a-a1-c-f-g)', fmtMoney_(p.profit), { highlight: true }) + '</tr>' +
      '<tr>' + statCard_('예상수익율', fmtPct_(p.marginRate), { highlight: true }) + '<td width="33%"></td><td width="33%"></td></tr>' +
      '</table>' +
    '</td></tr>' +

    '<tr><td style="font-size:12px;color:#777;font-style:italic;padding-top:16px;">* 첨부서류 : ' + escapeHtml_(v.attachments) + '</td></tr>' +

    productSection +

    '</table></body></html>';

  return html;
}

// ============================================================
// HTML -> Google Docs 변환 -> PDF로 내보내 프로젝트 Drive 폴더에 저장
// ============================================================

// A4 세로(210x297mm) 페이지 크기 지정. Apps Script 편집기에서 서비스(+) ->
// "Google Docs API"를 추가해야 동작합니다. 추가되어 있지 않으면 조용히
// 건너뛰고(기본 페이지 크기로) PDF는 정상적으로 생성됩니다.
function applyA4PageStyle_(docId) {
  try {
    Docs.Documents.batchUpdate({
      requests: [{
        updateDocumentStyle: {
          documentStyle: {
            pageSize: {
              width: { magnitude: 210, unit: 'MM' },
              height: { magnitude: 297, unit: 'MM' }
            },
            marginTop: { magnitude: 20, unit: 'MM' },
            marginBottom: { magnitude: 20, unit: 'MM' },
            marginLeft: { magnitude: 20, unit: 'MM' },
            marginRight: { magnitude: 20, unit: 'MM' }
          },
          fields: 'pageSize,marginTop,marginBottom,marginLeft,marginRight'
        }
      }]
    }, docId);
  } catch (err) {
    // Docs 고급 서비스 미설정 등의 이유로 실패해도 PDF 생성 자체는 계속 진행
  }
}

function saveExpenseRequestPdf_(row, html, docNumber) {
  var folder = getOrCreateProjectSubfolder_(row, EXPENSE_FOLDER_NAME); // BusinessTools.gs
  var htmlBlob = Utilities.newBlob(html, 'text/html', docNumber + '.html');

  var converted = insertConvertedDriveFile_({ // BusinessTools.gs
    title: docNumber,
    mimeType: MimeType.GOOGLE_DOCS
  }, htmlBlob, { convert: true });

  applyA4PageStyle_(converted.id);

  var docFile = DriveApp.getFileById(converted.id);
  var pdfBlob = docFile.getAs('application/pdf').setName(docNumber + '.pdf');
  var pdfFile = folder.createFile(pdfBlob);

  try { docFile.setTrashed(true); } catch (ignore) {} // 변환용 임시 Doc 정리

  return pdfFile;
}

// 다이얼로그의 "PDF 다운로드" 버튼에서 호출 - Drive에 저장하거나 이력에
// 남기지 않고, PDF 바이트를 base64로 돌려줘서 브라우저에서 바로 다운로드
function generateExpenseRequestPdfDownload(row, payload) {
  try {
    var v = resolveExpensePayload_(row, payload);
    var calc = computeCalc_(v);
    var html = buildExpenseRequestHtml_(v, calc, '(미리보기)');

    var htmlBlob = Utilities.newBlob(html, 'text/html', 'preview.html');
    var converted = insertConvertedDriveFile_({
      title: '[임시PDF다운로드]',
      mimeType: MimeType.GOOGLE_DOCS
    }, htmlBlob, { convert: true });

    applyA4PageStyle_(converted.id);

    var docFile = DriveApp.getFileById(converted.id);
    var pdfBlob = docFile.getAs('application/pdf');
    var base64 = Utilities.base64Encode(pdfBlob.getBytes());

    try { docFile.setTrashed(true); } catch (ignore) {}

    return {
      success: true,
      base64: base64,
      fileName: (v.seed.project || '지출품의서') + '_미리보기.pdf'
    };
  } catch (err) {
    return { error: err.message };
  }
}

// ============================================================
// 지출품의서 이력 - 생성할 때마다 한 줄씩 쌓이는 표 (검색/집계/취소용)
// ============================================================

function ensureExpenseLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EXPENSE_LOG_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(EXPENSE_LOG_SHEET_NAME);

    var headers = [
      '문서번호', '작성일', '현장명', '거래처', '도급업체',
      '요청금액', '전회기성', '누계기성', '도급금액', '잔액', '작성자',
      '상태', 'PDF', '파일ID'
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1D2330')
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 260);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(5, 150);
    sheet.setColumnWidth(12, 90);
    sheet.setColumnWidth(13, 260);
    sheet.getRange(1, 6, 1000, 5).setNumberFormat('#,##0');
    sheet.hideColumns(14); // 파일ID는 내부용, 숨김

    if (!sheet.getFilter()) {
      sheet.getRange(1, 1, 1, headers.length).createFilter();
    }
  }

  return sheet;
}

function generateDocNumber_() {
  return 'EXP-' + Utilities.formatDate(
    new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss'
  );
}

function appendExpenseRequestLog_(seed, requestAmount, prevProgress, afterProgress, manager, docDate, docNumber, fileUrl, fileId, subAmount) {
  var sheet = ensureExpenseLogSheet_();

  sheet.appendRow([
    docNumber,
    docDate,
    seed.project,
    seed.client,
    seed.contractor,
    requestAmount,
    prevProgress,
    afterProgress,
    subAmount,
    subAmount - afterProgress,
    manager,
    '정상',
    fileUrl,
    fileId
  ]);
}

// ============================================================
// 메인 생성 함수 - 다이얼로그의 "생성" 버튼에서 호출
// ============================================================

function generateExpenseRequestOutput(row, payload) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    var v = resolveExpensePayload_(row, payload);
    var calc = computeCalc_(v);
    var docNumber = generateDocNumber_();
    var html = buildExpenseRequestHtml_(v, calc, docNumber);

    var pdfFile = saveExpenseRequestPdf_(Number(row), html, docNumber);

    // 설치비 내역서 합계를 기준으로 DB 도급금액(M열)도 함께 갱신
    getDbSheet_().getRange(Number(row), 13)
      .setValue(calc.installTotal)
      .setNumberFormat('#,##0');

    appendExpenseRequestLog_(
      v.seed, v.requestAmount, v.prevProgress, v.afterProgress,
      v.manager, v.docDate, docNumber, pdfFile.getUrl(), pdfFile.getId(), calc.installTotal
    );

    return {
      success: true,
      message: '지출품의서 PDF가 생성되어 Drive에 저장되었고, 이력(' + EXPENSE_LOG_SHEET_NAME + ')에 문서번호 ' + docNumber + '(으)로 기록했습니다. DB 도급금액도 설치비 내역서 합계(' + fmtMoney_(calc.installTotal) + ')로 갱신했습니다.',
      fileUrl: pdfFile.getUrl()
    };
  } catch (err) {
    return { error: err.message };
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 잘못 만든 지출품의서 취소 처리
// "지출품의서이력" 시트에서 취소할 행의 아무 셀이나 선택한 뒤 실행.
// 기록은 남기고 상태만 "취소됨"으로 바꾸며, PDF 파일은 휴지통으로 이동.
// ============================================================

function cancelSelectedExpenseRequest() {
  var ui = SpreadsheetApp.getUi();
  var active = SpreadsheetApp.getActiveSheet();

  if (active.getName() !== EXPENSE_LOG_SHEET_NAME) {
    ui.alert('"' + EXPENSE_LOG_SHEET_NAME + '" 시트에서 취소할 지출품의서 행을 선택한 뒤 다시 실행해주세요.');
    return;
  }

  var row = active.getActiveCell().getRow();
  if (row < 2) {
    ui.alert('취소할 지출품의서 행을 선택해주세요.');
    return;
  }

  var docNumber = active.getRange(row, 1).getValue();
  if (!docNumber) {
    ui.alert('선택한 행에 지출품의서 기록이 없습니다.');
    return;
  }

  var status = active.getRange(row, 12).getValue();
  if (status === '취소됨') {
    ui.alert('이미 취소된 문서입니다.');
    return;
  }

  var confirmed = ui.alert(
    '지출품의서 취소',
    '"' + docNumber + '" 문서를 취소 처리하시겠습니까?\n기록은 남고, PDF 파일은 휴지통으로 이동합니다.',
    ui.ButtonSet.YES_NO
  );
  if (confirmed !== ui.Button.YES) return;

  var fileId = active.getRange(row, 14).getValue();
  if (fileId) {
    try { DriveApp.getFileById(fileId).setTrashed(true); } catch (ignore) {}
  }

  active.getRange(row, 12).setValue('취소됨');
  active.getRange(row, 1, 1, 13)
    .setFontColor('#999999')
    .setFontLine('line-through');

  ui.alert('취소 처리되었습니다. PDF는 Drive 휴지통에서 30일간 복구할 수 있습니다.');
}
