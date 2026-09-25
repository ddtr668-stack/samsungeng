/* ═══════════════════════════════════════════════════════════════
   다량 지출품의서 — 기성 잔액이 남은 프로젝트 여러 건을 골라 한 장으로 출력
   ① 프로젝트 선택 · 금회 청구액 확인 → ② A4 미리보기·인쇄 → ③ (선택) 기성 완료액에 반영
═══════════════════════════════════════════════════════════════ */

const _bxEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const _bxNum = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const _bxToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

function buildBulkExpenseHtml({ rows, docNo, docDate, payDate, author, subcontractors }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const sumSub = rows.reduce((s, r) => s + (r.c.subcontractAmount || 0), 0);
  const sumPaid = rows.reduce((s, r) => s + (r.c.subcontractPaid || 0), 0);
  const sumAfter = rows.reduce((s, r) => s + Math.max(0, (r.c.subcontractAmount || 0) - (r.c.subcontractPaid || 0) - r.amount), 0);

  // 업체별 요약 (같은 업체는 한 줄로)
  const byVendor = {};
  rows.forEach(r => {
    const k = r.c.subcontractor || '(미지정)';
    byVendor[k] = byVendor[k] || { name: k, count: 0, amount: 0 };
    byVendor[k].count++; byVendor[k].amount += r.amount;
  });
  const findSub = (name) => (subcontractors || []).find(s => s.name && (s.name === name || name.includes(s.name) || s.name.includes(name)));
  const account = (name) => {
    const s = findSub(name);
    if (!s || (!s.bank && !s.account)) return '';
    return [s.bank, s.account, s.holder ? `(${s.holder})` : ''].filter(Boolean).join(' ');
  };
  const fmtD = (iso) => iso ? iso.replace(/-/g, '.') : '';

  const itemRows = rows.map((r, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${_bxEsc(contractCode(r.c))}<br/><span class="pj">${_bxEsc(r.c.projectName)}</span></td>
      <td>${_bxEsc(r.c.subcontractor || '')}</td>
      <td class="r">${_bxNum(r.c.subcontractAmount)}</td>
      <td class="r">${_bxNum(r.c.subcontractPaid)}</td>
      <td class="r"><b>${_bxNum(r.amount)}</b></td>
      <td class="r">${_bxNum(Math.max(0, (r.c.subcontractAmount || 0) - (r.c.subcontractPaid || 0) - r.amount))}</td>
    </tr>`).join('');
  const vendorRows = Object.values(byVendor).map(v => `
    <tr><td>${_bxEsc(v.name)}</td><td class="c">${v.count}</td><td class="r">${_bxNum(v.amount)}</td><td>${_bxEsc(account(v.name))}</td></tr>`).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>다량지출품의서_${_bxEsc(docNo)}</title>
<style>
@page { size: A4 portrait; margin: 14mm 12mm; }
* { box-sizing: border-box; }
@media screen { body { padding: 14mm 12mm; } }
body { margin: 0; font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic', sans-serif; color: #000; font-size: 9.5pt; }
.page { width: 100%; }
h1 { text-align: center; font-size: 20pt; font-weight: 900; letter-spacing: .4em; margin: 0; }
.sub { text-align: center; font-size: 8.5pt; color: #555; margin: 4pt 0 10pt; }
.meta { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8pt; }
.meta table { border-collapse: collapse; font-size: 8.5pt; }
.meta td { border: .8pt solid #999; padding: 3pt 7pt; } .meta td.k { background: #f3f3f3; font-weight: 700; }
.appr { display: grid; grid-template-columns: 18pt repeat(3, 52pt); border: 1pt solid #000; font-size: 8.5pt; }
.appr > div { border-right: 1pt solid #000; text-align: center; } .appr > div:last-child { border-right: 0; }
.appr .lc { background: #f3f3f3; font-weight: 700; display: flex; align-items: center; justify-content: center; line-height: 1.3; }
.appr .rl { background: #f3f3f3; border-bottom: 1pt solid #000; font-weight: 700; padding: 2pt 0; }
.appr .sg { height: 32pt; }
.st { font-weight: 800; border-bottom: 1.2pt solid #000; padding-bottom: 2pt; margin: 10pt 0 5pt; font-size: 10pt; }
table.it { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
table.it th, table.it td { border: .8pt solid #999; padding: 3.5pt 4pt; vertical-align: middle; }
table.it th { background: #efefef; font-weight: 700; }
table.it .r { text-align: right; font-variant-numeric: tabular-nums; } table.it .c { text-align: center; }
table.it .pj { font-size: 8pt; color: #333; }
table.it tr { page-break-inside: avoid; }
table.it tr.tot td { background: #f5f5f5; font-weight: 800; border-top: 1.3pt solid #000; }
.gt { display: flex; justify-content: space-between; align-items: center; border: 1.4pt solid #000; padding: 7pt 10pt; margin-top: 10pt; background: #fffbe6; }
.gt .v { font-size: 14pt; font-weight: 900; }
.foot { margin-top: 10pt; font-size: 8pt; color: #555; line-height: 1.6; }
.co { text-align: right; margin-top: 12pt; font-weight: 800; font-size: 10.5pt; }
</style></head><body><div class="page">
  <h1>다량 지출품의서</h1>
  <div class="sub">주식회사 삼성이엔지 · ${_bxEsc(fmtD(docDate))} 작성${author ? ' · 작성자 ' + _bxEsc(author) : ''}</div>
  <div class="meta">
    <table>
      <tr><td class="k">문서번호</td><td>${_bxEsc(docNo)}</td></tr>
      <tr><td class="k">지급 예정일</td><td>${_bxEsc(fmtD(payDate))}</td></tr>
      <tr><td class="k">건수</td><td>${rows.length}건</td></tr>
    </table>
    <div class="appr"><div class="lc">결<br/>재</div>
      <div><div class="rl">담당</div><div class="sg"></div></div>
      <div><div class="rl">팀장</div><div class="sg"></div></div>
      <div><div class="rl">대표</div><div class="sg"></div></div>
    </div>
  </div>
  <div class="st">1. 지급 내역 (설치비 · 도급비 기성)</div>
  <table class="it">
    <thead><tr><th class="c" style="width:22pt">No</th><th>계약번호 / 현장</th><th>도급업체</th><th class="r">도급금액</th><th class="r">기지급</th><th class="r">금회 청구</th><th class="r">청구 후 잔액</th></tr></thead>
    <tbody>${itemRows}
      <tr class="tot"><td class="c" colspan="3">합 계</td><td class="r">${_bxNum(sumSub)}</td><td class="r">${_bxNum(sumPaid)}</td><td class="r">${_bxNum(total)}</td><td class="r">${_bxNum(sumAfter)}</td></tr>
    </tbody>
  </table>
  <div class="st">2. 업체별 지급 요약</div>
  <table class="it">
    <thead><tr><th>도급업체</th><th class="c" style="width:34pt">건수</th><th class="r">지급액</th><th>입금 계좌</th></tr></thead>
    <tbody>${vendorRows}</tbody>
  </table>
  <div class="gt"><span style="font-weight:800">금회 지급 총액</span><span class="v">₩ ${_bxNum(total)}</span></div>
  <div class="foot">위와 같이 설치비(도급비) 기성 지급을 품의하오니 재가하여 주시기 바랍니다.<br/>※ 금액은 부가세 별도 · 계약번호는 담당자별 번호</div>
  <div class="co">주식회사 삼성이엔지</div>
</div></body></html>`;
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

  const makeHtml = () => buildBulkExpenseHtml({
    rows: validRows, docNo, docDate: _bxToday(), payDate,
    author: (getAuthUser() || {}).name || '', subcontractors: data?.subcontractors || [],
  });
  const openPreview = () => {
    if (!validRows.length) { toast?.('프로젝트를 선택하고 금회 청구액을 확인하세요', 'error'); return; }
    setPreviewHtml(makeHtml());
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
        title="다량 지출품의서 작성"
        subtitle="기성 잔액이 남은 프로젝트만 표시 · 여러 건 선택 → 한 장으로 출력"
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
            <button type="button" className="btn-primary" onClick={openPreview} disabled={!validRows.length}>미리보기 · 출력 →</button>
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
