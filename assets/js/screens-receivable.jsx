/* ═══════════════════════════════════════════════════════════════
   화면 4 · 미수금 관리
═══════════════════════════════════════════════════════════════ */

const ScreenReceivable = ({ data, onSelectContract, managerOptions, viewManager, onManagerChange }) => {
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [year, setYear] = useState('all');
  const [month, setMonth] = useState('all');
  const [amountRange, setAmountRange] = useState('all'); // all | u1000 | u5000 | u10000 | o10000
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('balance');
  const [sortDir, setSortDir] = useState('desc');

  const receivables = useMemo(() => {
    return data.contracts.filter(c => c.balance > 0);
  }, [data]);

  // 데이터에서 실제 존재하는 연도만
  const years = useMemo(() => {
    const ys = new Set();
    receivables.forEach(c => { if (c.contractDate) ys.add(c.contractDate.substring(0,4)); });
    return [...ys].sort();
  }, [receivables]);

  // 선택 연도에 실제 데이터가 있는 월만
  const monthsInYear = useMemo(() => {
    const ms = new Set();
    receivables.forEach(c => {
      if (!c.contractDate) return;
      if (year !== 'all' && !c.contractDate.startsWith(year)) return;
      ms.add(c.contractDate.substring(5,7));
    });
    return [...ms].sort();
  }, [receivables, year]);

  // 연도 변경 시 유효하지 않은 월 리셋
  useEffect(() => {
    if (month !== 'all' && !monthsInYear.includes(month)) setMonth('all');
  }, [year, monthsInYear, month]);

  // 잔금 규모대 매칭
  const inAmountRange = (v) => {
    if (amountRange === 'all') return true;
    if (amountRange === 'u1000') return v < 1e7;                    // 1000만 미만
    if (amountRange === 'u5000') return v >= 1e7 && v < 5e7;        // 1000만~5000만
    if (amountRange === 'u10000') return v >= 5e7 && v < 1e8;       // 5000만~1억
    if (amountRange === 'o10000') return v >= 1e8;                  // 1억 이상
    return true;
  };

  const filtered = useMemo(() => {
    return receivables.filter(c => {
      if (category !== 'all' && c.category !== category) return false;
      if (status !== 'all' && c.status !== status) return false;
      if (year !== 'all' && (!c.contractDate || !c.contractDate.startsWith(year))) return false;
      if (month !== 'all' && (!c.contractDate || c.contractDate.substring(5,7) !== month)) return false;
      if (!inAmountRange(c.balance)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!`${c.projectName} ${c.client}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [receivables, category, status, year, month, amountRange, search]);

  const hasActiveFilter = category !== 'all' || status !== 'all' || year !== 'all' || month !== 'all' || amountRange !== 'all' || search;
  const resetFilters = () => {
    setCategory('all'); setStatus('all'); setYear('all'); setMonth('all'); setAmountRange('all'); setSearch('');
  };

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a,b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av - bv) : (bv - av);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const { page, setPage, totalPages, paged, start, end } = usePagination(sorted, 12);

  const totalBalance = filtered.reduce((s,c) => s+c.balance, 0);
  const totalContract = filtered.reduce((s,c) => s+c.totalAmount, 0);

  // 부문별 미수 요약
  const byCategory = useMemo(() => {
    const acc = {};
    receivables.forEach(c => {
      if (!acc[c.category]) acc[c.category] = { name:c.category, count:0, balance:0, total:0 };
      acc[c.category].count++;
      acc[c.category].balance += c.balance;
      acc[c.category].total += c.totalAmount;
    });
    return Object.values(acc).sort((a,b) => b.balance - a.balance);
  }, [receivables]);

  const maxCatBal = Math.max(...byCategory.map(c => c.balance));

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1><span className="hl">미수금</span> 관리</h1>
          <div className="page-sub">
            {hasActiveFilter ? (
              <>
                필터 결과 <b>{filtered.length}건</b> · 미수 합계 <b style={{color:'var(--danger)'}}>{fmtKRW억(totalBalance)}원</b>
                <span style={{color:'var(--ink-4)',marginLeft:8}}>(전체 {receivables.length}건 중)</span>
              </>
            ) : (
              <>잔금이 남아있는 <b>{receivables.length}건</b> · 총 <b style={{color:'var(--danger)'}}>{fmtKRW억(receivables.reduce((s,c)=>s+c.balance,0))}원</b></>
            )}
          </div>
        </div>
        <div className="hstack">
          <ManagerPicker managers={managerOptions} value={viewManager} onChange={onManagerChange}/>
          <button className="btn-ghost" title="지금 목록(필터 적용)을 엑셀(CSV)로 저장" onClick={() => downloadCsv('receivables',
            ['계약번호','계약일','담당자','구분','거래처','프로젝트명','계약금','수금액','미수 잔금','수금률','상태'],
            sorted.map(c => [contractCode(c), c.contractDate || '', c.manager || '', c.category, c.client, c.projectName, c.totalAmount, c.paidAmount, c.balance, c.totalAmount ? Math.round(c.paidAmount / c.totalAmount * 100) + '%' : '', c.status]))}>
            <Icon name="download" size={14}/>수금 리포트</button>
          <button className="btn-primary"><Icon name="file" size={14}/>독촉장 발송</button>
        </div>
      </div>

      {/* 상단 요약 */}
      <div className="row-2">
        <div className="card">
          <CardHead title="부문별 미수 잔금" sub="즉시 관리가 필요한 부문 순"/>
          <div className="bars">
            {byCategory.map(c => (
              <div key={c.name} className="bar-row">
                <div className="b-top">
                  <span className="b-label"><CatTag cat={c.name}/> <span style={{color:'var(--ink-3)',fontWeight:500,marginLeft:6}}>{c.count}건 · 계약금 대비 {fmtPct(c.balance/c.total)}</span></span>
                  <span className="b-value">{fmtKRW(c.balance)}<span style={{color:'var(--ink-3)',fontWeight:500,fontSize:11,marginLeft:2}}>원</span></span>
                </div>
                <div className="b-track"><div className={`b-fill ${c.name}`} style={{width: (c.balance / maxCatBal * 100) + '%'}}/></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <CardHead title="수금 진행 요약"/>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600,letterSpacing:'0.03em'}}>전체 계약 대비 수금률</div>
              <div style={{display:'flex',alignItems:'baseline',gap:6,marginTop:4}}>
                <div style={{fontSize:26,fontWeight:800,letterSpacing:'-0.03em',color:'var(--green-800)'}} className="tnum">{fmtPct(data.summary.paidAmount / data.summary.totalAmount)}</div>
                <div style={{fontSize:12,color:'var(--ink-3)'}}>({fmtKRW억(data.summary.paidAmount)} / {fmtKRW억(data.summary.totalAmount)})</div>
              </div>
              <div className="pbar" style={{marginTop:8}}>
                <div className="pfill" style={{width: (data.summary.paidAmount / data.summary.totalAmount * 100) + '%'}}/>
              </div>
            </div>

            <div style={{borderTop:'1px solid var(--line)',paddingTop:14,display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
              <div>
                <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>미수 계약</div>
                <div style={{fontSize:18,fontWeight:800,color:'var(--ink-1)',marginTop:3,letterSpacing:'-0.02em'}} className="tnum">{receivables.length}<span style={{fontSize:12,color:'var(--ink-3)',marginLeft:2}}>건</span></div>
              </div>
              <div>
                <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>평균 미수액</div>
                <div style={{fontSize:18,fontWeight:800,color:'var(--ink-1)',marginTop:3,letterSpacing:'-0.02em'}} className="tnum">{fmtKRW억(receivables.reduce((s,c)=>s+c.balance,0) / (receivables.length || 1))}</div>
              </div>
              <div>
                <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>1억+ 미수</div>
                <div style={{fontSize:18,fontWeight:800,color:'var(--danger)',marginTop:3,letterSpacing:'-0.02em'}} className="tnum">{receivables.filter(c => c.balance >= 1e8).length}<span style={{fontSize:12,color:'var(--ink-3)',marginLeft:2}}>건</span></div>
              </div>
              <div>
                <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>최대 미수</div>
                <div style={{fontSize:18,fontWeight:800,color:'var(--danger)',marginTop:3,letterSpacing:'-0.02em'}} className="tnum">{fmtKRW억(Math.max(...receivables.map(c=>c.balance)))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 + 리스트 */}
      <div className="controls-bar" style={{marginBottom:16}}>
        <button className={`chip ${category === 'all' ? 'on' : ''}`} onClick={()=>setCategory('all')}>전체 <span className="n">{receivables.length}</span></button>
        {byCategory.map(c => (
          <button key={c.name} className={`chip ${category === c.name ? 'on' : ''}`} onClick={()=>setCategory(c.name)}>
            {c.name} <span className="n">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="card tight">
        <div className="controls-bar">
          <div className="search" style={{width:260,margin:0}}>
            <span className="sicon"><Icon name="search" size={14} stroke={2}/></span>
            <input placeholder="프로젝트·거래처 검색"
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

          <select className="filter-select" value={year} onChange={e => setYear(e.target.value)}>
            <option value="all">연도 · 전체</option>
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>

          <select className="filter-select" value={month} onChange={e => setMonth(e.target.value)}>
            <option value="all">월 · 전체</option>
            {monthsInYear.map(m => <option key={m} value={m}>{parseInt(m)}월</option>)}
          </select>

          <select className="filter-select" value={amountRange} onChange={e => setAmountRange(e.target.value)}>
            <option value="all">잔금 규모 · 전체</option>
            <option value="u1000">1,000만 미만</option>
            <option value="u5000">1,000만 ~ 5,000만</option>
            <option value="u10000">5,000만 ~ 1억</option>
            <option value="o10000">1억 이상</option>
          </select>

          {hasActiveFilter && (
            <button
              className="chip"
              onClick={resetFilters}
              style={{borderColor:'var(--bronze-500)',color:'var(--bronze-800)',fontWeight:600}}
            >
              필터 초기화 ×
            </button>
          )}

          <div className="spacer"/>
          <div style={{fontSize:12,color:'var(--ink-3)'}}>합계: <b className="tnum" style={{color:'var(--danger)'}}>{fmtKRW(totalBalance)}원</b> / <b className="tnum" style={{color:'var(--ink-2)'}}>{fmtKRW(totalContract)}원</b></div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:50}}>순위</th>
                <th style={{width:100}}>구분</th>
                <th>프로젝트 / 거래처</th>
                <th style={{width:105}}>계약일</th>
                <th className="right sortable" onClick={()=>toggleSort('totalAmount')} style={{width:120}}>계약금액</th>
                <th className="right sortable" onClick={()=>toggleSort('paidAmount')} style={{width:120}}>수금액</th>
                <th className="right sortable" onClick={()=>toggleSort('balance')} style={{width:130}}>미수 잔금 {sortKey==='balance' && (sortDir==='asc'?'▲':'▼')}</th>
                <th className="center" style={{width:110}}>수금률</th>
                <th className="center" style={{width:80}}>상태</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c, i) => {
                const rank = (page-1)*12 + i + 1;
                const paidPct = c.totalAmount > 0 ? c.paidAmount / c.totalAmount : 0;
                return (
                  <tr key={c.id ?? c.no} className="clickable" onClick={()=>onSelectContract(c.id ?? c.no)}>
                    <td className="center" style={{fontSize:12,fontWeight:700,color: rank<=3 ? 'var(--danger)' : 'var(--ink-3)'}}>{rank}</td>
                    <td><CatTag cat={c.category}/></td>
                    <td className="proj-cell">
                      <div className="p-name">{c.projectName || '—'}</div>
                      <div className="p-client">{c.client}</div>
                    </td>
                    <td className="num tnum">{fmtDate(c.contractDate)}</td>
                    <td className="right"><Amt v={c.totalAmount}/></td>
                    <td className="right"><Amt v={c.paidAmount} className="pos"/></td>
                    <td className="right"><Amt v={c.balance} className="neg"/></td>
                    <td className="center">
                      <div style={{display:'inline-flex',alignItems:'center',gap:6}}>
                        <div style={{width:60,height:5,background:'var(--bg-2)',borderRadius:3,overflow:'hidden'}}>
                          <div style={{width:(paidPct*100)+'%',height:'100%',background:'var(--bronze-500)'}}></div>
                        </div>
                        <span className="tnum" style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>{Math.round(paidPct*100)}%</span>
                      </div>
                    </td>
                    <td className="center"><StatusPill status={c.status}/></td>
                  </tr>
                );
              })}
              {paged.length === 0 && (
                <tr><td colSpan="9" className="empty">
                  <Icon name="checkCircle" size={32} stroke={1.4}/>
                  <div>조건에 맞는 미수금이 없습니다. 🎉</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="table-foot">
            <span>미수 <b className="tnum" style={{color:'var(--ink-1)'}}>{sorted.length}건</b> 중 <b className="tnum">{start}–{end}</b></span>
            <Pager page={page} totalPages={totalPages} onChange={setPage}/>
          </div>
        )}
      </div>
    </>
  );
};

window.ScreenReceivable = ScreenReceivable;
