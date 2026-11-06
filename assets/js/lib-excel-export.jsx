/* ─────────────────────────────────────────────────────────────
 * 엑셀 내보내기 — 화면처럼 서식 있는 .xlsx (v3.37)
 * 예전: 서식 없는 CSV. 지금: 앱 색상·태그·막대·합계 수식이 들어간 엑셀 파일
 *  - 계약 관리 [엑셀 내보내기] → exportContractsXlsx
 *  - 미수금 [수금 리포트]      → exportReceivablesXlsx
 * ExcelJS 는 버튼을 처음 누를 때만 불러옴 (사이트 첫 화면 속도에 영향 없음)
 * ───────────────────────────────────────────────────────────── */

const XL_LIB = {
  src: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  integrity: 'sha384-Pqp51FUN2/qzfxZxBCtF0stpc9ONI6MYZpVqmo8m20SoaQCzf+arZvACkLkirlPz',
};
let _xlLoading = null;
function loadExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!_xlLoading) {
    _xlLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = XL_LIB.src; s.integrity = XL_LIB.integrity; s.crossOrigin = 'anonymous'; s.async = true;
      s.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('엑셀 기능을 불러오지 못했습니다.'));
      s.onerror = () => { _xlLoading = null; reject(new Error('엑셀 기능을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
  }
  return _xlLoading;
}

// ─── 앱 색상 (app.css 와 같은 값) ───
const XL_FONT = '맑은 고딕';
const XC = {
  green:'1D4331', green6:'2E6446', ink1:'141914', ink2:'3A3F3A', ink3:'6B7069', ink4:'9A9E93',
  line:'E4E2D8', bg2:'EEEDE5', zebra:'FAFAF6', danger:'B4442E', pos:'2F7A55', bronze:'B8873B', white:'FFFFFF',
  // 칸 안 막대는 % 글자가 가려지지 않도록 옅은 색
  barGreen:'B5D3C1', barBronze:'E7CFA2',
};
const XL_CAT = {
  '민수':['EEEEE6','3F3D2E'], '조달공사':['E9EFEA','254732'], '정부지원사업':['F5E7CE','7A5320'],
  '조달납품':['E1EBEE','2A4E5C'], '관수':['EDEDE5','6B7069'],
};
const XL_CATBAR = { '민수':'8A7A3C', '조달공사':'2E6446', '정부지원사업':'A2762E', '조달납품':'4E7A8A', '관수':'6B7069' };
const XL_ST = { '완료':['E7F1EB','2F7A55'], '진행중':['E4ECF4','2F5A80'], '미진행':['EDEDE5','6B7069'] };

const _argb = (hex) => 'FF' + hex;
const _font = (o = {}) => ({ name: XL_FONT, size: o.size || 10, bold: !!o.bold, color: { argb: _argb(o.color || XC.ink1) } });
const _fill = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: _argb(hex) } });
const _thin = { style: 'thin', color: { argb: _argb(XC.line) } };
const _al = (h = 'left', o = {}) => ({ horizontal: h, vertical: 'middle', indent: h === 'center' ? 0 : (o.indent ?? 1), wrapText: !!o.wrap });

