const TOKEN_KEYS = { participant: 'token_participant', staff: 'token_staff' }

export function getToken(kind) {
  try {
    return localStorage.getItem(TOKEN_KEYS[kind])
  } catch {
    return null
  }
}

export function setToken(kind, token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEYS[kind], token)
    else localStorage.removeItem(TOKEN_KEYS[kind])
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

function errorMessage(data, status) {
  if (data && typeof data.detail === 'string') return data.detail
  if (data && Array.isArray(data.detail)) {
    return data.detail
      .map((d) => {
        const msg = (d.msg || '').replace(/^Value error, /, '')
        if (d.type === 'value_error' && d.loc?.includes('email')) return 'Некорректная почта'
        if (d.type === 'string_too_short' && d.loc?.includes('password'))
          return 'Пароль должен быть не короче 6 символов'
        return msg
      })
      .join('; ')
  }
  if (status === 413) return 'Файл слишком большой'
  return `Ошибка сервера (${status})`
}

/** auth: 'participant' | 'staff' | undefined */
export async function api(path, { method = 'GET', body, auth, form, signal } = {}) {
  const headers = {}
  if (auth) {
    const t = getToken(auth)
    if (t) headers.Authorization = `Bearer ${t}`
  }
  let payload
  if (form) payload = form
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, signal })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    if (res.status === 401 && auth) {
      setToken(auth, null)
      window.dispatchEvent(new CustomEvent('auth:expired', { detail: auth }))
    }
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  return data
}

/** Загрузка файла с прогрессом (fetch не умеет upload progress) */
export function uploadFile(path, file, { auth, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    const t = getToken(auth)
    if (t) xhr.setRequestHeader('Authorization', `Bearer ${t}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      let data = null
      try {
        data = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new ApiError(errorMessage(data, xhr.status), xhr.status))
    }
    xhr.onerror = () => reject(new ApiError('Нет соединения с сервером', 0))
    const fd = new FormData()
    fd.append('file', file)
    xhr.send(fd)
  })
}

function filenameFromDisposition(header) {
  if (!header) return null
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header)
  if (star) return decodeURIComponent(star[1])
  const plain = /filename="?([^";]+)"?/i.exec(header)
  return plain ? plain[1] : null
}

export async function download(path, { auth, fallbackName = 'file' } = {}) {
  const headers = {}
  const t = getToken(auth)
  if (t) headers.Authorization = `Bearer ${t}`
  const res = await fetch(`/api${path}`, { headers })
  if (!res.ok) {
    let data = null
    try {
      data = await res.json()
    } catch {
      /* ignore */
    }
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  const blob = await res.blob()
  const name = filenameFromDisposition(res.headers.get('Content-Disposition')) || fallbackName
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
