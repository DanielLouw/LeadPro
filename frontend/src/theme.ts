// Theme handling: light/dark via [data-theme] on <html>.
// Default follows the OS preference; an explicit toggle choice is persisted.

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'leadpro-theme'

/** The theme currently applied to <html>, as set by applyTheme().
    Single source of truth between the pre-paint init and the React toggle. */
export function getAppliedTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage unavailable (e.g. some test environments) — fall through
  }
  if (typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // non-fatal
  }
}
