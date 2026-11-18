import { useEffect, useState } from 'react'
import { Download, FileText, Trash2, Upload } from 'lucide-react'
import { Alert, Button, ConfirmModal, Field, Modal, SectionSelect, TextInput } from '../../components/ui'
import { api, download, uploadFile } from '../../lib/api'
import { useSite, useToast } from '../../lib/context'
import { formatDateTime, formatSize } from '../../lib/format'

/** Редактирование участника суперюзером */
export default function ParticipantModal({ participant, onClose, onChanged, onDeleted }) {
  const { site } = useSite()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [p, setP] = useState(participant)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'file' | 'user'
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setP(participant)
    setError(null)
    if (participant)
      setForm({
        full_name: participant.full_name || '',
        grade_number: participant.grade_number || '',
        grade_letter: participant.grade_letter || '',
        section_id: participant.section_id,
        email: participant.email,
        password: '',
      })
  }, [participant])

  if (!participant || !form) return null

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = {
        full_name: form.full_name,
        email: form.email,
        grade_letter: form.grade_letter || null,
        grade_number: form.grade_number ? Number(form.grade_number) : null,
        section_id: form.section_id,
        clear_section: !form.section_id,
        password: form.password || null,
      }
      const r = await api(`/admin/participants/${p.id}`, { method: 'PUT', body, auth: 'staff' })
      toast.success('Данные участника сохранены')
      onChanged?.(r)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const upload = async (file) => {
    if (!file) return
    setUploading(0)
    try {
      const r = await uploadFile(`/admin/participants/${p.id}/presentation`, file, { auth: 'staff', onProgress: setUploading })
      setP(r)
      onChanged?.(r)
      toast.success('Презентация загружена')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(null)
    }
  }

  const doConfirm = async () => {
    setBusy(true)
    try {
      if (confirm === 'file') {
        const r = await api(`/admin/participants/${p.id}/presentation`, { method: 'DELETE', auth: 'staff' })
        setP(r)
        onChanged?.(r)
        toast.success('Презентация удалена')
      } else {
        await api(`/admin/participants/${p.id}`, { method: 'DELETE', auth: 'staff' })
        toast.success('Участник удалён')
        onDeleted?.(p)
        onClose()
      }
      setConfirm(null)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal
        open
        wide
        onClose={onClose}
        title={p.full_name || p.email}
        footer={
          <>
            <Button variant="ghost" className="text-red-600 dark:text-red-400 sm:mr-auto" onClick={() => setConfirm('user')}>
              <Trash2 className="h-4 w-4" /> Удалить участника
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" form="participant-form" loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form id="participant-form" onSubmit={save} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <TextInput label="ФИО" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Класс">
              <select className="input" value={form.grade_number} onChange={(e) => setForm({ ...form, grade_number: e.target.value })}>
                <option value="">—</option>
                {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <TextInput
              label="Буква"
              maxLength={2}
              className="uppercase"
              value={form.grade_letter}
              onChange={(e) => setForm({ ...form, grade_letter: e.target.value.toUpperCase() })}
            />
            <Field label="Секция" className="col-span-2">
              <SectionSelect
                sections={site.sections}
                value={form.section_id}
                placeholder="Без секции"
                onChange={(v) => setForm({ ...form, section_id: v })}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Почта" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <TextInput
              label="Новый пароль"
              type="password"
              autoComplete="new-password"
              placeholder="Не менять"
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
        </form>

        <div className="mt-6 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="mb-3 text-sm font-semibold">Презентация</p>
          {p.file ? (
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-orange-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.file.original_name}</p>
                <p className="text-xs text-slate-500">
                  {formatSize(p.file.size)} · {formatDateTime(p.file.uploaded_at)}
                </p>
              </div>
              <button
                className="icon-btn"
                aria-label="Скачать"
                onClick={() =>
                  download(`/staff/participants/${p.id}/presentation`, { auth: 'staff' }).catch((e) => toast.error(e.message))
                }
              >
                <Download className="h-4 w-4" />
              </button>
              <button className="icon-btn hover:text-red-600" aria-label="Удалить файл" onClick={() => setConfirm('file')}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Не загружена</p>
          )}
          <label className="btn-secondary btn-sm mt-3 cursor-pointer">
            <Upload className="h-4 w-4" />
            {uploading !== null ? `Загрузка ${Math.round(uploading * 100)}%` : p.file ? 'Заменить файл' : 'Загрузить за участника'}
            <input
              type="file"
              accept=".pptx"
              className="hidden"
              disabled={uploading !== null}
              onChange={(e) => {
                upload(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <p className="mt-2 text-xs text-slate-500">Суперюзер может менять файл и после дедлайна.</p>
        </div>
      </Modal>
      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        loading={busy}
        title={confirm === 'file' ? 'Удалить презентацию участника?' : 'Удалить участника?'}
        text={
          confirm === 'file'
            ? 'Файл будет удалён с сервера.'
            : 'Аккаунт участника и его презентация будут удалены безвозвратно.'
        }
      />
    </>
  )
}
