import { useEffect } from 'react'

let _toastSeq = 0

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

// ---------------------------------------------------------------------------
// Auto-dismiss hook used inside each toast row
// ---------------------------------------------------------------------------

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      className={`toast toast--${toast.type}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        marginBottom: '0.5rem',
        borderRadius: '6px',
        background: toast.type === 'success' ? '#d1fae5'
          : toast.type === 'error' ? '#fee2e2'
          : '#dbeafe',
        color: toast.type === 'success' ? '#065f46'
          : toast.type === 'error' ? '#991b1b'
          : '#1e40af',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        minWidth: '260px',
        maxWidth: '400px',
      }}
    >
      <span>{toast.message}</span>
      <button
        aria-label="Dismiss toast"
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          marginLeft: '1rem',
          fontWeight: 'bold',
          color: 'inherit',
          fontSize: '1rem',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Container — renders the queue in a fixed overlay
// ---------------------------------------------------------------------------

export default function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div
      role="status"
      aria-label="Notifications"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
      }}
    >
      {toasts.map(t => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helper to create a new toast item
// ---------------------------------------------------------------------------

export function makeToast(message: string, type: ToastType = 'success'): ToastItem {
  return { id: `toast-${++_toastSeq}`, message, type }
}
