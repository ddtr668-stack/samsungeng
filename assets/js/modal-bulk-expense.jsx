/* ═══════════════════════════════════════════════════════════════
   지출품의서 (여러 프로젝트) — 기성 잔액이 남은 프로젝트를 골라 한 번에 품의
   ① 프로젝트 선택 · 금회 청구액 확인 → ② A4 미리보기·인쇄 (1장 요약 + 프로젝트별 세부 내역)
   → ③ (선택) 기성 완료액에 반영
═══════════════════════════════════════════════════════════════ */

const _bxEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const _bxNum = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const _bxToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// 계약 1건의 최근 지출품의서(정상) 기록에서 세부 내역·업체 정보 꺼내기
function _bxLatestDetail(history) {
  const act = (history || []).filter(h => h.status !== 'cancelled');
  const h = act.length ? act[act.length - 1] : null;
  if (!h) return null;
  const parse = (j) => { try { return JSON.parse(j || '[]') || []; } catch (e) { return []; } };
  return {
    productItems: parse(h.productItems_JSON), installItems: parse(h.installItems_JSON),
    etcItems: parse(h.expenseItems_JSON), commissionItems: parse(h.commissionItems_JSON),
    subBizNo: h.subBizNo, subManager: h.subManager, subManagerTel: h.subManagerTel,
    subBank: h.subBank, subAccount: h.subAccount, subHolder: h.subHolder,
    roundNo: h.roundNo, docDate: h.docDate,
  };
}

