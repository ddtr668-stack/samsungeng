/* ═══════════════════════════════════════════════════════════════
   지출품의서 생성 모달
   - 프론트에서 항목 입력 → GAS의 generateExpenseRequestPdfDownload 호출
   - 반환된 base64 PDF를 브라우저에서 다운로드
═══════════════════════════════════════════════════════════════ */

const ExpenseModal = ({ open, onClose, contract, data }) => {
  const [form, setForm] = useState({
    manager: '',
    docDate: new Date().toISOString().substring(0, 10),
    paymentCount: '1',
    prevProgress: 0,
    requestAmount: '',
    attachments: '세금계산서, 통장사본 1부',
    commission: '',
    etcCost: '',
    equipmentBid: '',
    actualContract: '',
  });
  const [installItems, setInstallItems] = useState([]);
  const [productItems, setProductItems] = useState([]);
  const [generating, setGenerating] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (open && contract) {
      setForm(f => ({
        ...f,
        docDate: new Date().toISOString().substring(0, 10),
        prevProgress: contract.subcontractPaid || 0,
        requestAmount: contract.subcontractBalance || 0,
        commission: contract.salesCost || 0,
        etcCost: contract.incidental || 0,
      }));
      // 기본 1행씩
      setInstallItems([{ name:'', spec:'', qty:'', unit:'식', unitPrice:'', note:'' }]);
      setProductItems([]);
    }
  }, [open, contract]);

  if (!contract) return null;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // 계산
  const installTotal = installItems.reduce((s, r) => s + (Number(r.qty)||0) * (Number(r.unitPrice)||0), 0);
  const productTotal = productItems.reduce((s, r) => s + (Number(r.qty)||0) * (Number(r.unitPrice)||0), 0);
  const req = Number(form.requestAmount) || 0;
  const prev = Number(form.prevProgress) || 0;
  const after = prev + req;
  const remainingAfter = installTotal - after;

  // 손익
  const a = contract.totalAmount;
  const a1 = productTotal || contract.productCost || 0;
  const c = installTotal || contract.subcontractAmount || 0;
  const f = Number(form.commission) || contract.salesCost || 0;
  const g = Number(form.etcCost) || contract.incidental || 0;
  const profit = a - a1 - c - f - g;
  const marginRate = a > 0 ? profit / a : 0;

  // 항목 조작
  const updateInstall = (i, k, v) => setInstallItems(items => items.map((r, idx) => idx===i ? { ...r, [k]:v } : r));
  const removeInstall = (i) => setInstallItems(items => items.filter((_, idx) => idx !== i));
  const addInstall = () => setInstallItems(items => [...items, { name:'', spec:'', qty:'', unit:'식', unitPrice:'', note:'' }]);

  const updateProduct = (i, k, v) => setProductItems(items => items.map((r, idx) => idx===i ? { ...r, [k]:v } : r));
  const removeProduct = (i) => setProductItems(items => items.filter((_, idx) => idx !== i));
  const addProduct = () => setProductItems(items => [...items, { name:'', model:'', unit:'', qty:'', unitPrice:'' }]);

  const handleDownload = async () => {
    if (!hasApiUrl()) {
      toast?.('API URL이 설정되지 않았습니다', 'error');
      return;
    }
    if (installItems.length === 0 || !installItems.some(r => r.name && r.qty)) {
      toast?.('설치비 내역을 최소 1건 입력해주세요', 'error');
      return;
    }
    setGenerating(true);
    try {
      const payload = {
        manager: form.manager,
        date: form.docDate,
        paymentCount: form.paymentCount,
        prevProgress: prev,
        requestAmount: req,
        commission: Number(form.commission) || 0,
        etcCost: Number(form.etcCost) || 0,
        installItems: installItems.filter(r => r.name),
        productItems: productItems.filter(r => r.name),
        commissionItems: [],
        etcCostItems: [],
        attachments: form.attachments,
      };
      const res = await apiClient.generateExpensePdf(contract._rowNumber || contract.no, payload);
      // Note: GAS의 row number가 정확해야 함. 우선 contract.no로 전달.
      // res.pdf === { base64, fileName }
      if (res.pdf && res.pdf.base64) {
        const bin = atob(res.pdf.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.pdf.fileName || `지출품의서_${contract.no}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast?.('PDF 다운로드 완료', 'success');
      } else {
        throw new Error('PDF 생성 실패');
      }
    } catch (e) {
      toast?.('PDF 생성 실패: ' + e.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const Amt = ({ v }) => <>{(Math.round(Number(v)||0)).toLocaleString('ko-KR')}<span style={{fontSize:11,color:'var(--ink-3)',fontWeight:500,marginLeft:2}}>원</span></>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="wide"
      title="🧾 설치비 지급 품의서 생성"
      subtitle={`계약 #${contract.no} · ${contract.projectName}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={generating}>취소</button>
          <button className="btn-primary" onClick={handleDownload} disabled={generating}>
            {generating ? '생성 중…' : (<><Icon name="download" size={14} stroke={2.2}/>PDF 다운로드</>)}
          </button>
        </>
      }
    >
      {/* 상단 계약 정보 카드 */}
      <div style={{padding:'14px 18px',background:'var(--green-25)',border:'1px solid var(--line)',borderRadius:12,marginBottom:20}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16,fontSize:12.5}}>
          <div>
            <div style={{color:'var(--ink-3)',fontSize:11,marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:700}}>거래처</div>
            <div style={{fontWeight:600,color:'var(--ink-1)'}}>{contract.client}</div>
          </div>
          <div>
            <div style={{color:'var(--ink-3)',fontSize:11,marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:700}}>도급업체</div>
            <div style={{fontWeight:600,color:'var(--ink-1)'}}>{contract.subcontractor || '—'}</div>
          </div>
          <div>
            <div style={{color:'var(--ink-3)',fontSize:11,marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:700}}>도급금액</div>
            <div style={{fontWeight:700,color:'var(--ink-1)',fontVariantNumeric:'tabular-nums'}}><Amt v={contract.subcontractAmount}/></div>
          </div>
          <div>
            <div style={{color:'var(--ink-3)',fontSize:11,marginBottom:3,textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:700}}>기성 잔액</div>
            <div style={{fontWeight:700,color:contract.subcontractBalance>0?'var(--warn)':'var(--ink-3)',fontVariantNumeric:'tabular-nums'}}><Amt v={contract.subcontractBalance}/></div>
          </div>
        </div>
      </div>

      {/* 기본 정보 */}
      <div style={{fontSize:14,fontWeight:700,color:'var(--ink-1)',marginBottom:12,paddingBottom:8,borderBottom:'2px solid var(--green-800)'}}>지급 요청 정보</div>
      <div className="form-grid" style={{marginBottom:24}}>
        <div className="form-field">
          <label>영업담당</label>
          <input value={form.manager} onChange={e => set('manager', e.target.value)} placeholder="예: 이상규 이사"/>
        </div>
        <div className="form-field">
          <label>작성일</label>
          <input type="date" value={form.docDate} onChange={e => set('docDate', e.target.value)}/>
        </div>
        <div className="form-field">
          <label>기성 회차</label>
          <input value={form.paymentCount} onChange={e => set('paymentCount', e.target.value)} placeholder="1"/>
        </div>
        <div className="form-field">
          <label>전회 기성</label>
          <input className="tnum" type="number" value={form.prevProgress} onChange={e => set('prevProgress', e.target.value)}/>
        </div>
        <div className="form-field">
          <label>금회 요청금액 *</label>
          <input className="tnum" type="number" value={form.requestAmount} onChange={e => set('requestAmount', e.target.value)}/>
        </div>
        <div className="form-field">
          <label>첨부서류</label>
          <input value={form.attachments} onChange={e => set('attachments', e.target.value)}/>
        </div>
      </div>

      {/* 설치비 내역 */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,paddingBottom:8,borderBottom:'2px solid var(--green-800)'}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--ink-1)'}}>설치비 내역서</div>
        <button className="btn-ghost" style={{height:30,fontSize:12,padding:'0 10px'}} onClick={addInstall}>
          <Icon name="plus" size={12} stroke={2.4}/>항목 추가
        </button>
      </div>
      <table className="tbl" style={{marginBottom:8}}>
        <thead>
          <tr>
            <th style={{width:'26%'}}>품목/작업내용</th>
            <th style={{width:'12%'}}>규격</th>
            <th className="right" style={{width:70}}>수량</th>
            <th style={{width:60}}>단위</th>
            <th className="right" style={{width:120}}>단가</th>
            <th className="right" style={{width:130}}>금액</th>
            <th>비고</th>
            <th style={{width:40}}></th>
          </tr>
        </thead>
        <tbody>
          {installItems.map((r, i) => (
            <tr key={i}>
              <td><input value={r.name} onChange={e => updateInstall(i,'name',e.target.value)} style={cellInputStyle}/></td>
              <td><input value={r.spec} onChange={e => updateInstall(i,'spec',e.target.value)} style={cellInputStyle}/></td>
              <td><input className="tnum" type="number" value={r.qty} onChange={e => updateInstall(i,'qty',e.target.value)} style={{...cellInputStyle,textAlign:'right'}}/></td>
              <td><input value={r.unit} onChange={e => updateInstall(i,'unit',e.target.value)} style={cellInputStyle}/></td>
              <td><input className="tnum" type="number" value={r.unitPrice} onChange={e => updateInstall(i,'unitPrice',e.target.value)} style={{...cellInputStyle,textAlign:'right'}}/></td>
              <td className="right tnum" style={{fontWeight:600}}>{((Number(r.qty)||0)*(Number(r.unitPrice)||0)).toLocaleString()}</td>
              <td><input value={r.note} onChange={e => updateInstall(i,'note',e.target.value)} style={cellInputStyle}/></td>
              <td><button style={{border:0,background:'transparent',color:'var(--danger)',cursor:'pointer',fontSize:16,padding:0}} onClick={() => removeInstall(i)}>×</button></td>
            </tr>
          ))}
          <tr style={{background:'var(--surface-2)',fontWeight:700}}>
            <td colSpan="5" style={{textAlign:'right'}}>합계 (VAT포함)</td>
            <td className="right tnum" style={{color:'var(--green-800)',fontWeight:800}}>{installTotal.toLocaleString()}원</td>
            <td colSpan="2"></td>
          </tr>
        </tbody>
      </table>

      {/* 손익 미리보기 + 지급 상태 */}
      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:18,marginTop:24}}>
        <div style={{padding:16,background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12}}>
          <div style={{fontSize:11.5,fontWeight:700,color:'var(--ink-3)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:12}}>손익계산서 미리보기 (a - a1 - c - f - g)</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,fontSize:12.5}}>
            <StatMini label="공사계약금액 (a)" value={a}/>
            <StatMini label="장비대 (a1)" value={a1} sub="제품내역 합계"/>
            <StatMini label="도급비 (c)" value={c} sub="설치비 합계"/>
            <div className="form-field" style={{gap:4}}>
              <label style={{textTransform:'uppercase',fontSize:10.5}}>영업수수료 (f)</label>
              <input className="tnum" type="number" value={form.commission} onChange={e => set('commission', e.target.value)} style={{padding:'6px 8px',fontSize:12}}/>
            </div>
            <div className="form-field" style={{gap:4}}>
              <label style={{textTransform:'uppercase',fontSize:10.5}}>기타경비 (g)</label>
              <input className="tnum" type="number" value={form.etcCost} onChange={e => set('etcCost', e.target.value)} style={{padding:'6px 8px',fontSize:12}}/>
            </div>
            <StatMini label="예상 손익" value={profit} highlight color={profit>=0?'var(--pos)':'var(--danger)'}/>
          </div>
          <div style={{marginTop:12,paddingTop:12,borderTop:'1px dashed var(--line-2)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:12,color:'var(--ink-3)',fontWeight:600}}>예상 수익률</span>
            <span className="tnum" style={{fontSize:20,fontWeight:800,letterSpacing:'-0.02em',color:marginRate>=0.15?'var(--pos)':marginRate>=0.05?'var(--ink-1)':'var(--danger)'}}>
              {(marginRate*100).toFixed(1)}%
            </span>
          </div>
        </div>

        <div style={{padding:16,background:'var(--bronze-50)',border:'1px solid #ECD9AE',borderRadius:12}}>
          <div style={{fontSize:11.5,fontWeight:700,color:'var(--bronze-800)',letterSpacing:'0.05em',textTransform:'uppercase',marginBottom:12}}>지급 진행 요약</div>
          <div style={{display:'flex',flexDirection:'column',gap:10,fontSize:13}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'var(--ink-3)'}}>설치비 총액</span><b className="tnum"><Amt v={installTotal}/></b></div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'var(--ink-3)'}}>├ 전회기성</span><span className="tnum" style={{color:'var(--ink-2)'}}><Amt v={prev}/></span></div>
            <div style={{display:'flex',justifyContent:'space-between',color:'var(--green-800)',fontWeight:700}}><span>├ 금회 요청</span><span className="tnum">+ <Amt v={req}/></span></div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'var(--ink-3)'}}>├ 누계 기성</span><b className="tnum"><Amt v={after}/></b></div>
            <div style={{display:'flex',justifyContent:'space-between',borderTop:'1px dashed var(--bronze-400)',paddingTop:8,color:remainingAfter>0?'var(--warn)':'var(--pos)',fontWeight:700}}>
              <span>└ 잔액</span><b className="tnum"><Amt v={remainingAfter}/></b>
            </div>
          </div>
        </div>
      </div>

      {/* 안내 */}
      <div style={{marginTop:20,padding:'12px 14px',background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:10,fontSize:12,color:'var(--ink-3)',lineHeight:1.6}}>
        <b style={{color:'var(--ink-2)'}}>💡 안내</b> · PDF 다운로드 버튼을 누르면 GAS의 <code style={{background:'#fff',padding:'1px 4px',borderRadius:3}}>generateExpenseRequestPdfDownload</code>가 호출되어 HTML → Google Docs → PDF 변환 후 base64로 반환됩니다. 브라우저에서 자동 다운로드되며, Drive에는 저장되지 않습니다. Drive 저장까지 원하시면 스프레드시트의 기존 다이얼로그를 사용하세요.
      </div>
    </Modal>
  );
};

const cellInputStyle = {
  width:'100%', padding:'6px 8px', border:'1px solid var(--line)', borderRadius:6,
  fontSize:12, background:'#fff', fontFamily:'inherit'
};

const StatMini = ({ label, value, sub, highlight, color }) => (
  <div style={highlight ? {padding:8,background:'#fff',borderRadius:8,border:'1px solid var(--line-2)'} : {}}>
    <div style={{fontSize:10.5,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:700}}>{label}</div>
    <div className="tnum" style={{fontSize:14,fontWeight:800,color:color||'var(--ink-1)',marginTop:2,letterSpacing:'-0.02em'}}>{(Math.round(Number(value)||0)).toLocaleString()}<span style={{fontSize:10,fontWeight:500,color:'var(--ink-3)',marginLeft:2}}>원</span></div>
    {sub && <div style={{fontSize:10,color:'var(--ink-4)',marginTop:2}}>{sub}</div>}
  </div>
);

window.ExpenseModal = ExpenseModal;
