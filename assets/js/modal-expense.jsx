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
  // 🆕 v3: 항목별 기성 카드마다 별도로 지정할 수 있는 업체명(지급대상이 카테고리별로 다를 때)
  const [productVendorName, setProductVendorName] = useState('');
  const [commissionVendorName, setCommissionVendorName] = useState('');
  const [etcVendorName, setEtcVendorName] = useState('');
  const [savingVendorCat, setSavingVendorCat] = useState(null);   // 'install'|'product'|'commission'|'etc'|null

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
    setProductVendorName('');
    setCommissionVendorName('');
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
    apiClient.listPayments(contract.no)
      .then(r => setPayments(r.payments || []))
      .catch(e => { console.warn('[listPayments]', e); setPayments([]); });
  }, [open, contract?.no]);

  // ─── 지출품의서 이력 로드 (① 드롭박스) ───
  useEffect(() => {
    if (!open || !contract?.no) return;
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) return;
    setLoadingHistory(true);
    apiClient.expenseByContract(contract.no)
      .then(r => setExpenseHistory(r.history || []))
      .catch(e => {
        console.warn('[expenseByContract]', e);
        setExpenseHistory([]);
      })
      .finally(() => setLoadingHistory(false));
  }, [open, contract?.no]);

  // ─── 이전 회차 선택 시 자동 복원 ───
  const handleRoundSelect = (roundKey) => {
    setSelectedRound(roundKey);
    if (!roundKey) return;
    const r = expenseHistory.find(h => String(h.no || expenseHistory.indexOf(h)) === String(roundKey));
    if (!r) return;
    setForm(f => ({
      ...f,
      docDate: r.docDate || f.docDate,
      requestAmount: r.amount || 0,
      note: r.note || f.note,
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
    toast?.(`${r.roundNo}차 회차 데이터 복원됨${r.subcontractor ? ' (지급 대상 포함)' : ''}`, 'success');
  };

  // ─── 저장된 회차(설치비 기성) 삭제 ───
  // 시트 기록·상세 JSON 은 남기고 상태만 "취소됨"으로 바꾼다(되돌릴 수 없는 영구 삭제가 아니라,
  // 잘못 저장한 회차를 목록·진행률에서 제외하는 용도) — 실수로 지운 경우 스프레드시트의
  // 지출품의서이력 시트 L열(상태)에서 직접 "정상"으로 되돌리면 복구된다.
  const handleDeleteRound = async (r) => {
    if (!r?.no) return;
    const msg = `${r.roundNo}차 · ${r.docDate || ''} · ${(Number(r.amount)||0).toLocaleString()}원\n이 회차 저장 기록을 삭제할까요? (설치비 기성 목록·전회 기성 이력에서 사라집니다)`;
    const ok = confirmDialog ? await confirmDialog(msg) : window.confirm(msg);
    if (!ok) return;
    setDeletingRound(r.no);
    try {
      await apiClient.cancelExpenseRound({ contractNo: contract.no, no: r.no });
      toast?.(`${r.roundNo}차 회차 삭제 완료`, 'success');
      if (String(selectedRound) === String(r.no)) setSelectedRound('');
      const hist = await apiClient.expenseByContract(contract.no);
      setExpenseHistory(hist.history || []);
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
  const activeHistory = expenseHistory.filter(h => h.status !== 'cancelled');
  const previousRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: h.amount, no: h.no }));
  const breakdownOf = (h) => (window.expenseRoundBreakdown ? window.expenseRoundBreakdown(h) : { product: 0, commission: 0, etc: 0 });
  const productRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).product, no: h.no }))
    .filter(r => r.amount > 0);
  const commissionRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).commission, no: h.no }))
    .filter(r => r.amount > 0);
  const etcRounds = activeHistory
    .map(h => ({ roundNo: h.roundNo, docDate: h.docDate, amount: breakdownOf(h).etc, no: h.no }))
    .filter(r => r.amount > 0);

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
  const handleSaveCategoryVendorName = async (catKey, name, label) => {
    if (!name || !name.trim()) { toast?.('업체명을 입력하세요', 'error'); return; }
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setSavingVendorCat(catKey);
    try {
      await apiClient.saveSubcontractor({ name: name.trim() });
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
  });

  const handleSave = async () => {
    if (!hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다', 'error'); return; }
    setSaving(true);
    try {
      const payload = buildPayload();

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
        toast?.(
          syncedFields.length
            ? `지출품의서 저장 완료 (계약 금액 동기화: ${syncedFields.map(f => FIELD_LABELS_KO[f] || f).join(', ')})`
            : '지출품의서 저장 완료',
          'success'
        );
        // 이력 재로드
        try {
          const r = await apiClient.expenseByContract(contract.no);
          setExpenseHistory(r.history || []);
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
    contract, form,
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
      subtitle={`계약 #${contract.no} · ${contract.projectName}`}
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
      />

      {/* v3 ③④⑤⑥ : 항목별 기성 관리 — 카드 순서(제품대→설치비→기타경비→영업수수료) + 내역서 병합 + 탭 */}
      <SectionHead title="항목별 기성 관리" />
      <div style={{fontSize:11, color:'var(--ink-3)', background:'var(--surface-2)', border:'1px dashed var(--line-2)', borderRadius:8, padding:'8px 12px', marginBottom:14}}>
        💡 카드마다 <b>[요약]</b> / <b>[상세내역]</b> 탭이 있습니다. "상세내역" 탭에서 그 항목의 내역서(품목표) +
        회차별 지급 이력을 한 카드 안에서 함께 볼 수 있습니다. "이번 회차 포함" 토글을 꺼두면 품목·금액은
        참고용으로만 저장되고, 금회 요청·출력물의 지급대상·지급 내역 요약에는 반영되지 않습니다.
      </div>

      {/* 1. 제품대(장비대) 기성 */}
      <CategoryCard
        icon="📦" name="제품대(장비대) 기성" accent="blue"
        toggle={{ checked: includeProduct, onChange: setIncludeProduct, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorValue={productVendorName} onVendorChange={setProductVendorName}
        vendorPlaceholder="제품대 지급 업체명" vendorLabel="제품대"
        onSaveVendor={() => handleSaveCategoryVendorName('product', productVendorName, '제품대')}
        savingVendor={savingVendorCat === 'product'}
        totalAmount={contract.productCost}
        rounds={productRounds}
        currentAmount={docCategory === 'product' ? docCatMeta.amount : productRequestAmount}
        onAmountChange={setProductAmount}
        currentRoundLabel={`${form.paymentCount}차`}
        detailTitle="📄 제품 내역서 (장비대)"
        detailActions={<>
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
      <CategoryCard
        icon="🔧" name="설치비 기성" accent="green"
        toggle={{ checked: includeInstall, onChange: setIncludeInstall, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorValue={form.subName} onVendorChange={v => setForm({...form, subName: v})}
        vendorPlaceholder="설치비 지급 업체명" vendorLabel="설치비"
        onSaveVendor={handleSaveFullVendor}
        savingVendor={savingVendorCat === 'install'}
        totalAmount={contract.subcontractAmount}
        rounds={previousRounds}
        currentAmount={docCategory === 'install' ? docCatMeta.amount : requestAmount}
        onAmountChange={v => setForm({...form, requestAmount: v})}
        currentRoundLabel={`${form.paymentCount}차`}
        onDeleteRound={handleDeleteRound}
        deletingNo={deletingRound}
        detailTitle="📄 설치비 내역서"
        detailActions={<>
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
      <CategoryCard
        icon="🧾" name="기타경비 기성" accent="bronze"
        toggle={{ checked: includeEtc, onChange: setIncludeEtc, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorValue={etcVendorName} onVendorChange={setEtcVendorName}
        vendorPlaceholder="기타경비 지급 업체명" vendorLabel="기타경비"
        onSaveVendor={() => handleSaveCategoryVendorName('etc', etcVendorName, '기타경비')}
        savingVendor={savingVendorCat === 'etc'}
        totalAmount={contract.incidental}
        rounds={etcRounds}
        currentAmount={docCategory === 'etc' ? docCatMeta.amount : etcRequestAmount}
        onAmountChange={setEtcAmount}
        currentRoundLabel={`${form.paymentCount}차`}
        detailTitle="📄 기타 경비 내역"
      >
        <ItemsTable mode="simple" items={etcItems} setItems={setEtcItems} showReceipt/>
      </CategoryCard>

      {/* 4. 영업수수료 기성 */}
      <CategoryCard
        icon="💼" name="영업수수료 기성" accent="plum"
        toggle={{ checked: includeCommission, onChange: setIncludeCommission, includeLabel:'이번 회차 포함', excludeLabel:'이번 회차 제외' }}
        vendorValue={commissionVendorName} onVendorChange={setCommissionVendorName}
        vendorPlaceholder="영업수수료 지급 대상" vendorLabel="영업수수료"
        onSaveVendor={() => handleSaveCategoryVendorName('commission', commissionVendorName, '영업수수료')}
        savingVendor={savingVendorCat === 'commission'}
        totalAmount={contract.salesCost}
        rounds={commissionRounds}
        currentAmount={docCategory === 'commission' ? docCatMeta.amount : commissionRequestAmount}
        onAmountChange={setCommissionAmount}
        currentRoundLabel={`${form.paymentCount}차`}
        detailTitle="📄 영업 수수료 내역"
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
