// ---------------------------------------------------------------------------
// Spinner — inline CSS-animated spinner.
// No third-party dependency.
// ---------------------------------------------------------------------------

const spinKeyframes = `
@keyframes spinner-spin {
  to { transform: rotate(360deg); }
}
`

const _inserted = { current: false }

function ensureStyles() {
  if (_inserted.current) return
  _inserted.current = true
  const s = document.createElement('style')
  s.textContent = spinKeyframes
  document.head.appendChild(s)
}

interface SpinnerProps {
  size?: string
}

export default function Spinner({ size = '1em' }: SpinnerProps) {
  ensureStyles()
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spinner-spin 0.7s linear infinite',
        verticalAlign: 'middle',
        marginRight: '0.4em',
      }}
    />
  )
}
