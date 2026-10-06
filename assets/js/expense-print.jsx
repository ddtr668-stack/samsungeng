/* ═══════════════════════════════════════════════════════════════
   지출품의서 · 인쇄물 (A4 세로) — v2
   - buildExpensePrintHtml(d)  : A4 세로 인쇄용 HTML 문서 문자열 생성
   - printExpenseHtml(html)    : 숨은 iframe 으로 브라우저 인쇄 다이얼로그 열기
   - ExpensePrintPreview       : 화면에서 A4 세로 용지 모양 그대로 미리보기

   v2 변경점 (2026-09-23 · 항목별 기성 관리 확정 시안 반영):
   - 1페이지(결재용 요약, A4 한 장) + 2페이지 이후(상세내역) 구조로 분리
   - 설치비뿐 아니라 제품대 / 영업수수료 / 기타비용도 회차별 누적 지급 추적
     (d.rounds / d.productRounds / d.commissionRounds / d.etcRounds)
   - "이번 회차 포함" 토글(d.includeProduct / includeCommission / includeEtc)에
     따라 지급대상·지급 내역 요약·금회 요청금액에 반영 여부가 갈린다

   v3 변경점 (2026-09-23 · 화면 모달 v3 재설계에 맞춘 출력 데이터 반영):
   - 설치비도 이제 "이번 회차 포함" 토글이 있음(d.includeInstall) — 없으면(과거 호출) true로 간주
   - 제품대 금회 요청액은 품목표 합계와 독립적으로 저장된 d.productAmount 를 우선 사용
     (없으면 하위호환으로 d.productTotal 폴백). commissionTotal/etcTotal 도 이제 "금회 요청"
     독립 입력값(품목표 합계와 다를 수 있음)
   - 지급대상 표·2페이지 상세 정보 표의 업체명은 카테고리별 오버라이드
     (d.productVendorName/d.commissionVendorName/d.etcVendorName)가 있으면 그 값을 사용
     (사업자번호·담당자·연락처·계좌 등 상세정보는 여전히 기본 도급업체 정보 공통 사용 — 항목별로
     이 상세정보까지 다르면 추후 카테고리별 전체 정보 입력을 별도로 추가해야 한다)

   ※ 앱 전체 CSS(app.css 의 @page 가로 설정 등)와 완전히 분리된
     독립 문서(iframe)로 출력하므로 지출품의서만 A4 세로로 인쇄됩니다.
═══════════════════════════════════════════════════════════════ */

const _pEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
));
const _pNum = (v) => (Math.round(Number(v) || 0)).toLocaleString('ko-KR');
const _pWon = (v) => _pNum(v) + '원';
const _pPct = (v) => (Number(v) || 0).toFixed(1) + '%';
const _pDate = (iso) => {
  if (!iso) return '-';
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '.') : s;
};

const EXPENSE_PRINT_CSS = `
@page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans CJK KR','Noto Sans KR',sans-serif;
  font-size: 9pt; line-height: 1.4; color: #000;
}
@media screen {
  body { width: 210mm; padding: 12mm 12mm 14mm; }
}
.doc-title {
  text-align: center; font-size: 19pt; font-weight: 800; letter-spacing: 0.5em;
  padding: 0 0 2mm 0.5em; border-bottom: 2.25pt solid #000; margin: 0 0 2.5mm;
}
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td {
  border: 0.6pt solid #000; padding: 1.15mm 2mm; vertical-align: middle;
  word-break: keep-all; overflow-wrap: anywhere;
}
th { background: #efefef; font-weight: 700; text-align: center; white-space: nowrap; }
td.l { text-align: left; } td.c { text-align: center; } td.r { text-align: right; font-variant-numeric: tabular-nums; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
.sec { margin-top: 1.8mm; }
.sec > h2 {
  font-size: 10pt; font-weight: 800; margin: 0 0 1mm;
  break-after: avoid; page-break-after: avoid;
}
.sec > h2 .num { font-weight:800; margin-right:0.8mm; }
.sec.sec-div { border-top: 1.5pt solid #000; padding-top: 2.6mm; margin-top: 3.4mm; }
.sec > h2 small { font-size: 8pt; font-weight: 500; color: #555; margin-left: 2mm; }
.subject th { width: 24mm; font-size: 10pt; }
.subject td { font-size: 11pt; font-weight: 700; padding: 1.8mm 3mm; }
.info th { width: 24mm; } .info td { font-weight: 600; }
.amount { margin-top: 2mm; }
.amount th { width: 30mm; font-size: 12pt; line-height: 1.3; }
.amount td.kor { font-size: 12pt; font-weight: 800; text-align: center; letter-spacing: 0.04em; padding: 2mm 2mm; }
.amount td.num { width: 66mm; font-size: 12pt; font-weight: 800; text-align: center; white-space: nowrap; }
.amount td.num .vat { font-size: 8pt; font-weight: 500; color: #555; margin-left: 1mm; }
.amount-note { text-align: right; font-size: 8pt; color: #333; margin-top: 0.8mm; }
tr.total td, tr.total th { background: #f6f6f6; font-weight: 800; }
table.pnl th { text-align: left; padding-left: 3mm; }
table.pnl tr.pnl-sum th, table.pnl tr.pnl-sum td { font-size: 10.5pt; border-top: 1.5pt solid #000; }
.paytbl td.pay { padding: 1.3mm 1.5mm; }
.paytbl .pv { font-size: 10.5pt; font-weight: 800; font-variant-numeric: tabular-nums; }
.paytbl .ps { font-size: 7.5pt; color: #444; margin-top: 0.9mm; padding-top: 0.9mm; line-height: 1.35; border-top: 0.5pt solid #bbb; }
.paytbl .mute { color: #888; font-weight: 500; }
.paytbl .due { color: #000; border-bottom: 1.2pt solid #000; }
tr.cur td { font-weight: 700; }
.note-box {
  border: 0.6pt solid #000; padding: 1.8mm 3mm; min-height: 12mm; white-space: pre-wrap; word-break: keep-all;
}
.empty { text-align: center; color: #666; padding: 3mm; }
.closing { margin-top: 2.5mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; break-inside: avoid; page-break-inside: avoid; }
.closing .cr { text-align: right; }
.closing .line { font-size: 10.5pt; font-weight: 600; }
.closing .date { font-size: 11pt; margin: 1.5mm 0 1mm; letter-spacing: 0.1em; }
.closing .co { font-size: 13pt; font-weight: 800; letter-spacing: 0.25em; }
.closing .who { font-size: 10pt; margin-top: 1.2mm; }

/* ─── 1페이지 지급 내역 요약(신규 단일 표) / 지급대상 ─── */
.summary-tbl th { font-size: 8.5pt; }
.vendor-tbl th { font-size: 8.5pt; }
.vendor-tbl td { font-size: 9pt; padding: 1.4mm 2mm; }
.summary-tbl td { padding: 1.4mm 2mm; }
.summary-tbl td.cat { text-align:left; font-weight:800; }
.summary-tbl td.cat .num { font-weight:800; margin-right:0.8mm; }
.summary-tbl td.big { font-size: 10.5pt; font-weight: 800; }
.summary-tbl .pct { font-size:8pt; color:#555; font-weight:600; }
.doc-foot{text-align:center;font-size:7.5pt;color:#999;margin-top:3mm}

/* ─── 지급대상 이하(scope13): 표 본문 9pt 통일, 표머리말(thead)만 강조 ─── */
.scope13 th { font-size: 9pt; }
.scope13 td { font-size: 9pt; font-weight: 400; }
.scope13 .summary-tbl td.cat .num { font-weight: 400; }
.scope13 .pct { font-size: 9pt; font-weight: 400; }
.scope13 .pv { font-size: 9pt; font-weight: 400; }
.scope13 .ps { font-size: 9pt; font-weight: 400; }
.scope13 .info td { font-size: 9pt; font-weight: 400; }
.scope13 tr.total td, .scope13 tr.total th { font-size: 9pt; font-weight: 400; }
.scope13 table.pnl tr.pnl-sum th, .scope13 table.pnl tr.pnl-sum td { font-size: 9pt; font-weight: 400; }
.scope13 table { table-layout: auto; }
.scope13 td.r, .scope13 .pv, .scope13 th { white-space: nowrap; }

/* ─── 2페이지 이후: 상세내역 타이틀 · 페이지 나눔 ─── */
.detail-title { text-align:center; padding-bottom:3mm; border-bottom:1.5pt solid #000; margin-bottom:4mm; }
.detail-title .t { font-size:14pt; font-weight:800; letter-spacing:0.15em; }
.detail-title .s { font-size:9pt; color:#555; margin-top:1.5mm; }
.detail-page { page-break-before: always; break-before: page; }

/* ─── v3.17 · 결재란 · 자금 확인 · 항목별 기성 누계 ─── */
.doc-head { display:flex; align-items:flex-end; justify-content:space-between; gap:6mm; border-bottom:2.25pt solid #000; padding-bottom:2mm; margin:0 0 2.5mm; }
.doc-head .doc-title { border-bottom:0; padding:0 0 1mm 0.5em; margin:0; text-align:left; flex:1; }
table.sign { width:auto; table-layout:fixed; }
table.sign th, table.sign td { padding:0.6mm 1mm; text-align:center; font-size:8.5pt; }
table.sign th.v { width:6mm; line-height:1.25; }
table.sign th.h { width:19mm; }
table.sign td.s { height:11mm; }
table.sign td.d { height:4.5mm; color:#555; }
table.fund { margin-top:1.6mm; }
table.fund th { font-size:8.5pt; font-weight:600; background:#f6f6f6; }
table.fund td { text-align:center; font-size:9.5pt; font-weight:700; font-variant-numeric:tabular-nums; }
table.fund td .sub { font-size:8pt; font-weight:500; color:#444; margin-left:1mm; }
table.fund td.hl { background:#efefef; }
.cum-tbl td.cur, .cum-tbl th.cur { background:#f2f2f2; }
.cum-tbl td.cur { font-weight:700; }
.cum-tbl .bar { display:inline-block; width:11mm; height:1.6mm; background:#e2e2e2; vertical-align:middle; margin-right:1.5mm; position:relative; overflow:hidden; }
.cum-tbl .bar i { position:absolute; top:0; bottom:0; }
.cum-legend { font-size:8pt; color:#444; font-weight:500; margin-left:2mm; }
.cum-legend i { display:inline-block; width:3.5mm; height:1.6mm; vertical-align:middle; margin:0 0.8mm 0 1.5mm; }
.auto-note { margin:0 0 1mm; font-size:8.5pt; }
`;


