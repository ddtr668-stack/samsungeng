/* ═══════════════════════════════════════════════════════════════
   현장 폴더 카드 + 파일 미리보기 모달
   - Drive 폴더 자동 연동 UI (1단계 목업)
   - 프로젝트 폴더 + 5개 카테고리 최신 파일 표시
═══════════════════════════════════════════════════════════════ */

// ─── gapi 에러 객체에서 사람이 읽을 수 있는 메시지 추출 ───
// gapi 에러 예시:
//   { result: { error: { code, message, errors:[{reason,message}] } }, body, status }
// GIS OAuth 에러 예시:
//   { error: 'popup_closed', error_description: '...' }
function extractDriveError(e) {
  if (!e) return '알 수 없는 오류';
  if (typeof e === 'string') return e;

  // 1) 우리가 던진 Error 객체
  if (e.message && typeof e.message === 'string' && !e.message.includes('[object Object]')) {
    // gapi 에러 내부 정보가 있으면 병기
    const inner = e.result?.error?.message || e.body;
    if (inner && !e.message.includes(inner)) return `${e.message} (${inner})`;
    return e.message;
  }
  // 1-b) message가 있지만 [object Object]로 오염됐다면 다른 경로로 fallback

  // 2) gapi.client 예외 (result.error.message)
  const apiMsg = e.result?.error?.message;
  if (apiMsg) {
    const reasons = (e.result.error.errors || []).map(x => x.reason).filter(Boolean).join(', ');
    const code = e.result.error.code || e.status;
    return `${apiMsg}${reasons ? ` [${reasons}]` : ''}${code ? ` (HTTP ${code})` : ''}`;
  }

  // 3) body JSON 파싱
  if (typeof e.body === 'string') {
    try {
      const parsed = JSON.parse(e.body);
      if (parsed?.error?.message) return `${parsed.error.message} (HTTP ${e.status || '?'})`;
    } catch { /* body가 JSON이 아니면 그대로 */ }
    if (e.body) return `${e.body.slice(0, 200)} (HTTP ${e.status || '?'})`;
  }

  // 4) GIS OAuth 에러
  if (e.error) {
    const desc = e.error_description || e.details;
    return `OAuth 에러: ${e.error}${desc ? ' — ' + desc : ''}`;
  }

  // 5) HTTP 상태만 있는 경우
  if (e.status) return `HTTP ${e.status} ${e.statusText || ''}`.trim();

  // 6) 최후의 수단: JSON stringify
  try {
    const s = JSON.stringify(e, Object.getOwnPropertyNames(e));
    if (s && s !== '{}') return s.slice(0, 400);
  } catch { /* stringify 불가 객체 */ }

  return '알 수 없는 오류 (콘솔 확인)';
}


