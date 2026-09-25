/* ═══════════════════════════════════════════════════════════════
   로그인 · 회원가입 화면 (Apps Script Auth.gs 에서 확인)
═══════════════════════════════════════════════════════════════ */

const LoginScreen = ({ onLoggedIn }) => {
  const needUrl = !hasApiUrl();
  const [showUrl, setShowUrl] = useState(needUrl);
  const [serverUrl, setServerUrl] = useState(() => getApiUrl());
  const [id, setId] = useState(() => (getAuthUser() && getAuthUser().id) || 'admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('login');   // 'login' | 'signup'
  const [form, setForm] = useState({ id:'', password:'', password2:'', name:'', phone:'', dept:'' });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const applyUrl = () => {
    if (!showUrl) return true;
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(serverUrl.trim())) {
      setError('Apps Script 웹앱 URL(https://script.google.com/…/exec)을 입력해 주세요.');
      return false;
    }
    // config.js 값과 같으면 개별 저장값을 지워 공통 설정을 따르게 함
    setApiUrl(serverUrl.trim() === getConfigApiUrl() ? '' : serverUrl);
    return true;
  };

  const submitSignup = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    if (form.password !== form.password2) { setError('비밀번호 확인이 일치하지 않습니다.'); return; }
    if (!applyUrl()) return;
    setBusy(true);
    try {
      const r = await apiClient.signup({ id: form.id.trim(), password: form.password, name: form.name.trim(), phone: form.phone.trim(), dept: form.dept.trim() });
      setId(form.id.trim());
      setForm({ id:'', password:'', password2:'', name:'', phone:'', dept:'' });
      setMode('login');
      setNotice(r.message || '가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.');
    } catch (err) {
      setError(err.code === 'UNKNOWN_ROUTE' ? 'Apps Script 에 최신 코드가 반영되지 않았습니다. 관리자에게 문의하세요.' : (err.message || '가입 신청 실패'));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    if (!applyUrl()) return;
    setBusy(true);
    try {
      await apiClient.login(id.trim(), password);
      setPassword('');
      onLoggedIn?.();
    } catch (err) {
      const msg = err.code === 'UNKNOWN_ROUTE'
        ? 'Apps Script 에 로그인 기능(Auth.gs)이 아직 반영되지 않았습니다. 최신 코드를 붙여넣고 재배포해 주세요.'
        : err.message || '로그인 실패';
      if (['AUTH_PENDING', 'AUTH_DISABLED', 'AUTH_LOCKED'].includes(err.code)) { setError(msg); return; }
      // 어떤 Apps Script 코드가 응답하는지 확인용 (배포 버전 표시)
      let ver = '';
      try { const r = await apiClient.ping(); ver = r.version || '버전 정보 없음 (구버전 코드)'; }
      catch (e2) { ver = '확인 실패: ' + e2.message; }
      setError(msg + '\n\n서버 배포 버전: ' + ver + '\n(정상: 2026-09-25-03)');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:16,background:'var(--bg)'}}>
      <form onSubmit={mode === 'login' ? submit : submitSignup} className="card pad-lg" style={{width:'100%',maxWidth:380}}>
        <div className="brand" style={{padding:0,marginBottom:22}}>
          <div className="brand-mark" aria-label="주식회사 삼성이엔지">
            <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
              <path d="M8 5v22M24 5v22M8 11h16M8 21h16" stroke="#F0EDE3" strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="brand-name" style={{color:'var(--ink-1)'}}>주식회사 삼성이엔지</div>
            <div className="brand-sub">계약관리 · {mode === 'login' ? '로그인' : '회원가입'}</div>
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

        {mode === 'login' ? (
          <>
            <div className="form-field full" style={{marginBottom:12}}>
              <label>아이디</label>
              <input type="text" value={id} onChange={e => setId(e.target.value)} autoComplete="username" autoFocus={!needUrl}/>
            </div>
            <div className="form-field full">
              <label>비밀번호</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password"/>
            </div>
          </>
        ) : (
          <>
            {[
              ['id', '아이디', 'text', '영문·숫자 3~20자', 'username'],
              ['password', '비밀번호', 'password', '6자 이상', 'new-password'],
              ['password2', '비밀번호 확인', 'password', '', 'new-password'],
              ['name', '이름', 'text', '예: 홍길동', 'name'],
              ['phone', '전화번호', 'tel', '예: 010-1234-5678', 'tel'],
              ['dept', '부서명', 'text', '예: 공무팀', 'organization-title'],
            ].map(([k, label, type, ph, ac]) => (
              <div key={k} className="form-field full" style={{marginBottom:10}}>
                <label>{label}</label>
                <input type={type} value={form[k]} onChange={e => setF(k, e.target.value)} placeholder={ph} autoComplete={ac}/>
              </div>
            ))}
            <div className="hint" style={{fontSize:11.5,color:'var(--ink-4)'}}>가입 신청 후 관리자가 승인하면 로그인할 수 있습니다.</div>
          </>
        )}

        {!showUrl && (
          <div style={{marginTop:10,fontSize:11.5,color:'var(--ink-4)',textAlign:'right'}}>
            <a href="#" onClick={e => { e.preventDefault(); setShowUrl(true); }} style={{color:'inherit'}}>서버 주소 변경</a>
          </div>
        )}

        {notice && (
          <div style={{marginTop:14,padding:'10px 12px',borderRadius:8,background:'var(--pos-soft)',color:'var(--pos)',fontSize:12.5,whiteSpace:'pre-wrap'}}>
            {notice}
          </div>
        )}

        {error && (
          <div style={{marginTop:14,padding:'10px 12px',borderRadius:8,background:'var(--danger-soft)',color:'var(--danger)',fontSize:12.5,whiteSpace:'pre-wrap'}}>
            {error}
          </div>
        )}

        {mode === 'login' ? (
          <button type="submit" className="btn-primary" disabled={busy || !id.trim() || !password}
            style={{width:'100%',justifyContent:'center',marginTop:18}}>
            {busy ? '로그인 중…' : '로그인'}
          </button>
        ) : (
          <button type="submit" className="btn-primary"
            disabled={busy || !form.id.trim() || !form.password || !form.password2 || !form.name.trim() || !form.phone.trim() || !form.dept.trim()}
            style={{width:'100%',justifyContent:'center',marginTop:18}}>
            {busy ? '신청 중…' : '가입 신청'}
          </button>
        )}

        <div style={{marginTop:14,textAlign:'center',fontSize:12.5,color:'var(--ink-3)'}}>
          {mode === 'login'
            ? <>계정이 없으신가요? <a href="#" onClick={e => { e.preventDefault(); setMode('signup'); setError(''); setNotice(''); }} style={{color:'var(--green-800)',fontWeight:700}}>회원가입</a></>
            : <a href="#" onClick={e => { e.preventDefault(); setMode('login'); setError(''); }} style={{color:'var(--green-800)',fontWeight:700}}>← 로그인으로</a>}
        </div>
      </form>
    </div>
  );
};

Object.assign(window, { LoginScreen });
