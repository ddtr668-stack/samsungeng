/* ═══════════════════════════════════════════════════════════════
   화면 5 · 거래처 관리
═══════════════════════════════════════════════════════════════ */

const ScreenClients = ({ data, onSelectContract, onUpdated }) => {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState('desc');
  const [onlyMissing, setOnlyMissing] = useState(false);   // 이름만 있고 상세정보(사업자번호·주소) 없는 거래처만 보기
  const [editingClient, setEditingClient] = useState(null); // 수정/신규 등록 모달 대상
  const [saving, setSaving] = useState(false);
  const toast = window.useToast ? window.useToast() : null;

  // 거래처별 계약 상세 정보 병합 (등록증 있는 경우) — 아래 useMemo 들보다 먼저 선언
  const findDetail = (name) => data.clients.find(x => x.name === name);

  // 거래처관리 시트에 등록된 상세정보(사업자번호·주소)가 하나도 없으면 "이름만 있는" 거래처로 간주
  const isMissingInfo = (c) => {
    const d = findDetail(c.name);
    return !d?.bizNo && !d?.address;
  };

  const filtered = useMemo(() => {
    let list = data.clientStats;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    if (onlyMissing) list = list.filter(isMissingInfo);
    return list;
  }, [data, search, onlyMissing]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a,b) => {
      const av = a[sortKey], bv = b[sortKey];
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

  // TOP 5 거래처
  const top5 = data.clientStats.slice(0, 5);
  const maxTop = Math.max(...top5.map(c => c.total));

  // ─── 거래처 정보 수정/신규 등록 ───
  const openEditClient = (c) => {
    const d = findDetail(c.name);
    setEditingClient({
      isNew: false,
      name: c.name,
      bizNo: d?.bizNo || '', ceo: d?.ceo || '', address: d?.address || '', tel: d?.tel || '',
    });
  };
  const openNewClient = () => {
    setEditingClient({ isNew: true, name: '', bizNo: '', ceo: '', address: '', tel: '' });
  };
  const setClientField = (k, v) => setEditingClient(prev => ({ ...prev, [k]: v }));
  const saveClient = async () => {
    if (!editingClient?.name?.trim()) { toast?.('거래처명을 입력하세요.', 'error'); return; }
    if (typeof hasApiUrl !== 'function' || !hasApiUrl()) { toast?.('API URL이 설정되지 않았습니다.', 'default'); return; }
    setSaving(true);
    try {
      await apiClient.saveClient({
        name: editingClient.name.trim(), bizNo: editingClient.bizNo.trim(),
        ceo: editingClient.ceo.trim(), address: editingClient.address.trim(), tel: editingClient.tel.trim(),
      });
      toast?.('거래처 정보를 저장했습니다.', 'success');
      setEditingClient(null);
      onUpdated?.();
    } catch (e) {
      toast?.('저장 실패: ' + (e.message || '알 수 없는 오류'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>거래처 관리</h1>
          <div className="page-sub">총 <b>{data.clientStats.length}개</b> 거래처 · 등록증 보유 <b>{data.clients.length}개</b></div>
        </div>
        <div className="hstack">
          <button className="btn-ghost"><Icon name="download" size={14}/>거래처 CSV</button>
          <button className="btn-primary" onClick={openNewClient}><Icon name="plus" size={14} stroke={2.2}/>거래처 등록</button>
        </div>
      </div>

      {/* TOP 5 거래처 카드 */}
      <div className="card" style={{marginBottom:20}}>
        <CardHead title="TOP 5 거래처" sub="계약금액 기준"/>
        <div className="bars">
          {top5.map((c, i) => (
            <div key={c.name} className="bar-row">
              <div className="b-top">
                <span className="b-label" style={{display:'inline-flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <span style={{display:'inline-block',width:20,textAlign:'center',fontWeight:700,color: i===0?'var(--bronze-800)':'var(--ink-3)'}} className="tnum">{i+1}</span>
                  <span>{c.name}</span>
                  <span style={{color:'var(--ink-3)',fontWeight:500,fontSize:11.5}}>{c.count}건</span>
                  {c.categories.map(x => <CatTag key={x} cat={x}/>)}
                </span>
                <span className="b-value">{fmtKRW억(c.total)}<span style={{color:'var(--ink-3)',fontWeight:500,fontSize:11,marginLeft:3}}>원</span></span>
              </div>
              <div className="b-track"><div className="b-fill" style={{width: (c.total / maxTop * 100) + '%'}}/></div>
            </div>
          ))}
        </div>
      </div>

      {/* 리스트 */}
      <div className="card tight">
        <div className="controls-bar">
          <div className="search" style={{width:280,margin:0}}>
            <span className="sicon"><Icon name="search" size={14} stroke={2}/></span>
            <input placeholder="거래처명 검색"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                   style={{height:32,fontSize:12.5,paddingLeft:32}}/>
          </div>
          <label style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:12,color:'var(--ink-2)',cursor:'pointer',marginLeft:12}}>
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} style={{width:14,height:14}}/>
            이름만 있는 거래처만 보기
          </label>
          <div className="spacer"/>
          <div style={{fontSize:12,color:'var(--ink-3)'}}>총 <b style={{color:'var(--ink-1)'}}>{filtered.length}개</b> 거래처</div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:60}}>순위</th>
                <th>거래처 / 대표자</th>
                <th style={{width:120}}>사업자번호</th>
                <th>주소 · 연락처</th>
                <th className="right sortable" onClick={()=>toggleSort('count')} style={{width:80}}>계약</th>
                <th className="right sortable" onClick={()=>toggleSort('total')} style={{width:130}}>총 계약금액</th>
                <th className="right sortable" onClick={()=>toggleSort('balance')} style={{width:130}}>미수 잔금</th>
                <th className="center" style={{width:60}}>등록증</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c, i) => {
                const detail = findDetail(c.name);
                const rank = (page-1)*15 + i + 1;
                return (
                  <tr key={c.name} className="clickable">
                    <td className="center" style={{fontSize:12,color:'var(--ink-3)',fontWeight:600}}>{rank}</td>
                    <td>
                      <div style={{fontWeight:600,color:'var(--ink-1)',fontSize:13,letterSpacing:'-0.01em'}}>{c.name}</div>
                      {detail?.ceo && <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:2}}>대표 · {detail.ceo}</div>}
                      <div style={{marginTop:4,display:'flex',gap:3}}>{c.categories.map(x => <CatTag key={x} cat={x}/>)}</div>
                    </td>
                    <td className="tnum" style={{fontSize:12,color:'var(--ink-3)'}}>{detail?.bizNo || <span style={{color:'var(--ink-5)'}}>미등록</span>}</td>
                    <td>
                      {detail?.address ? (
                        <>
                          <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.4}}>{detail.address}</div>
                          {detail.tel && <div style={{fontSize:11.5,color:'var(--ink-3)',marginTop:3,display:'flex',alignItems:'center',gap:4}}><Icon name="phone" size={11}/> {detail.tel}</div>}
                        </>
                      ) : (
                        <div style={{fontSize:12,color:'var(--ink-4)'}}>정보 없음</div>
                      )}
                    </td>
                    <td className="right num tnum" style={{fontWeight:600}}>{c.count}건</td>
                    <td className="right"><Amt v={c.total}/></td>
                    <td className="right">{c.balance > 0 ? <Amt v={c.balance} className="neg"/> : <span className="amt mute">완결</span>}</td>
                    <td className="center">
                      <div className="row-act" style={{display:'inline-flex',justifyContent:'center',gap:4}}>
                        {detail && (
                          <button style={{background:'var(--green-50)',color:'var(--green-800)',border:'1px solid #D3DCD3'}} onClick={(e)=>e.stopPropagation()}><Icon name="file" size={11}/></button>
                        )}
                        <button
                          title="거래처 정보 수정"
                          style={{background:'var(--surface-2)',color:'var(--ink-2)',border:'1px solid var(--line)'}}
                          onClick={(e) => { e.stopPropagation(); openEditClient(c); }}>
                          ✏️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="table-foot">
            <span>거래처 <b className="tnum" style={{color:'var(--ink-1)'}}>{sorted.length}개</b> 중 <b className="tnum">{start}–{end}</b></span>
            <Pager page={page} totalPages={totalPages} onChange={setPage}/>
          </div>
        )}
      </div>

      {editingClient && (
        <div className="modal-backdrop" onClick={() => !saving && setEditingClient(null)}>
          <div className="modal" style={{maxWidth:460}} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editingClient.isNew ? '거래처 신규 등록' : '거래처 정보 수정'}</div>
              <button className="modal-close" onClick={() => !saving && setEditingClient(null)}><Icon name="xCircle" size={16}/></button>
            </div>
            <div className="modal-body" style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="form-field full">
                <label>상호(거래처명)</label>
                <input
                  type="text"
                  value={editingClient.name}
                  onChange={e => setClientField('name', e.target.value)}
                  readOnly={!editingClient.isNew}
                  placeholder="예: (주)엠아이씨유"
                  style={editingClient.isNew ? undefined : {background:'var(--surface-2)',color:'var(--ink-3)'}}
                />
                {!editingClient.isNew && <div className="hint">기존 거래처의 상호는 계약 데이터와의 연결을 위해 여기서 바꿀 수 없습니다.</div>}
              </div>
              <div className="form-field full">
                <label>사업자등록번호</label>
                <input type="text" value={editingClient.bizNo} onChange={e => setClientField('bizNo', e.target.value)} placeholder="000-00-00000"/>
              </div>
              <div className="form-field full">
                <label>대표자</label>
                <input type="text" value={editingClient.ceo} onChange={e => setClientField('ceo', e.target.value)}/>
              </div>
              <div className="form-field full">
                <label>주소</label>
                <input type="text" value={editingClient.address} onChange={e => setClientField('address', e.target.value)}/>
              </div>
              <div className="form-field full">
                <label>전화번호</label>
                <input type="text" value={editingClient.tel} onChange={e => setClientField('tel', e.target.value)} placeholder="02-000-0000"/>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-ghost" onClick={() => setEditingClient(null)} disabled={saving}>취소</button>
              <button className="btn-primary" onClick={saveClient} disabled={saving}>
                <Icon name="check" size={14} stroke={2.4}/>
                {saving ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

window.ScreenClients = ScreenClients;