// ─── 파일 미리보기 모달 ───
const FilePreviewModal = ({ open, file, onClose }) => {
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLinkCopied(false);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !file) return null;

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(file.url || ''); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = file.url || '';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1600);
  };

  const canPreview = isPreviewableMimeType(file.mimeType);
  const isImage = file.mimeType && file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal modal-wide" style={{maxWidth:900, maxHeight:'90vh', display:'flex', flexDirection:'column'}}>
        {/* 헤드 */}
        <div className="modal-head">
          <div style={{minWidth:0, flex:1}}>
            <div className="modal-title" style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
              <span style={{fontSize:16, flexShrink:0}}>{fileTypeIcon(file.mimeType)}</span>
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{file.name}</span>
            </div>
            <div className="modal-sub">
              {fmtFileSize(file.size)}{file.size ? ' · ' : ''}수정 {fmtRelativeTime(file.modifiedTime)}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={16}/>
          </button>
        </div>

        {/* 바디 - 미리보기 */}
        <div style={{flex:1, minHeight:400, background:'#F5F5F0', overflow:'hidden', position:'relative'}}>
          {canPreview && file.previewUrl ? (
            isImage ? (
              <div style={{width:'100%', height:'100%', minHeight:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20}}>
                <img
                  src={file.previewUrl}
                  alt={file.name}
                  style={{maxWidth:'100%', maxHeight:'70vh', objectFit:'contain', boxShadow:'0 4px 20px rgba(0,0,0,0.15)'}}
                  onError={e => { e.currentTarget.style.display='none'; }}
                />
              </div>
            ) : (
              <iframe
                src={file.previewUrl}
                style={{width:'100%', height:'70vh', border:0, display:'block'}}
                title={file.name}
                allow="autoplay"
              />
            )
          ) : (
            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              minHeight:400, padding:'40px 20px', color:'var(--ink-3)',
            }}>
              <div style={{fontSize:64, marginBottom:16, opacity:0.6}}>{fileTypeIcon(file.mimeType)}</div>
              <div style={{fontSize:14, marginBottom:8, fontWeight:600, color:'var(--ink-2)'}}>미리보기 지원 안 함</div>
              <div style={{fontSize:12, color:'var(--ink-3)', textAlign:'center', maxWidth:360, lineHeight:1.5}}>
                이 파일 형식은 브라우저에서 바로 볼 수 없습니다.<br/>
                아래 [원본 열기] 버튼으로 Drive 에서 여세요.
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-foot" style={{justifyContent:'space-between', gap:12, padding:'12px 22px', flexShrink:0}}>
          <div style={{fontSize:11, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:6, minWidth:0, flex:1}}>
            <Icon name="external" size={11}/>
            <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'ui-monospace,Menlo,monospace'}}>
              {file.url}
            </span>
          </div>
          <div style={{display:'flex', gap:8, flexShrink:0}}>
            <button
              onClick={copyLink}
              style={{
                padding:'8px 14px', fontSize:12, fontWeight:600,
                background: linkCopied ? '#22A96A' : '#fff',
                color: linkCopied ? '#fff' : 'var(--ink-2)',
                border: '1px solid ' + (linkCopied ? '#22A96A' : 'var(--line)'),
                borderRadius:6, cursor:'pointer',
                display:'inline-flex', alignItems:'center', gap:5,
                transition:'all .12s',
              }}>
              {linkCopied ? (
                <><Icon name="check" size={11} stroke={2.4}/>복사됨</>
              ) : (
                <>🔗 링크 복사</>
              )}
            </button>
            <a
              href={file.url}
              target="_blank" rel="noreferrer"
              style={{
                padding:'8px 14px', fontSize:12, fontWeight:700,
                background:'#22A96A', color:'#fff',
                border:0, borderRadius:6, cursor:'pointer',
                display:'inline-flex', alignItems:'center', gap:5,
                textDecoration:'none',
              }}>
              <Icon name="external" size={11}/>
              원본 열기
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 개별 카테고리 로우 ───
const CategoryRow = ({ category, state, onPreview, onCreateFolder, disabled }) => {
  const { folder, latestFile, fileCount } = state;
  const hasFolder = !!folder;
  const hasFile = !!latestFile;

  const copyFileLink = async (e, file) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(file.url); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = file.url;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    // 짧은 피드백
    const btn = e.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML = '<span style="font-size:11px;color:#22A96A">✓</span>';
    setTimeout(() => { btn.innerHTML = orig; }, 1200);
  };

  return (
    <div style={{
      padding: hasFile ? '10px 12px' : '8px 12px',
      background:'#fff',
      border:'1px solid var(--line)',
      borderRadius:8,
      transition:'border-color .12s',
    }}>
      {/* 카테고리 헤더 */}
      <div style={{
        display:'flex', alignItems:'center', gap:8, marginBottom: hasFile ? 8 : 0,
      }}>
        <span style={{fontSize:15, lineHeight:1, flexShrink:0}}>{category.icon}</span>
        <span style={{fontSize:12.5, fontWeight:700, color:'var(--ink-1)', flex:1, letterSpacing:'-0.01em'}}>
          {category.name}
        </span>
        {hasFolder && (
          <>
            {fileCount > 0 && (
              <span style={{
                fontSize:10, color:'var(--ink-3)', fontWeight:600,
                background:'var(--surface-2)', padding:'2px 6px', borderRadius:10,
                border:'1px solid var(--line)',
              }}>{fileCount}</span>
            )}
            <a
              href={folder.url} target="_blank" rel="noreferrer"
              title="폴더 열기"
              style={{
                width:24, height:24, display:'inline-flex', alignItems:'center', justifyContent:'center',
                borderRadius:5, color:'var(--ink-3)', background:'transparent',
                border:'1px solid var(--line)', textDecoration:'none',
              }}>
              <Icon name="external" size={11}/>
            </a>
          </>
        )}
      </div>

      {/* 최신 파일 or 폴더 없음 상태 */}
      {hasFile ? (
        <div
          style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'8px 10px',
            background:'var(--surface-2)',
            border:'1px solid var(--line)',
            borderRadius:6,
          }}>
          <span style={{fontSize:14, lineHeight:1, flexShrink:0}}>
            {fileTypeIcon(latestFile.mimeType)}
          </span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{
              fontSize:12, fontWeight:600, color:'var(--ink-1)',
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }} title={latestFile.name}>
              {latestFile.name}
            </div>
            <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:1}}>
              {fmtRelativeTime(latestFile.modifiedTime)}
              {latestFile.size ? ' · ' + fmtFileSize(latestFile.size) : ''}
              <span style={{marginLeft:6, color:'var(--ink-4)'}}>· 최신</span>
            </div>
          </div>
          <div style={{display:'flex', gap:4, flexShrink:0}}>
            <button
              onClick={() => onPreview(latestFile)}
              title="미리보기"
              style={{
                width:26, height:26, padding:0,
                border:'1px solid var(--line)', background:'#fff',
                borderRadius:5, cursor:'pointer',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                color:'var(--ink-2)',
              }}>
              <Icon name="eye" size={12}/>
            </button>
            <button
              onClick={(e) => copyFileLink(e, latestFile)}
              title="링크 복사"
              style={{
                width:26, height:26, padding:0,
                border:'1px solid var(--line)', background:'#fff',
                borderRadius:5, cursor:'pointer',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                color:'var(--ink-2)', fontSize:12,
              }}>
              🔗
            </button>
          </div>
        </div>
      ) : hasFolder ? (
        // 폴더는 있는데 파일이 없음
        <div style={{
          padding:'8px 10px', fontSize:11.5, color:'var(--ink-3)',
          background:'var(--surface-2)', border:'1px dashed var(--line-2)',
          borderRadius:6, textAlign:'center',
        }}>
          파일 없음 · <a href={folder.url} target="_blank" rel="noreferrer"
            style={{color:'#1a5490', textDecoration:'none', fontWeight:600}}>
            폴더 열기 ↗
          </a>
        </div>
      ) : (
        // 카테고리 폴더 자체가 없음
        <div style={{
          padding:'8px 10px', fontSize:11.5, color:'var(--ink-3)',
          background:'var(--surface-2)', border:'1px dashed var(--line-2)',
          borderRadius:6, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
        }}>
          <span>폴더 없음</span>
          <button
            onClick={() => onCreateFolder(category)}
            disabled={disabled}
            title="이 카테고리 폴더를 Drive 에 생성"
            style={{
              padding:'3px 10px', fontSize:11, fontWeight:600,
              background:'#fff', color:'var(--green-800)',
              border:'1px solid #C9DFD1', borderRadius:5,
              cursor: disabled ? 'wait' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}>
            + 폴더 생성
          </button>
        </div>
      )}
    </div>
  );
};

