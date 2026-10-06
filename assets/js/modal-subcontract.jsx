/* ═══════════════════════════════════════════════════════════════
   설치도급계약서 작성 창 — v3.20
   - 계약 상세 [도급계약서] 버튼으로 열림
   - 자동 채움: 공사명(계약) · 공사주소/설치품목/공사기간/담당자(현장설치정보) ·
                하도급인(도급업체 목록) · 세부내역(저장된 설치 내역서) · 계약금액(도급금액)
   - 계약마다 바뀌는 조건(결제 비율·지급 시기·특기사항 등)은 [저장] 하면
     계약내역서 시트(구분 subcontract)에 보관 → 다시 열면 그대로
   - 출력·미리보기·PDF 는 지출품의서와 같은 방식 (A4 세로, PDF 는 Apps Script 변환)
═══════════════════════════════════════════════════════════════ */

const SUBC_CONTRACTOR_KEY = 'hb.subcontractContractor';
// 도급인(우리 회사) 기본값 — 회사 설치도급계약서 원본 기준, 창에서 고치면 이 브라우저에 기억
const SUBC_CONTRACTOR_DEFAULT = { address: '충남 아산시 외암로 1301', name: '주식회사 삼성이엔지', bizNo: '312-86-40516', ceo: '윤정희', tel: '' };
const _loadContractor = () => {
  try { return { ...SUBC_CONTRACTOR_DEFAULT, ...(JSON.parse(localStorage.getItem(SUBC_CONTRACTOR_KEY)) || {}) }; }
  catch { return { ...SUBC_CONTRACTOR_DEFAULT }; }
};

// 라벨+입력칸 묶음 — 컴포넌트를 바깥에 두어야 입력 중 포커스가 풀리지 않음
const SubcField = ({ id, label, children, span }) => (
  <div style={{display:'flex', flexDirection:'column', gap:4, gridColumn: span ? `span ${span}` : undefined, minWidth:0}}>
    <label htmlFor={id} style={{fontSize:12, color:'var(--ink-3)'}}>{label}</label>
    {children}
  </div>
);

