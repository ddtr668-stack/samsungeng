/* ═══════════════════════════════════════════════════════════════
   앱 · 데이터 로딩 · 라우팅 · 모달 통합
═══════════════════════════════════════════════════════════════ */

const App = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
      const res = await loadInitialData();
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
      <div className="app">
        <Sidebar key={uiTick} current={sideCurrent} onNav={nav} counts={counts}/>
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
            />
          )}
          {route.screen === 'receivable' && (
            <ScreenReceivable data={data} onSelectContract={selectContract}/>
          )}
          {route.screen === 'clients' && (
            <ScreenClients data={data} onSelectContract={selectContract} onUpdated={refresh}/>
          )}
          {route.screen === 'expense' && (
            <ScreenExpense data={data} onSelectContract={selectContract}/>
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