// rows: [{ c: 계약, amount: 금회 청구액(설치비), detail: _bxLatestDetail 결과 또는 null }]
function buildBulkExpenseHtml({ rows, docNo, docDate, payDate, author, subcontractors }) {
  const E = _bxEsc, N = _bxNum;
  const D = (iso) => iso ? String(iso).slice(0, 10).replace(/-/g, '.') : '-';
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const dateKor = /^\d{4}-\d{2}-\d{2}$/.test(docDate) ? `${docDate.slice(0,4)}년 ${Number(docDate.slice(5,7))}월 ${Number(docDate.slice(8,10))}일` : docDate;
  const korean = typeof numberToKoreanAmount === 'function' ? numberToKoreanAmount(total) : '';
  const findSub = (name) => (subcontractors || []).find(s => s.name && name && (s.name === name || name.includes(s.name) || s.name.includes(name)));
  const vendorInfo = (r) => {
    const s = findSub(r.c.subcontractor) || {}; const d = r.detail || {};
    return {
      name: r.c.subcontractor || '-', bizNo: d.subBizNo || s.bizNo || '', manager: d.subManager || s.manager || '', tel: d.subManagerTel || s.tel || '',
      bank: d.subBank || s.bank || '', account: d.subAccount || s.account || '', holder: d.subHolder || s.holder || '',
    };
  };
  const acctText = (v) => [v.bank, v.account, v.holder ? `(${v.holder})` : ''].filter(Boolean).join(' ') || '-';
  const pnl = (c) => {
    const sales = c.totalAmount || 0, prod = c.productCost || 0, inst = c.subcontractAmount || 0, etc = c.incidental || 0, com = c.salesCost || 0;
    const profit = sales - prod - inst - etc - com;
    return { sales, prod, inst, etc, com, profit, rate: sales ? profit / sales * 100 : 0 };
  };
  const neg = (v) => v < 0 ? `△${N(-v)}` : N(v);

  // ── 1. 손익계산서 (프로젝트별 1줄) ──
  const P = rows.map(r => ({ r, p: pnl(r.c) }));
  const sum = (k) => P.reduce((s, x) => s + x.p[k], 0);
  const sumSales = sum('sales'), sumProfit = sum('profit');
  const COLS = '<colgroup><col style="width:8mm"><col style="width:44mm"><col style="width:20mm"><col style="width:19mm"><col style="width:19mm"><col style="width:17mm"><col style="width:17mm"><col style="width:20mm"><col style="width:22mm"></colgroup>';
  const pnlRows = P.map(({ r, p }, i) => `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${E(contractCode(r.c))}<br/>${E(r.c.projectName || '')}</td>
      <td class="r">${N(p.sales)}</td><td class="r">${N(p.prod)}</td><td class="r">${N(p.inst)}</td>
      <td class="r">${N(p.etc)}</td><td class="r">${N(p.com)}</td>
      <td class="r">${neg(p.profit)}</td><td class="r">${p.rate.toFixed(1)}%</td></tr>`).join('');

  // ── 2. 금회 지급 내역 (1번 표와 같은 9칸 폭으로 맞춤) ──
  const payRows = rows.map((r, i) => {
    const v = vendorInfo(r);
    const after = Math.max(0, (r.c.subcontractAmount || 0) - (r.c.subcontractPaid || 0) - r.amount);
    return `<tr>
      <td class="c">${i + 1}</td>
      <td class="l">${E(contractCode(r.c))}<br/>${E(v.name)}</td>
      <td class="r">${N(r.c.subcontractAmount)}</td><td class="r">${N(r.c.subcontractPaid)}</td><td class="r"><b>${N(r.amount)}</b></td>
      <td class="r">${N(after)}</td>
      <td class="l" colspan="3">${E(acctText(v))}</td></tr>`;
  }).join('');

  const page1 = `
  <div class="doc-title">지 출 품 의 서</div>
  <table class="subject"><tr><th>품의제목</th><td class="l">설치비(도급비) 기성 지급 · ${rows.length}건</td></tr></table>
  <table class="info" style="margin-top:2mm">
    <colgroup><col style="width:24mm"><col style="width:69mm"><col style="width:24mm"><col style="width:69mm"></colgroup>
    <tr><th>문서번호</th><td class="l">${E(docNo)}</td><th>품의일</th><td class="l">${E(D(docDate))}</td></tr>
    <tr><th>작성자</th><td class="l">${E(author || '-')}</td><th>지급 예정일</th><td class="l">${E(D(payDate))}</td></tr>
  </table>
  <table class="amount"><tr>
    <th>금회 요청금액</th><td class="kor">${total > 0 ? E(korean) : '금액 미입력'}</td>
    <td class="num">(￦${N(total)})<span class="vat">부가세포함</span></td></tr></table>

  <div class="sec">
    <h2><span class="num">1.</span>손익계산서<small>프로젝트별 1줄 · 총계약금액 - 제품대 - 설치비 - 기타비용 - 영업수수료 (상세는 첨부 세부 내역)</small></h2>
    <table class="bx">${COLS}
      <thead><tr><th>No</th><th>계약번호 / 현장</th><th>총계약금</th><th>제품대</th><th>설치비</th><th>기타비용</th><th>영업수수료</th><th>손익</th><th>수익률</th></tr></thead>
      <tbody>${pnlRows}
        <tr class="total"><td class="c" colspan="2">합 계</td><td class="r">${N(sumSales)}</td><td class="r">${N(sum('prod'))}</td><td class="r">${N(sum('inst'))}</td><td class="r">${N(sum('etc'))}</td><td class="r">${N(sum('com'))}</td><td class="r">${neg(sumProfit)}</td><td class="r">${(sumSales ? sumProfit / sumSales * 100 : 0).toFixed(1)}%</td></tr>
      </tbody>
    </table>
  </div>

  <div class="sec">
    <h2><span class="num">2.</span>금회 지급 내역<small>설치비(도급비) 기성 · 입금 계좌는 도급업체 관리 / 최근 지출품의서 기준</small></h2>
    <table class="bx">${COLS}
      <thead><tr><th>No</th><th>계약번호 / 도급업체</th><th>도급금액</th><th>기지급</th><th>금회 지급</th><th>잔액</th><th colspan="3">입금 계좌</th></tr></thead>
      <tbody>${payRows}
        <tr class="total"><td class="c" colspan="2">합 계</td><td class="r">${N(rows.reduce((s, r) => s + (r.c.subcontractAmount || 0), 0))}</td><td class="r">${N(rows.reduce((s, r) => s + (r.c.subcontractPaid || 0), 0))}</td><td class="r">${N(total)}</td><td class="r">${N(rows.reduce((s, r) => s + Math.max(0, (r.c.subcontractAmount || 0) - (r.c.subcontractPaid || 0) - r.amount), 0))}</td><td colspan="3"></td></tr>
      </tbody>
    </table>
  </div>

  <div class="closing">
    <div class="line">위와 같이 지출을 품의합니다.</div>
    <div class="date">${E(dateKor)}</div>
    <div class="co">주식회사 삼성이엔지</div>
    <div class="who">작성자 : ${E(author || '')} &nbsp;&nbsp;&nbsp; (인)</div>
  </div>`;

  // ── 첨부: 프로젝트별 세부 내역 (제품대 · 설치비 · 기타비용 · 영업수수료) ──
  const itemTable = (kind, items, fallbackTotal) => {
    const list = (items || []).filter(x => x && x.name);
    let head, body, sumAmt;
    if (kind === 'product' || kind === 'install') {
      sumAmt = list.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.unitPrice) || 0), 0);
      head = kind === 'product'
        ? '<tr><th>No</th><th>품명</th><th>모델</th><th>단위</th><th>수량</th><th>단가(원)</th><th>금액(원)</th></tr>'
        : '<tr><th>No</th><th>품목/작업내용</th><th>규격</th><th>단위</th><th>수량</th><th>단가(원)</th><th>금액(원)</th></tr>';
      body = list.map((x, i) => `<tr><td class="c">${i + 1}</td><td class="l">${E(x.name)}</td><td class="l">${E(kind === 'product' ? x.model : x.spec)}</td><td class="c">${E(x.unit)}</td><td class="r">${N(x.qty)}</td><td class="r">${N(x.unitPrice)}</td><td class="r">${N((Number(x.qty) || 0) * (Number(x.unitPrice) || 0))}</td></tr>`).join('');
    } else {
      sumAmt = list.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      head = '<tr><th>No</th><th>항목</th><th colspan="2">비고</th><th>단위</th><th>수량</th><th>금액(원)</th></tr>';
      body = list.map((x, i) => `<tr><td class="c">${i + 1}</td><td class="l">${E(x.name)}</td><td class="l" colspan="2">${E(x.note || '')}</td><td class="c">${E(x.unit || '')}</td><td class="r">${x.qty ? N(x.qty) : ''}</td><td class="r">${N(x.amount)}</td></tr>`).join('');
    }
    const cols = '<colgroup><col style="width:9mm"><col style="width:52mm"><col style="width:36mm"><col style="width:14mm"><col style="width:17mm"><col style="width:27mm"><col style="width:31mm"></colgroup>';
    return `<table class="bx" style="margin-top:1.5mm">${cols}<thead>${head}</thead><tbody>
      ${list.length ? body : `<tr><td class="c" colspan="7">세부 내역 미입력 · 계약관리 금액 ${N(fallbackTotal)}원</td></tr>`}
      <tr class="total"><td class="c" colspan="6">합 계</td><td class="r">${N(list.length ? sumAmt : fallbackTotal)}</td></tr>
    </tbody></table>`;
  };
  const detailPages = rows.map((r, idx) => {
    const c = r.c, d = r.detail || {}, p = pnl(c), v = vendorInfo(r);
    const vendorTbl = `<table class="info" style="margin-bottom:1.5mm">
      <colgroup><col style="width:24mm"><col style="width:69mm"><col style="width:24mm"><col style="width:69mm"></colgroup>
      <tr><th>도급업체</th><td class="l">${E(v.name)}</td><th>사업자번호</th><td class="l">${E(v.bizNo || '-')}</td></tr>
      <tr><th>담당자</th><td class="l">${E(v.manager || '-')}${v.tel ? ' (' + E(v.tel) + ')' : ''}</td><th>입금 계좌</th><td class="l">${E(acctText(v))}</td></tr>
    </table>`;
    return `<div class="detail-page">
      <div class="detail-title">
        <div class="t">세 부 내 역 (${idx + 1}/${rows.length})</div>
        <div class="s">${E(contractCode(c))} · 『${E(c.projectName || '')}』 · ${E(c.client || '')} · 계약일 ${E(D(c.contractDate))}${d.roundNo ? ` · 최근 지출품의서 ${d.roundNo}차(${E(D(d.docDate))}) 기준` : ' · 저장된 지출품의서 없음'}</div>
      </div>
      <div class="sec" style="margin-top:0">
        <h2>※ 손익 (총계약금액-제품대-설치비-기타비용-영업수수료)</h2>
        <table class="pnl bx"><colgroup><col style="width:44mm"><col style="width:42mm"><col></colgroup>
          <thead><tr><th>구분</th><th>금액(원)</th><th>비고</th></tr></thead>
          <tbody>
            <tr><th>총 계약금액</th><td class="r">${N(p.sales)}</td><td class="l">VAT 포함</td></tr>
            <tr><th>(-) 제품대</th><td class="r">${N(p.prod)}</td><td class="l"></td></tr>
            <tr><th>(-) 설치비</th><td class="r">${N(p.inst)}</td><td class="l">금회 지급 ${N(r.amount)}원 · 기지급 ${N(c.subcontractPaid)}원</td></tr>
            <tr><th>(-) 기타비용</th><td class="r">${N(p.etc)}</td><td class="l"></td></tr>
            <tr><th>(-) 영업수수료</th><td class="r">${N(p.com)}</td><td class="l"></td></tr>
            <tr class="total pnl-sum"><th>손익</th><td class="r">${neg(p.profit)}</td><td class="l">수익률 ${p.rate.toFixed(1)}%</td></tr>
          </tbody></table>
      </div>
      <div class="sec sec-div"><h2><span class="num">1.</span>제품대<small>총액 ${N(p.prod)}원</small></h2>${itemTable('product', d.productItems, p.prod)}</div>
      <div class="sec sec-div"><h2><span class="num">2.</span>설치비<small>도급금액 ${N(p.inst)}원 · 금회 지급 ${N(r.amount)}원</small></h2>${vendorTbl}${itemTable('install', d.installItems, p.inst)}</div>
      <div class="sec sec-div"><h2><span class="num">3.</span>기타비용<small>총액 ${N(p.etc)}원</small></h2>${itemTable('etc', d.etcItems, p.etc)}</div>
      <div class="sec sec-div"><h2><span class="num">4.</span>영업수수료<small>총액 ${N(p.com)}원</small></h2>${itemTable('com', d.commissionItems, p.com)}</div>
    </div>`;
  }).join('');

  const css = (window.EXPENSE_PRINT_CSS || '') + `
  /* 1번 표부터 아래 모든 표: 같은 폭·같은 글자 크기·같은 칸 여백 */
  table.bx { table-layout: fixed; width: 100%; }
  table.bx th, table.bx td { font-size: 8.5pt; padding: 1.1mm 1.6mm; }
  table.bx td.r { white-space: nowrap; }
  `;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>지출품의서_${E(docNo)}</title>
