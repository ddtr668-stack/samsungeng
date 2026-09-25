/* ═══════════════════════════════════════════════════════════════
   공통 유틸 · 아이콘 · Sidebar · Topbar
═══════════════════════════════════════════════════════════════ */
const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;

// ─── 계약 표시 번호: 담당자별 번호 "이상규-001" (없으면 전체 번호 #0106) ───
const contractCode = (c) => {
  if (!c) return '';
  if (c.managerCode) return c.managerCode;
  return '#' + String(c.no || '').padStart(4, '0');
};

// ─── 담당자·기간으로 계약을 걸러 요약·통계를 다시 계산 (대시보드·리포트·각 목록 화면 공통) ───
// range: { from:'YYYY-MM' | '', to:'YYYY-MM' | '' } — 계약일 기준 기간
const buildDashboardView = (data, manager, range) => {
  const from = (range && range.from) || '';
  const to = (range && range.to) || '';
  if ((!manager || manager === 'all') && !from && !to) return data;
  const contracts = data.contracts.filter(c => {
    if (manager && manager !== 'all' && c.manager !== manager) return false;
    if (from || to) {
      const ym = (c.contractDate || '').substring(0, 7);
      if (!ym) return false;
      if (from && ym < from) return false;
      if (to && ym > to) return false;
    }
    return true;
  });
  const summary = { totalAmount:0, paidAmount:0, balance:0, profit:0, statusCounts:{ 완료:0, 진행중:0, 미진행:0 } };
  const cat = {}, mon = {};
  contracts.forEach(c => {
    summary.totalAmount += c.totalAmount || 0; summary.paidAmount += c.paidAmount || 0;
    summary.balance += c.balance || 0; summary.profit += c.profit || 0;
    if (c.status === '완료') summary.statusCounts.완료++;
    else if (c.status === '진행중') summary.statusCounts.진행중++;
    else summary.statusCounts.미진행++;
    const k = c.category || '기타';
    cat[k] = cat[k] || { name:k, count:0, total:0, paid:0, balance:0, profit:0 };
    cat[k].count++; cat[k].total += c.totalAmount || 0; cat[k].paid += c.paidAmount || 0; cat[k].balance += c.balance || 0; cat[k].profit += c.profit || 0;
    if (c.contractDate) {
      const ym = c.contractDate.substring(0, 7);
      mon[ym] = mon[ym] || { month:ym, count:0, total:0, paid:0, balance:0, profit:0 };
      mon[ym].count++; mon[ym].total += c.totalAmount || 0; mon[ym].paid += c.paidAmount || 0; mon[ym].balance += c.balance || 0; mon[ym].profit += c.profit || 0;
    }
  });
  return {
    ...data,
    contracts,
    summary,
    categoryStats: Object.values(cat).map(v => ({ ...v, marginRate: v.total ? v.profit / v.total : 0 })).sort((a, b) => b.total - a.total),
    monthlyStats: Object.keys(mon).sort().map(k => mon[k]),
    topBalance: contracts.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 10),
    clientStats: (() => {
      const m = {};
      contracts.forEach(c => {
        const k = c.client;
        m[k] = m[k] || { name:k, count:0, total:0, paid:0, balance:0, categories:{} };
        m[k].count++; m[k].total += c.totalAmount || 0; m[k].paid += c.paidAmount || 0; m[k].balance += c.balance || 0;
        m[k].categories[c.category] = true;
      });
      return Object.values(m).map(v => ({ ...v, categories: Object.keys(v.categories) })).sort((a, b) => b.total - a.total);
    })(),
  };
};

// ─── 숫자 포맷 ───
const fmtKRW = (n) => {
  if (n == null || isNaN(n)) return '—';
  return Math.round(n).toLocaleString('ko-KR');
};
const fmtKRW억 = (n) => {
  if (n == null || isNaN(n) || n === 0) return '0';
  const 억 = n / 1e8;
  if (Math.abs(억) >= 1) return 억.toFixed(2).replace(/\.?0+$/,'') + '억';
  const 만 = n / 1e4;
  return Math.round(만).toLocaleString('ko-KR') + '만';
};
const fmtPct = (n, digits=1) => {
  if (n == null || isNaN(n)) return '—';
  return (n * 100).toFixed(digits) + '%';
};
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
};
const fmtDateShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.getMonth()+1}/${d.getDate()}`;
};
const fmtMonth = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getFullYear()).slice(2)}년 ${d.getMonth()+1}월`;
};
const fmtMonthShort = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `'${String(d.getFullYear()).slice(2)}.${String(d.getMonth()+1).padStart(2,'0')}`;
};

