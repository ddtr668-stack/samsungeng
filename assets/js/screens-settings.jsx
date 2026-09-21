/* ═══════════════════════════════════════════════════════════════
   화면 8 · 설정 (Google Apps Script 연동)
═══════════════════════════════════════════════════════════════ */

const ScreenSettings = ({ data, onRefresh, onApiUpdated }) => {
  const [url, setUrl] = useState(getApiUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const toast = useToast();

  const source = data?._source;
  const fetchedAt = data?._fetchedAt || data?._cacheTs;

  const handleSave = () => {
    setApiUrl(url);
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
      setTestResult({ ok: true, message: `연결 성공! (${r.ts || 'ok'})` });
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
            <div className="hint">배포 → 새 배포 → 유형 "웹 앱" → 액세스 "본인" 또는 "조직 내" → 배포 URL 복사</div>
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
            <div style={{fontSize:12.5,fontWeight:700,color:'var(--ink-2)',marginBottom:8}}>연결된 스프레드시트</div>
            <a
              href="https://docs.google.com/spreadsheets/d/1rUq7yu0pHrp-rln4JjGIslIib_d033ZuzwLD6odtORs/edit"
              target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:9,background:'var(--green-50)',color:'var(--green-800)',textDecoration:'none',fontSize:12.5,fontWeight:600,border:'1px solid #D3DCD3'}}>
              <span style={{width:18,height:18,borderRadius:4,background:'#217346',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:10,fontWeight:800}}>X</span>
              계약관리_v1.3 · Google Sheets
              <Icon name="external" size={12}/>
            </a>
          </div>
        </div>

        <div className="card pad-lg">
          <CardHead title="설치 가이드" sub="처음 사용 시 1회만 진행"/>

          <ol style={{margin:0,paddingLeft:22,fontSize:13,color:'var(--ink-2)',lineHeight:1.75}}>
            <li>구글 스프레드시트에서 <b>확장 프로그램 → Apps Script</b> 열기</li>
            <li>기존 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>Code.gs</code>, <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>BusinessTools.gs</code>, <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>ExpenseRequest.gs</code>가 이미 있는지 확인</li>
            <li>새 파일 추가 → 이름을 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>DashboardApi</code>로 지정</li>
            <li>제공드린 <code style={{background:'var(--surface-2)',padding:'1px 5px',borderRadius:4,fontSize:11.5}}>DashboardApi.gs</code> 전체 붙여넣기</li>
            <li>오른쪽 위 <b>배포 → 새 배포</b></li>
            <li>유형 <b>웹 앱</b> · 다음 사용자로 실행 <b>나</b> · 액세스 <b>본인만</b> 또는 <b>조직 내</b></li>
            <li>배포 후 나오는 <b>URL을 복사</b>해서 왼쪽 입력창에 붙여넣고 저장</li>
            <li>연결 테스트 통과하면 <b>다시 불러오기</b> 클릭</li>
          </ol>

          <div style={{marginTop:20,padding:'14px 16px',background:'var(--bronze-50)',borderRadius:10,border:'1px solid #ECD9AE',fontSize:12,color:'var(--bronze-800)',lineHeight:1.6}}>
            <b>💡 팁</b> · 시트 컬럼 순서는 <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>DashboardApi.gs</code>의 <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>COL_MAP_</code>과 일치해야 합니다. 다르면 그 부분만 수정하세요.
          </div>
        </div>
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
        </div>
        <div style={{marginTop:14,fontSize:12,color:'var(--ink-3)',lineHeight:1.6}}>
          대시보드는 API에서 받은 데이터를 브라우저 localStorage에 캐시합니다. 인터넷 연결이 끊겨도 마지막 데이터를 볼 수 있고, 새로고침해도 데이터가 유지됩니다. 데이터가 이상하다면 캐시를 비우고 다시 불러오세요.
        </div>
      </div>
    </>
  );
};

window.ScreenSettings = ScreenSettings;
