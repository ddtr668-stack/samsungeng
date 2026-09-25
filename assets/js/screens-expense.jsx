/* ═══════════════════════════════════════════════════════════════
   화면 6 · 지출품의서·기성 관리
═══════════════════════════════════════════════════════════════ */

const ScreenExpense = ({ data, onSelectContract }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  // 도급이 있는 계약을 지출·기성 관리 대상으로
  const items = useMemo(() => {
    return data.contracts
      .filter(c => c.subcontractor && c.subcontractAmount > 0)
      .map(c => ({
        ...c,
        expenseStatus: c.subcontractBalance === 0 ? '정산완료' : c.subcontractPaid > 0 ? '진행중' : '미기성',
        기성률: c.subcontractAmount > 0 ? c.subcontractPaid / c.subcontractAmount : 0
      }));
  }, [data]);

  const filtered = items.filter(c => {
    if (status !== 'all' && c.expenseStatus !== status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${c.projectName} ${c.client} ${c.subcontractor}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const { page, setPage, totalPages, paged, start, end } = usePagination(filtered, 12);

  const totalSub = items.reduce((s,c) => s+c.subcontractAmount, 0);
  const totalPaid = items.reduce((s,c) => s+c.subcontractPaid, 0);
  const totalRem = items.reduce((s,c) => s+c.subcontractBalance, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>지출품의서 · 기성 관리</h1>
          <div className="page-sub">도급업체 지출 이력 · <b>{items.length}건</b> 계약 관리 중</div>
        </div>
        <div className="hstack">
          <button className="btn-ghost"><Icon name="download" size={14}/>지출 리포트</button>
          <button className="btn-primary"><Icon name="plus" size={14} stroke={2.2}/>지출품의서 작성</button>
        </div>
      </div>

      {/* KPI */}
      <div className="kpis">
        <div className="kpi">
          <div className="label"><span className="kdot"></span>총 도급금액</div>
          <div className="val tnum">{fmtKRW억(totalSub)}<span className="sub">원</span></div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:10}}>{items.length}건 계약 합계</div>
        </div>
        <div className="kpi">
          <div className="label"><span className="kdot" style={{background:'var(--pos)'}}></span>기성 완료액</div>
          <div className="val tnum" style={{color:'var(--pos)'}}>{fmtKRW억(totalPaid)}<span className="sub" style={{color:'var(--pos)'}}>원</span></div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:10}}>기성률 <b style={{color:'var(--ink-1)'}}>{fmtPct(totalPaid/totalSub)}</b></div>
        </div>
        <div className="kpi">
          <div className="label"><span className="kdot" style={{background:'var(--bronze-500)'}}></span>기성 잔액</div>
          <div className="val tnum" style={{color:'var(--warn)'}}>{fmtKRW억(totalRem)}<span className="sub" style={{color:'var(--warn)'}}>원</span></div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:10}}>{items.filter(c => c.subcontractBalance > 0).length}건 미정산</div>
        </div>
        <div className="kpi">
          <div className="label"><span className="kdot" style={{background:'var(--info)'}}></span>이번 달 처리 예정</div>
          <div className="val tnum">3<span className="sub">건</span></div>
          <div style={{fontSize:12,color:'var(--ink-3)',marginTop:10}}>예상 지출 <b style={{color:'var(--ink-1)'}}>{fmtKRW억(totalRem*0.15)}</b></div>
        </div>
      </div>

      {/* 필터 */}
      <div className="controls-bar" style={{marginBottom:16}}>
        <button className={`chip ${status === 'all' ? 'on' : ''}`} onClick={()=>setStatus('all')}>전체 <span className="n">{items.length}</span></button>
        <button className={`chip ${status === '미기성' ? 'on' : ''}`} onClick={()=>setStatus('미기성')}>미기성 <span className="n">{items.filter(c=>c.expenseStatus==='미기성').length}</span></button>
        <button className={`chip ${status === '진행중' ? 'on' : ''}`} onClick={()=>setStatus('진행중')}>진행중 <span className="n">{items.filter(c=>c.expenseStatus==='진행중').length}</span></button>
        <button className={`chip ${status === '정산완료' ? 'on' : ''}`} onClick={()=>setStatus('정산완료')}>정산완료 <span className="n">{items.filter(c=>c.expenseStatus==='정산완료').length}</span></button>
      </div>

      <div className="card tight">
        <div className="controls-bar">
          <div className="search" style={{width:280,margin:0}}>
            <span className="sicon"><Icon name="search" size={14} stroke={2}/></span>
            <input placeholder="현장·거래처·도급업체 검색"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                   style={{height:32,fontSize:12.5,paddingLeft:32}}/>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:70}}>계약번호</th>
                <th>현장 · 거래처</th>
                <th style={{width:180}}>도급업체</th>
                <th className="right" style={{width:130}}>도급금액</th>
                <th className="right" style={{width:130}}>기성 완료</th>
                <th className="right" style={{width:130}}>기성 잔액</th>
                <th className="center" style={{width:130}}>기성률</th>
                <th className="center" style={{width:110}}>상태</th>
                <th className="right" style={{width:100}}>액션</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(c => (
                <tr key={c.id ?? c.no} className="clickable" onClick={()=>onSelectContract(c.id ?? c.no)}>
                  <td className="tnum" style={{fontWeight:600,color:'var(--ink-2)',whiteSpace:'nowrap'}}>{contractCode(c)}</td>
                  <td className="proj-cell">
                    <div className="p-name" style={{maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.projectName || '—'}</div>
                    <div className="p-client">{c.client}</div>
                  </td>
                  <td style={{fontSize:12.5,color:'var(--ink-2)',fontWeight:500,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.subcontractor}</td>
                  <td className="right"><Amt v={c.subcontractAmount}/></td>
                  <td className="right"><Amt v={c.subcontractPaid} className="pos"/></td>
                  <td className="right">{c.subcontractBalance > 0 ? <Amt v={c.subcontractBalance} className="neg"/> : <span className="amt mute">완결</span>}</td>
                  <td className="center">
                    <div style={{display:'inline-flex',alignItems:'center',gap:8}}>
                      <div style={{width:60,height:5,background:'var(--bg-2)',borderRadius:3,overflow:'hidden'}}>
                        <div style={{width:(c.기성률*100)+'%',height:'100%',background:c.기성률===1?'var(--pos)':'var(--green-600)'}}></div>
                      </div>
                      <span className="tnum" style={{fontSize:11.5,fontWeight:600,color:'var(--ink-3)'}}>{Math.round(c.기성률*100)}%</span>
                    </div>
                  </td>
                  <td className="center">
                    <span className={`pill ${c.expenseStatus==='정산완료'?'done':c.expenseStatus==='진행중'?'prog':'wait'}`}>{c.expenseStatus}</span>
                  </td>
                  <td className="right">
                    <div className="row-act">
                      {c.subcontractBalance > 0 && <button className="pri" onClick={(e)=>e.stopPropagation()}>기성</button>}
                      <button onClick={(e)=>e.stopPropagation()}>상세</button>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr><td colSpan="9" className="empty">
                  <Icon name="expense" size={32} stroke={1.4}/>
                  <div>조건에 맞는 지출 이력이 없습니다.</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="table-foot">
            <span>총 <b className="tnum" style={{color:'var(--ink-1)'}}>{filtered.length}건</b> 중 <b className="tnum">{start}–{end}</b></span>
            <Pager page={page} totalPages={totalPages} onChange={setPage}/>
          </div>
        )}
      </div>
    </>
  );
};

window.ScreenExpense = ScreenExpense;
