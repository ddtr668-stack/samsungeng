/* ═══════════════════════════════════════════════════════════════
   화면 1 · 종합 대시보드
═══════════════════════════════════════════════════════════════ */

// ─── 담당자별 대시보드: 선택한 담당자의 계약만으로 요약·통계를 다시 계산 ───
const DASH_RANGE_KEY = 'hb.dashRange';

// ─── 기간 선택 (월 단위) ───
const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const DateRangePicker = ({ range, onChange, minYm, maxYm }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(range);
  const boxRef = useRef(null);
  useEffect(() => { if (open) setDraft(range); }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const fmt = (ym) => ym ? ym.replace('-', '.') : '';
  const label = `${fmt(range.from || minYm) || '—'} – ${fmt(range.to || maxYm) || '—'}`;
  const now = new Date();
  const y = now.getFullYear();
  const back = (m) => { const d = new Date(y, now.getMonth() - m, 1); return ymOf(d); };
  const presets = [
    ['전체 기간', { from:'', to:'' }],
    ['올해', { from:`${y}-01`, to:`${y}-12` }],
    ['작년', { from:`${y-1}-01`, to:`${y-1}-12` }],
    ['최근 6개월', { from: back(5), to: ymOf(now) }],
    ['최근 12개월', { from: back(11), to: ymOf(now) }],
  ];
  const apply = (r) => {
    let { from, to } = r;
    if (from && to && from > to) [from, to] = [to, from];
    onChange({ from: from || '', to: to || '' });
    setOpen(false);
  };
  const isOn = (r) => (range.from || '') === r.from && (range.to || '') === r.to;
  const inputSt = { padding:'7px 6px', border:'1px solid var(--line)', borderRadius:7, fontSize:12.5, background:'#fff', color:'var(--ink-1)', width:'100%', minWidth:0, boxSizing:'border-box' };

  return (
    <div ref={boxRef} style={{position:'relative'}}>
      <div className="date-pick" role="button" tabIndex={0} onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        title="기간 선택 (계약일 기준)">
        <Icon name="calendar" size={14}/>
        <b>{label}</b>
        <Icon name="chevronDown" size={11} stroke={2.2}/>
      </div>
      {open && (
        <div style={{position:'absolute',right:0,top:'calc(100% + 6px)',zIndex:50,width:340,maxWidth:'calc(100vw - 32px)',boxSizing:'border-box',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 12px 32px rgba(20,25,20,.14)',padding:14}}>
          <div style={{fontSize:11.5,fontWeight:700,color:'var(--ink-3)',marginBottom:8}}>빠른 선택</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:14}}>
            {presets.map(([name, r]) => (
              <button key={name} type="button" className={`chip ${isOn(r) ? 'on' : ''}`} onClick={() => apply(r)}>{name}</button>
            ))}
          </div>
          <div style={{fontSize:11.5,fontWeight:700,color:'var(--ink-3)',marginBottom:8}}>직접 선택 (계약일 기준)</div>
          <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto minmax(0,1fr)',gap:6,alignItems:'center'}}>
            <input type="month" value={draft.from || ''} min={minYm} max={maxYm} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} style={inputSt} aria-label="시작 월"/>
            <span style={{color:'var(--ink-4)'}}>–</span>
            <input type="month" value={draft.to || ''} min={minYm} max={maxYm} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} style={inputSt} aria-label="끝 월"/>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:6,marginTop:12}}>
            <button type="button" className="btn-ghost" style={{height:32,fontSize:12,padding:'0 12px'}} onClick={() => setOpen(false)}>취소</button>
            <button type="button" className="btn-primary" style={{height:32,fontSize:12,padding:'0 14px'}} onClick={() => apply(draft)}>적용</button>
          </div>
        </div>
      )}
    </div>
  );
};
const ScreenDashboard = ({ data: allData, onNav, onSelectContract, viewManager, onManagerChange }) => {
  // 담당자: 사이드바·이 화면 선택이 앱 전체에 공통 적용
  const managers = useMemo(() => [...new Set(allData.contracts.map(c => c.manager).filter(Boolean).concat(viewManager && viewManager !== 'all' ? [viewManager] : []))].sort(), [allData, viewManager]);
  const selManager = viewManager && viewManager !== 'all' ? viewManager : 'all';
  const pickManager = (v) => onManagerChange?.(v);
  // 기간 선택 (계약일 기준 · 브라우저에 기억)
  const [range, setRangeState] = useState(() => { try { return JSON.parse(localStorage.getItem(DASH_RANGE_KEY)) || { from:'', to:'' }; } catch { return { from:'', to:'' }; } });
  const setRange = (r) => { setRangeState(r); try { localStorage.setItem(DASH_RANGE_KEY, JSON.stringify(r)); } catch {} };
  const [dataMinYm, dataMaxYm] = useMemo(() => {
    const yms = allData.contracts.map(c => (c.contractDate || '').substring(0, 7)).filter(v => /^\d{4}-\d{2}$/.test(v)).sort();
    return [yms[0] || '', yms[yms.length - 1] || ''];
  }, [allData]);
  const data = useMemo(() => buildDashboardView(allData, selManager, range), [allData, selManager, range]);

  const s = data.summary;
  // 이번 달 · 지난달 신규 계약 건수 (계약일 기준)
  const monthCount = (offset) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return data.contracts.filter(c => (c.contractDate || '').startsWith(ym)).length;
  };
  const newThisMonth = monthCount(0);
  const newLastMonth = monthCount(-1);
  const receivableCount = data.contracts.filter(c => c.balance > 0).length;
  const cats = data.categoryStats;
  const monthly = data.monthlyStats;
  const topBal = data.topBalance.slice(0, 5);

  // 다가오는 세금계산서 미발행 계약 (세금계산서 미발행 > 0)
  const upcomingTax = useMemo(() => {
    return data.contracts
      .filter(c => c.taxInvoicePending > 0)
      .sort((a,b) => b.taxInvoicePending - a.taxInvoicePending)
      .slice(0, 4);
  }, [data]);

  // 최근 6개월 트렌드
  const [trendSpan, setTrendSpan] = useState('12');   // '6' | '12' | 'all'
  const trend = useMemo(() => {
    return trendSpan === 'all' ? monthly : monthly.slice(-Number(trendSpan));
  }, [monthly, trendSpan]);

  // 엑셀 내보내기: 지금 대시보드에 집계된 계약 목록 (CSV · 엑셀에서 바로 열림)
  const exportCsv = () => {
    const cols = [
      ['계약번호', c => contractCode(c)], ['전체번호', c => c.no], ['계약일', c => c.contractDate || ''],
      ['담당자', c => c.manager || ''], ['구분', c => c.category || ''], ['거래처', c => c.client || ''],
      ['프로젝트명', c => c.projectName || ''], ['총 계약금', c => c.totalAmount || 0], ['수금액', c => c.paidAmount || 0],
      ['미수 잔금', c => c.balance || 0], ['영업이윤', c => c.profit || 0], ['상태', c => c.status || ''],
    ];
    const esc = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const lines = [cols.map(c => c[0]).join(',')].concat(data.contracts.map(c => cols.map(([, f]) => esc(f(c))).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    // 파일명은 영문으로 (브라우저에 따라 한글 파일명이 무시되는 경우가 있음)
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const period = range.from || range.to ? `_${(range.from || 'start').replace('-', '')}-${(range.to || 'now').replace('-', '')}` : '';
    a.href = URL.createObjectURL(blob);
    a.download = `contracts_${today}${period}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // 차트 스케일 - 최근 12개월 총계약
  const maxTrend = Math.max(1, ...trend.map(t => t.total));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{selManager === 'all' ? <><span className="hl">종합 경영</span> 대시보드</> : <><span className="hl">{selManager}</span> 담당 대시보드</>}</h1>
          <div className="page-sub">
            {(() => { const d = new Date(); return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 (${'일월화수목금토'[d.getDay()]})`; })()} · 기준일 · {typeof getSheetName === 'function' ? getSheetName() : '계약관리'} · 총 <b>{data.contracts.length}건</b> 계약 집계
          </div>
        </div>
        <div className="hstack">
          {managers.length > 0 && typeof isAdmin === 'function' && isAdmin() && (
            <select className="filter-select" value={selManager} onChange={e => pickManager(e.target.value)}
              title="담당자별 대시보드" style={{height:36,fontSize:13,fontWeight:600}}>
              <option value="all">담당자 · 전체</option>
              {managers.map(m => <option key={m} value={m}>{m} 담당</option>)}
            </select>
          )}
          <button className="btn-ghost" onClick={exportCsv} title="지금 보이는 조건의 계약 목록을 엑셀(CSV)로 저장">
            <Icon name="download" size={14}/>
            엑셀 내보내기
          </button>
          <DateRangePicker range={range} onChange={setRange} minYm={dataMinYm} maxYm={dataMaxYm}/>
        </div>
      </div>

      {/* Alert bar */}
      <div className="alert-bar">
        <div className="icon"><Icon name="alert" size={16}/></div>
        <div className="txt">
          미수 잔금이 <b>{fmtKRW(s.balance)}원 ({fmtKRW억(s.balance)})</b>으로 총 계약금 대비 <b>{fmtPct(s.balance / s.totalAmount)}</b>를 차지합니다.
          {' '}민수 부문 집중 관리가 필요합니다.
        </div>
        <button className="act" onClick={() => onNav('receivable')}>미수금 상세 →</button>
      </div>

      {/* KPI cards */}
      <div className="kpis">
        <div className="kpi accent">
          <div className="label"><span className="kdot"></span>총 계약금액</div>
          <div className="val tnum">{fmtKRW억(s.totalAmount)}<span className="sub">원</span></div>
          <div>
            <span className="delta up" style={{background:'rgba(184,135,59,.22)',color:'#F0DFB6'}}>▲ {newLastMonth}건</span>
            <span className="compare">지난달 신규</span>
          </div>
          <svg className="spark" width="88" height="34" viewBox="0 0 88 34">
            <path d="M2 26 L14 22 L26 24 L38 18 L50 14 L62 16 L74 8 L86 6" fill="none" stroke="#C99C56" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="86" cy="6" r="2.8" fill="#F0DFB6"/>
          </svg>
        </div>

        <div className="kpi">
          <div className="label"><span className="kdot" style={{background:'var(--pos)'}}></span>수금액</div>
          <div className="val tnum">{fmtKRW억(s.paidAmount)}<span className="sub">원</span></div>
          <div>
            <span className="delta up">수금률 {fmtPct(s.paidAmount / s.totalAmount)}</span>
          </div>
          <svg className="spark" width="88" height="34" viewBox="0 0 88 34">
            <path d="M2 24 L12 20 L22 22 L32 14 L42 18 L52 10 L62 12 L72 8 L82 10" fill="none" stroke="var(--pos)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        <div className="kpi">
          <div className="label"><span className="kdot" style={{background:'var(--bronze-500)'}}></span>미수 잔금</div>
          <div className="val tnum">{fmtKRW억(s.balance)}<span className="sub">원</span></div>
          <div>
            <span className="delta down">미수율 {fmtPct(s.balance / s.totalAmount)}</span>
          </div>
          <svg className="spark" width="88" height="34" viewBox="0 0 88 34">
            <g fill="var(--bronze-500)" opacity="0.85">
              <rect x="4" y="14" width="6" height="16" rx="1.5"/>
              <rect x="14" y="12" width="6" height="18" rx="1.5"/>
              <rect x="24" y="10" width="6" height="20" rx="1.5"/>
              <rect x="34" y="8" width="6" height="22" rx="1.5"/>
              <rect x="44" y="14" width="6" height="16" rx="1.5"/>
              <rect x="54" y="10" width="6" height="20" rx="1.5"/>
              <rect x="64" y="6" width="6" height="24" rx="1.5"/>
              <rect x="74" y="4" width="6" height="26" rx="1.5"/>
            </g>
          </svg>
        </div>

        <div className="kpi">
          <div className="label"><span className="kdot" style={{background:'var(--green-600)'}}></span>영업이윤</div>
          <div className="val tnum">{fmtKRW억(s.profit)}<span className="sub">원</span></div>
          <div>
            <span className="delta up">마진율 {fmtPct(s.profit / s.totalAmount)}</span>
          </div>
          <svg className="spark" width="88" height="34" viewBox="0 0 88 34">
            <path d="M2 22 L14 24 L26 18 L38 20 L50 14 L62 12 L74 8 L86 4" fill="none" stroke="var(--green-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="86" cy="4" r="2.4" fill="var(--green-800)"/>
          </svg>
        </div>
      </div>

      {/* Chart + Progress */}
      <div className="row-2">
        <div className="card">
          <CardHead
            title="월별 계약·수금 추이"
            sub={`${trendSpan === 'all' ? '전체 기간' : `최근 ${trendSpan}개월`} · 신규 계약금 vs 수금액`}
            right={
              <div className="seg">
                {[['6','6M'], ['12','12M'], ['all','전체']].map(([v, l]) => (
                  <button key={v} className={trendSpan === v ? 'on' : ''} onClick={() => setTrendSpan(v)}>{l}</button>
                ))}
              </div>
            }
          />
          <div className="chart-legend">
            <span className="lgnd"><span className="dot" style={{background:'var(--green-700)'}}></span>계약금 <b>{fmtKRW(trend.reduce((s,t)=>s+t.total,0))}원</b></span>
            <span className="lgnd"><span className="dot" style={{background:'var(--bronze-500)'}}></span>수금액 <b>{fmtKRW(trend.reduce((s,t)=>s+t.paid,0))}원</b></span>
          </div>

          {trend.length === 0 ? (
            <div style={{height:260,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-4)',fontSize:13}}>선택한 조건에 해당하는 계약이 없습니다.</div>
          ) : (
          <svg viewBox="0 0 720 260" width="100%" height="260" preserveAspectRatio="none" style={{display:'block',overflow:'visible'}}>
            <defs>
              <linearGradient id="grad-green" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--green-700)" stopOpacity="0.28"/>
                <stop offset="100%" stopColor="var(--green-700)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {/* grid */}
            <g stroke="#E4E2D8" strokeWidth="1">
              <line x1="50" y1="30" x2="720" y2="30"/>
              <line x1="50" y1="85" x2="720" y2="85"/>
              <line x1="50" y1="140" x2="720" y2="140"/>
              <line x1="50" y1="195" x2="720" y2="195"/>
              <line x1="50" y1="240" x2="720" y2="240" stroke="#CFCCBD"/>
            </g>
            {/* y labels */}
            <g fill="#9A9E93" fontSize="10.5" fontFamily="Pretendard Variable" textAnchor="end">
              <text x="44" y="34">{fmtKRW억(maxTrend)}</text>
              <text x="44" y="89">{fmtKRW억(maxTrend*0.66)}</text>
              <text x="44" y="144">{fmtKRW억(maxTrend*0.33)}</text>
              <text x="44" y="244">0</text>
            </g>
            {/* bars + line */}
            {(() => {
              const w = 670, x0 = 50;
              const step = w / (trend.length);
              const barW = Math.max(10, step * 0.5);
              const yScale = v => 240 - (v / maxTrend) * 210;
              const linePoints = trend.map((t, i) => {
                const x = x0 + step * (i + 0.5);
                const y = yScale(t.paid);
                return `${x} ${y}`;
              });
              const pathD = 'M ' + linePoints.join(' L ');
              const areaD = pathD + ` L ${x0 + step*(trend.length-0.5)} 240 L ${x0 + step*0.5} 240 Z`;
              return (
                <g>
                  {/* Contract bars */}
                  {trend.map((t, i) => {
                    const x = x0 + step * (i + 0.5) - barW/2;
                    const y = yScale(t.total);
                    const h = 240 - y;
                    return (
                      <g key={i}>
                        <rect x={x} y={y} width={barW} height={h} rx="2.5" fill="var(--green-700)" opacity="0.85"/>
                      </g>
                    );
                  })}
                  {/* Paid line area */}
                  <path d={areaD} fill="url(#grad-green)"/>
                  <path d={pathD} fill="none" stroke="var(--bronze-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  {trend.map((t, i) => {
                    const x = x0 + step * (i + 0.5);
                    const y = yScale(t.paid);
                    return <circle key={'c'+i} cx={x} cy={y} r="3" fill="#fff" stroke="var(--bronze-500)" strokeWidth="1.8"/>;
                  })}
                </g>
              );
            })()}
            {/* x labels */}
            <g fill="#6B7069" fontSize="10.5" fontFamily="Pretendard Variable" textAnchor="middle" fontWeight="500">
              {trend.map((t, i) => {
                const step = 670 / trend.length;
                const x = 50 + step * (i + 0.5);
                const [y, m] = t.month.split('-');
                return <text key={i} x={x} y="258">{`${y.slice(2)}·${parseInt(m)}`}</text>;
              })}
            </g>
          </svg>
          )}
        </div>

        {/* Progress */}
        <div className="card">
          <CardHead
            title="계약 진행 현황"
            sub={`총 ${data.contracts.length}건 중 완료 ${s.statusCounts.완료}건 · 진행중 ${s.statusCounts.진행중}건 · 미진행 ${s.statusCounts.미진행}건`}
          />
          <div style={{display:'flex',alignItems:'center',gap:24}}>
            <svg width="150" height="150" viewBox="0 0 42 42">
              <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#EEEDE5" strokeWidth="4.5"/>
              {(() => {
                const total = s.statusCounts.완료 + s.statusCounts.진행중 + s.statusCounts.미진행;
                const p1 = (s.statusCounts.완료 / total) * 100;
                const p2 = (s.statusCounts.진행중 / total) * 100;
                const p3 = (s.statusCounts.미진행 / total) * 100;
                return (
                  <>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--pos)" strokeWidth="4.5"
                            strokeDasharray={`${p1} ${100-p1}`} strokeDashoffset="25"/>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--info)" strokeWidth="4.5"
                            strokeDasharray={`${p2} ${100-p2}`} strokeDashoffset={`${25 - p1}`}/>
                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--bronze-500)" strokeWidth="4.5"
                            strokeDasharray={`${p3} ${100-p3}`} strokeDashoffset={`${25 - p1 - p2}`}/>
                  </>
                );
              })()}
              <text x="21" y="21" textAnchor="middle" fontSize="7.5" fontWeight="800" fontFamily="Pretendard Variable" fill="var(--ink-1)" style={{fontVariantNumeric:'tabular-nums'}}>{Math.round((s.statusCounts.완료/(s.statusCounts.완료+s.statusCounts.진행중+s.statusCounts.미진행))*100)}%</text>
              <text x="21" y="27" textAnchor="middle" fontSize="3" fontWeight="600" fontFamily="Pretendard Variable" fill="var(--ink-3)">완료</text>
            </svg>

            <div style={{flex:1,display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:4}}>
                  <span style={{color:'var(--ink-2)',fontWeight:600}}><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'var(--pos)',marginRight:6}}></span>완료</span>
                  <span style={{color:'var(--ink-1)',fontWeight:700}} className="tnum">{s.statusCounts.완료}건</span>
                </div>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:4}}>
                  <span style={{color:'var(--ink-2)',fontWeight:600}}><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'var(--info)',marginRight:6}}></span>진행중</span>
                  <span style={{color:'var(--ink-1)',fontWeight:700}} className="tnum">{s.statusCounts.진행중}건</span>
                </div>
              </div>
              <div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:4}}>
                  <span style={{color:'var(--ink-2)',fontWeight:600}}><span style={{display:'inline-block',width:8,height:8,borderRadius:2,background:'var(--bronze-500)',marginRight:6}}></span>미진행</span>
                  <span style={{color:'var(--ink-1)',fontWeight:700}} className="tnum">{s.statusCounts.미진행}건</span>
                </div>
              </div>
            </div>
          </div>

          <div style={{marginTop:20,paddingTop:16,borderTop:'1px solid var(--line)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>이번 달 신규</div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--ink-1)',marginTop:2,letterSpacing:'-0.02em'}} className="tnum">{newThisMonth}건</div>
            </div>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)',fontWeight:600}}>미수 잔금 계약</div>
              <div style={{fontSize:18,fontWeight:800,color:'var(--ink-1)',marginTop:2,letterSpacing:'-0.02em'}} className="tnum">{receivableCount}건</div>
            </div>
          </div>
        </div>
      </div>

      {/* 부문별 실적 + 미수금 TOP */}
      <div className="row-2">
        <div className="card">
          <CardHead
            title="4대 사업부문 실적"
            sub="계약금액 · 이윤 · 마진율 비교"
            right={<button className="btn-ghost" style={{height:32,fontSize:12,padding:'0 12px'}} onClick={()=>onNav('reports')}>상세 리포트 →</button>}
          />
          <table className="tbl" style={{marginTop:4}}>
            <thead>
              <tr>
                <th>부문</th>
                <th className="right">건수</th>
                <th className="right">계약금액</th>
                <th className="right">이윤</th>
                <th className="right">마진율</th>
              </tr>
            </thead>
            <tbody>
              {cats.map(c => (
                <tr key={c.name}>
                  <td><CatTag cat={c.name}/></td>
                  <td className="right num tnum">{c.count}건</td>
                  <td className="right strong tnum">{fmtKRW억(c.total)}</td>
                  <td className="right tnum" style={{color:c.profit>=0?'var(--pos)':'var(--danger)',fontWeight:600}}>{fmtKRW억(c.profit)}</td>
                  <td className="right">
                    <span className="tnum" style={{fontWeight:700,color:c.marginRate>=0.15?'var(--pos)':c.marginRate>=0.05?'var(--ink-1)':'var(--danger)'}}>{fmtPct(c.marginRate)}</span>
                  </td>
                </tr>
              ))}
              <tr style={{background:'var(--surface-2)',fontWeight:700}}>
                <td><span style={{fontWeight:700,color:'var(--ink-1)',fontSize:12.5}}>합계</span></td>
                <td className="right num tnum" style={{color:'var(--ink-1)',fontWeight:700}}>{cats.reduce((s,c)=>s+c.count,0)}건</td>
                <td className="right strong tnum">{fmtKRW억(cats.reduce((s,c)=>s+c.total,0))}</td>
                <td className="right tnum" style={{color:'var(--pos)',fontWeight:700}}>{fmtKRW억(cats.reduce((s,c)=>s+c.profit,0))}</td>
                <td className="right tnum" style={{fontWeight:800,color:'var(--green-800)'}}>{fmtPct(s.profit / s.totalAmount)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <CardHead
            title="🚨 미수 잔금 TOP 5"
            sub="즉시 관리가 필요한 프로젝트"
            right={<button className="btn-ghost" style={{height:32,fontSize:12,padding:'0 12px'}} onClick={()=>onNav('receivable')}>전체 →</button>}
          />
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {topBal.map((c, i) => (
              <div key={(c.id ?? c.no) + '-tb-' + i}
                   onClick={() => onSelectContract(c.id ?? c.no)}
                   style={{display:'flex',alignItems:'center',gap:12,padding:'12px 12px',border:'1px solid var(--line)',borderRadius:10,cursor:'pointer',transition:'all .12s'}}
                   onMouseEnter={e => {e.currentTarget.style.background='var(--surface-2)';e.currentTarget.style.borderColor='var(--line-2)'}}
                   onMouseLeave={e => {e.currentTarget.style.background='';e.currentTarget.style.borderColor='var(--line)'}}>
                <div style={{width:26,height:26,borderRadius:7,background:i===0?'var(--danger)':i===1?'var(--bronze-500)':i===2?'var(--bronze-600)':'var(--ink-3)',color:'#fff',display:'grid',placeItems:'center',fontSize:12,fontWeight:800,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--ink-1)',letterSpacing:'-0.01em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.projectName || '(프로젝트명 없음)'}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:2,display:'flex',gap:6}}>
                    <CatTag cat={c.category}/>
                    <span style={{alignSelf:'center'}}>{c.client}</span>
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:'var(--danger)',letterSpacing:'-0.02em'}} className="tnum">{fmtKRW억(c.balance)}</div>
                  <div style={{fontSize:11,color:'var(--ink-4)',marginTop:2}} className="tnum">계약 {fmtKRW억(c.totalAmount)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 세금계산서 발행 예정 + 최근 계약 */}
      <div className="row-2">
        <div className="card">
          <CardHead
            title="세금계산서 미발행 계약"
            sub={`총 ${data.contracts.filter(c=>c.taxInvoicePending>0).length}건 · 즉시 발행 대상`}
            right={<button className="btn-ghost" style={{height:32,fontSize:12,padding:'0 12px'}}>일괄 발행</button>}
          />
          <table className="tbl">
            <thead>
              <tr>
                <th>프로젝트</th>
                <th>거래처</th>
                <th className="right">미발행 금액</th>
                <th className="center">액션</th>
              </tr>
            </thead>
            <tbody>
              {upcomingTax.map(c => (
                <tr key={(c.id ?? c.no) + '-tax'} className="clickable" onClick={() => onSelectContract(c.id ?? c.no)}>
                  <td>
                    <div className="proj-cell">
                      <div className="p-name" style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:220}}>{c.projectName || '—'}</div>
                      <div className="p-client">{fmtDate(c.contractDate)} · <CatTag cat={c.category}/></div>
                    </div>
                  </td>
                  <td style={{fontSize:12.5,color:'var(--ink-2)'}}>{c.client}</td>
                  <td className="right amt tnum" style={{color:'var(--warn)'}}>{fmtKRW(c.taxInvoicePending)}<span className="krw">원</span></td>
                  <td className="center">
                    <div className="row-act" style={{display:'inline-flex'}}>
                      <button className="pri" onClick={(e)=>e.stopPropagation()}>발행</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <CardHead
            title="최근 신규 계약"
            sub="가장 최근 등록된 5건"
            right={<button className="btn-ghost" style={{height:32,fontSize:12,padding:'0 12px'}} onClick={()=>onNav('contracts')}>전체 계약 →</button>}
          />
          <div style={{display:'flex',flexDirection:'column',gap:1}}>
            {[...data.contracts].sort((a,b) => (b.id ?? b.no) - (a.id ?? a.no)).slice(0, 5).map(c => (
              <div key={(c.id ?? c.no) + '-recent'}
                   onClick={() => onSelectContract(c.id ?? c.no)}
                   style={{display:'flex',alignItems:'center',gap:12,padding:'12px 4px',borderBottom:'1px dashed var(--line)',cursor:'pointer'}}>
                <div style={{fontSize:11.5,color:'var(--ink-4)',fontVariantNumeric:'tabular-nums',minWidth:34,fontWeight:600,whiteSpace:'nowrap'}}>{contractCode(c)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--ink-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.01em'}}>{c.projectName || '—'}</div>
                  <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:3,display:'flex',gap:6,alignItems:'center'}}>
                    <CatTag cat={c.category}/>
                    <span>{c.client}</span>
                    <span style={{color:'var(--ink-4)'}}>· {fmtDate(c.contractDate)}</span>
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:'var(--ink-1)',letterSpacing:'-0.02em'}} className="tnum">{fmtKRW억(c.totalAmount)}</div>
                  <div style={{marginTop:3}}><StatusPill status={c.status}/></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

window.ScreenDashboard = ScreenDashboard;
