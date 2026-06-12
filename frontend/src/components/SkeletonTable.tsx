// ---------------------------------------------------------------------------
// SkeletonTable — animated placeholder rows for the lead results table.
// Uses only CSS animation — no third-party library.
// ---------------------------------------------------------------------------

const SKELETON_ROW_COUNT = 6

const pulseKeyframes = `
@keyframes skeleton-pulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.4; }
  100% { opacity: 1; }
}
`

function SkeletonCell({ width = '80%' }: { width?: string }) {
  return (
    <td>
      <div className="lp-skeleton-bar" style={{ width }} />
    </td>
  )
}

function SkeletonRow() {
  return (
    <tr>
      <SkeletonCell width="70%" />
      <SkeletonCell width="60%" />
      <SkeletonCell width="55%" />
      <SkeletonCell width="30%" />
      <SkeletonCell width="75%" />
    </tr>
  )
}

export default function SkeletonTable() {
  return (
    <>
      <style>{pulseKeyframes}</style>
      <div role="status" aria-label="loading leads" aria-busy="true">
        <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
          Loading leads…
        </span>
        <table aria-hidden="true" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Phone</th>
              <th>Gap Score</th>
              <th>Top Signals</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
              <SkeletonRow key={i} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
