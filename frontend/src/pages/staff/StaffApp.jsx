import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { FolderKanban, Settings, ShieldCheck, Users } from 'lucide-react'
import { Page } from '../../components/Layout'
import { PageLoader } from '../../components/ui'
import { api, getToken, setToken } from '../../lib/api'
import SectionsOverview from './SectionsOverview'
import SectionView from './SectionView'
import ParticipantsAdmin from './ParticipantsAdmin'
import StaffAdmin from './StaffAdmin'
import SettingsAdmin from './SettingsAdmin'

const StaffContext = createContext(null)
export const useStaff = () => useContext(StaffContext)

const TABS = [
  { to: '/staff', label: 'Секции', icon: FolderKanban, match: /^\/staff\/?(sections.*)?$/ },
  { to: '/staff/participants', label: 'Участники', icon: Users },
  { to: '/staff/team', label: 'Организаторы', short: 'Команда', icon: ShieldCheck },
  { to: '/staff/settings', label: 'Настройки', icon: Settings },
]

function Tabs() {
  const { pathname } = useLocation()
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900 sm:min-w-0">
        {TABS.map((t) => {
          const active = t.match ? t.match.test(pathname) : pathname.startsWith(t.to)
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 ${
                active
                  ? 'bg-primary text-primary-fg shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <t.icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short || t.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default function StaffApp() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)

  useEffect(() => {
    if (!getToken('staff')) return
    api('/staff/me', { auth: 'staff' })
      .then(setMe)
      .catch(() => nav('/staff/login'))
  }, [nav])

  useEffect(() => {
    const onExpired = (e) => e.detail === 'staff' && nav('/staff/login')
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [nav])

  if (!getToken('staff')) return <Navigate to="/staff/login" replace />

  const logout = () => {
    setToken('staff', null)
    nav('/')
  }

  if (!me) return <Page><PageLoader /></Page>
  const su = me.role === 'superuser'
  const userLabel = `${me.full_name || me.login} · ${su ? 'суперюзер' : 'организатор'}`

  return (
    <StaffContext.Provider value={{ me, su }}>
      <Page user={userLabel} onLogout={logout}>
        {su && <Tabs />}
        <Routes>
          <Route index element={su ? <SectionsOverview /> : <OrganizerHome me={me} />} />
          <Route path="sections/:id" element={<SectionView />} />
          {su && <Route path="participants" element={<ParticipantsAdmin />} />}
          {su && <Route path="team" element={<StaffAdmin />} />}
          {su && <Route path="settings" element={<SettingsAdmin />} />}
          <Route path="*" element={<Navigate to="/staff" replace />} />
        </Routes>
      </Page>
    </StaffContext.Provider>
  )
}

function OrganizerHome({ me }) {
  if (!me.section_id) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold">Вам пока не назначена секция</p>
        <p className="mt-1 text-sm text-slate-500">Обратитесь к главному организатору.</p>
      </div>
    )
  }
  return <Navigate to={`/staff/sections/${me.section_id}`} replace />
}
