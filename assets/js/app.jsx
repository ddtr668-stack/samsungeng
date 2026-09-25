/* ═══════════════════════════════════════════════════════════════
   앱 · 데이터 로딩 · 라우팅 · 모달 통합
═══════════════════════════════════════════════════════════════ */

// ─── 자동 로그아웃: 10분 동안 사용하지 않으면 (마지막 사용 시각은 브라우저 탭끼리 공유) ───
const IDLE_LIMIT_MS = 10 * 60 * 1000;
const IDLE_WARN_MS = 60 * 1000;          // 로그아웃 1분 전 경고
const LAST_ACTIVITY_KEY = 'hb.lastActivity';
const getLastActivity = () => { try { return Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0; } catch { return 0; } };
const setLastActivity = (t) => { try { localStorage.setItem(LAST_ACTIVITY_KEY, String(t)); } catch {} };

const App = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');
  const [idleLeft, setIdleLeft] = useState(null);   // 자동 로그아웃까지 남은 초 (경고 표시용)
  const [route, setRoute] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hb.route')) || { screen:'dashboard' }; }
    catch { return { screen:'dashboard' }; }
  });
  const [globalSearch, setGlobalSearch] = useState('');
  const [newContractOpen, setNewContractOpen] = useState(false);
  const [expenseContract, setExpenseContract] = useState(null);
  // 설정 변경 시 사이드바 등 리렌더용 카운터
  const [uiTick, setUiTick] = useState(0);
  const bumpUi = useCallback(() => setUiTick(t => t + 1), []);

  // Persist route
  useEffect(() => {
    localStorage.setItem('hb.route', JSON.stringify(route));
  }, [route]);

  // Initial load
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // 창을 닫아 둔 사이 10분이 지났으면 로그아웃된 상태로 시작
      const last = getLastActivity();
      if (isLoggedIn() && last && Date.now() - last > IDLE_LIMIT_MS) {
        await apiClient.logout();
        setLoginNotice('10분 동안 사용하지 않아 자동으로 로그아웃되었습니다.');
      }
      const res = await loadInitialData();
      if (!res.needLogin) setLastActivity(Date.now());
      if (res.needLogin) { setNeedLogin(true); setData(null); setError(null); return; }
      setNeedLogin(false);
      if (!res.data) throw new Error(res.errors?.join(' / ') || '데이터 로드 실패');
      setData(res.data);
      setError(null);
      // 데이터가 없으면 API 연결부터 하도록 설정 화면으로 이동
      if (res.source === 'empty') setRoute({ screen:'settings' });
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // 세션 만료 등으로 서버가 로그인을 요구하면 로그인 화면으로
  useEffect(() => {
    const onAuth = () => { setNeedLogin(true); setData(null); };
    window.addEventListener('hb:auth-required', onAuth);
    return () => window.removeEventListener('hb:auth-required', onAuth);
  }, []);

  const logout = useCallback(async () => {
    if (!window.confirm('로그아웃할까요?')) return;
    await apiClient.logout();
    setLoginNotice('');
    setData(null);
    setNeedLogin(true);
  }, []);

  // 사용 감지 · 10분 무사용 시 자동 로그아웃
  const loggedInView = !needLogin && !!data;
  useEffect(() => {
    if (!loggedInView) { setIdleLeft(null); return; }
    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) { lastWrite = now; setLastActivity(now); }
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];
    events.forEach(ev => window.addEventListener(ev, onActivity, { passive: true }));
    setLastActivity(Date.now());
    const timer = setInterval(async () => {
      const idle = Date.now() - (getLastActivity() || Date.now());
      if (idle >= IDLE_LIMIT_MS) {
        clearInterval(timer);
        await apiClient.logout();
        setLoginNotice('10분 동안 사용하지 않아 자동으로 로그아웃되었습니다.');
        setData(null);
        setNeedLogin(true);
      } else if (idle >= IDLE_LIMIT_MS - IDLE_WARN_MS) {
        setIdleLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000));
      } else {
        setIdleLeft(null);
      }
    }, 1000);
    return () => { clearInterval(timer); events.forEach(ev => window.removeEventListener(ev, onActivity)); };
  }, [loggedInView]);

  const refresh = useCallback(async () => {
    const fresh = await refreshData();
    setData(fresh);
    return fresh;
  }, []);

  const nav = useCallback((screen) => {
    setRoute({ screen });
    setGlobalSearch('');
    window.scrollTo(0, 0);
  }, []);

  const selectContract = useCallback((no) => {
    setRoute({ screen:'detail', contractNo:no });
    window.scrollTo(0, 0);
  }, []);

  const handleGlobalSearch = useCallback((val) => {
    setGlobalSearch(val);
    if (val && route.screen !== 'contracts') {
      setRoute({ screen:'contracts' });
    }
  }, [route.screen]);

  const onContractCreated = useCallback(async (contract) => {
    // 로컬 데이터 즉시 반영
    try {
      const fresh = await refreshData();
      setData(fresh);
      setRoute({ screen:'detail', contractNo: contract.no });
    } catch {
      // API가 없더라도 로컬에라도 반영
      setData(d => d ? { ...d, contracts: [...d.contracts, contract] } : d);
    }
  }, []);

  if (loading) return <div className="boot">불러오는 중…</div>;
  if (needLogin) return <LoginScreen notice={loginNotice} onLoggedIn={() => { setLoginNotice(''); setRoute({ screen:'dashboard' }); load(); }}/>;
  if (error && !data) return (
    <div style={{padding:40,fontSize:14,color:'var(--ink-2)'}}>
      <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>데이터 로드 실패</div>
      <div style={{color:'var(--danger)',marginBottom:16}}>{error}</div>
      <button className="btn-primary" onClick={load}>다시 시도</button>
    </div>
  );
  if (!data) return null;

  const counts = {
    total: data.contracts.length,
    receivable: data.contracts.filter(c => c.balance > 0).length,
    clients: data.clientStats.length,
  };

  const crumbTitles = {
    dashboard:'대시보드', contracts:'계약 관리', detail:'계약 상세',
    receivable:'미수금 관리', clients:'거래처 관리',
    expense:'지출·기성 관리', reports:'리포트·통계', settings:'설정',
  };
  const crumbs = route.screen === 'detail'
    ? ['홈', '계약 관리', `#${route.contractNo}`]
    : ['홈', crumbTitles[route.screen] || '대시보드'];

  const sideCurrent = route.screen === 'detail' ? 'contracts' : route.screen;

  return (
    <ToastProvider>
      {idleLeft != null && (
        <div className="no-print" role="alertdialog" aria-live="assertive"
          style={{position:'fixed',left:'50%',bottom:24,transform:'translateX(-50%)',zIndex:9999,
            background:'var(--green-800)',color:'#F5F1E4',borderRadius:12,padding:'12px 16px',
            boxShadow:'0 12px 32px rgba(0,0,0,.25)',display:'flex',alignItems:'center',gap:14,
            fontSize:13.5,maxWidth:'calc(100vw - 32px)',flexWrap:'wrap'}}>
          <span>사용이 없어 <b>{idleLeft}초</b> 후 자동으로 로그아웃됩니다.</span>
          <button type="button" onClick={() => { setLastActivity(Date.now()); setIdleLeft(null); }}
            style={{background:'#F5F1E4',color:'var(--green-800)',border:0,borderRadius:7,padding:'6px 12px',fontWeight:700,cursor:'pointer'}}>
            계속 사용
          </button>
        </div>
      )}
      <div className="app">
        <Sidebar key={uiTick} current={sideCurrent} onNav={nav} counts={counts} onLogout={logout}/>
        <main>
          <Topbar
            crumbs={crumbs}
            searchValue={globalSearch}
            onSearch={handleGlobalSearch}
            onAddContract={() => setNewContractOpen(true)}
            source={data._source}
            onRefresh={refresh}
          />

          {route.screen === 'dashboard' && (
            <ScreenDashboard key={uiTick} data={data} onNav={nav} onSelectContract={selectContract}/>
          )}
          {route.screen === 'contracts' && (
            <ScreenContracts data={data} onSelectContract={selectContract} initialSearch={globalSearch} onOpenNew={() => setNewContractOpen(true)}/>
          )}
          {route.screen === 'detail' && (
            <ScreenDetail
              data={data}
              contractNo={route.contractNo}
              onBack={() => nav('contracts')}
              onOpenExpense={(c) => setExpenseContract(c)}
              onUpdated={refresh}
              onSelectContract={selectContract}
            />
          )}
          {route.screen === 'receivable' && (
            <ScreenReceivable data={data} onSelectContract={selectContract}/>
          )}
          {route.screen === 'clients' && (
            <ScreenClients data={data} onSelectContract={selectContract} onUpdated={refresh}/>
          )}
          {route.screen === 'expense' && (
            <ScreenExpense data={data} onSelectContract={selectContract} onOpenExpense={(c) => setExpenseContract(c)}/>
          )}
          {route.screen === 'reports' && (
            <ScreenReports data={data}/>
          )}
          {route.screen === 'settings' && (
            <ScreenSettings data={data} onRefresh={refresh} onApiUpdated={() => { bumpUi(); refresh(); }}/>
          )}
        </main>
      </div>

      <NewContractModal
        open={newContractOpen}
        onClose={() => setNewContractOpen(false)}
        onCreated={onContractCreated}
        data={data}
      />

      {/* 조건부 마운트: contract 이 세팅될 때만 렌더 (hooks 순서 안정성 확보) */}
      {expenseContract && (
        <ExpenseModal
          key={expenseContract.id ?? expenseContract.no}
          open={true}
          contract={expenseContract}
          onClose={() => setExpenseContract(null)}
          data={data}
          onSaved={refresh}
        />
      )}
    </ToastProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<App/>);