// ─── 아이콘 ───
const Icon = ({ name, size = 16, className = '', stroke = 1.7 }) => {
  const s = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:'currentColor', strokeWidth:stroke, strokeLinecap:'round', strokeLinejoin:'round', className };
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
    contracts: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/><path d="M8 13h6M8 17h4"/></>,
    receivable: <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/></>,
    clients: <><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    expense: <><path d="M3 3h4l2.5 14h9L21 7H6"/><circle cx="10" cy="21" r="1.5"/><circle cx="18" cy="21" r="1.5"/></>,
    reports: <><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8Z"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    filter: <><path d="M3 6h18M6 12h12M10 18h4"/></>,
    download: <><path d="M12 3v13m0 0-5-5m5 5 5-5"/><path d="M4 20h16"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    chevronDown: <><path d="m6 9 6 6 6-6"/></>,
    chevronLeft: <><path d="m15 18-6-6 6-6"/></>,
    chevronRight: <><path d="m9 6 6 6-6 6"/></>,
    check: <><path d="m4 12 5 5L20 6"/></>,
    file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/></>,
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></>,
    edit: <><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></>,
    alert: <><path d="M12 2 2 20h20L12 2Z"/><path d="M12 9v5M12 18h.01"/></>,
    checkCircle: <><circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/></>,
    xCircle: <><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></>,
    trending: <><path d="M23 6l-9.5 9.5L8 10l-7 7"/><path d="M17 6h6v6"/></>,
    coin: <><circle cx="12" cy="12" r="10"/><path d="M12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9m0-5v10"/></>,
    tax: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    dot: <><circle cx="12" cy="12" r="4"/></>,
    external: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></>,
    print: <><path d="M6 9V2h12v7"/><rect x="4" y="9" width="16" height="9" rx="2"/><path d="M6 14h12v7H6z"/></>,
    more: <><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="12" cy="18" r="1.5"/></>,
  };
  // ─── React.createElement 로 직접 작성한 아이콘 (Babel Standalone 파싱 이슈 회피) ───
  const rce = React.createElement;
  paths.close = rce(React.Fragment, null,
    rce('path', { d: 'M18 6 6 18M6 6l12 12' })
  );
  paths.x = paths.close;
  paths.eye = rce(React.Fragment, null,
    rce('path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z' }),
    rce('circle', { cx: 12, cy: 12, r: 3 })
  );
  paths.folder = rce(React.Fragment, null,
    rce('path', { d: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z' })
  );
  paths.link = rce(React.Fragment, null,
    rce('path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }),
    rce('path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' })
  );
  return <svg {...s}>{paths[name] || null}</svg>;
};

// ─── Sidebar ───
const NAV = [
  { id:'dashboard', label:'대시보드', icon:'dashboard' },
  { id:'contracts', label:'계약 관리', icon:'contracts', countKey:'total' },
  { id:'receivable', label:'미수금 관리', icon:'receivable', countKey:'receivable', warn:true },
  { id:'clients', label:'거래처 관리', icon:'clients', countKey:'clients' },
  { id:'expense', label:'지출·기성 관리', icon:'expense' },
  { id:'reports', label:'리포트·통계', icon:'reports' },
  { id:'settings', label:'설정', icon:'settings' },
];

const Sidebar = ({ current, onNav, counts, onLogout, managers, activeManager, onPickManager }) => {
  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark" aria-label="주식회사 삼성이엔지">
          <svg viewBox="0 0 32 32" width="20" height="20" fill="none">
            <path d="M8 5v22M24 5v22M8 11h16M8 21h16" stroke="#F0EDE3" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <div className="brand-name">주식회사 삼성이엔지<span style={{color:'#6E7369',fontWeight:500,fontSize:11,marginLeft:5}}>SamsungENG</span></div>
          <div className="brand-sub">냉난방·설비 계약관리</div>
        </div>
      </div>

      <div className="nav-label">Workspace</div>
      <nav className="nav">
        {NAV.map(item => (
          <a key={item.id}
             className={current === item.id ? 'active' : ''}
             onClick={(e) => { e.preventDefault(); onNav(item.id); }}
             href="#">
            <span className="ico"><Icon name={item.icon} size={16}/></span>
            {item.label}
            {item.countKey && counts?.[item.countKey] != null && (
              <span className="count" style={item.warn && counts[item.countKey] > 0 ? {background:'#7A2A1E',color:'#fff'} : undefined}>{counts[item.countKey]}</span>
            )}
          </a>
        ))}
      </nav>

      {/* 담당자별 보기: 누르면 대시보드·계약·미수금·거래처·지출·리포트가 모두 그 담당자 기준으로 바뀜 */}
      {managers && managers.length > 1 && (
        <>
          <div className="nav-label">담당자</div>
          <nav className="nav" style={{maxHeight:220,overflowY:'auto'}}>
            {[{ name:'all', label:'전체', count: managers.reduce((a, m) => a + m.count, 0) }]
              .concat(managers.map(m => ({ name: m.name, label: m.name, count: m.count })))
              .map(m => (
                <a key={m.name} href="#"
                   className={(activeManager || 'all') === m.name ? 'active' : ''}
                   title={m.name === 'all' ? '모든 담당자 보기' : `${m.label} 담당 계약만 보기`}
                   onClick={(e) => { e.preventDefault(); onPickManager?.(m.name); }}>
                  <span className="ico" style={{display:'inline-flex',alignItems:'center',justifyContent:'center'}}>
                    {m.name === 'all'
                      ? <Icon name="clients" size={16}/>
                      : <span style={{width:16,height:16,borderRadius:'50%',background:'rgba(240,237,227,.14)',fontSize:9.5,fontWeight:800,display:'inline-flex',alignItems:'center',justifyContent:'center'}}>{m.label.slice(0, 1)}</span>}
                  </span>
                  {m.label}
                  <span className="count">{m.count}</span>
                </a>
              ))}
          </nav>
        </>
      )}

      <div className="side-foot">
        <div className="me">
          {(() => {
            const u = (typeof getAuthUser === 'function' && getAuthUser()) || {};
            const nm = u.name || '이상규';
            return (<>
              <div className="avatar">{nm.slice(0, 1)}</div>
              <div>
                <div className="who">{nm}{u.roleLabel ? <span style={{fontSize:10.5,fontWeight:500,opacity:.7,marginLeft:5}}>{u.roleLabel}</span> : null}</div>
                <div className="role">{u.dept || '주식회사 삼성이엔지'}</div>
              </div>
            </>);
          })()}
        </div>
        {onLogout && (
          <button type="button" onClick={onLogout}
            style={{marginTop:10,width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid rgba(110,115,105,.35)',background:'transparent',color:'inherit',fontSize:12,cursor:'pointer',opacity:.85}}>
            로그아웃
          </button>
        )}
      </div>
    </aside>
  );
};

// ─── Topbar ───
const Topbar = ({ crumbs, onSearch, searchValue, onAddContract, source, onRefresh, viewManager, onClearManager }) => {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); }
    catch (e) { /* toast handled elsewhere */ }
    finally { setRefreshing(false); }
  };

  // ─── 변경 이력 (🔔) : 최근 10건 · 어떤 항목이 어떻게 바뀌었는지 표시 ───
  const [logOpen, setLogOpen] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logItems, setLogItems] = useState(null);
  const [logError, setLogError] = useState(null);
  const logBoxRef = useRef(null);

  const toggleLog = async () => {
    const next = !logOpen;
    setLogOpen(next);
    if (next && window.hasApiUrl && window.hasApiUrl()) {
      setLogLoading(true);
      setLogError(null);
      try {
        const r = await window.apiClient.changeLog();
        setLogItems(r.log || []);
      } catch (e) {
        setLogError(e.message || '변경 이력을 불러오지 못했습니다.');
      } finally {
        setLogLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!logOpen) return;
    const onDocClick = (e) => { if (logBoxRef.current && !logBoxRef.current.contains(e.target)) setLogOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [logOpen]);

  return (
    <div className="topbar">
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="sep">·</span>}
            {i === crumbs.length - 1 ? <b>{c}</b> : c}
          </span>
        ))}
      </div>

      {source && (
        <span className={`source-badge ${source}`} style={{marginLeft:8}}>
          <span className="b-dot"></span>
          {source === 'api' ? '실시간 연동' : source === 'cache' ? '캐시 (오프라인)' : source === 'empty' ? '미연결' : '샘플 데이터'}
        </span>
      )}
      {viewManager && viewManager !== 'all' && (
        <span style={{marginLeft:8,display:'inline-flex',alignItems:'center',gap:6,padding:'3px 6px 3px 10px',borderRadius:999,background:'var(--bronze-50)',border:'1px solid #ECD9AE',color:'var(--bronze-800)',fontSize:11.5,fontWeight:700}}>
          {viewManager} 담당 보기
          <button type="button" onClick={onClearManager} title="전체 담당자 보기"
            style={{border:0,background:'transparent',color:'inherit',cursor:'pointer',fontSize:13,lineHeight:1,padding:'0 2px'}}>✕</button>
        </span>
      )}

      <div className="search">
        <span className="sicon"><Icon name="search" size={14} stroke={2}/></span>
        <input placeholder="계약번호 · 프로젝트 · 거래처 검색"
               value={searchValue || ''}
               onChange={e => onSearch && onSearch(e.target.value)}/>
      </div>
      {onRefresh && (
        <button className={'icon-btn' + (refreshing ? ' loading' : '')} aria-label="새로고침" onClick={handleRefresh} title="구글 시트에서 다시 불러오기">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={refreshing ? {animation:'spin 1s linear infinite'} : {}}>
            <path d="M3 12a9 9 0 0 1 15.7-6L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-15.7 6L3 16"/>
            <path d="M3 21v-5h5"/>
          </svg>
        </button>
      )}
      <div style={{position:'relative'}} ref={logBoxRef}>
        <button className="icon-btn" aria-label="변경 이력" onClick={toggleLog}>
          <Icon name="bell" size={16}/>
          <span className="dot"></span>
        </button>
        {logOpen && (
          <div style={{
            position:'absolute', top:'calc(100% + 8px)', right:0, width:360, maxHeight:440,
            overflowY:'auto', background:'#fff', border:'1px solid var(--line)', borderRadius:12,
            boxShadow:'0 14px 34px rgba(0,0,0,0.16)', zIndex:200, padding:'6px 0'
          }}>
            <div style={{padding:'8px 16px 10px', fontSize:12.5, fontWeight:700, color:'var(--ink-1)', borderBottom:'1px solid var(--line)'}}>
              최근 변경 내역 · 최대 10건
            </div>
            {!(window.hasApiUrl && window.hasApiUrl()) && (
              <div style={{padding:'16px', fontSize:12, color:'var(--ink-3)'}}>API URL이 설정되지 않았습니다. 설정 화면에서 먼저 연결해주세요.</div>
            )}
            {window.hasApiUrl && window.hasApiUrl() && logLoading && (
              <div style={{padding:'16px', fontSize:12, color:'var(--ink-3)'}}>불러오는 중…</div>
            )}
            {window.hasApiUrl && window.hasApiUrl() && !logLoading && logError && (
              <div style={{padding:'16px', fontSize:12, color:'var(--danger)'}}>{logError}</div>
            )}
            {window.hasApiUrl && window.hasApiUrl() && !logLoading && !logError && logItems && logItems.length === 0 && (
              <div style={{padding:'16px', fontSize:12, color:'var(--ink-3)'}}>변경 이력이 없습니다.</div>
            )}
            {window.hasApiUrl && window.hasApiUrl() && !logLoading && !logError && logItems && logItems.map((it, i) => (
              <div key={i} style={{padding:'10px 16px', borderBottom: i < logItems.length - 1 ? '1px solid var(--line)' : 'none'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
                  <span style={{fontSize:10.5, fontWeight:700, color:'var(--green-800)', background:'var(--green-50)', padding:'2px 8px', borderRadius:999, whiteSpace:'nowrap'}}>{it.category}</span>
                  <span style={{fontSize:10.5, color:'var(--ink-4)', whiteSpace:'nowrap'}}>{it.time}</span>
                </div>
                <div style={{fontSize:12.5, fontWeight:600, color:'var(--ink-1)', marginTop:4}}>{it.target}</div>
                <div style={{fontSize:11.5, color:'var(--ink-3)', marginTop:2, lineHeight:1.5, wordBreak:'break-word'}}>{it.summary}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {(typeof canEdit !== 'function' || canEdit()) && (
        <button className="btn-primary" onClick={onAddContract}>
          <Icon name="plus" size={14} stroke={2.2}/>
          신규 계약
        </button>
      )}
    </div>
  );
};

// ─── Pagination hook ───
const usePagination = (items, pageSize) => {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [items.length, totalPages, page]);
  const paged = items.slice((page-1)*pageSize, page*pageSize);
  return { page, setPage, totalPages, paged, start: (page-1)*pageSize + 1, end: Math.min(items.length, page*pageSize) };
};

// ─── Pager component ───
const Pager = ({ page, totalPages, onChange }) => {
  const pages = [];
  const win = 2;
  let start = Math.max(1, page - win);
  let end = Math.min(totalPages, page + win);
  if (page <= win) end = Math.min(totalPages, 1 + win*2);
  if (page >= totalPages - win) start = Math.max(1, totalPages - win*2);
  for (let i = start; i <= end; i++) pages.push(i);
  return (
    <div className="pager">
      <button disabled={page === 1} onClick={() => onChange(Math.max(1, page-1))}>‹</button>
      {start > 1 && <><button onClick={() => onChange(1)}>1</button>{start > 2 && <span style={{padding:'0 4px',color:'var(--ink-4)'}}>…</span>}</>}
      {pages.map(p => (
        <button key={p} className={p === page ? 'on' : ''} onClick={() => onChange(p)}>{p}</button>
      ))}
      {end < totalPages && <>{end < totalPages-1 && <span style={{padding:'0 4px',color:'var(--ink-4)'}}>…</span>}<button onClick={() => onChange(totalPages)}>{totalPages}</button></>}
      <button disabled={page === totalPages} onClick={() => onChange(Math.min(totalPages, page+1))}>›</button>
    </div>
  );
};

// ─── Amount cell ───
const Amt = ({ v, unit = '원', className = '', showZero = false }) => {
  if (v == null || (v === 0 && !showZero)) return <span className="amt mute">—</span>;
  return <span className={`amt ${className}`}>{fmtKRW(v)}<span className="krw">{unit}</span></span>;
};

// ─── Status pill ───
const StatusPill = ({ status }) => {
  const map = {
    '완료': { cls:'done', label:'완료' },
    '진행중': { cls:'prog', label:'진행중' },
    '미진행': { cls:'wait', label:'미진행' },
  };
  const m = map[status] || { cls:'wait', label: status || '미입력' };
  return <span className={`pill ${m.cls}`}>{m.label}</span>;
};

// ─── Category tag ───
const CatTag = ({ cat }) => <span className={`cat ${cat}`}>{cat}</span>;

// ─── Progress bar mini ───
const MiniProgress = ({ value, showText = true }) => {
  const pct = Math.round((value || 0) * 100);
  const cls = pct === 100 ? 'done' : pct === 0 ? 'wait' : '';
  return (
    <span className="mini-bar">
      <span className="track"><span className={`fill ${cls}`} style={{width: pct + '%'}}/></span>
      {showText && <span>{pct}%</span>}
    </span>
  );
};

// ─── Section card head ───
const CardHead = ({ title, sub, right }) => (
  <div className="card-head">
    <div>
      <div className="card-title">{title}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </div>
    {right}
  </div>
);

// Global export
Object.assign(window, {
  useState, useEffect, useMemo, useRef, useCallback, Fragment,
  fmtKRW, fmtKRW억, fmtPct, fmtDate, fmtDateShort, fmtMonth, fmtMonthShort,
  Icon, Sidebar, Topbar, usePagination, Pager,
  Amt, StatusPill, CatTag, MiniProgress, CardHead,
  NAV, contractCode, buildDashboardView,
});