const SubcontractModal = ({ open, onClose, contract, data }) => {
  const toast = window.useToast ? window.useToast() : null;
  const D = window.SUBCONTRACT_DEFAULTS;
  const today = new Date().toISOString().slice(0, 10);
  const errMsg = (e) => (e?.message || String(e || '알 수 없는 오류'));

  const initial = () => {
    const site = window.parseSiteInfoFull ? window.parseSiteInfoFull(contract?.siteInfo || contract?.note || '') : {};
    const m = window.matchSubcontractor ? window.matchSubcontractor(data, contract?.subcontractor) : null;
    return {
      contractDate: today,
      siteName: contract?.projectName || '',
      siteAddress: site.address || '',
      manager: site.manager || '',
      item: site.product || '',
      qtyText: D.qtyText,
      startDate: site.startDate || '',
      endDate: site.endDate || '',
      amount: contract?.subcontractAmount ? String(Math.round(contract.subcontractAmount)) : '',
      vatMode: D.vatMode,
      rows: [],
      includedText: '',
      suppliedText: '',
      pays: D.pays.map(p => ({ ...p })),
      payMethod: D.payMethod,
      reportItems: D.reportItems,
      warrantyYears: D.warrantyYears,
      // 하자보증이행각서
      warrantyRate: 10,
      warrantyMethod: '이행각서',
      pledgeDate: '',
      specials: D.specials,
      contractor: _loadContractor(),
      sub: m ? { address: m.address || '', name: m.name || '', bizNo: m.bizNo || '', ceo: m.ceo || '', tel: m.tel || '' }
             : { address: '', name: String(contract?.subcontractor || '').trim(), bizNo: '', ceo: '', tel: '' },
    };
  };

  const [f, setF] = useState(initial);
  const [installRows, setInstallRows] = useState([]);   // 저장된 설치 내역서
  const [savedAt, setSavedAt] = useState('');
  const [doc, setDoc] = useState('contract');   // 'contract' 설치도급계약서 | 'warranty' 하자보증이행각서
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [printHtml, setPrintHtml] = useState('');
  const [printing, setPrinting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const set = (k) => (v) => setF(x => ({ ...x, [k]: v }));
  const setIn = (grp, k) => (v) => setF(x => ({ ...x, [grp]: { ...x[grp], [k]: v } }));

  // 저장된 도급계약 조건 + 설치 내역서 불러오기
  useEffect(() => {
    if (!open || !contract?.no) return;
    setF(initial());
    setSavedAt('');
    if (typeof hasApiUrl !== 'function' || !hasApiUrl() || !apiClient.getContractItems) return;
    let alive = true;
    setLoading(true);
    apiClient.getContractItems(contract.no).then(r => {
      if (!alive) return;
      const items = r.items || {};
      const inst = items.install;
      const instRows = (Array.isArray(inst) ? inst : (inst && inst.items) || [])
        .filter(x => x && (x.name || Number(x.qty) || Number(x.unitPrice)))
        .map(x => ({ name: x.name || '', spec: x.spec || '', qty: x.qty ?? '', unit: x.unit || '', unitPrice: x.unitPrice ?? '' }));
      setInstallRows(instRows);
      const saved = items.subcontract && !Array.isArray(items.subcontract) ? items.subcontract : null;
      if (saved && saved.terms) {
        setF(x => ({ ...x, ...saved.terms, contractor: { ...x.contractor, ...(saved.terms.contractor || {}) }, sub: { ...x.sub, ...(saved.terms.sub || {}) } }));
        setSavedAt((r.savedAt || {}).subcontract || '');
      } else if (instRows.length) {
        setF(x => ({ ...x, rows: instRows }));
      }
    }).catch(e => console.warn('[subcontract items]', e)).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, contract?.no]);

  useEffect(() => {
    if (previewMode) document.body.classList.add('expense-preview-mode');
    else document.body.classList.remove('expense-preview-mode');
    return () => document.body.classList.remove('expense-preview-mode');
  }, [previewMode]);

  if (!contract) return null;

  // ─── 계산 · 확인 ───
  const won = (v) => Math.round(Number(v) || 0).toLocaleString('ko-KR');
  const amount = Math.round(Number(String(f.amount).replace(/[^0-9.-]/g, '')) || 0);
  const rowAmt = (r) => Math.round((Number(r.qty) || 0) * (Number(r.unitPrice) || 0));
  const rowsTotal = (f.rows || []).reduce((s, r) => s + rowAmt(r), 0);
  const pctSum = (f.pays || []).reduce((s, p) => s + (Number(p.pct) || 0), 0);
  const payAmts = window.splitPayments(amount, f.pays);
  const subAmt = Math.round(Number(contract.subcontractAmount) || 0);
  const wc = window.warrantyCalc({ ...f, amount });
  const alerts = [];
  if (doc === 'warranty') {
    if (!amount) alerts.push('계약금액이 비어 있습니다 (계약서 탭에서 입력).');
    if (!f.endDate) alerts.push('준공일이 비어 있어 하자보증 시작일·마감일을 계산할 수 없습니다.');
    if (!(Number(f.warrantyYears) > 0)) alerts.push('하자보수기간(년)이 비어 있습니다 (계약서 탭 14조).');
    if (!String(f.sub.name || '').trim()) alerts.push('하도급인 상호가 비어 있습니다.');
    else if (!String(f.sub.bizNo || '').trim()) alerts.push('하도급인 사업자번호가 비어 있습니다.');
    if (!String(f.sub.address || '').trim()) alerts.push('하도급인 주소가 비어 있습니다.');
  } else {
  if (!amount) alerts.push('계약금액이 비어 있습니다.');
  if (pctSum !== 100) alerts.push(`결제 비율 합계가 ${pctSum}% 입니다 (100% 가 되어야 합니다).`);
  if (rowsTotal > 0 && amount && rowsTotal !== amount) alerts.push(`세부내역 합계 ${won(rowsTotal)}원과 계약금액 ${won(amount)}원이 다릅니다.`);
  if (!String(f.sub.name || '').trim()) alerts.push('하도급인 상호가 비어 있습니다.');
  else if (!String(f.sub.bizNo || '').trim()) alerts.push('하도급인 사업자번호가 비어 있습니다 (도급업체 관리에 등록하면 자동으로 채워집니다).');
  if (!f.startDate || !f.endDate) alerts.push('공사기간(착공일·준공일)이 비어 있습니다.');
  }

  const buildHtml = () => (doc === 'warranty' ? window.buildWarrantyHtml : window.buildSubcontractHtml)({ ...f, amount });
  const fileBase = () => {
    const safe = (v) => String(v || '').replace(/[\\/:*?"<>|]/g, '_').trim();
    return `${doc === 'warranty' ? '하자보증이행각서' : '설치도급계약서'}_${safe(f.siteName) || contract.no}_${safe(f.sub.name) || '하도급인'}`;
  };

  // ─── 저장 · 출력 ───
  const handleSave = async () => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setSaving(true);
    try {
      try { localStorage.setItem(SUBC_CONTRACTOR_KEY, JSON.stringify(f.contractor)); } catch {}
      const r = await apiClient.saveContractItems(contract.no, 'subcontract', { terms: { ...f, amount: String(amount) } });
      setSavedAt(r.savedAt || '');
      toast?.('도급계약서·하자보증각서 조건을 저장했습니다 — 다음에 열면 그대로 불러옵니다', 'success');
    } catch (e) {
      const msg = errMsg(e);
      if (/알 수 없는 내역 구분|BAD_PARAM/.test(msg)) toast?.('⚠️ Apps Script 재배포가 필요합니다 (도급계약서 저장 기능 없음). 출력·PDF 는 그대로 쓸 수 있습니다.', 'error');
      else toast?.('저장 실패: ' + msg, 'error');
    } finally { setSaving(false); }
  };
  const handlePreview = () => { setPrintHtml(buildHtml()); setPreviewMode(true); };
  const handlePrint = async () => {
    setPrinting(true);
    try { await window.printExpenseHtml(buildHtml()); }
    catch (e) { toast?.('출력 실패: ' + errMsg(e), 'error'); }
    finally { setTimeout(() => setPrinting(false), 400); }
  };
  const handlePdf = async () => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setGeneratingPdf(true);
    try {
      const docsHtml = await window.buildExpenseDocsHtml(buildHtml());
      const res = await apiClient.generateExpensePdfFromHtml({ contractNo: contract.no, html: docsHtml, fileName: fileBase() });
      if (!res.pdf?.base64) throw new Error('PDF 생성 실패');
      const bin = atob(res.pdf.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = res.pdf.fileName || `${fileBase()}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast?.('PDF 다운로드 완료', 'success');
    } catch (e) {
      const msg = errMsg(e);
      if (/UNKNOWN_ROUTE|알 수 없는 라우트/i.test(msg)) toast?.('⚠️ Apps Script 재배포가 필요합니다 (PDF 기능 없음). 그 전에는 [🖨️ 출력] → PDF로 저장을 사용하세요.', 'error');
      else toast?.('PDF 생성 실패: ' + msg, 'error');
    } finally { setGeneratingPdf(false); }
  };
  const busy = saving || printing || generatingPdf;

  // ─── 입력 칸 ───
  const inSt = { width:'100%', boxSizing:'border-box', height:32, padding:'0 9px', border:'1px solid var(--line-2)', borderRadius:6, font:'inherit', fontSize:12.5, background:'#fff', color:'var(--ink-1)' };
  const taSt = { ...inSt, height:'auto', padding:'7px 9px', lineHeight:1.5, resize:'vertical' };
  const setRow = (i, k, v) => setF(x => ({ ...x, rows: x.rows.map((r, j) => j === i ? { ...r, [k]: v } : r) }));
  const setPay = (i, k, v) => setF(x => ({ ...x, pays: x.pays.map((p, j) => j === i ? { ...p, [k]: v } : p) }));
  const party = (grp, title) => (
    <section>
      <h3>{title}</h3>
      {[['name', '상호'], ['bizNo', '사업자번호'], ['ceo', grp === 'contractor' ? '대표이사' : '대표자'], ['address', '주소'], ['tel', '전화번호']].map(([k, lb]) => (
        <div className="xp-prop" key={k}>
          <label htmlFor={`sc-${grp}-${k}`}>{lb}</label>
          <input id={`sc-${grp}-${k}`} value={f[grp][k] || ''} onChange={e => setIn(grp, k)(e.target.value)}/>
        </div>
      ))}
    </section>
  );

  return (
    <>
    {previewMode && (
      <window.ExpensePrintPreview html={printHtml} printing={printing} onPrint={handlePrint} onClose={() => setPreviewMode(false)}/>
    )}
    <Modal
      open={open}
      onClose={onClose}
      width="wide"
      title="도급계약서 · 하자보증각서"
      subtitle={`계약 ${typeof contractCode === 'function' ? contractCode(contract) : contract.no} · ${contract.projectName || ''}`}
      footer={
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', gap:8, flexWrap:'wrap'}}>
          <div className="xp-foot-note" style={{fontSize:11, color:'var(--ink-3)'}}>
            {loading ? '저장된 조건 불러오는 중…' : savedAt ? `마지막 저장 ${String(savedAt).slice(5)}` : '저장하면 이 계약의 도급 조건이 보관됩니다.'}
          </div>
          <div className="xp-foot-btns" style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>취소</button>
            <button className="btn-ghost" onClick={handleSave} disabled={busy} style={{color:'var(--green-800)', borderColor:'var(--green-700)', fontWeight:700}}>{saving ? '저장중…' : '💾 저장'}</button>
            <button className="btn-ghost" onClick={handlePreview} disabled={busy} style={{color:'#1a5490', borderColor:'#C8DBE5'}}>👁 출력 미리보기</button>
            <button className="btn-ghost" onClick={handlePrint} disabled={busy}>{printing ? '준비중…' : '🖨️ 출력'}</button>
            <button className="btn-primary" onClick={handlePdf} disabled={busy}>{generatingPdf ? '생성중…' : '📄 PDF 다운로드'}</button>
          </div>
        </div>
      }
    >
      <div className="xp-layout">
        <div style={{minWidth:0, display:'flex', flexDirection:'column', gap:22}}>
          {/* 문서 선택 */}
          <div role="tablist" aria-label="문서" style={{display:'flex', gap:4, padding:3, background:'var(--bg-2)', borderRadius:8, alignSelf:'flex-start'}}>
            {[['contract', '설치도급계약서'], ['warranty', '하자보증이행각서']].map(([k, lb]) => (
              <button key={k} type="button" role="tab" aria-selected={doc === k} onClick={() => setDoc(k)}
                style={{height:32, padding:'0 14px', border:0, borderRadius:6, cursor:'pointer', font:'inherit', fontSize:13,
                  fontWeight: doc === k ? 600 : 400, background: doc === k ? '#fff' : 'transparent', color: doc === k ? 'var(--ink-1)' : 'var(--ink-3)',
                  boxShadow: doc === k ? '0 1px 2px rgba(0,0,0,.08)' : 'none'}}>{lb}</button>
            ))}
          </div>
          {doc === 'warranty' && (<>
          <section aria-label="하자보증금액">
            <div className="xp-total">
              <div>
                <div className="cap">하자보증금액 (VAT 포함 · 계약금액의 {wc.rate}%)</div>
                <div className="num">{won(wc.bond)}<small>원</small></div>
              </div>
              <div className="xp-meta">
                <div>계약금액 {won(wc.amountVat)} (VAT 포함{f.vatMode === '포함' ? '' : ' · 별도 금액 × 1.1'})</div>
                <div>보증기간 {wc.start || '-'} ~ {wc.end || '-'}</div>
              </div>
            </div>
          </section>

          {alerts.length > 0 && (
            <div className="xp-alert" role="status" style={{marginTop:-8}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flex:'none', marginTop:2}}><path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3"/><path d="M8 11.3v.4"/></svg>
              <div><b>출력 전 확인 {alerts.length}건</b><ul>{alerts.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
            </div>
          )}

          <section>
            <div className="xp-list-head" style={{marginTop:0}}><h3>하자보증 내용</h3><span className="lg">공사명·계약금액·계약일·하도급인은 계약서 탭과 같은 값</span></div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, paddingTop:12}}>
              <SubcField id="sw-site" label="공사명" span={4}><input id="sw-site" style={inSt} value={f.siteName} onChange={e => set('siteName')(e.target.value)}/></SubcField>
              <SubcField id="sw-cdate" label="계약일자"><input id="sw-cdate" type="date" style={inSt} value={f.contractDate} onChange={e => set('contractDate')(e.target.value)}/></SubcField>
              <SubcField id="sw-end" label="준공일자"><input id="sw-end" type="date" style={inSt} value={f.endDate} onChange={e => set('endDate')(e.target.value)}/></SubcField>
              <SubcField id="sw-years" label="하자보수기간 (년)"><input id="sw-years" type="number" min="0" style={inSt} value={f.warrantyYears} onChange={e => set('warrantyYears')(e.target.value)}/></SubcField>
              <SubcField id="sw-rate" label="하자보증금율 (%)"><input id="sw-rate" type="number" min="0" step="0.1" style={inSt} value={f.warrantyRate} onChange={e => set('warrantyRate')(e.target.value)}/></SubcField>
              <SubcField id="sw-start" label="하자보증 시작일 (준공일 다음 날)"><input id="sw-start" style={{...inSt, background:'var(--surface-2)'}} value={wc.start} readOnly/></SubcField>
              <SubcField id="sw-endd" label="하자보증 마감일"><input id="sw-endd" style={{...inSt, background:'var(--surface-2)'}} value={wc.end} readOnly/></SubcField>
              <SubcField id="sw-method" label="하자보수 이행방법" span={2}><input id="sw-method" style={inSt} value={f.warrantyMethod} onChange={e => set('warrantyMethod')(e.target.value)}/></SubcField>
              <SubcField id="sw-pdate" label="각서 제출일 (비우면 준공일)"><input id="sw-pdate" type="date" style={inSt} value={f.pledgeDate} onChange={e => set('pledgeDate')(e.target.value)}/></SubcField>
            </div>
            <p style={{fontSize:12, color:'var(--ink-3)', margin:'10px 0 0', lineHeight:1.6}}>
              각서 문구는 원본 그대로이며, 받는 사람은 도급인 상호(“{f.contractor.name || '도급인'} 귀하”)로 나옵니다. 하도급인 주소·상호·대표자·사업자번호는 오른쪽 칸에서 고칠 수 있습니다.
            </p>
          </section>
          </>)}

          {doc === 'contract' && (<>
          {/* 계약금액 */}
          <section aria-label="계약금액">
            <div className="xp-total">
              <div>
                <div className="cap">6. 계약금액 ({f.vatMode === '포함' ? 'VAT 포함' : 'VAT 별도'})</div>
                <div className="num">{won(amount)}<small>원</small></div>
              </div>
              <div className="xp-meta">
                <div>도급금액(계약) {won(subAmt)} · 세부내역 합계 {won(rowsTotal)}</div>
                <div>{payAmts.map(p => `${p.label} ${won(p.amount)}`).join(' · ')}</div>
              </div>
            </div>
          </section>

          {alerts.length > 0 && (
            <div className="xp-alert" role="status" style={{marginTop:-8}}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flex:'none', marginTop:2}}><path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3"/><path d="M8 11.3v.4"/></svg>
              <div><b>출력 전 확인 {alerts.length}건</b><ul>{alerts.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
            </div>
          )}

          {/* 1~6 공사 정보 */}
          <section>
            <div className="xp-list-head" style={{marginTop:0}}><h3>공사 정보</h3><span className="lg">현장설치정보에서 자동으로 채움</span></div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4, minmax(0, 1fr))', gap:10, paddingTop:12}}>
              <SubcField id="sc-site" label="1. 공사명" span={4}><input id="sc-site" style={inSt} value={f.siteName} onChange={e => set('siteName')(e.target.value)}/></SubcField>
              <SubcField id="sc-addr" label="2. 공사주소" span={3}><input id="sc-addr" style={inSt} value={f.siteAddress} onChange={e => set('siteAddress')(e.target.value)}/></SubcField>
              <SubcField id="sc-mgr" label="담당자"><input id="sc-mgr" style={inSt} value={f.manager} onChange={e => set('manager')(e.target.value)}/></SubcField>
              <SubcField id="sc-item" label="3. 설치품목" span={2}><input id="sc-item" style={inSt} value={f.item} placeholder="예: DVM S 냉난방기" onChange={e => set('item')(e.target.value)}/></SubcField>
              <SubcField id="sc-qty" label="4. 설치수량" span={2}><input id="sc-qty" style={inSt} value={f.qtyText} onChange={e => set('qtyText')(e.target.value)}/></SubcField>
              <SubcField id="sc-start" label="5. 착공일"><input id="sc-start" type="date" style={inSt} value={f.startDate} onChange={e => set('startDate')(e.target.value)}/></SubcField>
              <SubcField id="sc-end" label="준공일"><input id="sc-end" type="date" style={inSt} value={f.endDate} onChange={e => set('endDate')(e.target.value)}/></SubcField>
              <SubcField id="sc-amt" label="6. 계약금액 (원)"><input id="sc-amt" type="text" inputMode="numeric" style={{...inSt, textAlign:'right', fontWeight:600}} value={f.amount} onChange={e => set('amount')(e.target.value.replace(/[^0-9]/g, ''))}/></SubcField>
              <SubcField id="sc-vat" label="부가세">
                <select id="sc-vat" style={inSt} value={f.vatMode} onChange={e => set('vatMode')(e.target.value)}>
                  <option value="별도">VAT 별도</option><option value="포함">VAT 포함</option>
                </select>
              </SubcField>
            </div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:8}}>
              {subAmt > 0 && amount !== subAmt && <button type="button" className="xr-btn" onClick={() => set('amount')(String(subAmt))}>계약 도급금액 {won(subAmt)} 적용</button>}
              {rowsTotal > 0 && amount !== rowsTotal && <button type="button" className="xr-btn" onClick={() => set('amount')(String(rowsTotal))}>세부내역 합계 {won(rowsTotal)} 적용</button>}
            </div>
          </section>

          {/* 세부내역 */}
          <section>
            <div className="xp-list-head" style={{marginTop:0}}>
              <h3>세부내역</h3>
              <span style={{display:'flex', gap:6}}>
                {installRows.length > 0 && <button type="button" className="xr-btn" onClick={() => set('rows')(installRows.map(r => ({ ...r })))}>설치 내역서 불러오기 ({installRows.length}건)</button>}
                <button type="button" className="xr-btn" onClick={() => set('rows')([...(f.rows || []), { name:'', spec:'', qty:'', unit:'대', unitPrice:'' }])}>+ 행 추가</button>
              </span>
            </div>
            <div className="xr-scroll"><div className="xr-scroll-in">
              <div style={{display:'grid', gridTemplateColumns:'minmax(0,2.2fr) minmax(0,1.2fr) 70px 56px 110px 120px 30px', gap:6, fontSize:11.5, color:'var(--ink-3)', padding:'10px 0 4px', borderBottom:'1px solid var(--line)'}}>
                <span>품목</span><span>규격</span><span style={{textAlign:'right'}}>수량</span><span>단위</span><span style={{textAlign:'right'}}>단가</span><span style={{textAlign:'right'}}>금액</span><span/>
              </div>
              {(f.rows || []).length === 0 && <div style={{fontSize:12, color:'var(--ink-3)', padding:'10px 0'}}>세부내역이 없습니다. 출력물에는 빈 줄로 나옵니다.</div>}
              {(f.rows || []).map((r, i) => (
                <div key={i} style={{display:'grid', gridTemplateColumns:'minmax(0,2.2fr) minmax(0,1.2fr) 70px 56px 110px 120px 30px', gap:6, alignItems:'center', padding:'5px 0', borderBottom:'1px solid var(--line)'}}>
                  <input aria-label={`세부내역 ${i + 1} 품목`} style={{...inSt, height:30}} value={r.name} onChange={e => setRow(i, 'name', e.target.value)}/>
                  <input aria-label={`세부내역 ${i + 1} 규격`} style={{...inSt, height:30}} value={r.spec || ''} onChange={e => setRow(i, 'spec', e.target.value)}/>
                  <input aria-label={`세부내역 ${i + 1} 수량`} type="number" style={{...inSt, height:30, textAlign:'right'}} value={r.qty} onChange={e => setRow(i, 'qty', e.target.value)}/>
                  <input aria-label={`세부내역 ${i + 1} 단위`} style={{...inSt, height:30}} value={r.unit || ''} onChange={e => setRow(i, 'unit', e.target.value)}/>
                  <input aria-label={`세부내역 ${i + 1} 단가`} type="number" style={{...inSt, height:30, textAlign:'right'}} value={r.unitPrice} onChange={e => setRow(i, 'unitPrice', e.target.value)}/>
                  <span style={{textAlign:'right', fontSize:12.5, fontVariantNumeric:'tabular-nums'}}>{won(rowAmt(r))}</span>
                  <button type="button" aria-label={`세부내역 ${i + 1} 삭제`} onClick={() => set('rows')(f.rows.filter((_, j) => j !== i))} style={{border:0, background:'none', color:'var(--danger)', fontSize:15, cursor:'pointer'}}>×</button>
                </div>
              ))}
              <div style={{display:'flex', justifyContent:'flex-end', gap:12, padding:'8px 36px 0 0', fontSize:12.5}}>
                <span style={{color:'var(--ink-3)'}}>합계</span><b style={{fontVariantNumeric:'tabular-nums'}}>{won(rowsTotal)}</b>
              </div>
            </div></div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:10, marginTop:10}}>
              <SubcField id="sc-inc" label="설치비 포함내역"><input id="sc-inc" style={inSt} value={f.includedText} placeholder="예: 실외기 배관커버, 장비 사용료, 냉매배관커버(STS)" onChange={e => set('includedText')(e.target.value)}/></SubcField>
              <SubcField id="sc-sup" label="지급 자재"><input id="sc-sup" style={inSt} value={f.suppliedText} placeholder="예: 실외기 받침대, 분기관" onChange={e => set('suppliedText')(e.target.value)}/></SubcField>
            </div>
          </section>

          {/* 결제 */}
          <section>
            <div className="xp-list-head" style={{marginTop:0}}><h3>결제 (계약금 · 중도금 · 잔금)</h3><span className="lg" style={{color: pctSum === 100 ? undefined : 'var(--danger)'}}>비율 합계 {pctSum}%</span></div>
            {(f.pays || []).map((p, i) => (
              <div key={i} style={{display:'grid', gridTemplateColumns:'90px 80px 130px minmax(0,1.4fr) minmax(0,1fr)', gap:8, alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--line)'}}>
                <input aria-label={`결제 ${i + 1} 구분`} style={{...inSt, fontWeight:600}} value={p.label} onChange={e => setPay(i, 'label', e.target.value)}/>
                <span style={{display:'flex', alignItems:'center', gap:4}}>
                  <input aria-label={`${p.label} 비율`} type="number" style={{...inSt, textAlign:'right'}} value={p.pct} onChange={e => setPay(i, 'pct', e.target.value)}/>%
                </span>
                <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:600}}>{won(payAmts[i]?.amount)}</span>
                <input aria-label={`${p.label} 입금 시기`} style={inSt} value={p.when} placeholder="입금날짜 (예: 계약시)" onChange={e => setPay(i, 'when', e.target.value)}/>
                <input aria-label={`${p.label} 비고`} style={inSt} value={p.note} placeholder="비고" onChange={e => setPay(i, 'note', e.target.value)}/>
              </div>
            ))}
          </section>

          {/* 조항 */}
          <section>
            <div className="xp-list-head" style={{marginTop:0}}><h3>조항</h3><span className="lg">9~15조(자재 검사·부적합·중지·폐기물·손해배상·해지)는 원본 문구 그대로</span></div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(2, minmax(0, 1fr))', gap:12, paddingTop:12}}>
              <SubcField id="sc-paym" label="7. 대금지급방법 (한 줄에 하나)"><textarea id="sc-paym" rows={3} style={taSt} value={f.payMethod} onChange={e => set('payMethod')(e.target.value)}/></SubcField>
              <SubcField id="sc-rep" label="8. 완료보고서 제출항목 (한 줄에 하나)"><textarea id="sc-rep" rows={3} style={taSt} value={f.reportItems} onChange={e => set('reportItems')(e.target.value)}/></SubcField>
              <SubcField id="sc-war" label="14. 무상 하자보수기간 (년)"><input id="sc-war" type="number" min="0" style={{...inSt, width:120}} value={f.warrantyYears} onChange={e => set('warrantyYears')(e.target.value)}/></SubcField>
              <span/>
              <SubcField id="sc-spc" label="기타 특기사항 (한 줄에 하나)" span={2}><textarea id="sc-spc" rows={6} style={taSt} value={f.specials} onChange={e => set('specials')(e.target.value)}/></SubcField>
            </div>
          </section>
          </>)}
        </div>

        {/* 오른쪽: 계약일 · 당사자 */}
        <aside className="xp-side" aria-label="계약 당사자">
          <section>
            <h3>계약</h3>
            <div className="xp-prop">
              <label htmlFor="sc-date">계약일</label>
              <input id="sc-date" type="date" value={f.contractDate} onChange={e => set('contractDate')(e.target.value)}/>
            </div>
          </section>
          {party('contractor', '도급인 (우리 회사)')}
          {party('sub', '하도급인 (도급업체)')}
          <p style={{fontSize:11.5, color:'var(--ink-3)', margin:0, lineHeight:1.6}}>
            하도급인 정보는 도급업체 관리에 등록된 값으로 채워집니다. 도급인 정보는 이 브라우저에 기억됩니다.
          </p>
        </aside>
      </div>
    </Modal>
    </>
  );
};

window.SubcontractModal = SubcontractModal;
