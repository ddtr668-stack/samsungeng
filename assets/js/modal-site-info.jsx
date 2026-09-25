/* ═══════════════════════════════════════════════════════════════
   현장설치정보 입력 모달
   - S열(siteInfo) + R열(drawing) 저장
   - 복사하기: ㆍ 불릿 텍스트를 클립보드로
   - 저장: siteInfo 문자열 + drawing 링크를 GAS로 전송
═══════════════════════════════════════════════════════════════ */

const BIGO_DEFAULTS = ['유선리모컨', '무선리모컨', 'DMS', '중앙제어기', '철거공사'];

// ─── siteInfo 문자열 → 구조화 데이터 파싱 ───
const parseSiteInfoFull = (raw) => {
  const out = {
    siteName: '',
    product: '',
    address: '',
    startDate: '',
    endDate: '',
    manager: '',
    drawing: '',
    bigoChecked: [],   // 체크된 기본 항목
    bigoExtra: [],     // 사용자 추가 항목
  };
  if (!raw) return out;

  const lines = String(raw).split(/[\n\r]+/);
  lines.forEach(line => {
    const t = line.trim();
    if (!t) return;
    // ㆍ 프리픽스와 콜론 매칭
    const m = t.match(/^ㆍ?\s*([^:：]+)\s*[:：]\s*(.+)$/);
    if (!m) return;
    const key = m[1].trim();
    const val = m[2].trim();
    if (/^현장명/.test(key)) out.siteName = val;
    else if (/^제품/.test(key)) out.product = val;
    else if (/^(현장주소|주소)/.test(key)) out.address = val;
    else if (/^공사일정/.test(key)) {
      const m2 = val.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
      if (m2) { out.startDate = m2[1]; out.endDate = m2[2]; }
    }
    else if (/^담당자/.test(key)) out.manager = val;
    else if (/^도면/.test(key)) out.drawing = val;
    else if (/^비고/.test(key)) {
      const items = val.split(/\s*,\s*/).filter(Boolean);
      items.forEach(it => {
        if (BIGO_DEFAULTS.includes(it)) out.bigoChecked.push(it);
        else out.bigoExtra.push(it);
      });
    }
  });
  return out;
};

// ─── 구조화 데이터 → ㆍ 불릿 텍스트 (저장/복사 공용) ───
const buildSiteInfoText = (form) => {
  const lines = [];
  if (form.siteName) lines.push(`ㆍ현장명: ${form.siteName}`);
  if (form.product) lines.push(`ㆍ제품: ${form.product}`);
  if (form.address) lines.push(`ㆍ현장주소: ${form.address}`);
  if (form.startDate || form.endDate) {
    lines.push(`ㆍ공사일정: ${form.startDate || '?'} ~ ${form.endDate || '?'}`);
  }
  if (form.manager) lines.push(`ㆍ담당자: ${form.manager}`);
  if (form.drawing) lines.push(`ㆍ도면: ${form.drawing}`);
  const bigoAll = [...(form.bigoChecked || []), ...(form.bigoExtra || [])];
  if (bigoAll.length) lines.push(`ㆍ비고: ${bigoAll.join(', ')}`);
  return lines.join('\n');
};

