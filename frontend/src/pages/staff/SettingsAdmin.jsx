import { useEffect, useRef, useState } from 'react'
import { CalendarClock, ImagePlus, KeyRound, Palette, Save, Trash2, Wand2 } from 'lucide-react'
import { Alert, Button, Field, PageLoader, TextInput } from '../../components/ui'
import { api, uploadFile } from '../../lib/api'
import { applyPrimaryColor } from '../../lib/color'
import { useSite, useToast } from '../../lib/context'
import { isoToLocalInput, localInputToIso } from '../../lib/format'

const PRESETS = ['#4f46e5', '#2563eb', '#0891b2', '#059669', '#65a30d', '#d97706', '#dc2626', '#db2777', '#7c3aed', '#0f172a']

function Section({ icon: Icon, title, description, children }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="font-bold">{title}</h2>
          {description && <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (n) => alphabet[n % alphabet.length]).join('')
}

export default function SettingsAdmin() {
  const { site, reload } = useSite()
  const toast = useToast()
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [logoUrl, setLogoUrl] = useState(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const savedColor = useRef(site.primary_color)

  useEffect(() => {
    api('/admin/settings', { auth: 'staff' })
      .then((s) => {
        setForm({ ...s, deadline: isoToLocalInput(s.deadline) })
        setLogoUrl(s.logo_url)
      })
      .catch((e) => toast.error(e.message))
  }, [toast])

  // Живой предпросмотр цвета; при уходе со страницы без сохранения — откат
  useEffect(() => {
    if (form?.primary_color && /^#[0-9a-f]{6}$/i.test(form.primary_color)) applyPrimaryColor(form.primary_color)
  }, [form?.primary_color])
  useEffect(() => () => applyPrimaryColor(savedColor.current), [])

  if (!form) return <PageLoader />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        site_title: form.site_title,
        site_subtitle: form.site_subtitle,
        event_name: form.event_name,
        footer_text: form.footer_text,
        primary_color: form.primary_color,
        registration_code: form.registration_code,
        registration_open: form.registration_open,
        deadline: localInputToIso(form.deadline),
      }
      const r = await api('/admin/settings', { method: 'PUT', body, auth: 'staff' })
      savedColor.current = r.primary_color
      setForm({ ...r, deadline: isoToLocalInput(r.deadline) })
      await reload()
      toast.success('Настройки сохранены')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (file) => {
    if (!file) return
    setLogoBusy(true)
    try {
      const r = await uploadFile('/admin/settings/logo', file, { auth: 'staff' })
      setLogoUrl(r.logo_url)
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = async () => {
    setLogoBusy(true)
    try {
      await api('/admin/settings/logo', { method: 'DELETE', auth: 'staff' })
      setLogoUrl(null)
      reload()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLogoBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 sm:space-y-6">
      <h1 className="text-xl font-bold sm:text-2xl">Настройки</h1>

      <Section icon={CalendarClock} title="Дедлайн" description="После дедлайна участники не смогут загружать и менять презентации">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Дата и время (ваш часовой пояс)" className="flex-1">
            <input type="datetime-local" className="input" value={form.deadline || ''} onChange={set('deadline')} />
          </Field>
          {form.deadline && (
            <Button type="button" variant="secondary" onClick={() => setForm({ ...form, deadline: '' })}>
              Без дедлайна
            </Button>
          )}
        </div>
      </Section>

      <Section icon={KeyRound} title="Регистрация" description="Код нужен участникам при регистрации — сообщите его только своим">
        <div className="flex gap-2">
          <TextInput label="Код регистрации" className="flex-1" value={form.registration_code} onChange={set('registration_code')} />
          <Button
            type="button"
            variant="secondary"
            className="mt-[1.625rem] self-start"
            onClick={() => setForm({ ...form, registration_code: randomCode() })}
            title="Сгенерировать"
          >
            <Wand2 className="h-4 w-4" />
          </Button>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--primary))]"
            checked={form.registration_open}
            onChange={set('registration_open')}
          />
          Регистрация открыта
        </label>
        {!form.registration_code && form.registration_open && (
          <Alert type="warning">Код не задан — зарегистрироваться никто не сможет.</Alert>
        )}
      </Section>

      <Section icon={Palette} title="Оформление" description="Цвет и тексты применяются ко всему сайту и к разделительным слайдам">
        <TextInput label="Заголовок сайта" required value={form.site_title} onChange={set('site_title')} />
        <TextInput label="Название мероприятия" placeholder="Например: Научная конференция 2026" value={form.event_name || ''} onChange={set('event_name')} />
        <Field label="Описание на главной">
          <textarea className="input min-h-[80px]" value={form.site_subtitle || ''} onChange={set('site_subtitle')} />
        </Field>
        <Field label="Текст в подвале">
          <textarea className="input min-h-[60px]" placeholder="Контакты организаторов и т. п." value={form.footer_text || ''} onChange={set('footer_text')} />
        </Field>

        <Field label="Основной цвет">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm({ ...form, primary_color: c })}
                className={`h-9 w-9 rounded-xl ring-offset-2 transition dark:ring-offset-slate-900 ${
                  form.primary_color.toLowerCase() === c ? 'ring-2 ring-slate-900 dark:ring-white' : ''
                }`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <label className="relative flex h-9 items-center gap-2 rounded-xl border border-slate-300 px-2 dark:border-slate-700">
              <input
                type="color"
                value={form.primary_color}
                onChange={set('primary_color')}
                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                className="w-20 bg-transparent font-mono text-sm uppercase outline-none"
                value={form.primary_color}
                maxLength={7}
                onChange={set('primary_color')}
              />
            </label>
          </div>
        </Field>

        <Field label="Логотип" hint="PNG, SVG, JPG или WEBP, до 5 МБ. Показывается в шапке, на главной и как иконка вкладки.">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-slate-400" />}
            </div>
            <label className={`btn-secondary btn-sm cursor-pointer ${logoBusy ? 'pointer-events-none opacity-50' : ''}`}>
              {logoUrl ? 'Заменить' : 'Загрузить'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  uploadLogo(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
            {logoUrl && (
              <button type="button" className="icon-btn hover:text-red-600" onClick={removeLogo} aria-label="Удалить логотип">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </Field>

        {/* Предпросмотр разделительного слайда */}
        <Field label="Разделительный слайд в объединённой презентации">
          <div
            className="relative aspect-video w-full max-w-md overflow-hidden rounded-xl p-[6%] text-primary-fg shadow-inner"
            style={{ background: 'linear-gradient(135deg, rgb(var(--primary)), rgb(var(--primary-strong)))' }}
          >
            <div className="absolute -right-[10%] -top-[25%] aspect-square w-[62%] rounded-full bg-white/10" />
            <div className="absolute -bottom-[20%] right-[0%] aspect-square w-[40%] rounded-full bg-white/10" />
            <div className="h-[3px] w-[6%] bg-current" />
            <div className="mt-1 truncate text-[10px] opacity-70">
              {form.site_title}
              {form.event_name ? ` · ${form.event_name}` : ''}
            </div>
            <div className="mt-[10%] text-[9px] font-bold uppercase opacity-70">Следующий участник</div>
            <div className="text-lg font-bold leading-tight sm:text-xl">Иванов Иван Иванович</div>
            <div className="mt-1 text-xs">9А класс</div>
            <div className="absolute bottom-[8%] right-[6%] text-base font-bold">3 / 12</div>
          </div>
        </Field>
      </Section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="flex justify-end px-4 py-3">
          <Button type="submit" loading={saving} className="w-full sm:w-auto">
            {!saving && <Save className="h-4 w-4" />} Сохранить настройки
          </Button>
        </div>
      </div>
    </form>
  )
}
