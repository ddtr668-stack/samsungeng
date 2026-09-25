/* ═══════════════════════════════════════════════════════════════
   모달 · 토스트 시스템
═══════════════════════════════════════════════════════════════ */

const Modal = ({ open, onClose, title, subtitle, children, footer, width = 'default' }) => {
  // 드래그 이동 + 리사이즈 지원
  const [pos, setPos] = useState({ x: 0, y: 0 });     // 이동 오프셋
  const [size, setSize] = useState(null);              // 사용자 조정 크기 { w, h }
  const [maximized, setMaximized] = useState(false);   // 최대화 여부
  const [savedRect, setSavedRect] = useState(null);    // 최대화 복원용
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, ox: 0, oy: 0 });
  const modalElRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // 모달이 열릴 때 상태 초기화
  useEffect(() => {
    if (open) {
      setPos({ x: 0, y: 0 });
      setSize(null);
      setMaximized(false);
      setSavedRect(null);
    }
  }, [open]);

  // ─── 드래그 이동 ───
  const onHeadMouseDown = (e) => {
    // 헤드 안의 버튼 / 입력 요소는 드래그 대상 아님
    if (e.target.closest('button, input, textarea, select, a, [contenteditable]')) return;
    if (maximized) return;
    e.preventDefault();
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const onMove = (ev) => {
      if (!dragRef.current.dragging) return;
      setPos({
        x: dragRef.current.ox + (ev.clientX - dragRef.current.sx),
        y: dragRef.current.oy + (ev.clientY - dragRef.current.sy),
      });
    };
    const onUp = () => {
      dragRef.current.dragging = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── 리사이즈 (우하단 핸들) ───
  const onResizeMouseDown = (e) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    const el = modalElRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;
    const sx = e.clientX;
    const sy = e.clientY;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';

    const onMove = (ev) => {
      const dw = ev.clientX - sx;
      const dh = ev.clientY - sy;
      setSize({
        w: Math.max(360, startW + dw),
        h: Math.max(240, startH + dh),
      });
    };
    const onUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── 최대화/복원 토글 ───
  const toggleMaximize = () => {
    if (maximized) {
      // 복원
      if (savedRect) {
        setPos({ x: savedRect.x, y: savedRect.y });
        setSize({ w: savedRect.w, h: savedRect.h });
      } else {
        setPos({ x: 0, y: 0 });
        setSize(null);
      }
      setMaximized(false);
    } else {
      // 최대화 진입 - 현재 상태 저장
      const el = modalElRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        setSavedRect({ x: pos.x, y: pos.y, w: rect.width, h: rect.height });
      }
      setMaximized(true);
    }
  };

  // ─── 초기 크기/위치 리셋 ───
  const resetSize = () => {
    setPos({ x: 0, y: 0 });
    setSize(null);
    setMaximized(false);
    setSavedRect(null);
  };

  if (!open) return null;
  const wCls = width === 'narrow' ? ' modal-narrow' : width === 'wide' ? ' modal-wide' : '';

  // 스타일 계산
  const modalStyle = maximized
    ? { position: 'fixed', top: '2vh', left: '2vw', right: '2vw', bottom: '2vh',
        width: '96vw', maxWidth: '96vw', height: '96vh', maxHeight: '96vh',
        transform: 'none' }
    : {
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        ...(size ? { width: size.w + 'px', height: size.h + 'px', maxWidth: 'none', maxHeight: 'none' } : {}),
      };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={modalElRef} className={'modal' + wCls} style={modalStyle}>
        <div
          className="modal-head"
          onMouseDown={onHeadMouseDown}
          style={{ cursor: maximized ? 'default' : 'grab', userSelect: 'none' }}
          title={maximized ? '' : '드래그하여 이동'}
        >
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={resetSize}
              aria-label="원래 크기로"
              title="원래 크기 · 위치로 복원"
              className="modal-icon-btn"
              style={{
                width: 26, height: 26, padding: 0, border: '1px solid var(--line)',
                background: '#fff', borderRadius: 5, cursor: 'pointer', color: 'var(--ink-3)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12,
              }}>
              ↺
            </button>
            <button
              onClick={toggleMaximize}
              aria-label={maximized ? '축소' : '최대화'}
              title={maximized ? '기본 크기로 복원' : '최대화 (Esc 로 닫기)'}
              className="modal-icon-btn"
              style={{
                width: 26, height: 26, padding: 0, border: '1px solid var(--line)',
                background: '#fff', borderRadius: 5, cursor: 'pointer', color: 'var(--ink-3)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>
              {maximized ? '❐' : '⛶'}
            </button>
            <button className="modal-close" onClick={onClose} aria-label="닫기">
              <Icon name="xCircle" size={16}/>
            </button>
          </div>
        </div>
        <div className="modal-body" style={size || maximized ? { flex: 1, minHeight: 0 } : undefined}>
          {children}
        </div>
        {footer && <div className="modal-foot">{footer}</div>}
        {/* 우하단 리사이즈 핸들 */}
        {!maximized && (
          <div
            onMouseDown={onResizeMouseDown}
            title="드래그하여 크기 조정"
            style={{
              position: 'absolute', right: 0, bottom: 0,
              width: 18, height: 18, cursor: 'nwse-resize',
              zIndex: 10,
              background: 'linear-gradient(135deg, transparent 0%, transparent 50%, var(--ink-4, #9AA096) 50%, var(--ink-4, #9AA096) 60%, transparent 60%, transparent 70%, var(--ink-4, #9AA096) 70%, var(--ink-4, #9AA096) 80%, transparent 80%)',
              opacity: 0.5,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; }}
          />
        )}
      </div>
    </div>
  );
};

// ─── Toast ───
const ToastContext = React.createContext(null);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={'toast ' + (t.kind === 'success' ? 'success' : t.kind === 'error' ? 'error' : '')}>
            {t.kind === 'success' && <Icon name="checkCircle" size={16}/>}
            {t.kind === 'error' && <Icon name="alert" size={16}/>}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const useToast = () => React.useContext(ToastContext);

// ─── 확인 다이얼로그 ───
const useConfirm = () => {
  return useCallback((message) => Promise.resolve(window.confirm(message)), []);
};

Object.assign(window, {
  Modal, ToastProvider, useToast, useConfirm
});
