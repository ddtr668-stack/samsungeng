/* ═══════════════════════════════════════════════════════════════
   화면 8 · 설정 (Google Apps Script 연동)
═══════════════════════════════════════════════════════════════ */

const ScreenSettings = ({ data, onRefresh, onApiUpdated }) => {
  const [url, setUrl] = useState(getApiUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  // Google Drive API 인증 정보
  const [driveApiKey, setDriveApiKey] = useState(getGDriveApiKey());
  const [driveClientId, setDriveClientId] = useState(getGDriveClientId());
  const [driveSaved, setDriveSaved] = useState(false);
  // 스프레드시트 링크 · 이름 (사이드바에 표시)
  const [sheetUrl, setSheetUrlState] = useState(getSheetUrl());
  const [sheetName, setSheetNameState] = useState(getSheetName());
  const [sheetSaved, setSheetSaved] = useState(false);
  const toast = useToast();

  // ─── 자동 백업(30일 보관) ───
  const [backupTargets, setBackupTargets] = useState([]);      // [{key,label}]
  const [backupSheets, setBackupSheets] = useState({});         // {key: true/false}
  const [retentionDays, setRetentionDays] = useState(30);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupSaving, setBackupSaving] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [backups, setBackups] = useState([]);
  const [restoringId, setRestoringId] = useState(null);

  const loadBackupInfo = async () => {
    if (!hasApiUrl() || !isAdmin()) return;
    setBackupLoading(true);
    try {
      const [s, l] = await Promise.all([apiClient.getBackupSettings(), apiClient.listBackups()]);
      setBackupTargets(s.targets || []);
      setBackupSheets(s.settings?.sheets || {});
      setRetentionDays(s.settings?.retentionDays || 30);
      setBackups(l.backups || []);
    } catch (e) {
      toast?.('백업 정보를 불러오지 못했습니다: ' + e.message, 'error');
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => { loadBackupInfo(); /* eslint-disable-next-line */ }, []);

  const toggleBackupSheet = (key) => setBackupSheets(prev => ({ ...prev, [key]: !prev[key] }));

  const saveBackupSettings = async () => {
    setBackupSaving(true);
    try {
      const r = await apiClient.saveBackupSettings({ sheets: backupSheets, retentionDays: Number(retentionDays) || 30 });
      if (r.triggerWarning) toast?.(r.triggerWarning, 'default');
      else toast?.('백업 설정을 저장했습니다. 매일 새벽 3시에 자동 백업됩니다.', 'success');
    } catch (e) {
      toast?.('백업 설정 저장 실패: ' + e.message, 'error');
    } finally {
      setBackupSaving(false);
    }
  };

  const runBackupNow = async () => {
    setRunningBackup(true);
    try {
      const r = await apiClient.runBackupNow();
      toast?.(`백업 완료 (${r.created?.length || 0}건 저장됨)`, 'success');
      const l = await apiClient.listBackups();
      setBackups(l.backups || []);
    } catch (e) {
      toast?.('백업 실행 실패: ' + e.message, 'error');
    } finally {
      setRunningBackup(false);
    }
  };

  const restoreBackup = async (b) => {
    if (!window.confirm(`"${b.label}" 을(를) ${b.date} 백업 시점으로 되돌립니다.\n현재 데이터는 되돌리기 전 별도로 안전 백업된 뒤 덮어써집니다. 계속할까요?`)) return;
    setRestoringId(b.id);
    try {
      await apiClient.restoreBackup({ fileId: b.id });
      toast?.('복원이 완료되었습니다. 데이터를 다시 불러옵니다.', 'success');
      await onRefresh?.();
    } catch (e) {
      toast?.('복원 실패: ' + e.message, 'error');
    } finally {
      setRestoringId(null);
    }
  };

  // 서버(Apps Script)에 저장 → 다른 브라우저에서 로그인해도 같은 설정 유지
  const pushShared = async (okMsg) => {
    try {
      await pushAppSettings();
      toast?.(okMsg + ' (모든 브라우저에 적용)', 'success');
      return true;
    } catch (e) {
      toast?.('서버 저장 실패 · 이 브라우저에만 저장됨: ' + e.message, 'error');
      return false;
    }
  };

  const saveSheet = async () => {
    setSheetUrl(sheetUrl);
    setSheetName(sheetName);
    if (!(await pushShared('스프레드시트 정보가 저장되었습니다'))) return;
    setSheetSaved(true);
    setTimeout(() => setSheetSaved(false), 2000);
    // 사이드바 즉시 반영을 위한 리렌더 (부모 트리거 재활용)
    onApiUpdated?.();
  };

  const saveDriveCreds = async () => {
    setGDriveApiKey(driveApiKey);
    setGDriveClientId(driveClientId);
    if (!(await pushShared('Google Drive 인증 정보가 저장되었습니다'))) return;
    setDriveSaved(true);
    setTimeout(() => setDriveSaved(false), 2000);
  };
  const clearDriveCreds = async () => {
    setGDriveApiKey('');
    setGDriveClientId('');
    setDriveApiKey('');
    setDriveClientId('');
    await pushShared('Google Drive 인증 정보가 삭제되었습니다');
  };

  // ─── 관리자 비밀번호 변경 ───
  const [pwCur, setPwCur] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwNew2, setPwNew2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const changePassword = async () => {
    if (pwNew.length < 6) { toast?.('새 비밀번호는 6자 이상으로 해주세요', 'error'); return; }
    if (pwNew !== pwNew2) { toast?.('새 비밀번호가 서로 다릅니다', 'error'); return; }
    setPwBusy(true);
    try {
      await apiClient.changePassword(pwCur, pwNew);
      setPwCur(''); setPwNew(''); setPwNew2('');
      toast?.('비밀번호가 변경되었습니다. 다른 브라우저는 다시 로그인해야 합니다.', 'success');
    } catch (e) {
      toast?.('변경 실패: ' + e.message, 'error');
    } finally {
      setPwBusy(false);
    }
  };

  const source = data?._source;
  const fetchedAt = data?._fetchedAt || data?._cacheTs;

  const handleSave = () => {
    // config.js 값과 같으면 브라우저 개별 저장값을 지워 공통 설정을 따르게 함
    setApiUrl(url.trim() === getConfigApiUrl() ? '' : url);
    setTestResult(null);
    toast?.('API URL이 저장되었습니다', 'success');
    onApiUpdated?.();
  };

  const handleTest = async () => {
    if (!url.trim()) { toast?.('URL을 입력해주세요', 'error'); return; }
    setApiUrl(url);
    setTesting(true);
    setTestResult(null);
    try {
      const r = await apiClient.ping();
      setTestResult({ ok: true, message: `연결 성공! · Apps Script 배포 버전: ${r.version || '(버전 정보 없음 · 구버전 배포일 수 있음)'}` });
      toast?.('연결 성공', 'success');
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
      toast?.('연결 실패: ' + e.message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const handleRefresh = async () => {
    if (!hasApiUrl()) { toast?.('먼저 API URL을 설정해주세요', 'error'); return; }
    try {
      await onRefresh();
      toast?.('데이터를 새로 불러왔습니다', 'success');
    } catch (e) {
      toast?.('불러오기 실패: ' + e.message, 'error');
    }
  };

  const handleClearCache = () => {
    apiCache.clear();
    toast?.('캐시가 비워졌습니다', 'success');
  };

  const me = getAuthUser() || {};
  // 내 계정 (비밀번호 변경)
  const accountCard = (
      <div className="card pad-lg">
        <CardHead title="내 계정" sub={[me.name, me.dept, me.phone, me.id && `아이디 ${me.id}`, me.roleLabel && `권한 ${me.roleLabel}${me.ownOnly ? ' (본인 담당만)' : ''}`].filter(Boolean).join(' · ')}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))',gap:12,marginTop:6}}>
          <div className="form-field">
            <label>현재 비밀번호</label>
            <input type="password" value={pwCur} onChange={e => setPwCur(e.target.value)} autoComplete="current-password"/>
          </div>
          <div className="form-field">
            <label>새 비밀번호 (6자 이상)</label>
            <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} autoComplete="new-password"/>
          </div>
          <div className="form-field">
            <label>새 비밀번호 확인</label>
            <input type="password" value={pwNew2} onChange={e => setPwNew2(e.target.value)} autoComplete="new-password"/>
          </div>
        </div>
        <div className="hstack" style={{marginTop:14}}>
          <button className="btn-primary" onClick={changePassword} disabled={pwBusy || !pwCur || !pwNew || !pwNew2}>
            <Icon name="check" size={14} stroke={2.4}/>
            {pwBusy ? '변경 중…' : '비밀번호 변경'}
          </button>
        </div>
      </div>
  );

  // 관리자가 아니면 내 계정(비밀번호 변경)만 표시
  if (!isAdmin()) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>설정 · 내 계정</h1>
            <div className="page-sub">연동 설정과 사용자 관리는 관리자만 볼 수 있습니다.</div>
          </div>
        </div>
        {accountCard}
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>설정 · 구글 드라이브 연동</h1>
          <div className="page-sub">
            현재 데이터 소스 ·{' '}
            {source === 'api' && <span className="source-badge api"><span className="b-dot"></span>실시간 API 연결</span>}
            {source === 'cache' && <span className="source-badge cache"><span className="b-dot"></span>로컬 캐시 (오프라인)</span>}
            {source === 'static' && <span className="source-badge static"><span className="b-dot"></span>초기 샘플 데이터</span>}
            {fetchedAt && <span style={{marginLeft:8}}>마지막 동기화 · <b style={{color:'var(--ink-1)'}}>{new Date(fetchedAt).toLocaleString('ko-KR')}</b></span>}
          </div>
        </div>
        <button className="refresh-btn" onClick={handleRefresh}>
          <Icon name="download" size={14} stroke={2}/>
          다시 불러오기
        </button>
      </div>

      <div className="row-2">
        <div className="card pad-lg">
          <CardHead title="Google Apps Script 웹앱 URL" sub="계약관리 스프레드시트에 설치한 GAS 웹앱의 배포 URL을 등록합니다"/>

          <div className="form-field full" style={{marginTop:6}}>
            <label>웹앱 URL</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              style={{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12}}
            />
            <div className="hint">
              배포 → 새 배포 → 유형 "웹 앱" → 액세스 "모든 사용자" → 배포 URL 복사.
              {' '}모든 브라우저 공통 주소는 <code>assets/config.js</code> 의 apiUrl 입니다{getConfigApiUrl() ? ' (등록됨)' : ' (미등록 · 여기서 저장하면 이 브라우저에만 적용)'}.
            </div>
          </div>

          <div className="hstack" style={{marginTop:16}}>
            <button className="btn-primary" onClick={handleSave} disabled={!url.trim()}>
              <Icon name="check" size={14} stroke={2.4}/>
              저장
            </button>
            <button className={'btn-ghost' + (testing ? ' loading' : '')} onClick={handleTest} disabled={testing || !url.trim()}>
              <Icon name="dot" size={14}/>
              {testing ? '연결 중…' : '연결 테스트'}
            </button>
          </div>

          {testResult && (
            <div style={{
              marginTop:16, padding:'12px 14px', borderRadius:9,
              background: testResult.ok ? 'var(--pos-soft)' : 'var(--danger-soft)',
              color: testResult.ok ? 'var(--pos)' : 'var(--danger)',
              fontSize:12.5, fontWeight:500, whiteSpace:'pre-wrap'
            }}>
              <b>{testResult.ok ? '✓ ' : '✗ '}</b>{testResult.message}
            </div>
          )}

          <div style={{marginTop:24,paddingTop:20,borderTop:'1px solid var(--line)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{fontSize:12.5,fontWeight:700,color:'var(--ink-2)'}}>데이터 소스 · 연결된 스프레드시트</div>
              {sheetUrl && (
                <a
                  href={sheetUrl} target="_blank" rel="noreferrer"
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:6,background:'var(--green-50)',color:'var(--green-800)',textDecoration:'none',fontSize:11,fontWeight:600,border:'1px solid #D3DCD3'}}>
                  <span style={{width:14,height:14,borderRadius:3,background:'#217346',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:8,fontWeight:800}}>X</span>
                  현재 링크 열기
                  <Icon name="external" size={10}/>
                </a>
              )}
            </div>

            <div className="form-field full" style={{marginTop:0}}>
              <label>시트 표시 이름</label>
              <input
                type="text"
                value={sheetName}
                onChange={e => setSheetNameState(e.target.value)}
                placeholder="예: 계약관리_v1.3"
                style={{fontSize:12.5}}
              />
              <div className="hint">사이드바와 대시보드 헤더에 표시되는 이름입니다.</div>
            </div>

            <div className="form-field full" style={{marginTop:12}}>
              <label>시트 URL</label>
              <input
                type="url"
                value={sheetUrl}
                onChange={e => setSheetUrlState(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                style={{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12}}
              />
              <div className="hint">위 "현재 링크 열기" 버튼이 이 주소로 연결됩니다.</div>
            </div>

            <div className="hstack" style={{marginTop:12}}>
              <button
                className={'btn-primary' + (sheetSaved ? ' saved' : '')}
                onClick={saveSheet}
                disabled={!sheetUrl.trim() || !sheetName.trim()}
                style={sheetSaved ? {background:'var(--pos)'} : undefined}>
                <Icon name="check" size={14} stroke={2.4}/>
                {sheetSaved ? '저장됨' : '스프레드시트 정보 저장'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => {
                  setSheetUrlState('https://docs.google.com/spreadsheets/d/1rUq7yu0pHrp-rln4JjGIslIib_d033ZuzwLD6odtORs/edit');
                  setSheetNameState('계약관리_v1.3');
                }}
                title="입력창을 기본값으로 되돌립니다 (저장 전)">
                기본값
              </button>
            </div>
          </div>
        </div>

        <div className="card pad-lg">
          <CardHead title="설치 가이드" sub="처음 사용 시 1회만 진행"/>

          <ol style={{margin:0,paddingLeft:22,fontSize:13,color:'var(--ink-2)',lineHeight:1.75}}>
            <li>구글 스프레드시트에서 <b>확장 프로그램 → Apps Script</b> 열기</li>
            <li>기존 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>Code.gs</code>, <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>BusinessTools.gs</code>, <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>ExpenseRequest.gs</code>가 이미 있는지 확인</li>
            <li>새 파일 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>DashboardApi</code>, <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>Auth</code> 추가 → 제공된 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>.gs</code> 전체 붙여넣기</li>
            <li><code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>Auth.gs</code> 의 <b>SG_setAdminPassword</b> 에 비밀번호 입력 → 실행 → 입력값 다시 지우기</li>
            <li>오른쪽 위 <b>배포 → 새 배포</b></li>
            <li>유형 <b>웹 앱</b> · 다음 사용자로 실행 <b>나</b> · 액세스 <b>모든 사용자</b> (데이터는 로그인해야만 조회)</li>
            <li>배포 후 나오는 <b>URL</b>을 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>assets/config.js</code> 의 apiUrl 에 등록</li>
            <li>연결 테스트 통과하면 <b>다시 불러오기</b> 클릭</li>
          </ol>

          <div style={{marginTop:20,padding:'14px 16px',background:'var(--bronze-50)',borderRadius:10,border:'1px solid #ECD9AE',fontSize:12,color:'var(--bronze-800)',lineHeight:1.6}}>
            <b>💡 팁</b> · 시트 컬럼 순서는 <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>DashboardApi.gs</code>의 <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>COL_MAP_</code>과 일치해야 합니다. 다르면 그 부분만 수정하세요.
          </div>
        </div>
      </div>

      {accountCard}

      {/* 사용자(담당자) 관리 */}
      <UserManagement/>

      {/* Google Drive Picker 인증 정보 (지출품의서 엑셀 가져오기용) */}
      <div className="card pad-lg">
        <CardHead
          title="Google Drive Picker · 엑셀 파일 가져오기"
          sub="지출품의서 작성 시 Drive에서 설치비/제품내역서 엑셀을 선택하려면 필요합니다 (선택 사항)"
        />

        <div style={{padding:'12px 14px',background:hasDriveCredentials()?'var(--pos-soft)':'var(--bronze-50)',border:'1px solid '+(hasDriveCredentials()?'#C7E5D0':'#ECD9AE'),borderRadius:10,marginBottom:16,fontSize:12.5}}>
          <b style={{color:hasDriveCredentials()?'var(--pos)':'var(--bronze-800)'}}>
            {hasDriveCredentials() ? '✓ 활성화됨' : '⚠ 미설정'}
          </b>
          <span style={{color:'var(--ink-3)',marginLeft:8}}>
            {hasDriveCredentials()
              ? '지출품의서 모달에서 "Drive에서 가져오기" 버튼이 활성화됩니다.'
              : '미설정 상태에서도 "PC 파일" 버튼으로 로컬 엑셀은 가져올 수 있습니다.'}
          </span>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="form-field">
            <label>API Key</label>
            <input
              type="text"
              value={driveApiKey}
              onChange={e => setDriveApiKey(e.target.value)}
              placeholder="AIza..."
              style={{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12}}
            />
            <div className="hint">Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → API 키</div>
          </div>
          <div className="form-field">
            <label>OAuth 2.0 Client ID</label>
            <input
              type="text"
              value={driveClientId}
              onChange={e => setDriveClientId(e.target.value)}
              placeholder="123...-abc.apps.googleusercontent.com"
              style={{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12}}
            />
            <div className="hint">사용자 인증 정보 → OAuth 2.0 클라이언트 ID (웹 애플리케이션)</div>
          </div>
        </div>

        <div className="hstack" style={{marginTop:16}}>
          <button className="btn-primary" onClick={saveDriveCreds} disabled={!driveApiKey.trim() || !driveClientId.trim()}>
            <Icon name="check" size={14} stroke={2.4}/>
            {driveSaved ? '저장됨 ✓' : '저장'}
          </button>
          {hasDriveCredentials() && (
            <button className="btn-ghost" onClick={clearDriveCreds}>
              <Icon name="xCircle" size={14}/>
              삭제
            </button>
          )}
        </div>

        <div style={{marginTop:20,padding:'14px 16px',background:'var(--surface-2)',borderRadius:10,fontSize:12,color:'var(--ink-3)',lineHeight:1.7}}>
          <b style={{color:'var(--ink-2)'}}>🔐 준비 방법 (최초 1회, 약 15분)</b>
          <ol style={{margin:'8px 0 0',paddingLeft:20}}>
            <li>Google Cloud Console → 기존 Apps Script 프로젝트 선택</li>
            <li><b>API 및 서비스 → 라이브러리</b>에서 <b>"Google Picker API"</b>, <b>"Google Drive API"</b> 검색 → <b>사용 설정</b></li>
            <li><b>사용자 인증 정보 → 사용자 인증 정보 만들기 → API 키</b> → 생성된 키 복사</li>
            <li><b>사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션</b>
              <ul style={{margin:'4px 0',paddingLeft:18}}>
                <li>승인된 JavaScript 원본: <code style={{background:'#fff',padding:'1px 4px',borderRadius:3,fontSize:11}}>http://localhost:3000</code></li>
                <li>승인된 리디렉션 URI: (비워둠)</li>
              </ul>
            </li>
            <li>생성된 클라이언트 ID 복사 → 위 입력창에 붙여넣기 → 저장</li>
          </ol>
          <div style={{marginTop:10}}>상세 스크린샷 가이드는 별도 배포된 <b>"Drive Picker 설정 가이드"</b> 문서 참조.</div>
        </div>
      </div>

      {/* 자동 백업(30일 보관) */}
      <div className="card pad-lg">
        <CardHead
          title="자동 백업 · 30일 보관"
          sub="선택한 시트를 매일 새벽 3시에 Google Drive에 스냅샷으로 저장하고, 필요하면 원하는 시점으로 되돌릴 수 있습니다"
        />

        {!hasApiUrl() ? (
          <div style={{padding:'12px 14px',background:'var(--bronze-50)',border:'1px solid #ECD9AE',borderRadius:10,fontSize:12.5,color:'var(--bronze-800)'}}>
            API URL을 먼저 연결해야 백업 설정을 사용할 수 있습니다.
          </div>
        ) : (
          <>
            <div style={{fontSize:12.5,fontWeight:700,color:'var(--ink-2)',marginBottom:10}}>백업할 항목 선택</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px',marginBottom:16}}>
              {backupTargets.map(t => (
                <label key={t.key} style={{display:'flex',alignItems:'center',gap:8,fontSize:12.5,color:'var(--ink-2)',cursor:'pointer',padding:'6px 0'}}>
                  <input type="checkbox" checked={!!backupSheets[t.key]} onChange={() => toggleBackupSheet(t.key)} style={{width:15,height:15}}/>
                  {t.label}
                </label>
              ))}
              {backupLoading && backupTargets.length === 0 && <div style={{fontSize:12,color:'var(--ink-3)'}}>불러오는 중…</div>}
            </div>

            <div className="form-field" style={{maxWidth:200,marginBottom:16}}>
              <label>보관 기간(일)</label>
              <input type="number" min={1} max={365} value={retentionDays} onChange={e => setRetentionDays(e.target.value)} style={{fontSize:12.5}}/>
              <div className="hint">이 기간이 지난 백업은 자동으로 삭제됩니다. 기본 30일.</div>
            </div>

            <div className="hstack">
              <button className="btn-primary" onClick={saveBackupSettings} disabled={backupSaving}>
                <Icon name="check" size={14} stroke={2.4}/>
                {backupSaving ? '저장 중…' : '백업 설정 저장'}
              </button>
              <button className={'btn-ghost' + (runningBackup ? ' loading' : '')} onClick={runBackupNow} disabled={runningBackup}>
                <Icon name="download" size={14} stroke={2}/>
                {runningBackup ? '백업 중…' : '지금 백업 실행'}
              </button>
            </div>

            <div style={{marginTop:22,paddingTop:18,borderTop:'1px solid var(--line)'}}>
              <div style={{fontSize:12.5,fontWeight:700,color:'var(--ink-2)',marginBottom:10}}>최근 백업 목록</div>
              {backupLoading ? (
                <div style={{fontSize:12,color:'var(--ink-3)'}}>불러오는 중…</div>
              ) : backups.length === 0 ? (
                <div style={{fontSize:12,color:'var(--ink-3)'}}>아직 백업이 없습니다. "지금 백업 실행"을 눌러 첫 백업을 만들어보세요.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:280,overflowY:'auto'}}>
                  {backups.map(b => (
                    <div key={b.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'8px 12px',background:'var(--surface-2)',borderRadius:8,fontSize:12}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600,color:'var(--ink-1)'}}>{b.label}</div>
                        <div style={{color:'var(--ink-3)',fontSize:11,marginTop:2}}>{b.date}</div>
                      </div>
                      <button
                        className="btn-ghost"
                        style={{flexShrink:0,padding:'5px 12px',fontSize:11.5}}
                        disabled={restoringId === b.id}
                        onClick={() => restoreBackup(b)}>
                        {restoringId === b.id ? '복원 중…' : '이 시점으로 복원'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card">
        <CardHead title="캐시 및 데이터 관리"/>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
          <button className="btn-ghost" onClick={handleClearCache}>
            <Icon name="xCircle" size={14}/>
            로컬 캐시 비우기
          </button>
          <button className="btn-ghost" onClick={() => window.open('https://script.google.com/home', '_blank')}>
            <Icon name="external" size={14}/>
            Apps Script 편집기 열기
          </button>
          <button className="btn-ghost" onClick={() => window.open('https://console.cloud.google.com/apis/credentials', '_blank')}>
            <Icon name="external" size={14}/>
            Google Cloud Console 열기
          </button>
        </div>
        <div style={{marginTop:14,fontSize:12,color:'var(--ink-3)',lineHeight:1.6}}>
          대시보드는 API에서 받은 데이터를 브라우저 localStorage에 캐시합니다. 인터넷 연결이 끊겨도 마지막 데이터를 볼 수 있고, 새로고침해도 데이터가 유지됩니다. 데이터가 이상하다면 캐시를 비우고 다시 불러오세요.
        </div>
      </div>
    </>
  );
};

window.ScreenSettings = ScreenSettings;
