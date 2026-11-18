import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/Layout'
import { Alert, Button, TextInput } from '../components/ui'
import { api, setToken } from '../lib/api'
import { useSite } from '../lib/context'

function useSubmit(fn) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  return { loading, error, submit, setError }
}

export function Login() {
  const nav = useNavigate()
  const { site } = useSite()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { loading, error, submit } = useSubmit(async () => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } })
    setToken('participant', r.access_token)
    nav('/cabinet')
  })
  return (
    <AuthShell
      title="Вход"
      subtitle="Войдите, чтобы загрузить или обновить презентацию"
      footer={
        site.registration_open && (
          <>
            Нет аккаунта?{' '}
            <Link className="font-semibold text-primary hover:underline" to="/register">
              Зарегистрироваться
            </Link>
          </>
        )
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Почта" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput
          label="Пароль"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" loading={loading}>
          Войти
        </Button>
      </form>
    </AuthShell>
  )
}

export function Register() {
  const nav = useNavigate()
  const { site } = useSite()
  const [form, setForm] = useState({ email: '', password: '', password2: '', code: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const { loading, error, submit, setError } = useSubmit(async () => {
    if (form.password !== form.password2) {
      setError('Пароли не совпадают')
      return
    }
    const r = await api('/auth/register', {
      method: 'POST',
      body: { email: form.email, password: form.password, code: form.code },
    })
    setToken('participant', r.access_token)
    nav('/cabinet')
  })

  if (!site.registration_open) {
    return (
      <AuthShell title="Регистрация закрыта" subtitle="Обратитесь к организаторам мероприятия.">
        <Link to="/login" className="btn-primary w-full">
          Ко входу
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Регистрация"
      subtitle="Код регистрации выдаёт организатор мероприятия"
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link className="font-semibold text-primary hover:underline" to="/login">
            Войти
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Почта" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <TextInput
          label="Пароль"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
          hint="Не короче 6 символов"
          value={form.password}
          onChange={set('password')}
        />
        <TextInput
          label="Повторите пароль"
          type="password"
          autoComplete="new-password"
          required
          value={form.password2}
          onChange={set('password2')}
        />
        <TextInput label="Код регистрации" required autoComplete="off" value={form.code} onChange={set('code')} />
        <Button type="submit" className="w-full" loading={loading}>
          Зарегистрироваться
        </Button>
      </form>
    </AuthShell>
  )
}

export function StaffLogin() {
  const nav = useNavigate()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const { loading, error, submit } = useSubmit(async () => {
    const r = await api('/auth/staff/login', { method: 'POST', body: { login, password } })
    setToken('staff', r.access_token)
    nav('/staff')
  })
  return (
    <AuthShell
      title="Вход для организаторов"
      footer={
        <Link className="hover:text-primary" to="/">
          ← На главную
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Логин" autoComplete="username" required value={login} onChange={(e) => setLogin(e.target.value)} />
        <TextInput
          label="Пароль"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" className="w-full" loading={loading}>
          Войти
        </Button>
      </form>
    </AuthShell>
  )
}
