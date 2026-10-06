/* ═══════════════════════════════════════════════════════════════
   지출품의서 생성 모달 · v2
   - 8가지 개선안 반영:
     ① 전회 기성 드롭박스   ② 기성 누적 %
     ③ 기타경비/수수료      ④ 도급업체 정보 블록
     ⑤ 비고 사항           ⑥ 제품 내역서 임포트
     ⑦ 계약 요약 헤더      ⑧ 저장/출력/PDF 3버튼
   - 파트 컴포넌트는 modal-expense-parts.jsx 에 분리
═══════════════════════════════════════════════════════════════ */

// ─── 지출품의서 저장 시 계약 금액 동기화 결과 토스트용 라벨 ───
const FIELD_LABELS_KO = {
  subcontractAmount: '설치비', productCost: '제품대', salesCost: '영업수수료', incidental: '기타경비',
};

// ─── 한글 금액 변환 (한국 관공서/결재문서 스타일) ───
const _KUNIT4 = ['','만','억','조','경'];
const _KUNIT1 = ['','십','백','천'];
const _KDIGIT = ['','일','이','삼','사','오','육','칠','팔','구'];
function numberToKoreanAmount(num) {
  const n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return '영원정';
  const s = String(n);
  let out = '';
  const groups = [];
  for (let i = s.length; i > 0; i -= 4) {
    groups.unshift(s.slice(Math.max(0, i - 4), i));
  }
  const gTotal = groups.length;
  groups.forEach((g, gi) => {
    const gVal = Number(g);
    if (gVal === 0) return;
    let gStr = '';
    for (let i = 0; i < g.length; i++) {
      const d = Number(g[i]);
      if (d === 0) continue;
      const posFromRight = g.length - 1 - i;
      // '일' 은 십/백/천 앞에 붙지 않음 (예: 십일만 · 백만 · 천만원)
      const digit = (d === 1 && posFromRight > 0) ? '' : _KDIGIT[d];
      gStr += digit + _KUNIT1[posFromRight];
    }
    out += gStr + _KUNIT4[gTotal - 1 - gi];
  });
  return '일금 ' + out + '원정';
}

// 출력물(서명란)에 들어갈 회사명 후보 · 마지막 선택은 브라우저에 기억
const EXPENSE_COMPANY_OPTIONS = ['주식회사 삼성이엔지', '한별상회'];
const EXPENSE_COMPANY_KEY = 'hb.expenseCompany';
const _loadCompany = () => {
  try { return localStorage.getItem(EXPENSE_COMPANY_KEY) || EXPENSE_COMPANY_OPTIONS[0]; }
  catch { return EXPENSE_COMPANY_OPTIONS[0]; }
};

// 저장된(취소 안 된) 회차 중 가장 큰 번호 + 1
const nextRoundNo = (hist) => (hist || []).filter(h => h.status !== 'cancelled').reduce((m, h) => Math.max(m, Number(h.roundNo) || 0), 0) + 1;

