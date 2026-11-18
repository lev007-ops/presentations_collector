import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, Pencil, Search, Users } from 'lucide-react'
import { Badge, EmptyState, PageLoader } from '../../components/ui'
import { api } from '../../lib/api'
import { useSite, useToast } from '../../lib/context'
import ParticipantModal from './ParticipantModal'

export default function ParticipantsAdmin() {
  const { site } = useSite()
  const toast = useToast()
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [section, setSection] = useState(null)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      setList(await api('/admin/participants', { auth: 'staff' }))
    } catch (e) {
      toast.error(e.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    if (!list) return []
    const needle = q.trim().toLowerCase()
    return list.filter(
      (p) =>
        (!needle || (p.full_name || '').toLowerCase().includes(needle) || p.email.toLowerCase().includes(needle)) &&
        (section === null || (section === -1 ? !p.section_id : p.section_id === section)) &&
        (!onlyMissing || !p.file),
    )
  }, [list, q, section, onlyMissing])

  if (!list) return <PageLoader />

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Участники</h1>
        <span className="text-sm text-slate-500">
          {filtered.length} из {list.length}
        </span>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_16rem_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Поиск по ФИО или почте" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          className="input"
          value={section ?? ''}
          onChange={(e) => setSection(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Все секции</option>
          <option value="-1">Без секции</option>
          {site.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 whitespace-nowrap text-sm">
          <input type="checkbox" className="h-4 w-4 rounded accent-[rgb(var(--primary))]" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          Без презентации
        </label>
      </div>

      <div className="card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState icon={Users} title="Никого не найдено" />
        ) : (
          <>
            {/* Таблица на широких экранах */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Участник</th>
                  <th className="px-4 py-3 font-medium">Класс</th>
                  <th className="px-4 py-3 font-medium">Секция</th>
                  <th className="px-4 py-3 font-medium">Презентация</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setEditing(p)}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.full_name || <span className="italic text-slate-400">не заполнено</span>}</div>
                      <div className="text-xs text-slate-500">{p.email}</div>
                    </td>
                    <td className="px-4 py-3">{p.grade || '—'}</td>
                    <td className="px-4 py-3">{p.section_name || <Badge color="amber">без секции</Badge>}</td>
                    <td className="px-4 py-3">
                      {p.file ? (
                        <Badge color="green">
                          <CheckCircle2 className="h-3.5 w-3.5" /> загружена
                        </Badge>
                      ) : (
                        <Badge>
                          <Clock className="h-3.5 w-3.5" /> нет
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Pencil className="h-4 w-4 text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Карточки на телефонах */}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setEditing(p)}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {p.full_name || <span className="italic text-slate-400">не заполнено</span>}
                        {p.grade && <span className="ml-2 text-sm font-normal text-slate-500">{p.grade}</span>}
                      </div>
                      <div className="truncate text-xs text-slate-500">{p.section_name || 'без секции'} · {p.email}</div>
                    </div>
                    {p.file ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : (
                      <Clock className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ParticipantModal participant={editing} onClose={() => setEditing(null)} onChanged={load} onDeleted={load} />
    </div>
  )
}
