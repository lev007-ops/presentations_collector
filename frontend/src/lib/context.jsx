import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { applyPrimaryColor } from './color'

/* ------------------------------------------------------------ site settings */

const SiteContext = createContext(null)

export function SiteProvider({ children }) {
  const [site, setSite] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      const s = await api('/public/settings')
      setSite(s)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    if (!site) return
    applyPrimaryColor(site.primary_color)
    document.title = site.site_title
    const link = document.querySelector('link[rel="icon"]')
    if (link && site.logo_url) link.href = site.logo_url
  }, [site])

  const value = useMemo(() => ({ site, reload, error }), [site, reload, error])
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export const useSite = () => useContext(SiteContext)

/* -------------------------------------------------------------------- theme */

const ThemeContext = createContext(null)

function readTheme() {
  try {
    return localStorage.getItem('theme') || 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readTheme)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  const setTheme = useCallback((t) => {
    setThemeState(t)
    try {
      if (t === 'system') localStorage.removeItem('theme')
      else localStorage.setItem('theme', t)
    } catch {
      /* ignore */
    }
  }, [])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)

/* ------------------------------------------------------------------- toasts */

const ToastContext = createContext(null)
let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const push = useCallback((message, type = 'success') => {
    const id = ++toastId
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3500)
  }, [])

  const api = useMemo(
    () => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error'), info: (m) => push(m, 'info') }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto w-full max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ring-1 ${
              t.type === 'error'
                ? 'bg-red-600 text-white ring-red-700'
                : t.type === 'info'
                  ? 'bg-slate-800 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900'
                  : 'bg-emerald-600 text-white ring-emerald-700'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