// ─── 수금 분류 : 계약금 · 중도금 · 잔금 ─────────────────────────
//  규칙  1회차(첫 입금) = 계약금
//        이후 입금 중 입금 후에도 잔금이 남아 있으면 → 모두 합산해 중도금
//        누계가 총 계약금액에 도달시키는 입금 = 잔금
//  payments : 수금이력 [{roundNo, paymentDate, amount, ...}]  (대시보드 수금 관리와 동일 데이터)
//  paidFallback : 수금이력이 없을 때 쓰는 계약관리 시트의 입금액 합계
function classifyPayments(total, payments, paidFallback) {
  total = Number(total) || 0;
  const list = (Array.isArray(payments) ? payments : [])
    .filter(p => Number(p.amount) > 0)
    .slice()
    .sort((a, b) => (Number(a.roundNo) || 0) - (Number(b.roundNo) || 0)
      || String(a.paymentDate || '').localeCompare(String(b.paymentDate || '')));

  if (list.length === 0) {
    const paid = Number(paidFallback) || 0;
    return { source: paid > 0 ? 'summary' : 'none', total, paid, remain: Math.max(total - paid, 0),
             deposit: null, interim: null, final: null, count: 0 };
  }
  const first = list[0];
  let cum = Number(first.amount);
  const deposit = { date: first.paymentDate || '', amount: cum };
  const mid = [];
  let final = null;
  for (let i = 1; i < list.length; i++) {
    const amt = Number(list[i].amount);
    if (final) {                       // 완납 이후 추가 입금은 잔금에 합산
      final.amount += amt; final.date = list[i].paymentDate || final.date;
    } else if (total > 0 && cum + amt >= total - 0.5) {
      final = { date: list[i].paymentDate || '', amount: amt };
    } else {
      mid.push(list[i]);
    }
    cum += amt;
  }
  const interim = mid.length ? {
    count: mid.length,
    amount: mid.reduce((sum, p) => sum + Number(p.amount), 0),
    firstDate: mid[0].paymentDate || '',
    lastDate: mid[mid.length - 1].paymentDate || '',
  } : null;
  return { source: 'sheet', total, paid: cum, remain: Math.max(total - cum, 0),
           deposit, interim, final, count: list.length };
}

// ── 항목별(설치비/제품대/영업수수료/기타비용) 회차 이력 표 · 공통 렌더러 ──
// rounds: [{roundNo, docDate, amount}], curAmt: 이번 회차 요청액, included: 이번 회차 포함 여부
// total: 그 항목의 총액(budget) 기준값 · docDate/roundLabel: 이번 회차 표시용
function buildRoundHistoryTable(rounds, curAmt, included, total, docDate, roundLabel) {
  let prevCum = 0;
  const pctOf = (v) => total > 0 ? (v / total * 100) : 0;
  const histRows = (rounds || []).map(r => {
    const amt = Number(r.amount) || 0;
    prevCum += amt;
    return `<tr><td class="l">${_pEsc(r.roundNo)}차 · ${_pDate(r.docDate)}${r.manual ? ' (수기)' : ''}${r.corrected ? ' (정정)' : ''}</td><td class="r">${_pNum(amt)}</td><td class="r">${_pPct(pctOf(amt))}</td><td class="r">${_pPct(pctOf(prevCum))}</td></tr>`;
  }).join('');

  const cur = included ? (Number(curAmt) || 0) : 0;
  const finalCum = prevCum + cur;
  const balance = Math.max(total - finalCum, 0);

  const curRow = (included && cur > 0)
    ? `<tr class="cur"><td class="l">${_pEsc(roundLabel)} · ${_pEsc(_pDate(docDate))} (금회)</td><td class="r">${_pNum(cur)}</td><td class="r">${_pPct(pctOf(cur))}</td><td class="r">${_pPct(pctOf(finalCum))}</td></tr>`
    : '';
  const emptyRow = (rounds || []).length === 0
    ? `<tr><td class="c" colspan="4" style="color:#888">이전 지급 이력 없음</td></tr>` : '';
  const totalLabel = curRow ? '금회 지급 후 누계 / 잔액' : '현재 누계 / 잔액 (금회 요청 없음)';
  const balanceCell = balance > 0 ? `잔액 ${_pNum(balance)}원` : '완납';

  return `<table>
      <colgroup><col><col style="width:38mm"><col style="width:22mm"><col style="width:22mm"></colgroup>
      <thead><tr><th>회차 · 지출일</th><th>지급금액(원)</th><th>지급 %</th><th>누적 %</th></tr></thead>
      <tbody>
        ${emptyRow}${histRows}${curRow}
        <tr class="total"><td class="l">${totalLabel}</td><td class="r">${_pNum(finalCum)}</td><td class="r" colspan="2">${balanceCell}</td></tr>
      </tbody>
    </table>`;
}