const ExpenseModal = ({ open, onClose, contract, data, onSaved }) => {
  // ─── 상태 ───
  const [form, setForm] = useState({
    manager: '',
    docDate: new Date().toISOString().slice(0, 10),
    paymentCount: '1',
    prevProgress: 0,
    requestAmount: '',
    // 🆕 품의제목 접미어 (예: "설치비 지급요청의 건", "자재비 지급요청의 건")
    docSubject: '설치비 지급요청의 건',
    companyName: _loadCompany(),
    attachments: '세금계산서, 통장사본 1부',
    commission: 0,
    etcCost: 0,
    note: '',
    // 도급업체 정보 (④)
    subName: '',
    subBizNo: '',
    subCeo: '',
    subManager: '',
    subManagerTel: '',
    subBank: '',
    subAccount: '',
    subHolder: '',
    subAddress: '',
  });

  const [installItems, setInstallItems] = useState([]);
  const [productItems, setProductItems] = useState([]);
  const [productSummary, setProductSummary] = useState(null);
  const [productFilename, setProductFilename] = useState('');
  const [installFilename, setInstallFilename] = useState('');
  const [productFileUrl, setProductFileUrl] = useState('');   // 마지막으로 가져오거나(Drive)/올린(PC 자동저장) 파일의 열람 링크
  const [installFileUrl, setInstallFileUrl] = useState('');

  const [etcItems, setEtcItems] = useState([]);
  const [commissionItems, setCommissionItems] = useState([]);

  const [expenseHistory, setExpenseHistory] = useState([]);
  const [selectedRound, setSelectedRound] = useState('');

  // 🆕 항목별(설치비/제품대/영업수수료/기타경비) "이번 회차 포함" 토글 — v3부터 설치비도 동일하게 토글 가능
  const [includeInstall, setIncludeInstall] = useState(true);
  const [includeProduct, setIncludeProduct] = useState(false);
  const [includeCommission, setIncludeCommission] = useState(false);
  const [includeEtc, setIncludeEtc] = useState(false);

  // 🆕 v3: "구분"(이 지급요청 문서의 대표 항목) — 상단 "금회 요청금액 (구분)" 필드의 라벨/바인딩을 결정
  const [docCategory, setDocCategory] = useState('install');
  // 🆕 v3: 제품대/영업수수료/기타경비도 설치비처럼 "금회 요청" 금액을 품목표 합계와 독립적으로
  // 직접 입력·수정할 수 있게 함 (품목표는 내역/증빙 참고용, 실제 청구액은 이 값을 사용)
  const [productAmount, setProductAmount] = useState('');
  const [commissionAmount, setCommissionAmount] = useState('');
  const [etcAmount, setEtcAmount] = useState('');
  // 기타경비 총액: 계약관리 시트 값(incidental)을 불러와 화면에서 수정 가능
  const [etcBudget, setEtcBudget] = useState('');
  const [savingBudgetKey, setSavingBudgetKey] = useState(null);
  // 제품대·설치비 총액도 화면에서 수정 → 계약(계약관리 시트)에 반영
  const [productBudget, setProductBudget] = useState('');
  const [installBudget, setInstallBudget] = useState('');
  const [commissionBudget, setCommissionBudget] = useState('');
  const [baseBudgets, setBaseBudgets] = useState({ product: 0, install: 0, etc: 0, commission: 0 });   // 계약에 저장된 값
  const [savedVendorNames, setSavedVendorNames] = useState([]);   // 이번 창에서 새로 저장한 업체
  // 🆕 v3: 항목별 기성 카드마다 별도로 지정할 수 있는 업체명(지급대상이 카테고리별로 다를 때)
  const [productVendorName, setProductVendorName] = useState('');
  const [commissionVendorName, setCommissionVendorName] = useState('');
  const [etcVendorName, setEtcVendorName] = useState('');
  // 항목별 비고(지급 사유)
  const EMPTY_NOTES = { product:'', install:'', etc:'', commission:'' };
  const [catNotes, setCatNotes] = useState(EMPTY_NOTES);
  const setCatNote = (k) => (v) => setCatNotes(n => ({ ...n, [k]: v }));
  const [savingVendorCat, setSavingVendorCat] = useState(null);   // 'install'|'product'|'commission'|'etc'|null
  // 계약별 내역서(품목표) 저장 — 지출품의서 회차 저장과 별개로, 불러온 내역을 계약에 보관
  const [itemsSavedAt, setItemsSavedAt] = useState({});           // { product|install|etc|commission: 'yyyy-MM-dd HH:mm' }
  const [savingItems, setSavingItems] = useState(null);
  const itemsRef = useRef({});
  // 수기 지급이력 (계약내역서 레코드의 history) — 표에서 바로 입력 → [지급이력 저장]
  const EMPTY_HIST = { product: [], install: [], etc: [], commission: [] };
  const [manualHist, setManualHist] = useState(EMPTY_HIST);
  const [histSavedAt, setHistSavedAt] = useState({});
  const [savingManualKind, setSavingManualKind] = useState(null);
  const savedRecordsRef = useRef({});     // kind → 서버에 저장된 레코드 { items, summary?, filename?, history? }
  const manualMaxRef = useRef(0);         // 수기 지급이력의 가장 큰 회차 (새 회차 번호 계산용)
  const setManualRows = (k) => (rows) => setManualHist(h => ({ ...h, [k]: rows }));
  itemsRef.current = { product: productItems, install: installItems, etc: etcItems, commission: commissionItems };

  const [importing, setImporting] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  // 출력 미리보기 상태 (화면에서 인쇄 결과 실시간 확인)
  const [previewMode, setPreviewMode] = useState(false);
  const [printHtml, setPrintHtml] = useState('');
  const [payments, setPayments] = useState(null);     // 수금이력 (계약금·중도금·잔금 분류용)
  const [companyCustom, setCompanyCustom] = useState(() => !EXPENSE_COMPANY_OPTIONS.includes(_loadCompany()));   // A4 세로 인쇄 문서 (미리보기용)

  const toast = window.useToast ? window.useToast() : null;
  const confirmDialog = window.useConfirm ? window.useConfirm() : null;
  const [deletingRound, setDeletingRound] = useState(null);   // 삭제(취소 처리) 진행 중인 회차의 시트 행번호
  // v3.17 · 펼친 항목(한 번에 하나) · 지난 회차 정정 이력(기성정정이력 시트)
  const [openCat, setOpenCat] = useState('install');
  const [corrections, setCorrections] = useState([]);

  // ─── 계약 변경 시 기본값 세팅 ───
  useEffect(() => {
    if (!open || !contract) return;
    setForm(f => ({
      ...f,
      docDate: new Date().toISOString().slice(0, 10),
      prevProgress: contract.subcontractPaid || 0,
      requestAmount: contract.subcontractBalance || 0,
      commission: contract.salesCost || 0,
      etcCost: contract.incidental || 0,
      note: '',
      subName: contract.subcontractor || '',
      // 계약의 도급업체가 등록업체(도급업체 시트/거래처관리)와 일치하면 업체정보 자동 채움
      ...(() => {
        const m = window.matchSubcontractor?.(data, contract.subcontractor);
        return m ? {
          subName: m.name, subBizNo: m.bizNo || '', subCeo: m.ceo || '',
          subManager: m.manager || '', subManagerTel: m.tel || '',
          subBank: m.bank || '', subAccount: m.account || '', subHolder: m.holder || '', subAddress: m.address || '',
        } : {};
      })(),
    }));
    setInstallItems([{ name:'', spec:'', qty:'', unit:'식', unitPrice:'', note:'' }]);
    setProductItems([]);
    setProductSummary(null);
    setProductFilename('');
    setInstallFilename('');
    setProductFileUrl('');
    setInstallFileUrl('');
    setEtcItems([]);
    setCommissionItems([]);
    setSelectedRound('');
    // 🆕 v3 항목별 상태 초기화
    setIncludeInstall(true);
    setIncludeProduct(false);
    setIncludeCommission(false);
    setIncludeEtc(false);
    setDocCategory('install');
    setProductAmount('');
    setCommissionAmount('');
    setEtcAmount('');
    setEtcBudget(contract?.incidental ? String(contract.incidental) : '');
    setProductBudget(contract?.productCost ? String(contract.productCost) : '');
    setInstallBudget(contract?.subcontractAmount ? String(contract.subcontractAmount) : '');
    setCommissionBudget(contract?.salesCost ? String(contract.salesCost) : '');
    setBaseBudgets({ product: Number(contract?.productCost) || 0, install: Number(contract?.subcontractAmount) || 0, etc: Number(contract?.incidental) || 0, commission: Number(contract?.salesCost) || 0 });
    setProductVendorName('');
    setCommissionVendorName('');
    setCatNotes(EMPTY_NOTES);
    setEtcVendorName('');
    setOpenCat('install');
    setCorrections([]);
  }, [open, contract?.no]);

  // 🆕 미리보기 모드 · body 클래스 토글 (early return 이전에 위치 · hooks 규칙)
  useEffect(() => {
    if (previewMode) document.body.classList.add('expense-preview-mode');
    else document.body.classList.remove('expense-preview-mode');
    return () => document.body.classList.remove('expense-preview-mode');
  }, [previewMode]);

  // 🆕 모달 닫힐 때 미리보기 자동 해제
  useEffect(() => {
    if (!open) setPreviewMode(false);
  }, [open]);

  // ─── 수금이력 로드 (대시보드 수금 관리와 동일 데이터) ───
  useEffect(() => {
    if (!open || !contract?.no) return;
    setPayments(null);
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) return;
    let alive = true;
    apiClient.listPayments(contract.no)
      .then(r => { if (alive) setPayments(r.payments || []); })
      .catch(e => { console.warn('[listPayments]', e); if (alive) setPayments([]); });
    return () => { alive = false; };
  }, [open, contract?.no]);

  // ─── 계약별 저장된 내역서 불러오기 (새 지출품의서 · 아직 비어있는 표만 채움) ───
  useEffect(() => {
    if (!open || !contract?.no) return;
    setItemsSavedAt({});
    setManualHist(EMPTY_HIST);
    setHistSavedAt({});
    savedRecordsRef.current = {};
    manualMaxRef.current = 0;
    paidSyncedRef.current = null;
    if (typeof hasApiUrl !== 'function' || !hasApiUrl() || !apiClient.getContractItems) return;
    let alive = true;
    apiClient.getContractItems(contract.no)
      .then(r => {
        if (!alive) return;
        const saved = r.items || {};
        const rowsOf = (v) => Array.isArray(v) ? v : (v && Array.isArray(v.items) ? v.items : []);
        const isBlank = (rows) => !rows.some(x => x && (x.name || x.spec || x.item || Number(x.amount) || Number(x.unitPrice) || Number(x.qty)));
        const cur = itemsRef.current;
        const loaded = [];
        // 저장된 레코드 보관 + 수기 지급이력 불러오기
        const hist = { product: [], install: [], etc: [], commission: [] };
        let maxManual = 0;
        Object.keys(hist).forEach(k => {
          const v = saved[k];
          const rec = Array.isArray(v) ? { items: v } : (v || null);
          if (rec) savedRecordsRef.current[k] = rec;
          hist[k] = ((rec && rec.history) || []).map(m => {
            maxManual = Math.max(maxManual, Number(m.roundNo) || 0);
            return { roundNo: String(m.roundNo ?? ''), docDate: m.docDate || '', amount: m.amount === 0 || m.amount ? String(m.amount) : '', note: m.note || '' };
          });
        });
        setManualHist(hist);
        manualMaxRef.current = maxManual;
        if (maxManual) setForm(f => ({ ...f, paymentCount: String(Math.max(Number(f.paymentCount) || 1, maxManual + 1)) }));
        if (!isBlank(rowsOf(saved.product)) && isBlank(cur.product)) {
          const v = saved.product;
          setProductItems(rowsOf(v));
          setProductSummary(v && !Array.isArray(v) && v.summary ? v.summary : null);
          if (v && v.filename) setProductFilename(v.filename);
          loaded.push('제품대');
        }
        if (!isBlank(rowsOf(saved.install)) && isBlank(cur.install)) {
          setInstallItems(rowsOf(saved.install));
          if (saved.install && saved.install.filename) setInstallFilename(saved.install.filename);
          loaded.push('설치비');
        }
        if (!isBlank(rowsOf(saved.etc)) && isBlank(cur.etc)) { setEtcItems(rowsOf(saved.etc)); loaded.push('기타경비'); }
        if (!isBlank(rowsOf(saved.commission)) && isBlank(cur.commission)) { setCommissionItems(rowsOf(saved.commission)); loaded.push('영업수수료'); }
        setItemsSavedAt(r.savedAt || {});
        if (loaded.length) toast?.(`저장된 내역서 불러옴: ${loaded.join(' · ')}`, 'success');
      })
      .catch(e => console.warn('[contractItems]', e));
    return () => { alive = false; };
  }, [open, contract?.no]);

  const handleSaveItems = async (kind) => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    const label = { product:'제품대', install:'설치비', etc:'기타경비', commission:'영업수수료' }[kind];
    const rows = { product: productItems, install: installItems, etc: etcItems, commission: commissionItems }[kind] || [];
    // 같은 레코드에 함께 보관된 다른 값(예: 도급계약서 조건 subcontractTerms)은 그대로 두고 품목만 바꿈
    const payload = { ...(savedRecordsRef.current[kind] || {}), items: rows };
    if (kind === 'product') { payload.summary = productSummary || null; payload.filename = productFilename || ''; }
    if (kind === 'install') payload.filename = installFilename || '';
    // 저장된 수기 지급이력은 그대로 유지
    payload.history = (savedRecordsRef.current[kind] && savedRecordsRef.current[kind].history) || [];
    setSavingItems(kind);
    try {
      const r = await apiClient.saveContractItems(contract.no, kind, payload);
      savedRecordsRef.current[kind] = payload;
      setItemsSavedAt(s => ({ ...s, [kind]: r.savedAt || '' }));
      toast?.(`${label} 내역 저장 완료 (${rows.length}행) — 다음에 열면 자동으로 불러옵니다`, 'success');
    } catch (e) {
      toast?.(`${label} 내역 저장 실패: ` + errMsg(e), 'error');
    } finally {
      setSavingItems(null);
    }
  };
  const saveItemsButton = (kind) => (
    <button
      onClick={() => handleSaveItems(kind)}
      disabled={!!savingItems}
      aria-label={`${ {product:'제품대',install:'설치비',etc:'기타경비',commission:'영업수수료'}[kind] } 내역 저장`}
      title={itemsSavedAt[kind] ? `마지막 저장: ${itemsSavedAt[kind]}` : '이 계약에 내역을 저장 — 다음에 지출품의서를 열면 자동으로 불러옵니다'}
      style={{padding:'5px 10px', fontSize:11, fontWeight:700, background: savingItems===kind ? 'var(--surface-2)' : 'var(--green-800, #1f5c3a)', color: savingItems===kind ? 'var(--ink-3)' : '#fff', border:'1px solid var(--green-800, #1f5c3a)', borderRadius:5, cursor: savingItems ? 'wait' : 'pointer'}}>
      {savingItems === kind ? '⏳ 저장 중...' : '💾 내역 저장'}{itemsSavedAt[kind] && savingItems !== kind ? <span style={{fontWeight:500, opacity:.8, marginLeft:4}}>({String(itemsSavedAt[kind]).slice(5)})</span> : null}
    </button>
  );

  // ─── 설치비 기성금액(계약 N열) = 저장된 지출품의서 설치비 + 수기 설치비 지급이력 합계 ───
  const paidSyncedRef = useRef(null);   // 마지막으로 계약에 반영한 기성금액
  const syncInstallPaid = async (hist, manualInstall) => {
    if (typeof canEdit === 'function' && !canEdit()) return null;
    const bd = (h) => (window.expenseRoundBreakdown ? window.expenseRoundBreakdown(h) : { install: Number(h.amount) || 0 });
    const docSum = (hist || []).filter(h => h.status !== 'cancelled').reduce((sum, h) => sum + (bd(h).install || 0), 0);
    const manual = manualInstall || ((savedRecordsRef.current.install || {}).history || []);
    const manualSum = manual.reduce((sum, m) => sum + (Number(m.amount) || 0), 0);
    const total = Math.round(docSum + manualSum);
    const current = paidSyncedRef.current ?? (Number(contract.subcontractPaid) || 0);
    if (total === current) return null;
    try {
      await apiClient.updateContract(contract.no, { subcontractPaid: total });
      paidSyncedRef.current = total;
      return total;
    } catch (e) {
      toast?.('설치비 기성금액 반영 실패: ' + errMsg(e), 'error');
      return null;
    }
  };

  // ─── 수기 지급이력 저장 (계약내역서 레코드의 history 만 바꾸고 품목 내역은 그대로) ───
  const handleSaveManual = async (kind) => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    const label = { product:'제품대', install:'설치비', etc:'기타경비', commission:'영업수수료' }[kind];
    const rows = (manualHist[kind] || []).filter(m => Number(m.amount) > 0);
    const history = rows.map(m => ({ roundNo: Number(m.roundNo) || 0, docDate: m.docDate || '', amount: Number(m.amount) || 0, note: m.note || '' }));
    const base = savedRecordsRef.current[kind] || { items: [] };
    const payload = { ...base, items: base.items || [], history };
    setSavingManualKind(kind);
    try {
      const r = await apiClient.saveContractItems(contract.no, kind, payload);
      savedRecordsRef.current[kind] = payload;
      setHistSavedAt(s => ({ ...s, [kind]: r.savedAt || '' }));
      setManualHist(h => ({ ...h, [kind]: rows }));   // 금액 없는 빈 줄은 정리
      const maxManual = Math.max(0, ...Object.keys(savedRecordsRef.current).flatMap(k => ((savedRecordsRef.current[k] || {}).history || []).map(m => Number(m.roundNo) || 0)));
      manualMaxRef.current = maxManual;
      if (!selectedRound) setForm(f => ({ ...f, paymentCount: String(Math.max(nextRoundNo(expenseHistory), maxManual + 1)) }));
      const paid = kind === 'install' ? await syncInstallPaid(expenseHistory, history) : null;
      toast?.(`${label} 지급이력 저장 완료 (${history.length}건)${paid != null ? ` · 설치비 기성금액 ${paid.toLocaleString()}원 반영` : ''}`, 'success');
      if (paid != null) onSaved?.()?.catch?.(() => {});
    } catch (e) {
      toast?.(`${label} 지급이력 저장 실패: ` + errMsg(e), 'error');
    } finally {
      setSavingManualKind(null);
    }
  };

  // ─── 지출품의서 이력 로드 (① 드롭박스) ───
  useEffect(() => {
    if (!open || !contract?.no) return;
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) return;
    setLoadingHistory(true);
    setExpenseHistory([]);
    let alive = true;   // 다른 계약으로 바뀐 뒤 늦게 온 응답이 덮어쓰지 않도록
    apiClient.expenseByContract(contract.no)
      .then(r => {
        if (!alive) return;
        const hist = r.history || [];
        setExpenseHistory(hist);
        setCorrections(r.corrections || []);
        // 새 지출품의서는 '마지막 저장 회차 + 1' 차로 시작 (1차가 있으면 2차) — 수기 지급이력 회차도 고려
        setForm(f => ({ ...f, paymentCount: String(Math.max(nextRoundNo(hist), manualMaxRef.current + 1)) }));
      })
      .catch(e => {
        if (!alive) return;
        console.warn('[expenseByContract]', e);
        setExpenseHistory([]);
      })
      .finally(() => { if (alive) setLoadingHistory(false); });
    return () => { alive = false; };
  }, [open, contract?.no]);

  // ─── 이전 회차 선택 시 자동 복원 ───
  const handleRoundSelect = (roundKey) => {
    setSelectedRound(roundKey);
    if (!roundKey) { setForm(f => ({ ...f, paymentCount: String(nextRoundNo(expenseHistory)) })); return; }
    const r = expenseHistory.find(h => String(h.no || expenseHistory.indexOf(h)) === String(roundKey));
    if (!r) return;
    setForm(f => ({
      ...f,
      // 이전 회차를 다시 열면 그 회차 번호로 (그 회차 자신은 '이전 지급 누계'에서 빠짐)
      paymentCount: String(r.roundNo || f.paymentCount),
      docDate: r.docDate || f.docDate,
      requestAmount: r.amount || 0,
      note: r.note || '',
      // 지급 대상(도급업체) 스냅샷도 함께 복원 (저장 시 함께 기록해둔 값)
      ...(r.subcontractor ? {
        subName: r.subcontractor,
        subBizNo: r.subBizNo || '', subCeo: r.subCeo || '',
        subManager: r.subManager || '', subManagerTel: r.subManagerTel || '',
        subBank: r.subBank || '', subAccount: r.subAccount || '', subHolder: r.subHolder || '', subAddress: r.subAddress || '',
      } : {}),
      ...(r.companyName ? { companyName: r.companyName } : {}),
    }));
    // JSON 복원 (있으면)
    // 그 회차에 저장된 내역이 비어 있으면 [내역 저장]으로 보관한 계약 내역을 대신 보여줌 (빈 표로 초기화 방지)
    const pick = (json, kind) => {
      let rows = [];
      try { rows = JSON.parse(json || '[]') || []; } catch (e) { rows = []; }
      if (rows.length) return rows;
      const rec = savedRecordsRef.current[kind];
      return (rec && Array.isArray(rec.items)) ? rec.items : rows;
    };
    setProductItems(pick(r.productItems_JSON, 'product'));
    setInstallItems(pick(r.installItems_JSON, 'install'));
    setEtcItems(pick(r.expenseItems_JSON, 'etc'));
    setCommissionItems(pick(r.commissionItems_JSON, 'commission'));
    // 🆕 항목별 "이번 회차 포함" 토글도 그 회차에 저장된 값으로 복원
    // (includeInstall 은 v3 이전엔 없던 개념이라, 과거 저장 건(undefined)은 그대로 포함으로 취급)
    setIncludeInstall(r.includeInstall !== false);
    setIncludeProduct(!!r.includeProduct);
    setIncludeCommission(!!r.includeCommission);
    setIncludeEtc(!!r.includeEtc);
    // 🆕 v3: 구분 · 항목별 금회 요청금액 · 항목별 업체명도 함께 복원
    setDocCategory(r.docCategory || 'install');
    setProductAmount(r.productAmount || '');
    setCommissionAmount(r.commissionAmount || '');
    setEtcAmount(r.etcAmount || '');
    setProductVendorName(r.productVendorName || '');
    setCommissionVendorName(r.commissionVendorName || '');
    setEtcVendorName(r.etcVendorName || '');
    setCatNotes({ ...EMPTY_NOTES, ...(r.catNotes || {}) });
    setProductSummary(r.productSummary || null);
    // 저장 당시 화면 상태 전체가 있으면 그대로 복원 (비고·비고사항·입력칸·토글·금액·업체명)
    const snap = r.snapshot;
    if (snap) {
      if (snap.form) setForm(f => ({ ...f, ...snap.form, paymentCount: String(r.roundNo || snap.form.paymentCount || f.paymentCount) }));
      if (snap.catNotes) setCatNotes({ ...EMPTY_NOTES, ...snap.catNotes });
      ['includeInstall','includeProduct','includeCommission','includeEtc'].forEach(k => {
        if (typeof snap[k] === 'boolean') ({ includeInstall: setIncludeInstall, includeProduct: setIncludeProduct, includeCommission: setIncludeCommission, includeEtc: setIncludeEtc })[k](snap[k]);
      });
      if (snap.docCategory) setDocCategory(snap.docCategory);
      if (snap.productAmount !== undefined) setProductAmount(snap.productAmount);
      if (snap.commissionAmount !== undefined) setCommissionAmount(snap.commissionAmount);
      if (snap.etcAmount !== undefined) setEtcAmount(snap.etcAmount);
      setProductVendorName(snap.productVendorName || '');
      setCommissionVendorName(snap.commissionVendorName || '');
      setEtcVendorName(snap.etcVendorName || '');
      setProductFilename(snap.productFilename || '');
      setInstallFilename(snap.installFilename || '');
    }
    toast?.(`${r.roundNo}차 회차 데이터 복원됨${r.subcontractor ? ' (지급 대상 포함)' : ''}`, 'success');
  };

  // ─── 저장된 회차(설치비 기성) 삭제 ───
  // 시트 기록·상세 JSON 은 남기고 상태만 "취소됨"으로 바꾼다(되돌릴 수 없는 영구 삭제가 아니라,
  // 잘못 저장한 회차를 목록·진행률에서 제외하는 용도) — 실수로 지운 경우 스프레드시트의
  // 지출품의서이력 시트 L열(상태)에서 직접 "정상"으로 되돌리면 복구된다.
  const handleDeleteRound = async (r) => {
    if (!r?.no) return;
    const msg = `${r.roundNo}차 · ${r.docDate || ''} 지출품의서 저장 기록을 삭제할까요?\n\n이 회차의 제품대·설치비·기타경비·영업수수료 기록이 모두 누계와 전회 기성 이력에서 빠집니다.\n(잘못 저장한 경우 · 시트의 지출품의서이력 L열을 '정상'으로 바꾸면 복구)`;
    const ok = confirmDialog ? await confirmDialog(msg) : window.confirm(msg);
    if (!ok) return;
    setDeletingRound(r.no);
    try {
      await apiClient.cancelExpenseRound({ contractNo: contract.no, no: r.no });
      const hist = await apiClient.expenseByContract(contract.no);
      setExpenseHistory(hist.history || []);
      if (hist.corrections) setCorrections(hist.corrections);
      const paid = await syncInstallPaid(hist.history || []);
      toast?.(`${r.roundNo}차 회차 삭제 완료${paid != null ? ` · 설치비 기성금액 ${paid.toLocaleString()}원으로 변경` : ''}`, 'success');
      if (paid != null) onSaved?.()?.catch?.(() => {});
      if (String(selectedRound) === String(r.no) || !selectedRound) {
        setSelectedRound('');
        setForm(f => ({ ...f, paymentCount: String(nextRoundNo(hist.history || [])) }));
      }
    } catch (e) {
      toast?.('삭제 실패: ' + errMsg(e), 'error');
    } finally {
      setDeletingRound(null);
    }
  };

  // App.jsx 에서 조건부 마운트 (contract 있을 때만) 하므로 early return 불필요
  // 방어적으로 null 만 처리 (훅은 이미 위에서 모두 호출됨)
  if (!contract) return null;

  // ─── 계산 ───
  const installTotal = installItems.reduce((s, r) => s + (Number(r.qty)||0) * (Number(r.unitPrice)||0), 0);
  const productTotal = productSummary
    ? productSummary.totalMaterial
    : productItems.reduce((s, r) => s + (Number(r.qty)||0) * (Number(r.unitPrice)||0), 0);
  const etcTotal = etcItems.reduce((s, r) => s + (Number(r.amount)||0), 0);
  const commissionTotal = commissionItems.reduce((s, r) => s + (Number(r.amount)||0), 0);
  const requestAmount = Number(form.requestAmount) || 0;
  // 🆕 v3: 제품대/영업수수료/기타경비도 설치비처럼 "금회 요청" 값을 독립적으로 입력할 수 있음
  // (품목표 합계(productTotal 등)는 내역서 합계로만 표시되고, 실제 청구액은 아래 값을 사용).
  // 값을 아직 입력하지 않았으면(빈 문자열) 품목표 합계를 기본값으로 사용.
  const productRequestAmount = productAmount !== '' ? (Number(productAmount) || 0) : productTotal;
  const commissionRequestAmount = commissionAmount !== '' ? (Number(commissionAmount) || 0) : commissionTotal;
  const etcBudgetNum = Number(etcBudget) || 0;
  const productBudgetNum = Number(productBudget) || 0;
  const installBudgetNum = Number(installBudget) || 0;
  const commissionBudgetNum = Number(commissionBudget) || 0;
  const BUDGET_META = {
    product: { field: 'productCost', label: '제품대', value: productBudgetNum },
    install: { field: 'subcontractAmount', label: '설치비(도급금액)', value: installBudgetNum },
    commission: { field: 'salesCost', label: '영업수수료', value: commissionBudgetNum },
    etc:     { field: 'incidental', label: '기타경비', value: etcBudgetNum },
  };
  const changedBudgetKeys = Object.keys(BUDGET_META).filter(k => BUDGET_META[k].value !== (baseBudgets[k] || 0));
  const etcRequestAmount = etcAmount !== '' ? (Number(etcAmount) || 0) : etcTotal;
  // 🆕 금회 요청금액(지급 총액) = 체크된 항목(설치비/제품대/영업수수료/기타경비)만 합산.
  // 체크를 끄면 해당 항목의 품목·금액은 그대로 남아있어도(참고용) 이번 회차 청구·요약에서는 빠진다.
  const grandTotal = (includeInstall ? requestAmount : 0)
    + (includeProduct ? productRequestAmount : 0)
    + (includeCommission ? commissionRequestAmount : 0)
    + (includeEtc ? etcRequestAmount : 0);

  // ─── 이전 회차 목록 (항목별 진행바용) ───
  // 설치비: 저장 시 별도 보관해둔 회차별 금회 요청금액(amount)을 그대로 사용.
  // 제품대/영업수수료/기타경비: 그 회차에 저장된 품목 리스트(JSON)의 합계를 계산해서 사용
  // (window.expenseRoundBreakdown = modal-expense-parts.jsx 의 _roundBreakdown 재사용).
  // 지금 작성 중인 회차(같은 회차번호)로 이미 저장된 기록은 '이전 지급'이 아님 → 제외
  // (같은 회차를 다시 열어 출력·재저장하면 금회 금액이 이전 누계에 한 번 더 더해지던 문제)
  const curRoundNo = Number(form.paymentCount) || 0;
  // 지금 작성·수정 중인 기록만 '이전 지급'에서 뺀다.
  //  - 전회 기성 이력에서 저장된 회차를 골랐으면 → 그 기록 한 줄만 제외
  //    (같은 회차 번호라도 업체가 달라 따로 저장된 기록은 이미 지급된 것이므로 누계에 포함)
  //  - 새로 작성 중이면 → 같은 회차 번호 기록 제외 (저장하면 그 기록을 변경 저장하므로)
  // 수기 지급이력은 회차 번호가 같아도 항상 이전 지급으로 집계
  const activeHistory = expenseHistory.filter(h => h.status !== 'cancelled' && (h.manual || (selectedRound
    ? String(h.no) !== String(selectedRound)
    : Number(h.roundNo) !== curRoundNo)));
  const breakdownOf = (h) => (window.expenseRoundBreakdown ? window.expenseRoundBreakdown(h) : { install: Number(h.amount) || 0, product: 0, commission: 0, etc: 0 });
  // 설치비도 '이번 회차 포함'을 끈 회차는 지급액 0
  const previousRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).install, no: h.no, manual: h.manual, note: h.manual ? h.note : '' }))
    .filter(r => r.amount > 0);
  const productRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).product, no: h.no, manual: h.manual, note: h.manual ? h.note : '' }))
    .filter(r => r.amount > 0);
  const commissionRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).commission, no: h.no, manual: h.manual, note: h.manual ? h.note : '' }))
    .filter(r => r.amount > 0);
  const etcRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).etc, no: h.no, manual: h.manual, note: h.manual ? h.note : '' }))
    .filter(r => r.amount > 0);

  // 수기 지급이력을 회차 이력에 합침 (출력물·누계용)
  const withManual = (k, list) => [...list, ...((manualHist[k] || []).filter(m => Number(m.amount) > 0)
    .map(m => ({ roundNo: Number(m.roundNo) || 0, docDate: m.docDate, amount: Number(m.amount) || 0, manual: true, note: m.note })))]
    .sort((x, y) => (x.roundNo - y.roundNo) || String(x.docDate || '').localeCompare(String(y.docDate || '')));

  // 설치비 업체를 목록에서 고르면 지급 대상(도급업체) 정보도 그 업체로 채움 (계좌 오입금 방지: 없는 값은 빈칸)
  const pickInstallVendor = (name) => {
    const v = ((data && data.subcontractors) || []).find(x => x && String(x.name || '').trim() === name) || null;
    setForm(f => v ? {
      ...f, subName: name, subBizNo: v.bizNo || '', subCeo: v.ceo || '', subAddress: v.address || '',
      subManager: v.manager || '', subManagerTel: v.tel || '', subBank: v.bank || '', subAccount: v.account || '', subHolder: v.holder || '',
    } : { ...f, subName: name });
  };

  // 업체명 아래 한 줄 정보 (대표자·사업자번호·계좌): 저장된 업체 목록에서 찾음
  const vendorDetailOf = (name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    const v = ((data && data.subcontractors) || []).find(x => x && String(x.name || '').trim() === n);
    return v ? { ceo: v.ceo, bizNo: v.bizNo, bank: v.bank, account: v.account, holder: v.holder } : null;
  };
  // 설치비는 지급 대상(도급업체) 칸에 입력된 값
  const installVendorDetail = form.subName ? { ceo: form.subCeo, bizNo: form.subBizNo, bank: form.subBank, account: form.subAccount, holder: form.subHolder } : null;

  // 업체 드롭다운: 도급업체 관리에 저장된 업체 + 이전 지출품의서에서 쓴 업체명 + 이번 창에서 저장한 업체
  const vendorOptions = [...new Set([
    ...((data && data.subcontractors) || []).map(v => v && v.name),
    ...expenseHistory.flatMap(h => [h.productVendorName, h.etcVendorName, h.commissionVendorName, h.subcontractor]),
    ...savedVendorNames,
  ].map(v => String(v || '').trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'ko'));

  // 계약금 · 중도금 · 잔금 분류 (1회차=계약금 · 잔금 남은 추가입금=중도금 합산)
  const paySplit = window.classifyPayments(contract.totalAmount, payments || [], contract.paidAmount);

  // 수금 총액 (있으면)
  const paidTotal = contract.paidAmount || 0;
  const paidPct = contract.totalAmount > 0 ? (paidTotal / contract.totalAmount * 100) : 0;

  // ─── 임포트 ───
  const errMsg = (e) => (e?.message || String(e || '알 수 없는 오류'));

  // 🆕 v3: 항목별 기성 카드의 "💾 업체정보 저장" 버튼
  // - 설치비 카드: 지급대상(도급업체) 섹션에서 입력한 전체 상세정보(사업자번호·담당자·계좌 등)를
  //   도급업체 등록 시트 + 거래처관리 시트에 저장 (v2 이전엔 지급대상 섹션 상단 버튼이 하던 일)
  const handleSaveFullVendor = async () => {
    if (!form.subName || !form.subName.trim()) { toast?.('업체명을 입력하거나 선택하세요', 'error'); return; }
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setSavingVendorCat('install');
    try {
      const res = await apiClient.saveSubcontractor({
        name: form.subName.trim(), bizNo: form.subBizNo || '', ceo: form.subCeo || '',
        address: form.subAddress || '', manager: form.subManager || '', tel: form.subManagerTel || '',
        bank: form.subBank || '', account: form.subAccount || '', holder: form.subHolder || '',
      });
      const isNew = res?.result?.registry === 'created' || res?.result?.partner === 'created';
      toast?.(`"${form.subName}" 업체 정보 저장 완료${isNew ? ' (신규 등록)' : ' (갱신)'}`, 'success');
      window.refreshData?.().catch(() => {});
    } catch (e) {
      toast?.('업체 정보 저장 실패: ' + errMsg(e), 'error');
    } finally { setSavingVendorCat(null); }
  };
  // - 제품대/영업수수료/기타경비 카드: 업체명만 도급업체 등록 시트에 가볍게 저장(참고용 등록).
  //   카테고리별로 지급처가 다를 수 있어 이름만 별도 등록 — 상세정보(계좌 등)는 지급대상 섹션의
  //   기본 도급업체 정보를 함께 참고해 사용한다.
  // 지급 대상(도급업체) 칸의 모든 정보를 도급업체 목록에 저장
  const handleSaveSubcontractorInfo = async () => {
    const name = String(form.subName || '').trim();
    if (!name) { toast?.('업체명을 입력하세요', 'error'); return; }
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setSavingVendorCat('main');
    try {
      await apiClient.saveSubcontractor({
        name, bizNo: form.subBizNo || '', ceo: form.subCeo || '', address: form.subAddress || '',
        manager: form.subManager || '', tel: form.subManagerTel || '',
        bank: form.subBank || '', account: form.subAccount || '', holder: form.subHolder || '',
      });
      setSavedVendorNames(v => v.includes(name) ? v : [...v, name]);
      toast?.(`"${name}" 업체정보를 저장했습니다`, 'success');
      await onSaved?.();
    } catch (e) {
      toast?.('업체 정보 저장 실패: ' + errMsg(e), 'error');
    } finally { setSavingVendorCat(null); }
  };

  const handleSaveCategoryVendorName = async (catKey, name, label) => {
    if (!name || !name.trim()) { toast?.('업체명을 입력하세요', 'error'); return; }
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setSavingVendorCat(catKey);
    try {
      // 이미 등록된 업체면 기존 정보(대표자·계좌 등)를 함께 보내 지워지지 않게 함
      const known = ((data && data.subcontractors) || []).find(v => v && String(v.name || '').trim() === name.trim()) || {};
      await apiClient.saveSubcontractor({ ...known, name: name.trim() });
      setSavedVendorNames(v => v.includes(name.trim()) ? v : [...v, name.trim()]);   // 드롭다운에 바로 추가
      toast?.(`"${name}" ${label} 업체정보 저장 완료`, 'success');
      window.refreshData?.().catch(() => {});
    } catch (e) {
      toast?.('업체 정보 저장 실패: ' + errMsg(e), 'error');
    } finally { setSavingVendorCat(null); }
  };

  // Drive 피커를 열기 전에 이 계약의 Drive 현장 폴더(카테고리 하위 폴더)를 먼저 찾아서
  // (없으면 자동 생성) 그 폴더로 스코프된 피커를 연다 — 전체 Drive에서 찾을 필요 없이
  // 이 프로젝트 폴더 안의 파일만 바로 보이게 하기 위함. 폴더를 못 찾아도(권한/네트워크 등)
  // 가져오기 자체는 막지 않고 전체 Drive 검색으로 조용히 폴백한다.
  const pickFromDriveScoped = async (categoryKey, title) => {
    let folderId = null;
    try {
      if (window.hasDriveCredentials?.()) {
        const { category } = await window.findOrCreateCategoryFolder(contract, categoryKey);
        folderId = category?.id || null;
      }
    } catch (e) { /* 폴더 탐색 실패 시 전체 Drive 검색으로 폴백 */ }
    return pickFromDrive({ folderId, title });
  };

  // PC(로컬)에서 불러온 파일을 이 계약의 Drive 카테고리 폴더에 조용히 자동 저장한다.
  // (요청: "PC에서 업로드 할때는 구글드라이브에 자동 저장해줘") — Drive 인증 정보가 없거나
  // 업로드가 실패해도 가져오기 자체(항목 파싱)는 이미 끝난 뒤이므로 조용히 무시하고,
  // 성공하면 "🔗 파일 열기" 버튼이 그 Drive 파일을 가리키도록 url 만 돌려준다.
  const autoSaveLocalFileToDrive = async (categoryKey, blob, filename) => {
    if (!window.hasDriveCredentials?.()) return null;
    try {
      const { file } = await window.uploadFileToCategory(contract, categoryKey, blob, filename);
      return file?.url || file?.webViewLink || null;
    } catch (e) {
      console.warn('[autoSaveLocalFileToDrive]', e);
      return null;
    }
  };

  const importInstallXlsx = async (mode) => {
    setImporting('install-' + mode);
    try {
      const picker = mode === 'drive'
        ? () => pickFromDriveScoped('install', `설치비 내역서 선택 — ${contract.projectName || ''}`)
        : pickFromLocal;
      const picked = await picker();
      if (!picked?.blob) throw new Error('파일을 가져오지 못했습니다');
      const { firstSheet } = await xlsxToSheets(picked.blob);
      const items = parseInstallXlsx(firstSheet);
      if (items.length === 0) throw new Error('가져올 항목이 없습니다.');
      setInstallItems(items);
      setInstallFilename(picked.filename);
      if (mode === 'drive') {
        setInstallFileUrl(picked.url || '');
        toast?.(`설치비 ${items.length}건 임포트`, 'success');
      } else {
        setInstallFileUrl('');
        const driveUrl = await autoSaveLocalFileToDrive('install', picked.blob, picked.filename);
        setInstallFileUrl(driveUrl || '');
        toast?.(`설치비 ${items.length}건 임포트` + (driveUrl ? ' · Drive에 자동 저장됨' : ''), 'success');
      }
    } catch (e) {
      if (!/취소/.test(errMsg(e))) toast?.('가져오기 실패: ' + errMsg(e), 'error');
    } finally { setImporting(null); }
  };

  const importProductXlsx = async (mode) => {
    setImporting('product-' + mode);
    try {
      const picker = mode === 'drive'
        ? () => pickFromDriveScoped('product', `제품 내역서 선택 — ${contract.projectName || ''}`)
        : pickFromLocal;
      const picked = await picker();
      if (!picked?.blob) throw new Error('파일을 가져오지 못했습니다');
      const { firstSheet } = await xlsxToSheets(picked.blob);
      const { items, summary } = parseProductXlsx(firstSheet);
      if (items.length === 0) throw new Error('가져올 항목이 없습니다.');
      setProductItems(items.map(it => ({
        name: it.name, model: it.model, unit: it.unit,
        qty: String(it.qty), unitPrice: String(it.unitPrice),
        listPrice: String(it.listPrice || ''), dcRate: it.dcRate || 0,
      })));
      setProductSummary(summary);
      setProductFilename(picked.filename);
      if (mode === 'drive') {
        setProductFileUrl(picked.url || '');
        toast?.(`제품 ${items.length}건 임포트 (재료비 ${Math.round(summary.totalMaterial).toLocaleString()}원)`, 'success');
      } else {
        setProductFileUrl('');
        const driveUrl = await autoSaveLocalFileToDrive('product', picked.blob, picked.filename);
        setProductFileUrl(driveUrl || '');
        toast?.(`제품 ${items.length}건 임포트 (재료비 ${Math.round(summary.totalMaterial).toLocaleString()}원)` + (driveUrl ? ' · Drive에 자동 저장됨' : ''), 'success');
      }
    } catch (e) {
      if (!/취소/.test(errMsg(e))) toast?.('가져오기 실패: ' + errMsg(e), 'error');
    } finally { setImporting(null); }
  };

  // ─── 설치비/제품 내역서 — Google Drive에 "기본 양식" 새 파일 만들기 ───
  // 현장 폴더에 아직 내역서 파일이 없을 때, 정해진 기본 양식(빈 표) 파일을
  // 해당 계약의 Drive 카테고리 폴더(설치비및부대비용/제품대)에 새로 생성해준다.
  // 만든 파일을 열어 값을 채운 뒤에는 위 "📁 Drive" 버튼으로 다시 불러오면 된다.
  const createTemplateInDrive = async (kind) => {
    // kind: 'install' | 'product'
    if (!window.hasDriveCredentials?.()) {
      toast?.('Google Drive 인증 정보가 없어 새 양식 파일을 만들 수 없습니다. 설정 화면에서 등록해주세요.', 'error');
      return;
    }
    const busyKey = kind + '-template';
    setImporting(busyKey);
    try {
      const templateUrl = kind === 'install' ? 'assets/templates/install-template.xlsx' : 'assets/templates/product-template.xlsx';
      const res = await fetch(templateUrl);
      if (!res.ok) throw new Error('기본 양식 파일을 불러오지 못했습니다.');
      const blob = await res.blob();
      const label = kind === 'install' ? '설치비 내역서' : '제품내역서';
      const dateStr = form.docDate || new Date().toISOString().slice(0, 10);
      const filename = `${contract.projectName || '프로젝트'} ${label} (${dateStr}).xlsx`;
      const { file } = await window.uploadFileToCategory(contract, kind, blob, filename);
      const url = file?.url || file?.webViewLink || '';
      if (kind === 'install') setInstallFileUrl(url); else setProductFileUrl(url);
      toast?.(`${label} 기본 양식 파일을 Drive에 만들었습니다. 열어서 값을 채운 뒤 "📁 Drive" 버튼으로 다시 불러오세요.`, 'success');
      if (url) window.open(url, '_blank');
    } catch (e) {
      toast?.('새 양식 파일 생성 실패: ' + errMsg(e), 'error');
    } finally { setImporting(null); }
  };

  // ─── 계약 총액(제품대·설치비·기타경비) 계약관리 시트에 반영 ───
  const saveBudgets = async (keys, { silent } = {}) => {
    if (!keys.length) return [];
    const patch = {};
    keys.forEach(k => { patch[BUDGET_META[k].field] = BUDGET_META[k].value; });
    await apiClient.updateContract(contract.no, patch);
    setBaseBudgets(b => { const n = { ...b }; keys.forEach(k => { n[k] = BUDGET_META[k].value; }); return n; });
    const labels = keys.map(k => BUDGET_META[k].label);
    if (!silent) { toast?.(`계약 ${labels.join('·')} 금액을 저장했습니다`, 'success'); onSaved?.()?.catch?.(() => {}); }
    return labels;
  };
  const budgetBanner = (k, extra) => {
    const m = BUDGET_META[k];
    const changed = m.value !== (baseBudgets[k] || 0);
    const editable = typeof canEdit !== 'function' || canEdit();
    if (!(changed && editable) && !extra) return null;
    return (
      <div style={{display:'flex', alignItems:'center', gap:8, margin:'0 0 8px', padding:'7px 10px', background:'#FFF8E6', border:'1px solid #F0D9A0', borderRadius:6, fontSize:11.5, flexWrap:'wrap'}}>
        {changed && editable ? (<>
          <span style={{flex:1, minWidth:220}}>{m.label} 총액 {(baseBudgets[k] || 0).toLocaleString()}원 → <b>{m.value.toLocaleString()}원</b> (출력물에는 바로 반영 · 지출품의서 [저장] 시 계약에도 반영)</span>
          <button type="button" disabled={!!savingBudgetKey} onClick={async () => {
            setSavingBudgetKey(k);
            try { await saveBudgets([k]); } catch (e) { toast?.('저장 실패: ' + errMsg(e), 'error'); }
            finally { setSavingBudgetKey(null); }
          }} style={{padding:'4px 10px', fontSize:11, fontWeight:700, background:'var(--bronze-600, #8f6d3a)', color:'#fff', border:0, borderRadius:5, cursor:'pointer'}}>
            {savingBudgetKey === k ? '저장 중…' : '지금 계약에 저장'}
          </button>
        </>) : <span style={{flex:1}}/>}
        {extra}
      </div>
    );
  };

  // ─── 저장 / 출력 / PDF 다운로드 ───
  const buildPayload = () => ({
    contractNo: contract.no,
    roundNo: Number(form.paymentCount) || 1,
    docDate: form.docDate,
    manager: form.manager,
    subcontractor: form.subName || contract.subcontractor,
    subBizNo: form.subBizNo,
    subCeo: form.subCeo,
    companyName: form.companyName,
    subManager: form.subManager,
    subManagerTel: form.subManagerTel,
    subBank: form.subBank,
    subAccount: form.subAccount,
    subHolder: form.subHolder,
    subAddress: form.subAddress,
    amount: requestAmount,
    prevProgress: Number(form.prevProgress) || 0,
    commission: commissionRequestAmount,
    etcCost: etcRequestAmount,
    note: form.note,
    attachments: form.attachments,
    installItems: installItems.filter(r => r.name),
    productItems: productItems.filter(r => r.name),
    productSummary,
    expenseItems: etcItems.filter(r => r.name),
    commissionItems: commissionItems.filter(r => r.name),
    grandTotal,
    // 🆕 항목별 기성 관리 — 이번 회차에 실제로 포함된(청구되는) 항목 표시
    includeInstall, includeProduct, includeCommission, includeEtc,
    // 🆕 v3: 구분(대표 항목) · 제품대 금회 요청금액 · 항목별 업체명 오버라이드
    docCategory, productAmount: productRequestAmount,
    productVendorName, commissionVendorName, etcVendorName,
    catNotes,
    // 저장 당시 화면 상태 전체 — 차수를 다시 고르면 그대로 복원
    snapshot: {
      form: { ...form },
      catNotes: { ...catNotes },
      includeInstall, includeProduct, includeCommission, includeEtc,
      docCategory, productAmount, commissionAmount, etcAmount,
      productVendorName, commissionVendorName, etcVendorName,
      productFilename, installFilename,
    },
  });

  const handleSave = async () => {
    if (!hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    const payload = buildPayload();
    // 같은 차수에 이미 저장된 자료가 있으면 변경 저장 확인
    const sameRound = expenseHistory.filter(h => h.status !== 'cancelled' && !h.manual && Number(h.roundNo) === Number(payload.roundNo));
    if (sameRound.length) {
      const ex = sameRound.find(h => String(h.no) === String(selectedRound)) || sameRound[sameRound.length - 1];
      const msg = `${payload.roundNo}차에 이미 저장된 자료가 있습니다.\n(작성일 ${ex.docDate || '-'} · 설치비 ${Math.round(ex.amount || 0).toLocaleString()}원)\n\n현재 화면 내용으로 변경 저장할까요?`;
      const ok = confirmDialog ? await confirmDialog(msg) : window.confirm(msg);
      if (!ok) return;
      payload.replaceNo = ex.no;
    }
    setSaving(true);
    try {

      // Drive 증빙 파일 업로드 (자격 증명 있을 때만)
      if (window.hasDriveCredentials?.() && (etcItems.length > 0 || commissionItems.length > 0)) {
        const receiptFiles = [];
        [...etcItems, ...commissionItems].forEach((item, idx) => {
          if (item.receipt?._localFile && !item.receipt?.driveId) {
            receiptFiles.push({
              blob: item.receipt._localFile,
              filename: item.receipt.name,
              _itemRef: item,  // 나중에 업데이트용
            });
          }
        });
        if (receiptFiles.length > 0) {
          try {
            toast?.(`증빙 ${receiptFiles.length}건 Drive 업로드 중…`, 'default');
            const up = await window.uploadExpenseReceipts(
              contract, payload.roundNo, payload.docDate,
              receiptFiles.map(f => ({ blob: f.blob, filename: f.filename }))
            );
            // 업로드 결과를 각 항목에 반영
            up.uploaded.forEach((f, i) => {
              const item = receiptFiles[i]._itemRef;
              if (item) item.receipt = { ...item.receipt, driveId: f.id, driveUrl: f.url };
            });
            payload.receiptsFolderId = up.folder?.id || null;
            payload.expenseItems = etcItems.filter(r => r.name);
            payload.commissionItems = commissionItems.filter(r => r.name);
            if (up.failed.length > 0) {
              toast?.(`증빙 ${up.failed.length}건 업로드 실패 (${up.failed[0].error})`, 'error');
            }
          } catch (e) {
            console.error('[증빙 업로드]', e);
            toast?.('증빙 Drive 업로드 실패: ' + errMsg(e), 'error');
          }
        }
      }

      try {
        const res = await apiClient.saveExpense(payload);
        const syncedFields = res?.contractSync?.updated || [];
        // 화면에서 고친 제품대·설치비·기타경비 총액을 계약(상세 화면 금액)에도 반영
        let budgetLabels = [];
        if (changedBudgetKeys.length && (typeof canEdit !== 'function' || canEdit())) {
          try { budgetLabels = await saveBudgets(changedBudgetKeys, { silent: true }); }
          catch (e) { toast?.('계약 금액 반영 실패: ' + errMsg(e), 'error'); }
        }
        const head = `${payload.roundNo}차 ${res?.entry?.updated ? '변경 저장 완료' : '저장 완료'}`;
        // 이력 재로드 — 방금 저장한 차수를 드롭목록에 선택된 상태로 + 설치비 기성금액(누계) 계약에 반영
        let paid = null;
        try {
          const r = await apiClient.expenseByContract(contract.no);
          setExpenseHistory(r.history || []);
          if (r.corrections) setCorrections(r.corrections);
          if (res?.entry?.no) setSelectedRound(String(res.entry.no));
          paid = await syncInstallPaid(r.history || []);
        } catch { /* 이력 재로드 실패는 무시 */ }
        const synced = [...syncedFields.map(f => FIELD_LABELS_KO[f] || f), ...budgetLabels];
        if (paid != null) synced.push(`설치비 기성금액 ${paid.toLocaleString()}원`);
        toast?.(
          synced.length
            ? `${head} (계약 반영: ${[...new Set(synced)].join(', ')})`
            : head,
          'success'
        );
        // 계약의 설치비/제품대/영업수수료/기타경비가 동기화됐을 수 있으므로
        // 대시보드 전체 데이터(계약 상세 화면 등)도 함께 새로고침
        onSaved?.().catch?.(() => {});
      } catch (e) {
        const msg = errMsg(e);
        // GAS 재배포가 안 된 경우 안내
        // (서버가 saveExpense 라우트를 모르는 옛 배포일 때만 — 다른 저장 오류를 재배포 안내로 오인하지 않도록 범위를 좁힘)
        if (/알 수 없는 라우트|UNKNOWN_ROUTE/i.test(msg)) {
          toast?.(
            '⚠️ Apps Script 재배포가 필요합니다 (' + msg.replace(/^.*라우트:\s*/, '').split(/\s/)[0] + ' 기능 없음). Apps Script 편집기에서 DashboardApi.gs 를 최신본으로 교체 후 "배포 관리 → 새 버전"으로 배포해주세요.',
            'error'
          );
          console.error('[saveExpense] GAS 재배포 필요:', msg);
        } else if (/ExpenseRequest\.gs/.test(msg)) {
          toast?.('⚠️ ExpenseRequest.gs 도 GAS 프로젝트에 붙여넣어야 합니다.', 'error');
        } else {
          toast?.('저장 실패: ' + msg, 'error');
        }
      }
    } catch (e) {
      toast?.('저장 실패: ' + errMsg(e), 'error');
    } finally { setSaving(false); }
  };

  // ─── 인쇄물 (A4 세로) ───
  // 화면 입력값을 A4 세로 인쇄용 독립 문서(HTML)로 변환
  const buildPrintHtml = () => window.buildExpensePrintHtml({
    // 기타경비 총액은 화면에서 수정한 값으로 출력
    contract: { ...contract, incidental: etcBudgetNum, productCost: productBudgetNum, subcontractAmount: installBudgetNum, salesCost: commissionBudgetNum }, form,
    subcontractors: (data && data.subcontractors) || [],   // 항목별 업체 정보 조회용
    koreanAmount: numberToKoreanAmount(grandTotal),
    requestAmount, etcTotal: etcRequestAmount, commissionTotal: commissionRequestAmount, grandTotal,
    installItems, productItems, productSummary, productTotal, productAmount: productRequestAmount,
    etcItems, commissionItems,
    rounds: markCorrected('install', withManual('install', previousRounds)),
    // 🆕 항목별(설치비/제품대/영업수수료/기타경비) 회차 이력 + 이번 회차 포함 여부 (수기 지급이력 포함, 정정된 회차 표시)
    productRounds: markCorrected('product', withManual('product', productRounds)),
    commissionRounds: markCorrected('commission', withManual('commission', commissionRounds)),
    etcRounds: markCorrected('etc', withManual('etc', etcRounds)),
    // v3.17 · 자금 확인(발주처 입금 누계) · 비고 자동 문구(정정 반영)
    received: paidTotal,
    corrections: printCorrections,
    includeInstall, includeProduct, includeCommission, includeEtc,
    // 🆕 v3: 카테고리별 업체명 오버라이드(지정 안 하면 출력에서 기본 도급업체 정보를 그대로 사용)
    productVendorName, commissionVendorName, etcVendorName,
    catNotes,
    companyName: form.companyName,   // 작성자가 선택·수정한 출력용 회사명
    paySplit,
  });

  const validatePrint = () => {
    if (!form.docSubject) {
      toast?.('품의제목 접미어를 입력하세요 (예: 설치비 지급요청의 건)', 'error');
      return false;
    }
    return true;
  };

  const handlePreview = () => {
    if (!validatePrint()) return;
    setPrintHtml(buildPrintHtml());
    setPreviewMode(true);
  };

  // 출력 - A4 세로 문서를 숨은 iframe 으로 인쇄 (앱 화면 CSS 와 분리)
  const handlePrint = async () => {
    if (!validatePrint()) return;
    setPrinting(true);
    try {
      await window.printExpenseHtml(buildPrintHtml());
    } catch (e) {
      toast?.('출력 실패: ' + errMsg(e), 'error');
    } finally {
      setTimeout(() => setPrinting(false), 400);
    }
  };

  // 미리보기 모드 해제
  const exitPreview = () => setPreviewMode(false);

  // [📄 PDF 다운로드] — 화면 [🖨️ 출력] 과 같은 새 양식을 Apps Script 가 A4 PDF 로 변환 (v3.18)
  const handlePdfDownload = async () => {
    if (!hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    if (!validatePrint()) return;
    setGeneratingPdf(true);
    try {
      const roundNo = Number(form.paymentCount) || 1;
      const docsHtml = await window.buildExpenseDocsHtml(buildPrintHtml());
      const safe = (v) => String(v || '').replace(/[\\/:*?"<>|]/g, '_').trim();
      const fileName = `지출품의서_${safe(contract.projectName) || contract.no}_${roundNo}차`;
      const res = await apiClient.generateExpensePdfFromHtml({ contractNo: contract.no, html: docsHtml, fileName });
      if (!res.pdf?.base64) throw new Error('PDF 생성 실패');
      const bin = atob(res.pdf.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.pdf.fileName || `${fileName}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast?.('PDF 다운로드 완료', 'success');

      // Drive 자동 업로드 (자격 증명 있을 때만)
      if (window.hasDriveCredentials?.()) {
        try {
          await window.uploadExpensePdf(contract, roundNo, form.docDate, blob);
          toast?.('Drive 지출품의서 폴더에도 저장됨', 'success');
        } catch (e) {
          console.warn('[PDF Drive 업로드]', e);
          toast?.('Drive 업로드는 실패 (PDF는 다운로드됨): ' + errMsg(e), 'default');
        }
      }
    } catch (e) {
      const msg = errMsg(e);
      if (/UNKNOWN_ROUTE|알 수 없는 라우트/i.test(msg)) {
        toast?.('⚠️ Apps Script 재배포가 필요합니다 (새 PDF 양식 기능 없음). DashboardApi.gs·Auth.gs 를 최신본으로 바꾼 뒤 "배포 관리 → 새 버전"으로 배포해 주세요. 그 전에는 [🖨️ 출력] → PDF로 저장을 사용하세요.', 'error');
      } else if (/Drive API|서비스/.test(msg)) {
        toast?.('⚠️ ' + msg, 'error');
      } else {
        toast?.('PDF 생성 실패: ' + msg, 'error');
      }
    } finally { setGeneratingPdf(false); }
  };

  // ─── 스타일 ───
  const _labelSt = {display:'block', fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.03em', marginBottom:3};
  const _inputSt = {width:'100%', padding:'7px 10px', fontSize:12, border:'1px solid var(--line)', borderRadius:6, background:'#fff', outline:'none', fontFamily:'inherit', boxSizing:'border-box'};

  const busy = saving || previewing || printing || generatingPdf;

  // 🆕 v3: "구분" 드롭다운이 가리키는 항목의 라벨/금액/변경 핸들러 — 상단 "금회 요청금액 (구분)"
  // 필드가 이 값을 그대로 미러링한다 (실제 항목별 포함 여부는 아래 4개 카드에서 각각 체크).
  const DOC_CATEGORY_META = {
    install: { label: '설치비', amount: form.requestAmount, onChange: v => setForm({...form, requestAmount: v}), accent: ACCENT_THEME.green },
    product: { label: '제품대', amount: productAmount !== '' ? productAmount : productRequestAmount, onChange: setProductAmount, accent: ACCENT_THEME.blue },
    commission: { label: '영업수수료', amount: commissionAmount !== '' ? commissionAmount : commissionRequestAmount, onChange: setCommissionAmount, accent: ACCENT_THEME.plum },
    etc: { label: '기타경비', amount: etcAmount !== '' ? etcAmount : etcRequestAmount, onChange: setEtcAmount, accent: ACCENT_THEME.bronze },
  };
  const docCatMeta = DOC_CATEGORY_META[docCategory] || DOC_CATEGORY_META.install;

  // ─── v3.17 · Linear 화면용 계산 ───
  // 각 항목 '금회' 입력칸 값 (비워두면 품목표 합계)
  const catCurrentInput = {
    product: productAmount !== '' ? productAmount : productRequestAmount,
    install: form.requestAmount,
    etc: etcAmount !== '' ? etcAmount : etcRequestAmount,
    commission: commissionAmount !== '' ? commissionAmount : commissionRequestAmount,
  };
  const CAT_DEFS = [
    { key:'product',    name:'제품대',   included: includeProduct,    total: productBudgetNum,    rounds: productRounds,    vendor: productVendorName },
    { key:'install',    name:'설치비',   included: includeInstall,    total: installBudgetNum,    rounds: previousRounds,   vendor: form.subName },
    { key:'etc',        name:'기타경비', included: includeEtc,        total: etcBudgetNum,        rounds: etcRounds,        vendor: etcVendorName },
    { key:'commission', name:'영업수수료', included: includeCommission, total: commissionBudgetNum, rounds: commissionRounds, vendor: commissionVendorName },
  ];
  const catStats = {};
  CAT_DEFS.forEach(k => {
    catStats[k.key] = window.computeCategoryStats({ totalAmount: k.total, rounds: k.rounds, manualRows: manualHist[k.key], included: k.included, currentAmount: catCurrentInput[k.key] });
  });
  const prevAll = CAT_DEFS.reduce((s, k) => s + catStats[k.key].prevSum, 0);
  const afterAll = CAT_DEFS.reduce((s, k) => s + catStats[k.key].finalCum, 0);
  const segs = CAT_DEFS.filter(k => k.included && catStats[k.key].curAmt > 0).map(k => ({
    key: k.key, name: k.name, color: EXPENSE_CAT_COLOR[k.key], amt: catStats[k.key].curAmt,
    w: (grandTotal > 0 ? catStats[k.key].curAmt / grandTotal * 100 : 0).toFixed(1) + '%',
  }));
  const contractTotal = Number(contract.totalAmount) || 0;
  const costTotal = productBudgetNum + installBudgetNum + etcBudgetNum + commissionBudgetNum;
  const profit = contractTotal - costTotal;
  const received = Number(paidTotal) || 0;
  const cushion = received - afterAll;
  const won = (v) => Math.round(Math.abs(v)).toLocaleString('ko-KR');
  const alerts = [];
  if (!(form.docSubject || '').trim()) alerts.push('품의제목이 비어 있어 출력·미리보기를 할 수 없습니다.');
  if (grandTotal <= 0) alerts.push('이번 회차에 포함된 금액이 없습니다. 청구할 항목을 체크하고 금회 금액을 입력하세요.');
  CAT_DEFS.forEach(k => {
    const s = catStats[k.key];
    if (k.included && !String(k.vendor || '').trim()) alerts.push(`${k.name} 업체명이 지정되지 않았습니다.`);
    if (k.included && s.curAmt <= 0) alerts.push(`${k.name}이(가) 포함되어 있지만 금회 금액이 0원입니다.`);
    if (s.over) alerts.push(`${k.name} 금회 누계가 금액보다 ${won(s.finalCum - s.total)}원 많습니다.`);
    // 금액은 들어 있는데 '이번 회차 제외' — 지급했다면 체크해야 누계에 들어감
    // (저장된 회차를 열었을 때, 또는 새 회차에서 금액을 직접 입력했을 때만 — 내역서 합계만 있는 경우는 제외)
    const typed = { product: productAmount, etc: etcAmount, commission: commissionAmount, install: '' }[k.key];
    const amt = Number(catCurrentInput[k.key]) || 0;
    if (!k.included && amt > 0 && (selectedRound || String(typed ?? '') !== '')) {
      alerts.push(`${k.name} 금액 ${won(amt)}원이 입력돼 있지만 '이번 회차 제외' 상태라 누계에 들어가지 않습니다. 지급했다면 체크하세요.`);
    }
  });
  if (contractTotal > 0 && cushion < 0) alerts.push(`지급 후 누적 지급이 발주처 입금 누계보다 ${won(cushion)}원 많습니다.`);

  // ─── 지난 회차 정정 (관리자) ───
  const canCorrect = typeof isAdmin === 'function' && isAdmin();
  const _CAT_LABEL = { product:'제품대', install:'설치비', etc:'기타경비', commission:'영업수수료' };
  const _shortDate = (d) => d ? String(d).slice(5, 10).replace('-', '.') : '-';
  const correctionsOf = (key) => (corrections || []).filter(k => k.category === key).map(k => {
    const parts = [];
    if (Number(k.beforeAmount) !== Number(k.afterAmount)) parts.push(`금액 ${Math.round(Number(k.beforeAmount) || 0).toLocaleString()} → ${Math.round(Number(k.afterAmount) || 0).toLocaleString()}`);
    if (String(k.beforeDate || '') !== String(k.afterDate || '')) parts.push(`지급일 ${_shortDate(k.beforeDate)} → ${_shortDate(k.afterDate)}`);
    return { ...k, change: parts.join(' · ') || '변경 없음' };
  });
  // 출력물: 정정된 회차 표시 · 비고 자동 문구
  const markCorrected = (key, list) => list.map(r => ({ ...r, corrected: (corrections || []).some(k => k.category === key && (r.manual
    ? (k.kind === 'manual' && Number(k.roundNo) === Number(r.roundNo))
    : (k.kind === 'doc' && String(k.no) === String(r.no)))) }));
  const printCorrections = ['product', 'install', 'etc', 'commission'].flatMap(key => correctionsOf(key)
    .map(k => ({ text: `${k.roundNo}차 ${_CAT_LABEL[key]} 정정 반영: ${k.change} (${k.at}${k.reason ? ', ' + k.reason : ''})` })));
  // 수기 지급이력 다시 불러오기 (정정 후)
  const reloadManual = async (kind) => {
    const r = await apiClient.getContractItems(contract.no);
    const v = (r.items || {})[kind];
    const rec = Array.isArray(v) ? { items: v } : (v || null);
    if (rec) savedRecordsRef.current[kind] = rec;
    const list = ((rec && rec.history) || []).map(m => ({ roundNo: String(m.roundNo ?? ''), docDate: m.docDate || '', amount: m.amount === 0 || m.amount ? String(m.amount) : '', note: m.note || '' }));
    setManualHist(h => ({ ...h, [kind]: list }));
    if (r.savedAt && r.savedAt[kind]) setHistSavedAt(s => ({ ...s, [kind]: r.savedAt[kind] }));
    return (rec && rec.history) || [];
  };
  const handleCorrect = async (p) => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) throw new Error('API URL이 설정되지 않았습니다');
    try {
      await apiClient.correctExpenseRound({ contractNo: contract.no, ...p });
    } catch (e) {
      const msg = errMsg(e);
      if (/UNKNOWN_ROUTE|알 수 없는 라우트/i.test(msg)) throw new Error('Apps Script 재배포가 필요합니다 (기성 정정 기능 없음). DashboardApi.gs·Auth.gs 를 최신본으로 바꾼 뒤 "배포 관리 → 새 버전"으로 배포해 주세요.');
      throw new Error(msg);
    }
    const r = await apiClient.expenseByContract(contract.no);
    setExpenseHistory(r.history || []);
    setCorrections(r.corrections || []);
    let manualInstall;
    if (p.kind === 'manual') {
      const h = await reloadManual(p.category);
      if (p.category === 'install') manualInstall = h;
    }
    const paid = p.category === 'install' ? await syncInstallPaid(r.history || [], manualInstall) : null;
    toast?.(`${p.roundNo}차 ${_CAT_LABEL[p.category] || ''} 정정 완료${paid != null ? ` · 설치비 기성금액 ${paid.toLocaleString()}원 반영` : ''}`, 'success');
    if (paid != null) onSaved?.()?.catch?.(() => {});
  };

  return (
    <>
    {/* 출력 미리보기 · A4 세로 용지 모양 */}
    {previewMode && (
      <window.ExpensePrintPreview
        html={printHtml}
        printing={printing}
        onPrint={handlePrint}
        onClose={exitPreview}
      />
    )}
    <Modal
      open={open}
      onClose={onClose}
      width="wide"
      title="지출품의서"
      subtitle={`계약 ${contractCode(contract)} · ${contract.projectName}`}
      footer={
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', gap:8, flexWrap:'wrap'}}>
          <div className="xp-foot-note" style={{fontSize:11, color:'var(--ink-3)'}}>
            <span style={{color:'var(--pos)', fontWeight:700}}>●</span>
            {' '}저장하면 이력에 기록됩니다. 출력·PDF는 재출력 가능.
          </div>
          <div className="xp-foot-btns" style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end'}}>
            <button className="btn-ghost" onClick={onClose} disabled={busy}>취소</button>
            <button
              className="btn-ghost"
              onClick={handleSave}
              disabled={busy}
              title="지출품의서이력 시트에 저장"
              style={{color:'var(--green-800)', borderColor:'var(--green-700)', fontWeight:700}}>
              {saving ? '저장중…' : '💾 저장'}
            </button>
            <button
              className="btn-ghost"
              onClick={handlePreview}
              disabled={busy}
              title="A4 세로 인쇄물 모양을 미리 확인 (인쇄 X)"
              style={{color:'#1a5490', borderColor:'#C8DBE5'}}>
              {previewing ? '준비중…' : '👁 출력 미리보기'}
            </button>
            <button
              className="btn-ghost"
              onClick={handlePrint}
              disabled={busy}
              title="A4 세로로 브라우저 인쇄 다이얼로그 열기">
              {printing ? '준비중…' : '🖨️ 출력'}
            </button>
            <button
              className="btn-primary"
              onClick={handlePdfDownload}
              disabled={busy}>
              {generatingPdf ? '생성중…' : <>📄 PDF 다운로드</>}
            </button>
          </div>
        </div>
      }
    >
      {/* ═══════════════════════════════════════════════════════════
          v3.17 · Linear 스타일 — 왼쪽: 총액·결재 전 확인·청구 항목 목록 / 오른쪽: 요청 정보·손익·수금 대비 지급
          ═══════════════════════════════════════════════════════════ */}
      <div className="xp-layout">
        <div style={{minWidth:0}}>
          {/* 품의제목 */}
          <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:16}}>
            <span style={{fontSize:12, color:'var(--ink-3)'}}>품의제목</span>
            <span style={{fontSize:14, fontWeight:700, color:'var(--ink-1)'}}>『{contract.projectName || '(프로젝트명 없음)'}』</span>
            <input
              value={form.docSubject}
              onChange={e => setForm({...form, docSubject: e.target.value})}
              placeholder="예: 설치비 지급요청의 건 / 자재비 지급요청의 건"
              aria-label="품의제목"
              className="doc-subject-input"
              style={{flex:1, minWidth:200, height:34, boxSizing:'border-box', padding:'0 10px', fontSize:13, fontWeight:600, border:'1px solid var(--line-2)', borderRadius:6, background:'#fff', outline:'none', fontFamily:'inherit'}}
            />
          </div>

          {/* 금회 지급 총액 + 항목 비중 */}
          <section aria-label="금회 지급 총액">
            <div className="xp-total">
              <div>
                <div className="cap">금회 지급 총액 (VAT 포함) · {form.paymentCount}차</div>
                <div className="num">{grandTotal.toLocaleString('ko-KR')}<small>원</small></div>
                <div className="kor">{grandTotal > 0 ? numberToKoreanAmount(grandTotal) : '포함된 금액이 없습니다'}</div>
              </div>
              <div className="xp-meta">
                <div>누적 지급 {Math.round(prevAll).toLocaleString('ko-KR')} → <b style={{color:'var(--ink-1)', fontWeight:600}}>{Math.round(afterAll).toLocaleString('ko-KR')}원</b></div>
                <div>{segs.length}개 항목 포함 · 4개 중</div>
              </div>
            </div>
            <div className="xp-segbar" aria-hidden="true">
              {segs.map(s => <span key={s.key} style={{width: s.w, background: s.color}}/>)}
            </div>
            <div className="xp-legend">
              {segs.map(s => <span key={s.key}><i style={{background:s.color}}/>{s.name} <b>{Math.round(s.amt).toLocaleString('ko-KR')}</b></span>)}
            </div>
          </section>

          {/* 결재 전 확인 */}
          {alerts.length > 0 && (
            <div className="xp-alert" role="status">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{flex:'none', marginTop:2}}><path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3"/><path d="M8 11.3v.4"/></svg>
              <div>
                <b>결재 전 확인 {alerts.length}건</b>
                <ul>{alerts.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            </div>
          )}

          {/* 청구 항목 — 제품대 → 설치비 → 기타경비 → 영업수수료 */}
          <div className="xp-list-head">
            <h3>청구 항목</h3>
            <span className="lg">
              <span><i style={{background:'var(--ink-3)'}}/>지난 회차 누계</span>
              <span><i style={{background:'rgba(107,112,105,.35)'}}/>이번 회차</span>
              <span>· 금회 요청액</span>
            </span>
          </div>

          {/* 1. 제품대 */}
          <CategoryRow
            catKey="product" name="제품대" color={EXPENSE_CAT_COLOR.product}
            open={openCat === 'product'} onToggleOpen={() => setOpenCat(o => o === 'product' ? null : 'product')}
            toggle={{ checked: includeProduct, onChange: setIncludeProduct }}
            banner={budgetBanner('product', productTotal > 0 && Math.round(productTotal) !== productBudgetNum ? (
              <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
                제품 내역서 합계 <b>{Math.round(productTotal).toLocaleString()}원</b>
                <button type="button" onClick={() => setProductBudget(String(Math.round(productTotal)))}
                  style={{padding:'4px 10px', fontSize:11, fontWeight:700, background:'#fff', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor:'pointer'}}>
                  제품대 총액에 적용
                </button>
              </span>
            ) : null)}
            vendorDetail={vendorDetailOf(productVendorName)}
            note={catNotes.product} onNoteChange={setCatNote('product')}
            vendorValue={productVendorName} onVendorChange={setProductVendorName} vendorOptions={vendorOptions}
            vendorPlaceholder="제품대 지급 업체명" vendorLabel="제품대"
            onSaveVendor={() => handleSaveCategoryVendorName('product', productVendorName, '제품대')}
            savingVendor={savingVendorCat === 'product'}
            totalAmount={productBudget}
            onTotalChange={setProductBudget}
            totalNote={productBudgetNum !== (baseBudgets.product || 0) ? '(수정됨)' : ''}
            rounds={productRounds}
            manualRows={manualHist.product} onManualRowsChange={setManualRows('product')}
            onSaveManual={() => handleSaveManual('product')} savingManual={savingManualKind === 'product'} manualSavedAt={histSavedAt.product}
            onDeleteRound={handleDeleteRound}
            deletingNo={deletingRound}
            currentAmount={catCurrentInput.product}
            onAmountChange={setProductAmount}
            currentRoundLabel={`${form.paymentCount}차`} currentDate={form.docDate}
            corrections={correctionsOf('product')} canCorrect={canCorrect} onCorrect={handleCorrect}
            detailTitle="제품 내역서 (장비대)"
            detailActions={<>
              {saveItemsButton('product')}
              <button
                onClick={() => importProductXlsx('drive')}
                disabled={!!importing}
                style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='product-drive' ? 'var(--surface-2)' : '#f0f7fb', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
                {importing === 'product-drive' ? '⏳...' : '📁 Drive'}
              </button>
              <button
                onClick={() => importProductXlsx('local')}
                disabled={!!importing}
                style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='product-local' ? 'var(--surface-2)' : '#fff', color:'var(--ink-2)', border:'1px solid var(--line)', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
                {importing === 'product-local' ? '⏳...' : '💻 PC'}
              </button>
              <button
                onClick={() => createTemplateInDrive('product')}
                disabled={!!importing}
                title="Drive에 파일이 없을 때 — 기본 양식(빈 표)으로 새 파일을 만들어 Drive에 저장합니다"
                style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='product-template' ? 'var(--surface-2)' : '#fff', color:'var(--green-800)', border:'1px dashed #C9DFD1', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
                {importing === 'product-template' ? '⏳...' : '🆕 새 양식 만들기'}
              </button>
              {productFileUrl && (
                <button
                  onClick={() => window.open(productFileUrl, '_blank', 'noopener')}
                  title="Drive에서 이 파일을 새 탭으로 열어 직접 값을 수정합니다 (수정 후에는 &quot;📁 Drive&quot; 버튼으로 다시 불러오세요)"
                  style={{padding:'5px 10px', fontSize:11, fontWeight:600, background:'#fff', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor:'pointer'}}>
                  🔗 파일 열기
                </button>
              )}
            </>}
            detailBanner={productSummary && (
              <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, padding:'10px 12px', background:'var(--bronze-50, #FBF6E9)', border:'1px solid #ECD9AE', borderRadius:8}}>
                <div>
                  <div style={{fontSize:10, color:'var(--bronze-800, #8f6d3a)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>파일</div>
                  <div style={{fontSize:11.5, color:'var(--ink-1)', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={productFilename}>📄 {productFilename}</div>
                </div>
                <div>
                  <div style={{fontSize:10, color:'var(--bronze-800, #8f6d3a)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>품목 수</div>
                  <div style={{fontSize:12.5, color:'var(--ink-1)', fontWeight:700}}>{productItems.length}건</div>
                </div>
                <div>
                  <div style={{fontSize:10, color:'var(--bronze-800, #8f6d3a)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>출고가</div>
                  <div style={{fontSize:12.5, color:'var(--ink-2)', fontWeight:700, fontVariantNumeric:'tabular-nums'}}>{Math.round(productSummary.totalList||0).toLocaleString()}원</div>
                </div>
                <div>
                  <div style={{fontSize:10, color:'var(--bronze-800, #8f6d3a)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>실효 DC율</div>
                  <div style={{fontSize:12.5, color:'var(--bronze-800, #8f6d3a)', fontWeight:700}}>{(productSummary.effectiveDc*100).toFixed(1)}%</div>
                </div>
              </div>
            )}
          >
            {productItems.length === 0 && !productSummary && (
              <div style={{padding:'16px 12px', textAlign:'center', background:'#fff', border:'1.5px dashed var(--line-2)', borderRadius:8, color:'var(--ink-3)', fontSize:12}}>
                제품 내역서가 없습니다. 위 <b>Drive/PC</b> 버튼으로 엑셀을 가져오거나 아래에서 항목을 직접 추가하세요.
              </div>
            )}
            {(productItems.length > 0 || productSummary) && (
              <ItemsTable
                mode="product"
                items={productItems}
                setItems={setProductItems}
                filename={productFilename}
                onClear={() => { setProductItems([]); setProductSummary(null); setProductFilename(''); }}
              />
            )}
            {productItems.length === 0 && !productSummary && (
              <button
                onClick={() => setProductItems([{ name:'', model:'', unit:'대', qty:'', unitPrice:'', listPrice:'', dcRate:0 }])}
                style={{alignSelf:'flex-start', padding:'5px 12px', fontSize:11.5, fontWeight:600, background:'#fff', color:'var(--green-800)', border:'1px dashed #C9DFD1', borderRadius:6, cursor:'pointer'}}>
                + 제품 항목 직접 추가
              </button>
            )}
          </CategoryRow>

          {/* 2. 설치비 */}
          <CategoryRow
            catKey="install" name="설치비" color={EXPENSE_CAT_COLOR.install}
            open={openCat === 'install'} onToggleOpen={() => setOpenCat(o => o === 'install' ? null : 'install')}
            toggle={{ checked: includeInstall, onChange: setIncludeInstall }}
            banner={budgetBanner('install')}
            vendorDetail={installVendorDetail}
            note={catNotes.install} onNoteChange={setCatNote('install')}
            vendorValue={form.subName} onVendorChange={v => {
              const known = ((data && data.subcontractors) || []).some(x => x && String(x.name || '').trim() === String(v).trim());
              if (known) pickInstallVendor(String(v).trim()); else setForm({...form, subName: v});
            }}
            vendorOptions={vendorOptions}
            onVendorPick={pickInstallVendor}
            vendorPlaceholder="설치비 지급 업체명" vendorLabel="설치비"
            onSaveVendor={handleSaveFullVendor}
            savingVendor={savingVendorCat === 'install'}
            totalAmount={installBudget}
            onTotalChange={setInstallBudget}
            totalNote={installBudgetNum !== (baseBudgets.install || 0) ? '(수정됨)' : ''}
            rounds={previousRounds}
            manualRows={manualHist.install} onManualRowsChange={setManualRows('install')}
            onSaveManual={() => handleSaveManual('install')} savingManual={savingManualKind === 'install'} manualSavedAt={histSavedAt.install}
            currentAmount={catCurrentInput.install}
            onAmountChange={v => setForm({...form, requestAmount: v})}
            currentRoundLabel={`${form.paymentCount}차`} currentDate={form.docDate}
            onDeleteRound={handleDeleteRound}
            deletingNo={deletingRound}
            corrections={correctionsOf('install')} canCorrect={canCorrect} onCorrect={handleCorrect}
            detailTitle="설치비 내역서"
            detailActions={<>
              {saveItemsButton('install')}
              <button
                onClick={() => importInstallXlsx('drive')}
                disabled={!!importing}
                style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='install-drive' ? 'var(--surface-2)' : '#f0f7fb', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
                {importing === 'install-drive' ? '⏳...' : '📁 Drive'}
              </button>
              <button
                onClick={() => importInstallXlsx('local')}
                disabled={!!importing}
                style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='install-local' ? 'var(--surface-2)' : '#fff', color:'var(--ink-2)', border:'1px solid var(--line)', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
                {importing === 'install-local' ? '⏳...' : '💻 PC'}
              </button>
              <button
                onClick={() => createTemplateInDrive('install')}
                disabled={!!importing}
                title="Drive에 파일이 없을 때 — 기본 양식(빈 표)으로 새 파일을 만들어 Drive에 저장합니다"
                style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='install-template' ? 'var(--surface-2)' : '#fff', color:'var(--green-800)', border:'1px dashed #C9DFD1', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
                {importing === 'install-template' ? '⏳...' : '🆕 새 양식 만들기'}
              </button>
              {installFileUrl && (
                <button
                  onClick={() => window.open(installFileUrl, '_blank', 'noopener')}
                  title="Drive에서 이 파일을 새 탭으로 열어 직접 값을 수정합니다 (수정 후에는 &quot;📁 Drive&quot; 버튼으로 다시 불러오세요)"
                  style={{padding:'5px 10px', fontSize:11, fontWeight:600, background:'#fff', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor:'pointer'}}>
                  🔗 파일 열기
                </button>
              )}
            </>}
          >
            <ItemsTable
              mode="install"
              items={installItems}
              setItems={setInstallItems}
              filename={installFilename}
              onClear={() => { setInstallItems([{ name:'', spec:'', qty:'', unit:'식', unitPrice:'', note:'' }]); setInstallFilename(''); }}
            />
          </CategoryRow>

          {/* 3. 기타경비 */}
          <CategoryRow
            catKey="etc" name="기타경비" color={EXPENSE_CAT_COLOR.etc}
            open={openCat === 'etc'} onToggleOpen={() => setOpenCat(o => o === 'etc' ? null : 'etc')}
            toggle={{ checked: includeEtc, onChange: setIncludeEtc }}
            banner={budgetBanner('etc')}
            vendorDetail={vendorDetailOf(etcVendorName)}
            note={catNotes.etc} onNoteChange={setCatNote('etc')}
            vendorValue={etcVendorName} onVendorChange={setEtcVendorName} vendorOptions={vendorOptions}
            vendorPlaceholder="기타경비 지급 업체명" vendorLabel="기타경비"
            onSaveVendor={() => handleSaveCategoryVendorName('etc', etcVendorName, '기타경비')}
            savingVendor={savingVendorCat === 'etc'}
            totalAmount={etcBudget}
            onTotalChange={setEtcBudget}
            totalNote={etcBudgetNum !== (baseBudgets.etc || 0) ? '(수정됨)' : ''}
            rounds={etcRounds}
            manualRows={manualHist.etc} onManualRowsChange={setManualRows('etc')}
            onSaveManual={() => handleSaveManual('etc')} savingManual={savingManualKind === 'etc'} manualSavedAt={histSavedAt.etc}
            onDeleteRound={handleDeleteRound}
            deletingNo={deletingRound}
            currentAmount={catCurrentInput.etc}
            onAmountChange={setEtcAmount}
            currentRoundLabel={`${form.paymentCount}차`} currentDate={form.docDate}
            corrections={correctionsOf('etc')} canCorrect={canCorrect} onCorrect={handleCorrect}
            detailTitle="기타 경비 내역"
            detailActions={saveItemsButton('etc')}
          >
            <ItemsTable mode="simple" items={etcItems} setItems={setEtcItems} showReceipt/>
          </CategoryRow>

          {/* 4. 영업수수료 */}
          <CategoryRow
            catKey="commission" name="영업수수료" color={EXPENSE_CAT_COLOR.commission}
            open={openCat === 'commission'} onToggleOpen={() => setOpenCat(o => o === 'commission' ? null : 'commission')}
            toggle={{ checked: includeCommission, onChange: setIncludeCommission }}
            banner={budgetBanner('commission')}
            vendorDetail={vendorDetailOf(commissionVendorName)}
            note={catNotes.commission} onNoteChange={setCatNote('commission')}
            vendorValue={commissionVendorName} onVendorChange={setCommissionVendorName} vendorOptions={vendorOptions}
            vendorPlaceholder="영업수수료 지급 대상" vendorLabel="영업수수료"
            onSaveVendor={() => handleSaveCategoryVendorName('commission', commissionVendorName, '영업수수료')}
            savingVendor={savingVendorCat === 'commission'}
            totalAmount={commissionBudget}
            onTotalChange={setCommissionBudget}
            totalNote={commissionBudgetNum !== (baseBudgets.commission || 0) ? '(수정됨)' : ''}
            rounds={commissionRounds}
            manualRows={manualHist.commission} onManualRowsChange={setManualRows('commission')}
            onSaveManual={() => handleSaveManual('commission')} savingManual={savingManualKind === 'commission'} manualSavedAt={histSavedAt.commission}
            onDeleteRound={handleDeleteRound}
            deletingNo={deletingRound}
            currentAmount={catCurrentInput.commission}
            onAmountChange={setCommissionAmount}
            currentRoundLabel={`${form.paymentCount}차`} currentDate={form.docDate}
            corrections={correctionsOf('commission')} canCorrect={canCorrect} onCorrect={handleCorrect}
            detailTitle="영업 수수료 내역"
            detailActions={saveItemsButton('commission')}
          >
            <ItemsTable mode="simple" items={commissionItems} setItems={setCommissionItems} showReceipt/>
          </CategoryRow>

          {/* 지급대상 (도급업체) */}
          <div className="xp-list-head" style={{marginTop:32}}>
            <h3>지급대상 (도급업체)</h3>
            <span className="lg">설치비 업체 · 다른 항목은 항목별 업체명 사용</span>
          </div>
          <div style={{paddingTop:12}}>
            <SubcontractorBlock
              form={form}
              setForm={setForm}
              data={data}
              clientOptions={data?.clients || []}
              onSave={handleSaveSubcontractorInfo}
              saving={savingVendorCat === 'main'}
            />
          </div>
        </div>

        {/* ── 오른쪽 속성 패널 ── */}
        <aside className="xp-side" aria-label="요청 정보">
          <section>
            <h3>요청 정보</h3>
            <div className="xp-prop">
              <label htmlFor="xp-round">기성 회차</label>
              <input id="xp-round" value={form.paymentCount} onChange={e => setForm({...form, paymentCount: e.target.value})} placeholder="1" style={{fontWeight:600}}/>
            </div>
            <div className="xp-prop">
              <label htmlFor="xp-date">작성일</label>
              <input id="xp-date" type="date" value={form.docDate} onChange={e => setForm({...form, docDate: e.target.value})}/>
            </div>
            <div className="xp-prop">
              <label htmlFor="xp-cat">구분</label>
              <select id="xp-cat" value={docCategory} onChange={e => setDocCategory(e.target.value)} title="이 지급 요청의 대표 항목 (실제 청구 항목은 왼쪽 목록의 체크로 정함)">
                <option value="install">설치비</option>
                <option value="product">제품대</option>
                <option value="commission">영업수수료</option>
                <option value="etc">기타경비</option>
              </select>
            </div>
            <div className="xp-prop">
              <label htmlFor="xp-mgr">영업담당</label>
              <input id="xp-mgr" value={form.manager} onChange={e => setForm({...form, manager: e.target.value})} placeholder="예: 이상규 이사"/>
            </div>
            <div className="xp-prop">
              <label htmlFor="xp-co">출력 회사명</label>
              <select
                id="xp-co"
                value={companyCustom ? '_custom' : form.companyName}
                onChange={e => {
                  const v = e.target.value;
                  if (v === '_custom') { setCompanyCustom(true); setForm({...form, companyName: ''}); return; }
                  setCompanyCustom(false);
                  setForm({...form, companyName: v});
                  try { localStorage.setItem(EXPENSE_COMPANY_KEY, v); } catch {}
                }}
              >
                {EXPENSE_COMPANY_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                <option value="_custom">직접 입력…</option>
              </select>
            </div>
            {companyCustom && (
              <div className="xp-prop">
                <span className="k"/>
                <input
                  value={form.companyName}
                  aria-label="출력 회사명 직접 입력"
                  onChange={e => {
                    setForm({...form, companyName: e.target.value});
                    try { localStorage.setItem(EXPENSE_COMPANY_KEY, e.target.value); } catch {}
                  }}
                  placeholder="출력에 표시할 회사명"
                />
              </div>
            )}
            <div className="xp-prop">
              <label htmlFor="xp-att">첨부서류</label>
              <input id="xp-att" value={form.attachments} onChange={e => setForm({...form, attachments: e.target.value})} placeholder="세금계산서, 통장사본 1부"/>
            </div>
            <div style={{marginTop:10}}>
              <PreviousRoundDropdown
                history={expenseHistory}
                selected={selectedRound}
                onSelect={handleRoundSelect}
              />
              {loadingHistory && <div style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>이력 불러오는 중…</div>}
              {selectedRound && (() => {
                const r = expenseHistory.find(h => String(h.no) === String(selectedRound));
                return r && r.no ? (
                  <button type="button" className="xr-btn" onClick={() => handleDeleteRound(r)} disabled={deletingRound === r.no}
                    title="잘못 저장한 회차 기록 삭제" style={{marginTop:6, color:'var(--danger)'}}>
                    {deletingRound === r.no ? '삭제 중…' : `${r.roundNo}차 기록 삭제`}
                  </button>
                ) : null;
              })()}
            </div>
            <div style={{marginTop:10}}>
              <label htmlFor="xp-note" style={{display:'block', fontSize:12, color:'var(--ink-3)', marginBottom:4}}>비고 사항</label>
              <textarea id="xp-note" rows={3} value={form.note} onChange={e => setForm({...form, note: e.target.value})}
                placeholder="지급 관련 특이사항, 지급 조건, 확인 사항"/>
            </div>
          </section>

          <section>
            <h3>계약 · 손익</h3>
            <div className="xp-kv"><span>거래처</span><span style={{maxWidth:170, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{contract.client || '-'}</span></div>
            <div className="xp-kv"><span>계약일</span><span>{contract.contractDate ? String(contract.contractDate).slice(0,10) : '-'}</span></div>
            <div className="xp-kv"><span>총 계약금액</span><span>{Math.round(contractTotal).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv"><span>(−) 제품대</span><span>{Math.round(productBudgetNum).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv"><span>(−) 설치비</span><span>{Math.round(installBudgetNum).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv"><span>(−) 기타경비</span><span>{Math.round(etcBudgetNum).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv"><span>(−) 영업수수료</span><span>{Math.round(commissionBudgetNum).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv sum">
              <span>예상 이익</span>
              <span>{profit < 0 ? '-' + Math.round(-profit).toLocaleString('ko-KR') : Math.round(profit).toLocaleString('ko-KR')}
                {contractTotal > 0 && <span style={{color: profit < 0 ? 'var(--danger)' : 'var(--pos)', marginLeft:6, fontWeight:500}}>{(profit / contractTotal * 100).toFixed(1)}%</span>}
              </span>
            </div>
          </section>

          <section>
            <h3>수금 대비 지급</h3>
            <div style={{position:'relative', height:8, borderRadius:4, background:'var(--bg-2)', overflow:'hidden', margin:'4px 0 6px'}}
              title={`입금 ${Math.round(received).toLocaleString()}원 · 지급(이번 회차 포함) ${Math.round(afterAll).toLocaleString()}원`}>
              <span style={{position:'absolute', left:0, top:0, bottom:0, width: (contractTotal > 0 ? Math.min(received / contractTotal * 100, 100) : 0) + '%', background:'rgba(46,100,70,.32)'}}/>
              <span style={{position:'absolute', left:0, top:0, bottom:0, width: (contractTotal > 0 ? Math.min(afterAll / contractTotal * 100, 100) : 0) + '%', background:'var(--green-700)'}}/>
            </div>
            <div className="xp-legend" style={{fontSize:11, marginBottom:4}}>
              <span><i style={{background:'rgba(46,100,70,.32)', width:10, height:6}}/>입금</span>
              <span><i style={{background:'var(--green-700)', width:10, height:6}}/>지급 (이번 회차 포함)</span>
            </div>
            <div className="xp-kv"><span>발주처 입금 누계</span><span>{Math.round(received).toLocaleString('ko-KR')}{contractTotal > 0 && <span style={{color:'var(--ink-3)', marginLeft:4}}>({Math.round(received / contractTotal * 100)}%)</span>}</span></div>
            <div className="xp-kv"><span>미수금</span><span>{Math.round(Math.max(contractTotal - received, 0)).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv"><span>지급 후 누적 지급</span><span>{Math.round(afterAll).toLocaleString('ko-KR')}</span></div>
            <div className="xp-kv sum">
              <span>자금 여유</span>
              <span style={{color: cushion < 0 ? 'var(--danger)' : 'var(--pos)'}}>{cushion < 0 ? '−' : '+'}{Math.round(Math.abs(cushion)).toLocaleString('ko-KR')}</span>
            </div>
          </section>
        </aside>
      </div>
    </Modal>
    </>
  );
};

window.ExpenseModal = ExpenseModal;
