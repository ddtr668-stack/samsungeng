/* ═══════════════════════════════════════════════════════════════
   지출품의서 모달 · 재사용 컴포넌트
   - ContractHeader (계약 요약 헤더 + KPI 8개 + 타임라인)
   - SubcontractorBlock (도급업체 정보 블록 - 거래처관리 연동)
   - ProgressBar (기성 누적 진행 시각화)
   - ItemsTable (설치비/제품/기타경비/수수료 공통)
   - PreviousRoundDropdown (전회 기성 드롭박스)
═══════════════════════════════════════════════════════════════ */

// ─── 공통 유틸 ───
const _fmtNum = (v) => (Math.round(Number(v)||0)).toLocaleString('ko-KR');
const _fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso).slice(0,10);
  return d.toLocaleDateString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit' }).replace(/\. /g,'-').replace(/\.$/,'');
};

const _labelSt = {
  display: 'block', fontSize: 10.5, color: 'var(--ink-3)',
  fontWeight: 700, letterSpacing: '0.03em', marginBottom: 3,
};
const _inputSt = {
  width: '100%', padding: '7px 10px', fontSize: 12,
  border: '1px solid var(--line)', borderRadius: 6,
  background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

// ═══════════════════════════════════════════════════════════════
// 1. 계약 요약 헤더 (개선안 ⑦)
// ═══════════════════════════════════════════════════════════════
const ExpenseContractHeader = ({ contract, paidTotal, paidPct, paySplit, timelineEnabled = true }) => {
  const c = contract;
  const _bal = Math.max((c.totalAmount || 0) - paidTotal, 0);

  const KpiTile = ({ label, value, color, sub, subColor, dotColor }) => (
    <div style={{padding:'8px 10px', background:'#fff', border:'1px solid var(--line)', borderRadius:6}}>
      <div style={{fontSize:9.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.03em', display:'flex', alignItems:'center', gap:4}}>
        <span style={{width:5,height:5,borderRadius:'50%',background:dotColor,display:'inline-block'}}/>
        {label}
      </div>
      <div style={{fontSize:13.5, fontWeight:800, color:color||'var(--ink-1)', fontVariantNumeric:'tabular-nums', marginTop:2}}>
        {_fmtNum(value)}<span style={{fontSize:10, color:'var(--ink-3)', fontWeight:500, marginLeft:2}}>원</span>
      </div>
      {sub && <div style={{fontSize:9.5, color: subColor || 'var(--ink-3)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{sub}</div>}
    </div>
  );

  // 진행 타임라인 5단계
  const CHECKS = c.checks || {};
  const stages = [
    { label: c.contractDate ? new Date(c.contractDate).toLocaleDateString('ko-KR',{month:'2-digit',day:'2-digit'}).replace(/\.$/,'').replace(/\. /g,'.').trim() : '계약', title: '계약 체결', done: true, sub: (c.category || '') },
    { label: '착공', title: '배관·실내기·실외기', done: CHECKS['실외기'] || CHECKS['실내기'], sub: CHECKS['실외기'] ? '완료' : '진행' },
    { label: '시운전', title: '시운전 및 검수', done: CHECKS['시운전'], sub: CHECKS['시운전'] ? '검수 완료' : '대기' },
    { label: '준공', title: '인수인계', done: CHECKS['인수인계'], sub: CHECKS['인수인계'] ? '완료' : '진행' },
    { label: '정산', title: '잔금 수금', done: _bal === 0, sub: _bal === 0 ? '완납' : `잔금 ${_fmtNum(_bal)} 필요` },
  ];
  const doneCount = stages.filter(s => s.done).length;
  const barPct = ((doneCount - 1) / (stages.length - 1)) * 100;

  return (
    <div style={{marginBottom:16}}>
      {/* 타이틀 라인 */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
        <div style={{minWidth:0, flex:1}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:3, flexWrap:'wrap'}}>
            <span style={{fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.05em'}}>
              계약 {contractCode(c)}
            </span>
            {c.category && (
              <span style={{padding:'1px 8px', fontSize:10, fontWeight:700, background:'var(--green-50)', color:'var(--green-800)', border:'1px solid #C9DFD1', borderRadius:10}}>
                {c.category}
              </span>
            )}
            {c.status && (
              <span style={{padding:'1px 8px', fontSize:10, fontWeight:700, background:'#FDF6E7', color:'#D97706', border:'1px solid #F0D9A0', borderRadius:10}}>
                {c.status}
              </span>
            )}
          </div>
          <div style={{fontSize:15, fontWeight:800, color:'var(--ink-1)', letterSpacing:'-0.02em', overflow:'hidden', textOverflow:'ellipsis'}}>
            {c.projectName}
          </div>
          <div style={{fontSize:11, color:'var(--ink-3)', marginTop:3}}>
            거래처 <b style={{color:'var(--ink-1)'}}>{c.client}</b>
            {c.contractDate && <> · 계약일 <b style={{color:'var(--ink-1)'}}>{_fmtDate(c.contractDate)}</b></>}
            {c.subcontractor && <> · 도급 <b style={{color:'var(--ink-1)'}}>{c.subcontractor}</b></>}
          </div>
        </div>
      </div>

      {/* KPI 8개 카드 */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginBottom:5}}>
        <KpiTile label="총 계약금" value={c.totalAmount} dotColor="var(--green-600, #3F7A5C)" sub="부가세 포함" />
        <KpiTile label="수금액" value={paidTotal} dotColor="var(--pos)" color="var(--pos)" sub={`수금률 ${(paidPct||0).toFixed(1)}%`} />
        <KpiTile label="미수 잔금" value={_bal} dotColor="#8f6d3a" color={_bal > 0 ? 'var(--danger)' : 'var(--ink-3)'} sub={_bal > 0 ? '수금 필요' : '완결'} />
        <KpiTile label="영업 이윤" value={c.profit} dotColor="var(--green-700, #2E6849)" sub={`마진율 ${((c.marginRate||0)*100).toFixed(1)}%`} subColor={(c.marginRate||0) >= 0.15 ? 'var(--pos)' : 'var(--ink-3)'} />
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5}}>
        <KpiTile label="제품대 (장비대)" value={c.productCost} dotColor="#8f6d3a" sub={c.totalAmount > 0 ? `총액 대비 ${((c.productCost/c.totalAmount)*100).toFixed(1)}%` : '미입력'} />
        <KpiTile label="설치비 (도급비)" value={c.subcontractAmount} dotColor="#8f6d3a" sub={c.subcontractor ? `→ ${c.subcontractor}` : '직시공'} />
        <KpiTile label="영업 수수료" value={c.salesCost || 0} dotColor="#8f6d3a" sub={c.salesCost > 0 ? '' : '없음'} color={c.salesCost > 0 ? 'var(--ink-1)' : 'var(--ink-3)'} />
        <KpiTile label="기타 경비" value={c.incidental || 0} dotColor="#8f6d3a" sub={c.incidental > 0 ? '' : '없음'} color={c.incidental > 0 ? 'var(--ink-1)' : 'var(--ink-3)'} />
      </div>


      {/* 수금 내역 : 계약금 · 중도금 · 잔금 (대시보드 수금 관리 연동) */}
      {paySplit && (() => {
        const ps = paySplit;
        const pctTxt = (v) => (c.totalAmount > 0 ? ((v / c.totalAmount) * 100).toFixed(1) + '%' : '-');
        const sheet = ps.source === 'sheet';
        return (
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:5, marginTop:5}}>
            <KpiTile label="계약금 (1회차)" value={sheet ? ps.deposit.amount : 0} dotColor="var(--green-600, #3F7A5C)"
              sub={sheet ? `${_fmtDate(ps.deposit.date)} · ${pctTxt(ps.deposit.amount)}` : (ps.source === 'summary' ? '수금이력 미등록' : '입금 전')} />
            <KpiTile label="중도금" value={ps.interim ? ps.interim.amount : 0} dotColor="var(--green-600, #3F7A5C)"
              color={ps.interim ? 'var(--ink-1)' : 'var(--ink-3)'}
              sub={ps.interim ? `${ps.interim.count}회 입금 합계 · ${pctTxt(ps.interim.amount)}` : '해당 없음'} />
            <KpiTile label={ps.final ? '잔금 (입금 완료)' : '잔금 (미수)'} value={ps.final ? ps.final.amount : ps.remain} dotColor="#8f6d3a"
              color={ps.final ? 'var(--pos)' : (ps.remain > 0 ? 'var(--danger)' : 'var(--ink-3)')}
              sub={ps.final ? `${_fmtDate(ps.final.date)} · ${pctTxt(ps.final.amount)}` : (ps.remain > 0 ? `${pctTxt(ps.remain)} · 입금 전` : '')} />
            <KpiTile label="수금 합계" value={ps.paid} dotColor="var(--pos)" color="var(--pos)"
              sub={`${ps.count ? ps.count + '회 · ' : ''}수금률 ${pctTxt(ps.paid)}`} />
          </div>
        );
      })()}

      {/* 타임라인 */}
      {timelineEnabled && (
        <div style={{marginTop:10, padding:'10px 14px', background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:8}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
            <div style={{fontSize:10.5, fontWeight:700, color:'var(--ink-2)', letterSpacing:'0.03em'}}>📋 진행 타임라인</div>
            <div style={{fontSize:10, color:'var(--ink-3)'}}>{doneCount}/{stages.length} 완료</div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:`repeat(${stages.length},1fr)`, gap:6, position:'relative'}}>
            <div style={{position:'absolute', top:7, left:'8%', right:'8%', height:2, background:`linear-gradient(90deg, var(--green-600, #3F7A5C) 0%, var(--green-600, #3F7A5C) ${barPct}%, var(--line) ${barPct}%)`, borderRadius:1, zIndex:0}}/>
            {stages.map((s, i) => (
              <div key={i} style={{textAlign:'center', position:'relative', zIndex:1}}>
                <div style={{
                  width:14, height:14, borderRadius:'50%',
                  background: s.done ? 'var(--green-600, #3F7A5C)' : '#fff',
                  border: s.done ? '3px solid #fff' : '2px solid var(--line-2)',
                  boxShadow: s.done ? '0 0 0 1px var(--green-600, #3F7A5C)' : 'none',
                  margin: '0 auto 4px',
                }}/>
                <div style={{fontSize:9, color:'var(--ink-3)', fontWeight:600}}>{s.label}</div>
                <div style={{fontSize:10, fontWeight:700, color:'var(--ink-1)', marginTop:1}}>{s.title}</div>
                <div style={{fontSize:9, color: s.done ? 'var(--pos)' : 'var(--ink-3)', marginTop:1, fontWeight:600}}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


// ═══════════════════════════════════════════════════════════════
// 도급업체 후보 목록 빌더
//  ① 도급업체 전용 시트/파일(data.subcontractors)  ② 거래처관리 중 구분=도급업체
//  ③ 계약에 입력된 도급업체명(사업자 정보 미등록)  ④ 그 밖의 거래처
// ═══════════════════════════════════════════════════════════════
// 계약 시트의 '도급업체' 칸에는 흔히 "유니온 유창열소장"처럼 회사명 뒤에
// 담당자 직함이 붙어 있다. 사업자정보가 등록된 "유니온" 과 매칭시키려면
// 이런 꼬리표(직함)를 비교 전에 떼어내야 한다 — 실제 표시 이름은 그대로 두고
// 매칭용 정규화(_normName)에서만 제거한다.
const _TITLE_SUFFIX_RE = /\s*(소장|대표|대표이사|이사|부장|차장|과장|팀장|실장|사장|전무|상무|감사|대리|주임|담당|매니저|소장님|사장님)\s*$/;
const _normName = (v) => {
  let s = String(v || '').trim();
  s = s.replace(/\(주\)|㈜|주식회사/g, '');
  s = s.replace(/\([^)]*\)/g, '');
  s = s.replace(_TITLE_SUFFIX_RE, '').replace(_TITLE_SUFFIX_RE, ''); // 겹경칭 대비 2회
  return s.replace(/\s/g, '').toLowerCase();
};
const _telRe = /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/;

function buildSubcontractorOptions(data) {
  const seen = new Set();
  const groups = { reg: [], fromClients: [], fromContracts: [], others: [] };
  const push = (arr, it, srcLabel) => {
    const key = it.bizNo || ('n:' + it.name);
    const nk = _normName(it.name);
    if (!it.name || (nk && seen.has(nk))) return;
    seen.add(nk);
    arr.push({ ...it, key, source: srcLabel });
  };

  (data?.subcontractors || []).forEach(x => push(groups.reg, {
    name: x.name, bizNo: x.bizNo || '', ceo: x.ceo || '', tel: x.tel || '', manager: x.manager || '',
    bank: x.bank || '', account: x.account || '', holder: x.holder || '', address: x.address || '',
  }, '도급업체 시트'));

  const isSub = (c) => /도급|설치|시공/.test(String(c.category || ''));
  (data?.clients || []).filter(isSub).forEach(x => push(groups.fromClients, {
    name: x.name, bizNo: x.bizNo || '', ceo: x.ceo || '', tel: x.tel || '', bank: x.bank || '',
    account: x.account || '', holder: x.holder || '', address: x.address || '',
  }, '거래처관리(도급업체)'));

  // 계약에 적힌 도급업체명 → 등록된 업체정보(시트/거래처관리)가 있으면 그 정보로 보강
  const registry = [...(data?.subcontractors || []), ...(data?.clients || [])];
  const findReg = (name) => {
    const nk = _normName(name);
    if (nk.length < 2) return null;
    return registry.find(r => _normName(r.name) === nk)
        || registry.find(r => { const rk = _normName(r.name); return rk.length >= 2 && (nk.includes(rk) || rk.includes(nk)); })
        || null;
  };
  const cnt = {};
  (data?.contracts || []).forEach(c => {
    const raw = String(c.subcontractor || '').trim();
    if (!raw || /^(미정|없음|-|직시공)$/.test(raw)) return;
    const tel = (raw.match(_telRe) || [])[0] || '';
    const name = raw.replace(_telRe, '').replace(/\s{2,}/g, ' ').trim();
    if (!name) return;
    cnt[name] = cnt[name] || { name, tel, n: 0 };
    cnt[name].n++;
    if (!cnt[name].tel && tel) cnt[name].tel = tel;
  });
  Object.values(cnt).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'ko')).forEach(x => {
    const reg = findReg(x.name);
    if (reg) {
      push(groups.fromContracts, {
        name: reg.name, bizNo: reg.bizNo || '', ceo: reg.ceo || '', tel: reg.tel || x.tel || '',
        manager: reg.manager || '', bank: reg.bank || '', account: reg.account || '', holder: reg.holder || '',
        address: reg.address || '',
      }, `계약 ${x.n}건 · 등록업체`);
    } else {
      push(groups.fromContracts, { name: x.name, bizNo: '', ceo: '', tel: x.tel }, `계약 ${x.n}건`);
    }
  });

  (data?.clients || []).filter(c => !isSub(c)).forEach(x => push(groups.others, {
    name: x.name, bizNo: x.bizNo || '', ceo: x.ceo || '', tel: x.tel || '', bank: x.bank || '',
    account: x.account || '', holder: x.holder || '', address: x.address || '',
  }, '거래처관리'));

  return groups;
}
window.buildSubcontractorOptions = buildSubcontractorOptions;

// ═══════════════════════════════════════════════════════════════
// 2. 도급업체 정보 블록 (개선안 ④)
// ═══════════════════════════════════════════════════════════════
// v3: 이 블록 자체의 "💾 업체정보 저장" 버튼은 없앴다 — 저장은 아래 "설치비 기성" 카드의
// 개별 저장 버튼(onSaveVendor prop, modal-expense.jsx 의 handleSaveFullVendor)에서 담당한다.
// 이 컴포넌트는 순수하게 입력 폼(도급업체 선택 + 필드 표시/수정)만 맡는다.
const SubcontractorBlock = ({ form, setForm, data, clientOptions = [], onSave, saving }) => {
  const groups = React.useMemo(
    () => buildSubcontractorOptions(data || { clients: clientOptions }),
    [data, clientOptions]
  );
  const all = [...groups.reg, ...groups.fromClients, ...groups.fromContracts, ...groups.others];

  const handleSelect = (key) => {
    if (key === '_new') {
      setForm({
        ...form,
        subName: '', subBizNo: '', subCeo: '', subAddress: '',
        subManager: '', subManagerTel: '',
        subBank: '', subAccount: '', subHolder: '',
      });
      return;
    }
    const found = all.find(o => o.key === key);
    if (!found) return;
    setForm({
      ...form,
      subName: found.name || '',
      subBizNo: found.bizNo || '',
      subCeo: found.ceo || '',
      subAddress: found.address || '',
      // 업체를 바꾸면 이전 업체의 담당자·연락처·계좌가 남지 않도록 전부 새 업체 값으로 교체
      // (계좌 오입금 방지 · 시트에 값이 없으면 빈칸으로 두고 직접 입력)
      subManager: found.manager || '',
      subManagerTel: found.tel || '',
      subBank: found.bank || '',
      subAccount: found.account || '',
      subHolder: found.holder || '',
    });
  };

  const optLabel = (o) => `${o.name}${o.ceo ? ` · ${o.ceo}` : ''}${o.bizNo ? ` (${o.bizNo})` : ''}`;
  const currentKey = form.subBizNo && all.some(o => o.key === form.subBizNo)
    ? form.subBizNo
    : (all.find(o => o.name === form.subName)?.key || '');

  return (
    <div style={{padding:'12px 14px', marginBottom:14, background:'var(--surface-2)', border:'1px solid var(--line)', borderRadius:8}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:6}}>
        <div style={{fontSize:11.5, fontWeight:700, color:'var(--ink-2)', letterSpacing:'0.02em'}}>
          🏢 지급 대상 (도급업체)
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
          <span style={{fontSize:10, color:'var(--ink-3)'}}>
            도급업체 시트 · 거래처관리 · 계약내역에서 조회 ({all.length}곳)
          </span>
          {onSave && (
            <button type="button" onClick={onSave} disabled={saving || !String(form.subName || '').trim()}
              title="업체명·대표자·사업자번호·담당자·전화·은행·계좌·예금주·주소를 도급업체 목록에 저장 (다음부터 선택 가능)"
              style={{fontSize:11, fontWeight:800, padding:'5px 11px', borderRadius:6, border:'1px solid var(--green-800)', background:'var(--green-800)', color:'#fff', cursor: saving ? 'wait' : 'pointer', whiteSpace:'nowrap'}}>
              {saving ? '저장 중…' : '💾 업체정보 저장'}
            </button>
          )}
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.3fr 1.3fr 1fr 1.2fr', gap:10, marginBottom:8}}>
        <div>
          <label style={_labelSt}>업체명 · 선택</label>
          <select
            value={currentKey}
            onChange={e => handleSelect(e.target.value)}
            style={{..._inputSt}}
          >
            <option value="">▼ 도급업체 선택</option>
            {groups.reg.length > 0 && (
              <optgroup label="도급업체 (등록)">
                {groups.reg.map(o => <option key={'r'+o.key} value={o.key}>{optLabel(o)}</option>)}
              </optgroup>
            )}
            {groups.fromClients.length > 0 && (
              <optgroup label="거래처관리 · 구분=도급업체">
                {groups.fromClients.map(o => <option key={'c'+o.key} value={o.key}>{optLabel(o)}</option>)}
              </optgroup>
            )}
            {groups.fromContracts.length > 0 && (
              <optgroup label="계약에 입력된 도급업체">
                {groups.fromContracts.map(o => <option key={'k'+o.key} value={o.key}>{o.bizNo ? optLabel(o) : `${o.name} · ${o.source}`}</option>)}
              </optgroup>
            )}
            {groups.others.length > 0 && (
              <optgroup label="그 밖의 거래처">
                {groups.others.map(o => <option key={'o'+o.key} value={o.key}>{optLabel(o)}</option>)}
              </optgroup>
            )}
            <option value="_new">+ 신규 도급업체 (직접 입력)</option>
          </select>
        </div>
        <div>
          <label style={_labelSt}>업체명 (직접 입력·수정)</label>
          <input
            value={form.subName || ''}
            onChange={e => setForm({...form, subName: e.target.value})}
            placeholder="예: 유니온"
            style={_inputSt}
          />
        </div>
        <div>
          <label style={_labelSt}>대표자</label>
          <input
            value={form.subCeo || ''}
            onChange={e => setForm({...form, subCeo: e.target.value})}
            placeholder="대표자명"
            style={_inputSt}
          />
        </div>
        <div>
          <label style={_labelSt}>사업자등록번호</label>
          <input
            value={form.subBizNo || ''}
            onChange={e => setForm({...form, subBizNo: e.target.value})}
            placeholder="123-45-67890"
            style={{..._inputSt, fontFamily:'ui-monospace,Menlo,monospace'}}
          />
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:8}}>
        <div>
          <label style={_labelSt}>담당자</label>
          <input
            value={form.subManager || ''}
            onChange={e => setForm({...form, subManager: e.target.value})}
            placeholder="예: 김철수 소장"
            style={_inputSt}
          />
        </div>
        <div>
          <label style={_labelSt}>담당자 전화번호</label>
          <input
            value={form.subManagerTel || ''}
            onChange={e => setForm({...form, subManagerTel: e.target.value})}
            placeholder="010-1234-5678"
            style={{..._inputSt, fontFamily:'ui-monospace,Menlo,monospace'}}
          />
        </div>
        <div>
          <label style={_labelSt}>은행명</label>
          <input
            value={form.subBank || ''}
            onChange={e => setForm({...form, subBank: e.target.value})}
            placeholder="예: 국민은행"
            style={_inputSt}
          />
        </div>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:10, marginBottom:8}}>
        <div>
          <label style={_labelSt}>계좌번호</label>
          <input
            value={form.subAccount || ''}
            onChange={e => setForm({...form, subAccount: e.target.value})}
            placeholder="123456-78-901234"
            style={{..._inputSt, fontFamily:'ui-monospace,Menlo,monospace'}}
          />
        </div>
        <div>
          <label style={_labelSt}>예금주</label>
          <input
            value={form.subHolder || ''}
            onChange={e => setForm({...form, subHolder: e.target.value})}
            placeholder="예금주명"
            style={_inputSt}
          />
        </div>
      </div>

      <div>
        <label style={_labelSt}>주소</label>
        <input
          value={form.subAddress || ''}
          onChange={e => setForm({...form, subAddress: e.target.value})}
          placeholder="예: 충남 천안시 ○○구 ○○로 00"
          style={_inputSt}
        />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 3. 항목별 기성 카드 (v3) — 요약/상세내역 탭 + 업체명 오버라이드 + 병합된 내역서
//    (v2의 ProgressStages를 대체. "접기/펼치기" 대신 [요약]/[상세내역] 탭을 카드 헤더에 둠)
// ═══════════════════════════════════════════════════════════════
const ACCENT_THEME = {
  green:  { strong:'#1D4331', bright:'#2F7A55', mid:'#7FA88F', line:'#C9DFD1', soft:'linear-gradient(180deg,#EAF1EC,#F3F6F1)' },
  blue:   { strong:'#2F5A80', bright:'#3E7CAE', mid:'#8EABC2', line:'#C8DBE5', soft:'linear-gradient(180deg,#E4ECF4,#EFF4F8)' },
  bronze: { strong:'#7A5320', bright:'#B8873B', mid:'#C9AD7C', line:'#ECD9AE', soft:'linear-gradient(180deg,#FBF3E1,#FDF8ED)' },
  plum:   { strong:'#5B3E82', bright:'#8862B8', mid:'#B8A2CF', line:'#D9C7E8', soft:'linear-gradient(180deg,#EFE7F5,#F6F1FA)' },
};
window.ACCENT_THEME = ACCENT_THEME;

const CategoryCard = ({
  icon, name, accent = 'green',
  toggle,           // { checked, onChange, includeLabel, excludeLabel } — 4개 카드 모두 사용
  vendorValue, onVendorChange, onSaveVendor, savingVendor, vendorPlaceholder, vendorLabel,
  vendorOptions,    // 저장된 업체 이름 목록 → 드롭다운에서 선택
  onVendorPick,     // 드롭다운에서 골랐을 때 (없으면 onVendorChange)
  vendorDetail,     // { ceo, bizNo, bank, account, holder } — 업체명 아래 한 줄로 표시
  note, onNoteChange, // 항목별 비고(지급 사유) — 출력물 지급대상 비고·상세내역에 표시
  totalAmount, rounds, currentAmount, onAmountChange, currentRoundLabel, onDeleteRound, deletingNo,
  // 수기 지급이력 — 표에서 바로 입력·수정하고 [지급이력 저장]
  manualRows, onManualRowsChange, onSaveManual, savingManual, manualSavedAt,
  onTotalChange, totalNote,   // 총액을 화면에서 고칠 수 있게 할 때 (예: 기타경비 — 계약관리 시트 값 불러와 수정)
  defaultTab = 'summary',
  detailTitle, detailActions, detailBanner,
  children,         // 상세내역 탭 — 내역서(ItemsTable) 등
}) => {
  const a = ACCENT_THEME[accent] || ACCENT_THEME.green;
  const [tab, setTab] = React.useState(defaultTab);
  const included = !toggle || toggle.checked;

  const total = Number(totalAmount) || 0;
  let prevCum = 0;
  const rows = (rounds || []).map(r => {
    const amt = Number(r.amount) || 0;
    const pct = total > 0 ? (amt / total * 100) : 0;
    prevCum += amt;
    const cumPct = total > 0 ? (prevCum / total * 100) : 0;
    return { ...r, amount: amt, pct, cumPct };
  });
  const manualCalc = (manualRows || []).map(m => {
    const amt = Number(m.amount) || 0;
    prevCum += amt;
    return { pct: total > 0 ? (amt / total * 100) : 0, cumPct: total > 0 ? (prevCum / total * 100) : 0 };
  });
  const histCount = rows.length + (manualRows || []).filter(m => Number(m.amount) > 0).length;
  const prevSum = prevCum;
  const curAmt = included ? (Number(currentAmount) || 0) : 0;
  const curPct = total > 0 ? (curAmt / total * 100) : 0;
  const finalCum = prevSum + curAmt;
  const finalPct = total > 0 ? (finalCum / total * 100) : 0;
  const balance = Math.max(total - finalCum, 0);
  const prevBarPct = total > 0 ? Math.min((prevSum / total) * 100, 100) : 0;
  const curBarPct = total > 0 ? Math.min((curAmt / total) * 100, 100) : 0;

  const amountInputSt = {
    width:130, padding:'6px 9px', border:`1px solid ${a.mid}`, borderRadius:6, fontSize:12.5, fontWeight:800,
    textAlign:'right', color: included ? a.strong : 'var(--ink-4)', background:'#fff', fontVariantNumeric:'tabular-nums',
    fontFamily:'inherit', outline:'none',
  };
  // 렌더마다 새 컴포넌트가 되면 입력칸이 다시 만들어져 포커스가 풀림 → 함수로 호출
  const amountInput = () => (
    <input
      type="number"
      value={included ? (currentAmount === 0 || currentAmount === '' || currentAmount == null ? '' : currentAmount) : 0}
      onChange={e => onAmountChange?.(e.target.value)}
      disabled={!included}
      style={amountInputSt}
    />
  );

  const Tab = ({ id, label }) => (
    <span
      onClick={() => setTab(id)}
      style={{
        padding:'5px 11px', fontSize:10.5, fontWeight:800, borderRadius:16, cursor:'pointer', letterSpacing:'0.01em',
        background: tab === id ? '#fff' : 'rgba(255,255,255,0.16)',
        color: tab === id ? a.strong : 'rgba(255,255,255,0.85)',
      }}
    >{label}</span>
  );

  return (
    <div style={{borderRadius:12, marginBottom:14, overflow:'hidden', border:`1px solid ${a.line}`, opacity: included ? 1 : 0.72, transition:'opacity .15s'}}>
      {/* 헤더: 이름 · 이번 회차 포함/제외 토글 · 요약/상세내역 탭 */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:a.strong, color:'#fff', flexWrap:'wrap', gap:8}}>
        <div style={{display:'flex', alignItems:'center', gap:8, fontSize:13.5, fontWeight:800}}>
          {icon && <span style={{fontSize:15}}>{icon}</span>}{name}
        </div>
        {toggle && (
          <div
            onClick={() => toggle.onChange(!toggle.checked)}
            style={{
              display:'flex', alignItems:'center', gap:6, cursor:'pointer', userSelect:'none',
              background: included ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
              border:'1px solid rgba(255,255,255,0.35)', borderRadius:20, padding:'4px 10px 4px 8px',
              fontSize:11, fontWeight:700,
            }}
          >
            <span style={{
              width:14, height:14, borderRadius:4, display:'grid', placeItems:'center', fontSize:10, fontWeight:900,
              background: included ? '#fff' : 'transparent', color: included ? a.strong : 'transparent',
              border: included ? 'none' : '1.5px solid #fff', flex:'none',
            }}>{included ? '✓' : '·'}</span>
            {included ? (toggle.includeLabel || '이번 회차 포함') : (toggle.excludeLabel || '이번 회차 제외')}
          </div>
        )}
        <div style={{display:'flex', gap:3}}>
          <Tab id="summary" label="요약"/>
          <Tab id="detail" label="상세내역"/>
        </div>
      </div>

      {/* 본문 */}
      <div style={{padding:'12px 14px', background:a.soft}}>
        {/* 업체명 (탭과 무관하게 항상 표시) */}
        <div style={{display:'flex', alignItems:'center', gap:8, margin:'0 0 9px'}}>
          <label style={{fontSize:10.5, fontWeight:700, color:'var(--ink-3)', whiteSpace:'nowrap'}}>업체명</label>
          {vendorOptions && vendorOptions.length > 0 && (
            <select
              value={vendorOptions.includes(vendorValue) ? vendorValue : ''}
              onChange={e => { if (e.target.value) (onVendorPick || onVendorChange)?.(e.target.value); }}
              aria-label={`${vendorLabel || name} 저장된 업체 선택`}
              title="저장된 업체에서 선택"
              style={{flex:'0 1 170px', minWidth:0, padding:'6px 7px', border:`1px solid ${a.line}`, borderRadius:6, fontSize:12, background:'#fff', color:'var(--ink-2)', fontFamily:'inherit', cursor:'pointer'}}>
              <option value="">▼ 저장된 업체 선택</option>
              {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
          <input
            value={vendorValue || ''}
            onChange={e => onVendorChange?.(e.target.value)}
            placeholder={vendorPlaceholder || '업체명'}
            style={{flex:1, padding:'6px 9px', border:`1px solid ${a.line}`, borderRadius:6, fontSize:12, background:'#fff', color:'var(--ink-1)', outline:'none', fontFamily:'inherit'}}
          />
          {onSaveVendor && (
            <button
              type="button" onClick={onSaveVendor} disabled={savingVendor}
              style={{flex:'none', fontSize:10, fontWeight:800, padding:'6px 10px', borderRadius:6, border:`1px solid ${a.strong}`,
                background:'#fff', color:a.strong, whiteSpace:'nowrap', cursor: savingVendor ? 'default' : 'pointer'}}
            >{savingVendor ? '저장 중…' : `💾 ${vendorLabel || ''} 업체정보 저장`}</button>
          )}
        </div>
        {vendorDetail && (vendorDetail.ceo || vendorDetail.bizNo || vendorDetail.account) && (
          <div style={{display:'flex', flexWrap:'wrap', gap:'4px 14px', margin:'-3px 0 9px', padding:'6px 10px', background:'#fff', border:`1px dashed ${a.line}`, borderRadius:6, fontSize:11.5, color:'var(--ink-2)'}}>
            <span><span style={{color:'var(--ink-4)'}}>대표자</span> <b>{vendorDetail.ceo || '-'}</b></span>
            <span><span style={{color:'var(--ink-4)'}}>사업자번호</span> <b>{vendorDetail.bizNo || '-'}</b></span>
            <span><span style={{color:'var(--ink-4)'}}>계좌번호</span> <b>{[vendorDetail.bank, vendorDetail.account].filter(Boolean).join(' ') || '-'}</b>{vendorDetail.holder ? <span style={{color:'var(--ink-4)'}}> (예금주 {vendorDetail.holder})</span> : null}</span>
          </div>
        )}

        {onNoteChange && (
          <div style={{display:'flex', alignItems:'center', gap:8, margin:'0 0 9px'}}>
            <label style={{fontSize:10.5, fontWeight:700, color:'var(--ink-3)', whiteSpace:'nowrap'}}>비고</label>
            <input value={note || ''} onChange={e => onNoteChange(e.target.value)}
              placeholder="지급 사유 (예: 10월 3일 납품 예정 · 계약금 40% 지급)"
              aria-label={`${name} 비고`}
              style={{flex:1, padding:'6px 9px', border:`1px solid ${a.line}`, borderRadius:6, fontSize:12, background:'#fff', color:'var(--ink-1)', outline:'none', fontFamily:'inherit'}}/>
          </div>
        )}
        {tab === 'summary' ? (
          <>
            <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, padding:'9px 10px', background:'#fff', border:`1px solid ${a.line}`, borderRadius:6, marginBottom:8}}>
              {[['총액', total], ['지급액(금회)', curAmt], ['누계', finalCum], ['잔액', balance]].map(([lb, v]) => (
                <div key={lb}>
                  <span style={{display:'block', fontSize:9, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.02em', marginBottom:2}}>{lb}{lb === '총액' && totalNote ? <span style={{fontWeight:500, marginLeft:4}}>{totalNote}</span> : null}</span>
                  {lb === '총액' && onTotalChange ? (
                    <input type="number" value={totalAmount === '' || totalAmount == null ? '' : totalAmount}
                      onChange={e => onTotalChange(e.target.value)} aria-label={`${name} 총액`}
                      style={{width:'100%', maxWidth:130, padding:'3px 6px', border:`1px solid ${a.mid}`, borderRadius:5, fontSize:12, fontWeight:800, textAlign:'right', fontVariantNumeric:'tabular-nums', fontFamily:'inherit', background:'#fff'}}/>
                  ) : (
                    <span style={{fontWeight:800, fontSize:12, fontVariantNumeric:'tabular-nums', color: (lb==='지급액(금회)' && !included) ? 'var(--ink-4)' : 'var(--ink-1)'}}>{_fmtNum(v)}원</span>
                  )}
                </div>
              ))}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10}}>
              <span style={{fontSize:11, color:'var(--ink-3)', fontWeight:600}}>
                {included ? `회차 이력 ${histCount}건 (상세내역 탭에서 확인)` : '이번 회차 미포함 (포함하려면 위 토글을 체크)'}
              </span>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>금회 요청</span>
                {amountInput()}
              </div>
            </div>
          </>
        ) : (
          <>
            {(detailTitle || detailActions) && (
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, flexWrap:'wrap', gap:6}}>
                {detailTitle && <span style={{fontSize:11.5, fontWeight:800, color:'var(--ink-1)'}}>{detailTitle}</span>}
                {detailActions && <div style={{display:'flex', gap:6}}>{detailActions}</div>}
              </div>
            )}
            {detailBanner}
            {children}
            <div style={{fontSize:10.5, fontWeight:800, color:a.strong, margin:'10px 0 5px', paddingTop:8, borderTop:`1px dashed ${a.line}`}}>
              회차별 지급 이력 ({name} 총액 {_fmtNum(total)}원 기준)
            </div>
            {(() => {
              const G = '0.6fr 0.55fr 1.05fr 1.05fr 0.6fr 0.6fr 1.6fr 0.3fr';
              const inSt = { width:'100%', boxSizing:'border-box', padding:'3px 6px', border:'1px solid var(--line)', borderRadius:5, fontSize:11, fontFamily:'inherit', background:'#fff' };
              const tag = (txt, bg) => <span style={{fontSize:8.5, background:bg, color:'#fff', padding:'1px 6px', borderRadius:8, fontWeight:700}}>{txt}</span>;
              const editable = !!onManualRowsChange;
              const mrows = manualRows || [];
              const setRow = (i, k, v) => onManualRowsChange(mrows.map((m, idx) => idx === i ? { ...m, [k]: v } : m));
              const addRow = () => {
                const maxRound = Math.max(0, ...rows.map(r => Number(r.roundNo) || 0), ...mrows.map(m => Number(m.roundNo) || 0));
                onManualRowsChange([...mrows, { roundNo: String(maxRound + 1), docDate: new Date().toISOString().slice(0, 10), amount: '', note: '' }]);
              };
              return (<>
                <div style={{marginTop:0, padding:'8px 10px', background:'#fff', border:`1px solid ${a.line}`, borderRadius:6}}>
                  <div style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:9.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.02em', paddingBottom:4, borderBottom:`1px dashed ${a.line}`}}>
                    <span>구분</span><span>회차</span><span>지급일</span><span style={{textAlign:'right'}}>지급금액</span><span style={{textAlign:'right'}}>지급 %</span><span style={{textAlign:'right'}}>누적 %</span><span>메모</span><span/>
                  </div>
                  {rows.length === 0 && mrows.length === 0 && (
                    <div style={{textAlign:'center', padding:'6px 0', fontSize:11, color:'var(--ink-3)', opacity:0.7}}>이전 지급 이력 없음</div>
                  )}
                  {rows.map(r => (
                    <div key={'d' + (r.no || r.roundNo)} style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:11, padding:'4px 0', color:'var(--ink-3)', borderBottom:'1px dashed rgba(0,0,0,0.08)', alignItems:'center'}}>
                      <span>{r.manual ? tag('수기', 'var(--ink-3)') : tag('품의서', 'var(--green-800, #1f5c3a)')}</span>
                      <span>{r.roundNo}차</span>
                      <span>{_fmtDate(r.docDate)}</span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{_fmtNum(r.amount)}원</span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{r.pct.toFixed(1)}%</span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--ink-2)', fontWeight:700}}>{r.cumPct.toFixed(1)}%</span>
                      <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.note || ''}</span>
                      <span style={{textAlign:'right'}}>
                        {r.no && onDeleteRound && (
                          <button type="button" title={`${r.roundNo}차 저장 기록 삭제`} onClick={() => onDeleteRound(r)} disabled={deletingNo === r.no}
                            style={{border:'none', background:'none', cursor: deletingNo===r.no ? 'default':'pointer', color: deletingNo===r.no ? 'var(--ink-3)':'var(--neg, #B3452D)', fontSize:12, padding:'2px 4px', lineHeight:1}}>
                            {deletingNo === r.no ? '···' : '🗑'}
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  {mrows.map((m, i) => (
                    <div key={'m' + i} style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:11, padding:'3px 0', borderBottom:'1px dashed rgba(0,0,0,0.08)', alignItems:'center'}}>
                      <span>{tag('수기', 'var(--ink-3)')}</span>
                      <input type="number" min="1" value={m.roundNo} onChange={e => setRow(i, 'roundNo', e.target.value)} aria-label={`${name} 수기 ${i + 1} 회차`} style={{...inSt, textAlign:'right'}}/>
                      <input type="date" value={m.docDate} onChange={e => setRow(i, 'docDate', e.target.value)} aria-label={`${name} 수기 ${i + 1} 지급일`} style={inSt}/>
                      <input type="number" placeholder="지급금액" value={m.amount} onChange={e => setRow(i, 'amount', e.target.value)} aria-label={`${name} 수기 ${i + 1} 지급금액`} style={{...inSt, textAlign:'right', fontWeight:700}}/>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--ink-3)'}}>{manualCalc[i].pct.toFixed(1)}%</span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums', color:'var(--ink-2)', fontWeight:700}}>{manualCalc[i].cumPct.toFixed(1)}%</span>
                      <input type="text" placeholder="메모" value={m.note} onChange={e => setRow(i, 'note', e.target.value)} aria-label={`${name} 수기 ${i + 1} 메모`} style={inSt}/>
                      <span style={{textAlign:'right'}}>
                        <button type="button" title="이 줄 삭제 (저장해야 반영)" onClick={() => onManualRowsChange(mrows.filter((_, idx) => idx !== i))}
                          style={{border:'none', background:'none', cursor:'pointer', color:'var(--neg, #B3452D)', fontSize:13, fontWeight:700, padding:'2px 4px', lineHeight:1}}>×</button>
                      </span>
                    </div>
                  ))}
                  {curAmt > 0 && (
                    <div style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:11, padding:'6px 10px', margin:'2px -10px -1px', color:a.strong, fontWeight:800, background:`linear-gradient(90deg, ${a.line}88, transparent)`}}>
                      <span/>
                      <span>{currentRoundLabel || `${histCount + 1}차`}</span>
                      <span>금회 요청 <span style={{fontSize:8.5, background:'var(--pos)', color:'#fff', padding:'0 5px', borderRadius:8, marginLeft:2, letterSpacing:'0.03em', fontWeight:800}}>NEW</span></span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>+ {_fmtNum(curAmt)}원</span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>+ {curPct.toFixed(1)}%</span>
                      <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{finalPct.toFixed(1)}%</span>
                      <span/><span/>
                    </div>
                  )}
                </div>
                {editable && (
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginTop:6}}>
                    <button type="button" onClick={addRow}
                      style={{padding:'5px 12px', fontSize:11, fontWeight:600, background:'#fff', color:a.strong, border:`1px dashed ${a.mid}`, borderRadius:5, cursor:'pointer'}}>
                      + 지급이력 추가
                    </button>
                    <span style={{display:'flex', alignItems:'center', gap:8}}>
                      {manualSavedAt && <span style={{fontSize:10, color:'var(--ink-3)'}}>마지막 저장 {String(manualSavedAt).slice(5)}</span>}
                      <button type="button" onClick={onSaveManual} disabled={savingManual} aria-label={`${name} 지급이력 저장`}
                        style={{padding:'5px 12px', fontSize:11, fontWeight:700, background: savingManual ? 'var(--surface-2)' : 'var(--green-800, #1f5c3a)', color: savingManual ? 'var(--ink-3)' : '#fff', border:0, borderRadius:5, cursor: savingManual ? 'wait' : 'pointer'}}>
                        {savingManual ? '⏳ 저장 중...' : '💾 지급이력 저장'}
                      </button>
                    </span>
                  </div>
                )}
              </>);
            })()}
            {/* 진행바 */}
            <div style={{height:9, background:'#fff', border:`1px solid ${a.line}`, borderRadius:20, overflow:'hidden', position:'relative', margin:'10px 0 4px'}}>
              {prevBarPct > 0 && <div style={{position:'absolute', top:0, left:0, width:prevBarPct+'%', height:'100%', background:a.mid, borderRight:'1px solid #fff'}}/>}
              {curBarPct > 0 && <div style={{position:'absolute', top:0, left:prevBarPct+'%', width:curBarPct+'%', height:'100%', background:`linear-gradient(90deg, ${a.strong}, ${a.bright})`}}/>}
            </div>
            <div style={{display:'flex', justifyContent:'space-between', fontSize:9.5, color:'var(--ink-3)', fontVariantNumeric:'tabular-nums'}}>
              <span>0%</span>
              <span style={{color:'var(--ink-2)', fontWeight:700}}>누적 {finalPct.toFixed(1)}% ({_fmtNum(finalCum)}원)</span>
              <span>100% ({_fmtNum(total)})</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, paddingTop:8, marginTop:8, borderTop:`1px dashed ${a.line}`}}>
              <span style={{fontSize:11, color: balance > 0 ? 'var(--warn)' : 'var(--pos)', fontWeight:700}}>{balance > 0 ? `잔액 ${_fmtNum(balance)}원` : '완납'}</span>
              <div style={{display:'flex', alignItems:'center', gap:6}}>
                <span style={{fontSize:11, color:'var(--ink-3)'}}>금회 요청</span>
                {amountInput()}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