const _ym = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})/); return m ? `'${m[1].slice(2)}.${m[2]}` : (d || ''); };
const _stamp = () => {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  return { text: `${d.getFullYear()}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
           ymd: `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}` };
};
const XL_COMPANY = '주식회사 삼성이엔지';

// 다운로드
async function _saveWorkbook(wb, fileName) {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ─── 공통: 제목 · 조건 · 요약 숫자 ───
// kpis: [{ label, value, color, from, to, money }] (from/to = 열 번호, 칸 합치기)
function _writeHeader(ws, { title, conditions, kpis, lastCol }) {
  const st = _stamp();
  const t = ws.getCell(1, 1); t.value = title; t.font = _font({ size: 18, bold: true, color: XC.green }); t.alignment = _al('left');
  ws.getRow(1).height = 30;
  ws.mergeCells(1, lastCol - 3, 1, lastCol);
  const r = ws.getCell(1, lastCol - 3); r.value = `${XL_COMPANY} · 출력 ${st.text}`; r.font = _font({ size: 9, color: XC.ink3 }); r.alignment = _al('right', { indent: 0 });
  const c = ws.getCell(2, 1); c.value = `조건  ${conditions}`; c.font = _font({ size: 9.5, color: XC.ink3 }); c.alignment = _al('left');
  (kpis || []).forEach(k => {
    if (k.to > k.from) { ws.mergeCells(3, k.from, 3, k.to); ws.mergeCells(4, k.from, 4, k.to); }
    const a = ws.getCell(3, k.from); a.value = k.label; a.font = _font({ size: 8.5, color: XC.ink3 }); a.alignment = _al('left');
    const b = ws.getCell(4, k.from); b.value = k.value; b.font = _font({ size: 13, bold: true, color: k.color || XC.ink1 }); b.alignment = _al('left');
    if (k.money) b.numFmt = '#,##0"원"';
    if (k.pct) b.numFmt = '0.0%';
  });
  ws.getRow(4).height = 22;
  return st;
}

// ─── 공통: 표 (머리 · 본문 · 합계 · 막대 · 고정 · 필터 · 인쇄) ───
// cols: [{ header, width, align, numFmt, get(row,i), style(row,i,value) → {font, fill}, tag:'cat'|'status', bar:hex, sum:true }]
function _writeTable(ws, { startRow, cols, rows, totalLabel, totalLabelSpan = 1, extraTotals }) {
  const H = startRow, N = cols.length;
  cols.forEach((c, i) => {
    const cell = ws.getCell(H, i + 1);
    cell.value = c.header; cell.font = _font({ size: 9.5, bold: true, color: XC.white }); cell.fill = _fill(XC.green);
    cell.alignment = _al(c.align || 'left');
  });
  ws.getRow(H).height = 26;
  rows.forEach((row, k) => {
    const R = H + 1 + k;
    const zebra = k % 2 ? _fill(XC.zebra) : null;
    cols.forEach((c, i) => {
      const cell = ws.getCell(R, i + 1);
      const v = c.get(row, k);
      cell.value = v;
      cell.border = { bottom: _thin };
      cell.alignment = _al(c.align || 'left');
      if (c.numFmt) cell.numFmt = c.numFmt;
      let font = { size: 10 }, fill = zebra;
      if (c.tag === 'cat' || c.tag === 'status') {
        const pair = (c.tag === 'cat' ? XL_CAT : XL_ST)[v] || XL_CAT['관수'];
        fill = _fill(pair[0]); font = { size: 9, bold: true, color: pair[1] };
      }
      if (c.style) Object.assign(font, c.style(row, k, v) || {});
      cell.font = _font(font);
      if (fill) cell.fill = fill;
    });
    ws.getRow(R).height = 22;
  });
  // 합계 줄 (SUM 수식 — 엑셀에서 숫자를 고치면 합계도 따라 바뀜)
  const T = H + 1 + rows.length;
  const colL = (i) => ws.getColumn(i + 1).letter;
  for (let i = 0; i < N; i++) {
    const cell = ws.getCell(T, i + 1);
    cell.fill = _fill(XC.bg2); cell.font = _font({ bold: true });
    cell.border = { top: { style: 'medium', color: { argb: _argb(XC.ink2) } } };
    cell.alignment = _al(cols[i].align || 'left');
  }
  if (totalLabelSpan > 1) ws.mergeCells(T, 1, T, totalLabelSpan);
  const lab = ws.getCell(T, 1); lab.value = `${totalLabel} · ${rows.length}건`; lab.alignment = _al('left');
  cols.forEach((c, i) => {
    if (!c.sum) return;
    const cell = ws.getCell(T, i + 1);
    const result = rows.reduce((s, r, k) => s + (Number(c.get(r, k)) || 0), 0);
    cell.value = rows.length ? { formula: `SUM(${colL(i)}${H + 1}:${colL(i)}${T - 1})`, result } : 0;
    cell.numFmt = '#,##0';
    if (c.sumColor) cell.font = _font({ bold: true, color: c.sumColor });
  });
  if (extraTotals) extraTotals(ws, T, colL);
  ws.getRow(T).height = 26;
  // 칸 안 막대 (진행률·수금률)
  cols.forEach((c, i) => {
    if (!c.bar || !rows.length) return;
    ws.addConditionalFormatting({
      ref: `${colL(i)}${H + 1}:${colL(i)}${T - 1}`,
      rules: [{ type: 'dataBar', gradient: false, minLength: 0, maxLength: 100,
        cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: _argb(c.bar) } }],
    });
  });
  ws.views = [{ state: 'frozen', ySplit: H, showGridLines: false }];
  if (rows.length) ws.autoFilter = { from: { row: H, column: 1 }, to: { row: T - 1, column: N } };
  ws.pageSetup = {
    paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printTitlesRow: `${H}:${H}`,
  };
  return T;
}

// ═══════════════════════════════════════════════════════════════
// 계약 목록
// rows: 화면에 보이는 순서(정렬·필터 적용된 sorted) · conditions: 조건 문장
// ═══════════════════════════════════════════════════════════════
async function exportContractsXlsx({ rows, conditions, manager }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook(); wb.creator = XL_COMPANY;
  const ws = wb.addWorksheet('계약 목록');
  const widths = [13, 8, 12, 22, 8, 44, 20, 16, 16, 16, 15, 8, 10, 9];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const sum = (k) => rows.reduce((s, c) => s + (Number(c[k]) || 0), 0);
  _writeHeader(ws, {
    title: '계약 목록', conditions, lastCol: widths.length,
    kpis: [
      { label: '계약', value: `${rows.length}건`, from: 1, to: 2 },
      { label: '계약금 합계', value: sum('totalAmount'), money: true, from: 3, to: 5 },
      { label: '잔금 합계', value: sum('balance'), money: true, color: XC.danger, from: 6, to: 6 },
      { label: '이익금 합계', value: sum('profit'), money: true, color: XC.pos, from: 7, to: 8 },
    ],
  });
  const money = (k, o = {}) => ({ align: 'right', numFmt: o.fmt || '#,##0', get: c => Number(c[k]) || 0, sum: true, ...o });
  _writeTable(ws, {
    startRow: 6, rows, totalLabel: '합계',
    cols: [
      { header: '계약번호', get: c => contractCode(c), style: () => ({ bold: true }) },
      { header: '계약월', align: 'center', get: c => _ym(c.contractDate), style: () => ({ color: XC.ink2 }) },
      { header: '구분', align: 'center', tag: 'cat', get: c => c.category || '' },
      { header: '거래처', get: c => c.client || '', style: () => ({ color: XC.ink2 }) },
      { header: '담당자', align: 'center', get: c => c.manager || '', style: () => ({ color: XC.ink3 }) },
      { header: '프로젝트명', get: c => c.projectName || '', style: () => ({ bold: true }) },
      { header: '도급업체', get: c => c.subcontractor || '', style: () => ({ size: 9, color: XC.ink3 }) },
      money('totalAmount', { header: '계약금', style: () => ({ bold: true }) }),
      money('paidAmount', { header: '수금액', fmt: '#,##0;-#,##0;"—"', style: (c, k, v) => ({ color: v ? XC.pos : XC.ink4 }), sumColor: XC.pos }),
      money('balance', { header: '잔금', fmt: '#,##0;-#,##0;"완결"', style: (c, k, v) => v > 0 ? { bold: true, color: XC.danger } : { color: XC.ink4 }, sumColor: XC.danger }),
      money('profit', { header: '이익금', fmt: '#,##0;[Red]-#,##0;"—"', style: (c, k, v) => v > 0 ? { bold: true, color: XC.pos } : v < 0 ? {} : { color: XC.ink4 }, sumColor: XC.pos }),
      { header: '이익률', align: 'right', numFmt: '0.0%;[Red]-0.0%;"—"', get: c => c.totalAmount ? (Number(c.profit) || 0) / c.totalAmount : 0, style: () => ({ size: 9, color: XC.ink3 }) },
      { header: '진행률', align: 'right', numFmt: '0%', bar: XC.barGreen, get: c => Number(c.progress) || 0, style: () => ({ size: 9, color: XC.ink3 }) },
      { header: '상태', align: 'center', tag: 'status', get: c => c.status || '미진행' },
    ],
    extraTotals: (ws2, T, colL) => {
      const cell = ws2.getCell(T, 12);
      const tot = sum('totalAmount');
      cell.value = { formula: `IF(${colL(7)}${T}=0,0,${colL(10)}${T}/${colL(7)}${T})`, result: tot ? sum('profit') / tot : 0 };
      cell.numFmt = '0.0%';
    },
  });
  const st = _stamp();
  await _saveWorkbook(wb, `계약목록_${manager || '전체'}_${st.ymd}.xlsx`);
}

// ═══════════════════════════════════════════════════════════════
// 미수금 현황
// rows: 화면 정렬 순서(sorted) · summary: { paidRate, rateLabel }
// ═══════════════════════════════════════════════════════════════
async function exportReceivablesXlsx({ rows, conditions, manager, paidRate, rateLabel }) {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook(); wb.creator = XL_COMPANY;
  const ws = wb.addWorksheet('미수금 현황');
  const widths = [6, 12, 12, 46, 30, 8, 16, 16, 17, 12, 9];   // 미수 잔금은 10억대도 들어가게
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const sb = rows.reduce((s, c) => s + (c.balance || 0), 0);
  const n = rows.length;
  _writeHeader(ws, {
    title: '미수금 현황', conditions, lastCol: widths.length,
    kpis: [
      { label: '미수 계약', value: `${n}건`, from: 1, to: 3 },
      { label: '미수 잔금 합계', value: sb, money: true, color: XC.danger, from: 4, to: 4 },
      { label: rateLabel || '수금률', value: paidRate || 0, pct: true, color: XC.green, from: 5, to: 5 },
      { label: '평균 미수액', value: n ? Math.round(sb / n) : 0, money: true, from: 6, to: 7 },
      { label: '1억+ 미수', value: `${rows.filter(c => c.balance >= 1e8).length}건`, color: XC.danger, from: 8, to: 8 },
      { label: '최대 미수', value: n ? Math.max(...rows.map(c => c.balance)) : 0, money: true, color: XC.danger, from: 9, to: 11 },
    ],
  });

  // ── 부문별 미수 잔금 (화면 왼쪽 카드) ──
  const R0 = 6;
  const h = ws.getCell(R0, 1); h.value = '부문별 미수 잔금'; h.font = _font({ size: 11, bold: true });
  const hs = ws.getCell(R0, 4); hs.value = '잔금 많은 부문 순'; hs.font = _font({ size: 8.5, color: XC.ink3 });
  const groups = {};
  rows.forEach(c => { const g = groups[c.category] = groups[c.category] || { n: 0, bal: 0, tot: 0 }; g.n++; g.bal += c.balance; g.tot += c.totalAmount; });
  const gl = Object.entries(groups).sort((a, b) => b[1].bal - a[1].bal);
  const maxb = Math.max(1, ...gl.map(([, g]) => g.bal));
  const subHead = [[1, 2, '구분'], [3, 3, '건수'], [4, 5, '미수 잔금 비중'], [6, 8, '계약금 대비'], [9, 10, '미수 잔금']];
  subHead.forEach(([a, b, t]) => {
    if (b > a) ws.mergeCells(R0 + 1, a, R0 + 1, b);
    const cell = ws.getCell(R0 + 1, a); cell.value = t; cell.font = _font({ size: 8.5, bold: true, color: XC.ink3 });
    cell.alignment = _al(a === 9 ? 'right' : 'left');
  });
  for (let i = 1; i <= 10; i++) ws.getCell(R0 + 1, i).border = { bottom: _thin };
  gl.forEach(([cat, g], k) => {
    const R = R0 + 2 + k;
    ws.mergeCells(R, 1, R, 2); ws.mergeCells(R, 4, R, 5); ws.mergeCells(R, 6, R, 8); ws.mergeCells(R, 9, R, 10);
    const pair = XL_CAT[cat] || XL_CAT['관수'];
    const a = ws.getCell(R, 1); a.value = cat; a.fill = _fill(pair[0]); a.font = _font({ size: 9, bold: true, color: pair[1] }); a.alignment = _al('center');
    const b = ws.getCell(R, 3); b.value = `${g.n}건`; b.font = _font({ size: 9.5, color: XC.ink2 }); b.alignment = _al('left');
    const bar = ws.getCell(R, 4); bar.value = g.bal / maxb; bar.numFmt = ';;;';
    ws.addConditionalFormatting({ ref: `D${R}`, rules: [{ type: 'dataBar', gradient: false, minLength: 0, maxLength: 100,
      cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: _argb(XL_CATBAR[cat] || XC.ink3) } }] });
    const p = ws.getCell(R, 6); p.value = g.tot ? g.bal / g.tot : 0; p.numFmt = '0.0%'; p.font = _font({ size: 9.5, color: XC.ink3 }); p.alignment = _al('left');
    const v = ws.getCell(R, 9); v.value = g.bal; v.numFmt = '#,##0"원"'; v.font = _font({ bold: true }); v.alignment = _al('right');
    for (let i = 1; i <= 10; i++) ws.getCell(R, i).border = { bottom: _thin };
    ws.getRow(R).height = 22;
  });
  if (!gl.length) { const e = ws.getCell(R0 + 2, 1); e.value = '조건에 맞는 미수금이 없습니다.'; e.font = _font({ size: 9.5, color: XC.ink3 }); }

  // ── 미수 목록 ──
  const H = R0 + 2 + Math.max(gl.length, 1) + 1;
  _writeTable(ws, {
    startRow: H, rows, totalLabel: '합계', totalLabelSpan: 3,
    cols: [
      { header: '순위', align: 'center', get: (c, k) => k + 1, style: (c, k) => ({ bold: true, color: k < 3 ? XC.danger : XC.ink3 }) },
      { header: '계약번호', get: c => contractCode(c), style: () => ({ size: 9.5, color: XC.ink3 }) },
      { header: '구분', align: 'center', tag: 'cat', get: c => c.category || '' },
      { header: '프로젝트명', get: c => c.projectName || '', style: () => ({ bold: true }) },
      { header: '거래처', get: c => c.client || '', style: () => ({ size: 9.5, color: XC.ink2 }) },
      { header: '계약월', align: 'center', get: c => _ym(c.contractDate), style: () => ({ size: 9.5, color: XC.ink2 }) },
      { header: '계약금액', align: 'right', numFmt: '#,##0', get: c => c.totalAmount || 0, sum: true },
      { header: '수금액', align: 'right', numFmt: '#,##0;-#,##0;"—"', get: c => c.paidAmount || 0, sum: true, sumColor: XC.pos,
        style: (c, k, v) => ({ color: v ? XC.pos : XC.ink4 }) },
      { header: '미수 잔금', align: 'right', numFmt: '#,##0', get: c => c.balance || 0, sum: true, sumColor: XC.danger,
        style: () => ({ bold: true, color: XC.danger }) },
      { header: '수금률', align: 'right', numFmt: '0%', bar: XC.barBronze, get: c => c.totalAmount ? (c.paidAmount || 0) / c.totalAmount : 0,
        style: () => ({ size: 9, color: XC.ink3 }) },
      { header: '상태', align: 'center', tag: 'status', get: c => c.status || '미진행' },
    ],
    extraTotals: (ws2, T, colL) => {
      const cell = ws2.getCell(T, 10);
      const tot = rows.reduce((s, c) => s + (c.totalAmount || 0), 0), paid = rows.reduce((s, c) => s + (c.paidAmount || 0), 0);
      cell.value = { formula: `IF(${colL(6)}${T}=0,0,${colL(7)}${T}/${colL(6)}${T})`, result: tot ? paid / tot : 0 };
      cell.numFmt = '0%';
    },
  });
  const st = _stamp();
  await _saveWorkbook(wb, `미수금_${manager || '전체'}_${st.ymd}.xlsx`);
}

Object.assign(window, { loadExcelJS, exportContractsXlsx, exportReceivablesXlsx });
