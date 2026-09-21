/* ═══════════════════════════════════════════════════════════════
   공통 유틸 · 아이콘 · Sidebar · Topbar
═══════════════════════════════════════════════════════════════ */
const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;

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

const Sidebar = ({ current, onNav, counts }) => {
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

      <div className="nav-label">데이터 소스</div>
      <nav className="nav">
        <a href="https://docs.google.com/spreadsheets/d/1rUq7yu0pHrp-rln4JjGIslIib_d033ZuzwLD6odtORs/edit"
           target="_blank" rel="noreferrer">
          <span className="ico" style={{width:16,height:16,borderRadius:4,background:'#217346',display:'inline-flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:9,fontWeight:800}}>X</span>
          계약관리_v1.3
          <span style={{marginLeft:'auto',color:'#6E7369',opacity:.6}}><Icon name="external" size={11}/></span>
        </a>
      </nav>

      <div className="side-foot">
        <div className="me">
          <div className="avatar">이</div>
          <div>
            <div className="who">이상규 이사</div>
            <div className="role">주식회사 삼성이엔지</div>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ─── Topbar ───
const Topbar = ({ crumbs, onSearch, searchValue, onAddContract, source, onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); }
    catch (e) { /* toast handled elsewhere */ }
    finally { setRefreshing(false); }
  };
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
          {source === 'api' ? '실시간 연동' : source === 'cache' ? '캐시 (오프라인)' : '샘플 데이터'}
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
      <button className="icon-btn" aria-label="알림">
        <Icon name="bell" size={16}/>
        <span className="dot"></span>
      </button>
      <button className="btn-primary" onClick={onAddContract}>
        <Icon name="plus" size={14} stroke={2.2}/>
        신규 계약
      </button>
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
  NAV,
});