window.CategoryCard = CategoryCard;

// ═══════════════════════════════════════════════════════════════
// 3-2. 항목 한 줄(Linear 스타일) — v3.17
//   닫힌 상태: [포함 체크] ● 항목명 · 업체 · 두 톤 진행막대(지난 회차 진하게 / 이번 회차 연하게) · 기성률 · 금회 금액
//   펼친 상태: 기성 6칸(금액·전회 누계·금회·금회 누계·잔액·기성률) → 회차 이력(관리자 정정) →
//             업체·비고 → 내역서 → 지급이력 직접 입력(수기 표)
//   CategoryCard 와 같은 props 를 받으므로 화면 동작(저장·삭제·수기 이력 등)은 그대로다.
// ═══════════════════════════════════════════════════════════════
const EXPENSE_CAT_COLOR = { product:'#3E7CAE', install:'#2F7A55', etc:'#B8873B', commission:'#8862B8' };
window.EXPENSE_CAT_COLOR = EXPENSE_CAT_COLOR;

// 항목별 누계 계산 (화면 한 줄 · 상단 요약 · 결재 전 확인에서 같은 값 사용)
function computeCategoryStats({ totalAmount, rounds, manualRows, included, currentAmount }) {
  const total = Number(totalAmount) || 0;
  const docSum = (rounds || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const manualSum = (manualRows || []).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const prevSum = docSum + manualSum;
  const curAmt = included ? (Number(currentAmount) || 0) : 0;
  const finalCum = prevSum + curAmt;
  const pctOf = (v) => total > 0 ? (v / total * 100) : 0;
  const prevBarPct = Math.min(pctOf(prevSum), 100);
  return {
    total, prevSum, curAmt, finalCum,
    balance: total - finalCum,
    prevPct: pctOf(prevSum), finalPct: pctOf(finalCum),
    prevBarPct, curBarPct: Math.min(pctOf(curAmt), 100 - prevBarPct),
    over: total > 0 && finalCum > total + 0.5,
  };
}
window.computeCategoryStats = computeCategoryStats;

const _pctTxt = (v) => {
  const n = Number(v) || 0;
  return (Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n) : n.toFixed(1)) + '%';
};