// ── 지급 내역 요약(1페이지) 한 행 ──
function buildSummaryRow(n, title, total, curAmt, prevCum, included) {
  total = Number(total) || 0;
  const cur = included ? (Number(curAmt) || 0) : 0;
  const finalCum = prevCum + cur;
  const balance = Math.max(total - finalCum, 0);
  const pctOf = (v) => total > 0 ? (v / total * 100) : 0;
  const curPctTxt = included ? `(${_pPct(pctOf(cur))})` : '(미포함)';
  const balanceTxt = balance > 0 ? `${_pNum(balance)}원` : '완납';
  return `<tr>
          <td class="cat"><span class="num">${n}.</span>${_pEsc(title)}</td>
          <td class="r big">${_pNum(total)}원</td>
          <td class="r big">${_pNum(cur)}원 <span class="pct">${curPctTxt}</span></td>
          <td class="r big">${_pNum(finalCum)}원 <span class="pct">(${_pPct(pctOf(finalCum))})</span></td>
          <td class="r big">${balanceTxt}</td>
        </tr>`;
}

// ── 항목별 기성 누계(1페이지) 한 행 — 금액 · 전회 누계 · 금회 · 금회 누계 · 잔액 · 기성률 ──
function buildCumRow(n, title, total, curAmt, prevCum, included) {
  total = Number(total) || 0;
  const cur = included ? (Number(curAmt) || 0) : 0;
  const finalCum = prevCum + cur;
  const balance = total - finalCum;
  const pctOf = (v) => total > 0 ? (v / total * 100) : 0;
  const prevW = Math.min(pctOf(prevCum), 100);
  const curW = Math.min(pctOf(cur), 100 - prevW);
  const bar = total > 0
    ? `<span class="bar"><i style="left:0;width:${prevW.toFixed(1)}%;background:#222"></i><i style="left:${prevW.toFixed(1)}%;width:${curW.toFixed(1)}%;background:#9a9a9a"></i></span>` : '';
  return `<tr>
          <td class="cat"><span class="num">${n}.</span>${_pEsc(title)}</td>
          <td class="r">${_pNum(total)}</td>
          <td class="r">${_pNum(prevCum)}</td>
          <td class="r cur">${included ? _pNum(cur) : '제외'}</td>
          <td class="r">${_pNum(finalCum)}</td>
          <td class="r">${balance < 0 ? '초과 ' + _pNum(-balance) : (balance > 0 ? _pNum(balance) : '완납')}</td>
          <td class="r">${bar}${total > 0 ? _pPct(pctOf(finalCum)) : '-'}</td>
        </tr>`;
}