// ─── 모달 본체 ───
const SiteInfoModal = ({ open, contract, onClose, onSave, saving }) => {
  const initial = useMemo(
    () => parseSiteInfoFull(contract?.siteInfo || contract?.note || ''),
    [contract?.no, open]
  );
  // 시트에 R열(drawing)이 별도로 있으면 우선
  const initialDrawing = contract?.drawing || initial.drawing || '';

  const [form, setForm] = useState(initial);
  const [drawingInput, setDrawingInput] = useState(initialDrawing);
  const [newBigo, setNewBigo] = useState('');
  const [pickingDrive, setPickingDrive] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 모달이 열릴 때마다 계약 데이터 재파싱
    const fresh = parseSiteInfoFull(contract?.siteInfo || contract?.note || '');
    setForm(fresh);
    setDrawingInput(contract?.drawing || fresh.drawing || '');
    setNewBigo('');
    setCopied(false);
  }, [open, contract?.no, contract?.siteInfo, contract?.note, contract?.drawing]);

  if (!open) return null;

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const toggleBigo = (item) => {
    setForm(prev => ({
      ...prev,
      bigoChecked: prev.bigoChecked.includes(item)
        ? prev.bigoChecked.filter(x => x !== item)
        : [...prev.bigoChecked, item],
    }));
  };
  const addExtraBigo = () => {
    const v = newBigo.trim();
    if (!v) return;
    if (form.bigoExtra.includes(v) || form.bigoChecked.includes(v)) {
      setNewBigo('');
      return;
    }
    setForm(prev => ({ ...prev, bigoExtra: [...prev.bigoExtra, v] }));
    setNewBigo('');
  };
  const removeExtraBigo = (item) => {
    setForm(prev => ({ ...prev, bigoExtra: prev.bigoExtra.filter(x => x !== item) }));
  };

  // 프리뷰 텍스트 (drawing은 별도 필드도 있지만 텍스트에도 포함)
  const previewText = buildSiteInfoText({ ...form, drawing: drawingInput });

  // 복사하기
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = previewText;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(()=>setCopied(false),1600); }
      catch {}
      document.body.removeChild(ta);
    }
  };

  // Google Drive Picker
  const handleDrivePick = async () => {
    if (!window.hasDriveCredentials || !window.hasDriveCredentials()) {
      alert('설정 화면에서 Google Drive API Key / Client ID를 먼저 등록하세요.');
      return;
    }
    setPickingDrive(true);
    try {
      const picked = await window.pickDriveLink({ title: '도면 파일 선택' });
      if (picked && picked.url) setDrawingInput(picked.url);
    } catch (e) {
      const msg = e && e.message || '알 수 없는 오류';
      if (!/취소/.test(msg)) alert('Drive 선택 실패: ' + msg);
    } finally {
      setPickingDrive(false);
    }
  };

  // 저장
  const handleSave = async () => {
    const siteInfoStr = previewText;
    await onSave({
      siteInfo: siteInfoStr,
      drawing: drawingInput || '',
    });
  };

  // ─── 스타일 ───
  const rowStyle = {
    display: 'grid',
    gridTemplateColumns: '90px 1fr',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  };
  const labelStyle = {
    fontSize: 12.5,
    fontWeight: 700,
    color: 'var(--ink-2)',
    letterSpacing: '-0.01em',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  };
  const inputStyle = {
    width: '100%',
    padding: '9px 12px',
    fontSize: 13,
    border: '1px solid var(--line)',
    borderRadius: 7,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };
  const dateStyle = { ...inputStyle, fontFamily: 'ui-monospace,Menlo,monospace' };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide" style={{maxWidth: 780}}>
        {/* 헤드 */}
        <div className="modal-head">
          <div>
            <div className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                width:26,height:26,borderRadius:6,background:'var(--green-50)',
                border:'1px solid #C9DFD1',color:'var(--green-800)',fontSize:14
              }}>🏗️</span>
              현장설치정보
            </div>
            <div className="modal-sub">계약 #{String(contract?.no || '').padStart(4,'0')} · {contract?.client || ''}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={16}/>
          </button>
        </div>

        {/* 바디 */}
        <div className="modal-body" style={{padding:'18px 22px', maxHeight:'70vh', overflowY:'auto'}}>
          {/* 현장명 */}
          <div style={rowStyle}>
            <div style={labelStyle}><span style={{color:'var(--ink-1)'}}>■</span>현장명:</div>
            <input
              type="text"
              value={form.siteName}
              onChange={e => set('siteName', e.target.value)}
              placeholder="예: [탄소바우처]대진이엔지 냉난방기 공사"
              style={inputStyle}
            />
          </div>

          {/* 제품 */}
          <div style={rowStyle}>
            <div style={labelStyle}><span style={{color:'var(--ink-3)'}}>ㆍ</span>제품:</div>
            <input
              type="text"
              value={form.product}
              onChange={e => set('product', e.target.value)}
              placeholder="예: 10마력 3대   23평 스텐드 1대"
              style={inputStyle}
            />
          </div>

          {/* 현장주소 */}
          <div style={rowStyle}>
            <div style={labelStyle}><span style={{color:'var(--ink-3)'}}>ㆍ</span>현장주소:</div>
            <div style={{display:'flex', gap:6}}>
              <input
                type="text"
                value={form.address}
                onChange={e => set('address', e.target.value)}
                placeholder="예: 경기도 부천시 오정구 오정로 195-17(내동)"
                style={{...inputStyle, flex:1, minWidth:0}}
              />
              <button
                type="button"
                onClick={() => {
                  const q = (form.address || form.siteName || '').trim();
                  const url = q ? `https://map.naver.com/p/search/${encodeURIComponent(q)}` : 'https://map.naver.com/p/';
                  window.open(url, '_blank', 'noopener');
                }}
                title="네이버 지도에서 주소를 검색한 뒤, 정확한 주소를 복사해 왼쪽 칸에 붙여넣으세요"
                style={{
                  padding:'0 12px', fontSize:12, fontWeight:700, color:'#03C75A',
                  background:'#fff', border:'1px solid #B7E4C7', borderRadius:7,
                  cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                }}>
                🗺️ 네이버지도
              </button>
            </div>
          </div>

          {/* 공사일정 */}
          <div style={rowStyle}>
            <div style={labelStyle}><span style={{color:'var(--ink-3)'}}>ㆍ</span>공사일정:</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,alignItems:'center'}}>
              <input
                type="date"
                value={form.startDate}
                onChange={e => set('startDate', e.target.value)}
                style={dateStyle}
              />
              <span style={{color:'var(--ink-3)',fontSize:13,fontWeight:600}}>~</span>
              <input
                type="date"
                value={form.endDate}
                onChange={e => set('endDate', e.target.value)}
                style={dateStyle}
              />
            </div>
          </div>

          {/* 담당자 */}
          <div style={rowStyle}>
            <div style={labelStyle}><span style={{color:'var(--ink-3)'}}>ㆍ</span>담당자:</div>
            <input
              type="text"
              value={form.manager}
              onChange={e => set('manager', e.target.value)}
              placeholder="예: 박창규 대표  010-3703-8164"
              style={inputStyle}
            />
          </div>

          {/* 도면 */}
          <div style={rowStyle}>
            <div style={{...labelStyle, alignSelf:'start', paddingTop:9}}>
              <span style={{color:'var(--ink-3)'}}>ㆍ</span>도면:
            </div>
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:6}}>
                <input
                  type="url"
                  value={drawingInput}
                  onChange={e => setDrawingInput(e.target.value)}
                  placeholder="https://drive.google.com/... (링크 붙여넣기 또는 Drive에서 선택)"
                  style={{...inputStyle, fontFamily:'ui-monospace,Menlo,monospace', fontSize:12}}
                />
                <button
                  onClick={handleDrivePick}
                  disabled={pickingDrive}
                  title="Google Drive에서 도면 파일 선택"
                  style={{
                    padding:'0 12px',fontSize:12,fontWeight:600,
                    border:'1px solid #c8dbe5',background:pickingDrive?'var(--surface-2)':'#f0f7fb',
                    color:'#1a5490',borderRadius:7,cursor:pickingDrive?'wait':'pointer',
                    whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:5,
                  }}
                >
                  {pickingDrive ? '⏳' : '📁'} Drive에서 선택
                </button>
              </div>
              {drawingInput && (
                <a href={drawingInput} target="_blank" rel="noreferrer"
                   style={{display:'inline-flex',alignItems:'center',gap:4,marginTop:6,fontSize:11,color:'#1a5490',textDecoration:'none'}}>
                  <Icon name="external" size={10}/>
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',maxWidth:400,whiteSpace:'nowrap'}}>새 창에서 열기</span>
                </a>
              )}
            </div>
          </div>

          {/* 비고 */}
          <div style={{...rowStyle, alignItems:'start'}}>
            <div style={{...labelStyle, paddingTop:9}}>
              <span style={{color:'var(--ink-3)'}}>ㆍ</span>비고:
            </div>
            <div style={{
              border:'1px solid var(--line)',borderRadius:7,padding:10,background:'#fafaf9',
            }}>
              {/* 기본 5개 체크박스 */}
              <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:8}}>
                {BIGO_DEFAULTS.map(item => {
                  const checked = form.bigoChecked.includes(item);
                  return (
                    <label
                      key={item}
                      style={{
                        display:'inline-flex',alignItems:'center',gap:6,
                        padding:'6px 12px',fontSize:12.5,fontWeight:500,
                        border:'1px solid '+(checked?'var(--green-600)':'var(--line)'),
                        background:checked?'var(--green-50)':'#fff',
                        color:checked?'var(--green-800)':'var(--ink-2)',
                        borderRadius:6,cursor:'pointer',
                        transition:'all .12s',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBigo(item)}
                        style={{width:14,height:14,margin:0,cursor:'pointer',accentColor:'var(--green-600)'}}
                      />
                      {item}
                    </label>
                  );
                })}
              </div>

              {/* 사용자 추가 리스트 */}
              {form.bigoExtra.length > 0 && (
                <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                  {form.bigoExtra.map(item => (
                    <span
                      key={item}
                      style={{
                        display:'inline-flex',alignItems:'center',gap:4,
                        padding:'4px 6px 4px 10px',fontSize:12,
                        background:'var(--bronze-50)',border:'1px solid #ECD9AE',
                        color:'var(--bronze-800)',borderRadius:5,fontWeight:600,
                      }}
                    >
                      {item}
                      <button
                        onClick={() => removeExtraBigo(item)}
                        style={{
                          width:16,height:16,padding:0,marginLeft:2,
                          border:0,background:'transparent',cursor:'pointer',
                          fontSize:14,lineHeight:1,color:'var(--bronze-800)',
                        }}
                        title="삭제"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              {/* 추가 입력 */}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:6}}>
                <input
                  type="text"
                  value={newBigo}
                  onChange={e => setNewBigo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraBigo(); } }}
                  placeholder="추가할 비고 항목"
                  style={{...inputStyle, padding:'7px 10px', fontSize:12}}
                />
                <button
                  onClick={addExtraBigo}
                  style={{
                    padding:'0 14px',fontSize:12,fontWeight:700,
                    background:'#2563EB',color:'#fff',border:0,borderRadius:7,
                    cursor:'pointer',whiteSpace:'nowrap',
                  }}
                >+ 추가</button>
              </div>
            </div>
          </div>

          {/* 미리보기 */}
          {previewText && (
            <div style={{marginTop:16, borderTop:'1px dashed var(--line-2)', paddingTop:12}}>
              <div style={{fontSize:10.5,color:'var(--ink-3)',fontWeight:700,letterSpacing:'0.05em',marginBottom:6}}>
                미리보기 (저장 · 복사할 텍스트)
              </div>
              <pre style={{
                margin:0,padding:'10px 12px',background:'var(--surface-2)',
                border:'1px solid var(--line)',borderRadius:6,fontSize:11.5,
                color:'var(--ink-2)',lineHeight:1.7,whiteSpace:'pre-wrap',
                fontFamily:'inherit',
              }}>{previewText}</pre>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-foot" style={{justifyContent:'center',gap:12,padding:'14px 22px'}}>
          <button
            onClick={handleCopy}
            disabled={!previewText}
            style={{
              padding:'10px 22px',fontSize:13,fontWeight:700,
              background: copied ? '#22A96A' : '#F5B301',
              color:'#fff',border:0,borderRadius:7,
              cursor: previewText ? 'pointer' : 'not-allowed',
              opacity: previewText ? 1 : 0.5,
              display:'inline-flex',alignItems:'center',gap:6,
              minWidth:100,justifyContent:'center',
              transition:'background .15s',
            }}
          >
            {copied ? (
              <>
                <Icon name="check" size={13} stroke={2.4}/>복사됨
              </>
            ) : '복사하기'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding:'10px 22px',fontSize:13,fontWeight:700,
              background:'#22A96A',color:'#fff',border:0,borderRadius:7,
              cursor: saving ? 'wait' : 'pointer',
              minWidth:120,
            }}
          >
            {saving ? '저장 중…' : '현장정보 저장'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── 요약 카드 (계약 세부내용 페이지에 표시) ───
// site: parseSiteInfoFull 결과, drawing: contract.drawing
const SiteInfoSummaryCard = ({ contract, onEdit }) => {
  const site = useMemo(
    () => parseSiteInfoFull(contract?.siteInfo || contract?.note || ''),
    [contract?.siteInfo, contract?.note]
  );
  const drawing = contract?.drawing || site.drawing || '';
  const bigoAll = [...site.bigoChecked, ...site.bigoExtra];
  const hasAny = site.siteName || site.product || site.address || site.startDate || site.manager || drawing || bigoAll.length;

  const rowIconStyle = {
    display:'inline-flex',alignItems:'center',justifyContent:'center',
    width:22,height:22,borderRadius:5,
    fontSize:11,color:'var(--ink-3)',
    background:'#fff',border:'1px solid var(--line)',
    flexShrink:0,
  };
  const rowStyle = {
    display:'grid',gridTemplateColumns:'22px 78px 1fr',gap:10,
    alignItems:'start',padding:'6px 0',
    fontSize:12.5,lineHeight:1.5,
  };
  const labelStyle = { color:'var(--ink-3)', fontWeight:600, fontSize:11.5, paddingTop:2 };
  const valueStyle = { color:'var(--ink-1)', fontWeight:500, wordBreak:'break-word' };

  return (
    <div className="card" style={{position:'relative'}}>
      <div style={{
        display:'flex',alignItems:'center',justifyContent:'space-between',
        marginBottom:10,paddingBottom:10,borderBottom:'1px solid var(--line)',
      }}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'var(--ink-1)',display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:15}}>🏗️</span>
            현장설치정보
          </div>
          <div style={{fontSize:11,color:'var(--ink-3)',marginTop:2}}>
            시공 현장 · 담당자 · 도면 · 비고
          </div>
        </div>
        <button
          onClick={onEdit}
          className="no-print"
          style={{
            padding:'6px 12px',fontSize:11.5,fontWeight:700,
            background:'#22A96A',color:'#fff',border:0,borderRadius:6,
            cursor:'pointer',display:'inline-flex',alignItems:'center',gap:5,
          }}
        >
          <Icon name="edit" size={11} stroke={2.2}/>
          {hasAny ? '수정' : '입력'}
        </button>
      </div>

      {!hasAny ? (
        <div style={{
          padding:'20px 14px',textAlign:'center',
          background:'var(--surface-2)',borderRadius:8,
          border:'1px dashed var(--line-2)',color:'var(--ink-3)',fontSize:12.5,
        }}>
          현장설치정보가 입력되지 않았습니다.<br/>
          <span style={{fontSize:11}}>우측 상단 <b>입력</b> 버튼을 눌러 등록하세요.</span>
        </div>
      ) : (
        <div style={{
          padding:'8px 12px',background:'var(--surface-2)',
          border:'1px solid var(--line)',borderRadius:8,
        }}>
          {site.siteName && (
            <div style={rowStyle}>
              <span style={{...rowIconStyle, background:'var(--green-50)', borderColor:'#C9DFD1', color:'var(--green-800)'}}>■</span>
              <span style={labelStyle}>현장명</span>
              <span style={{...valueStyle, fontWeight:700}}>{site.siteName}</span>
            </div>
          )}
          {site.product && (
            <div style={rowStyle}>
              <span style={rowIconStyle}>📦</span>
              <span style={labelStyle}>제품</span>
              <span style={valueStyle}>{site.product}</span>
            </div>
          )}
          {site.address && (
            <div style={rowStyle}>
              <span style={rowIconStyle}>📍</span>
              <span style={labelStyle}>현장주소</span>
              <span style={valueStyle}>{site.address}</span>
            </div>
          )}
          {(site.startDate || site.endDate) && (
            <div style={rowStyle}>
              <span style={rowIconStyle}>📅</span>
              <span style={labelStyle}>공사일정</span>
              <span style={{...valueStyle, fontFamily:'ui-monospace,Menlo,monospace', fontSize:12}}>
                {site.startDate || '?'} <span style={{color:'var(--ink-3)'}}>~</span> {site.endDate || '?'}
              </span>
            </div>
          )}
          {site.manager && (
            <div style={rowStyle}>
              <span style={rowIconStyle}>👤</span>
              <span style={labelStyle}>담당자</span>
              <span style={valueStyle}>{site.manager}</span>
            </div>
          )}
          {drawing && (
            <div style={rowStyle}>
              <span style={rowIconStyle}>📐</span>
              <span style={labelStyle}>도면</span>
              <a href={drawing} target="_blank" rel="noreferrer"
                 style={{
                   ...valueStyle, color:'#1a5490', textDecoration:'none',
                   display:'inline-flex',alignItems:'center',gap:4,
                   overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                 }}
                 title={drawing}>
                <Icon name="external" size={10}/>
                <span style={{overflow:'hidden',textOverflow:'ellipsis'}}>Drive 링크 열기</span>
              </a>
            </div>
          )}
          {bigoAll.length > 0 && (
            <div style={rowStyle}>
              <span style={rowIconStyle}>📝</span>
              <span style={labelStyle}>비고</span>
              <span style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {bigoAll.map(item => (
                  <span key={item} style={{
                    display:'inline-block',padding:'2px 8px',fontSize:11,
                    background:'#fff',border:'1px solid var(--line-2)',
                    borderRadius:11,color:'var(--ink-2)',fontWeight:500,
                  }}>{item}</span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

window.SiteInfoModal = SiteInfoModal;
window.SiteInfoSummaryCard = SiteInfoSummaryCard;
window.parseSiteInfoFull = parseSiteInfoFull;
window.buildSiteInfoText = buildSiteInfoText;
