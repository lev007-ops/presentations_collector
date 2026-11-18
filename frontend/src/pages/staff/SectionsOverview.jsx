import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronRight, FolderPlus, Layers, Pencil, Trash2, Users } from 'lucide-react'
import { Badge, Button, ConfirmModal, EmptyState, Modal, PageLoader, TextInput } from '../../components/ui'
import { api } from '../../lib/api'
import { useSite, useToast } from '../../lib/context'
import { plural } from '../../lib/format'

function Stat({ label, value, tone }) {
  return (
    <div className="card p-4 sm:p-5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-sm">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums sm:text-3xl ${tone || ''}`}>{value}</p>
    </div>
  )
}

function SectionModal({ section, open, onClose, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => setName(section?.name || ''), [section, open])
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (section) await api(`/admin/sections/${section.id}`, { method: 'PUT', body: { name }, auth: 'staff' })
      else await api('/admin/sections', { method: 'POST', body: { name }, auth: 'staff' })
      toast.success(section ? 'Секция переименована' : 'Секция создана')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={section ? 'Переименовать секцию' : 'Новая секция'}>
      <form onSubmit={submit} className="space-y-4">
        <TextInput label="Название" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" className="w-full" loading={loading}>
          Сохранить
        </Button>
      </form>
    </Modal>
  )
}

export default function SectionsOverview() {
  const toast = useToast()
  const { reload: reloadSite } = useSite()
  const [sections, setSections] = useState(null)
  const [stats, setStats] = useState(null)
  const [modal, setModal] = useState({ open: false, section: null })
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([api('/staff/sections', { auth: 'staff' }), api('/admin/stats', { auth: 'staff' })])
      setSections(s)
      setStats(st)
    } catch (e) {
      toast.error(e.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const changed = () => {
    load()
    reloadSite()
  }

  const move = async (idx, dir) => {
    const next = [...sections]
    const [item] = next.splice(idx, 1)
    next.splice(idx + dir, 0, item)
    setSections(next)
    try {
      await api('/admin/sections/order', { method: 'PUT', body: { ids: next.map((s) => s.id) }, auth: 'staff' })
      reloadSite()
    } catch (e) {
      toast.error(e.message)
      load()
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await api(`/admin/sections/${toDelete.id}`, { method: 'DELETE', auth: 'staff' })
      toast.success('Секция удалена')
      setToDelete(null)
      changed()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  if (!sections) return <PageLoader />

  return (
    <div>
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Участников" value={stats.participants} />
          <Stat label="Загрузили презентацию" value={stats.with_file} tone="text-emerald-600 dark:text-emerald-400" />
          <Stat label="Без секции" value={stats.without_section} tone={stats.without_section ? 'text-amber-600 dark:text-amber-400' : ''} />
          <Stat label="Секций" value={stats.sections} />
        </div>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Секции</h1>
        <Button onClick={() => setModal({ open: true, section: null })}>
          <FolderPlus className="h-4 w-4" /> <span className="hidden sm:inline">Добавить секцию</span>
          <span className="sm:hidden">Добавить</span>
        </Button>
      </div>

      {sections.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Layers}
            title="Секций пока нет"
            text="Создайте секции — участники выберут свою при регистрации."
            action={<Button onClick={() => setModal({ open: true, section: null })}>Создать секцию</Button>}
          />
        </div>
      ) : (
        <div className="card divide-y divide-slate-200 overflow-hidden dark:divide-slate-800">
          {sections.map((s, i) => {
            const pct = s.participants_count ? Math.round((s.uploaded_count / s.participants_count) * 100) : 0
            return (
              <div key={s.id} className="flex items-center gap-2 p-3 sm:gap-4 sm:p-4">
                <div className="hidden flex-col sm:flex">
                  <button className="icon-btn h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button className="icon-btn h-7 w-7" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <Link to={`/staff/sections/${s.id}`} className="group flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold group-hover:text-primary">{s.name}</span>
                      {s.merged && <Badge color="primary">собрана</Badge>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {s.participants_count}{' '}
                        {plural(s.participants_count, 'участник', 'участника', 'участников')}
                      </span>
                      <span>
                        {s.uploaded_count} из {s.participants_count} загрузили
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-primary" />
                </Link>
                <div className="flex shrink-0">
                  <button className="icon-btn" onClick={() => setModal({ open: true, section: s })} aria-label="Переименовать">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="icon-btn hover:text-red-600" onClick={() => setToDelete(s)} aria-label="Удалить">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SectionModal open={modal.open} section={modal.section} onClose={() => setModal({ open: false, section: null })} onSaved={changed} />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title={`Удалить секцию «${toDelete?.name}»?`}
        text="Участники секции останутся, но без секции — им нужно будет выбрать новую. Организаторы секции потеряют к ней доступ."
      />
    </div>
  )
}
