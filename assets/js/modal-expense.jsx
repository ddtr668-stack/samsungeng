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
    const payload = { items: rows };
    if (kind === 'product') { payload.summary = productSummary || null; payload.filename = productFilename || ''; }
    if (kind === 'install') payload.filename = installFilename || '';
    setSavingItems(kind);
    try {
      const r = await apiClient.saveContractItems(contract.no, kind, payload);
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
        // 새 지출품의서는 '마지막 저장 회차 + 1' 차로 시작 (1차가 있으면 2차)
        setForm(f => ({ ...f, paymentCount: String(nextRoundNo(hist)) }));
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
    try {
      if (r.productItems_JSON) setProductItems(JSON.parse(r.productItems_JSON));
      if (r.installItems_JSON) setInstallItems(JSON.parse(r.installItems_JSON));
      if (r.expenseItems_JSON) setEtcItems(JSON.parse(r.expenseItems_JSON));
      if (r.commissionItems_JSON) setCommissionItems(JSON.parse(r.commissionItems_JSON));
    } catch (e) { /* ignore parse err */ }
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
      toast?.(`${r.roundNo}차 회차 삭제 완료`, 'success');
      const hist = await apiClient.expenseByContract(contract.no);
      setExpenseHistory(hist.history || []);
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
  // 수기 지급이력은 회차 번호가 같아도 항상 이전 지급으로 집계
  const activeHistory = expenseHistory.filter(h => h.status !== 'cancelled' && (h.manual || Number(h.roundNo) !== curRoundNo));
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

  // ─── 지급이력 수기 추가 (시스템 도입 전 지급 등 — 지출품의서 없이 지급 기록만) ───
  const handleAddManual = (cat) => async ({ roundNo, docDate, amount, note }) => {
    if (!hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); throw new Error('no api'); }
    const label = { install:'설치비', product:'제품대', etc:'기타경비', commission:'영업수수료' }[cat];
    // 구버전 Apps Script 는 수기 표시를 모르고 같은 회차 기록을 덮어쓸 수 있으므로 버전 확인 후 저장
    const MIN_VER = '2026-10-01-01';
    let ver = '';
    try { ver = String((await apiClient.ping())?.version || ''); } catch (e) { ver = ''; }
    if (ver.slice(0, MIN_VER.length) < MIN_VER) {
      toast?.(`⚠️ Apps Script 재배포가 필요합니다 (현재 ${ver ? ver.split(' ')[0] : '버전 정보 없음'} · 필요 ${MIN_VER}). gas-copy.html 에서 DashboardApi.gs 를 복사해 교체 후 "배포 관리 → 새 버전"으로 배포하세요.`, 'error');
      throw new Error('outdated server');
    }
    const vendor = cat === 'install' ? (form.subName || contract.subcontractor || '')
      : ({ product: productVendorName, etc: etcVendorName, commission: commissionVendorName }[cat] || '');
    try {
      await apiClient.saveExpense({
        contractNo: contract.no, roundNo, docDate, manual: true, manager: form.manager,
        subcontractor: cat === 'install' ? vendor : (contract.subcontractor || ''),
        amount: cat === 'install' ? amount : 0, prevProgress: 0,
        includeInstall: cat === 'install', includeProduct: cat === 'product',
        includeCommission: cat === 'commission', includeEtc: cat === 'etc',
        productAmount: cat === 'product' ? amount : 0,
        commission: cat === 'commission' ? amount : 0,
        etcCost: cat === 'etc' ? amount : 0,
        grandTotal: amount, docCategory: cat, note: note || '수기 입력',
        catNotes: { [cat]: note || '' },
        productVendorName: cat === 'product' ? vendor : '', commissionVendorName: cat === 'commission' ? vendor : '', etcVendorName: cat === 'etc' ? vendor : '',
        installItems: [], productItems: [], expenseItems: [], commissionItems: [],
      });
      toast?.(`${label} ${roundNo}차 지급이력 추가 (${Math.round(amount).toLocaleString()}원)`, 'success');
      const r = await apiClient.expenseByContract(contract.no);
      const hist = r.history || [];
      setExpenseHistory(hist);
      if (!selectedRound) setForm(f => ({ ...f, paymentCount: String(nextRoundNo(hist)) }));
    } catch (e) {
      toast?.('지급이력 추가 실패: ' + errMsg(e), 'error');
      throw e;
    }
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
        const synced = [...syncedFields.map(f => FIELD_LABELS_KO[f] || f), ...budgetLabels];
        toast?.(
          synced.length
            ? `${head} (계약 금액 반영: ${[...new Set(synced)].join(', ')})`
            : head,
          'success'
        );
        // 이력 재로드 — 방금 저장한 차수를 드롭목록에 선택된 상태로
        try {
          const r = await apiClient.expenseByContract(contract.no);
          setExpenseHistory(r.history || []);
          if (res?.entry?.no) setSelectedRound(String(res.entry.no));
        } catch { /* 이력 재로드 실패는 무시 */ }
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
    rounds: previousRounds,
    // 🆕 항목별(설치비/제품대/영업수수료/기타경비) 회차 이력 + 이번 회차 포함 여부
    productRounds, commissionRounds, etcRounds,
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

  const handlePdfDownload = async () => {
    if (!hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    if (installItems.length === 0 || !installItems.some(r => r.name && r.qty)) {
      toast?.('설치비 내역을 최소 1건 입력해주세요', 'error'); return;
    }
    setGeneratingPdf(true);
    try {
      const payload = buildPayload();
      const res = await apiClient.generateExpensePdf(contract._rowNumber || contract.no, payload);
      if (!res.pdf?.base64) throw new Error('PDF 생성 실패');
      const bin = atob(res.pdf.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.pdf.fileName || `지출품의서_${contract.no}_${form.paymentCount}차.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast?.('PDF 다운로드 완료', 'success');

      // Drive 자동 업로드 (자격 증명 있을 때만)
      if (window.hasDriveCredentials?.()) {
        try {
          await window.uploadExpensePdf(contract, payload.roundNo, payload.docDate, blob);
          toast?.('Drive 지출품의서 폴더에도 저장됨', 'success');
        } catch (e) {
          console.warn('[PDF Drive 업로드]', e);
          toast?.('Drive 업로드는 실패 (PDF는 다운로드됨): ' + errMsg(e), 'default');
        }
      }
    } catch (e) {
      const msg = errMsg(e);
      // ExpenseRequest.gs 미설치 안내
      if (/ExpenseRequest\.gs|MISSING_MODULE|generateExpenseRequestPdf/i.test(msg)) {
        toast?.(
          '⚠️ Apps Script 에 ExpenseRequest.gs 파일이 없습니다. 프로젝트 폴더의 gas-backend/ExpenseRequest.gs 를 새 스크립트 파일로 붙여넣기 후 "새 버전 배포" 해주세요.',
          'error'
        );
        console.error('[PDF] ExpenseRequest.gs 필요:', msg);
      } else if (/UNKNOWN_ROUTE|알 수 없는 라우트/i.test(msg)) {
        toast?.('⚠️ Apps Script 재배포가 필요합니다. DashboardApi.gs 최신본 배포 확인.', 'error');
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
      title="🧾 설치비 지급 품의서 생성"
      subtitle={`계약 ${contractCode(contract)} · ${contract.projectName}`}
      footer={
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width:'100%', gap:8}}>
          <div style={{fontSize:11, color:'var(--ink-3)'}}>
            <span style={{color:'var(--pos)', fontWeight:700}}>●</span>
            {' '}저장하면 이력에 기록됩니다. 출력·PDF는 재출력 가능.
          </div>
          <div style={{display:'flex', gap:6}}>
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
          📄 문서 헤더 · "지출품의서" + 품의제목 + 요청금액
          (아래 계약 요약/입력 블록과 같은 카드 스타일로 통일)
          ═══════════════════════════════════════════════════════════ */}
      <div className="doc-print-header" style={{marginBottom:16}}>
        {/* 대제목 */}
        <div style={{textAlign:'center', padding:'2px 0 12px'}}>
          <div style={{
            display:'inline-block', fontSize:22, fontWeight:800, color:'var(--green-800)',
            letterSpacing:'0.42em', paddingLeft:'0.42em',
          }}>
            지 출 품 의 서
          </div>
          <div style={{
            height:3, borderRadius:2, marginTop:8,
            background:'linear-gradient(90deg, var(--green-800) 0%, var(--green-600, #3F7A5C) 55%, rgba(63,122,92,0.08) 100%)',
          }}/>
        </div>

        {/* 품의제목 */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          padding:'10px 14px', marginBottom:8,
          background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:8,
        }}>
          <span style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.05em'}}>품의제목</span>
          <span style={{fontSize:13.5, fontWeight:800, color:'var(--ink-1)', letterSpacing:'-0.02em'}}>
            『{contract.projectName || '(프로젝트명 없음)'}』
          </span>
          <input
            value={form.docSubject}
            onChange={e => setForm({...form, docSubject: e.target.value})}
            placeholder="예: 설치비 지급요청의 건 / 자재비 지급요청의 건"
            className="doc-subject-input"
            style={{
              flex:1, minWidth:220,
              padding:'6px 10px', fontSize:12.5, fontWeight:600,
              border:'1px solid var(--line)', borderRadius:6,
              background:'#fff', outline:'none', fontFamily:'inherit',
            }}
          />
        </div>

        {/* ⑦ 계약 요약 헤더 (화면용 · 인쇄 시 숨김) — 🆕 거래처·계약일·품의일 그리드보다 위로 이동 */}
        <div className="screen-only">
          <ExpenseContractHeader
            contract={contract}
            paidTotal={paidTotal}
            paidPct={paidPct}
            paySplit={paySplit}
          />
        </div>

        {/* 거래처 · 계약일 · 품의일 : KPI 타일과 동일한 카드 */}
        <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr 1fr', gap:5, marginBottom:8}}>
          {[
            ['거래처', contract.client || '-', false],
            ['계약일', contract.contractDate ? contract.contractDate.slice(0,10) : '-', true],
            ['품의일', form.docDate || '-', true],
          ].map(([label, val, mono]) => (
            <div key={label} style={{padding:'8px 10px', background:'#fff', border:'1px solid var(--line)', borderRadius:6}}>
              <div style={{fontSize:9.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.03em', display:'flex', alignItems:'center', gap:4}}>
                <span style={{width:5, height:5, borderRadius:'50%', background:'var(--green-600, #3F7A5C)', display:'inline-block'}}/>
                {label}
              </div>
              <div style={{
                fontSize:13.5, fontWeight:800, color:'var(--ink-1)', marginTop:2,
                fontFamily: mono ? 'ui-monospace,Menlo,monospace' : 'inherit',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
              }}>{val}</div>
            </div>
          ))}
        </div>

        {/* 금회 요청금액 (한글 + ￦ 숫자) */}
        <div style={{
          display:'grid', gridTemplateColumns:'auto 1fr auto', alignItems:'center', gap:14,
          padding:'12px 16px',
          background:'linear-gradient(180deg, var(--green-50), var(--green-25, #F7FAF7))',
          border:'1px solid #C9DFD1', borderRadius:10,
        }}>
          <div>
            <div style={{fontSize:11.5, fontWeight:800, color:'var(--green-800)'}}>금회 요청금액</div>
            <div style={{fontSize:9.5, color:'var(--ink-3)', fontWeight:600, marginTop:1}}>(VAT 포함)</div>
          </div>
          <div style={{textAlign:'center', fontSize:13.5, fontWeight:700, color:'var(--ink-1)', letterSpacing:'0.02em'}}>
            {requestAmount > 0
              ? numberToKoreanAmount(grandTotal)
              : <span style={{color:'var(--ink-3)', fontWeight:600}}>금액 미입력</span>}
          </div>
          <div style={{fontSize:18, fontWeight:800, color:'var(--green-800)', fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap'}}>
            ￦ {grandTotal.toLocaleString('ko-KR')}
          </div>
        </div>
        <div style={{fontSize:10, color:'var(--ink-3)', textAlign:'right', padding:'4px 4px 0'}}>
          {/* 🆕 v3: 체크된(이번 회차 포함) 항목만 "+"로 나열, 미포함 항목은 괄호로 별도 안내 */}
          {[
            includeInstall && requestAmount > 0 && `설치비 ${requestAmount.toLocaleString('ko-KR')}원`,
            includeProduct && productRequestAmount > 0 && `제품대 ${productRequestAmount.toLocaleString('ko-KR')}원`,
            includeCommission && commissionRequestAmount > 0 && `영업수수료 ${commissionRequestAmount.toLocaleString('ko-KR')}원`,
            includeEtc && etcRequestAmount > 0 && `기타경비 ${etcRequestAmount.toLocaleString('ko-KR')}원`,
          ].filter(Boolean).join(' + ') || '항목별 기성 관리에서 포함할 항목을 체크하세요'}
          {(!includeInstall || !includeProduct || !includeCommission || !includeEtc) && (
            <> ({[
              !includeInstall && '설치비',
              !includeProduct && '제품대',
              !includeCommission && '영업수수료',
              !includeEtc && '기타경비',
            ].filter(Boolean).join('·')}는 체크 해제 · 별도 정산)</>
          )}
        </div>
      </div>

      {/* v3 ① : 지급 요청 정보 (지급대상보다 위로 이동) */}
      <SectionHead title="지급 요청 정보" badge="순서 변경" />

      <div style={{display:'grid', gridTemplateColumns:'1fr 1.25fr 1fr 0.6fr', gap:10, marginBottom:10}}>
        <div>
          <label style={_labelSt}>영업담당</label>
          <input value={form.manager} onChange={e => setForm({...form, manager: e.target.value})} placeholder="예: 이상규 이사" style={_inputSt}/>
        </div>
        <div>
          <label style={_labelSt}>출력 회사명 (하단 서명란)</label>
          <select
            value={companyCustom ? '_custom' : form.companyName}
            onChange={e => {
              const v = e.target.value;
              if (v === '_custom') { setCompanyCustom(true); setForm({...form, companyName: ''}); return; }
              setCompanyCustom(false);
              setForm({...form, companyName: v});
              try { localStorage.setItem(EXPENSE_COMPANY_KEY, v); } catch {}
            }}
            style={_inputSt}
          >
            {EXPENSE_COMPANY_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="_custom">직접 입력…</option>
          </select>
          {companyCustom && (
            <input
              value={form.companyName}
              onChange={e => {
                setForm({...form, companyName: e.target.value});
                try { localStorage.setItem(EXPENSE_COMPANY_KEY, e.target.value); } catch {}
              }}
              placeholder="출력에 표시할 회사명 입력"
              style={{..._inputSt, marginTop:5}}
            />
          )}
        </div>
        <div>
          <label style={_labelSt}>작성일 *</label>
          <input type="date" value={form.docDate} onChange={e => setForm({...form, docDate: e.target.value})} style={{..._inputSt, fontFamily:'ui-monospace,Menlo,monospace'}}/>
        </div>
        <div>
          <label style={_labelSt}>기성 회차 *</label>
          <input value={form.paymentCount} onChange={e => setForm({...form, paymentCount: e.target.value})} placeholder="1" style={{..._inputSt, fontWeight:700}}/>
        </div>
      </div>

      {/* v3 ② : "구분"(대표 항목) 신규 + 전회 기성 이력 */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:4}}>
        <div>
          <label style={_labelSt}><b>구분 (이 지급 요청의 항목) *</b> <span style={{fontSize:8.5, fontWeight:800, background:'var(--pos)', color:'#fff', padding:'0 5px', borderRadius:7, marginLeft:4, letterSpacing:'0.02em', verticalAlign:1}}>NEW</span></label>
          <select
            value={docCategory}
            onChange={e => setDocCategory(e.target.value)}
            style={{..._inputSt, border:`1.5px solid ${docCatMeta.accent.strong}`, background:docCatMeta.accent.soft}}
          >
            <option value="install">설치비</option>
            <option value="product">제품대</option>
            <option value="commission">영업수수료</option>
            <option value="etc">기타경비</option>
          </select>
        </div>
        <div>
          <PreviousRoundDropdown
            history={expenseHistory}
            selected={selectedRound}
            onSelect={handleRoundSelect}
          />
          {loadingHistory && <div style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>이력 불러오는 중…</div>}
          {selectedRound && (() => {
            const r = expenseHistory.find(h => String(h.no) === String(selectedRound));
            return r && r.no ? (
              <button type="button" onClick={() => handleDeleteRound(r)} disabled={deletingRound === r.no}
                title="잘못 저장한 회차 기록 삭제"
                style={{marginTop:6, padding:'4px 10px', fontSize:11, fontWeight:700, background:'#fff', color:'var(--neg, #B3452D)', border:'1px solid #E8C2B8', borderRadius:6, cursor: deletingRound === r.no ? 'wait' : 'pointer'}}>
                {deletingRound === r.no ? '삭제 중…' : `🗑 ${r.roundNo}차 기록 삭제`}
              </button>
            ) : null;
          })()}
        </div>
      </div>
      <div style={{fontSize:10.5, color:'var(--ink-3)', margin:'-2px 0 10px'}}>
        ↳ 선택한 구분에 따라 아래 "금회 요청금액" 라벨과 값이 자동으로 맞춰집니다. (여러 항목을 함께
        청구할 때는 아래 항목별 카드에서 각각 체크 — 이 값은 그중 대표 항목일 뿐입니다)
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10}}>
        <div>
          <label style={_labelSt}><b>금회 요청금액 ({docCatMeta.label}) *</b></label>
          <input
            type="number"
            value={docCatMeta.amount}
            onChange={e => docCatMeta.onChange(e.target.value)}
            style={{..._inputSt, textAlign:'right', fontWeight:800, color:docCatMeta.accent.strong, borderColor:docCatMeta.accent.mid, background:docCatMeta.accent.soft}}
          />
        </div>
        <div>
          <label style={_labelSt}>첨부서류</label>
          <input value={form.attachments} onChange={e => setForm({...form, attachments: e.target.value})} placeholder="세금계산서, 통장사본 1부" style={_inputSt}/>
        </div>
      </div>

      {/* ⑤ 비고 사항 */}
      <div style={{marginBottom:22}}>
        <label style={_labelSt}>비고 사항</label>
        <textarea
          rows={3}
          value={form.note}
          onChange={e => setForm({...form, note: e.target.value})}
          placeholder="지급 관련 특이사항, 지급 조건, 확인 사항 등을 자유롭게 입력하세요"
          style={{..._inputSt, resize:'vertical', lineHeight:1.5}}
        />
      </div>

      {/* v3 ①(순서 변경) : 지급대상 (도급업체) — 지급 요청 정보 아래로 이동, 저장 버튼은 아래 카드로 */}
      <SectionHead title="지급대상" badge="순서 변경" />
      <SubcontractorBlock
        form={form}
        setForm={setForm}
        data={data}
        clientOptions={data?.clients || []}
        onSave={handleSaveSubcontractorInfo}
        saving={savingVendorCat === 'main'}
      />

      {/* v3 ③④⑤⑥ : 항목별 기성 관리 — 카드 순서(제품대→설치비→기타경비→영업수수료) + 내역서 병합 + 탭 */}
      <SectionHead title="항목별 기성 관리" />
      <div style={{fontSize:11, color:'var(--ink-3)', background:'var(--surface-2)', border:'1px dashed var(--line-2)', borderRadius:8, padding:'8px 12px', marginBottom:14}}>
        💡 카드마다 <b>[요약]</b> / <b>[상세내역]</b> 탭이 있습니다. "상세내역" 탭에서 그 항목의 내역서(품목표) +
        회차별 지급 이력을 한 카드 안에서 함께 볼 수 있습니다. "이번 회차 포함" 토글을 꺼두면 품목·금액은
        참고용으로만 저장되고, 금회 요청·출력물의 지급대상·지급 내역 요약에는 반영되지 않습니다.
      </div>

      {/* 1. 제품대(장비대) 기성 */}
      {budgetBanner('product', productTotal > 0 && Math.round(productTotal) !== productBudgetNum ? (
        <span style={{display:'inline-flex', alignItems:'center', gap:6}}>
          제품 내역서 합계 <b>{Math.round(productTotal).toLocaleString()}원</b>
          <button type="button" onClick={() => setProductBudget(String(Math.round(productTotal)))}
            style={{padding:'4px 10px', fontSize:11, fontWeight:700, background:'#fff', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor:'pointer'}}>
            제품대 총액에 적용
          </button>
        </span>
      ) : null)}
      <CategoryCard
        icon="📦" name="제품대(장비대) 기성" accent="blue"
        toggle={{ checked: includeProduct, onChange: setIncludeProduct, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorDetail={vendorDetailOf(productVendorName)}
        note={catNotes.product} onNoteChange={setCatNote('product')}
        vendorValue={productVendorName} onVendorChange={setProductVendorName} vendorOptions={vendorOptions}
        vendorPlaceholder="제품대 지급 업체명" vendorLabel="제품대"
        onSaveVendor={() => handleSaveCategoryVendorName('product', productVendorName, '제품대')}
        savingVendor={savingVendorCat === 'product'}
        totalAmount={productBudget}
        onTotalChange={setProductBudget}
        totalNote={productBudgetNum !== (baseBudgets.product || 0) ? '(수정됨)' : '(계약관리 시트)'}
        rounds={productRounds}
        onAddManual={handleAddManual('product')}
        onDeleteRound={handleDeleteRound}
        deletingNo={deletingRound}
        currentAmount={docCategory === 'product' ? docCatMeta.amount : productRequestAmount}
        onAmountChange={setProductAmount}
        currentRoundLabel={`${form.paymentCount}차`}
        detailTitle="📄 제품 내역서 (장비대)"
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
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10, padding:'10px 12px', background:'var(--bronze-50, #FBF6E9)', border:'1px solid #ECD9AE', borderRadius:8}}>
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
          <div style={{padding:'20px 12px', textAlign:'center', background:'#fff', border:'1.5px dashed var(--line-2)', borderRadius:8, color:'var(--ink-3)', fontSize:12, marginBottom:14}}>
            📦 제품 내역서가 없습니다. 우측 상단 <b>Drive/PC</b> 버튼으로 엑셀 임포트하거나 아래에서 항목을 직접 추가하세요.
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
            style={{padding:'5px 12px', fontSize:11.5, fontWeight:600, background:'#fff', color:'var(--green-800)', border:'1px dashed #C9DFD1', borderRadius:6, cursor:'pointer'}}>
            + 제품 항목 직접 추가
          </button>
        )}
      </CategoryCard>

      {/* 2. 설치비 기성 */}
      {budgetBanner('install')}
      <CategoryCard
        icon="🔧" name="설치비 기성" accent="green"
        toggle={{ checked: includeInstall, onChange: setIncludeInstall, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
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
        totalNote={installBudgetNum !== (baseBudgets.install || 0) ? '(수정됨)' : '(계약관리 시트)'}
        rounds={previousRounds}
        onAddManual={handleAddManual('install')}
        currentAmount={docCategory === 'install' ? docCatMeta.amount : requestAmount}
        onAmountChange={v => setForm({...form, requestAmount: v})}
        currentRoundLabel={`${form.paymentCount}차`}
        onDeleteRound={handleDeleteRound}
        deletingNo={deletingRound}
        detailTitle="📄 설치비 내역서"
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
      </CategoryCard>

      {/* 3. 기타경비 기성 */}
      {budgetBanner('etc')}
      <CategoryCard
        icon="🧾" name="기타경비 기성" accent="bronze"
        toggle={{ checked: includeEtc, onChange: setIncludeEtc, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorDetail={vendorDetailOf(etcVendorName)}
        note={catNotes.etc} onNoteChange={setCatNote('etc')}
        vendorValue={etcVendorName} onVendorChange={setEtcVendorName} vendorOptions={vendorOptions}
        vendorPlaceholder="기타경비 지급 업체명" vendorLabel="기타경비"
        onSaveVendor={() => handleSaveCategoryVendorName('etc', etcVendorName, '기타경비')}
        savingVendor={savingVendorCat === 'etc'}
        totalAmount={etcBudget}
        onTotalChange={setEtcBudget}
        totalNote={etcBudgetNum !== (baseBudgets.etc || 0) ? '(수정됨)' : '(계약관리 시트)'}
        rounds={etcRounds}
        onAddManual={handleAddManual('etc')}
        onDeleteRound={handleDeleteRound}
        deletingNo={deletingRound}
        currentAmount={docCategory === 'etc' ? docCatMeta.amount : etcRequestAmount}
        onAmountChange={setEtcAmount}
        currentRoundLabel={`${form.paymentCount}차`}
        detailTitle="📄 기타 경비 내역"
        detailActions={saveItemsButton('etc')}
      >
        <ItemsTable mode="simple" items={etcItems} setItems={setEtcItems} showReceipt/>
      </CategoryCard>

      {/* 4. 영업수수료 기성 */}
      {budgetBanner('commission')}
      <CategoryCard
        icon="💼" name="영업수수료 기성" accent="plum"
        toggle={{ checked: includeCommission, onChange: setIncludeCommission, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorDetail={vendorDetailOf(commissionVendorName)}
        note={catNotes.commission} onNoteChange={setCatNote('commission')}
        vendorValue={commissionVendorName} onVendorChange={setCommissionVendorName} vendorOptions={vendorOptions}
        vendorPlaceholder="영업수수료 지급 대상" vendorLabel="영업수수료"
        onSaveVendor={() => handleSaveCategoryVendorName('commission', commissionVendorName, '영업수수료')}
        savingVendor={savingVendorCat === 'commission'}
        totalAmount={commissionBudget}
        onTotalChange={setCommissionBudget}
        totalNote={commissionBudgetNum !== (baseBudgets.commission || 0) ? '(수정됨)' : '(계약관리 시트)'}
        rounds={commissionRounds}
        onAddManual={handleAddManual('commission')}
        onDeleteRound={handleDeleteRound}
        deletingNo={deletingRound}
        currentAmount={docCategory === 'commission' ? docCatMeta.amount : commissionRequestAmount}
        onAmountChange={setCommissionAmount}
        currentRoundLabel={`${form.paymentCount}차`}
        detailTitle="📄 영업 수수료 내역"
        detailActions={saveItemsButton('commission')}
      >
        <ItemsTable mode="simple" items={commissionItems} setItems={setCommissionItems} showReceipt/>
      </CategoryCard>

      {/* 금회 지급 총액 요약 — 카드 순서(제품대→설치비→기타경비→영업수수료)와 맞춤, 체크된 항목만 합산 */}
      <div style={{padding:'14px 16px', background:'var(--warn-soft, #FDF6E7)', border:'1px solid #F0D9A0', borderRadius:10, marginTop:20}}>
        <div style={{fontSize:12, fontWeight:700, color:'var(--bronze-800, #8f6d3a)', paddingBottom:6, marginBottom:6, borderBottom:'1px solid #E8CFA0'}}>
          📊 금회 지급 총액 요약 (체크된 항목만 합산)
        </div>
        <div style={{display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12.5, color: includeProduct ? 'inherit' : 'var(--ink-3)'}}>
          <span>제품대{!includeProduct && ' (이번 회차 미포함)'}</span>
          <b style={{fontVariantNumeric:'tabular-nums'}}>{Math.round(productRequestAmount).toLocaleString()}원</b>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12.5, color: includeInstall ? 'inherit' : 'var(--ink-3)'}}>
          <span>설치비{!includeInstall && ' (이번 회차 미포함)'}</span>
          <b style={{fontVariantNumeric:'tabular-nums'}}>{Math.round(requestAmount).toLocaleString()}원</b>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12.5, color: includeEtc ? 'inherit' : 'var(--ink-3)'}}>
          <span>기타경비{!includeEtc && ' (이번 회차 미포함)'}</span>
          <b style={{fontVariantNumeric:'tabular-nums'}}>{Math.round(etcRequestAmount).toLocaleString()}원</b>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12.5, color: includeCommission ? 'inherit' : 'var(--ink-3)'}}>
          <span>영업수수료{!includeCommission && ' (이번 회차 미포함)'}</span>
          <b style={{fontVariantNumeric:'tabular-nums'}}>{Math.round(commissionRequestAmount).toLocaleString()}원</b>
        </div>
        <div style={{display:'flex', justifyContent:'space-between', padding:'6px 0 3px', borderTop:'1px dashed #E8CFA0', marginTop:4, fontSize:13, fontWeight:700}}>
          <span>금회 지급 총액</span>
          <b style={{fontVariantNumeric:'tabular-nums'}}>{grandTotal.toLocaleString()}원</b>
        </div>
      </div>
    </Modal>
    </>
  );
};

window.ExpenseModal = ExpenseModal;