// d: { contract, form, koreanAmount, requestAmount, etcTotal, commissionTotal, grandTotal, productTotal, productAmount,
//      installItems, productItems, productSummary, etcItems, commissionItems,
//      rounds:[{roundNo,docDate,amount}], productRounds, commissionRounds, etcRounds,
//      includeInstall, includeProduct, includeCommission, includeEtc,
//      productVendorName, commissionVendorName, etcVendorName,
//      companyName, paySplit }
// 🆕 v3: etcTotal/commissionTotal 은 이제 "금회 요청" 독립 입력값(품목표 합계와 다를 수 있음)이고,
// productAmount 가 그 역할을 제품대 쪽에서 담당한다(하위호환을 위해 productTotal 도 함께 받되
// 우선순위는 productAmount). includeInstall 이 없는 과거 호출은 true(포함)로 취급한다.
function buildExpensePrintHtml(d) {
  const c = d.contract || {};
  const f = d.form || {};
  const req = Number(d.requestAmount) || 0;                        // 설치비 금회 요청액
  const installTotalBudget = Number(c.subcontractAmount) || 0;     // 설치비 총액(도급금액)
  const productTotalBudget = Number(c.productCost) || 0;           // 제품대 총액
  const commissionTotalBudget = Number(c.salesCost) || 0;          // 영업수수료 총액
  const etcTotalBudget = Number(c.incidental) || 0;                // 기타비용 총액

  const productCur = d.productAmount !== undefined ? (Number(d.productAmount) || 0) : (Number(d.productTotal) || 0);
  const commissionCur = Number(d.commissionTotal) || 0;
  const etcCur = Number(d.etcTotal) || 0;
  const includeInstall = d.includeInstall === undefined ? true : !!d.includeInstall;
  const includeProduct = !!d.includeProduct;
  const includeCommission = !!d.includeCommission;
  const includeEtc = !!d.includeEtc;

  const docDate = f.docDate || '';
  const roundLabel = `${f.paymentCount || '1'}차`;
  const dateKor = /^\d{4}-\d{2}-\d{2}$/.test(docDate)
    ? `${docDate.slice(0, 4)}년 ${Number(docDate.slice(5, 7))}월 ${Number(docDate.slice(8, 10))}일` : docDate;

  // ── 항목별 "전회까지 누계"(각 항목 회차 이력 합) — 지급 내역 요약 표에 쓰인다 ──
  const cumOf = (rounds) => (rounds || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const installPrevCum = cumOf(d.rounds);
  const productPrevCum = cumOf(d.productRounds);
  const commissionPrevCum = cumOf(d.commissionRounds);
  const etcPrevCum = cumOf(d.etcRounds);

  // ── 설치비 내역서 ──
  const inst = (d.installItems || []).filter(r => r.name);
  const installItemRows = inst.map((r, i) => {
    const q = Number(r.qty) || 0, u = Number(r.unitPrice) || 0;
    return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l">${_pEsc(r.name)}</td>
        <td class="l">${_pEsc(r.spec)}</td>
        <td class="r">${_pNum(q)}</td>
        <td class="c">${_pEsc(r.unit)}</td>
        <td class="r">${_pNum(u)}</td>
        <td class="r">${_pNum(q * u)}</td>
        <td class="l">${_pEsc(r.note)}</td>
      </tr>`;
  }).join('');
  const installItemTotal = inst.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);
  const installItemsTable = `<table style="margin-top:2mm">
      <colgroup><col style="width:9mm"><col style="width:44mm"><col style="width:28mm"><col style="width:13mm"><col style="width:13mm"><col style="width:28mm"><col style="width:28mm"><col></colgroup>
      <thead><tr><th>No</th><th>품목/작업내용</th><th>규격</th><th>수량</th><th>단위</th><th>단가(원)</th><th>금액(원)</th><th>비고</th></tr></thead>
      <tbody>
        ${installItemRows || '<tr><td class="c" colspan="8">입력된 내역이 없습니다</td></tr>'}
        <tr class="total"><td class="c" colspan="6">합 계 (VAT 포함)</td><td class="r">${_pNum(installItemTotal)}</td><td></td></tr>
      </tbody>
    </table>`;

  // ── 제품 내역서 ──
  const prod = (d.productItems || []).filter(r => r.name);
  const productItemRows = prod.map((r, i) => {
    const q = Number(r.qty) || 0, u = Number(r.unitPrice) || 0;
    const list = Number(r.listPrice) || 0;
    return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l">${_pEsc(r.name)}</td>
        <td class="l">${_pEsc(r.model)}</td>
        <td class="c">${_pEsc(r.unit)}</td>
        <td class="r">${_pNum(q)}</td>
        <td class="r">${_pNum(u)}</td>
        <td class="r">${_pNum(q * u)}</td>
        <td class="r">${list ? _pNum(list) : ''}</td>
        <td class="r">${r.dcRate ? (r.dcRate * 100).toFixed(0) + '%' : ''}</td>
      </tr>`;
  }).join('');
  const productItemsTable = `<table style="margin-top:2mm">
      <colgroup><col style="width:9mm"><col style="width:36mm"><col style="width:30mm"><col style="width:11mm"><col style="width:11mm"><col style="width:22mm"><col style="width:24mm"><col style="width:24mm"><col></colgroup>
      <thead><tr><th>No</th><th>품명</th><th>모델</th><th>단위</th><th>수량</th><th>단가(원)</th><th>금액(원)</th><th>출고가(원)</th><th>DC</th></tr></thead>
      <tbody>
        ${prod.length ? `${productItemRows}
        <tr class="total"><td class="c" colspan="6">합 계</td><td class="r">${_pNum(productCur)}</td><td colspan="2"></td></tr>`
        : `<tr><td class="c" colspan="9">입력된 제품 내역이 없습니다</td></tr>`}
      </tbody>
    </table>`;

  // ── 영업수수료 / 기타비용 내역 (항목/단위/수량/금액/비고 공통 양식) ──
  const simpleItemsTable = (items, totalLabel, remarkWidthMm) => {
    const rows = (items || []).filter(r => r.name);
    const sum = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return `<table style="margin-top:2mm">
      <colgroup><col style="width:9mm"><col style="width:36mm"><col style="width:16mm"><col style="width:14mm"><col style="width:30mm"><col style="width:${remarkWidthMm}mm"></colgroup>
      <thead><tr><th>No</th><th>항목</th><th>단위</th><th>수량</th><th>금액(원)</th><th>비고</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map((r, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td class="l">${_pEsc(r.name)}</td>
            <td class="c">${_pEsc(r.unit)}</td>
            <td class="r">${r.qty ? _pNum(r.qty) : ''}</td>
            <td class="r">${_pNum(r.amount)}</td>
            <td class="l">${_pEsc(r.note)}${r.receipt ? ' (증빙 첨부)' : ''}</td>
          </tr>`).join('') : `<tr><td class="c" colspan="6">입력된 내역이 없습니다</td></tr>`}
        <tr class="total"><td class="c" colspan="4">${totalLabel}</td><td class="r">${_pNum(sum)}</td><td></td></tr>
      </tbody>
    </table>`;
  };
  const commissionItemsTable = simpleItemsTable(d.commissionItems, '합 계', 68);
  const etcItemsTable = simpleItemsTable(d.etcItems, '합계(VAT포함)', 81);

  // ── 손익 계산 : 총계약금액 − 설치비 − 제품대 − 기타비용 − 영업수수료 ──
  const pnlSales   = Number(c.totalAmount) || 0;
  // 손익은 '총액' 기준 — 계약관리 시트 금액 우선, 없으면 내역서 합계 (금회 지급액을 쓰면 안 됨)
  const productItemTotal = prod.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.unitPrice) || 0), 0);
  const pnlInstall = installTotalBudget || installItemTotal;
  const pnlProduct = productTotalBudget || productItemTotal;
  const pnlEtc     = etcTotalBudget || etcCur;
  const pnlCom     = commissionTotalBudget || commissionCur;
  const pnlProfit  = pnlSales - pnlInstall - pnlProduct - pnlEtc - pnlCom;
  const pnlRate    = pnlSales > 0 ? pnlProfit / pnlSales * 100 : 0;
  const _neg = (v) => v < 0 ? '-' + _pNum(-v) : _pNum(v);

  // ── 수금 내역 (계약금 · 중도금 · 잔금) ──
  const ps = d.paySplit || classifyPayments(c.totalAmount, [], c.paidAmount);
  const pTotal = Number(c.totalAmount) || 0;
  const pct = (v) => pTotal > 0 ? (v / pTotal * 100).toFixed(1) + '%' : '-';
  const dash = '<span class="mute">-</span>';
  const payCell = (label, amt, sub) => `<td class="c pay"><div class="pv">${amt}</div><div class="ps">${sub || ''}</div></td>`;
  let depositCell, interimCell, finalCell;
  if (ps.source === 'sheet') {
    depositCell = payCell('계약금', _pNum(ps.deposit.amount), `${_pDate(ps.deposit.date)} · ${pct(ps.deposit.amount)}`);
    interimCell = ps.interim
      ? payCell('중도금', _pNum(ps.interim.amount),
          `${ps.interim.count}회 입금 · ${pct(ps.interim.amount)}<br>${_pDate(ps.interim.firstDate)}${ps.interim.count > 1 ? ' ~ ' + _pDate(ps.interim.lastDate) : ''}`)
      : payCell('중도금', dash, '');
    finalCell = ps.final
      ? payCell('잔금', _pNum(ps.final.amount), `${_pDate(ps.final.date)} · ${pct(ps.final.amount)}<br>입금 완료`)
      : payCell('잔금', `<span class="due">미수 ${_pNum(ps.remain)}</span>`, `${pct(ps.remain)} · 입금 전`);
  } else {
    depositCell = payCell('계약금', dash, '');
    interimCell = payCell('중도금', dash, '');
    finalCell = payCell('잔금', ps.remain > 0 ? `<span class="due">미수 ${_pNum(ps.remain)}</span>` : dash, ps.source === 'summary' ? '수금이력 미등록' : '');
  }
  const paySummary = payCell('수금', `${_pNum(ps.paid)}`,
    `수금률 ${pct(ps.paid)}${ps.source === 'summary' ? '<br>(합계만 표시)' : ''}`);

  // ── 지급대상(1페이지) — 이번 회차에 실제로 포함된 항목만 표시 ──
  // 🆕 v3: 업체명은 카테고리별 오버라이드(productVendorName 등)가 있으면 그 값을, 없으면
  // 지급대상(도급업체) 섹션의 기본 업체명을 사용한다. 사업자번호·담당자·연락처·계좌 등 상세
  // 정보는 카테고리별로 별도 입력받지 않으므로(v3에서도 업체명만 오버라이드 가능) 기본
  // 도급업체 정보를 공통으로 표시한다.
  const vendorName = f.subName || c.subcontractor || '-';
  const vendorBizNo = f.subBizNo || '';
  const vendorManager = f.subManager || '';
  const vendorTel = f.subManagerTel || '';
  // 항목별 업체 정보: 업체를 지정하지 않으면 비움(지급 대상 업체 정보를 대신 쓰지 않음).
  // 지정한 업체가 지급 대상 업체와 같으면 그 정보, 다르면 도급업체 목록에 저장된 그 업체 정보만 사용.
  const _vn = (v) => String(v || '').replace(/\(주\)|㈜|주식회사|\s/g, '').toLowerCase();
  const mainInfo = { name: vendorName === '-' ? '' : vendorName, bizNo: vendorBizNo, manager: vendorManager, tel: vendorTel, bank: f.subBank || '', account: f.subAccount || '', holder: f.subHolder || '' };
  const infoOf = (name) => {
    const n = String(name || '').trim();
    if (!n) return { name: '', bizNo: '', manager: '', tel: '', bank: '', account: '', holder: '' };
    if (mainInfo.name && _vn(n) === _vn(mainInfo.name)) return { ...mainInfo, name: n };
    const s2 = (d.subcontractors || []).find(x => x && _vn(x.name) === _vn(n)) || {};
    return { name: n, bizNo: s2.bizNo || '', manager: s2.manager || '', tel: s2.tel || '', bank: s2.bank || '', account: s2.account || '', holder: s2.holder || '' };
  };
  const vendorNameOf = (override) => infoOf(override).name;
  const vendorInfoTable = (info) => `<table class="info" style="margin-bottom:2mm">
      <colgroup><col style="width:22mm"><col><col style="width:22mm"><col></colgroup>
      <tr><th>업체명</th><td class="l">${_pEsc(info.name || '-')}</td><th>사업자번호</th><td class="l" style="white-space:nowrap">${_pEsc(info.bizNo || '-')}</td></tr>
      <tr><th>담당자</th><td class="l">${_pEsc(info.manager || '-')}</td><th>연락처</th><td class="l">${_pEsc(info.tel || '-')}</td></tr>
      <tr><th>계좌번호</th><td class="l" colspan="3">${(info.bank || info.account) ? `${_pEsc(info.bank)} ${_pEsc(info.account)}${info.holder ? ` (예금주: ${_pEsc(info.holder)})` : ''}` : '-'}</td></tr>
    </table>`;
  // 🆕 화면(v3) 카드 순서와 동일하게: 제품대 → 설치비 → 기타비용 → 영업수수료
  const vendorRows = [];
  // 항목별 비고(지급 사유)
  const catNote = (k) => String(((d.catNotes || {})[k]) || '').trim();
  const withNote = (label, k) => catNote(k) ? `${label} · ${catNote(k)}` : label;
  const noteLine = (k) => catNote(k) ? `<div style="margin:0 0 1.5mm;padding:1.2mm 2mm;border:0.6pt solid #000;font-size:9pt"><b>비고</b> ${_pEsc(catNote(k))}</div>` : '';
  if (includeProduct && productCur > 0) vendorRows.push({ amt: productCur, note: withNote('제품대', 'product'), ...infoOf(d.productVendorName) });
  if (includeInstall && req > 0) vendorRows.push({ amt: req, note: withNote('설치비', 'install'), ...infoOf(mainInfo.name) });
  if (includeEtc && etcCur > 0) vendorRows.push({ amt: etcCur, note: withNote('기타비용', 'etc'), ...infoOf(d.etcVendorName) });
  if (includeCommission && commissionCur > 0) vendorRows.push({ amt: commissionCur, note: withNote('영업수수료', 'commission'), ...infoOf(d.commissionVendorName) });
  const vendorTotal = vendorRows.reduce((s, r) => s + r.amt, 0);
  const vendorRowsHtml = vendorRows.map((r, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td class="l" style="white-space:nowrap">${_pEsc(r.name || '-')}</td>
          <td class="l" style="white-space:nowrap">${_pEsc(r.bizNo || '-')}</td>
          <td class="l" style="white-space:nowrap">${_pEsc(r.manager || '-')}${r.tel ? ` <span style="font-size:8pt;color:#555">(${_pEsc(r.tel)})</span>` : ''}</td>
          <td class="r">${_pWon(r.amt)}</td>
          <td class="l">${_pEsc(r.note)}</td>
        </tr>`).join('');

  // ── 지급 내역 요약(1페이지) — 화면(v3) 카드 순서와 동일: 제품대 → 설치비 → 기타비용 → 영업수수료 ──
  // 금액이 하나도 없는 항목(총액·금회·이전 지급 모두 0)은 출력물에서 뺀다 — 남은 항목만 1, 2, 3… 번호
  const showCat = {
    product:    productTotalBudget > 0 || (includeProduct && productCur > 0) || productPrevCum > 0,
    install:    installTotalBudget > 0 || (includeInstall && req > 0) || installPrevCum > 0,
    etc:        etcTotalBudget > 0 || (includeEtc && etcCur > 0) || etcPrevCum > 0,
    commission: commissionTotalBudget > 0 || (includeCommission && commissionCur > 0) || commissionPrevCum > 0,
  };
  const catNo = {};
  ['product', 'install', 'etc', 'commission'].filter(k => showCat[k]).forEach((k, i) => { catNo[k] = i + 1; });
  const summaryRowsHtml = [
    showCat.product    ? buildCumRow(catNo.product, '제품대', productTotalBudget, productCur, productPrevCum, includeProduct) : '',
    showCat.install    ? buildCumRow(catNo.install, '설치비', installTotalBudget, req, installPrevCum, includeInstall) : '',
    showCat.etc        ? buildCumRow(catNo.etc, '기타비용', etcTotalBudget, etcCur, etcPrevCum, includeEtc) : '',
    showCat.commission ? buildCumRow(catNo.commission, '영업수수료', commissionTotalBudget, commissionCur, commissionPrevCum, includeCommission) : '',
  ].join('');
  // 합계 행 (표시된 항목만)
  const _cumParts = [
    showCat.product    && { t: productTotalBudget,    p: productPrevCum,    c: includeProduct ? productCur : 0 },
    showCat.install    && { t: installTotalBudget,    p: installPrevCum,    c: includeInstall ? req : 0 },
    showCat.etc        && { t: etcTotalBudget,        p: etcPrevCum,        c: includeEtc ? etcCur : 0 },
    showCat.commission && { t: commissionTotalBudget, p: commissionPrevCum, c: includeCommission ? commissionCur : 0 },
  ].filter(Boolean);
  const cumT = _cumParts.reduce((s, x) => s + (Number(x.t) || 0), 0);
  const cumP = _cumParts.reduce((s, x) => s + x.p, 0);
  const cumC = _cumParts.reduce((s, x) => s + x.c, 0);
  const cumF = cumP + cumC;
  const cumTotalRow = _cumParts.length ? `<tr class="total">
          <td class="cat">합계</td>
          <td class="r">${_pNum(cumT)}</td><td class="r">${_pNum(cumP)}</td><td class="r cur">${_pNum(cumC)}</td>
          <td class="r">${_pNum(cumF)}</td><td class="r">${cumT - cumF < 0 ? '초과 ' + _pNum(cumF - cumT) : _pNum(cumT - cumF)}</td>
          <td class="r">${cumT > 0 ? _pPct(cumF / cumT * 100) : '-'}</td>
        </tr>` : '';

  // ── 자금 확인 : 발주처 입금 누계 · 미수금 · 지급 후 누적 지급(네 항목 전체) · 자금 여유 ──
  const received = d.received !== undefined ? (Number(d.received) || 0) : (Number(c.paidAmount) || 0);
  const contractSum = Number(c.totalAmount) || 0;
  const paidAfterAll = productPrevCum + installPrevCum + etcPrevCum + commissionPrevCum
    + (includeProduct ? productCur : 0) + (includeInstall ? req : 0) + (includeEtc ? etcCur : 0) + (includeCommission ? commissionCur : 0);
  const cushion = received - paidAfterAll;
  const fundTable = `<table class="fund">
    <colgroup><col style="width:34mm"><col><col style="width:44mm"><col></colgroup>
    <tr>
      <th>지급 후 누적 지급</th><td>${_pNum(paidAfterAll)}<span class="sub">(네 항목 · 이번 회차 포함)</span></td>
      <th>자금 여유 (수금 − 지급)</th><td class="hl">${cushion < 0 ? '−' : '+'}${_pNum(Math.abs(cushion))}<span class="sub">수금 ${_pNum(received)} 기준</span></td>
    </tr>
  </table>`;

  // ── 비고 자동 문구 : 정정 반영 · 이번 회차 제외 항목 ──
  const autoNotes = [];
  (d.corrections || []).forEach(k => { if (k && k.text) autoNotes.push(`※ ${k.text}`); });
  const _excl = [
    !includeProduct && (productTotalBudget > 0 || productPrevCum > 0) && '제품대',
    !includeInstall && (installTotalBudget > 0 || installPrevCum > 0) && '설치비',
    !includeEtc && (etcTotalBudget > 0 || etcPrevCum > 0) && '기타비용',
    !includeCommission && (commissionTotalBudget > 0 || commissionPrevCum > 0) && '영업수수료',
  ].filter(Boolean);
  if (_excl.length) autoNotes.push(`※ ${_excl.join('·')}는 이번 회차에서 제외`);
  if (cushion < 0 && contractSum > 0) autoNotes.push(`※ 지급 후 누적 지급이 발주처 입금 누계보다 ${_pNum(-cushion)}원 많음`);
  const autoNoteHtml = autoNotes.length ? `<div class="auto-note">${autoNotes.map(_pEsc).join('<br>')}</div>` : '';

  // ── 금회 요청금액(체크된 항목 합계) 안내 문구 (동일 순서) ──
  const noteParts = [];
  if (includeProduct && productCur > 0) noteParts.push(`제품대 ${_pNum(productCur)}원`);
  if (includeInstall && req > 0) noteParts.push(`설치비 ${_pNum(req)}원`);
  if (includeEtc && etcCur > 0) noteParts.push(`기타비용 ${_pNum(etcCur)}원`);
  if (includeCommission && commissionCur > 0) noteParts.push(`영업수수료 ${_pNum(commissionCur)}원`);
  const excludedParts = [];
  if (!includeProduct && productCur > 0) excludedParts.push('제품대');
  if (!includeInstall && req > 0) excludedParts.push('설치비');
  if (!includeEtc) excludedParts.push('기타비용');
  if (!includeCommission && commissionCur > 0) excludedParts.push('영업수수료');
  const amountNote = `${noteParts.join(' + ') || '포함된 항목이 없습니다'}${excludedParts.length ? ` (${excludedParts.join('·')}은 이번 회차 미포함 · 별도 정산)` : ''}`;

  const body = `
  <div class="doc-head">
    <div class="doc-title">지 출 품 의 서</div>
    <table class="sign">
      <tr><th class="v" rowspan="3">결<br>재</th><th class="h">담당</th><th class="h">검토</th><th class="h">승인</th></tr>
      <tr><td class="s"></td><td class="s"></td><td class="s"></td></tr>
      <tr><td class="d">/</td><td class="d">/</td><td class="d">/</td></tr>
    </table>
  </div>

  <table class="subject">
    <tr><th>품의제목</th><td class="l">『${_pEsc(c.projectName || '(프로젝트명 없음)')}』 ${_pEsc(f.docSubject || '')}</td></tr>
  </table>

  <table class="info" style="margin-top:2mm">
    <colgroup><col style="width:24mm"><col style="width:69mm"><col style="width:24mm"><col style="width:69mm"></colgroup>
    <tr><th>거래처</th><td class="l">${_pEsc(c.client || '-')}</td><th>계약일</th><td class="l">${_pEsc(_pDate(c.contractDate))}</td></tr>
    <tr><th>영업담당</th><td class="l">${_pEsc(f.manager || '-')}</td><th>품의일</th><td class="l">${_pEsc(_pDate(docDate))}</td></tr>
    <tr><th>지급회차</th><td class="l">${_pEsc(roundLabel)}</td><th>첨부서류</th><td class="l">${_pEsc(f.attachments || '-')}</td></tr>
  </table>

  <div class="sec">
    <h2>□ 계약금액 · 수금 내역<small>대시보드 수금 관리 연동</small></h2>
    <table class="paytbl">
      <colgroup><col style="width:38mm"><col><col><col><col style="width:32mm"></colgroup>
      <thead><tr><th>총 계약금액</th><th>계약금</th><th>중도금</th><th>잔금</th><th>수금 합계</th></tr></thead>
      <tbody><tr>
        <td class="c pay"><div class="pv">${_pNum(pTotal)}</div><div class="ps">VAT 포함</div></td>
        ${depositCell}${interimCell}${finalCell}${paySummary}
      </tr></tbody>
    </table>
  </div>

  <table class="amount">
    <tr>
      <th>금회 요청금액</th>
      <td class="kor">${d.grandTotal > 0 ? _pEsc(d.koreanAmount) : '금액 미입력'}</td>
      <td class="num">(￦${_pNum(d.grandTotal)})<span class="vat">부가세포함</span></td>
    </tr>
  </table>
  <div class="amount-note">${amountNote}</div>
  ${fundTable}

  <div class="scope13">
  <div class="sec">
    <h2>□ 지급대상<small>이번 회차에 포함된 항목만 표시</small></h2>
    <table class="vendor-tbl">
      <colgroup><col style="width:8mm"><col style="width:42mm"><col style="width:26mm"><col style="width:52mm"><col style="width:26mm"><col style="width:32mm"></colgroup>
      <thead><tr><th>No</th><th>업체명</th><th>사업자번호</th><th>담당자</th><th>금액</th><th>비고</th></tr></thead>
      <tbody>
        ${vendorRowsHtml || '<tr><td class="c" colspan="6">이번 회차에 포함된 지급 대상이 없습니다</td></tr>'}
        ${vendorRows.length ? `<tr class="total"><td class="c" colspan="4">합계</td><td class="r">${_pWon(vendorTotal)}</td><td class="l">VAT포함</td></tr>` : ''}
      </tbody>
    </table>
  </div>

  <div class="sec">
    <h2>□ 항목별 기성 누계<span class="cum-legend"><i style="background:#222"></i>전회 누계<i style="background:#9a9a9a"></i>금회 · 단위 원 · 상세 근거는 2페이지</span></h2>
    <table class="summary-tbl cum-tbl">
      <colgroup><col style="width:26mm"><col><col><col><col><col><col style="width:27mm"></colgroup>
      <thead><tr><th>구분</th><th>금액</th><th>전회 누계</th><th class="cur">금회</th><th>금회 누계</th><th>잔액</th><th>기성률</th></tr></thead>
      <tbody>${summaryRowsHtml}${cumTotalRow}</tbody>
    </table>
  </div>
  </div>

  <div class="sec">
    <h2>□ 비고 사항</h2>
    <div class="note-box">${autoNoteHtml}${f.note ? _pEsc(f.note) : ''}</div>
  </div>

  <div class="closing">
    <div class="cl">
      <div class="line">위와 같이 지출을 품의합니다.</div>
      <div class="date">${_pEsc(dateKor)}</div>
    </div>
    <div class="cr">
      <div class="co">${_pEsc(d.companyName || '주식회사 삼성이엔지')}</div>
      <div class="who">영업담당 : ${_pEsc(f.manager || '')} &nbsp;&nbsp;&nbsp; (인)</div>
    </div>
  </div>

  <div class="detail-page scope13">
  <div class="detail-title">
    <div class="t">상 세 내 역</div>
    <div class="s">『${_pEsc(c.projectName || '')}』 · ${_pEsc(roundLabel)} 지급 · 1페이지 요약의 항목별 상세 근거 자료</div>
  </div>

  <div class="sec" style="margin-top:0">
    <h2>※ 손익 (총계약금액-제품대-설치비-기타비용-영업수수료)</h2>
    <table class="pnl">
      <colgroup><col style="width:44mm"><col style="width:42mm"><col></colgroup>
      <thead><tr><th>구분</th><th>금액(원)</th><th>산출 근거</th></tr></thead>
      <tbody>
        <tr><th>총 계약금액</th><td class="r">${_pNum(pnlSales)}</td><td class="l">계약금액 (VAT 포함)</td></tr>
        ${!showCat.product ? '' : `<tr><th>(-) 제품대</th><td class="r">${_pNum(pnlProduct)}</td><td class="l">${productTotalBudget ? '계약관리 시트 제품대 (총액)' : (prod.length ? '제품 내역서 합계' : '-')}</td></tr>`}
        ${!showCat.install ? '' : `<tr><th>(-) 설치비</th><td class="r">${_pNum(pnlInstall)}</td><td class="l">${installTotalBudget ? '계약관리 시트 도급금액 (총액)' : (inst.length ? '설치비 내역서 합계' : '-')}</td></tr>`}
        ${pnlEtc ? `<tr><th>(-) 기타비용</th><td class="r">${_pNum(pnlEtc)}</td><td class="l">계약관리 시트 부대비용</td></tr>` : ''}
        ${pnlCom ? `<tr><th>(-) 영업수수료</th><td class="r">${_pNum(pnlCom)}</td><td class="l">계약관리 시트 영업비용</td></tr>` : ''}
        <tr class="total pnl-sum"><th>예상 손익</th><td class="r">${_neg(pnlProfit)}</td><td class="l">예상 수익률 ${pnlRate.toFixed(1)}%</td></tr>
      </tbody>
    </table>
  </div>

  ${!showCat.product ? '' : `<div class="sec sec-div">
    <h2><span class="num">${catNo.product}.</span>제품대<small>${includeProduct ? `제품대 총액 ${_pNum(productTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    ${noteLine('product')}
    ${vendorInfoTable(infoOf(d.productVendorName))}
    ${buildRoundHistoryTable(d.productRounds, productCur, includeProduct, productTotalBudget, docDate, roundLabel)}
    ${productItemsTable}
  </div>`}

  ${!showCat.install ? '' : `<div class="sec sec-div">
    <h2><span class="num">${catNo.install}.</span>설치비<small>${includeInstall ? `총금액 ${_pNum(installTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    ${noteLine('install')}
    ${vendorInfoTable(infoOf(mainInfo.name))}
    ${buildRoundHistoryTable(d.rounds, req, includeInstall, installTotalBudget, docDate, roundLabel)}
    ${installItemsTable}
  </div>`}

  ${!showCat.etc ? '' : `<div class="sec sec-div">
    <h2><span class="num">${catNo.etc}.</span>기타비용<small>${includeEtc ? `기타비용 총액 ${_pNum(etcTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    ${noteLine('etc')}
    ${vendorInfoTable(infoOf(d.etcVendorName))}
    ${buildRoundHistoryTable(d.etcRounds, etcCur, includeEtc, etcTotalBudget, docDate, roundLabel)}
    ${etcItemsTable}
  </div>`}

  ${!showCat.commission ? '' : `<div class="sec sec-div">
    <h2><span class="num">${catNo.commission}.</span>영업수수료<small>${includeCommission ? `영업수수료 총액 ${_pNum(commissionTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    ${noteLine('commission')}
    ${vendorInfoTable(infoOf(d.commissionVendorName))}
    ${buildRoundHistoryTable(d.commissionRounds, commissionCur, includeCommission, commissionTotalBudget, docDate, roundLabel)}
    ${commissionItemsTable}
  </div>`}
  </div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>지출품의서_${_pEsc(c.projectName || '')}_${_pEsc(roundLabel)}</title>
<style>${EXPENSE_PRINT_CSS}</style></head><body>${body}</body></html>`;
}

// ═══════════════════════════════════════════════════════════════
// [📄 PDF 다운로드]용 — 새 출력 양식을 Google 문서 변환에 맞는 HTML로 바꾼다 (v3.18)
//   Apps Script 는 HTML → Google 문서 → PDF 로 변환하는데, Google 문서는 <style> 의
//   클래스 규칙·flex·절대위치를 거의 무시하고 표와 인라인 스타일만 제대로 읽는다.
//   그래서 화면 인쇄용 양식(buildExpensePrintHtml)을 숨은 iframe 에 실제로 그려
//   계산된 스타일(테두리·여백·배경·글자 크기·정렬)을 각 요소에 인라인으로 옮기고,
//   flex 영역(머리말 결재란·맺음말)은 표로 바꾼다 → 양식 원본은 하나만 유지.
// ═══════════════════════════════════════════════════════════════
const _DOCS_CONTENT_MM = 186;   // A4 210mm − 좌우 여백 12mm × 2
function buildExpenseDocsHtml(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;height:1200px;border:0;visibility:hidden;';
    const done = (fn, v) => { try { iframe.remove(); } catch (e) {} fn(v); };
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        const body = doc.body;
        body.style.padding = '0';
        body.style.width = _DOCS_CONTENT_MM + 'mm';
        const px2pt = (v) => Math.round(parseFloat(v) * 0.75 * 2) / 2;
        const isZero = (v) => !v || parseFloat(v) === 0;
        const transparent = (c) => !c || c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);
        const CELL = { TD: 1, TH: 1 };
        const BLOCK = { DIV: 1, H1: 1, H2: 1, H3: 1, P: 1, TABLE: 1, SECTION: 1 };

        // 1) 계산된 스타일을 먼저 모두 읽어둔다 (구조를 바꾸기 전에)
        const styles = new Map();
        body.querySelectorAll('*').forEach(el => {
          const tag = el.tagName;
          if (tag === 'COL' || tag === 'COLGROUP' || tag === 'STYLE' || tag === 'BR') return;
          const cs = win.getComputedStyle(el);
          const s = [];
          ['top', 'right', 'bottom', 'left'].forEach(side => {
            const w = cs.getPropertyValue(`border-${side}-width`), st = cs.getPropertyValue(`border-${side}-style`);
            if (!isZero(w) && st !== 'none') s.push(`border-${side}:${px2pt(w)}pt ${st} ${cs.getPropertyValue(`border-${side}-color`)}`);
          });
          if (CELL[tag] || BLOCK[tag] || tag === 'SPAN' || tag === 'B') {
            ['top', 'right', 'bottom', 'left'].forEach(side => {
              const v = cs.getPropertyValue(`padding-${side}`);
              // 워드 문서는 줄 간격이 조금 넓어 1페이지가 넘치므로 칸 위아래 여백은 줄여서 옮긴다
              const k = CELL[tag] && (side === 'top' || side === 'bottom') ? 0.55 : 1;
              if (!isZero(v)) s.push(`padding-${side}:${Math.round(px2pt(v) * k * 2) / 2}pt`);
            });
          }
          if (BLOCK[tag]) {
            ['top', 'bottom'].forEach(side => {
              const v = cs.getPropertyValue(`margin-${side}`);
              if (!isZero(v)) s.push(`margin-${side}:${px2pt(v)}pt`);
            });
          }
          if (!transparent(cs.backgroundColor)) s.push(`background-color:${cs.backgroundColor}`);
          s.push(`color:${cs.color}`);
          s.push(`font-size:${px2pt(cs.fontSize)}pt`);
          if (Number(cs.fontWeight) >= 600) s.push('font-weight:bold');
          if (cs.letterSpacing && cs.letterSpacing !== 'normal' && !isZero(cs.letterSpacing)) s.push(`letter-spacing:${px2pt(cs.letterSpacing)}pt`);
          if ((CELL[tag] || BLOCK[tag]) && /center|right/.test(cs.textAlign)) s.push(`text-align:${cs.textAlign}`);
          if (CELL[tag]) { s.push(`vertical-align:${cs.verticalAlign === 'top' ? 'top' : 'middle'}`); if (cs.whiteSpace === 'nowrap') s.push('white-space:nowrap'); }
          if (tag === 'TABLE') s.push('border-collapse:collapse');
          if (el.closest('table.sign') && CELL[tag]) {
            s.push(`width:${px2pt(cs.width)}pt`);
            if (el.classList.contains('s') || el.classList.contains('d')) s.push(`height:${px2pt(cs.height)}pt`);
          }
          if (cs.whiteSpace === 'pre-wrap' || cs.whiteSpace === 'pre-line') s.push('white-space:pre-wrap');
          styles.set(el, s.join(';'));
        });

        // 칸 너비 — 브라우저가 실제로 그린 너비를 그대로 옮긴다 (워드 문서 변환은 colgroup·CSS 너비를 잘 안 지킴)
        const cellW = new Map(), tableW = new Map();
        body.querySelectorAll('table').forEach(t => {
          const tw = t.getBoundingClientRect().width || 1;
          tableW.set(t, tw);
          t.querySelectorAll(':scope > tbody > tr > td, :scope > tbody > tr > th, :scope > thead > tr > th, :scope > thead > tr > td, :scope > tr > td, :scope > tr > th')
            .forEach(c => cellW.set(c, { pct: c.getBoundingClientRect().width / tw * 100, px: c.getBoundingClientRect().width }));
        });

        // 2) 스타일을 인라인으로 적용
        styles.forEach((s, el) => el.setAttribute('style', s));
        body.querySelectorAll('table').forEach(t => {
          const sign = t.classList.contains('sign');
          const w = sign ? Math.round(tableW.get(t)) : null;
          t.setAttribute('width', sign ? String(w) : '100%');
          t.setAttribute('style', (t.getAttribute('style') || '') + (sign ? `;width:${px2pt(w)}pt` : ';width:100%'));
          t.setAttribute('cellspacing', '0'); t.setAttribute('cellpadding', '0');
        });
        cellW.forEach((w, c) => {
          const sign = !!c.closest('table.sign');
          const v = sign ? String(Math.round(w.px)) : w.pct.toFixed(1) + '%';
          c.setAttribute('width', v);
          if (!sign) c.setAttribute('style', (c.getAttribute('style') || '') + `;width:${v}`);
        });
        body.querySelectorAll('colgroup').forEach(cg => cg.remove());

        // 3) 구조 변환 — flex 영역을 표로
        const toTable = (el, cells) => {
          const t = doc.createElement('table');
          t.setAttribute('width', '100%'); t.setAttribute('cellspacing', '0'); t.setAttribute('cellpadding', '0');
          t.setAttribute('style', (el.getAttribute('style') || '').replace(/padding-[a-z]+:[^;]+;?/g, '') + ';width:100%;border-collapse:collapse');
          const tr = doc.createElement('tr'); t.appendChild(tr);
          const pad = (el.getAttribute('style') || '').match(/padding-bottom:[^;]+/);
          cells.forEach(({ node, align, width }) => {
            const td = doc.createElement('td');
            td.setAttribute('style', `vertical-align:bottom;${align ? 'text-align:' + align + ';' : ''}${width ? 'width:' + width + ';' : ''}${pad ? pad[0] + ';' : ''}`);
            if (align) td.setAttribute('align', align);
            if (width) td.setAttribute('width', width);
            if (node) td.appendChild(node);
            tr.appendChild(td);
          });
          el.replaceWith(t);
        };
        const head = body.querySelector('.doc-head');
        if (head) {
          const title = head.querySelector('.doc-title'), sign = head.querySelector('table.sign');
          if (title) title.setAttribute('style', (title.getAttribute('style') || '').replace(/border-bottom:[^;]+;?/, ''));
          toTable(head, [{ node: title }, { node: sign, align: 'right', width: '40%' }]);
        }
        const closing = body.querySelector('.closing');
        if (closing) toTable(closing, [{ node: closing.querySelector('.cl') }, { node: closing.querySelector('.cr'), align: 'right' }]);
        // 테두리 있는 작은 상자(비고 칸·상세내역 제목)는 1칸 표로 — 워드 문서는 문단마다 테두리를 따로 그림
        const boxToTable = (el) => {
          const st = el.getAttribute('style') || '';
          const t = doc.createElement('table');
          t.setAttribute('width', '100%'); t.setAttribute('cellspacing', '0'); t.setAttribute('cellpadding', '0');
          const m = st.match(/margin-(top|bottom):[^;]+/g) || [];
          t.setAttribute('style', 'width:100%;border-collapse:collapse;' + m.join(';'));
          const tr = doc.createElement('tr'); const td = doc.createElement('td');
          td.setAttribute('width', '100%');
          td.setAttribute('style', st.replace(/margin-(top|bottom):[^;]+;?/g, '') + ';width:100%');
          while (el.firstChild) td.appendChild(el.firstChild);
          tr.appendChild(td); t.appendChild(tr); el.replaceWith(t);
        };
        body.querySelectorAll('.note-box, .detail-title').forEach(boxToTable);
        // 항목 구분선(sec-div 의 윗선)은 얇은 1칸 표로 따로
        body.querySelectorAll('.sec-div').forEach(sec => {
          const st = sec.getAttribute('style') || '';
          const bt = (st.match(/border-top:[^;]+/) || [])[0];
          sec.setAttribute('style', st.replace(/border-top:[^;]+;?/, '').replace(/padding-top:[^;]+;?/, ''));
          if (bt) {
            const t = doc.createElement('table');
            t.setAttribute('width', '100%'); t.setAttribute('cellspacing', '0'); t.setAttribute('cellpadding', '0');
            t.setAttribute('style', 'width:100%;border-collapse:collapse;margin-top:6pt');
            t.innerHTML = `<tr><td width="100%" style="${bt};font-size:2pt;width:100%">&nbsp;</td></tr>`;
            sec.parentNode.insertBefore(t, sec);
          }
        });
        // 결재란 서명칸: 빈 칸은 높이가 줄어들므로 빈 줄을 넣어 둔다
        body.querySelectorAll('table.sign td.s').forEach(td => { td.innerHTML = '&nbsp;<br>&nbsp;<br>&nbsp;'; });
        // 기성률 막대(절대위치) 제거 · 범례 색 견본은 ■ 글자로
        body.querySelectorAll('.cum-tbl .bar').forEach(b => b.remove());
        body.querySelectorAll('.cum-legend i').forEach(i => {
          const sp = doc.createElement('span');
          sp.textContent = '■ ';
          sp.setAttribute('style', `color:${win.getComputedStyle(i).backgroundColor};font-size:8pt`);
          i.replaceWith(sp);
        });
        // 2페이지(상세내역) 앞 페이지 나눔
        const detail = body.querySelector('.detail-page');
        if (detail) {
          const br = doc.createElement('p');
          br.setAttribute('style', 'page-break-before:always;margin:0;font-size:1pt');
          br.innerHTML = '&nbsp;';
          detail.parentNode.insertBefore(br, detail);
        }
        // 클래스·스크립트 정리
        body.querySelectorAll('[class]').forEach(el => el.removeAttribute('class'));
        body.querySelectorAll('script,style').forEach(el => el.remove());

        const title = doc.title || '지출품의서';
        const out = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_pEsc(title)}</title></head>`
          + `<body style="font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:9pt;color:#000;margin:0">${body.innerHTML}</body></html>`;
        done(resolve, out);
      } catch (e) { done(reject, e); }
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

// 숨은 iframe 에 문서를 넣고 인쇄 다이얼로그 오픈 (A4 세로는 문서 내 @page 로 지정됨)
function printExpenseHtml(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    const cleanup = () => { setTimeout(() => iframe.remove(), 500); };
    iframe.onload = () => {
      try {
        const w = iframe.contentWindow;
        w.addEventListener('afterprint', cleanup);
        setTimeout(() => {
          try { w.focus(); w.print(); resolve(); }
          catch (e) { cleanup(); reject(e); }
        }, 250);
        setTimeout(cleanup, 120000); // 안전장치
      } catch (e) { cleanup(); reject(e); }
    };
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });
}

// 화면 미리보기 · A4 세로(210mm) 용지 폭 그대로 표시
const ExpensePrintPreview = ({ html, onPrint, onClose, printing }) => {
  const ref = React.useRef(null);
  const fit = () => {
    const f = ref.current;
    try {
      const h = f.contentDocument.documentElement.scrollHeight;
      // 최소 A4 1장 높이(297mm ≒ 1123px) 이상으로
      f.style.height = Math.max(h, 1123) + 'px';
    } catch (e) { /* ignore */ }
  };
  return (
    <div className="no-print" style={{
      position:'fixed', inset:0, zIndex:100000, background:'#4b4f52',
      display:'flex', flexDirection:'column',
    }}>
      <div style={{
        display:'flex', alignItems:'center', gap:10, padding:'10px 16px',
        background:'#22503A', color:'#fff', fontSize:13, fontWeight:600, flex:'0 0 auto',
      }}>
        <span>👁 출력 미리보기 · A4 세로</span>
        <span style={{flex:1}}/>
        <button onClick={onPrint} disabled={printing}
          style={{padding:'6px 14px', fontSize:12, fontWeight:700, background:'#fff', color:'#22503A', border:0, borderRadius:6, cursor:'pointer'}}>
          🖨️ 인쇄
        </button>
        <button onClick={onClose}
          style={{padding:'6px 14px', fontSize:12, fontWeight:600, background:'transparent', color:'#fff', border:'1px solid rgba(255,255,255,0.4)', borderRadius:6, cursor:'pointer'}}>
          나가기
        </button>
      </div>
      <div style={{flex:1, overflow:'auto', padding:'24px 0 40px', display:'flex', justifyContent:'center', alignItems:'flex-start'}}>
        <iframe
          ref={ref}
          title="지출품의서 미리보기"
          srcDoc={html}
          onLoad={fit}
          style={{width:'210mm', minWidth:'210mm', height:'1123px', border:0, background:'#fff', boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}}
        />
      </div>
    </div>
  );
};

window.classifyPayments = classifyPayments;
window.buildExpensePrintHtml = buildExpensePrintHtml;
window.buildExpenseDocsHtml = buildExpenseDocsHtml;
window.printExpenseHtml = printExpenseHtml;
window.ExpensePrintPreview = ExpensePrintPreview;
window.EXPENSE_PRINT_CSS = EXPENSE_PRINT_CSS;