// ─── 메인 카드 ───
const SiteFoldersCard = ({ contract }) => {
  // mode: 'live' (Drive 실연동) | 'mock' (자격 증명 없을 때 목업)
  const [mode, setMode] = useState(() => hasDriveCredentials() ? 'live' : 'mock');
  const [state, setState] = useState(() =>
    hasDriveCredentials()
      ? { projectFolder: null, categories: {}, _pending: true, _cached: false }
      : getMockSiteFolders(contract)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const toast = window.useToast ? window.useToast() : null;

  const projectFolderName = useMemo(
    () => buildProjectFolderName(contract),
    [contract?.no, contract?.projectName, contract?.contractDate]
  );

  // ─── 실연동: Drive 조회 ───
  const loadFromDrive = useCallback(async (force) => {
    if (!contract?.no) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSiteFoldersFromDrive(contract, { force: !!force });
      setState({ ...data, _pending: false });
    } catch (e) {
      const msg = extractDriveError(e);
      setError(msg);
      // 콘솔에 원본도 남김 (개발자용)
      // eslint-disable-next-line no-console
      console.error('[SiteFolders] Drive 조회 실패', e);
      // 실패 시 빈 상태
      setState({
        projectFolder: null,
        categories: SITE_CATEGORIES.reduce((acc, c) => {
          acc[c.key] = { folder: null, latestFile: null, fileCount: 0 };
          return acc;
        }, {}),
        _pending: false,
      });
    } finally {
      setLoading(false);
    }
  }, [contract?.no]);

  // 계약 바뀔 때마다 재조회
  useEffect(() => {
    if (mode === 'live') {
      loadFromDrive(false);
    } else {
      setState(getMockSiteFolders(contract));
    }
  }, [contract?.no, mode, loadFromDrive]);

  // 자격 증명 변경 감지 (설정 저장 시 storage 이벤트로도 좋지만, 카드 focus 시 재확인)
  useEffect(() => {
    const check = () => {
      const hasCreds = hasDriveCredentials();
      setMode(prev => {
        const next = hasCreds ? 'live' : 'mock';
        if (next !== prev) return next;
        return prev;
      });
    };
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  const handleCreateProjectFolder = async () => {
    if (mode !== 'live') {
      toast?.('설정 화면에서 Google Drive API Key와 Client ID를 먼저 등록하세요', 'error');
      return;
    }
    if (!confirm(`Drive 에 다음 폴더를 생성할까요?\n\n${projectFolderName}\n\n하위 5개 카테고리 폴더도 함께 만들어집니다.`)) return;
    setCreating(true);
    try {
      await createProjectFolderTree(contract);
      toast?.('폴더 생성 완료', 'success');
      await loadFromDrive(true);
    } catch (e) {
      console.error('[SiteFolders] 프로젝트 폴더 생성 실패', e);
      toast?.('폴더 생성 실패: ' + extractDriveError(e), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCategoryFolder = async (category) => {
    if (mode !== 'live') {
      toast?.('설정 화면에서 Google Drive API Key와 Client ID를 먼저 등록하세요', 'error');
      return;
    }
    if (!state.projectFolder) {
      toast?.('먼저 프로젝트 폴더를 생성하세요', 'error');
      return;
    }
    if (!confirm(`"${category.name}" 폴더를 Drive 에 생성할까요?`)) return;
    setCreating(true);
    try {
      await createCategoryFolder(contract, category, state.projectFolder.id);
      toast?.(`"${category.name}" 폴더 생성 완료`, 'success');
      await loadFromDrive(true);
    } catch (e) {
      console.error('[SiteFolders] 카테고리 폴더 생성 실패', e);
      toast?.('폴더 생성 실패: ' + extractDriveError(e), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleRefresh = () => {
    if (mode === 'live') loadFromDrive(true);
    else setState(getMockSiteFolders(contract));
  };

  const isMock = mode === 'mock';
  const isPending = state._pending && mode === 'live';

  return (
    <div className="card">
      {/* 카드 헤더 */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        marginBottom:12, paddingBottom:10, borderBottom:'1px solid var(--line)',
      }}>
        <div>
          <div style={{fontSize:14, fontWeight:700, color:'var(--ink-1)', display:'flex', alignItems:'center', gap:6}}>
            <span style={{fontSize:15}}>📁</span>
            현장 자료 폴더
            {isMock ? (
              <span style={{
                fontSize:9.5, fontWeight:700, color:'var(--bronze-800)',
                background:'var(--bronze-50)', border:'1px solid #ECD9AE',
                padding:'1px 6px', borderRadius:3, letterSpacing:'0.05em', marginLeft:2,
              }} title="Drive 자격 증명이 없어 목업 데이터로 표시 중입니다. 설정에서 API Key/Client ID를 등록하세요.">
                MOCK
              </span>
            ) : loading ? (
              <span style={{
                fontSize:9.5, fontWeight:700, color:'#1a5490',
                background:'#EEF4F8', border:'1px solid #C8DBE5',
                padding:'1px 6px', borderRadius:3, letterSpacing:'0.05em', marginLeft:2,
              }}>동기화 중…</span>
            ) : (
              <span style={{
                fontSize:9.5, fontWeight:700, color:'var(--green-800)',
                background:'var(--green-50)', border:'1px solid #C9DFD1',
                padding:'1px 6px', borderRadius:3, letterSpacing:'0.05em', marginLeft:2,
              }} title="Google Drive 실시간 연동">LIVE</span>
            )}
          </div>
          <div style={{fontSize:11, color:'var(--ink-3)', marginTop:2}}>
            Google Drive · 폴더 자동 연동
          </div>
        </div>
        <div style={{display:'flex', gap:4}}>
          {!isMock && (
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="no-print"
              title="Drive에서 다시 불러오기"
              style={{
                width:26, height:26, padding:0,
                border:'1px solid var(--line)', background:'#fff',
                borderRadius:5, cursor:loading?'wait':'pointer',
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                color:'var(--ink-3)',
              }}>
              <span style={{
                display:'inline-block',
                animation: loading ? 'spin 1s linear infinite' : 'none',
                fontSize:12, lineHeight:1,
              }}>↻</span>
            </button>
          )}
          <a
            href={DRIVE_ROOT_FOLDER_URL} target="_blank" rel="noreferrer"
            className="no-print"
            style={{
              padding:'5px 10px', fontSize:11, fontWeight:600,
              background:'#fff', color:'var(--ink-3)',
              border:'1px solid var(--line)', borderRadius:5,
              textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4,
            }} title="Drive 최상위 '현장관리 자료' 폴더 열기">
            <Icon name="external" size={10}/>
            루트
          </a>
        </div>
      </div>

      {/* 에러 배너 */}
      {error && !isMock && (() => {
        // 에러 패턴 매칭 → 원인별 대응 안내
        const errLow = String(error).toLowerCase();
        let hint = null;
        if (/idpiframe|not a valid origin|invalid_client|origin.*not/i.test(errLow)) {
          hint = `OAuth Client ID 설정에서 "승인된 JavaScript 원본"에 현재 접속 주소(${window.location.origin})를 추가하고 몇 분 후 다시 시도하세요. Google 설정 변경은 반영에 5분 정도 걸릴 수 있습니다.`;
        } else if (/access[_ ]?denied|test user|not authorized/i.test(errLow)) {
          hint = 'OAuth 동의 화면 → 테스트 사용자 목록에 로그인한 Google 계정을 추가한 뒤 다시 시도하세요.';
        } else if (/popup[_ ]?closed|popup blocked|팝업/i.test(errLow)) {
          hint = '브라우저 주소창 옆 팝업 차단 아이콘을 눌러 이 사이트를 허용한 뒤 재시도하세요.';
        } else if (/immediate_failed/i.test(errLow)) {
          hint = '자동 로그인에 실패했습니다. 재시도 버튼을 눌러 팝업으로 로그인하세요.';
        } else if (/403|forbidden/i.test(String(error))) {
          hint = 'Google Drive API가 활성화되지 않았거나 권한이 부족합니다. Cloud Console에서 Drive API를 사용 설정하세요.';
        } else if (/api key|invalid.*key|400.*invalid/i.test(errLow)) {
          hint = 'API Key가 잘못되었거나 Drive API가 활성화되지 않았습니다. Cloud Console에서 확인하세요.';
        } else if (/network|failed to fetch|net::/i.test(errLow)) {
          hint = '네트워크 문제입니다. 인터넷 연결을 확인하고 재시도하세요.';
        } else if (/자격 증명|credentials|not set|not configured/i.test(errLow)) {
          hint = '설정 화면에서 API Key와 Client ID를 다시 확인하세요.';
        } else if (/oauth 실패|oauth 에러/i.test(errLow)) {
          hint = 'OAuth 토큰 요청이 실패했습니다. 위 원본 에러 코드를 확인하고 Cloud Console 설정을 점검하세요.';
        }

        return (
          <div style={{
            padding:'10px 12px', marginBottom:12,
            background:'#FCE9E4', border:'1px solid #F0BFB4',
            borderRadius:6, fontSize:11.5, color:'#7A2A1E',
            display:'flex', alignItems:'start', gap:8, lineHeight:1.5,
          }}>
            <span style={{fontSize:14, lineHeight:1, flexShrink:0}}>⚠️</span>
            <div style={{flex:1, minWidth:0}}>
              <b>Drive 연동 실패</b>
              <div style={{
                fontSize:10.5, opacity:0.9, marginTop:3,
                fontFamily:'ui-monospace,Menlo,monospace',
                wordBreak:'break-word', whiteSpace:'pre-wrap',
                background:'rgba(255,255,255,0.5)',
                padding:'4px 6px', borderRadius:3,
                border:'1px solid rgba(240,191,180,0.5)',
              }}>{error}</div>
              {hint && (
                <div style={{
                  fontSize:11, marginTop:6, padding:'6px 8px',
                  background:'#FFF6E7', border:'1px solid #F0D9A0',
                  borderRadius:4, color:'#7A5A1E',
                  display:'flex', gap:6, alignItems:'start',
                }}>
                  <span>💡</span>
                  <span>{hint}</span>
                </div>
              )}
              <div style={{fontSize:10, marginTop:4, opacity:0.7}}>
                브라우저 개발자 도구 (F12) → Console 탭에서 원본 에러도 확인할 수 있습니다.
              </div>
            </div>
            <button
              onClick={handleRefresh}
              style={{padding:'2px 8px', fontSize:10, fontWeight:600, background:'#fff', color:'#7A2A1E', border:'1px solid #F0BFB4', borderRadius:4, cursor:'pointer', flexShrink:0}}>
              재시도
            </button>
          </div>
        );
      })()}

      {/* 초기 로딩 스켈레톤 */}
      {isPending && !error && (
        <div style={{padding:'30px 12px', textAlign:'center', color:'var(--ink-3)', fontSize:12}}>
          <div style={{fontSize:24, marginBottom:8, animation:'spin 1s linear infinite', display:'inline-block'}}>↻</div>
          <div>Google Drive 에서 폴더 정보를 불러오는 중…</div>
          <div style={{fontSize:10.5, marginTop:4, opacity:0.7}}>최초 1회 인증 팝업이 표시될 수 있습니다</div>
        </div>
      )}

      {/* 프로젝트 폴더 상태 */}
      {!isPending && (state.projectFolder ? (
        <a
          href={state.projectFolder.url}
          target="_blank" rel="noreferrer"
          style={{
            display:'flex', alignItems:'center', gap:8,
            padding:'10px 12px', marginBottom:12,
            background:'var(--green-50)', border:'1px solid #C9DFD1',
            borderRadius:8, color:'var(--green-800)',
            textDecoration:'none', transition:'background .12s',
          }}>
          <span style={{fontSize:16, lineHeight:1}}>📂</span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:11, color:'var(--green-700)', fontWeight:600, marginBottom:1}}>프로젝트 폴더</div>
            <div style={{
              fontSize:12, fontWeight:700,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }} title={state.projectFolder.name}>
              {state.projectFolder.name}
            </div>
          </div>
          <Icon name="external" size={12}/>
        </a>
      ) : (
        <div style={{
          padding:'14px 12px', marginBottom:12,
          background:'var(--surface-2)', border:'1.5px dashed var(--line-2)',
          borderRadius:8, textAlign:'center',
        }}>
          <div style={{fontSize:24, marginBottom:6, opacity:0.6}}>📂</div>
          <div style={{fontSize:12, fontWeight:600, color:'var(--ink-2)', marginBottom:2}}>
            프로젝트 폴더가 없습니다
          </div>
          <div style={{fontSize:10.5, color:'var(--ink-3)', marginBottom:10, lineHeight:1.5}}>
            <span style={{fontFamily:'ui-monospace,Menlo,monospace', color:'var(--ink-2)'}}>
              {projectFolderName || '(계약일·프로젝트명 필요)'}
            </span>
          </div>
          {projectFolderName && (
            <button
              onClick={handleCreateProjectFolder}
              disabled={creating}
              style={{
                padding:'6px 14px', fontSize:11.5, fontWeight:700,
                background:'#22A96A', color:'#fff',
                border:0, borderRadius:6, cursor: creating ? 'wait' : 'pointer',
                opacity: creating ? 0.7 : 1,
              }}>
              {creating ? '생성 중…' : '+ 프로젝트 폴더 생성'}
            </button>
          )}
        </div>
      ))}

      {/* 카테고리 5개 */}
      {!isPending && (
        <div style={{display:'flex', flexDirection:'column', gap:6}}>
          {SITE_CATEGORIES.map(cat => (
            <CategoryRow
              key={cat.key}
              category={cat}
              state={state.categories[cat.key] || { folder:null, latestFile:null, fileCount:0 }}
              onPreview={setPreviewFile}
              onCreateFolder={handleCreateCategoryFolder}
              disabled={creating}
            />
          ))}
        </div>
      )}

      {/* 안내 */}
      {isMock ? (
        <div style={{
          marginTop:12, padding:'8px 10px',
          background:'var(--bronze-50)', border:'1px solid #ECD9AE',
          borderRadius:6, fontSize:10.5, color:'var(--bronze-800)', lineHeight:1.5,
        }}>
          💡 <b>목업 데이터로 표시 중</b>입니다. 실제 Drive 연동을 하려면
          <b> 설정 화면 → Google Drive 인증 정보</b>에서 API Key와 Client ID를 등록하세요.
        </div>
      ) : (
        <div style={{
          marginTop:12, padding:'8px 10px',
          background:'#EEF4F8', border:'1px solid #C8DBE5',
          borderRadius:6, fontSize:10.5, color:'#1a5490', lineHeight:1.5,
        }}>
          💡 각 카테고리 폴더의 <b>가장 최근 파일</b>이 자동으로 표시됩니다.
          새 파일 업로드는 Drive 에서 직접 하고, ↻ 버튼으로 새로고침하세요.
        </div>
      )}

      {/* 파일 미리보기 모달 */}
      <FilePreviewModal
        open={!!previewFile}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};

// ─── 전역 노출 ───
window.SiteFoldersCard = SiteFoldersCard;
window.FilePreviewModal = FilePreviewModal;
window.CategoryRow = CategoryRow;
