/* ═══════════════════════════════════════════════════════════════
   화면 3 · 계약 상세 페이지
═══════════════════════════════════════════════════════════════ */

const ScreenDetail = ({ data, contractNo, onBack, onOpenExpense, onUpdated }) => {
  // contractNo는 실제로는 계약의 고유 id (중복 no 대응)
  const baseContract = data.contracts.find(x => (x.id ?? x.no) === contractNo);
  const toast = window.useToast ? window.useToast() : null;

  // 로컬 체크박스 오버라이드 (즉시 반응용)
  const [localChecks, setLocalChecks] = useState(null);
  const [saving, setSaving] = useState(false);

  // 계약 바뀌면 로컬 상태 리셋
  useEffect(() => { setLocalChecks(null); }, [contractNo]);

  if (!baseContract) return (
    <>
      <button className="back-btn" onClick={onBack}><Icon name="chevronLeft" size={14}/>계약 리스트로</button>
      <div className="card"><div className="empty">계약을 찾을 수 없습니다.</div></div>
    </>
  );

  const CHECK_KEYS = ['배관','실내기','실외기','시운전','인수인계'];
  const checks = localChecks || baseContract.checks;
  const doneCount = CHECK_KEYS.filter(k => checks[k]).length;
  const localProgress = doneCount / CHECK_KEYS.length;

  const c = { ...baseContract, checks, progress: localProgress };
  const paidPct = c.totalAmount > 0 ? c.paidAmount / c.totalAmount : 0;

  // 체크박스 토글: 즉시 반영 + API 있으면 백그라운드 저장
  const toggleCheck = async (key) => {
    const newChecks = { ...checks, [key]: !checks[key] };
    setLocalChecks(newChecks);

    if (typeof hasApiUrl === 'function' && hasApiUrl()) {
      setSaving(true);
      try {
        await apiClient.updateContract(baseContract.no, { ['chk' + key]: newChecks[key] });
        toast?.(`${key} · ${newChecks[key] ? '완료' : '해제'}`, 'success');
        onUpdated?.();
      } catch (e) {
        toast?.('저장 실패: ' + e.message, 'error');
      } finally {
        setSaving(false);
      }
    } else {
      toast?.('로컬에서만 변경됨 (API 미연결)', 'default');
    }
  };

  // 해당 거래처의 다른 계약
  const otherByClient = data.contracts.filter(x => x.client === c.client && (x.id ?? x.no) !== (c.id ?? c.no)).slice(0, 4);

  return (
    <>
      <button className="back-btn" onClick={onBack}><Icon name="chevronLeft" size={14}/>계약 리스트로</button>

      <div className="detail-head">
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <span style={{fontSize:12,color:'var(--ink-3)',fontWeight:600,letterSpacing:'0.05em'}}>계약 #{String(c.no).padStart(4,'0')}</span>
            <CatTag cat={c.category}/>
            <StatusPill status={c.status}/>
          </div>
          <h1>{c.projectName || '(프로젝트명 없음)'}</h1>
          <div className="meta">
            <span>거래처 · <b>{c.client}</b></span>
            <span>계약일 · <b>{fmtDate(c.contractDate)}</b></span>
            {c.subcontractor && <span>도급 · <b>{c.subcontractor}</b></span>}
          </div>
        </div>
        <div className="actions">
          <button className="btn-ghost"><Icon name="print" size={14}/>출력</button>
          <button className="btn-ghost"><Icon name="edit" size={14}/>수정</button>
          {c.subcontractor && (
            <button className="btn-primary" onClick={() => onOpenExpense && onOpenExpense(c)}>
              <Icon name="file" size={14}/>지출품의서 생성
            </button>
          )}
        </div>
      </div>

      {/* KPI mini */}
      <div className="kpis" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        <div className="kpi tight">
          <div className="label"><span className="kdot"></span>총 계약금</div>
          <div className="val tnum" style={{fontSize:24}}>{fmtKRW(c.totalAmount)}<span className="unit">원</span></div>
          <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:8}}>부가세 별도 기준</div>
        </div>
        <div className="kpi tight">
          <div className="label"><span className="kdot" style={{background:'var(--pos)'}}></span>수금액</div>
          <div className="val tnum" style={{fontSize:24,color:'var(--pos)'}}>{fmtKRW(c.paidAmount)}<span className="unit" style={{color:'var(--pos)'}}>원</span></div>
          <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:8}}>수금률 <b style={{color:'var(--ink-1)'}}>{fmtPct(paidPct)}</b></div>
        </div>
        <div className="kpi tight">
          <div className="label"><span className="kdot" style={{background:'var(--bronze-500)'}}></span>미수 잔금</div>
          <div className="val tnum" style={{fontSize:24,color:c.balance>0?'var(--danger)':'var(--ink-3)'}}>{fmtKRW(c.balance)}<span className="unit" style={{color:c.balance>0?'var(--danger)':'var(--ink-3)'}}>원</span></div>
          <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:8}}>{c.balance > 0 ? '수금 필요' : '완결'}</div>
        </div>
        <div className="kpi tight">
          <div className="label"><span className="kdot" style={{background:'var(--green-700)'}}></span>영업 이윤</div>
          <div className="val tnum" style={{fontSize:24}}>{fmtKRW(c.profit)}<span className="unit">원</span></div>
          <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:8}}>마진율 <b style={{color:c.marginRate>=0.15?'var(--pos)':'var(--ink-1)'}}>{fmtPct(c.marginRate)}</b></div>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'var(--ink-1)',letterSpacing:'-0.02em',display:'flex',alignItems:'center',gap:8}}>
              공사 진행률
              {saving && <span style={{fontSize:11,fontWeight:500,color:'var(--ink-3)'}}>· 저장 중…</span>}
            </div>
            <div style={{fontSize:12,color:'var(--ink-3)',marginTop:2}}>
              단계를 클릭해서 완료 상태를 토글하세요 · <b style={{color:'var(--ink-2)'}}>{doneCount}/5 단계</b> 완료
            </div>
          </div>
          <div style={{fontSize:28,fontWeight:800,color:'var(--green-800)',letterSpacing:'-0.03em'}} className="tnum">
            {Math.round(c.progress * 100)}<span style={{fontSize:14,color:'var(--ink-3)',marginLeft:2}}>%</span>
          </div>
        </div>
        <div className="pbar"><div className="pfill" style={{width: (c.progress * 100) + '%', transition:'width .25s ease-out'}}/></div>

        <div className="checks">
          {CHECK_KEYS.map(k => {
            const done = c.checks[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleCheck(k)}
                disabled={saving}
                className={`check ${done ? 'done' : ''}`}
                style={{
                  border:'1px solid ' + (done ? '#C9DFD1' : 'var(--line)'),
                  background: done ? 'var(--pos-soft)' : 'var(--surface-2)',
                  cursor: saving ? 'wait' : 'pointer',
                  fontFamily:'inherit',
                  transition:'all .15s',
                  outline:'none',
                }}
                onMouseEnter={e => { if (!saving) e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 3px 8px rgba(20,25,20,.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <div className="cbox">{done ? <Icon name="check" size={16} stroke={2.6}/> : ''}</div>
                <div className="clabel">{k}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 재무 정보 + 도급 + 사이드 */}
      <div className="detail-grid">
        <div className="card pad-lg">
          <CardHead title="계약 세부 정보" sub="계약금 · 입금 · 세금계산서"/>
          <div className="field-grid">
            <div className="field">
              <div className="label">계약월</div>
              <div className="value mono">{fmtDate(c.contractDate)}</div>
            </div>
            <div className="field">
              <div className="label">사업 부문</div>
              <div className="value"><CatTag cat={c.category}/></div>
            </div>
            <div className="field">
              <div className="label">거래처</div>
              <div className="value">{c.client}</div>
            </div>
            <div className="field">
              <div className="label">계약번호</div>
              <div className="value mono">#{String(c.no).padStart(4,'0')}</div>
            </div>

            <div className="field" style={{gridColumn:'span 2',borderTop:'1px solid var(--line)',paddingTop:16,marginTop:4}}>
              <div className="label" style={{marginBottom:8}}>금액 구성</div>
              <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'14px 16px'}}>
                <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
                  <span style={{color:'var(--ink-3)'}}>총 계약금</span>
                  <b className="tnum" style={{fontSize:14}}>{fmtKRW(c.totalAmount)}원</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:'var(--pos)'}}>
                  <span>├ 입금액</span>
                  <b className="tnum">+ {fmtKRW(c.paidAmount)}원</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:c.balance>0?'var(--danger)':'var(--ink-3)'}}>
                  <span>└ 미수 잔금</span>
                  <b className="tnum">{c.balance > 0 ? `− ${fmtKRW(c.balance)}원` : '완결'}</b>
                </div>
                <div style={{borderTop:'1px dashed var(--line-2)',marginTop:6,paddingTop:8,display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--ink-3)'}}>
                  <span>세금계산서 발행 완료</span>
                  <b className="tnum" style={{color:'var(--ink-1)'}}>{fmtKRW(c.taxInvoiceIssued)}원</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--warn)',marginTop:2}}>
                  <span>세금계산서 미발행</span>
                  <b className="tnum">{fmtKRW(c.taxInvoicePending)}원</b>
                </div>
              </div>
            </div>

            <div className="field" style={{gridColumn:'span 2',borderTop:'1px solid var(--line)',paddingTop:16,marginTop:4}}>
              <div className="label" style={{marginBottom:8}}>도급 및 원가</div>
              {c.subcontractor ? (
                <div style={{background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,padding:'14px 16px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
                    <span style={{color:'var(--ink-3)'}}>도급업체</span>
                    <b style={{fontSize:13,color:'var(--ink-1)'}}>{c.subcontractor}</b>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13}}>
                    <span style={{color:'var(--ink-3)'}}>도급금액</span>
                    <b className="tnum">{fmtKRW(c.subcontractAmount)}원</b>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:'var(--pos)'}}>
                    <span>├ 기성 완료</span>
                    <b className="tnum">+ {fmtKRW(c.subcontractPaid)}원</b>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',padding:'6px 0',fontSize:13,color:c.subcontractBalance>0?'var(--warn)':'var(--ink-3)'}}>
                    <span>└ 기성 잔액</span>
                    <b className="tnum">{c.subcontractBalance > 0 ? `− ${fmtKRW(c.subcontractBalance)}원` : '완결'}</b>
                  </div>
                </div>
              ) : (
                <div style={{padding:'14px 16px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,color:'var(--ink-3)',fontSize:13}}>도급업체 없음 (직시공)</div>
              )}
              {c.productCost > 0 && (
                <div style={{marginTop:10,display:'flex',justifyContent:'space-between',fontSize:13,padding:'8px 4px'}}>
                  <span style={{color:'var(--ink-3)'}}>제품대</span>
                  <b className="tnum" style={{color:'var(--ink-1)'}}>{fmtKRW(c.productCost)}원</b>
                </div>
              )}
              {c.productCostNote && !c.productCost && (
                <div style={{marginTop:10,fontSize:12.5,color:'var(--ink-3)',padding:'8px 4px'}}>
                  제품대: {c.productCostNote}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="vstack">
          {/* 진행 타임라인 */}
          <div className="card">
            <CardHead title="진행 타임라인" sub="공정 단계별 이력"/>
            <div className="timeline">
              <div className={`tl-item ${c.progress > 0 ? 'done' : ''}`}>
                <div className="tl-date">{fmtDate(c.contractDate)}</div>
                <div className="tl-title">계약 체결</div>
                <div className="tl-desc">{c.category} · {fmtKRW억(c.totalAmount)}</div>
              </div>
              <div className={`tl-item ${c.checks.배관 ? 'done' : c.progress > 0 ? 'now' : ''}`}>
                <div className="tl-date">착공</div>
                <div className="tl-title">배관 · 실내기 · 실외기</div>
                <div className="tl-desc">{Object.entries(c.checks).slice(0,3).filter(([k,v])=>v).map(([k])=>k).join(' · ') || '진행 전'}</div>
              </div>
              <div className={`tl-item ${c.checks.시운전 ? 'done' : c.checks.실외기 ? 'now' : ''}`}>
                <div className="tl-date">시운전</div>
                <div className="tl-title">시운전 및 검수</div>
                <div className="tl-desc">{c.checks.시운전 ? '검수 완료' : '대기'}</div>
              </div>
              <div className={`tl-item ${c.checks.인수인계 ? 'done' : c.checks.시운전 ? 'now' : ''}`}>
                <div className="tl-date">준공</div>
                <div className="tl-title">인수인계</div>
                <div className="tl-desc">{c.checks.인수인계 ? '고객 인수인계 완료' : '완료 전'}</div>
              </div>
              <div className={`tl-item ${c.balance === 0 ? 'done' : c.paidAmount > 0 ? 'now' : ''}`}>
                <div className="tl-date">정산</div>
                <div className="tl-title">잔금 수금</div>
                <div className="tl-desc">
                  {c.balance === 0
                    ? '정산 완료 · 계약 종료'
                    : `잔금 ${fmtKRW억(c.balance)} 수금 필요`}
                </div>
              </div>
            </div>
          </div>

          {/* 같은 거래처 계약 */}
          {otherByClient.length > 0 && (
            <div className="card">
              <CardHead title={`${c.client}의 다른 계약`} sub={`총 ${otherByClient.length + 1}건 진행 이력`}/>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {otherByClient.map(o => (
                  <div key={o.id ?? o.no} style={{padding:'10px 12px',border:'1px solid var(--line)',borderRadius:9,fontSize:12.5}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <span style={{fontSize:11,color:'var(--ink-4)',fontWeight:600}}>#{o.no}</span>
                      <CatTag cat={o.category}/>
                      <StatusPill status={o.status}/>
                    </div>
                    <div style={{fontWeight:600,color:'var(--ink-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:'-0.01em'}}>{o.projectName}</div>
                    <div style={{display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11.5,color:'var(--ink-3)'}}>
                      <span>{fmtDate(o.contractDate)}</span>
                      <b className="tnum" style={{color:'var(--ink-2)'}}>{fmtKRW억(o.totalAmount)}</b>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {c.note && (
            <div className="card">
              <CardHead title="비고 · 메모"/>
              <div style={{fontSize:13,color:'var(--ink-2)',lineHeight:1.6,padding:'10px 14px',background:'var(--surface-2)',borderRadius:9,border:'1px solid var(--line)'}}>{c.note}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

window.ScreenDetail = ScreenDetail;
