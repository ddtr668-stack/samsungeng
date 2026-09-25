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
  border: 0.6pt solid #000; padding: 1.8mm 3mm; min-height: 45mm; white-space: pre-wrap; word-break: keep-all;
}
.empty { text-align: center; color: #666; padding: 3mm; }
.closing { margin-top: 3.5mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.closing .line { font-size: 10.5pt; font-weight: 600; }
.closing .date { font-size: 11pt; margin: 2.5mm 0 1.5mm; letter-spacing: 0.1em; }
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
    return `<tr><td class="l">${_pEsc(r.roundNo)}차 · ${_pDate(r.docDate)}</td><td class="r">${_pNum(amt)}</td><td class="r">${_pPct(pctOf(amt))}</td><td class="r">${_pPct(pctOf(prevCum))}</td></tr>`;
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
  const pnlInstall = inst.length ? installItemTotal : installTotalBudget;
  const pnlProduct = prod.length ? productCur : productTotalBudget;
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
  const vendorNameOf = (override) => (override && String(override).trim()) ? override : vendorName;
  // 🆕 화면(v3) 카드 순서와 동일하게: 제품대 → 설치비 → 기타비용 → 영업수수료
  const vendorRows = [];
  if (includeProduct && productCur > 0) vendorRows.push({ amt: productCur, note: '제품대', name: vendorNameOf(d.productVendorName) });
  if (includeInstall && req > 0) vendorRows.push({ amt: req, note: '설치비', name: vendorName });
  if (includeEtc && etcCur > 0) vendorRows.push({ amt: etcCur, note: '기타비용', name: vendorNameOf(d.etcVendorName) });
  if (includeCommission && commissionCur > 0) vendorRows.push({ amt: commissionCur, note: '영업수수료', name: vendorNameOf(d.commissionVendorName) });
  const vendorTotal = vendorRows.reduce((s, r) => s + r.amt, 0);
  const vendorRowsHtml = vendorRows.map((r, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td class="l" style="white-space:nowrap">${_pEsc(r.name)}</td>
          <td class="l" style="white-space:nowrap">${_pEsc(vendorBizNo || '-')}</td>
          <td class="l" style="white-space:nowrap">${_pEsc(vendorManager || '-')}${vendorTel ? ` <span style="font-size:8pt;color:#555">(${_pEsc(vendorTel)})</span>` : ''}</td>
          <td class="r">${_pWon(r.amt)}</td>
          <td class="l">${_pEsc(r.note)}</td>
        </tr>`).join('');

  // ── 지급 내역 요약(1페이지) — 화면(v3) 카드 순서와 동일: 제품대 → 설치비 → 기타비용 → 영업수수료 ──
  const summaryRowsHtml = [
    buildSummaryRow(1, '제품대', productTotalBudget, productCur, productPrevCum, includeProduct),
    buildSummaryRow(2, '설치비', installTotalBudget, req, installPrevCum, includeInstall),
    buildSummaryRow(3, '기타비용', etcTotalBudget, etcCur, etcPrevCum, includeEtc),
    buildSummaryRow(4, '영업수수료', commissionTotalBudget, commissionCur, commissionPrevCum, includeCommission),
  ].join('');

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
  <div class="doc-title">지 출 품 의 서</div>

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
    <h2>□ 지급 내역 요약<small>구분별 총액 · 금회 지급액 · 누계 · 잔액 (상세 근거는 2페이지)</small></h2>
    <table class="summary-tbl">
      <colgroup><col style="width:34mm"><col><col><col><col></colgroup>
      <thead><tr><th>구분</th><th>총액</th><th>지급액(금회)</th><th>누계</th><th>잔액</th></tr></thead>
      <tbody>${summaryRowsHtml}</tbody>
    </table>
  </div>
  </div>

  <div class="sec">
    <h2>□ 비고 사항</h2>
    <div class="note-box">${f.note ? _pEsc(f.note) : ''}</div>
  </div>

  <div class="closing">
    <div class="line">위와 같이 지출을 품의합니다.</div>
    <div class="date">${_pEsc(dateKor)}</div>
    <div class="co">${_pEsc(d.companyName || '주식회사 삼성이엔지')}</div>
    <div class="who">영업담당 : ${_pEsc(f.manager || '')} &nbsp;&nbsp;&nbsp; (인)</div>
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
        <tr><th>(-) 제품대</th><td class="r">${_pNum(pnlProduct)}</td><td class="l">${prod.length ? '제품 내역서 합계' : (productTotalBudget ? '계약관리 시트 제품대' : '-')}</td></tr>
        <tr><th>(-) 설치비</th><td class="r">${_pNum(pnlInstall)}</td><td class="l">${inst.length ? '설치비 내역서 합계' : '도급금액 (내역서 미입력)'}</td></tr>
        <tr><th>(-) 기타비용</th><td class="r">${_pNum(pnlEtc)}</td><td class="l">${pnlEtc ? '계약관리 시트 부대비용' : '-'}</td></tr>
        <tr><th>(-) 영업수수료</th><td class="r">${_pNum(pnlCom)}</td><td class="l">${pnlCom ? '계약관리 시트 영업비용' : '-'}</td></tr>
        <tr class="total pnl-sum"><th>예상 손익</th><td class="r">${_neg(pnlProfit)}</td><td class="l">예상 수익률 ${pnlRate.toFixed(1)}%</td></tr>
      </tbody>
    </table>
  </div>

  <div class="sec sec-div">
    <h2><span class="num">1.</span>제품대<small>${includeProduct ? `제품대 총액 ${_pNum(productTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    <table class="info" style="margin-bottom:2mm">
      <colgroup><col style="width:22mm"><col><col style="width:22mm"><col></colgroup>
      <tr><th>업체명</th><td class="l">${_pEsc(vendorNameOf(d.productVendorName))}</td><th>사업자번호</th><td class="l" style="white-space:nowrap">${_pEsc(vendorBizNo || '-')}</td></tr>
      <tr><th>담당자</th><td class="l">${_pEsc(vendorManager || '-')}</td><th>연락처</th><td class="l">${_pEsc(vendorTel || '-')}</td></tr>
      <tr><th>계좌번호</th><td class="l" colspan="3">${_pEsc(f.subBank || '-')} ${_pEsc(f.subAccount || '')}${f.subHolder ? ` (예금주: ${_pEsc(f.subHolder)})` : ''}</td></tr>
    </table>
    ${buildRoundHistoryTable(d.productRounds, productCur, includeProduct, productTotalBudget, docDate, roundLabel)}
    ${productItemsTable}
  </div>

  <div class="sec sec-div">
    <h2><span class="num">2.</span>설치비<small>${includeInstall ? `총금액 ${_pNum(installTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    <table class="info" style="margin-bottom:2mm">
      <colgroup><col style="width:22mm"><col><col style="width:22mm"><col></colgroup>
      <tr><th>업체명</th><td class="l">${_pEsc(vendorName)}</td><th>사업자번호</th><td class="l" style="white-space:nowrap">${_pEsc(vendorBizNo || '-')}</td></tr>
      <tr><th>담당자</th><td class="l">${_pEsc(vendorManager || '-')}</td><th>연락처</th><td class="l">${_pEsc(vendorTel || '-')}</td></tr>
      <tr><th>계좌번호</th><td class="l" colspan="3">${_pEsc(f.subBank || '-')} ${_pEsc(f.subAccount || '')}${f.subHolder ? ` (예금주: ${_pEsc(f.subHolder)})` : ''}</td></tr>
    </table>
    ${buildRoundHistoryTable(d.rounds, req, includeInstall, installTotalBudget, docDate, roundLabel)}
    ${installItemsTable}
  </div>

  <div class="sec sec-div">
    <h2><span class="num">3.</span>기타비용<small>${includeEtc ? `기타비용 총액 ${_pNum(etcTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    <table class="info" style="margin-bottom:2mm">
      <colgroup><col style="width:22mm"><col><col style="width:22mm"><col></colgroup>
      <tr><th>업체명</th><td class="l">${_pEsc(vendorNameOf(d.etcVendorName))}</td><th>사업자번호</th><td class="l" style="white-space:nowrap">${_pEsc(vendorBizNo || '-')}</td></tr>
      <tr><th>담당자</th><td class="l">${_pEsc(vendorManager || '-')}</td><th>연락처</th><td class="l">${_pEsc(vendorTel || '-')}</td></tr>
      <tr><th>계좌번호</th><td class="l" colspan="3">${_pEsc(f.subBank || '-')} ${_pEsc(f.subAccount || '')}${f.subHolder ? ` (예금주: ${_pEsc(f.subHolder)})` : ''}</td></tr>
    </table>
    ${buildRoundHistoryTable(d.etcRounds, etcCur, includeEtc, etcTotalBudget, docDate, roundLabel)}
    ${etcItemsTable}
  </div>

  <div class="sec sec-div">
    <h2><span class="num">4.</span>영업수수료<small>${includeCommission ? `영업수수료 총액 ${_pNum(commissionTotalBudget)}원 기준 · 회차별 지급 이력` : '이번 회차 미포함'}</small></h2>
    <table class="info" style="margin-bottom:2mm">
      <colgroup><col style="width:22mm"><col><col style="width:22mm"><col></colgroup>
      <tr><th>업체명</th><td class="l">${_pEsc(vendorNameOf(d.commissionVendorName))}</td><th>사업자번호</th><td class="l" style="white-space:nowrap">${_pEsc(vendorBizNo || '-')}</td></tr>
      <tr><th>담당자</th><td class="l">${_pEsc(vendorManager || '-')}</td><th>연락처</th><td class="l">${_pEsc(vendorTel || '-')}</td></tr>
      <tr><th>계좌번호</th><td class="l" colspan="3">${_pEsc(f.subBank || '-')} ${_pEsc(f.subAccount || '')}${f.subHolder ? ` (예금주: ${_pEsc(f.subHolder)})` : ''}</td></tr>
    </table>
    ${buildRoundHistoryTable(d.commissionRounds, commissionCur, includeCommission, commissionTotalBudget, docDate, roundLabel)}
    ${commissionItemsTable}
  </div>
  </div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>지출품의서_${_pEsc(c.projectName || '')}_${_pEsc(roundLabel)}</title>
<style>${EXPENSE_PRINT_CSS}</style></head><body>${body}</body></html>`;
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
window.printExpenseHtml = printExpenseHtml;
window.ExpensePrintPreview = ExpensePrintPreview;
