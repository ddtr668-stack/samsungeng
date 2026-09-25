/* ═══════════════════════════════════════════════════════════════
   설정 · 사용자(담당자) 관리 — 관리자 전용
   가입 승인 · 권한(관리자/편집/조회) · 본인 담당만 · 비밀번호 초기화 · 사용 중지
═══════════════════════════════════════════════════════════════ */

const USER_ROLE_OPTIONS = [
  { value:'admin',  label:'관리자', desc:'모든 기능 + 사용자·설정 관리' },
  { value:'editor', label:'편집',   desc:'계약·수금·지출 조회 및 등록/수정' },
  { value:'viewer', label:'조회',   desc:'조회만 가능' },
];
const USER_STATUS_LABEL = { pending:'승인 대기', active:'사용 중', disabled:'사용 중지' };

const UserManagement = () => {
  const toast = window.useToast ? window.useToast() : null;
  const [users, setUsers] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const myId = (getAuthUser() || {}).id;

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient.listUsers();
      setUsers(r.users || []);
    } catch (e) {
      toast?.('사용자 목록을 불러오지 못했습니다: ' + e.message, 'error');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const update = async (u, patch, okMsg) => {
    setBusyId(u.id);
    try {
      const r = await apiClient.updateUser(u.id, patch);
      setUsers(list => list.map(x => x.id === u.id ? r.user : x));
      if (okMsg) toast?.(okMsg, 'success');
    } catch (e) {
      toast?.('변경 실패: ' + e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = (u) => {
    const pw = window.prompt(`${u.name}(${u.id}) 의 새 비밀번호 (6자 이상)`);
    if (pw == null) return;
    if (pw.length < 6) { toast?.('비밀번호는 6자 이상으로 해주세요', 'error'); return; }
    update(u, { password: pw }, '비밀번호를 초기화했습니다. 새 비밀번호를 본인에게 알려주세요.');
  };

  const remove = async (u) => {
    if (!window.confirm(`${u.name}(${u.id}) 계정을 삭제할까요?\n(계약의 담당자 이름은 그대로 남습니다)`)) return;
    setBusyId(u.id);
    try {
      await apiClient.deleteUser(u.id);
      setUsers(list => list.filter(x => x.id !== u.id));
      toast?.('삭제했습니다', 'success');
    } catch (e) {
      toast?.('삭제 실패: ' + e.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const pending = (users || []).filter(u => u.status === 'pending').length;
  const cell = { padding:'10px 8px', borderBottom:'1px solid var(--line)', fontSize:12.5, verticalAlign:'middle' };
  const head = { ...cell, fontSize:11.5, fontWeight:700, color:'var(--ink-3)', textAlign:'left', whiteSpace:'nowrap' };
  const selSt = { fontSize:12.5, padding:'4px 6px', border:'1px solid var(--line)', borderRadius:6, background:'#fff' };
  const btn = { fontSize:11.5, padding:'4px 9px', borderRadius:6, border:'1px solid var(--line)', background:'#fff', cursor:'pointer', whiteSpace:'nowrap' };

  return (
    <div className="card pad-lg">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:12,flexWrap:'wrap'}}>
        <CardHead
          title={<>사용자 · 담당자 관리{pending > 0 && <span style={{marginLeft:8,fontSize:11,fontWeight:700,color:'#fff',background:'var(--danger)',padding:'2px 8px',borderRadius:999}}>승인 대기 {pending}</span>}</>}
          sub="회원가입 신청을 승인하고 사람마다 권한을 정합니다. 계약의 담당자는 이 이름으로 지정됩니다."
        />
        <button className="btn-ghost" onClick={load} disabled={loading}>{loading ? '불러오는 중…' : '새로고침'}</button>
      </div>

      <div style={{fontSize:11.5,color:'var(--ink-3)',lineHeight:1.7,margin:'4px 0 12px'}}>
        {USER_ROLE_OPTIONS.map(r => <div key={r.value}><b>{r.label}</b> · {r.desc}</div>)}
        <div><b>본인 담당만</b> · 체크하면 본인이 담당자인 계약만 보이고 수정할 수 있습니다 (관리자는 항상 전체)</div>
      </div>

      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}>
          <thead>
            <tr>
              <th style={head}>이름</th>
              <th style={head}>부서</th>
              <th style={head}>전화번호</th>
              <th style={head}>아이디</th>
              <th style={head}>상태</th>
              <th style={head}>권한</th>
              <th style={head}>본인 담당만</th>
              <th style={head}></th>
            </tr>
          </thead>
          <tbody>
            {users === null && <tr><td colSpan="8" style={{...cell,color:'var(--ink-4)'}}>불러오는 중…</td></tr>}
            {users && users.length === 0 && <tr><td colSpan="8" style={{...cell,color:'var(--ink-4)'}}>사용자가 없습니다.</td></tr>}
            {(users || []).map(u => {
              const busy = busyId === u.id;
              const isMe = u.id === myId;
              return (
                <tr key={u.id} style={u.status === 'pending' ? {background:'var(--bronze-50)'} : u.status === 'disabled' ? {opacity:.55} : undefined}>
                  <td style={{...cell,fontWeight:700}}>{u.name}{isMe && <span style={{fontSize:10.5,color:'var(--ink-4)',marginLeft:4}}>(나)</span>}</td>
                  <td style={cell}>{u.dept || '—'}</td>
                  <td style={{...cell,whiteSpace:'nowrap'}}>{u.phone ? <a href={`tel:${u.phone}`} style={{color:'inherit'}}>{u.phone}</a> : '—'}</td>
                  <td style={{...cell,fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace',fontSize:12}}>{u.id}</td>
                  <td style={{...cell,whiteSpace:'nowrap'}}>{USER_STATUS_LABEL[u.status] || u.status}</td>
                  <td style={cell}>
                    <select style={selSt} value={u.role} disabled={busy || isMe} onChange={e => update(u, { role: e.target.value }, '권한을 변경했습니다')}>
                      {USER_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td style={{...cell,textAlign:'center'}}>
                    <input type="checkbox" checked={!!u.ownOnly} disabled={busy || u.role === 'admin'}
                      onChange={e => update(u, { ownOnly: e.target.checked }, e.target.checked ? '본인 담당 계약만 보이게 했습니다' : '전체 계약이 보이게 했습니다')}/>
                  </td>
                  <td style={{...cell,textAlign:'right'}}>
                    <div style={{display:'inline-flex',gap:5}}>
                      {u.status === 'pending' && (
                        <button style={{...btn,background:'var(--green-800)',color:'#fff',borderColor:'var(--green-800)'}} disabled={busy}
                          onClick={() => update(u, { status:'active' }, `${u.name} 님을 승인했습니다`)}>승인</button>
                      )}
                      {u.status === 'active' && !isMe && (
                        <button style={btn} disabled={busy} onClick={() => update(u, { status:'disabled' }, '사용을 중지했습니다')}>사용 중지</button>
                      )}
                      {u.status === 'disabled' && (
                        <button style={btn} disabled={busy} onClick={() => update(u, { status:'active' }, '다시 사용하게 했습니다')}>다시 사용</button>
                      )}
                      <button style={btn} disabled={busy} onClick={() => resetPassword(u)}>비밀번호 초기화</button>
                      {!isMe && <button style={{...btn,color:'var(--danger)'}} disabled={busy} onClick={() => remove(u)}>{u.status === 'pending' ? '거절' : '삭제'}</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

Object.assign(window, { UserManagement });