<style>${css}</style></head><body>${page1}${detailPages}</body></html>`;
}

const BulkExpenseModal = ({ open, onClose, data, onSaved }) => {
  const toast = window.useToast ? window.useToast() : null;
  const [filter, setFilter] = useState('미기성');   // 미기성 | 진행중 | 전체
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState({});        // { key: 금액(문자열) }
  const [payDate, setPayDate] = useState(_bxToday());
  const [previewHtml, setPreviewHtml] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [docNo, setDocNo] = useState('');

  useEffect(() => {
    if (!open) return;
    setFilter('미기성'); setSearch(''); setPicked({}); setPayDate(_bxToday());
    setPreviewHtml(null); setApplied(false);
    const d = new Date();
    setDocNo(`지출-${_bxToday().replace(/-/g, '')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}`);
  }, [open]);

  const keyOf = (c) => String(c.id ?? c.no);
  // 기성 잔액이 남은 도급 계약
  const pool = useMemo(() => (data?.contracts || [])
    .filter(c => c.subcontractor && (c.subcontractAmount || 0) > 0 && (c.subcontractAmount || 0) - (c.subcontractPaid || 0) > 0)
    .sort((a, b) => (b.no || 0) - (a.no || 0)), [data]);
  const counts = {
    미기성: pool.filter(c => !(c.subcontractPaid > 0)).length,
    진행중: pool.filter(c => c.subcontractPaid > 0).length,
    전체: pool.length,
  };
  const list = pool.filter(c => {
    if (filter === '미기성' && c.subcontractPaid > 0) return false;
    if (filter === '진행중' && !(c.subcontractPaid > 0)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${contractCode(c)} ${c.projectName} ${c.client} ${c.subcontractor}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const remainOf = (c) => Math.max(0, (c.subcontractAmount || 0) - (c.subcontractPaid || 0));
  const toggle = (c) => setPicked(p => {
    const n = { ...p }; const k = keyOf(c);
    if (k in n) delete n[k]; else n[k] = String(remainOf(c));
    return n;
  });
  const allOn = list.length > 0 && list.every(c => keyOf(c) in picked);
  const toggleAll = () => setPicked(p => {
    const n = { ...p };
    if (allOn) list.forEach(c => delete n[keyOf(c)]);
    else list.forEach(c => { if (!(keyOf(c) in n)) n[keyOf(c)] = String(remainOf(c)); });
    return n;
  });

  const rows = pool.filter(c => keyOf(c) in picked)
    .map(c => ({ c, amount: Math.min(remainOf(c), Number(String(picked[keyOf(c)]).replace(/[^0-9]/g, '')) || 0) }));
  const validRows = rows.filter(r => r.amount > 0);
  const total = validRows.reduce((s, r) => s + r.amount, 0);

  const [building, setBuilding] = useState(false);
  const openPreview = async () => {
    if (!validRows.length) { toast?.('프로젝트를 선택하고 금회 청구액을 확인하세요', 'error'); return; }
    setBuilding(true);
    try {
      // 프로젝트마다 최근 지출품의서의 세부 내역(제품·설치·기타·수수료)을 불러와 첨부
      const withDetail = await Promise.all(validRows.map(async r => {
        try { const h = await apiClient.expenseByContract(r.c.no); return { ...r, detail: _bxLatestDetail(h.history) }; }
        catch (e) { return { ...r, detail: null }; }
      }));
      setPreviewHtml(buildBulkExpenseHtml({
        rows: withDetail, docNo, docDate: _bxToday(), payDate,
        author: (getAuthUser() || {}).name || '', subcontractors: data?.subcontractors || [],
      }));
    } finally {
      setBuilding(false);
    }
  };
  const doPrint = async () => {
    setPrinting(true);
    try { await printExpenseHtml(previewHtml); } catch (e) { toast?.('인쇄 실패: ' + e.message, 'error'); }
    finally { setPrinting(false); }
  };

  // 각 계약의 기성 완료액(도급 지급액)에 금회 청구액을 더함
  const applyToContracts = async () => {
    if (!validRows.length || applying || applied) return;
    if (!window.confirm(`선택한 ${validRows.length}건의 기성 완료액에 금회 청구액(합계 ${_bxNum(total)}원)을 더할까요?\n지출·기성 관리의 잔액과 상태가 바뀝니다.`)) return;
    setApplying(true);
    const failed = [];
    for (const r of validRows) {
      try { await apiClient.updateContract(r.c.no, { subcontractPaid: (r.c.subcontractPaid || 0) + r.amount }); }
      catch (e) { failed.push(`${contractCode(r.c)}: ${e.message}`); }
    }
    setApplying(false);
    if (failed.length) {
      toast?.(`${validRows.length - failed.length}건 반영 · ${failed.length}건 실패\n${failed.join('\n')}`, 'error');
    } else {
      setApplied(true);
      toast?.(`${validRows.length}건 기성 완료액 반영 완료`, 'success');
    }
    await onSaved?.();
    if (!failed.length) onClose?.();
  };

  const editable = typeof canEdit !== 'function' || canEdit();
  const th = { padding:'8px 10px', fontSize:11.5, fontWeight:700, color:'var(--ink-3)', textAlign:'left', background:'var(--surface-2, #F7F6F1)', position:'sticky', top:0, zIndex:1 };
  const td = { padding:'9px 10px', borderTop:'1px solid var(--line)', fontSize:12.5, verticalAlign:'middle' };
  const num = { textAlign:'right', fontVariantNumeric:'tabular-nums' };

  return (
    <>
      <Modal open={open} onClose={onClose} width="wide"
        title="지출품의서 작성"
        subtitle="기성 잔액이 남은 프로젝트만 표시 · 여러 건 선택 → 요약 1장 + 프로젝트별 세부 내역으로 출력"
        footer={
          <div style={{display:'flex',alignItems:'center',gap:10,width:'100%',flexWrap:'wrap'}}>
            <div style={{fontSize:13}}>
              선택 <b>{validRows.length}건</b> · 금회 청구 합계 <b style={{fontSize:17,color:'var(--green-800)'}}>{_bxNum(total)}원</b>
            </div>
            <label style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink-3)',marginLeft:8}}>
              지급 예정일
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                style={{padding:'5px 7px',border:'1px solid var(--line)',borderRadius:6,fontSize:12.5}}/>
            </label>
            <span style={{flex:1}}/>
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            {editable && (
              <button type="button" className="btn-ghost" onClick={applyToContracts} disabled={!validRows.length || applying || applied}
                title="출력한 뒤 누르면 각 계약의 기성 완료액에 금회 청구액을 더합니다">
                {applying ? '반영 중…' : applied ? '반영 완료' : '기성 완료액에 반영'}
              </button>
            )}
            <button type="button" className="btn-primary" onClick={openPreview} disabled={!validRows.length || building}>{building ? '세부 내역 불러오는 중…' : '미리보기 · 출력 →'}</button>
          </div>
        }>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:10}}>
          {['미기성','진행중','전체'].map(f => (
            <button key={f} type="button" className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === '전체' ? '전체 잔액' : f} <span className="n">{counts[f]}</span>
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="현장·거래처·도급업체 검색"
            style={{marginLeft:8,height:30,padding:'0 10px',border:'1px solid var(--line)',borderRadius:8,fontSize:12.5,minWidth:200}}/>
          <span style={{marginLeft:'auto',fontSize:12,color:'var(--ink-3)'}}>
            {rows.length}건 선택됨 · <a href="#" onClick={e => { e.preventDefault(); toggleAll(); }} style={{color:'inherit'}}>{allOn ? '선택 해제' : '전체 선택'}</a>
          </span>
        </div>
        <div style={{maxHeight:'52vh',overflow:'auto',border:'1px solid var(--line)',borderRadius:10}}>
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:680}}>
            <thead><tr>
              <th style={{...th,width:36}}></th>
              <th style={th}>계약번호 · 현장</th>
              <th style={th}>도급업체</th>
              <th style={{...th,...num}}>도급금액</th>
              <th style={{...th,...num}}>기성 잔액</th>
              <th style={{...th,...num}}>금회 청구액</th>
            </tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan="6" style={{...td,textAlign:'center',color:'var(--ink-4)',padding:30}}>해당하는 프로젝트가 없습니다.</td></tr>}
              {list.map(c => {
                const k = keyOf(c); const on = k in picked;
                return (
                  <tr key={k} style={on ? {background:'var(--pos-soft, #F4F8F4)'} : undefined}>
                    <td style={{...td,textAlign:'center'}}><input type="checkbox" checked={on} onChange={() => toggle(c)} aria-label={`${contractCode(c)} 선택`} style={{width:16,height:16,cursor:'pointer'}}/></td>
                    <td style={{...td,cursor:'pointer'}} onClick={() => toggle(c)}>
                      <div style={{fontWeight:700}}>{contractCode(c)} {c.projectName}</div>
                      <div style={{fontSize:11,color:'var(--ink-4)'}}>{c.client}{c.subcontractPaid > 0 ? ` · 기지급 ${_bxNum(c.subcontractPaid)}` : ''}</div>
                    </td>
                    <td style={td}>{c.subcontractor}</td>
                    <td style={{...td,...num}}>{_bxNum(c.subcontractAmount)}</td>
                    <td style={{...td,...num}}>{_bxNum(remainOf(c))}</td>
                    <td style={{...td,...num}}>
                      {on ? (
                        <input value={picked[k] === '' ? '' : Number(String(picked[k]).replace(/[^0-9]/g,'') || 0).toLocaleString('ko-KR')}
                          onChange={e => {
                            // 기성 잔액보다 크게 입력하면 잔액으로 맞춤
                            const v = e.target.value.replace(/[^0-9]/g, '');
                            const capped = v === '' ? '' : String(Math.min(remainOf(c), Number(v)));
                            if (v !== '' && Number(v) > remainOf(c)) toast?.(`기성 잔액(${_bxNum(remainOf(c))}원)까지만 청구할 수 있습니다`, 'default');
                            setPicked(p => ({ ...p, [k]: capped }));
                          }}
                          inputMode="numeric" aria-label={`${contractCode(c)} 금회 청구액`}
                          style={{width:120,padding:'5px 8px',border:'1px solid var(--green-600)',borderRadius:6,textAlign:'right',fontWeight:700,fontSize:12.5}}/>
                      ) : <span style={{color:'var(--ink-4)'}}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{fontSize:11.5,color:'var(--ink-4)',marginTop:8,lineHeight:1.6}}>
          금회 청구액의 기본값은 기성 잔액입니다. 일부만 청구하면 숫자를 고치세요 (잔액보다 크면 잔액으로 맞춥니다).
          출력 후 <b>기성 완료액에 반영</b>을 누르면 각 계약의 기성 완료액이 늘어납니다.
        </div>
      </Modal>
      {previewHtml && (
        <ExpensePrintPreview html={previewHtml} onPrint={doPrint} onClose={() => setPreviewHtml(null)} printing={printing}/>
      )}
    </>
  );
};

Object.assign(window, { BulkExpenseModal, buildBulkExpenseHtml });
