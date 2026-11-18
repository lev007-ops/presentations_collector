import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, LogIn, ShieldCheck, UserPlus } from 'lucide-react'
import { Footer, Logo, ThemeToggle } from '../components/Layout'
import { useSite } from '../lib/context'
import { getToken } from '../lib/api'
import { formatDateTime, timeLeft } from '../lib/format'

export default function Home() {
  const { site } = useSite()
  const loggedIn = !!getToken('participant')
  const left = timeLeft(site.deadline)

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      {/* фон */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl dark:bg-primary/25" />
        <div className="absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-lg text-center">
          <div className="flex justify-center">
            <Logo size="lg" />
          </div>
          {site.event_name && (
            <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-primary">{site.event_name}</p>
          )}
          <h1 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">{site.site_title}</h1>
          {site.site_subtitle && (
            <p className="mx-auto mt-4 max-w-md whitespace-pre-line text-pretty text-base text-slate-600 dark:text-slate-400">
              {site.site_subtitle}
            </p>
          )}

          {site.deadline && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-2.5 text-left text-sm shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
              <CalendarClock className="h-5 w-5 shrink-0 text-primary" />
              <div>
                <div className="font-medium">Приём презентаций до {formatDateTime(site.deadline)}</div>
                {left && (
                  <div className={left.passed ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}>
                    {left.passed ? 'Приём закрыт' : left.text}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mx-auto mt-10 flex max-w-sm flex-col gap-3">
            {loggedIn ? (
              <Link to="/cabinet" className="btn-primary py-3.5 text-base">
                Личный кабинет <ArrowRight className="h-5 w-5" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn-primary py-3.5 text-base">
                  <LogIn className="h-5 w-5" /> Войти
                </Link>
                {site.registration_open && (
                  <Link to="/register" className="btn-secondary py-3.5 text-base">
                    <UserPlus className="h-5 w-5" /> Регистрация
                  </Link>
                )}
              </>
            )}
          </div>

          <Link
            to="/staff/login"
            className="mt-8 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-primary dark:text-slate-400"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Вход для организаторов
          </Link>
        </div>
      </main>
      <Footer />
    </div>
  )
}
