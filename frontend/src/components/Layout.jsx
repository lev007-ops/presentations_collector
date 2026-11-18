import { Link } from 'react-router-dom'
import { LogOut, Monitor, Moon, Presentation, Sun } from 'lucide-react'
import { useSite, useTheme } from '../lib/context'

export function Logo({ size = 'md' }) {
  const { site } = useSite()
  const cls = size === 'lg' ? 'h-16 w-16 rounded-2xl' : 'h-9 w-9 rounded-xl'
  if (site?.logo_url) return <img src={site.logo_url} alt="" className={`${cls} object-contain`} />
  return (
    <div className={`${cls} flex items-center justify-center bg-primary text-primary-fg shadow-sm`}>
      <Presentation className={size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'} />
    </div>
  )
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const next = { light: 'dark', dark: 'system', system: 'light' }[theme]
  const Icon = { light: Sun, dark: Moon, system: Monitor }[theme]
  const label = { light: 'Светлая тема', dark: 'Тёмная тема', system: 'Как в системе' }[theme]
  return (
    <button className="icon-btn" onClick={() => setTheme(next)} title={label} aria-label={label}>
      <Icon className="h-5 w-5" />
    </button>
  )
}

export function Header({ user, onLogout, children }) {
  const { site } = useSite()
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-lg dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <Logo />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold leading-tight sm:text-base">{site?.site_title}</div>
            {site?.event_name && (
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">{site.event_name}</div>
            )}
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {children}
          <ThemeToggle />
          {user && (
            <>
              <span className="ml-2 hidden max-w-[16rem] truncate text-sm text-slate-500 dark:text-slate-400 md:block">
                {user}
              </span>
              <button className="icon-btn" onClick={onLogout} title="Выйти" aria-label="Выйти">
                <LogOut className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export function Footer() {
  const { site } = useSite()
  if (!site?.footer_text) return null
  return (
    <footer className="mx-auto max-w-6xl px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400 sm:px-6">
      <p className="whitespace-pre-line">{site.footer_text}</p>
    </footer>
  )
}

export function Page({ user, onLogout, headerExtra, children, narrow }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={user} onLogout={onLogout}>
        {headerExtra}
      </Header>
      <main className={`mx-auto w-full flex-1 px-4 py-6 sm:px-6 sm:py-10 ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>
        {children}
      </main>
      <Footer />
    </div>
  )
}

/** Компактная обёртка для форм входа/регистрации */
export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center">
        <div className="w-full max-w-md">
          <div className="card p-6 sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{footer}</div>}
        </div>
      </main>
      <Footer />
    </div>
  )
}
