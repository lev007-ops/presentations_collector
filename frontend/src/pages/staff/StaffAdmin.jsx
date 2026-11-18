import { useCallback, useEffect, useState } from 'react'
import { Crown, Pencil, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Alert, Badge, Button, ConfirmModal, Field, Modal, PageLoader, SectionSelect, TextInput } from '../../components/ui'
import { api } from '../../lib/api'
import { useSite, useToast } from '../../lib/context'
import { useStaff } from './StaffApp'

function StaffModal({ open, staff, onClose, onSaved }) {
  const { site } = useSite()
  const toast = useToast()
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setError(null)
    setForm({
      login: staff?.login || '',
      full_name: staff?.full_name || '',
      password: '',
      role: staff?.role || 'organizer',
      section_id: staff?.section_id || null,
    })
  }, [staff, open])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (staff) {
        await api(`/admin/staff/${staff.id}`, {
          method: 'PUT',
          auth: 'staff',
          body: { full_name: form.full_name, role: form.role, section_id: form.section_id, password: form.password || null },
        })
      } else {
        await api('/admin/staff', { method: 'POST', auth: 'staff', body: form })
      }
      toast.success(staff ? 'Изменения сохранены' : 'Организатор создан')
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={staff ? `Организатор ${staff.login}` : 'Новый организатор'}>
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <TextInput
          label="Логин"
          required
          disabled={!!staff}
          pattern="[A-Za-z0-9_.\-]+"
          hint={!staff ? 'Латиница, цифры, точка, дефис, подчёркивание' : undefined}
          autoComplete="off"
          value={form.login || ''}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
        />
        <TextInput label="Имя" value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        <TextInput
          label={staff ? 'Новый пароль' : 'Пароль'}
          type="password"
          autoComplete="new-password"
          required={!staff}
          minLength={10}
          placeholder={staff ? 'Не менять' : ''}
          hint="Не короче 10 символов"
          value={form.password || ''}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <Field label="Роль">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['organizer', 'Организатор секции'],
              ['superuser', 'Суперюзер'],
            ].map(([v, l]) => (
              <button
                type="button"
                key={v}
                onClick={() => setForm({ ...form, role: v })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                  form.role === v
                    ? 'border-primary bg-primary/10 text-primary dark:text-slate-100'
                    : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </Field>
        {form.role === 'organizer' && (
          <Field label="Секция">
            <SectionSelect sections={site.sections} value={form.section_id} onChange={(v) => setForm({ ...form, section_id: v })} required />
          </Field>
        )}
        <Button type="submit" className="w-full" loading={loading}>
          {staff ? 'Сохранить' : 'Создать'}
        </Button>
      </form>
    </Modal>
  )
}

export default function StaffAdmin() {
  const { me } = useStaff()
  const toast = useToast()
  const [list, setList] = useState(null)
  const [modal, setModal] = useState({ open: false, staff: null })
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      setList(await api('/admin/staff', { auth: 'staff' }))
    } catch (e) {
      toast.error(e.message)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const remove = async () => {
    setDeleting(true)
    try {
      await api(`/admin/staff/${toDelete.id}`, { method: 'DELETE', auth: 'staff' })
      toast.success('Удалено')
      setToDelete(null)
      load()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  if (!list) return <PageLoader />

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">Организаторы</h1>
        <Button onClick={() => setModal({ open: true, staff: null })}>
          <UserPlus className="h-4 w-4" /> Добавить
        </Button>
      </div>
      <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
        {list.map((s) => (
          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                s.role === 'superuser' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-primary/10 text-primary'
              }`}
            >
              {s.role === 'superuser' ? <Crown className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{s.full_name || s.login}</span>
                {s.id === me.id && <Badge color="primary">это вы</Badge>}
              </div>
              <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                {s.login} · {s.role === 'superuser' ? 'суперюзер, все секции' : s.section_name || 'секция не назначена'}
              </div>
            </div>
            <button className="icon-btn" onClick={() => setModal({ open: true, staff: s })} aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              className="icon-btn hover:text-red-600"
              disabled={s.id === me.id}
              onClick={() => setToDelete(s)}
              aria-label="Удалить"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <StaffModal open={modal.open} staff={modal.staff} onClose={() => setModal({ open: false, staff: null })} onSaved={load} />
      <ConfirmModal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title={`Удалить ${toDelete?.login}?`}
        text="Этот пользователь больше не сможет войти в панель организаторов."
      />
    </div>
  )
}
