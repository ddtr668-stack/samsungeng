/* ═══════════════════════════════════════════════════════════════
   화면 7 · 리포트 · 통계
═══════════════════════════════════════════════════════════════ */

const ScreenReports = ({ data: allData, viewManager, onManagerChange }) => {
  const [tab, setTab] = useState('category');  // category | monthly | yearly
  // ─── 담당자 선택 (대시보드와 같은 방식으로 선택한 담당자의 계약만 재집계) ───
  const managers = useMemo(() => [...new Set(allData.contracts.map(c => c.manager).filter(Boolean).concat(viewManager && viewManager !== 'all' ? [viewManager] : []))].sort(), [allData, viewManager]);
  const selManager = viewManager && viewManager !== 'all' ? viewManager : 'all';
  const pickManager = (v) => onManagerChange?.(v);
  const data = useMemo(() => buildDashboardView(allData, selManager, null), [allData, selManager]);
  const period = useMemo(() => {
    const yms = data.contracts.map(c => (c.contractDate || '').substring(0, 7)).filter(v => /^\d{4}-\d{2}$/.test(v)).sort();
    return yms.length ? `${yms[0].replace('-', '.')} – ${yms[yms.length - 1].replace('-', '.')}` : '—';
  }, [data]);
  const cats = data.categoryStats;
  const monthly = data.monthlyStats;

  // 연도별 집계
  const yearly = useMemo(() => {
    const acc = {};
    data.contracts.forEach(c => {
      const y = c.contractDate ? c.contractDate.substring(0,4) : '기타';
      if (!acc[y]) acc[y] = { year:y, count:0, total:0, paid:0, balance:0, profit:0 };
      acc[y].count++;
      acc[y].total += c.totalAmount;
      acc[y].paid += c.paidAmount;
      acc[y].balance += c.balance;
      acc[y].profit += c.profit;
    });
    return Object.values(acc).map(y => ({...y, marginRate: y.total ? y.profit/y.total : 0})).sort((a,b) => a.year.localeCompare(b.year));
  }, [data]);

  const maxMonthly = Math.max(1, ...monthly.map(m => m.total));
  const maxYearly = Math.max(1, ...yearly.map(y => y.total));

  // 엑셀 리포트: 지금 보고 있는 탭의 집계표를 CSV 로 저장
  const exportCsv = () => {
    const pct = v => (v * 100).toFixed(1) + '%';
    let head, rows;
    if (tab === 'category') {
      head = ['부문', '건수', '계약금', '수금액', '미수 잔금', '이윤', '마진율'];
      rows = cats.map(c => [c.name, c.count, c.total, c.paid, c.balance, c.profit, pct(c.marginRate || 0)]);
    } else if (tab === 'monthly') {
      head = ['월', '건수', '계약금', '수금액', '미수 잔금', '이윤'];
      rows = monthly.map(m => [m.month, m.count, m.total, m.paid, m.balance, m.profit]);
    } else {
      head = ['연도', '건수', '계약금', '수금액', '미수 잔금', '이윤', '마진율'];
      rows = yearly.map(y => [y.year, y.count, y.total, y.paid, y.balance, y.profit, pct(y.marginRate || 0)]);
    }
    const esc = v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const title = [`리포트 · ${{category:'부문별 실적', monthly:'월별 트렌드', yearly:'연도별 요약'}[tab]}`, `담당자: ${selManager === 'all' ? '전체' : selManager}`];
    const lines = [title.join(' / '), head.join(',')].concat(rows.map(r => r.map(esc).join(',')));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report_${tab}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{selManager === 'all' ? '리포트 · 통계' : `${selManager} 담당 · 리포트`}</h1>
          <div className="page-sub">부문별·기간별 실적 분석 · 데이터 기간 <b>{period}</b> · 총 <b>{data.contracts.length}건</b></div>
        </div>
        <div className="hstack">
          {managers.length > 0 && (
            <select className="filter-select no-print" value={selManager} onChange={e => pickManager(e.target.value)}
              title="담당자별 리포트" style={{height:36,fontSize:13,fontWeight:600}}>
              <option value="all">담당자 · 전체</option>
              {managers.map(m => <option key={m} value={m}>{m} 담당</option>)}
            </select>
          )}
          <button className="btn-ghost no-print" onClick={() => window.print()} title="인쇄 창에서 'PDF로 저장' 선택"><Icon name="print" size={14}/>PDF 출력</button>
          <button className="btn-ghost no-print" onClick={exportCsv} title="지금 보고 있는 탭의 집계표를 엑셀(CSV)로 저장"><Icon name="download" size={14}/>엑셀 리포트</button>
        </div>
      </div>

      {/* 탭 */}
      <div className="controls-bar" style={{marginBottom:20}}>
        <div className="seg">
          <button className={tab==='category'?'on':''} onClick={()=>setTab('category')}>부문별 실적</button>
          <button className={tab==='monthly'?'on':''} onClick={()=>setTab('monthly')}>월별 트렌드</button>
          <button className={tab==='yearly'?'on':''} onClick={()=>setTab('yearly')}>연도별 요약</button>
        </div>
      </div>

      {tab === 'category' && (
        <>
          {/* 부문별 카드 4개 */}
          <div className="kpis">
            {cats.map(c => (
              <div key={c.name} className="kpi">
                <div className="label">
                  <span className="kdot" style={{background: c.name==='민수'?'#8B7A2E':c.name==='조달공사'?'var(--green-700)':c.name==='정부지원사업'?'var(--bronze-500)':'#4B7A8E'}}></span>
                  {c.name}
                </div>
                <div className="val tnum">{fmtKRW억(c.total)}<span className="sub">원</span></div>
                <div style={{marginTop:10,display:'flex',gap:12,fontSize:11.5,color:'var(--ink-3)'}}>
                  <span>{c.count}건</span>
                  <span>이윤 <b style={{color:c.profit>=0?'var(--pos)':'var(--danger)'}} className="tnum">{fmtKRW억(c.profit)}</b></span>
                  <span>마진 <b style={{color:'var(--ink-1)'}} className="tnum">{fmtPct(c.marginRate)}</b></span>
                </div>
              </div>
            ))}
          </div>

          {/* 부문별 비교 차트 */}
          <div className="row-2">
            <div className="card">
              <CardHead title="계약금액 vs 이윤 비교" sub="부문별 절대 금액"/>
              <div className="bars">
                {cats.map(c => (
                  <div key={c.name} className="bar-row">
                    <div className="b-top">
                      <span className="b-label">{c.name}</span>
                      <span className="b-value">
                        <span style={{color:'var(--ink-3)',fontWeight:500,fontSize:11.5}}>계약</span> {fmtKRW억(c.total)}
                        <span style={{color:'var(--pos)',marginLeft:12,fontWeight:700}}>이윤 {fmtKRW억(c.profit)}</span>
                      </span>
                    </div>
                    <div style={{position:'relative',height:8,background:'var(--bg-2)',borderRadius:5,overflow:'hidden'}}>
                      <div className={`b-fill ${c.name}`} style={{width: (c.total / Math.max(...cats.map(x=>x.total)) * 100) + '%',height:'100%'}}/>
                      <div style={{position:'absolute',top:0,left:0,height:'100%',width:(c.profit / Math.max(...cats.map(x=>x.total)) * 100) + '%',background:'rgba(47,122,85,.5)',borderRadius:'5px 0 0 5px',mixBlendMode:'multiply'}}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <CardHead title="마진율 비교" sub="이윤 / 계약금 · 부문별"/>
              <div style={{display:'flex',flexDirection:'column',gap:16,marginTop:6}}>
                {[...cats].sort((a,b) => b.marginRate - a.marginRate).map(c => (
                  <div key={c.name}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,marginBottom:6}}>
                      <span style={{fontWeight:600,color:'var(--ink-2)'}}><CatTag cat={c.name}/></span>
                      <span style={{fontWeight:800,color:c.marginRate>=0.15?'var(--pos)':c.marginRate>=0.05?'var(--ink-1)':'var(--danger)',letterSpacing:'-0.02em',fontSize:15}} className="tnum">{fmtPct(c.marginRate)}</span>
                    </div>
                    <div style={{height:8,background:'var(--bg-2)',borderRadius:5,overflow:'hidden',position:'relative'}}>
                      <div style={{width:(c.marginRate/0.4 * 100) + '%',height:'100%',background:`linear-gradient(90deg, ${c.marginRate>=0.15?'var(--pos)':c.marginRate>=0.05?'var(--bronze-500)':'var(--danger)'}, ${c.marginRate>=0.15?'var(--green-800)':c.marginRate>=0.05?'var(--bronze-800)':'#8A2F1E'})`,borderRadius:5}}/>
                      {/* 15% target line */}
                      <div style={{position:'absolute',left:(0.15/0.4*100)+'%',top:-2,width:1.5,height:12,background:'var(--ink-3)'}}/>
                    </div>
                    <div style={{fontSize:11,color:'var(--ink-4)',marginTop:4,display:'flex',justifyContent:'space-between'}}>
                      <span>0%</span><span>목표 15%</span><span>40%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{marginTop:20,padding:'12px 14px',background:'var(--bronze-50)',borderRadius:9,fontSize:12.5,color:'var(--bronze-800)',border:'1px solid #ECD9AE'}}>
                <b>인사이트</b> · 정부지원사업이 가장 높은 마진율({fmtPct(cats.find(c=>c.name==='정부지원사업')?.marginRate||0)})을 기록. 조달납품은 마진율이 낮으므로 계약 조건 재검토 필요.
              </div>
            </div>
          </div>

          {/* 부문별 상세 테이블 */}
          <div className="card">
            <CardHead title="부문별 실적 상세" sub="건수 · 계약금 · 수금 · 미수 · 이윤 · 마진율"/>
            <table className="tbl">
              <thead>
                <tr>
                  <th>사업 부문</th>
                  <th className="right">건수</th>
                  <th className="right">총 계약금액</th>
                  <th className="right">수금액</th>
                  <th className="right">미수 잔금</th>
                  <th className="right">이윤</th>
                  <th className="right">마진율</th>
                  <th className="right">건당 평균</th>
                </tr>
              </thead>
              <tbody>
                {cats.map(c => (
                  <tr key={c.name}>
                    <td><CatTag cat={c.name}/></td>
                    <td className="right num tnum">{c.count}건</td>
                    <td className="right strong"><Amt v={c.total}/></td>
                    <td className="right"><Amt v={c.paid} className="pos"/></td>
                    <td className="right">{c.balance > 0 ? <Amt v={c.balance} className="neg"/> : <span className="amt mute">—</span>}</td>
                    <td className="right"><Amt v={c.profit} className={c.profit>=0?'pos':'neg'}/></td>
                    <td className="right tnum" style={{fontWeight:700,color:c.marginRate>=0.15?'var(--pos)':c.marginRate>=0.05?'var(--ink-1)':'var(--danger)'}}>{fmtPct(c.marginRate)}</td>
                    <td className="right"><Amt v={c.total / c.count}/></td>
                  </tr>
                ))}
                <tr style={{background:'var(--surface-2)',fontWeight:700}}>
                  <td style={{fontWeight:700,color:'var(--ink-1)'}}>합계</td>
                  <td className="right num tnum" style={{fontWeight:700}}>{cats.reduce((s,c)=>s+c.count,0)}건</td>
                  <td className="right strong"><Amt v={cats.reduce((s,c)=>s+c.total,0)}/></td>
                  <td className="right"><Amt v={cats.reduce((s,c)=>s+c.paid,0)} className="pos"/></td>
                  <td className="right"><Amt v={cats.reduce((s,c)=>s+c.balance,0)} className="neg"/></td>
                  <td className="right"><Amt v={cats.reduce((s,c)=>s+c.profit,0)} className="pos"/></td>
                  <td className="right tnum" style={{color:'var(--green-800)',fontWeight:800}}>{fmtPct(data.summary.profit/data.summary.totalAmount)}</td>
                  <td className="right"><Amt v={data.summary.totalAmount / data.contracts.length}/></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'monthly' && (
        <div className="card">
          <CardHead title="월별 실적 추이" sub={`${monthly[0]?.month} ~ ${monthly[monthly.length-1]?.month} · 총 ${monthly.length}개월`}/>

          <div className="chart-legend">
            <span className="lgnd"><span className="dot" style={{background:'var(--green-700)'}}></span>신규 계약금</span>
            <span className="lgnd"><span className="dot" style={{background:'var(--bronze-500)'}}></span>수금액</span>
          </div>

          <svg viewBox="0 0 1000 280" width="100%" height="280" preserveAspectRatio="none" style={{display:'block',overflow:'visible'}}>
            <g stroke="#E4E2D8" strokeWidth="1">
              <line x1="50" y1="30" x2="1000" y2="30"/>
              <line x1="50" y1="90" x2="1000" y2="90"/>
              <line x1="50" y1="150" x2="1000" y2="150"/>
              <line x1="50" y1="210" x2="1000" y2="210"/>
              <line x1="50" y1="250" x2="1000" y2="250" stroke="#CFCCBD"/>
            </g>
            <g fill="#9A9E93" fontSize="10.5" fontFamily="Pretendard Variable" textAnchor="end">
              <text x="44" y="34">{fmtKRW억(maxMonthly)}</text>
              <text x="44" y="94">{fmtKRW억(maxMonthly*0.75)}</text>
              <text x="44" y="154">{fmtKRW억(maxMonthly*0.5)}</text>
              <text x="44" y="214">{fmtKRW억(maxMonthly*0.25)}</text>
              <text x="44" y="254">0</text>
            </g>
            {(() => {
              const w = 950, x0 = 50;
              const step = w / monthly.length;
              const barW = Math.max(10, step * 0.35);
              const yScale = v => 250 - (v / maxMonthly) * 220;
              return (
                <g>
                  {monthly.map((m, i) => {
                    const cx = x0 + step * (i + 0.5);
                    const y1 = yScale(m.total);
                    const y2 = yScale(m.paid);
                    return (
                      <g key={i}>
                        <rect x={cx - barW - 1} y={y1} width={barW} height={250-y1} rx="2" fill="var(--green-700)" opacity="0.85"/>
                        <rect x={cx + 1} y={y2} width={barW} height={250-y2} rx="2" fill="var(--bronze-500)" opacity="0.85"/>
                      </g>
                    );
                  })}
                  {/* x labels */}
                  {monthly.map((m, i) => {
                    const cx = x0 + step * (i + 0.5);
                    const [y, mo] = m.month.split('-');
                    // only label every other if too many
                    if (monthly.length > 15 && i % 2 !== 0) return null;
                    return <text key={i} x={cx} y="268" fill="#6B7069" fontSize="10" fontFamily="Pretendard Variable" textAnchor="middle" fontWeight="500">{y.slice(2)}·{parseInt(mo)}</text>;
                  })}
                </g>
              );
            })()}
          </svg>

          {/* 월별 상세 테이블 */}
          <div style={{marginTop:24,maxHeight:300,overflowY:'auto'}}>
            <table className="tbl">
              <thead style={{position:'sticky',top:0}}>
                <tr>
                  <th style={{width:100}}>월</th>
                  <th className="right">건수</th>
                  <th className="right">계약금액</th>
                  <th className="right">수금액</th>
                  <th className="right">잔금</th>
                  <th className="right">이윤</th>
                </tr>
              </thead>
              <tbody>
                {[...monthly].reverse().map(m => (
                  <tr key={m.month}>
                    <td className="tnum" style={{fontWeight:600}}>{m.month}</td>
                    <td className="right num tnum">{m.count}건</td>
                    <td className="right"><Amt v={m.total}/></td>
                    <td className="right"><Amt v={m.paid} className="pos"/></td>
                    <td className="right">{m.balance > 0 ? <Amt v={m.balance} className="neg"/> : <span className="amt mute">—</span>}</td>
                    <td className="right"><Amt v={m.profit} className={m.profit>=0?'pos':'neg'}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'yearly' && (
        <>
          <div className="kpis" style={{gridTemplateColumns:`repeat(${yearly.length},1fr)`}}>
            {yearly.map(y => (
              <div key={y.year} className={y.year==='2025' ? 'kpi accent' : 'kpi'}>
                <div className="label"><span className="kdot"></span>{y.year}년</div>
                <div className="val tnum">{fmtKRW억(y.total)}<span className="sub">원</span></div>
                <div style={{fontSize:12,color:y.year==='2025'?'#B4C0B8':'var(--ink-3)',marginTop:10}}>
                  {y.count}건 · 이윤 <b style={{color:y.year==='2025'?'#F0DFB6':'var(--pos)'}}>{fmtKRW억(y.profit)}</b>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <CardHead title="연도별 실적 상세"/>
            <table className="tbl">
              <thead>
                <tr>
                  <th>연도</th>
                  <th className="right">계약건수</th>
                  <th className="right">총 계약금액</th>
                  <th className="right">수금액</th>
                  <th className="right">미수 잔금</th>
                  <th className="right">영업 이윤</th>
                  <th className="right">마진율</th>
                  <th className="right">건당 평균</th>
                </tr>
              </thead>
              <tbody>
                {yearly.map(y => (
                  <tr key={y.year}>
                    <td style={{fontWeight:700}}>{y.year}년</td>
                    <td className="right num tnum">{y.count}건</td>
                    <td className="right strong"><Amt v={y.total}/></td>
                    <td className="right"><Amt v={y.paid} className="pos"/></td>
                    <td className="right">{y.balance > 0 ? <Amt v={y.balance} className="neg"/> : <span className="amt mute">—</span>}</td>
                    <td className="right"><Amt v={y.profit} className={y.profit>=0?'pos':'neg'}/></td>
                    <td className="right tnum" style={{fontWeight:700,color:y.marginRate>=0.15?'var(--pos)':y.marginRate>=0.05?'var(--ink-1)':'var(--danger)'}}>{fmtPct(y.marginRate)}</td>
                    <td className="right"><Amt v={y.total/y.count}/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

window.ScreenReports = ScreenReports;