const CategoryRow = ({
  catKey, name, color,
  open, onToggleOpen,
  toggle,
  vendorValue, onVendorChange, onSaveVendor, savingVendor, vendorPlaceholder, vendorLabel,
  vendorOptions, onVendorPick, vendorDetail,
  note, onNoteChange,
  totalAmount, rounds, currentAmount, onAmountChange, currentRoundLabel, currentDate, onDeleteRound, deletingNo,
  manualRows, onManualRowsChange, onSaveManual, savingManual, manualSavedAt,
  onTotalChange, totalNote,
  corrections, canCorrect, onCorrect,   // 회차 정정 (관리자) — onCorrect(payload) => Promise
  banner,                               // 총액 변경 안내 등 (펼친 영역 맨 위)
  detailTitle, detailActions, detailBanner,
  children,
}) => {
  const c = color || '#2F7A55';
  const light = c + '59';
  const included = !toggle || toggle.checked;
  const st = computeCategoryStats({ totalAmount, rounds, manualRows, included, currentAmount });
  const ORANGE = 'var(--danger)';
  const [editKey, setEditKey] = React.useState(null);
  const [draft, setDraft] = React.useState({ docDate: '', amount: '', reason: '' });
  const [err, setErr] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  // 지난 회차(품의서 + 수기)를 회차·날짜 순으로
  const past = [
    ...(rounds || []).map(r => ({ key: 'd' + (r.no || r.roundNo), kind: 'doc', no: r.no, roundNo: Number(r.roundNo) || 0, docDate: r.docDate || '', amount: Number(r.amount) || 0 })),
    ...(manualRows || []).map((m, i) => ({ key: 'm' + i, kind: 'manual', manualIndex: i, roundNo: Number(m.roundNo) || 0, docDate: m.docDate || '', amount: Number(m.amount) || 0 }))
      .filter(m => m.amount > 0),
  ].sort((x, y) => (x.roundNo - y.roundNo) || String(x.docDate).localeCompare(String(y.docDate)));
  const isCorrected = (p) => (corrections || []).some(k => (p.kind === 'doc' ? String(k.no) === String(p.no) && k.kind === 'doc' : k.kind === 'manual' && Number(k.roundNo) === p.roundNo));
  const editing = past.find(p => p.key === editKey) || null;

  const startEdit = (p) => {
    if (editKey === p.key) { setEditKey(null); setErr(''); return; }
    setEditKey(p.key); setErr('');
    setDraft({ docDate: String(p.docDate || '').slice(0, 10), amount: String(Math.round(p.amount)), reason: '' });
  };
  const saveEdit = async () => {
    if (!editing) return;
    const amt = Number(String(draft.amount).replace(/[^0-9]/g, ''));
    if (!String(draft.amount).replace(/[^0-9]/g, '')) { setErr('금액을 숫자로 입력해 주세요.'); return; }
    if (!draft.docDate) { setErr('지급일을 입력해 주세요.'); return; }
    if (!String(draft.reason).trim()) { setErr('정정 사유를 입력해 주세요.'); return; }
    if (amt === Math.round(editing.amount) && draft.docDate === String(editing.docDate).slice(0, 10)) { setErr('변경된 내용이 없습니다.'); return; }
    setBusy(true); setErr('');
    try {
      await onCorrect?.({
        category: catKey, kind: editing.kind, no: editing.no, manualIndex: editing.manualIndex, roundNo: editing.roundNo,
        beforeAmount: Math.round(editing.amount), beforeDate: String(editing.docDate).slice(0, 10),
        amount: amt, docDate: draft.docDate, reason: String(draft.reason).trim(),
      });
      setEditKey(null);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  };

  const amountText = included ? _fmtNum(st.curAmt) : ((Number(currentAmount) || 0) > 0 ? _fmtNum(currentAmount) : '-');
  const vendorTxt = String(vendorValue || '').trim();
  const delta = st.curAmt > 0 ? Math.round(st.finalPct) - Math.round(st.prevPct) : 0;

  return (
    <div className={'xr-row' + (open ? ' open' : '')}>
      <div className="xr-head">
        {toggle && (
          <button type="button" className="xr-check" aria-pressed={included}
            aria-label={`${name} ${included ? '이번 회차에서 제외' : '이번 회차에 포함'}`}
            title={included ? '이번 회차 포함 (누르면 제외)' : '이번 회차 제외 (누르면 포함)'}
            onClick={() => toggle.onChange(!toggle.checked)}>
            <span className="box">{included && (
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.4"><path d="m3.5 8.2 3 3 6-6.4"/></svg>
            )}</span>
          </button>
        )}
        <button type="button" className="xr-main" aria-expanded={!!open} onClick={onToggleOpen}>
          <span className="xr-dot" style={{background:c}}/>
          <span className="xr-name" style={{color: included ? undefined : 'var(--ink-4)'}}>{name}</span>
          <span className={'xr-vendor' + (included && !vendorTxt ? ' missing' : '')}>{vendorTxt || '업체 미지정'}</span>
          {!included && <span className="xr-tag">이번 회차 제외</span>}
          {st.over && <span className="xr-tag warn">금액 초과</span>}
          <span className="xr-prog" title={`지난 회차까지 ${_pctTxt(st.prevPct)} · 이번 회차 +${_pctTxt(st.finalPct - st.prevPct)} (금액 ${_fmtNum(st.total)}원)`}>
            <span className="xr-bar">
              <span style={{width: st.prevBarPct + '%', background:c}}/>
              <span style={{width: st.curBarPct + '%', background:light}}/>
            </span>
            <span className="xr-pct" style={{color: st.over ? ORANGE : 'var(--ink-1)'}}>{st.total > 0 ? _pctTxt(st.finalPct) : '-'}</span>
            <span className="xr-delta">{delta > 0 ? '+' + delta : ''}</span>
          </span>
          <span className="xr-amt" style={{color: !included ? 'var(--ink-4)' : (st.over ? ORANGE : 'var(--ink-1)'), textDecoration: included ? 'none' : 'line-through'}}>{amountText}</span>
          <svg className="xr-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" style={{transform: open ? 'rotate(90deg)' : 'none'}}><path d="m6 4 4 4-4 4"/></svg>
        </button>
      </div>

      {open && (
        <div className="xr-body">
          {banner}
          <div className="xr-panel">
            {/* 기성 6칸 */}
            <div className="xr-kpi6">
              <div>
                <span className="k">금액{totalNote ? <span style={{marginLeft:4}}>{totalNote}</span> : null}</span>
                {onTotalChange
                  ? <input type="number" value={totalAmount === '' || totalAmount == null ? '' : totalAmount} onChange={e => onTotalChange(e.target.value)} aria-label={`${name} 금액(총액)`}/>
                  : <span className="v">{_fmtNum(st.total)}</span>}
              </div>
              <div><span className="k">전회 누계</span><span className="v">{_fmtNum(st.prevSum)}</span></div>
              <div className="hl">
                <span className="k">금회 ({currentRoundLabel})</span>
                {included
                  ? <input type="number" value={currentAmount === 0 || currentAmount === '' || currentAmount == null ? '' : currentAmount} onChange={e => onAmountChange?.(e.target.value)} aria-label={`${name} 금회 요청액`}/>
                  : <span className="v" style={{color:'var(--ink-4)'}}>제외</span>}
              </div>
              <div><span className="k">금회 누계</span><span className="v" style={{fontWeight:600}}>{_fmtNum(st.finalCum)}</span></div>
              <div><span className="k">잔액</span><span className="v" style={{color: st.over ? ORANGE : undefined}}>{st.balance < 0 ? '-' + _fmtNum(-st.balance) : _fmtNum(st.balance)}</span></div>
              <div><span className="k">기성률</span><span className="v" style={{fontWeight:600, color: st.over ? ORANGE : undefined}}>{st.total > 0 ? _pctTxt(st.finalPct) : '-'}</span></div>
            </div>

            {/* 회차 이력 · 정정 */}
            <div className="xr-sec">
              <div className="xr-sec-h">
                <span><b>회차 이력</b>{canCorrect && past.length ? ' · 지난 회차를 누르면 정정' : ''}</span>
                <span>{canCorrect ? '정정 내역은 사유와 함께 기록됩니다' : '지난 회차 정정은 관리자만 가능'}</span>
              </div>
              <div className="xr-tl">
                {past.length === 0 && !(included && st.curAmt > 0) && (
                  <span style={{fontSize:12, color:'var(--ink-3)', padding:'4px 0'}}>지급 이력 없음</span>
                )}
                {past.map((p, idx) => {
                  const inner = (<>
                    <span className="dotline"><i style={{borderColor:c, background:c}}/><s/></span>
                    <span className="lb">{p.roundNo}차 <em>· {_fmtDate(p.docDate)}</em></span>
                    <span className="am">{_fmtNum(p.amount)}</span>
                    <span className="st">{p.kind === 'manual' ? '수기 기록' : '품의서'}{isCorrected(p) && <span className="fx">정정됨</span>}</span>
                  </>);
                  return canCorrect
                    ? <button key={p.key} type="button" className={'xr-node' + (editKey === p.key ? ' sel' : '')} aria-pressed={editKey === p.key} aria-label={`${p.roundNo}차 ${name} 정정`} onClick={() => startEdit(p)}>{inner}</button>
                    : <div key={p.key} className="xr-node">{inner}</div>;
                })}
                <div className="xr-node">
                  <span className="dotline"><i style={{borderColor: included ? c : 'var(--line-2)', background: included && st.curAmt > 0 ? light : '#fff'}}/></span>
                  <span className="lb">{currentRoundLabel} <em>· {_fmtDate(currentDate)}</em></span>
                  <span className="am" style={{fontWeight:600, color: included ? (st.over ? ORANGE : undefined) : 'var(--ink-4)'}}>{included ? _fmtNum(st.curAmt) : '제외'}</span>
                  <span className="st">이번 회차</span>
                </div>
              </div>

              {editing && (
                <div className="xr-edit" role="group" aria-label={`${editing.roundNo}차 ${name} 정정`}>
                  <div className="xr-sec-h">
                    <b>{editing.roundNo}차 · {name} 정정</b>
                    <span>현재 기록 {_fmtNum(editing.amount)}원 · 지급일 {String(editing.docDate).slice(0, 10) || '-'}</span>
                  </div>
                  <div className="g2">
                    <div>
                      <label htmlFor={`xe-date-${catKey}`}>지급일 {editing.kind === 'doc' && <span style={{color:'var(--ink-3)'}}>(이 회차 전 항목 공통)</span>}</label>
                      <input id={`xe-date-${catKey}`} type="date" value={draft.docDate} onChange={e => { setDraft(d => ({ ...d, docDate: e.target.value })); setErr(''); }}/>
                    </div>
                    <div>
                      <label htmlFor={`xe-amt-${catKey}`}>{name} 금액 (원)</label>
                      <input id={`xe-amt-${catKey}`} type="text" inputMode="numeric" value={draft.amount} onChange={e => { setDraft(d => ({ ...d, amount: e.target.value })); setErr(''); }} style={{textAlign:'right'}}/>
                    </div>
                  </div>
                  <div>
                    <label htmlFor={`xe-reason-${catKey}`}>정정 사유 <span style={{color:'var(--danger)'}}>*</span></label>
                    <input id={`xe-reason-${catKey}`} type="text" value={draft.reason} placeholder="예: 세금계산서 금액 재확인" onChange={e => { setDraft(d => ({ ...d, reason: e.target.value })); setErr(''); }}/>
                  </div>
                  {err && <div className="err" role="alert">{err}</div>}
                  <div className="acts">
                    <button type="button" className="xr-btn" onClick={() => { setEditKey(null); setErr(''); }} disabled={busy}>취소</button>
                    <button type="button" className="xr-btn pri" onClick={saveEdit} disabled={busy}>{busy ? '저장 중…' : '정정 저장'}</button>
                  </div>
                </div>
              )}

              {(corrections || []).length > 0 && (
                <div className="xr-log">
                  <span style={{fontSize:12, color:'var(--ink-3)'}}>정정 이력 {corrections.length}건</span>
                  {corrections.map((k, i) => (
                    <div key={i}>
                      <span className="c"><b style={{fontWeight:600}}>{k.roundNo}차</b> · {k.change}</span>
                      <span className="m">{k.reason}{k.by ? ` · ${k.by}` : ''}{k.at ? ` · ${k.at}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 업체 · 비고 */}
            <div className="xr-sec">
              <div className="xr-field">
                <label htmlFor={`xv-${catKey}`}>업체명</label>
                {vendorOptions && vendorOptions.length > 0 && (
                  <select value={vendorOptions.includes(vendorValue) ? vendorValue : ''} style={{flex:'0 1 170px'}}
                    onChange={e => { if (e.target.value) (onVendorPick || onVendorChange)?.(e.target.value); }}
                    aria-label={`${vendorLabel || name} 저장된 업체 선택`}>
                    <option value="">저장된 업체 선택</option>
                    {vendorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
                <input id={`xv-${catKey}`} value={vendorValue || ''} onChange={e => onVendorChange?.(e.target.value)} placeholder={vendorPlaceholder || '업체명'} style={{flex:1, minWidth:140}}/>
                {onSaveVendor && (
                  <button type="button" className="xr-btn" onClick={onSaveVendor} disabled={savingVendor}>{savingVendor ? '저장 중…' : '업체정보 저장'}</button>
                )}
              </div>
              {vendorDetail && (vendorDetail.ceo || vendorDetail.bizNo || vendorDetail.account) && (
                <div className="xr-vd">
                  <span><span>대표자</span> {vendorDetail.ceo || '-'}</span>
                  <span><span>사업자번호</span> {vendorDetail.bizNo || '-'}</span>
                  <span><span>계좌</span> {[vendorDetail.bank, vendorDetail.account].filter(Boolean).join(' ') || '-'}{vendorDetail.holder ? ` (예금주 ${vendorDetail.holder})` : ''}</span>
                </div>
              )}
              {onNoteChange && (
                <div className="xr-field">
                  <label htmlFor={`xn-${catKey}`}>비고</label>
                  <input id={`xn-${catKey}`} value={note || ''} onChange={e => onNoteChange(e.target.value)} placeholder="지급 사유 (예: 10월 3일 납품 예정 · 계약금 40% 지급)" style={{flex:1, minWidth:160}}/>
                </div>
              )}
            </div>

            {/* 내역서 */}
            <div className="xr-sec">
              {(detailTitle || detailActions) && (
                <div className="xr-sec-h">
                  {detailTitle && <b>{detailTitle}</b>}
                  {detailActions && <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>{detailActions}</div>}
                </div>
              )}
              {detailBanner}
              <div className="xr-scroll"><div className="xr-scroll-in">{children}</div></div>
            </div>

            {/* 지급이력 직접 입력 (수기) · 저장된 회차 삭제 */}
            <div className="xr-sec">
              <details className="xr-manual">
                <summary>지급이력 직접 입력 · 저장 회차 삭제 ({(rounds || []).length + (manualRows || []).length}건)</summary>
                <div style={{marginTop:8}}>
                  {(() => {
                    const G = '0.6fr 0.55fr 1.05fr 1.05fr 1.6fr 0.3fr';
                    const inSt = { width:'100%', boxSizing:'border-box', padding:'3px 6px', border:'1px solid var(--line)', borderRadius:5, fontSize:11.5, fontFamily:'inherit', background:'#fff' };
                    const mrows = manualRows || [];
                    const setRow = (i, k, v) => onManualRowsChange(mrows.map((m, idx) => idx === i ? { ...m, [k]: v } : m));
                    const addRow = () => {
                      const maxRound = Math.max(0, ...(rounds || []).map(r => Number(r.roundNo) || 0), ...mrows.map(m => Number(m.roundNo) || 0));
                      onManualRowsChange([...mrows, { roundNo: String(maxRound + 1), docDate: new Date().toISOString().slice(0, 10), amount: '', note: '' }]);
                    };
                    return (<>
                      <div style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:11, color:'var(--ink-3)', paddingBottom:4, borderBottom:'1px solid var(--line)'}}>
                        <span>구분</span><span>회차</span><span>지급일</span><span style={{textAlign:'right'}}>지급금액</span><span>메모</span><span/>
                      </div>
                      {(rounds || []).map(r => (
                        <div key={'d' + (r.no || r.roundNo)} style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:12, padding:'5px 0', borderBottom:'1px solid var(--line)', alignItems:'center', color:'var(--ink-2)'}}>
                          <span>품의서</span><span>{r.roundNo}차</span><span>{_fmtDate(r.docDate)}</span>
                          <span style={{textAlign:'right', fontVariantNumeric:'tabular-nums'}}>{_fmtNum(r.amount)}</span>
                          <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{r.note || ''}</span>
                          <span style={{textAlign:'right'}}>
                            {r.no && onDeleteRound && (
                              <button type="button" title={`${r.roundNo}차 저장 기록 삭제`} aria-label={`${r.roundNo}차 저장 기록 삭제`} onClick={() => onDeleteRound(r)} disabled={deletingNo === r.no}
                                style={{border:'none', background:'none', cursor:'pointer', color:'var(--danger)', fontSize:12, padding:'2px 4px'}}>{deletingNo === r.no ? '···' : '삭제'}</button>
                            )}
                          </span>
                        </div>
                      ))}
                      {mrows.map((m, i) => (
                        <div key={'m' + i} style={{display:'grid', gridTemplateColumns:G, gap:6, fontSize:12, padding:'4px 0', borderBottom:'1px solid var(--line)', alignItems:'center'}}>
                          <span>수기</span>
                          <input type="number" min="1" value={m.roundNo} onChange={e => setRow(i, 'roundNo', e.target.value)} aria-label={`${name} 수기 ${i + 1} 회차`} style={{...inSt, textAlign:'right'}}/>
                          <input type="date" value={m.docDate} onChange={e => setRow(i, 'docDate', e.target.value)} aria-label={`${name} 수기 ${i + 1} 지급일`} style={inSt}/>
                          <input type="number" placeholder="지급금액" value={m.amount} onChange={e => setRow(i, 'amount', e.target.value)} aria-label={`${name} 수기 ${i + 1} 지급금액`} style={{...inSt, textAlign:'right', fontWeight:600}}/>
                          <input type="text" placeholder="메모" value={m.note} onChange={e => setRow(i, 'note', e.target.value)} aria-label={`${name} 수기 ${i + 1} 메모`} style={inSt}/>
                          <span style={{textAlign:'right'}}>
                            <button type="button" title="이 줄 삭제 (저장해야 반영)" aria-label={`${name} 수기 ${i + 1} 줄 삭제`} onClick={() => onManualRowsChange(mrows.filter((_, idx) => idx !== i))}
                              style={{border:'none', background:'none', cursor:'pointer', color:'var(--danger)', fontSize:14, padding:'2px 4px'}}>×</button>
                          </span>
                        </div>
                      ))}
                      {onManualRowsChange && (
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, marginTop:8, flexWrap:'wrap'}}>
                          <button type="button" className="xr-btn" onClick={addRow}>+ 지급이력 추가</button>
                          <span style={{display:'flex', alignItems:'center', gap:8}}>
                            {manualSavedAt && <span style={{fontSize:11, color:'var(--ink-3)'}}>마지막 저장 {String(manualSavedAt).slice(5)}</span>}
                            <button type="button" className="xr-btn pri" onClick={onSaveManual} disabled={savingManual} aria-label={`${name} 지급이력 저장`}>{savingManual ? '저장 중…' : '지급이력 저장'}</button>
                          </span>
                        </div>
                      )}
                    </>);
                  })()}
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
window.CategoryRow = CategoryRow;

// ═══════════════════════════════════════════════════════════════
// 4. 전회 기성 드롭박스 (개선안 ①)
// ═══════════════════════════════════════════════════════════════
// 저장된 회차의 항목별(설치비/제품대/기타경비/영업수수료) 금액을 계산.
// v3부터는 각 카드의 "금회 요청" 입력값(품목표 합계와 독립적으로 저장됨)을 우선 사용하고,
// 그 값이 없는 과거(v2 이전) 저장 건은 품목표(JSON) 합계로 계산해 하위 호환한다.
function _roundBreakdown(r) {
  const sum = (json, key) => {
    try {
      const items = JSON.parse(json || '[]') || [];
      return items.reduce((s, it) => {
        if (key === 'amount') return s + (Number(it.amount) || 0);
        return s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
      }, 0);
    } catch { return 0; }
  };
  const hasNum = (v) => v !== undefined && v !== null && v !== '';
  // 그 회차에 '이번 회차 포함'을 끈 항목은 지급하지 않은 것 → 0 (품목표는 참고용으로만 저장된 것)
  const inc = (flag, dflt) => flag === undefined ? dflt : !!flag;
  return {
    install: inc(r.includeInstall, true) ? (Number(r.amount) || 0) : 0, // 설치비(금회 요청금액)는 별도 보관된 값
    product: !inc(r.includeProduct, false) ? 0 : (hasNum(r.productAmount) ? Number(r.productAmount) || 0 : sum(r.productItems_JSON, 'qty')),
    etc: !inc(r.includeEtc, false) ? 0 : (hasNum(r.etcAmount) ? Number(r.etcAmount) || 0 : sum(r.expenseItems_JSON, 'amount')),
    commission: !inc(r.includeCommission, false) ? 0 : (hasNum(r.commissionAmount) ? Number(r.commissionAmount) || 0 : sum(r.commissionItems_JSON, 'amount')),
  };
}

const PreviousRoundDropdown = ({ history, selected, onSelect }) => {
  // 삭제(취소) 처리된 회차는 목록에서 제외 — "설치비 기성" 표와 동일한 기준
  const rounds = (history || []).filter(r => r.status !== 'cancelled');

  return (
    <div>
      <label style={_labelSt}>전회 기성 이력</label>
      <select
        value={selected || ''}
        onChange={e => onSelect(e.target.value)}
        style={{..._inputSt}}>
        <option value="">▼ 이전 회차 선택 (신규 회차)</option>
        {rounds.map((r, idx) => (
          <option key={r.no || idx} value={r.no || idx}>
            {r.roundNo}차 · {_fmtDate(r.docDate)} · {_fmtNum(r.amount)}원{r.manual ? ' · (수기)' : ''}{r.note ? ` · ${r.note}` : ''}
          </option>
        ))}
      </select>
      {selected && (() => {
        const found = rounds.find(r => String(r.no || rounds.indexOf(r)) === String(selected));
        if (!found) return null;
        const bd = _roundBreakdown(found);
        return (
          <div style={{marginTop:6, padding:'8px 10px', background:'var(--blue-50, #EEF4F8)', border:'1px solid #C8DBE5', borderRadius:6, fontSize:11, color:'#1a5490', lineHeight:1.6}}>
            <b>{found.roundNo}차 기성 지출 내역</b> · 지출일 <b>{_fmtDate(found.docDate)}</b> · 지급금액 <b>{_fmtNum(found.amount)}원</b>
            {found.pdfLink && <> · PDF: <a href={found.pdfLink} target="_blank" rel="noreferrer" style={{color:'var(--blue-500, #1a5490)'}}>열기 ↗</a></>}
            <div style={{marginTop:4, display:'flex', flexWrap:'wrap', gap:'4px 10px', fontSize:10.5, color:'#3a6a8a'}}>
              <span>설치비 {_fmtNum(bd.install)}원</span>
              {bd.product > 0 && <span>· 제품대 {_fmtNum(bd.product)}원</span>}
              {bd.etc > 0 && <span>· 기타경비 {_fmtNum(bd.etc)}원</span>}
              {bd.commission > 0 && <span>· 영업수수료 {_fmtNum(bd.commission)}원</span>}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 5. 아이템 테이블 (설치비/제품/기타경비/수수료 공통) — 개선안 ③⑥
// ═══════════════════════════════════════════════════════════════
// mode: 'install' | 'product' | 'simple' (기타/수수료)
const ItemsTable = ({ mode, items, setItems, onImport, importing, filename, onClear, showReceipt = false }) => {
  const isInstall = mode === 'install';
  const isProduct = mode === 'product';
  const isSimple = mode === 'simple';

  const emptyRow = isInstall
    ? { name:'', spec:'', qty:'', unit:'식', unitPrice:'', note:'' }
    : isProduct
    ? { name:'', model:'', unit:'대', qty:'', unitPrice:'', listPrice:'', dcRate:0 }
    : { name:'', unit:'', qty:'', amount:'', note:'', receipt: null };

  const updateItem = (i, k, v) => setItems(items.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i));
  const addItem = () => setItems([...items, {...emptyRow}]);

  const total = isSimple
    ? items.reduce((s, r) => s + (Number(r.amount)||0), 0)
    : isInstall
    ? items.reduce((s, r) => s + (Number(r.qty)||0) * (Number(r.unitPrice)||0), 0)
    : items.reduce((s, r) => s + (Number(r.qty)||0) * (Number(r.unitPrice)||0), 0);

  // 파일 첨부 상태 표시
  const receiptPill = (r, idx) => {
    if (!r.receipt) {
      return (
        <button
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*,application/pdf';
            input.onchange = (e) => {
              const f = e.target.files?.[0];
              if (f) updateItem(idx, 'receipt', { name: f.name, size: f.size, type: f.type, _localFile: f });
            };
            input.click();
          }}
          style={{padding:'3px 10px', background:'#fff', color:'var(--ink-3)', border:'1px dashed var(--line-2)', borderRadius:11, fontSize:10.5, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap'}}>
          📎 첨부
        </button>
      );
    }
    const isImg = (r.receipt.type || '').startsWith('image/');
    const isDrive = !!r.receipt.driveId;
    return (
      <div style={{
        display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px 3px 6px',
        background: isDrive ? 'var(--blue-50, #EEF4F8)' : 'var(--green-50)',
        border: `1px solid ${isDrive ? '#C8DBE5' : '#C9DFD1'}`,
        borderRadius:11, fontSize:10.5, fontWeight:600,
        color: isDrive ? '#1a5490' : 'var(--green-800)',
        maxWidth:'100%',
      }}>
        <span style={{fontSize:11}}>{isImg ? '🧾' : '📄'}</span>
        <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:90}} title={r.receipt.name}>
          {r.receipt.name}
        </span>
        {isDrive && <span style={{fontSize:9, background:'#1a5490', color:'#fff', padding:'0 5px', borderRadius:6}}>Drive</span>}
        <span onClick={() => updateItem(idx, 'receipt', null)} style={{cursor:'pointer', color:'var(--danger)', fontWeight:800, marginLeft:2}}>×</span>
      </div>
    );
  };

  return (
    <div style={{marginBottom:14}}>
      {/* 임포트 배너 (파일명) */}
      {filename && (
        <div style={{marginBottom:6, padding:'6px 10px', background:'var(--bronze-50, #FBF6E9)', border:'1px solid #ECD9AE', borderRadius:6, fontSize:11, color:'var(--bronze-800, #8f6d3a)', display:'flex', alignItems:'center', gap:6}}>
          <span>📄</span>
          <span style={{flex:1, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{filename}</span>
          {onClear && (
            <button onClick={onClear} style={{border:0, background:'transparent', color:'var(--danger)', cursor:'pointer', fontSize:14, fontWeight:700}}>×</button>
          )}
        </div>
      )}

      <table style={{width:'100%', borderCollapse:'collapse', fontSize:12, background:'#fff', border:'1px solid var(--line)', borderRadius:8, overflow:'hidden'}}>
        <thead>
          <tr style={{background:'var(--surface-2)', fontSize:10.5, color:'var(--ink-3)', fontWeight:700, letterSpacing:'0.03em'}}>
            {isInstall && (
              <>
                <th style={{padding:'8px 10px', textAlign:'left', width:'34%'}}>품명</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'12%'}}>규격</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'8%'}}>수량</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'8%'}}>단위</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'14%'}}>단가</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'14%'}}>금액</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'10%'}}>비고</th>
                <th style={{width:'40px'}}/>
              </>
            )}
            {isProduct && (
              <>
                <th style={{padding:'8px 10px', textAlign:'left', width:'26%'}}>품명</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'14%'}}>모델</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'6%'}}>단위</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'6%'}}>수량</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'14%'}}>출고가</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'6%'}}>DC%</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'14%'}}>재료비 단가</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'14%'}}>재료비</th>
                <th style={{width:'40px'}}/>
              </>
            )}
            {isSimple && (
              <>
                <th style={{padding:'8px 10px', textAlign:'left', width:'30%'}}>품명</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'8%'}}>단위</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'7%'}}>수량</th>
                <th style={{padding:'8px 10px', textAlign:'right', width:'14%'}}>금액</th>
                <th style={{padding:'8px 10px', textAlign:'left', width:'25%'}}>비고</th>
                {showReceipt && <th style={{padding:'8px 10px', textAlign:'left', width:'16%'}}>증빙</th>}
                <th style={{width:'40px'}}/>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => {
            const cellSt = { padding:'4px 6px', border:0, borderBottom:'1px solid var(--line)' };
            const inSt = { width:'100%', padding:'4px 6px', fontSize:12, border:'1px solid transparent', background:'transparent', outline:'none', fontFamily:'inherit', borderRadius:4 };
            const nSt = { ...inSt, textAlign:'right', fontVariantNumeric:'tabular-nums' };
            return (
              <tr key={i}>
                {isInstall && (
                  <>
                    <td style={cellSt}><input style={inSt} value={r.name||''} onChange={e => updateItem(i, 'name', e.target.value)}/></td>
                    <td style={cellSt}><input style={inSt} value={r.spec||''} onChange={e => updateItem(i, 'spec', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.qty||''} onChange={e => updateItem(i, 'qty', e.target.value)}/></td>
                    <td style={cellSt}><input style={inSt} value={r.unit||''} onChange={e => updateItem(i, 'unit', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.unitPrice||''} onChange={e => updateItem(i, 'unitPrice', e.target.value)}/></td>
                    <td style={{...cellSt, textAlign:'right', paddingRight:10, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>
                      {_fmtNum((Number(r.qty)||0) * (Number(r.unitPrice)||0))}
                    </td>
                    <td style={cellSt}><input style={inSt} value={r.note||''} onChange={e => updateItem(i, 'note', e.target.value)}/></td>
                    <td style={cellSt}><button onClick={() => removeItem(i)} style={{width:20, height:20, padding:0, border:0, background:'transparent', color:'var(--danger)', cursor:'pointer', fontSize:14}}>×</button></td>
                  </>
                )}
                {isProduct && (
                  <>
                    <td style={cellSt}><input style={inSt} value={r.name||''} onChange={e => updateItem(i, 'name', e.target.value)}/></td>
                    <td style={cellSt}><input style={inSt} value={r.model||''} onChange={e => updateItem(i, 'model', e.target.value)}/></td>
                    <td style={cellSt}><input style={inSt} value={r.unit||''} onChange={e => updateItem(i, 'unit', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.qty||''} onChange={e => updateItem(i, 'qty', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.listPrice||''} onChange={e => updateItem(i, 'listPrice', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.dcRate ? (r.dcRate*100).toFixed(0) : ''} onChange={e => updateItem(i, 'dcRate', (Number(e.target.value)||0)/100)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.unitPrice||''} onChange={e => updateItem(i, 'unitPrice', e.target.value)}/></td>
                    <td style={{...cellSt, textAlign:'right', paddingRight:10, fontWeight:600, fontVariantNumeric:'tabular-nums'}}>
                      {_fmtNum((Number(r.qty)||0) * (Number(r.unitPrice)||0))}
                    </td>
                    <td style={cellSt}><button onClick={() => removeItem(i)} style={{width:20, height:20, padding:0, border:0, background:'transparent', color:'var(--danger)', cursor:'pointer', fontSize:14}}>×</button></td>
                  </>
                )}
                {isSimple && (
                  <>
                    <td style={cellSt}><input style={inSt} value={r.name||''} onChange={e => updateItem(i, 'name', e.target.value)}/></td>
                    <td style={cellSt}><input style={inSt} value={r.unit||''} onChange={e => updateItem(i, 'unit', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.qty||''} onChange={e => updateItem(i, 'qty', e.target.value)}/></td>
                    <td style={cellSt}><input style={nSt} value={r.amount||''} onChange={e => updateItem(i, 'amount', e.target.value)}/></td>
                    <td style={cellSt}><input style={inSt} value={r.note||''} onChange={e => updateItem(i, 'note', e.target.value)}/></td>
                    {showReceipt && <td style={cellSt}>{receiptPill(r, i)}</td>}
                    <td style={cellSt}><button onClick={() => removeItem(i)} style={{width:20, height:20, padding:0, border:0, background:'transparent', color:'var(--danger)', cursor:'pointer', fontSize:14}}>×</button></td>
                  </>
                )}
              </tr>
            );
          })}
          {/* 합계 행 */}
          <tr style={{background:'var(--green-25, #F7FAF7)', fontWeight:700}}>
            <td colSpan={isInstall ? 5 : isProduct ? 7 : 3} style={{padding:'8px 10px', textAlign:'right', borderTop:'2px solid var(--green-800, #22503A)'}}>
              합계
            </td>
            <td style={{padding:'8px 10px', textAlign:'right', paddingRight:10, borderTop:'2px solid var(--green-800, #22503A)', fontVariantNumeric:'tabular-nums'}}>
              {_fmtNum(total)}원
            </td>
            {isInstall && <td colSpan={2} style={{borderTop:'2px solid var(--green-800, #22503A)'}}/>}
            {isProduct && <td colSpan={2} style={{borderTop:'2px solid var(--green-800, #22503A)'}}/>}
            {isSimple && showReceipt && (
              <td colSpan={2} style={{padding:'8px 10px', textAlign:'right', color:'var(--ink-3)', fontWeight:600, fontSize:11, borderTop:'2px solid var(--green-800, #22503A)'}}>
                📎 증빙 {items.filter(r => r.receipt).length}건
              </td>
            )}
            {isSimple && !showReceipt && <td style={{borderTop:'2px solid var(--green-800, #22503A)'}}/>}
          </tr>
        </tbody>
      </table>

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6}}>
        <button
          onClick={addItem}
          style={{padding:'5px 12px', fontSize:11.5, fontWeight:600, background:'#fff', color:'var(--green-800)', border:'1px dashed #C9DFD1', borderRadius:6, cursor:'pointer'}}>
          + 항목 추가
        </button>
        {onImport && (
          <div style={{display:'flex', gap:6}}>
            <button
              onClick={() => onImport('drive')}
              disabled={!!importing}
              style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='drive' ? 'var(--surface-2)' : '#f0f7fb', color:'#1a5490', border:'1px solid #c8dbe5', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
              {importing === 'drive' ? '⏳...' : '📁 Drive에서 가져오기'}
            </button>
            <button
              onClick={() => onImport('local')}
              disabled={!!importing}
              style={{padding:'5px 10px', fontSize:11, fontWeight:600, background: importing==='local' ? 'var(--surface-2)' : '#fff', color:'var(--ink-2)', border:'1px solid var(--line)', borderRadius:5, cursor: importing ? 'wait' : 'pointer'}}>
              {importing === 'local' ? '⏳...' : '💻 PC 파일'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 6. 섹션 헤더 (일관 스타일)
// ═══════════════════════════════════════════════════════════════
const SectionHead = ({ title, badge, actions, note }) => (
  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:8, borderBottom:'2px solid var(--green-800, #22503A)', marginBottom:12}}>
    <div style={{display:'flex', alignItems:'baseline', gap:8}}>
      <div style={{fontSize:13.5, fontWeight:700, color:'var(--ink-1)'}}>{title}</div>
      {badge && <span style={{padding:'2px 8px', fontSize:10, fontWeight:700, background:'var(--green-50)', color:'var(--green-800)', border:'1px solid #C9DFD1', borderRadius:10}}>{badge}</span>}
      {note && <span style={{fontSize:11, color:'var(--ink-3)'}}>{note}</span>}
    </div>
    {actions && <div style={{display:'flex', gap:4}}>{actions}</div>}
  </div>
);

// ─── 전역 노출 ───
window.ExpenseContractHeader = ExpenseContractHeader;
window.SubcontractorBlock = SubcontractorBlock;
window.PreviousRoundDropdown = PreviousRoundDropdown;
window.ItemsTable = ItemsTable;
window.SectionHead = SectionHead;
// 저장된 회차 하나(history row)에서 항목별(설치비/제품대/기타경비/영업수수료) 금액을 뽑아내는 헬퍼.
// PreviousRoundDropdown 내부에서 쓰던 걸 모달(modal-expense.jsx)에서도 항목별 회차 이력을
// 구성할 때 재사용할 수 있도록 window 로 노출.
window.expenseRoundBreakdown = _roundBreakdown;

// 계약에 입력된 도급업체명 → 등록업체(도급업체 시트/거래처관리, 사업자번호 보유) 자동 매칭
window.matchSubcontractor = (data, raw) => {
  const txt = String(raw || '').replace(_telRe, '').trim();
  const nk = _normName(txt);
  if (nk.length < 2) return null;
  const g = buildSubcontractorOptions(data || {});
  const cands = [...g.reg, ...g.fromClients, ...g.fromContracts, ...g.others].filter(o => o.bizNo);
  return cands.find(o => _normName(o.name) === nk)
      || cands.find(o => { const ok = _normName(o.name); return ok.length >= 2 && (nk.includes(ok) || ok.includes(nk)); })
      || null;
};
