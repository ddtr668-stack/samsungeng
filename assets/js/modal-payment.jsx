/* ═══════════════════════════════════════════════════════════════
   수금 누적 관리 모달
   - 회차별 수금 등록/수정/삭제
   - 계약관리 시트의 paidAmount 는 이 회차 합계로 자동 갱신
   - 총 계약금 대비 % 시각화
═══════════════════════════════════════════════════════════════ */

const PAYMENT_METHODS = ['계좌이체 (KB)', '계좌이체 (신한)', '계좌이체 (기타)', '현금', '어음', '세금계산서', '기타'];

const fmtWon = (v) => {
  const n = Number(v) || 0;
  return n.toLocaleString('ko-KR');
};

const PaymentModal = ({ open, contract, onClose, onSaved }) => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // 신규 등록 폼
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNo, setEditingNo] = useState(null); // 편집 중인 수금 no
  const [form, setForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    amount: '',
    method: PAYMENT_METHODS[0],
    note: '',
  });

  const toast = window.useToast ? window.useToast() : null;
  const confirmDialog = window.useConfirm ? window.useConfirm() : null;

  // 목록 조회
  const loadPayments = useCallback(async () => {
    if (!contract?.no) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.listPayments(contract.no);
      setPayments(r.payments || []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [contract?.no]);

  useEffect(() => {
    if (open) loadPayments();
    else {
      setShowAddForm(false);
      setEditingNo(null);
    }
  }, [open, loadPayments]);

  // 총액 계산
  const total = contract?.totalAmount || 0;
  const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const paidPct = total > 0 ? (paidTotal / total * 100) : 0;
  const balance = total - paidTotal;
  const remainingHint = balance > 0 ? balance : 0;

  if (!open) return null;

  const openAddForm = () => {
    setForm({
      paymentDate: new Date().toISOString().slice(0, 10),
      amount: remainingHint > 0 ? String(remainingHint) : '',
      method: PAYMENT_METHODS[0],
      note: '',
    });
    setEditingNo(null);
    setShowAddForm(true);
  };

  const openEditForm = (p) => {
    setForm({
      paymentDate: p.paymentDate || new Date().toISOString().slice(0, 10),
      amount: String(p.amount || ''),
      method: p.method || PAYMENT_METHODS[0],
      note: p.note || '',
    });
    setEditingNo(p.no);
    setShowAddForm(true);
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingNo(null);
  };

  const savePayment = async () => {
    const amount = Number(String(form.amount).replace(/[,\s원]/g, ''));
    if (!amount || amount <= 0) {
      toast?.('수금액을 정확히 입력하세요', 'error');
      return;
    }
    if (!form.paymentDate) {
      toast?.('수금일을 입력하세요', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingNo) {
        await apiClient.updatePayment({
          no: editingNo,
          paymentDate: form.paymentDate,
          amount,
          method: form.method,
          note: form.note,
        });
        toast?.('수금 회차 수정 완료', 'success');
      } else {
        await apiClient.createPayment({
          contractNo: contract.no,
          paymentDate: form.paymentDate,
          amount,
          method: form.method,
          note: form.note,
        });
        toast?.('수금 회차 등록 완료', 'success');
      }
      setShowAddForm(false);
      setEditingNo(null);
      await loadPayments();
      onSaved?.();
    } catch (e) {
      toast?.('저장 실패: ' + (e.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deletePayment = async (p) => {
    const ok = confirmDialog
      ? await confirmDialog({
          title: `${p.roundNo}차 수금 삭제`,
          message: `${p.paymentDate} · ${fmtWon(p.amount)}원\n삭제하면 되돌릴 수 없습니다.`,
          confirmText: '삭제',
          danger: true,
        })
      : window.confirm(`${p.roundNo}차 수금 (${fmtWon(p.amount)}원) 을 삭제할까요?`);
    if (!ok) return;
    setSaving(true);
    try {
      await apiClient.deletePayment(p.no);
      toast?.('삭제 완료', 'success');
      await loadPayments();
      onSaved?.();
    } catch (e) {
      toast?.('삭제 실패: ' + (e.message || e), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 스타일
  const inputSt = {
    width: '100%', padding: '8px 10px', fontSize: 12.5,
    border: '1px solid var(--line)', borderRadius: 6,
    background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelSt = {
    display: 'block', fontSize: 11, color: 'var(--ink-3)',
    fontWeight: 700, letterSpacing: '0.03em', marginBottom: 3,
  };

  // 누적 % 계산
  let cumPaid = 0;

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 780 }}>
        {/* 헤드 */}
        <div className="modal-head">
          <div>
            <div className="modal-title" style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{
                display:'inline-flex',alignItems:'center',justifyContent:'center',
                width:26,height:26,borderRadius:6,background:'var(--pos-soft)',
                border:'1px solid #B5DFC6',color:'var(--pos)',fontSize:14,fontWeight:800,
              }}>＄</span>
              수금 누적 관리
            </div>
            <div className="modal-sub">
              계약 #{String(contract?.no || '').padStart(4,'0')} · {contract?.client || ''} · {contract?.projectName || ''}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            <Icon name="x" size={16}/>
          </button>
        </div>

        {/* 바디 */}
        <div className="modal-body" style={{ padding: '18px 22px', maxHeight: '75vh', overflowY: 'auto' }}>
          {/* 총액 요약 카드 */}
          <div style={{
            padding: '14px 16px', marginBottom: 14,
            background: 'linear-gradient(180deg, var(--pos-soft), var(--green-25, #F7FAF7))',
            border: '1px solid #B5DFC6', borderRadius: 10,
          }}>
            <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, fontSize:12.5, marginBottom:10}}>
              <div>
                <div style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>총 계약금</div>
                <div style={{fontSize:15, fontWeight:800, color:'var(--ink-1)', fontVariantNumeric:'tabular-nums'}}>{fmtWon(total)}<span style={{fontSize:11, color:'var(--ink-3)', fontWeight:500, marginLeft:2}}>원</span></div>
              </div>
              <div>
                <div style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>누계 수금 ({payments.length}회)</div>
                <div style={{fontSize:15, fontWeight:800, color:'var(--pos)', fontVariantNumeric:'tabular-nums'}}>{fmtWon(paidTotal)}<span style={{fontSize:11, color:'var(--pos)', fontWeight:500, marginLeft:2}}>원 · {paidPct.toFixed(1)}%</span></div>
              </div>
              <div>
                <div style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.05em', marginBottom:2}}>미수 잔금</div>
                <div style={{fontSize:15, fontWeight:800, color: balance > 0 ? 'var(--warn)' : 'var(--pos)', fontVariantNumeric:'tabular-nums'}}>
                  {balance > 0 ? fmtWon(balance) : '0'}
                  <span style={{fontSize:11, fontWeight:500, marginLeft:2, color: balance > 0 ? 'var(--warn)' : 'var(--pos)'}}>
                    {balance > 0 ? `원 · ${(100 - paidPct).toFixed(1)}%` : '원 · 완납'}
                  </span>
                </div>
              </div>
            </div>

            {/* 진행바 */}
            <div style={{
              height: 10, background: '#fff', border: '1px solid #B5DFC6',
              borderRadius: 20, overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                width: Math.min(paidPct, 100) + '%',
                background: 'linear-gradient(90deg, var(--green-600, #3F7A5C), var(--pos))',
                transition: 'width .3s',
              }}/>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', marginTop:5, fontSize:10, color:'var(--ink-3)', fontVariantNumeric:'tabular-nums'}}>
              <span>0%</span>
              <span style={{color:'var(--ink-2)', fontWeight:700}}>{paidPct.toFixed(1)}%</span>
              <span>100% ({fmtWon(total)}원)</span>
            </div>
          </div>

          {/* 액션 바 */}
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div style={{fontSize:12, fontWeight:700, color:'var(--ink-2)'}}>
              📋 수금 회차 목록
              {loading && <span style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:500, marginLeft:6}}>불러오는 중…</span>}
            </div>
            {!showAddForm && (
              <button
                onClick={openAddForm}
                style={{
                  padding:'7px 14px', fontSize:12, fontWeight:700,
                  background:'var(--pos)', color:'#fff', border:0, borderRadius:6,
                  cursor:'pointer', display:'inline-flex', alignItems:'center', gap:5,
                }}>
                <span style={{fontSize:14, lineHeight:1}}>+</span> 수금 추가
              </button>
            )}
          </div>

          {/* 에러 */}
          {error && (
            <div style={{
              padding:'10px 12px', marginBottom:10,
              background:'#FCE9E4', border:'1px solid #F0BFB4',
              borderRadius:6, fontSize:11.5, color:'#7A2A1E',
            }}>
              <b>불러오기 실패</b> · {error}
              <button
                onClick={loadPayments}
                style={{marginLeft:8, padding:'2px 8px', fontSize:10, background:'#fff', border:'1px solid #F0BFB4', borderRadius:4, cursor:'pointer'}}>
                재시도
              </button>
            </div>
          )}

          {/* 회차 목록 */}
          {payments.length > 0 && (
            <div style={{border:'1px solid var(--line)', borderRadius:8, overflow:'hidden', marginBottom: showAddForm ? 14 : 0}}>
              <div style={{
                display:'grid',
                gridTemplateColumns:'40px 100px 1fr 1fr 60px 70px 60px',
                gap:0, background:'var(--surface-2)',
                fontSize:10.5, fontWeight:700, color:'var(--ink-3)',
                letterSpacing:'0.03em', padding:'7px 10px',
                borderBottom:'1px solid var(--line)',
              }}>
                <span>#</span>
                <span>수금일</span>
                <span style={{textAlign:'right'}}>수금액</span>
                <span>수단 · 비고</span>
                <span style={{textAlign:'right'}}>수금 %</span>
                <span style={{textAlign:'right'}}>누적 %</span>
                <span></span>
              </div>
              {payments.map((p, idx) => {
                const pct = total > 0 ? (p.amount / total * 100) : 0;
                cumPaid += Number(p.amount) || 0;
                const cumPct = total > 0 ? (cumPaid / total * 100) : 0;
                return (
                  <div key={p.no} style={{
                    display:'grid',
                    gridTemplateColumns:'40px 100px 1fr 1fr 60px 70px 60px',
                    gap:0, padding:'10px 10px',
                    fontSize:12, alignItems:'center',
                    borderBottom: idx < payments.length - 1 ? '1px solid var(--line)' : 0,
                    background:'#fff',
                  }}>
                    <span style={{fontWeight:700, color:'var(--pos)'}}>{p.roundNo}</span>
                    <span style={{fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5}}>{p.paymentDate || '-'}</span>
                    <span style={{textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums'}}>{fmtWon(p.amount)}원</span>
                    <div style={{fontSize:11}}>
                      <div style={{color:'var(--ink-2)', fontWeight:600}}>{p.method || '-'}</div>
                      {p.note && <div style={{color:'var(--ink-3)', fontSize:10.5, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={p.note}>{p.note}</div>}
                    </div>
                    <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--ink-3)', fontSize:11}}>{pct.toFixed(1)}%</span>
                    <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700, color:'var(--ink-2)', fontSize:11}}>{cumPct.toFixed(1)}%</span>
                    <div style={{display:'flex', gap:3, justifyContent:'flex-end'}}>
                      <button
                        onClick={() => openEditForm(p)}
                        title="수정"
                        disabled={saving}
                        style={{width:22, height:22, padding:0, border:'1px solid var(--line)', background:'#fff', borderRadius:4, cursor:'pointer', color:'var(--ink-3)', fontSize:11}}>
                        ✏️
                      </button>
                      <button
                        onClick={() => deletePayment(p)}
                        title="삭제"
                        disabled={saving}
                        style={{width:22, height:22, padding:0, border:'1px solid var(--line)', background:'#fff', borderRadius:4, cursor:'pointer', color:'var(--danger)', fontSize:12}}>
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 빈 상태 */}
          {!loading && payments.length === 0 && !error && !showAddForm && (
            <div style={{
              padding:'32px 14px', textAlign:'center',
              background:'var(--surface-2)', border:'1.5px dashed var(--line-2)',
              borderRadius:8, color:'var(--ink-3)',
            }}>
              <div style={{fontSize:32, marginBottom:8, opacity:0.6}}>💰</div>
              <div style={{fontSize:13, fontWeight:600, marginBottom:4, color:'var(--ink-2)'}}>등록된 수금 이력이 없습니다</div>
              <div style={{fontSize:11.5}}>우측 상단 <b>+ 수금 추가</b> 버튼을 눌러 첫 수금을 등록하세요.</div>
            </div>
          )}

          {/* 등록/수정 폼 */}
          {showAddForm && (
            <div style={{
              padding:'14px 16px',
              background:'#fff', border:'1.5px dashed var(--pos)',
              borderRadius:10,
            }}>
              <div style={{fontSize:12.5, fontWeight:700, color:'var(--pos)', marginBottom:10, display:'flex', alignItems:'center', gap:6}}>
                <span style={{
                  width:20, height:20, background:'var(--pos)', color:'#fff', borderRadius:'50%',
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                  fontSize:12, fontWeight:800,
                }}>{editingNo ? '✏️' : '+'}</span>
                {editingNo ? '수금 회차 수정' : `${payments.length + 1}차 수금 등록`}
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10}}>
                <div>
                  <label style={labelSt}>수금일 *</label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={e => setForm({...form, paymentDate: e.target.value})}
                    style={{...inputSt, fontFamily:'ui-monospace,Menlo,monospace'}}
                  />
                </div>
                <div>
                  <label style={labelSt}>수금액 (원) *</label>
                  <input
                    type="text"
                    value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value.replace(/[^\d,]/g, '')})}
                    placeholder="예: 3,520,000"
                    style={{...inputSt, textAlign:'right', fontWeight:700, color:'var(--pos)'}}
                  />
                  {!editingNo && remainingHint > 0 && (
                    <div style={{fontSize:10, color:'var(--ink-3)', marginTop:3, cursor:'pointer'}}
                         onClick={() => setForm({...form, amount: String(remainingHint)})}
                         title="잔금 자동 채움">
                      💡 잔금 <b style={{color:'var(--warn)'}}>{fmtWon(remainingHint)}원</b> 자동 채움 (클릭)
                    </div>
                  )}
                </div>
                <div>
                  <label style={labelSt}>결제 수단</label>
                  <select
                    value={form.method}
                    onChange={e => setForm({...form, method: e.target.value})}
                    style={{...inputSt}}>
                    {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              <div style={{marginBottom:10}}>
                <label style={labelSt}>비고</label>
                <input
                  type="text"
                  value={form.note}
                  onChange={e => setForm({...form, note: e.target.value})}
                  placeholder="예: 계약금 30%, 세금계산서 발행 완료"
                  style={inputSt}
                />
              </div>

              <div style={{display:'flex', justifyContent:'flex-end', gap:6}}>
                <button
                  onClick={cancelForm}
                  disabled={saving}
                  style={{padding:'6px 14px', fontSize:11.5, background:'#fff', color:'var(--ink-3)', border:'1px solid var(--line)', borderRadius:5, cursor:'pointer'}}>
                  취소
                </button>
                <button
                  onClick={savePayment}
                  disabled={saving}
                  style={{padding:'6px 16px', fontSize:11.5, fontWeight:700, background:'var(--pos)', color:'#fff', border:0, borderRadius:5, cursor: saving ? 'wait' : 'pointer'}}>
                  {saving ? '저장 중…' : (editingNo ? '💾 수정 저장' : '💾 수금 등록')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="modal-foot" style={{justifyContent:'space-between', padding:'12px 22px'}}>
          <div style={{fontSize:11, color:'var(--ink-3)'}}>
            💡 계약관리 시트의 <code style={{background:'var(--surface-2)', padding:'1px 5px', borderRadius:3, fontSize:11, fontFamily:'ui-monospace,Menlo,monospace'}}>paidAmount</code> 는 이 회차들의 합계로 자동 갱신됩니다.
          </div>
          <button
            onClick={onClose}
            style={{padding:'8px 20px', fontSize:12.5, fontWeight:700, background:'var(--ink-1)', color:'#fff', border:0, borderRadius:6, cursor:'pointer'}}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};

window.PaymentModal = PaymentModal;
