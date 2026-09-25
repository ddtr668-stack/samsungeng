/* ═══════════════════════════════════════════════════════════════
   화면 2 · 계약 리스트 (검색·필터·정렬·페이지네이션)
═══════════════════════════════════════════════════════════════ */

const ScreenContracts = ({ data, onSelectContract, initialSearch = '', onOpenNew }) => {
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [manager, setManager] = useState('all');
  const managers = useMemo(() => [...new Set(data.contracts.map(c => c.manager).filter(Boolean))].sort(), [data]);
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [sortKey, setSortKey] = useState('no');
  const [sortDir, setSortDir] = useState('desc');

  // Reset search when initialSearch changes
  useEffect(() => { setSearch(initialSearch); }, [initialSearch]);

  const years = useMemo(() => {
    const ys = new Set();
    data.contracts.forEach(c => { if (c.contractDate) ys.add(c.contractDate.substring(0,4)); });
    return [...ys].sort();
  }, [data]);

  // 선택된 연도에 실제 데이터가 있는 월만 선택지에 표시
  const monthsInYear = useMemo(() => {
    const ms = new Set();
    data.contracts.forEach(c => {
      if (!c.contractDate) return;
      if (year !== 'all' && !c.contractDate.startsWith(year)) return;
      ms.add(c.contractDate.substring(5,7));
    });
    return [...ms].sort();
  }, [data, year]);

  // 연도 변경 시 유효하지 않은 월이면 초기화
  useEffect(() => {
    if (month !== 'all' && !monthsInYear.includes(month)) setMonth('all');
  }, [year, monthsInYear, month]);

  // Filter
  const filtered = useMemo(() => {
    return data.contracts.filter(c => {
      if (category !== 'all' && c.category !== category) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (manager !== 'all' && c.manager !== manager) return false;
      if (year !== 'all' && (!c.contractDate || !c.contractDate.startsWith(year))) return false;
      if (month !== 'all' && (!c.contractDate || c.contractDate.substring(5,7) !== month)) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${c.no} ${c.projectName} ${c.client} ${c.category} ${c.subcontractor||''} ${c.manager||''} ${c.managerCode||''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, search, category, status, year, month, monthsInYear, manager]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'contractDate') { av = av || ''; bv = bv || ''; }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const { page, setPage, totalPages, paged, start, end } = usePagination(sorted, 15);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const catCounts = useMemo(() => {
    const c = { 전체: data.contracts.length };
    data.categoryStats.forEach(s => c[s.name] = s.count);
    return c;
  }, [data]);

  // 필터 요약 KPI
  const filtered총 = filtered.reduce((s,c) => s+c.totalAmount, 0);
  const filtered잔 = filtered.reduce((s,c) => s+c.balance, 0);
  const filtered이 = filtered.reduce((s,c) => s+c.profit, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>계약 관리</h1>
          <div className="page-sub">
            <b>{filtered.length}건</b> 계약 · 총 계약금 <b>{fmtKRW억(filtered총)}원</b> · 미수 잔금 <b style={{color:'var(--danger)'}}>{fmtKRW억(filtered잔)}원</b> · 이윤 <b style={{color:'var(--pos)'}}>{fmtKRW억(filtered이)}원</b>
          </div>
        </div>
        <div className="hstack">
          <button className="btn-ghost"><Icon name="download" size={14}/>엑셀 내보내기</button>
        </div>
      </div>

      {/* 카테고리 칩 */}
      <div className="controls-bar" style={{marginBottom:16}}>
        <button className={`chip ${category === 'all' ? 'on' : ''}`} onClick={()=>setCategory('all')}>전체 <span className="n">{catCounts.전체}</span></button>
        {['민수','조달공사','정부지원사업','조달납품'].map(cat => (
          <button key={cat} className={`chip ${category === cat ? 'on' : ''}`} onClick={()=>setCategory(cat)}>
            {cat} <span className="n">{catCounts[cat] || 0}</span>
          </button>
        ))}
      </div>

      <div className="card tight">
        {/* 정렬·필터 툴바 */}
        <div className="controls-bar">
          <div className="search" style={{width:280,margin:0}}>
            <span className="sicon"><Icon name="search" size={14} stroke={2}/></span>
            <input placeholder="프로젝트·거래처·도급업체 검색"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                   style={{height:32,fontSize:12.5,paddingLeft:32}}/>
          </div>

          <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">진행 상태 · 전체</option>
            <option value="완료">완료</option>
            <option value="진행중">진행중</option>
            <option value="미진행">미진행</option>
          </select>

          {managers.length > 1 && (
            <select className="filter-select" value={manager} onChange={e => setManager(e.target.value)}>
              <option value="all">담당자 · 전체</option>
              {managers.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          <select className="filter-select" value={year} onChange={e => setYear(e.target.value)}>
            <option value="all">연도 · 전체</option>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>

          <select className="filter-select" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="all">월 · 전체</option>
            {monthsInYear.map(m => <option key={m} value={m}>{parseInt(m)}월</option>)}
          </select>

          {(category !== 'all' || status !== 'all' || year !== 'all' || month !== 'all' || search) && (
            <button
              className="chip"
              onClick={() => { setCategory('all'); setStatus('all'); setYear('all'); setMonth('all'); setSearch(''); }}
              style={{borderColor:'var(--bronze-500)',color:'var(--bronze-800)',fontWeight:600}}
            >
              필터 초기화 ×
            </button>
          )}

          <div className="spacer"/>

          <div style={{fontSize:12,color:'var(--ink-3)'}}>
            정렬: <b style={{color:'var(--ink-2)'}}>{
              {no:'계약번호', contractDate:'계약일', totalAmount:'계약금액', balance:'미수잔금', marginRate:'마진율', progress:'진행률'}[sortKey]
            } {sortDir === 'asc' ? '↑' : '↓'}</b>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('no')} style={{width:104}}>
                  계약번호 <span className="sarr">{sortKey==='no' ? (sortDir==='asc'?'▲':'▼') : '⇅'}</span>
                </th>
                <th className="sortable" onClick={() => toggleSort('contractDate')} style={{width:88}}>
                  계약월 <span className="sarr">{sortKey==='contractDate' ? (sortDir==='asc'?'▲':'▼') : '⇅'}</span>
                </th>
                <th style={{width:92}}>구분</th>
                <th style={{width:140}}>거래처</th>
                <th style={{width:76}}>담당자</th>
                <th>프로젝트명</th>
                <th className="right sortable" onClick={() => toggleSort('totalAmount')} style={{width:120}}>
                  계약금 <span className="sarr">{sortKey==='totalAmount' ? (sortDir==='asc'?'▲':'▼') : '⇅'}</span>
                </th>
                <th className="right sortable" onClick={() => toggleSort('balance')} style={{width:110}}>
                  잔금 <span className="sarr">{sortKey==='balance' ? (sortDir==='asc'?'▲':'▼') : '⇅'}</span>
                </th>
                <th className="center sortable" onClick={() => toggleSort('progress')} style={{width:100}}>
                  진행률 <span className="sarr">{sortKey==='progress' ? (sortDir==='asc'?'▲':'▼') : '⇅'}</span>
                </th>
                <th className="center" style={{width:78}}>상태</th>
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 && (
                <tr><td colSpan="10" className="empty">
                  <Icon name="search" size={32} stroke={1.4}/>
                  <div>검색 조건에 맞는 계약이 없습니다.</div>
                </td></tr>
              )}
              {paged.map(c => (
                <tr key={c.id ?? c.no} className="clickable" onClick={() => onSelectContract(c.id ?? c.no)}>
                  <td className="tnum" style={{fontWeight:600,color:'var(--ink-2)',whiteSpace:'nowrap'}} title={`전체 번호 #${c.no}`}>{contractCode(c)}</td>
                  <td className="num tnum">{fmtMonthShort(c.contractDate)}</td>
                  <td><CatTag cat={c.category}/></td>
                  <td style={{fontSize:12.5,color:'var(--ink-2)',fontWeight:500,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.client}</td>
                  <td style={{fontSize:12.5,color:'var(--ink-2)',whiteSpace:'nowrap'}}>{c.manager || '—'}</td>
                  <td className="proj-cell">
                    <div className="p-name">{c.projectName || <span className="muted">(제목 없음)</span>}</div>
                    {c.subcontractor && <div className="p-client">도급 · {c.subcontractor}</div>}
                  </td>
                  <td className="right"><Amt v={c.totalAmount}/></td>
                  <td className="right">
                    {c.balance > 0
                      ? <Amt v={c.balance} className="neg"/>
                      : <span className="amt mute">완결</span>}
                  </td>
                  <td className="center"><MiniProgress value={c.progress}/></td>
                  <td className="center"><StatusPill status={c.status}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="table-foot">
            <span>전체 <b className="tnum" style={{color:'var(--ink-1)'}}>{sorted.length}건</b> 중 <b className="tnum" style={{color:'var(--ink-1)'}}>{start}–{end}</b> 표시</span>
            <Pager page={page} totalPages={totalPages} onChange={setPage}/>
          </div>
        )}
      </div>
    </>
  );
};

window.ScreenContracts = ScreenContracts;
