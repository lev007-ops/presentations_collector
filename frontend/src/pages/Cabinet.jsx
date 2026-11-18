import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import {
  CalendarClock, CheckCircle2, Download, FileText, KeyRound, Lock, Pencil, RefreshCw, Trash2, UserRound,
} from 'lucide-react'
import { Page } from '../components/Layout'
import FileDrop from '../components/FileDrop'
import { Alert, Badge, Button, ConfirmModal, Field, Modal, PageLoader, SectionSelect, TextInput } from '../components/ui'
import { api, download, getToken, setToken, uploadFile } from '../lib/api'
import { useSite, useToast } from '../lib/context'
import { formatDateTime, formatSize, timeLeft } from '../lib/format'

const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТ'.split('')

export function ProfileForm({ initial, sections, onSubmit, onCancel, submitText = 'Сохранить' }) {
  const [form, setForm] = useState({
    full_name: initial?.full_name || '',
    grade_number: initial?.grade_number || '',
    grade_letter: initial?.grade_letter || '',
    section_id: initial?.section_id || null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.section_id) return setError('Выберите секцию')
    setLoading(true)
    setError(null)
    try {
      await onSubmit({ ...form, grade_number: Number(form.grade_number) })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {error && <Alert>{error}</Alert>}
      <TextInput
        label="ФИО"
        placeholder="Иванов Иван Иванович"
        required
        minLength={3}
        autoComplete="name"
        value={form.full_name}
        onChange={(e) => setForm({ ...form, full_name: e.target.value })}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Класс">
          <select
            className="input"
            required
            value={form.grade_number}
            onChange={(e) => setForm({ ...form, grade_number: e.target.value })}
          >
            <option value="">—</option>
            {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Буква">
          <input
            className="input uppercase"
            required
            maxLength={2}
            list="grade-letters"
            placeholder="А"
            value={form.grade_letter}
            onChange={(e) => setForm({ ...form, grade_letter: e.target.value.toUpperCase() })}
          />
          <datalist id="grade-letters">
            {LETTERS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
      </div>
      <Field label="Секция">
        {sections.length ? (
          <SectionSelect sections={sections} value={form.section_id} onChange={(v) => setForm({ ...form, section_id: v })} required />
        ) : (
          <Alert type="warning">Организаторы ещё не создали секции. Загляните позже.</Alert>
        )}
      </Field>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button type="submit" loading={loading} disabled={!sections.length}>
          {submitText}
        </Button>
      </div>
    </form>
  )
}

function PasswordModal({ open, onClose }) {
  const toast = useToast()
  const [form, setForm] = useState({ old_password: '', new_password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api('/me/password', { method: 'PUT', body: form, auth: 'participant' })
      toast.success('Пароль изменён')
      setForm({ old_password: '', new_password: '' })
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Смена пароля">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <TextInput
          label="Текущий пароль"
          type="password"
          required
          autoComplete="current-password"
          value={form.old_password}
          onChange={(e) => setForm({ ...form, old_password: e.target.value })}
        />
        <TextInput
          label="Новый пароль"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={form.new_password}
          onChange={(e) => setForm({ ...form, new_password: e.target.value })}
        />
        <Button type="submit" className="w-full" loading={loading}>
          Сохранить
        </Button>
      </form>
    </Modal>
  )
}

function useNow(interval = 30000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(t)
  }, [interval])
  return now
}

function DeadlineCard({ deadline }) {
  const now = useNow()
  const left = timeLeft(deadline, now)
  if (!deadline) {
    return (
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Дедлайн</p>
          <p className="font-semibold">Пока не установлен</p>
        </div>
      </div>
    )
  }
  return (
    <div
      className={`card flex items-center gap-4 p-5 ${
        left.passed ? 'ring-1 ring-red-200 dark:ring-red-900/60' : left.urgent ? 'ring-1 ring-amber-200 dark:ring-amber-900/60' : ''
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          left.passed
            ? 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300'
            : left.urgent
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-primary/10 text-primary'
        }`}
      >
        {left.passed ? <Lock className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500 dark:text-slate-400">Дедлайн загрузки</p>
        <p className="font-semibold">{formatDateTime(deadline)}</p>
        <p
          className={`text-sm ${
            left.passed ? 'text-red-600 dark:text-red-400' : left.urgent ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {left.text}
        </p>
      </div>
    </div>
  )
}

function PresentationCard({ me, onChange }) {
  const toast = useToast()
  const p = me.participant
  const [progress, setProgress] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const locked = me.deadline_passed
  const disabled = locked || !p.profile_complete

  const upload = async (file) => {
    if (!file.name.toLowerCase().endsWith('.pptx')) {
      toast.error('Нужен файл PowerPoint в формате .pptx')
      return
    }
    if (file.size > me.max_upload_mb * 1024 * 1024) {
      toast.error(`Файл больше ${me.max_upload_mb} МБ`)
      return
    }
    setProgress(0)
    try {
      const r = await uploadFile('/me/presentation', file, { auth: 'participant', onProgress: setProgress })
      onChange(r)
      toast.success(p.file ? 'Презентация заменена' : 'Презентация загружена')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setProgress(null)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      onChange(await api('/me/presentation', { method: 'DELETE', auth: 'participant' }))
      toast.success('Презентация удалена')
      setConfirmDelete(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Презентация</h2>
        {p.file ? <Badge color="green"><CheckCircle2 className="h-3.5 w-3.5" /> Загружена</Badge> : <Badge color="amber">Не загружена</Badge>}
      </div>

      {!p.profile_complete && (
        <Alert type="info" className="mt-4">
          Чтобы загрузить презентацию, сначала заполните профиль.
        </Alert>
      )}
      {locked && (
        <Alert type="warning" className="mt-4">
          Дедлайн прошёл — загрузка и изменение презентации закрыты.
        </Alert>
      )}

      {p.file && (
        <div className="mt-4 flex flex-col gap-4 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/50 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold" title={p.file.original_name}>
                {p.file.original_name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatSize(p.file.size)} · {formatDateTime(p.file.uploaded_at)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                download('/me/presentation', { auth: 'participant', fallbackName: p.file.original_name }).catch((e) =>
                  toast.error(e.message),
                )
              }
            >
              <Download className="h-4 w-4" /> Скачать
            </Button>
            {!locked && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-red-600 dark:text-red-400">
                <Trash2 className="h-4 w-4" /> Удалить
              </Button>
            )}
          </div>
        </div>
      )}

      {!locked && (
        <div className="mt-4">
          {progress !== null ? (
            <div className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Загрузка…</span>
                <span className="tabular-nums text-slate-500">{Math.round(progress * 100)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          ) : (
            <FileDrop
              disabled={disabled}
              onFile={upload}
              compact={!!p.file}
              title={p.file ? 'Заменить файл: перетащите новый или нажмите' : undefined}
              hint={`Только PowerPoint (.pptx), до ${me.max_upload_mb} МБ`}
            />
          )}
          {p.file && progress === null && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <RefreshCw className="h-3.5 w-3.5" /> Файл можно заменять до дедлайна
            </p>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleting}
        title="Удалить презентацию?"
        text="Файл будет удалён с сервера. Вы сможете загрузить новый до дедлайна."
      />
    </div>
  )
}

export default function Cabinet() {
  const nav = useNavigate()
  const { site } = useSite()
  const toast = useToast()
  const [me, setMe] = useState(null)
  const [editing, setEditing] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      setMe(await api('/me', { auth: 'participant' }))
    } catch (e) {
      if (e.status === 401) nav('/login')
      else toast.error(e.message)
    }
  }, [nav, toast])

  useEffect(() => {
    load()
  }, [load])

  if (!getToken('participant')) return <Navigate to="/login" replace />

  const logout = () => {
    setToken('participant', null)
    nav('/')
  }

  if (!me) return <Page onLogout={logout} user=" "><PageLoader /></Page>
  const p = me.participant

  const saveProfile = async (data) => {
    const r = await api('/me/profile', { method: 'PUT', body: data, auth: 'participant' })
    setMe(r)
    setEditing(false)
    toast.success('Профиль сохранён')
  }

  return (
    <Page user={p.email} onLogout={logout} narrow>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {p.full_name ? `Здравствуйте, ${p.full_name.split(' ')[1] || p.full_name.split(' ')[0]}!` : 'Добро пожаловать!'}
        </h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          {p.profile_complete ? 'Здесь можно загрузить презентацию и изменить данные о себе.' : 'Заполните данные о себе, чтобы загрузить презентацию.'}
        </p>
      </div>

      {!p.profile_complete ? (
        <div className="card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-fg">1</div>
            <div>
              <h2 className="font-bold">Данные участника</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Их увидят организаторы вашей секции</p>
            </div>
          </div>
          <ProfileForm initial={p} sections={site.sections} onSubmit={saveProfile} submitText="Продолжить" />
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <DeadlineCard deadline={me.deadline} />
          <PresentationCard me={me} onChange={setMe} />

          <div className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <UserRound className="h-5 w-5 text-slate-400" /> Мои данные
              </h2>
              <div className="flex gap-1">
                <button className="icon-btn" onClick={() => setPwdOpen(true)} title="Сменить пароль" aria-label="Сменить пароль">
                  <KeyRound className="h-4 w-4" />
                </button>
                {!editing && (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" /> Изменить
                  </Button>
                )}
              </div>
            </div>
            <div className="mt-4">
              {editing ? (
                <ProfileForm initial={p} sections={site.sections} onSubmit={saveProfile} onCancel={() => setEditing(false)} />
              ) : (
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-3">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">ФИО</dt>
                    <dd className="font-medium">{p.full_name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Класс</dt>
                    <dd className="font-medium">{p.grade}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Секция</dt>
                    <dd className="font-medium">{p.section_name}</dd>
                  </div>
                  <div className="sm:col-span-3">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">Почта</dt>
                    <dd className="font-medium break-all">{p.email}</dd>
                  </div>
                </dl>
              )}
            </div>
          </div>
        </div>
      )}
      <PasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Page>
  )
}
