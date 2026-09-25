/* ═══════════════════════════════════════════════════════════════
   로그인 화면 · 관리자 계정 (Apps Script Auth.gs 에서 확인)
═══════════════════════════════════════════════════════════════ */

const LoginScreen = ({ onLoggedIn }) => {
  const needUrl = !hasApiUrl();
  const [showUrl, setShowUrl] = useState(needUrl);
  const [serverUrl, setServerUrl] = useState(() => getApiUrl());
  const [id, setId] = useState(() => (getAuthUser() && getAuthUser().id) || 'admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (showUrl) {
      if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(serverUrl.trim())) {
        setError('Apps Script 웹앱 URL(https://script.google.com/…/exec)을 입력해 주세요.');
        return;
      }
      // config.js 값과 같으면 개별 저장값을 지워 공통 설정을 따르게 함
      setApiUrl(serverUrl.trim() === getConfigApiUrl() ? '' : serverUrl);
    }
    setBusy(true);
    try {
      await apiClient.login(id.trim(), password);
      setPassword('');
      onLoggedIn?.();
    } catch (err) {
      const msg = err.code === 'UNKNOWN_ROUTE'
        ? 'Apps Script 에 로그인 기능(Auth.gs)이 아직 반영되지 않았습니다. 최신 코드를 붙여넣고 재배포해 주세요.'
        : err.message || '로그인 실패';
      // 어떤 Apps Script 코드가 응답하는지 확인용 (배포 버전 표시)
      let ver = '';
      try { const r = await apiClient.ping(); ver = r.version || '버전 정보 없음 (구버전 코드)'; }
      catch (e2) { ver = '확인 실패: ' + e2.message; }
      setError(msg + '\n\n서버 배포 버전: ' + ver + '\n(정상: 2026-09-25-02)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'var(--bg)'}}>
      <form onSubmit={submit} className="card pad-lg" style={{width:'100%',maxWidth:380}}>
        <div className="brand" style={{padding:0,marginBottom:22}}>
          <div className="brand-mark" aria-label="주식회사 삼성이엔지">
            <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
              <path d="M8 5v22M24 5v22M8 11h16M8 21h16" stroke="#F0EDE3" strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="brand-name" style={{color:'var(--ink-1)'}}>주식회사 삼성이엔지</div>
            <div className="brand-sub">계약관리 · 관리자 로그인</div>
          </div>
        </div>

        {showUrl && (
          <div className="form-field full" style={{marginBottom:12}}>
            <label>서버 주소 (Apps Script 웹앱 URL)</label>
            <input
              type="url" value={serverUrl} onChange={e => setServerUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              style={{fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12}}
            />
            <div className="hint">Apps Script → 배포 → 배포 관리 에 나오는 "웹 앱" URL (…/exec)</div>
          </div>
        )}

        <div className="form-field full" style={{marginBottom:12}}>
          <label>아이디</label>
          <input type="text" value={id} onChange={e => setId(e.target.value)} autoComplete="username" autoFocus={!needUrl}/>
        </div>
        <div className="form-field full">
          <label>비밀번호</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/>
        </div>

        {!showUrl && (
          <div style={{marginTop:10,fontSize:11.5,color:'var(--ink-4)',textAlign:'right'}}>
            <a href="#" onClick={e => { e.preventDefault(); setShowUrl(true); }} style={{color:'inherit'}}>서버 주소 변경</a>
          </div>
        )}

        {error && (
          <div style={{marginTop:14,padding:'10px 12px',borderRadius:8,background:'var(--danger-soft)',color:'var(--danger)',fontSize:12.5,whiteSpace:'pre-wrap'}}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={busy || !id.trim() || !password}
          style={{width:'100%',justifyContent:'center',marginTop:18}}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
};

Object.assign(window, { LoginScreen });
