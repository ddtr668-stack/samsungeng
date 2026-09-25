/* ═══════════════════════════════════════════════════════════════
   화면 3 · 계약 상세 페이지
═══════════════════════════════════════════════════════════════ */

// ─── 현장 자료 카드 (도면 링크 + 로컬 첨부 목록) ───
const SITE_ASSETS_KEY_PREFIX = 'hb.siteAssets.';

const SiteAssetsCard = ({ contract, site, saving, onSave }) => {
  const contractNo = contract.no;
  const [drawingUrl, setDrawingUrl] = useState(contract.drawing || site.drawing || '');
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  // 첨부 파일 (localStorage 저장, 파일은 base64로 임시 저장 — 10MB 이내 추천)
  const [assets, setAssets] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef();

  useEffect(() => {
    setDrawingUrl(contract.drawing || site.drawing || '');
    try {
      const raw = localStorage.getItem(SITE_ASSETS_KEY_PREFIX + contractNo);
      setAssets(raw ? JSON.parse(raw) : []);
    } catch { setAssets([]); }
  }, [contractNo]);

  const persistAssets = (list) => {
    setAssets(list);
    try {
      localStorage.setItem(SITE_ASSETS_KEY_PREFIX + contractNo, JSON.stringify(list));
    } catch (e) {
      alert('용량 초과. 큰 파일은 링크로만 저장하거나 Drive 링크를 사용하세요.');
    }
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newItems = [];
      for (const f of Array.from(files)) {
        if (f.size > 8 * 1024 * 1024) {
          if (!confirm(`"${f.name}"은 ${(f.size/1024/1024).toFixed(1)}MB로 큽니다. 브라우저에만 저장되며 용량 제한이 있습니다. 계속할까요?`)) continue;
        }
        // 이미지·PDF는 미리보기용으로 base64 저장, 나머지는 이름만 기록
        const isPreviewable = /^image\/|^application\/pdf$/.test(f.type);
        let dataUrl = null;
        if (isPreviewable && f.size < 3 * 1024 * 1024) {
          dataUrl = await new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(f);
          });
        }
        newItems.push({
          id: Date.now() + '-' + Math.random().toString(36).slice(2,8),
          name: f.name,
          size: f.size,
          type: f.type,
          uploadedAt: new Date().toISOString(),
          dataUrl,
        });
      }
      persistAssets([...assets, ...newItems]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAsset = (id) => {
    if (!confirm('이 파일을 삭제하시겠습니까?')) return;
    persistAssets(assets.filter(a => a.id !== id));
  };

  const openAsset = (asset) => {
    if (asset.dataUrl) {
      const w = window.open('about:blank');
      if (asset.type.startsWith('image/')) {
        w.document.write(`<img src="${asset.dataUrl}" style="max-width:100%;display:block;margin:auto" alt="${asset.name}"/>`);
      } else if (asset.type === 'application/pdf') {
        w.document.write(`<iframe src="${asset.dataUrl}" style="width:100vw;height:100vh;border:0"></iframe>`);
      }
      w.document.title = asset.name;
    } else {
      alert('파일 미리보기가 저장되지 않았습니다. 재업로드하거나 Drive 링크를 사용하세요.');
    }
  };

  const fmtSize = (b) => b < 1024 ? b + 'B' : b < 1024*1024 ? (b/1024).toFixed(1)+'KB' : (b/1024/1024).toFixed(1)+'MB';
  const fileIcon = (type) => {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    if (/word|document/.test(type)) return '📝';
    if (/sheet|excel/.test(type)) return '📊';
    return '📎';
  };

  const saveDrawingUrl = async () => {
    setEditingUrl(false);
    if (urlDraft === drawingUrl) return;
    setDrawingUrl(urlDraft);
    // 도면 URL은 전용 drawing 컬럼에만 저장한다(비고에 끼워 넣지 않음 — 비고는 사용자가 직접 쓰는 자유 메모 전용)
    await onSave({ drawing: urlDraft });
  };

  return (
    <div className="card">
      <CardHead title="현장 첨부파일" sub="사진 · 문서 · 견적서"/>

      {/* 파일 업로드 */}
      <div style={{marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
          <div style={{fontSize:11,color:'var(--ink-3)',fontWeight:600,letterSpacing:'0.02em'}}>📎 첨부 파일 ({assets.length})</div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="no-print"
            disabled={uploading}
            style={{padding:'2px 8px',fontSize:10,color:'var(--green-800)',border:'1px solid #C9DFD1',background:'var(--green-50)',borderRadius:4,cursor:uploading?'wait':'pointer',fontWeight:600}}
          >{uploading ? '업로드중…' : '+ 파일 추가'}</button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.hwp"
            onChange={e => handleFileUpload(e.target.files)}
            style={{display:'none'}}
          />
        </div>

        {assets.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--green-600)'; e.currentTarget.style.background='var(--green-50)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor='var(--line-2)'; e.currentTarget.style.background='var(--surface-2)'; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--line-2)'; e.currentTarget.style.background='var(--surface-2)'; handleFileUpload(e.dataTransfer.files); }}
            style={{padding:'20px 14px',border:'1.5px dashed var(--line-2)',background:'var(--surface-2)',borderRadius:6,textAlign:'center',color:'var(--ink-3)',fontSize:12,cursor:'pointer',transition:'all .15s'}}
          >
            <div style={{fontSize:24,marginBottom:4}}>📁</div>
            현장 사진·PDF·엑셀을<br/>여기로 드래그하거나 클릭
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {assets.map(a => (
              <div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',border:'1px solid var(--line)',borderRadius:6,fontSize:11.5,background:'#fff'}}>
                <span style={{fontSize:16,lineHeight:1}}>{fileIcon(a.type)}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:600,color:'var(--ink-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</div>
                  <div style={{fontSize:10,color:'var(--ink-3)'}}>{fmtSize(a.size)} · {new Date(a.uploadedAt).toLocaleDateString('ko-KR')}</div>
                </div>
                {a.dataUrl && (
                  <button onClick={() => openAsset(a)} title="열기"
                          style={{padding:'2px 6px',fontSize:10,background:'#fff',border:'1px solid var(--line)',borderRadius:3,cursor:'pointer',color:'var(--ink-2)'}}>보기</button>
                )}
                <button onClick={() => removeAsset(a.id)} title="삭제"
                        style={{padding:0,width:20,height:20,fontSize:14,background:'transparent',border:0,cursor:'pointer',color:'var(--danger)'}}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{marginTop:10,padding:'8px 10px',background:'var(--bronze-50)',borderRadius:6,border:'1px solid #ECD9AE',fontSize:10.5,color:'var(--bronze-800)',lineHeight:1.5}}>
        💡 첨부 파일은 <b>이 브라우저</b>에만 저장됩니다 (localStorage, 최대 5MB). 대용량·공유가 필요하면 Google Drive 링크를 이용하세요.
      </div>
    </div>
  );
};

// ─── 인라인 편집 가능한 필드 (계약 세부 정보용) ───
const InlineField = ({
  field, label, value, type='text', placeholder, mono, tag,
  inlineField, inlineValue, setInlineValue, onEdit, onSave, onCancel, saving,
  fullWidth, readOnly,
}) => {
  const editing = !readOnly && !!field && inlineField === field;
  return (
    <div className="field" style={fullWidth ? {gridColumn:'span 2', position:'relative'} : {position:'relative'}}>
      <div className="label" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
        <span>{label}</span>
        {!readOnly && field && !editing && (
          <button
            onClick={() => onEdit(field, value)}
            className="no-print"
            title="편집"
            style={{width:20,height:20,padding:0,border:'1px solid var(--line)',borderRadius:4,background:'#fff',cursor:'pointer',display:'grid',placeItems:'center',color:'var(--ink-3)',opacity:0.55,transition:'opacity .15s'}}
            onMouseEnter={e => e.currentTarget.style.opacity=1}
            onMouseLeave={e => e.currentTarget.style.opacity=0.55}
          >
            <Icon name="edit" size={10} stroke={2}/>
          </button>
        )}
      </div>
      {editing ? (
        <div style={{marginTop:4}}>
          <input
            type={type}
            value={inlineValue}
            onChange={e => setInlineValue(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter' && type!=='textarea') onSave(); if(e.key==='Escape') onCancel(); }}
            placeholder={placeholder}
            autoFocus
            className={mono ? 'mono' : ''}
            style={{width:'100%',padding:'6px 10px',fontSize:13,border:'1.5px solid var(--green-600)',borderRadius:5,background:'#fff',fontFamily:mono?'ui-monospace,Menlo,monospace':'inherit'}}
          />
          <div style={{display:'flex',gap:4,marginTop:4}}>
            <button onClick={onSave} disabled={saving} style={{flex:1,padding:'4px 8px',fontSize:11,fontWeight:700,background:'var(--green-800)',color:'#fff',border:0,borderRadius:4,cursor:saving?'wait':'pointer'}}>
              {saving ? '저장중…' : '저장'}
            </button>
            <button onClick={onCancel} disabled={saving} style={{padding:'4px 10px',fontSize:11,background:'#fff',color:'var(--ink-3)',border:'1px solid var(--line)',borderRadius:4,cursor:'pointer'}}>취소</button>
          </div>
        </div>
      ) : (
        <div className={"value " + (mono ? 'mono' : '')} style={{fontSize:13}}>
          {tag ? tag : (value || <span style={{color:'var(--ink-3)',fontWeight:400}}>미입력</span>)}
        </div>
      )}
    </div>
  );
};

// ─── 컴팩트 KPI 카드 (인라인 편집 지원) ───
const KpiCard = ({
  field, label, dotColor, value, valColor, sub, readOnly,
  inlineField, inlineValue, setInlineValue, onEdit, onSave, onCancel, saving,
  extraAction, // { label, icon, onClick, title } · 편집 버튼 옆에 추가 액션 버튼
}) => {
  // readOnly거나 field가 없으면 절대 편집 모드 진입 금지 (undefined===undefined 방지)
  const editing = !readOnly && !!field && inlineField === field;
  return (
    <div className="kpi tight kpi-mini" style={{position:'relative'}}>
      <div className="label" style={{fontSize:11}}>
        <span className="kdot" style={{background:dotColor}}></span>{label}
      </div>
      {editing ? (
        <div style={{marginTop:6}}>
          <input
            className="tnum"
            type="number"
            value={inlineValue}
            onChange={e => setInlineValue(e.target.value)}
            onKeyDown={e => { if(e.key==='Enter') onSave(); if(e.key==='Escape') onCancel(); }}
            autoFocus
            style={{width:'100%',padding:'4px 6px',fontSize:15,fontWeight:800,border:'1.5px solid var(--green-600)',borderRadius:5,textAlign:'right',background:'#fff',color:'var(--green-800)',letterSpacing:'-0.02em'}}
          />
          <div style={{display:'flex',gap:4,marginTop:4}}>
            <button onClick={onSave} disabled={saving} style={{flex:1,padding:'3px 6px',fontSize:10,fontWeight:700,background:'var(--green-800)',color:'#fff',border:0,borderRadius:4,cursor:saving?'wait':'pointer'}}>
              {saving ? '저장중…' : '저장'}
            </button>
            <button onClick={onCancel} disabled={saving} style={{padding:'3px 8px',fontSize:10,background:'#fff',color:'var(--ink-3)',border:'1px solid var(--line)',borderRadius:4,cursor:'pointer'}}>취소</button>
          </div>
        </div>
      ) : (
        <>
          <div className="val tnum" style={{fontSize:18,color:valColor||'var(--ink-1)',marginTop:6,lineHeight:1.15}}>
            {fmtKRW(value)}<span className="unit" style={{color:valColor||'var(--ink-3)'}}>원</span>
          </div>
          <div style={{fontSize:10.5,color:'var(--ink-3)',marginTop:5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{sub}</div>
          <div className="no-print" style={{position:'absolute',top:8,right:8,display:'flex',gap:4,alignItems:'center'}}>
          {!readOnly && field && (
            <button
              onClick={() => onEdit(field)}
              title="값 편집"
              className="no-print"
              style={{width:22,height:22,padding:0,border:'1px solid var(--line)',borderRadius:5,background:'#fff',cursor:'pointer',display:'grid',placeItems:'center',color:'var(--ink-3)',opacity:0.6,transition:'opacity .15s'}}
              onMouseEnter={e => e.currentTarget.style.opacity=1}
              onMouseLeave={e => e.currentTarget.style.opacity=0.6}
            >
              <Icon name="edit" size={11} stroke={2}/>
            </button>
          )}
          {extraAction && (
            <button
              onClick={extraAction.onClick}
              disabled={extraAction.disabled}
              title={extraAction.title || extraAction.label}
              className="no-print"
              style={{
                height:22,
                padding:'2px 8px',fontSize:10,fontWeight:700,
                border:'1px solid var(--pos, #22A96A)', borderRadius:5,
                background: extraAction.variant === 'done' ? 'var(--pos-soft, #E6F3EC)' : 'var(--pos, #22A96A)',
                color: extraAction.variant === 'done' ? 'var(--pos, #22A96A)' : '#fff',
                cursor: extraAction.disabled ? 'wait' : 'pointer',
                display:'inline-flex', alignItems:'center', gap:3,
              }}>
              {extraAction.icon}{extraAction.label}
            </button>
          )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── 계약 담당자 (관리자는 변경 가능) ───
const ManagerField = ({ contract, onUpdated }) => {
  const toast = window.useToast ? window.useToast() : null;
  const admin = typeof isAdmin === 'function' && isAdmin();
  const [users, setUsers] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!admin) return;
    apiClient.listUsers().then(r => setUsers((r.users || []).filter(u => u.status === 'active'))).catch(() => setUsers([]));
  }, [admin]);

  const current = contract.manager || '';
  if (!admin) return <span>담당자 · <b>{current || '—'}</b></span>;

  const names = [...new Set([current, ...(users || []).map(u => u.name)].filter(Boolean))];
  const change = async (name) => {
    if (!name || name === current) return;
    setSaving(true);
    try {
      await apiClient.setManager(contract.no, name);
      toast?.(`담당자를 ${name}(으)로 변경했습니다`, 'success');
      await onUpdated?.();
    } catch (e) {
      toast?.('담당자 변경 실패: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5}}>
      담당자 ·
      <select value={current} disabled={saving || !users} onChange={e => change(e.target.value)}
        style={{fontSize:12.5,fontWeight:700,padding:'2px 6px',border:'1px solid var(--line)',borderRadius:6,background:'#fff',color:'var(--ink-1)'}}>
        {names.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
    </span>
  );
};

const ScreenDetail = ({ data, contractNo, onBack, onOpenExpense, onUpdated, onSelectContract }) => {
  // contractNo는 실제로는 계약의 고유 id (중복 no 대응)
  const baseContract = data.contracts.find(x => (x.id ?? x.no) === contractNo);
  const toast = window.useToast ? window.useToast() : null;

  // 로컬 체크박스 오버라이드 (즉시 반응용)
  const [localChecks, setLocalChecks] = useState(null);
  const [localDates, setLocalDates] = useState({});   // 단계별로 고른 날짜 (저장 전)
  // 다른 계약으로 이동하면 저장 안 된 단계 선택·날짜 초기화
  useEffect(() => { setLocalChecks(null); setLocalDates({}); }, [contractNo]);
  const [saving, setSaving] = useState(false);

  // 편집 모드
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState({});
  // KPI 인라인 편집 (특정 필드 하나만 편집)
  const [inlineField, setInlineField] = useState(null); // 'totalAmount' | 'paidAmount' | ...
  const [inlineValue, setInlineValue] = useState('');
  // 제품대 엑셀 가져오기
  const [productImporting, setProductImporting] = useState(null); // 'drive' | 'local' | null
  const [productPreview, setProductPreview] = useState(null); // { totalMaterial, totalList, effectiveDc, itemCount, filename }
  // 현장설치정보 모달
  const [siteInfoModalOpen, setSiteInfoModalOpen] = useState(false);
  // 수금 관리 모달
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  // 비고 · 메모 (직접 입력 · 자동 재조립 없음)
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // 계약 바뀌면 로컬 상태 리셋
  useEffect(() => {
    setLocalChecks(null);
    setEditMode(false);
    setEdits({});
    setProductPreview(null);
    setInlineField(null);
    setSiteInfoModalOpen(false);
    setPaymentModalOpen(false);
    setNoteEditing(false);
    setNoteDraft('');
  }, [contractNo]);

  if (!baseContract) return (
    <>
      <button className="back-btn" onClick={onBack}><Icon name="chevronLeft" size={14}/>계약 리스트로</button>
      <div className="card"><div className="empty">계약을 찾을 수 없습니다.</div></div>
    </>
  );

  const CHECK_KEYS = ['배관','실내기','실외기','시운전','인수인계'];
  const checks = localChecks || baseContract.checks;
  const doneCount = CHECK_KEYS.filter(k => checks[k]).length;
  const localProgress = doneCount / CHECK_KEYS.length;

  const c = { ...baseContract, checks, progress: localProgress };
  const paidPct = c.totalAmount > 0 ? c.paidAmount / c.totalAmount : 0;

  // 단계 선택: 화면에서만 바꾸고, [저장] 을 눌러야 한 번에 저장
  const checksEditable = typeof canEdit !== 'function' || canEdit();
  const savedDates = baseContract.checkDates || {};
  const changedKeys = CHECK_KEYS.filter(k => !!checks[k] !== !!(baseContract.checks || {})[k]);
  // 이미 완료된 단계에서 날짜만 바꾼 경우
  const dateChangedKeys = CHECK_KEYS.filter(k => checks[k] && !changedKeys.includes(k) && localDates[k] && localDates[k] !== savedDates[k]);
  const pendingCount = changedKeys.length + dateChangedKeys.length;
  const checksDirty = pendingCount > 0;
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const toggleCheck = (key) => {
    if (!checksEditable) { toast?.('조회 권한만 있습니다', 'error'); return; }
    setLocalChecks({ ...checks, [key]: !checks[key] });
  };
  const cancelChecks = () => { setLocalChecks(null); setLocalDates({}); };
  const saveChecks = async () => {
    if (!checksDirty || saving) return;
    const patch = {};
    changedKeys.forEach(k => { patch['chk' + k] = !!checks[k]; });
    // 날짜: 고른 날짜, 안 고르면 저장하는 날(오늘)
    const checkDates = {};
    changedKeys.forEach(k => { if (checks[k]) checkDates[k] = localDates[k] || todayStr; });
    dateChangedKeys.forEach(k => { checkDates[k] = localDates[k]; });
    setSaving(true);
    try {
      await apiClient.updateContract(baseContract.no, patch, checkDates);
      toast?.(`공사 진행 ${pendingCount}건 저장 완료`, 'success');
      await onUpdated?.();
      setLocalChecks(null);
      setLocalDates({});
    } catch (e) {
      toast?.('저장 실패: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  // 저장하지 않은 단계 변경이 있으면 목록으로 나갈 때 확인
  const handleBack = () => {
    if (checksDirty && !window.confirm('공사 진행 단계 변경이 저장되지 않았습니다. 저장하지 않고 나갈까요?')) return;
    onBack?.();
  };

  // ─── 설치비(도급비) 지급완료 ───
  const subRemain = Math.max(0, (c.subcontractAmount || 0) - (c.subcontractPaid || 0));
  const subPaidDone = c.subcontractAmount > 0 && subRemain === 0;
  const saveSubcontractPaid = async (amount, okMsg) => {
    setSaving(true);
    try {
      await apiClient.updateContract(baseContract.no, { subcontractPaid: amount });
      toast?.(okMsg, 'success');
      await onUpdated?.();
    } catch (e) {
      toast?.('저장 실패: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const markSubcontractPaid = () => {
    if (saving) return;
    const msg = `도급비 ${fmtKRW(c.subcontractAmount)}원을 전액 지급완료로 처리할까요?`
      + `\n(지급액 ${fmtKRW(c.subcontractPaid || 0)}원 → ${fmtKRW(c.subcontractAmount)}원, 잔액 0원)`;
    if (!window.confirm(msg)) return;
    saveSubcontractPaid(c.subcontractAmount, '설치비(도급비) 지급완료 처리했습니다');
  };
  const undoSubcontractPaid = () => {
    if (saving) return;
    const v = window.prompt(`지급완료를 취소합니다.\n실제 지급한 금액을 입력하세요 (원, 도급비 ${fmtKRW(c.subcontractAmount)}원)`, '0');
    if (v == null) return;
    const amount = Number(String(v).replace(/[^0-9]/g, '')) || 0;
    if (amount >= c.subcontractAmount) { toast?.('도급비보다 적은 금액을 입력하세요', 'error'); return; }
    saveSubcontractPaid(amount, `지급액을 ${fmtKRW(amount)}원으로 변경했습니다`);
  };

  // 해당 거래처의 다른 계약
  const otherByClient = data.contracts.filter(x => x.client === c.client && (x.id ?? x.no) !== (c.id ?? c.no)).slice(0, 4);

  // 같은 거래처의 다른 계약으로 이동 (저장 안 된 공사 진행 변경이 있으면 확인)
  const openOtherContract = (o) => {
    if (checksDirty && !window.confirm('공사 진행 단계 변경이 저장되지 않았습니다. 저장하지 않고 이동할까요?')) return;
    onSelectContract?.(o.id ?? o.no);
  };

  // ─── 출력 (인쇄) ───
  const handlePrint = () => window.print();

  // 거래처 매핑 (사업자등록번호 등)
  const clientInfo = (data.clients || []).find(cl => cl.name === c.client) || {};

  // 거래처 수정용 드롭다운 목록 (거래처관리 + 기존 계약에 쓰인 이름 통합, 없으면 직접 입력 가능)
  const clientOptions = useMemo(() => {
    const names = new Set();
    (data.clients || []).forEach(cl => { if (cl.name) names.add(cl.name); });
    (data.contracts || []).forEach(x => { if (x.client) names.add(x.client); });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [data.clients, data.contracts]);

  // ─── 편집 모드 토글 ───
  const toDateInputValue = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const startEdit = () => {
    setEdits({
      projectName: c.projectName || '',
      client: c.client || '',
      contractDate: toDateInputValue(c.contractDate),
      totalAmount: c.totalAmount || 0,
      paidAmount: c.paidAmount || 0,
      taxInvoiceIssued: c.taxInvoiceIssued || 0,
      taxInvoicePending: c.taxInvoicePending || 0,
      subcontractor: c.subcontractor || '',
      subcontractAmount: c.subcontractAmount || 0,
      subcontractPaid: c.subcontractPaid || 0,
      productCost: c.productCost || 0,
      productCostNote: c.productCostNote || '',
      salesCost: c.salesCost || 0,
      incidental: c.incidental || 0,
      note: c.note || '',
    });
    setEditMode(true);
    setProductPreview(null);
  };
  const cancelEdit = () => {
    setEditMode(false);
    setEdits({});
    setProductPreview(null);
  };
  const setEdit = (k, v) => setEdits(prev => ({ ...prev, [k]: v }));

  // ─── 통합 저장 ───
  // ⚠️ 과거에는 여기서 현장주소·담당자를 "비고" 문자열에 재조립해 덧붙였는데,
  //    저장할 때마다 기존 비고 앞에 새로 조립한 블록이 계속 쌓여(중복) 비고가
  //    끝없이 길어지는 버그가 있었다. 현장주소·담당자·도면은 이제 별도의
  //    "🏗️ 현장설치정보" 모달(siteInfo·drawing 필드)에서만 관리하고, 비고는
  //    사용자가 직접 입력한 텍스트(edits.note)를 그대로 저장한다(자동 재조립 없음).
  const saveEdit = async () => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) {
      toast?.('API URL이 설정되지 않았습니다. 로컬에서만 반영됩니다.', 'default');
      setEditMode(false);
      return;
    }
    setSaving(true);
    try {
      const patch = { ...edits };
      ['totalAmount','paidAmount','taxInvoiceIssued','taxInvoicePending','subcontractAmount','subcontractPaid','productCost','salesCost','incidental'].forEach(k => {
        patch[k] = Number(patch[k]) || 0;
      });
      await apiClient.updateContract(baseContract.no, patch);
      toast?.('저장 완료', 'success');
      setEditMode(false);
      onUpdated?.();
    } catch (e) {
      toast?.('저장 실패: ' + (e.message || '알 수 없는 오류'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── 인라인 편집: 개별 필드 저장 (KPI + 세부정보 공통) ───
  const FIELD_LABELS = {
    totalAmount: '총 계약금',
    paidAmount: '수금액',
    productCost: '제품대',
    subcontractAmount: '설치비',
    salesCost: '영업 수수료',
    incidental: '기타 경비',
    projectName: '프로젝트명',
    client: '거래처',
    contractDate: '계약월',
    subcontractor: '도급업체',
    subcontractPaid: '기성 완료',
    taxInvoiceIssued: '세금계산서 발행액',
    taxInvoicePending: '세금계산서 미발행액',
    note: '비고',
  };
  const NUMERIC_FIELDS = new Set(['totalAmount','paidAmount','productCost','subcontractAmount','salesCost','incidental','subcontractPaid','taxInvoiceIssued','taxInvoicePending']);

  const startInlineEdit = (field, initialValue) => {
    setInlineField(field);
    if (initialValue !== undefined) {
      setInlineValue(String(initialValue));
    } else {
      setInlineValue(String(c[field] ?? ''));
    }
  };
  const cancelInlineEdit = () => {
    setInlineField(null);
    setInlineValue('');
  };
  const saveInlineEdit = async () => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) {
      toast?.('API URL이 설정되지 않았습니다', 'error');
      return;
    }
    setSaving(true);
    try {
      let patch;
      if (NUMERIC_FIELDS.has(inlineField)) {
        patch = { [inlineField]: Number(inlineValue) || 0 };
      } else {
        patch = { [inlineField]: inlineValue };
      }
      await apiClient.updateContract(baseContract.no, patch);
      toast?.(`${FIELD_LABELS[inlineField] || inlineField} 저장 완료`, 'success');
      setInlineField(null);
      onUpdated?.();
    } catch (e) {
      toast?.('저장 실패: ' + (e.message || '알 수 없는 오류'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── 비고 · 메모 (직접 입력 · 저장) ───
  // 자동으로 현장주소/담당자/도면 등을 조합해 넣지 않는다 — 사용자가 쓴 텍스트를 그대로 저장한다.
  const startNoteEdit = () => {
    setNoteDraft(c.note || '');
    setNoteEditing(true);
  };
  const cancelNoteEdit = () => {
    setNoteEditing(false);
    setNoteDraft('');
  };
  const saveNote = async (valueOverride) => {
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) {
      toast?.('API URL이 설정되지 않았습니다', 'error');
      return;
    }
    const value = valueOverride !== undefined ? valueOverride : noteDraft;
    setNoteSaving(true);
    try {
      await apiClient.updateContract(baseContract.no, { note: value });
      toast?.('비고 저장 완료', 'success');
      setNoteEditing(false);
      onUpdated?.();
    } catch (e) {
      toast?.('저장 실패: ' + (e.message || '알 수 없는 오류'), 'error');
    } finally {
      setNoteSaving(false);
    }
  };
  const clearNote = () => {
    if (!confirm('비고 내용을 모두 지우고 저장할까요? (되돌릴 수 없습니다)')) return;
    setNoteDraft('');
    saveNote('');
  };

  // ─── 제품대 엑셀 가져오기 ───
  const importProductFromXlsx = async (mode) => {
    setProductImporting(mode);
    try {
      const picker = mode === 'drive' ? pickFromDrive : pickFromLocal;
      const picked = await picker();
      if (!picked || !picked.blob) throw new Error('파일을 가져오지 못했습니다');
      const { blob, filename } = picked;
      const { firstSheet } = await xlsxToSheets(blob);
      const { items, summary } = parseProductXlsx(firstSheet);
      if (items.length === 0) throw new Error('가져올 수 있는 항목이 없습니다. 파일 형식을 확인하세요.');
      // 편집 상태에 제품대 = 재료비 합계로 자동 입력
      setEdit('productCost', Math.round(summary.totalMaterial));
      setEdit('productCostNote', `${filename} · ${items.length}건 · DC ${(summary.effectiveDc*100).toFixed(1)}%`);
      setProductPreview({
        totalMaterial: summary.totalMaterial,
        totalList: summary.totalList,
        effectiveDc: summary.effectiveDc,
        itemCount: items.length,
        filename,
      });
      toast?.(`제품대 ${Math.round(summary.totalMaterial).toLocaleString()}원 자동 입력`, 'success');
    } catch (e) {
      const msg = e && (e.message || e.error) || '알 수 없는 오류';
      console.error('[importProduct]', e);
      if (!/취소/.test(msg)) toast?.('가져오기 실패: ' + msg, 'error');
    } finally {
      setProductImporting(null);
    }
  };

  return (
    <>
      <button className="back-btn" onClick={handleBack}><Icon name="chevronLeft" size={14}/>계약 리스트로</button>

      <div className="detail-head">
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span style={{fontSize:12,color:'var(--ink-3)',fontWeight:600,letterSpacing:'0.05em'}}>계약 {contractCode(c)}{c.managerCode && <span style={{fontWeight:500,opacity:.7,marginLeft:5}}>· 전체 #{String(c.no).padStart(4,'0')}</span>}</span>
            <CatTag cat={c.category}/>
            <StatusPill status={c.status}/>
          </div>
          {!editMode ? (
            <>
              <h1>{c.projectName || '(프로젝트명 없음)'}</h1>
              <div className="meta">
                <span>거래처 · <b>{c.client}</b></span>
                <ManagerField contract={c} onUpdated={onUpdated}/>
                <span>계약일 · <b>{fmtDate(c.contractDate)}</b></span>
                {c.subcontractor && <span>도급 · <b>{c.subcontractor}</b></span>}
              </div>
            </>
          ) : (
            <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',marginTop:2}}>
              <input
                value={edits.projectName}
                onChange={e => setEdit('projectName', e.target.value)}
                placeholder="공사명(프로젝트명)"
                style={{flex:'1 1 260px',minWidth:180,padding:'7px 10px',border:'1px solid var(--line)',borderRadius:7,fontSize:15,fontWeight:800,color:'var(--ink-1)',background:'#fff'}}
              />
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>거래처</span>
                <input
                  list="detail-client-list"
                  value={edits.client}
                  onChange={e => setEdit('client', e.target.value)}
                  placeholder="거래처명 입력 또는 목록에서 선택"
                  style={{width:170,padding:'6px 9px',border:'1px solid var(--line)',borderRadius:7,fontSize:12.5,background:'#fff'}}
                />
                <datalist id="detail-client-list">
                  {clientOptions.map(name => <option key={name} value={name}/>)}
                </datalist>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>계약일</span>
                <input
                  type="date"
                  value={edits.contractDate}
                  onChange={e => setEdit('contractDate', e.target.value)}
                  style={{padding:'6px 9px',border:'1px solid var(--line)',borderRadius:7,fontSize:12.5,fontFamily:'ui-monospace,Menlo,monospace',background:'#fff'}}
                />
              </div>
              <div style={{display:'flex',alignItems:'center',gap:5}}>
                <span style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>도급업체</span>
                <input
                  value={edits.subcontractor}
                  onChange={e => setEdit('subcontractor', e.target.value)}
                  placeholder="도급업체명 (직시공이면 비워둠)"
                  style={{width:170,padding:'6px 9px',border:'1px solid var(--line)',borderRadius:7,fontSize:12.5,background:'#fff'}}
                />
              </div>
            </div>
          )}
        </div>
        <div className="actions no-print">
          {!editMode ? (
            <>
              <button className="btn-ghost" onClick={handlePrint}>
                <Icon name="print" size={14}/>출력
              </button>
              <button className="btn-ghost" onClick={() => setSiteInfoModalOpen(true)} title="현장설치정보 입력·수정">
                <span style={{fontSize:14}}>🏗️</span>현장설치정보
              </button>
              <button className="btn-ghost" onClick={startEdit}>
                <Icon name="edit" size={14}/>수정
              </button>
              {c.subcontractor && (
                <button className="btn-primary" onClick={() => onOpenExpense && onOpenExpense(c)}>
                  <Icon name="file" size={14}/>지출품의서 생성
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={cancelEdit} disabled={saving}>
                취소
              </button>
              <button className="btn-primary" onClick={saveEdit} disabled={saving}>
                <Icon name="check" size={14} stroke={2.4}/>{saving ? '저장 중…' : '저장'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI · 수입 (상단 4칸, 컴팩트) */}
      <div className="kpis kpi-row kpi-compact" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <KpiCard
          field="totalAmount" label="총 계약금" dotColor="var(--green-600)"
          value={c.totalAmount} sub="부가세 포함"
          inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
          onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
        />
        <KpiCard
          field="paidAmount" label="수금액" dotColor="var(--pos)"
          value={c.paidAmount} valColor="var(--pos)"
          sub={<>수금률 <b style={{color:'var(--ink-1)'}}>{fmtPct(paidPct)}</b></>}
          inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
          onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
          extraAction={{
            label: '＄ 관리',
            title: '수금 회차별 누적 관리 (금액 · 날짜 · 방법 · 비고)',
            onClick: () => setPaymentModalOpen(true),
          }}
        />
        <KpiCard
          label="미수 잔금" dotColor="var(--bronze-500)"
          value={c.balance} valColor={c.balance>0?'var(--danger)':'var(--ink-3)'}
          sub={c.balance > 0 ? '수금 필요' : '완결'}
          readOnly
        />
        <KpiCard
          label="영업 이윤" dotColor="var(--green-700)"
          value={c.profit}
          sub={<>마진율 <b style={{color:c.marginRate>=0.15?'var(--pos)':'var(--ink-1)'}}>{fmtPct(c.marginRate)}</b></>}
          readOnly
        />
      </div>

      {/* KPI · 비용 상세 (하단 4칸, 컴팩트) */}
      <div className="kpis kpi-row kpi-compact" style={{gridTemplateColumns:'repeat(4,1fr)',marginTop:8}}>
        <KpiCard
          field="productCost" label="제품대 (장비대)" dotColor="#8f6d3a"
          value={c.productCost}
          sub={c.productCost > 0
            ? `총액 대비 ${fmtPct(c.totalAmount>0 ? c.productCost/c.totalAmount : 0)}`
            : (c.productCostNote ? `📎 ${c.productCostNote}` : '미입력')}
          inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
          onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
        />
        <KpiCard
          field="subcontractAmount" label="설치비 (도급비)" dotColor="#8f6d3a"
          value={c.subcontractAmount}
          sub={[
            c.subcontractor ? `→ ${c.subcontractor}` : '직시공',
            c.subcontractAmount > 0 && (subPaidDone ? '지급완료' : `지급 ${fmtKRW(c.subcontractPaid || 0)} · 잔액 ${fmtKRW(subRemain)}`),
          ].filter(Boolean).join(' · ')}
          inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
          onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
          extraAction={c.subcontractAmount > 0 && (typeof canEdit !== 'function' || canEdit()) ? (subPaidDone ? {
            label: '✓ 지급완료', variant: 'done', disabled: saving,
            title: '지급완료 처리됨 · 누르면 지급액을 다시 입력할 수 있습니다',
            onClick: undoSubcontractPaid,
          } : {
            label: '지급완료', disabled: saving,
            title: '도급비 전액을 지급완료로 처리 (지출·기성 관리에 정산완료로 표시)',
            onClick: markSubcontractPaid,
          }) : null}
        />
        <KpiCard
          field="salesCost" label="영업 수수료" dotColor="#8f6d3a"
          value={c.salesCost}
          sub={c.salesCost > 0 ? `계약 대비 ${fmtPct(c.totalAmount>0 ? c.salesCost/c.totalAmount : 0)}` : '없음'}
          inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
          onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
        />
        <KpiCard
          field="incidental" label="기타 경비" dotColor="#8f6d3a"
          value={c.incidental}
          sub={c.incidental > 0 ? '부대비용' : '없음'}
          inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
          onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
        />
      </div>

      {/* 진행률 바 (컴팩트) */}
      <div className="card progress-compact" style={{marginBottom:12,padding:'14px 18px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:8}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'var(--ink-1)',letterSpacing:'-0.02em',display:'flex',alignItems:'center',gap:8}}>
              공사 진행률
              {saving && <span style={{fontSize:11,fontWeight:500,color:'var(--ink-3)'}}>· 저장 중…</span>}
            </div>
            <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>
              단계를 모두 선택한 뒤 저장 · 날짜를 안 고르면 저장한 날로 기록 · <b style={{color:'var(--ink-2)'}}>{doneCount}/5</b> 완료
            </div>
          </div>
          {checksDirty && (
            <div className="no-print" style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto',marginRight:16}}>
              <span style={{fontSize:11.5,color:'var(--warn, #9A6A1E)',fontWeight:600}}>저장 안 된 변경 {pendingCount}건</span>
              <button type="button" className="btn-ghost" onClick={cancelChecks} disabled={saving} style={{height:32,fontSize:12,padding:'0 12px'}}>취소</button>
              <button type="button" className="btn-primary" onClick={saveChecks} disabled={saving} style={{height:32,fontSize:12,padding:'0 14px'}}>
                <Icon name="check" size={13} stroke={2.4}/>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          )}
          <div style={{fontSize:22,fontWeight:800,color:'var(--green-800)',letterSpacing:'-0.03em'}} className="tnum">
            {Math.round(c.progress * 100)}<span style={{fontSize:12,color:'var(--ink-3)',marginLeft:2}}>%</span>
          </div>
        </div>
        <div className="pbar"><div className="pfill" style={{width: (c.progress * 100) + '%', transition:'width .25s ease-out'}}/></div>

        <div className="checks">
          {CHECK_KEYS.map(k => {
            const done = c.checks[k];
            const dateVal = localDates[k] || (changedKeys.includes(k) ? '' : (savedDates[k] || ''));
            return (
              <div key={k} style={{display:'flex',flexDirection:'column',gap:4,minWidth:0}}>
              <button
                type="button"
                onClick={() => toggleCheck(k)}
                disabled={saving}
                className={`check ${done ? 'done' : ''}`}
                style={{
                  border:'1px solid ' + (done ? '#C9DFD1' : 'var(--line)'),
                  background: done ? 'var(--pos-soft)' : 'var(--surface-2)',
                  cursor: saving ? 'wait' : 'pointer',
                  fontFamily:'inherit',
                  transition:'all .15s',
                  outline:'none',
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(20,25,20,.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <div className="cbox">{done ? <Icon name="check" size={16} stroke={2.6}/> : ''}</div>
                <div className="clabel">{k}</div>
              </button>
              {done ? (
                <input type="date" value={dateVal} max="2100-12-31"
                  disabled={saving || !checksEditable}
                  onChange={e => setLocalDates(d => ({ ...d, [k]: e.target.value }))}
                  title={dateVal ? `${k} 완료일` : '비워두면 저장한 날짜로 기록됩니다'}
                  aria-label={`${k} 완료일`}
                  style={{width:'100%',minWidth:0,boxSizing:'border-box',padding:'4px 6px',fontSize:11.5,border:'1px solid ' + (localDates[k] && localDates[k] !== savedDates[k] ? 'var(--green-600)' : 'var(--line)'),borderRadius:6,background:'#fff',color: dateVal ? 'var(--ink-2)' : 'var(--ink-4)'}}/>
              ) : (
                <div style={{height:27}}/>
              )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 진행 타임라인 (공사 진행률 아래, 전체 폭, 가로 배치) */}
      <div className="card" style={{marginBottom:12,padding:'16px 20px'}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:'var(--ink-1)'}}>진행 타임라인</div>
          <div style={{fontSize:11,color:'var(--ink-3)'}}>공정 단계별 이력</div>
        </div>
        <div className="timeline-h">
          <div className={`tlh-item ${c.progress > 0 ? 'done' : ''}`}>
            <div className="tlh-dot"></div>
            <div className="tlh-date">{fmtDate(c.contractDate)}</div>
            <div className="tlh-title">계약 체결</div>
            <div className="tlh-desc">{c.category} · {fmtKRW억(c.totalAmount)}</div>
          </div>
          <div className={`tlh-item ${c.checks.배관 ? 'done' : c.progress > 0 ? 'now' : ''}`}>
            <div className="tlh-dot"></div>
            <div className="tlh-date">{savedDates.배관 ? `착공 · ${fmtDate(savedDates.배관)}` : '착공'}</div>
            <div className="tlh-title">배관·실내기·실외기</div>
            <div className="tlh-desc">{Object.entries(c.checks).slice(0,3).filter(([k,v])=>v).map(([k])=>k).join('·') || '진행 전'}</div>
          </div>
          <div className={`tlh-item ${c.checks.시운전 ? 'done' : c.checks.실외기 ? 'now' : ''}`}>
            <div className="tlh-dot"></div>
            <div className="tlh-date">{savedDates.시운전 ? `시운전 · ${fmtDate(savedDates.시운전)}` : '시운전'}</div>
            <div className="tlh-title">시운전 및 검수</div>
            <div className="tlh-desc">{c.checks.시운전 ? '검수 완료' : '대기'}</div>
          </div>
          <div className={`tlh-item ${c.checks.인수인계 ? 'done' : c.checks.시운전 ? 'now' : ''}`}>
            <div className="tlh-dot"></div>
            <div className="tlh-date">{savedDates.인수인계 ? `준공 · ${fmtDate(savedDates.인수인계)}` : '준공'}</div>
            <div className="tlh-title">인수인계</div>
            <div className="tlh-desc">{c.checks.인수인계 ? '완료' : '완료 전'}</div>
          </div>
          <div className={`tlh-item ${c.balance === 0 ? 'done' : c.paidAmount > 0 ? 'now' : ''}`}>
            <div className="tlh-dot"></div>
            <div className="tlh-date">정산</div>
            <div className="tlh-title">잔금 수금</div>
            <div className="tlh-desc">{c.balance === 0 ? '정산 완료' : `잔금 ${fmtKRW억(c.balance)} 필요`}</div>
          </div>
        </div>
      </div>

      {/* 재무 정보 + 현장 자료 업로드 */}
      <div className="detail-grid">
        <div className="card pad-lg">
          <CardHead title="계약 세부 정보" sub="각 항목을 클릭 편집하거나 아이콘으로 수정할 수 있습니다"/>
          <div className="field-grid">
            <div className="field">
              <div className="label">계약번호</div>
              <div className="value mono">{contractCode(c)}</div>
            </div>
            <InlineField
              field="contractDate" label="계약월" type="date"
              value={c.contractDate ? c.contractDate.substring(0,10) : ''}
              mono
              inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
              onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
            />
            <InlineField
              field="client"
              label={<>거래처{clientInfo.bizNo ? <span style={{fontSize:10.5,color:'var(--ink-3)',marginLeft:6,fontWeight:500,letterSpacing:0}}>· {clientInfo.bizNo}</span> : ''}</>}
              value={<b>{c.client}</b>}
              inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
              onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
            />
            <div className="field">
              <div className="label">사업 부문</div>
              <div className="value"><CatTag cat={c.category}/></div>
            </div>

            {/* 프로젝트명 */}
            <InlineField
              field="projectName" label="프로젝트명" value={c.projectName}
              fullWidth
              inlineField={inlineField} inlineValue={inlineValue} setInlineValue={setInlineValue}
              onEdit={startInlineEdit} onSave={saveInlineEdit} onCancel={cancelInlineEdit} saving={saving}
            />

            {/* 현장설치정보 요약 카드 (박스 옆 버튼으로 모달 열기) */}
            <div className="field" style={{gridColumn:'span 2', marginTop:4}}>
              <SiteInfoSummaryCard
                contract={c}
                onEdit={() => setSiteInfoModalOpen(true)}
              />
            </div>

            <div className="field" style={{gridColumn:'span 2',borderTop:'1px solid var(--line)',paddingTop:16,marginTop:4}}>
              <div className="label" style={{marginBottom:8}}>금액 구성</div>
              <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
                  <span style={{color:'var(--ink-3)'}}>총 계약금</span>
                  <b className="tnum" style={{fontSize:14}}>{fmtKRW(c.totalAmount)}원</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:'var(--pos)'}}>
                  <span>├ 입금액</span>
                  <b className="tnum">+ {fmtKRW(c.paidAmount)}원</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:c.balance>0?'var(--danger)':'var(--ink-3)'}}>
                  <span>└ 미수 잔금</span>
                  <b className="tnum">{c.balance > 0 ? `− ${fmtKRW(c.balance)}원` : '완결'}</b>
                </div>
                <div style={{borderTop:'1px dashed var(--line-2)',marginTop:6,paddingTop:8,display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--ink-3)'}}>
                  <span>세금계산서 발행 완료</span>
                  <b className="tnum" style={{color:'var(--ink-1)'}}>{fmtKRW(c.taxInvoiceIssued)}원</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--warn)',marginTop:2}}>
                  <span>세금계산서 미발행</span>
                  <b className="tnum">{fmtKRW(c.taxInvoicePending)}원</b>
                </div>
              </div>
            </div>

            <div className="field" style={{gridColumn:'span 2',borderTop:'1px solid var(--line)',paddingTop:16,marginTop:4}}>
              <div className="label" style={{marginBottom:8}}>도급 및 원가</div>
              {c.subcontractor ? (
                <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
                    <span style={{color:'var(--ink-3)'}}>도급업체</span>
                    <b style={{fontSize:13,color:'var(--ink-1)'}}>{c.subcontractor}</b>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
                    <span style={{color:'var(--ink-3)'}}>도급금액</span>
                    <b className="tnum">{fmtKRW(c.subcontractAmount)}원</b>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:'var(--pos)'}}>
                    <span>├ 기성 완료</span>
                    <b className="tnum">+ {fmtKRW(c.subcontractPaid)}원</b>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:c.subcontractBalance>0?'var(--warn)':'var(--ink-3)'}}>
                    <span>└ 기성 잔액</span>
                    <b className="tnum">{c.subcontractBalance > 0 ? `− ${fmtKRW(c.subcontractBalance)}원` : '완결'}</b>
                  </div>
                </div>
              ) : (
                <div style={{padding:'14px 16px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,color:'var(--ink-3)',fontSize:13}}>도급업체 없음 (직시공)</div>
              )}
              {/* 제품대 (장비대) 섹션 */}
              <div style={{marginTop:14,padding:'14px 16px',background:editMode?'var(--green-25)':'var(--surface-2)',border:'1px solid '+(editMode?'#D3DCD3':'var(--line)'),borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:editMode?10:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:12.5,color:'var(--ink-3)',fontWeight:600}}>제품대 (장비대)</span>
                    {editMode && productPreview && (
                      <span style={{fontSize:10.5,color:'var(--green-800)',background:'var(--green-50)',padding:'2px 8px',borderRadius:10,border:'1px solid #D3DCD3',fontWeight:600}}>
                        📄 {productPreview.filename} · {productPreview.itemCount}건 · DC {(productPreview.effectiveDc*100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {!editMode ? (
                    <b className="tnum" style={{fontSize:14,color:'var(--ink-1)'}}>
                      {c.productCost > 0 ? fmtKRW(c.productCost) + '원' : (c.productCostNote || '미입력')}
                    </b>
                  ) : (
                    <div style={{display:'flex',gap:6}}>
                      <button
                        onClick={() => importProductFromXlsx('drive')}
                        disabled={!!productImporting}
                        title={hasDriveCredentials?.() ? 'Google Drive에서 제품내역서 선택' : '설정 화면에서 Drive 인증 정보를 먼저 등록하세요'}
                        style={{height:26,padding:'0 10px',fontSize:11,fontWeight:600,border:'1px solid #c8dbe5',background:productImporting==='drive'?'var(--surface-2)':'#f0f7fb',color:'#1a5490',borderRadius:6,cursor:productImporting?'wait':'pointer',position:'relative'}}>
                        {productImporting==='drive' ? '⏳ ...' : '📁 Drive'}
                        {!hasDriveCredentials?.() && <span style={{position:'absolute',top:-3,right:-3,width:6,height:6,borderRadius:'50%',background:'var(--warn)',border:'1.5px solid #fff'}}/>}
                      </button>
                      <button
                        onClick={() => importProductFromXlsx('local')}
                        disabled={!!productImporting}
                        style={{height:26,padding:'0 10px',fontSize:11,fontWeight:600,border:'1px solid var(--line)',background:productImporting==='local'?'var(--surface-2)':'#fff',color:'var(--ink-2)',borderRadius:6,cursor:productImporting?'wait':'pointer'}}>
                        {productImporting==='local' ? '⏳ ...' : '💻 PC 파일'}
                      </button>
                    </div>
                  )}
                </div>
                {editMode && (
                  <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'center'}}>
                    <input
                      type="number"
                      className="tnum"
                      value={edits.productCost || 0}
                      onChange={e => setEdit('productCost', e.target.value)}
                      placeholder="제품대 금액 (원)"
                      style={{width:'100%',padding:'8px 12px',border:'1px solid var(--line)',borderRadius:8,fontSize:13,textAlign:'right',background:'#fff'}}
                    />
                    <span style={{fontSize:12,color:'var(--ink-3)'}}>원</span>
                  </div>
                )}
                {editMode && productPreview && (
                  <div style={{marginTop:10,paddingTop:10,borderTop:'1px dashed var(--line-2)',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,fontSize:11}}>
                    <div>
                      <div style={{color:'var(--ink-3)',fontWeight:600}}>재료비 (실 원가)</div>
                      <b className="tnum" style={{color:'var(--green-800)'}}>{fmtKRW(productPreview.totalMaterial)}원</b>
                    </div>
                    <div>
                      <div style={{color:'var(--ink-3)',fontWeight:600}}>출고가 (정가)</div>
                      <b className="tnum" style={{color:'var(--ink-2)'}}>{fmtKRW(productPreview.totalList)}원</b>
                    </div>
                    <div>
                      <div style={{color:'var(--ink-3)',fontWeight:600}}>실효 DC율</div>
                      <b className="tnum" style={{color:'var(--bronze-800)'}}>{(productPreview.effectiveDc*100).toFixed(1)}%</b>
                    </div>
                  </div>
                )}
                {editMode && edits.productCostNote && !productPreview && (
                  <input
                    value={edits.productCostNote}
                    onChange={e => setEdit('productCostNote', e.target.value)}
                    placeholder="비고 (예: 견적서 참조)"
                    style={{width:'100%',marginTop:8,padding:'6px 10px',border:'1px solid var(--line)',borderRadius:6,fontSize:12,background:'#fff'}}
                  />
                )}
                {!editMode && c.productCostNote && (
                  <div style={{marginTop:6,fontSize:11.5,color:'var(--ink-3)'}}>📎 {c.productCostNote}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="vstack">
          {/* 현장 자료 폴더 (Drive 연동) */}
          <SiteFoldersCard contract={c}/>

          {/* 같은 거래처 계약 */}
          {otherByClient.length > 0 && (
            <div className="card">
              <CardHead title={`${c.client}의 다른 계약`} sub={`총 ${otherByClient.length + 1}건 진행 이력`}/>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {otherByClient.map(o => (
                  <div key={o.id ?? o.no}
                    role="button" tabIndex={0}
                    title="이 계약으로 이동"
                    onClick={() => openOtherContract(o)}
                    onKeyDown={e => { if (e.key === 'Enter') openOtherContract(o); }}
                    style={{padding:'10px 12px',border:'1px solid var(--line)',borderRadius:9,fontSize:12.5,cursor:'pointer',transition:'border-color .15s, box-shadow .15s'}}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green-600)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(20,25,20,.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = ''; }}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontSize:11,color:'var(--ink-4)',fontWeight:600,whiteSpace:'nowrap'}}>{contractCode(o)}</span>
                      <CatTag cat={o.category}/>
                      <StatusPill status={o.status}/>
                    </div>
                    <div style={{fontWeight:600,color:'var(--ink-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.01em'}}>{o.projectName}</div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11.5,color:'var(--ink-3)'}}>
                      <span>{fmtDate(o.contractDate)}</span>
                      <b className="tnum" style={{color:'var(--ink-2)'}}>{fmtKRW억(o.totalAmount)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <CardHead
              title="비고 · 메모"
              sub="자유롭게 입력해서 저장하는 메모입니다 (자동으로 채워지지 않습니다)"
              right={!noteEditing && (
                <div className="hstack no-print">
                  {c.note && <button className="btn-ghost" onClick={clearNote} disabled={noteSaving}>지우기</button>}
                  <button className="btn-ghost" onClick={startNoteEdit}><Icon name="edit" size={13} stroke={2}/>{c.note ? '수정' : '메모 추가'}</button>
                </div>
              )}
            />
            {noteEditing ? (
              <div>
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  autoFocus
                  rows={6}
                  placeholder="메모를 입력하세요 (예: 담당자 연락처, 현장 특이사항 등)"
                  style={{width:'100%',padding:'10px 14px',fontSize:13,color:'var(--ink-2)',lineHeight:1.6,border:'1.5px solid var(--green-600)',borderRadius:9,background:'#fff',resize:'vertical',fontFamily:'inherit'}}
                />
                <div className="hstack" style={{marginTop:8}}>
                  <button className="btn-primary" onClick={() => saveNote()} disabled={noteSaving}>
                    <Icon name="check" size={14} stroke={2.4}/>
                    {noteSaving ? '저장 중…' : '저장'}
                  </button>
                  <button className="btn-ghost" onClick={cancelNoteEdit} disabled={noteSaving}>취소</button>
                </div>
              </div>
            ) : c.note ? (
              <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.6,padding:'10px 14px',background:'var(--surface-2)',borderRadius:9,border:'1px solid var(--line)',whiteSpace:'pre-wrap'}}>{c.note}</div>
            ) : (
              <div style={{fontSize:12.5,color:'var(--ink-4)',padding:'10px 14px'}}>등록된 메모가 없습니다. "메모 추가"를 눌러 입력하세요.</div>
            )}
          </div>
        </div>
      </div>

      {/* 현장설치정보 입력 모달 */}
      <SiteInfoModal
        open={siteInfoModalOpen}
        contract={c}
        saving={saving}
        onClose={() => setSiteInfoModalOpen(false)}
        onSave={async (patch) => {
          // patch = { siteInfo: '...', drawing: '...' }
          if (typeof hasApiUrl !== 'function' || !hasApiUrl()) {
            toast?.('API URL이 설정되지 않았습니다. 로컬 반영만 됩니다.', 'default');
            setSiteInfoModalOpen(false);
            return;
          }
          setSaving(true);
          try {
            await apiClient.updateContract(baseContract.no, patch);
            toast?.('현장설치정보 저장 완료', 'success');
            setSiteInfoModalOpen(false);
            onUpdated?.();
          } catch (e) {
            toast?.('저장 실패: ' + (e.message || '알 수 없는 오류'), 'error');
          } finally {
            setSaving(false);
          }
        }}
      />

      {/* 수금 누적 관리 모달 */}
      <PaymentModal
        open={paymentModalOpen}
        contract={c}
        onClose={() => setPaymentModalOpen(false)}
        onSaved={() => onUpdated?.()}
      />
    </>
  );
};

window.ScreenDetail = ScreenDetail;
window.KpiCard = KpiCard;
window.InlineField = InlineField;
window.SiteAssetsCard = SiteAssetsCard;
