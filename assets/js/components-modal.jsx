/* ═══════════════════════════════════════════════════════════════
   모달 · 토스트 시스템
═══════════════════════════════════════════════════════════════ */

const Modal = ({ open, onClose, title, subtitle, children, footer, width = 'default' }) => {
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

  if (!open) return null;
  const wCls = width === 'narrow' ? ' modal-narrow' : width === 'wide' ? ' modal-wide' : '';

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + wCls}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {subtitle && <div className="modal-sub">{subtitle}</div>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="닫기">
            <Icon name="xCircle" size={16}/>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
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
