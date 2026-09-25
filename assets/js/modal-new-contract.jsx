/* ═══════════════════════════════════════════════════════════════
   신규 계약 등록 모달
═══════════════════════════════════════════════════════════════ */

const NewContractModal = ({ open, onClose, onCreated, data }) => {
  const [form, setForm] = useState({
    contractDate: new Date().toISOString().substring(0,10),
    category: '민수',
    client: '',
    projectName: '',
    totalAmount: '',
    paidAmount: '0',
    productCost: '',
    subcontractor: '',
    subcontractAmount: '',
    incidental: '0',
    salesCost: '0',
    status: '미진행',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      setForm(f => ({
        ...f,
        contractDate: new Date().toISOString().substring(0,10),
        client:'', projectName:'', totalAmount:'', productCost:'', subcontractor:'', subcontractAmount:'', note:''
      }));
    }
  }, [open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const total = Number(form.totalAmount) || 0;
  const product = Number(form.productCost) || 0;
  const subA = Number(form.subcontractAmount) || 0;
  const inc = Number(form.incidental) || 0;
  const sales = Number(form.salesCost) || 0;
  const profit = total - product - subA - inc - sales;
  const margin = total > 0 ? profit / total : 0;

  const clientOptions = useMemo(() => {
    if (!data?.clientStats) return [];
    return data.clientStats.map(c => c.name);
  }, [data]);

  const handleSubmit = async () => {
    if (!form.client || !form.projectName || !form.totalAmount) {
      toast?.('거래처, 프로젝트명, 총계약금은 필수입니다', 'error');
      return;
    }
    if (!hasApiUrl()) {
      toast?.('API URL이 설정되지 않았습니다. 설정 화면에서 등록해주세요.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.createContract({
        ...form,
        totalAmount: Number(form.totalAmount) || 0,
        paidAmount: Number(form.paidAmount) || 0,
        productCost: Number(form.productCost) || 0,
        subcontractAmount: Number(form.subcontractAmount) || 0,
        incidental: Number(form.incidental) || 0,
        salesCost: Number(form.salesCost) || 0,
      });
      toast?.(`계약 ${contractCode(res.contract)} 등록 완료`, 'success');
      onCreated?.(res.contract);
      onClose();
    } catch (e) {
      toast?.('등록 실패: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="신규 계약 등록"
      subtitle="구글 스프레드시트에 새 계약 행이 추가됩니다"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={saving}>취소</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? '등록 중…' : (<><Icon name="check" size={14} stroke={2.4}/>등록하기</>)}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-field">
          <label>계약일</label>
          <input type="date" value={form.contractDate} onChange={e => set('contractDate', e.target.value)}/>
        </div>

        <div className="form-field">
          <label>사업 부문</label>
          <div className="form-seg">
            {['민수','조달공사','정부지원사업','조달납품'].map(c => (
              <button key={c} type="button" className={form.category === c ? 'on' : ''} onClick={() => set('category', c)}>{c}</button>
            ))}
          </div>
        </div>

        <div className="form-field">
          <label>거래처 *</label>
          <input
            list="client-list"
            value={form.client}
            onChange={e => set('client', e.target.value)}
            placeholder="거래처명 입력 또는 선택"
          />
          <datalist id="client-list">
            {clientOptions.map(c => <option key={c} value={c}/>)}
          </datalist>
        </div>

        <div className="form-field">
          <label>진행 상태</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="미진행">미진행</option>
            <option value="진행중">진행중</option>
            <option value="완료">완료</option>
          </select>
        </div>

        <div className="form-field full">
          <label>프로젝트명 *</label>
          <input value={form.projectName} onChange={e => set('projectName', e.target.value)} placeholder="예: [탄소바우처]대진이엔지 냉난방기 공사"/>
        </div>

        <div className="form-field">
          <label>총 계약금 *</label>
          <input className="tnum" type="number" value={form.totalAmount} onChange={e => set('totalAmount', e.target.value)} placeholder="0"/>
        </div>
        <div className="form-field">
          <label>입금액</label>
          <input className="tnum" type="number" value={form.paidAmount} onChange={e => set('paidAmount', e.target.value)}/>
        </div>

        <div className="form-field">
          <label>제품대 (장비대)</label>
          <input className="tnum" type="number" value={form.productCost} onChange={e => set('productCost', e.target.value)}/>
        </div>
        <div className="form-field">
          <label>도급업체</label>
          <input value={form.subcontractor} onChange={e => set('subcontractor', e.target.value)} placeholder="예: 금하공조"/>
        </div>

        <div className="form-field">
          <label>도급금액</label>
          <input className="tnum" type="number" value={form.subcontractAmount} onChange={e => set('subcontractAmount', e.target.value)}/>
        </div>
        <div className="form-field">
          <label>부대비용</label>
          <input className="tnum" type="number" value={form.incidental} onChange={e => set('incidental', e.target.value)}/>
        </div>

        <div className="form-field full">
          <label>영업비</label>
          <input className="tnum" type="number" value={form.salesCost} onChange={e => set('salesCost', e.target.value)}/>
        </div>

        <div className="form-field full">
          <label>비고 · 메모</label>
          <textarea rows="2" value={form.note} onChange={e => set('note', e.target.value)}/>
        </div>

        {/* 실시간 손익 계산 */}
        <div className="full" style={{padding:'16px 18px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12,marginTop:6}}>
          <div style={{fontSize:11.5,fontWeight:700,color:'var(--ink-3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:12}}>실시간 손익 미리보기</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16}}>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)'}}>총 계약금</div>
              <div className="tnum" style={{fontSize:16,fontWeight:800,color:'var(--ink-1)',marginTop:3,letterSpacing:'-0.02em'}}>{total.toLocaleString()}<span style={{fontSize:11,fontWeight:500,color:'var(--ink-3)',marginLeft:2}}>원</span></div>
            </div>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)'}}>원가 합계</div>
              <div className="tnum" style={{fontSize:16,fontWeight:800,color:'var(--danger)',marginTop:3,letterSpacing:'-0.02em'}}>{(product+subA+inc+sales).toLocaleString()}<span style={{fontSize:11,fontWeight:500,color:'var(--ink-3)',marginLeft:2}}>원</span></div>
            </div>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)'}}>예상 이윤</div>
              <div className="tnum" style={{fontSize:16,fontWeight:800,color:profit>=0?'var(--pos)':'var(--danger)',marginTop:3,letterSpacing:'-0.02em'}}>{profit.toLocaleString()}<span style={{fontSize:11,fontWeight:500,color:'var(--ink-3)',marginLeft:2}}>원</span></div>
            </div>
            <div>
              <div style={{fontSize:11.5,color:'var(--ink-3)'}}>마진율</div>
              <div className="tnum" style={{fontSize:16,fontWeight:800,color:margin>=0.15?'var(--pos)':margin>=0.05?'var(--ink-1)':'var(--danger)',marginTop:3,letterSpacing:'-0.02em'}}>{(margin*100).toFixed(1)}<span style={{fontSize:11,fontWeight:500,color:'var(--ink-3)',marginLeft:2}}>%</span></div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

window.NewContractModal = NewContractModal;
