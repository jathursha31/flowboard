import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastType = 'success' | 'error';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastOptions {
  action?: ToastAction | null;
  duration?: number;
}
export type ToastFn = (message: string, type?: ToastType, options?: ToastOptions) => void;
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action: ToastAction | null;
}

// 🔔 Chinna popup messages ("✅ Task saved!") ellaa idathula irunthum kaatta
const ToastContext = createContext<ToastFn>(() => {});

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  // toast('Saved!')  |  toast('Oops', 'error')
  // 🆕 toast('Task deleted', 'success', { action: { label: 'Undo', onClick }, duration: 5000 })
  const toast = useCallback<ToastFn>(
    (message, type = 'success', { action = null, duration = 3000 } = {}) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-3), { id, message, type, action }]); // max 4 ore nerathula
      setTimeout(() => remove(id), duration); // ⏰ konja neram apram thaane pogum
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.type}`}>
            <span aria-hidden="true">{t.type === 'error' ? '⚠️' : '✅'}</span>
            <span>{t.message}</span>
            {/* 🆕 ↩️ Undo maari action button */}
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action?.onClick();
                  remove(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast__close" onClick={() => remove(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// 🪝 const toast = useToast(); toast('Task added');
export function useToast() {
  return useContext(ToastContext);
}
