/* ═══════════════════════════════════════════════════════════════
   설치도급계약서 · 인쇄물 (A4 세로) — v3.20
   - buildSubcontractHtml(d) : A4 인쇄용 HTML 문서 문자열
   - 원본(회사 설치도급계약서 양식)의 순서·조항을 그대로 따르고, 계약마다 바뀌는 값만 채운다
     1~6 공사 정보 · 세부내역 · 설치비 포함내역 · 지급자재 · 결제(계약금·중도금·잔금)
     7 대금지급방법 · 8 완료보고서 제출항목 · 9~14 고정 조항 · 15 계약의 해지 · 기타 특기사항 · 서명란
   - Google 문서(PDF) 변환을 위해 레이아웃은 표만 사용 (flex/grid 없음)
   - 원본의 호칭 혼용("갑"·"을")은 "도급인"·"하도급인"으로 통일
═══════════════════════════════════════════════════════════════ */

const _sEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
));
const _sNum = (v) => (Math.round(Number(v) || 0)).toLocaleString('ko-KR');
const _sDate = (iso) => {
  const s = String(iso || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '.') : s;
};
const _sLines = (v) => (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map(x => String(x).trim()).filter(Boolean);

// 기본값 — 원본 양식의 문구 (계약마다 입력 창에서 수정 가능)
const SUBCONTRACT_DEFAULTS = {
  qtyText: '세부내역참조',
  vatMode: '별도',
  pays: [
    { label: '계약금', pct: 30, when: '계약시', note: '' },
    { label: '중도금', pct: 20, when: '배관작업완료후', note: '' },
    { label: '잔금', pct: 50, when: '준공완료 후', note: '' },
  ],
  payMethod: '설치완료 및 감리 지적 사항 수정완료 후(준공완료) 잔금을 지급한다.',
  reportItems: '설치현장의 전경 사진\n시운전 DATA\n시운전, 설치확인서 (공사현장 감독 및 책임자)',
  warrantyYears: 2,
  specials: '실내기, 실외기간 통신, 중앙제어, 유선리모콘 설치 포함\n중계기 및 분기관 설치 포함\n현장개설 및 관리에 따른 비용, 잔재처리비용 포함\n계약 체결 후 현장에 대한 모든 내용을 도급인은 하도급인에게 인수인계한다.\n현장에서 실시하는 공정협의회 및 공사일정 조정에 대하여는 계약서 내용에 준하는 것은 하도급인이 처리하며 예외사항 발생 시에는 도급인과 실시간 합의하여 진행한다.',
};
window.SUBCONTRACT_DEFAULTS = SUBCONTRACT_DEFAULTS;

// 결제 금액: 비율대로 나누고 마지막 줄이 끝전을 받아 합계가 계약금액과 정확히 같게
function splitPayments(amount, pays) {
  const total = Math.round(Number(amount) || 0);
  const list = (pays || []).map(p => ({ ...p, pct: Number(p.pct) || 0 }));
  let used = 0;
  return list.map((p, i) => {
    const amt = i === list.length - 1 && list.reduce((s, x) => s + x.pct, 0) === 100
      ? total - used
      : Math.round(total * p.pct / 100);
    used += amt;
    return { ...p, amount: amt };
  });
}
window.splitPayments = splitPayments;

const SUBCONTRACT_PRINT_CSS = `
@page { size: A4 portrait; margin: 14mm 15mm 14mm 15mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans CJK KR','Noto Sans KR',sans-serif;
  font-size: 9.5pt; line-height: 1.5; color: #000;
}
@media screen { body { width: 210mm; padding: 14mm 15mm; } }
.title { text-align: center; font-size: 22pt; font-weight: 800; letter-spacing: 0.35em; padding-left: 0.35em; margin: 0 0 5mm; }
table { width: 100%; border-collapse: collapse; }
table.info td { padding: 0.9mm 1mm; vertical-align: top; }
table.info td.k { width: 26mm; white-space: nowrap; }
table.info td.c { width: 4mm; text-align: center; }
table.info td.r { width: 52mm; white-space: nowrap; }
table.grid { margin-top: 1.2mm; table-layout: fixed; }
table.grid th, table.grid td { border: 0.6pt solid #000; padding: 1.1mm 2mm; vertical-align: middle; }
table.grid th { background: #f2f2f2; font-weight: 700; text-align: center; }
table.grid td.c { text-align: center; } table.grid td.r { text-align: right; font-variant-numeric: tabular-nums; }
table.grid td.lab { text-align: center; font-weight: 700; background: #f7f7f7; }
table.grid tr.sum td { font-weight: 700; }
table.grid .pct { color: #333; margin-left: 2mm; }
.outer { border: 1.4pt solid #000; }
.amount-line td { padding-top: 1.6mm; }
.amount-line .amt { font-size: 11pt; font-weight: 800; text-align: right; font-variant-numeric: tabular-nums; }
.amount-line .vat { font-weight: 700; text-align: center; width: 26mm; }
h3 { font-size: 9.5pt; font-weight: 700; margin: 2.4mm 0 0.6mm; }
p.ln { margin: 0 0 0.4mm 4mm; }
p.ln2 { margin: 0 0 0.4mm 8mm; text-indent: -4mm; }
p.body { margin: 0 0 0.4mm 0; }
p.lead { font-weight: 700; margin: 1.2mm 0 0.6mm; }
.special { margin-top: 4mm; }
.special h3 { font-size: 10.5pt; }
.agree { margin-top: 6mm; break-inside: avoid; page-break-inside: avoid; }
.agree .t { font-size: 11pt; font-weight: 700; line-height: 1.6; }
.agree .d { text-align: center; font-size: 13pt; font-weight: 700; margin: 3mm 0 3mm; letter-spacing: 0.04em; }
table.parties { table-layout: fixed; }
table.parties td { border: 0.6pt solid #000; padding: 1.4mm 1.8mm; font-size: 9pt; vertical-align: middle; }
table.parties td.v { width: 7mm; text-align: center; font-weight: 700; background: #f2f2f2; line-height: 1.7; }
table.parties td.k { width: 21mm; white-space: nowrap; }
table.parties td.gap { border: 0; width: 3mm; }
table.parties .seal { float: right; color: #555; }
`;

function buildSubcontractHtml(d) {
  d = d || {};
  const c = d.contractor || {};
  const s = d.sub || {};
  const amount = Math.round(Number(d.amount) || 0);
  const rows = (d.rows || []).filter(r => r && (r.name || Number(r.qty) || Number(r.unitPrice)));
  const rowAmt = (r) => Math.round((Number(r.qty) || 0) * (Number(r.unitPrice) || 0));
  const rowsTotal = rows.reduce((sum, r) => sum + rowAmt(r), 0);
  const minRows = 5;
  const blank = Math.max(0, minRows - rows.length);
  const pays = splitPayments(amount, d.pays && d.pays.length ? d.pays : SUBCONTRACT_DEFAULTS.pays);
  const period = [d.startDate, d.endDate].filter(Boolean).map(_sDate).join(' ~ ');
  const vat = d.vatMode === '포함' ? 'VAT포함' : 'VAT별도';
  const unitTxt = (r) => (r.unit && r.qty ? ` ${_sEsc(r.unit)}` : '');
  const specName = (r) => _sEsc(r.name) + (r.spec ? ` <span style="color:#444">(${_sEsc(r.spec)})</span>` : '');
  const payMethod = _sLines(d.payMethod != null ? d.payMethod : SUBCONTRACT_DEFAULTS.payMethod);
  const reports = _sLines(d.reportItems != null ? d.reportItems : SUBCONTRACT_DEFAULTS.reportItems);
  const specials = _sLines(d.specials != null ? d.specials : SUBCONTRACT_DEFAULTS.specials);
  const years = Number(d.warrantyYears) || SUBCONTRACT_DEFAULTS.warrantyYears;
  const dateTxt = _sDate(d.contractDate) ? String(d.contractDate).slice(0, 10) : '';
  const numbered = (list) => list.map((t, i) => `<p class="ln2">${i + 1}) ${_sEsc(t)}</p>`).join('');

  const body = `
  <div class="title">설치도급계약서</div>

  <table class="info">
    <tr><td class="k">1. 공 사 명</td><td class="c">:</td><td>${_sEsc(d.siteName)}</td><td class="r"></td></tr>
    <tr><td class="k">2. 공사주소</td><td class="c">:</td><td>${_sEsc(d.siteAddress)}</td><td class="r">담당자 : ${_sEsc(d.manager)}</td></tr>
    <tr><td class="k">3. 설치품목</td><td class="c">:</td><td>${_sEsc(d.item)}</td><td class="r"></td></tr>
    <tr><td class="k">4. 설치수량</td><td class="c">:</td><td>${_sEsc(d.qtyText || SUBCONTRACT_DEFAULTS.qtyText)}</td><td class="r">생년월일 :</td></tr>
    <tr><td class="k">5. 공사기간</td><td class="c">:</td><td>${_sEsc(period)}</td><td class="r"></td></tr>
  </table>
  <table class="info amount-line">
    <tr><td class="k">6. 계약금액</td><td class="c">:</td><td class="amt">${_sNum(amount)}</td><td class="vat">${vat}</td></tr>
  </table>

  <table class="grid outer">
    <colgroup><col style="width:24mm"><col><col style="width:20mm"><col style="width:34mm"><col style="width:38mm"></colgroup>
    <tr><th></th><th>품목</th><th>수량</th><th>단가</th><th>금액</th></tr>
    ${rows.map((r, i) => `<tr>
      ${i === 0 ? `<td class="lab" rowspan="${rows.length + blank + 1}">세부내역</td>` : ''}
      <td>${specName(r)}</td><td class="r">${_sNum(r.qty)}${unitTxt(r)}</td><td class="r">${_sNum(r.unitPrice)}</td><td class="r">${_sNum(rowAmt(r))}</td></tr>`).join('')}
    ${Array.from({ length: blank }).map((_, i) => `<tr>
      ${rows.length === 0 && i === 0 ? `<td class="lab" rowspan="${blank + 1}">세부내역</td>` : ''}
      <td>&nbsp;</td><td></td><td></td><td class="r">-</td></tr>`).join('')}
    <tr class="sum"><td class="c">합&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;계</td><td></td><td></td><td class="r">${_sNum(rowsTotal || amount)}</td></tr>
    <tr><td class="lab">설치비 포함내역</td><td colspan="4">${_sEsc(d.includedText)}</td></tr>
    <tr><td class="lab">지 급 자 재</td><td colspan="4">${_sEsc(d.suppliedText)}</td></tr>
    <tr><th>결제부분</th><th colspan="2">금액</th><th>입금날짜</th><th>비고</th></tr>
    ${pays.map(p => `<tr><td class="c">${_sEsc(p.label)}</td><td class="r" colspan="2">${_sNum(p.amount)}<span class="pct">( ${_sEsc(p.pct)}% )</span></td><td class="c">${_sEsc(p.when)}</td><td>${_sEsc(p.note)}</td></tr>`).join('')}
  </table>

  <h3>7. 대금지급방법</h3>
  ${numbered(payMethod)}

  <h3>8. 완료보고서 작성시 제출항목</h3>
  ${numbered(reports)}

  <h3>9. 기기 및 자재의 검사</h3>
  <p class="ln2">1) 공사에 사용할 기기 및 자재는 신품이어야 하며 품질·규격 등은 반드시 설계서(시방서)와 일치되거나 동등 이상이어야 한다.</p>
  <p class="ln2">2) “하도급인”은 “도급인”이 요구하는 자재 외에 불합격된 자재를 사용하여 발생된 전반적인 문제에 대하여 모든 책임을 진다.</p>
  <p class="ln2">3) 견적서, 시방서 등 제출서류의 착오 등은 전적으로 “하도급인”이 책임진다.</p>

  <h3>10. 부적합한 공사</h3>
  <p class="body">“도급인”은 “하도급인”이 시공한 공사 중 설계서에 적합하지 아니한 부분이 있을 때에는 이의 시정을 요구할 수 있으며, “하도급인”은 지체 없이 이에 응하여야 한다.</p>

  <h3>11. 공사의 중지</h3>
  <p class="body">다음 각 호의 경우 “도급인”은 공사의 중지를 요구할 수 있다.</p>
  <p class="ln2">1) “도급인”이 “하도급인”에게 요구한 개선 및 시정조치가 이행되지 않을 경우</p>
  <p class="ln2">2) 부실, 불량공사가 우려되는 경우</p>

  <h3>12. 폐기물처리</h3>
  <p class="ln2">1) 본 공사 중 발생한 작업폐자재는 “하도급인”의 책임으로 반출하여야 한다.</p>
  <p class="ln2">2) 제1항을 “하도급인”이 이행치 않을 경우 “도급인”이 처리한 후 “하도급인”의 공사대금에서 상계한다.</p>

  <h3>13. 손해배상책임</h3>
  <p class="body">“하도급인”은 작업 중 “하도급인”의 작업 종사원에 대한 고의, 과실로 인하여 입주민의 시설물 또는 “도급인”에게 손해가 발생되었을 경우에는 “도급인”의 요구에 따라 그 손해를 배상한다.</p>

  <h3>14. 하자의 보증</h3>
  <p class="body">본 공사의 무상 하자보수기간은 준공일로부터 ${_sEsc(years)}년으로 한다.</p>

  <h3>15. 계약의 해지</h3>
  <p class="body">다음 각 호의 경우 “도급인”은 본 계약을 해지할 수 있다. 또한 필요시 “하도급인”이 본 계약을 이행할 때까지 “도급인”은 공사대금의 지급을 지체할 수 있다.</p>
  <p class="ln2">① “하도급인”이 공사기간을 준수하지 않아 민원이 발생한 경우</p>
  <p class="ln2">② 공사중지의 장기간 지속 또는 “하도급인”의 계속적인 공사수행이 곤란하여 타 업체를 선정하여 공사를 완료하여야 할 경우</p>
  <p class="ln2">③ “하도급인”이 “도급인”이 요구한 개선 및 시정공사를 지정된 기간 내에 실시하지 않을 경우</p>
  <p class="ln2">④ “도급인”의 공사중단 지시 또는 감독내용을 “하도급인”이 위반하거나 이행하지 않은 경우</p>
  <p class="ln2">⑤ 기타 이 계약의 목적달성이 어려운 경우</p>

  ${specials.length ? `<div class="special">
    <h3>* 기타 특기사항</h3>
    ${specials.map((t, i) => `<p class="ln2">${i + 1}. ${_sEsc(t)}</p>`).join('')}
  </div>` : ''}

  <div class="agree">
    <div class="t">당사자는 설치도급 계약을 체결하고 계약서 2부를 작성하고<br>서명하여 각각 1부씩 보관한다.</div>
    <div class="d">${_sEsc(dateTxt)}</div>
    <table class="parties">
      <colgroup><col style="width:7mm"><col style="width:21mm"><col><col style="width:3mm"><col style="width:7mm"><col style="width:21mm"><col></colgroup>
      <tr><td class="v" rowspan="5">도<br>급<br>인</td><td class="k">주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 :</td><td>${_sEsc(c.address)}</td>
          <td class="gap" rowspan="5"></td>
          <td class="v" rowspan="5">하<br>도<br>급<br>인</td><td class="k">주&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;소 :</td><td>${_sEsc(s.address)}</td></tr>
      <tr><td class="k">상&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;호 :</td><td>${_sEsc(c.name)}</td><td class="k">상&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;호 :</td><td>${_sEsc(s.name)}</td></tr>
      <tr><td class="k">사업자번호 :</td><td>${_sEsc(c.bizNo)}</td><td class="k">사업자번호 :</td><td>${_sEsc(s.bizNo)}</td></tr>
      <tr><td class="k">대표이사 :</td><td>${_sEsc(c.ceo)}<span class="seal">(인)</span></td><td class="k">대&nbsp;&nbsp;표&nbsp;&nbsp;자 :</td><td>${_sEsc(s.ceo)}<span class="seal">(인)</span></td></tr>
      <tr><td class="k">전화번호 :</td><td>${_sEsc(c.tel)}</td><td class="k">전화번호 :</td><td>${_sEsc(s.tel)}</td></tr>
    </table>
  </div>`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>설치도급계약서_${_sEsc(d.siteName || '')}</title>
<style>${SUBCONTRACT_PRINT_CSS}</style></head><body>${body}</body></html>`;
}

window.buildSubcontractHtml = buildSubcontractHtml;
window.SUBCONTRACT_PRINT_CSS = SUBCONTRACT_PRINT_CSS;

// ═══════════════════════════════════════════════════════════════
// 하자보증이행각서 (A4 1장) — v3.21
//   회사 원본 양식: 공사명 · 계약금액(VAT포함) · 계약일자/준공일자 · 하자보증금율 ·
//   하자보증 시작일/마감일 · 하자보증금액(VAT포함) · 하자보수 이행방법 · 각서 문구 ·
//   제출일 · 하도급인(주소·상호·대표자·사업자번호) · "○○ 귀하"
//   원본에서 엑셀 수식이 깨져 나오던 칸(계약일자 1900년, 보증금액 -)은 여기서 계산
// ═══════════════════════════════════════════════════════════════
const _kDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : '';
};
const _addDays = (iso, n) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.toISOString().slice(0, 10);
};
const _addYears = (iso, y) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1] + Number(y || 0), +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10);
};
// 보증기간: 준공일 다음 날부터 N년 (마감일 = 시작일 + N년 − 1일) · 금액은 VAT포함 기준
function warrantyCalc(d) {
  const years = Number(d.warrantyYears) || 0;
  const start = d.endDate ? _addDays(d.endDate, 1) : '';
  const end = start && years ? _addDays(_addYears(start, years), -1) : '';
  const amount = Math.round(Number(d.amount) || 0);
  const amountVat = d.vatMode === '포함' ? amount : Math.round(amount * 1.1);
  const rate = Number(d.warrantyRate);
  const bond = Math.round(amountVat * (isNaN(rate) ? 0 : rate) / 100);
  return { start, end, amountVat, rate: isNaN(rate) ? 0 : rate, bond };
}
window.warrantyCalc = warrantyCalc;

const WARRANTY_PRINT_CSS = `
@page { size: A4 portrait; margin: 18mm 18mm 18mm 18mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans CJK KR','Noto Sans KR',sans-serif; font-size: 11pt; color: #000; }
@media screen { body { width: 210mm; padding: 18mm; } }
table { width: 100%; border-collapse: collapse; }
table.w { border: 1pt solid #000; table-layout: fixed; }
table.w td { border-bottom: 0.6pt solid #000; padding: 2.4mm 3mm; vertical-align: middle; }
table.w td.k { text-align: center; letter-spacing: 0.3em; white-space: nowrap; border-right: 0.6pt solid #000; width: 32mm; }
table.w td.k2 { text-align: center; letter-spacing: 0.15em; white-space: nowrap; border-right: 0.6pt solid #000; border-left: 0.6pt solid #000; width: 32mm; }
table.w td.v { text-align: center; }
table.w td.r { text-align: right; font-variant-numeric: tabular-nums; }
table.w td.L { border-left: 1pt solid #000; } table.w td.R { border-right: 1pt solid #000; } table.w td.T { border-top: 1pt solid #000; } table.w td.B { border-bottom: 1pt solid #000 !important; }
table.w td.title { text-align: center; font-size: 20pt; font-weight: 800; letter-spacing: 0.55em; padding: 6mm 0 6mm 0.55em; }
table.w td.vat { text-align: left; width: 26mm; white-space: nowrap; padding-left: 1mm; }
table.w td.pledge { border-bottom: 0; padding: 8mm 8mm 2mm; line-height: 2.5; text-align: justify; }
table.w td.pdate { border-bottom: 0; text-align: center; padding: 0 0 12mm; }
table.w td.who { border-bottom: 0; padding: 0 0 6mm; }
table.who td { border: 0; padding: 2mm 0; font-size: 11pt; }
table.who td.wk { width: 70mm; text-align: right; letter-spacing: 0.4em; padding-right: 6mm; }
table.who td.wv { text-align: left; }
table.who .seal { color: #555; font-size: 9pt; margin-left: 10mm; }
table.w td.to { border-bottom: 0; font-size: 14pt; font-weight: 800; padding: 6mm 3mm 10mm; }
`;

function buildWarrantyHtml(d) {
  d = d || {};
  const s = d.sub || {};
  const c = d.contractor || {};
  const w = warrantyCalc(d);
  const pledgeDate = d.pledgeDate || d.endDate || '';
  const body = `
  <table class="w">
    <colgroup><col style="width:32mm"><col><col style="width:32mm"><col></colgroup>
    <tr><td class="title L R T" colspan="4">하자보증이행각서</td></tr>
    <tr><td class="k L">공사명</td><td class="v R" colspan="3">${_sEsc(d.siteName)}</td></tr>
    <tr><td class="k L">계약금액</td><td class="r R" colspan="3">${_sNum(w.amountVat)}&nbsp;&nbsp;&nbsp;&nbsp;VAT포함</td></tr>
    <tr><td class="k L">계약일자</td><td class="v">${_kDate(d.contractDate)}</td><td class="k2">준공일자</td><td class="v R">${_kDate(d.endDate)}</td></tr>
    <tr><td class="k L" style="letter-spacing:0.05em">하자보증금율</td><td class="v R" colspan="3">${_sEsc(w.rate)}%</td></tr>
    <tr><td class="k L" style="letter-spacing:0.02em">하자보증시작일</td><td class="v">${_kDate(w.start)}</td><td class="k2" style="letter-spacing:0.02em">하자보증마감일</td><td class="v R">${_kDate(w.end)}</td></tr>
    <tr><td class="k L" style="letter-spacing:0.05em">하자보증금액</td><td class="r R" colspan="3">${_sNum(w.bond)}&nbsp;&nbsp;&nbsp;&nbsp;VAT포함</td></tr>
    <tr><td class="k L" style="letter-spacing:0.1em;line-height:1.3">하 자 보 수<br>이 행 방 법</td><td class="R" colspan="3">${_sEsc(d.warrantyMethod || '이행각서')}</td></tr>
    <tr><td class="pledge L R" colspan="4">&nbsp;&nbsp;본인은 귀사에서 시행하는 위의 공사에 대한 하자보수를 이행함에 있어 공사계약일반조건에 따라 면제 받은 바, 하자책임기간내에 하자가 발견될 시에는 즉시 실액변상 또는 재시공할 것을 확약하며, 이를 이행치 않을 경우 귀사의 어떠한 조치에도 이의를 제기하지 않겠기에 각서를 제출합니다.</td></tr>
    <tr><td class="pdate L R" colspan="4">${_kDate(pledgeDate)}</td></tr>
    <tr><td class="who L R" colspan="4">
      <table class="who">
        <tr><td class="wk">주소 :</td><td class="wv">${_sEsc(s.address)}</td></tr>
        <tr><td class="wk">상호 :</td><td class="wv"><b>${_sEsc(s.name)}</b></td></tr>
        <tr><td class="wk">대표자 :</td><td class="wv">${_sEsc(s.ceo)}<span class="seal">(인)</span></td></tr>
        <tr><td class="wk" style="letter-spacing:0.05em">사업자번호 :</td><td class="wv">${_sEsc(s.bizNo)}</td></tr>
      </table>
    </td></tr>
    <tr><td class="to L R B" colspan="4">${_sEsc(c.name || '')}&nbsp;&nbsp;귀하</td></tr>
  </table>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>하자보증이행각서_${_sEsc(d.siteName || '')}</title>
<style>${WARRANTY_PRINT_CSS}</style></head><body>${body}</body></html>`;
}
window.buildWarrantyHtml = buildWarrantyHtml;
