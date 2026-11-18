export function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

export function formatDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function timeLeft(iso, now = Date.now()) {
  if (!iso) return null
  const diff = new Date(iso).getTime() - now
  if (diff <= 0) return { passed: true, text: 'Дедлайн прошёл' }
  const mins = Math.floor(diff / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const parts = []
  if (days) parts.push(`${days} ${plural(days, 'день', 'дня', 'дней')}`)
  if (hours) parts.push(`${hours} ${plural(hours, 'час', 'часа', 'часов')}`)
  if (!days) parts.push(`${m} ${plural(m, 'минута', 'минуты', 'минут')}`)
  return { passed: false, text: `Осталось ${parts.join(' ')}`, urgent: diff < 24 * 3600 * 1000 }
}

/** ISO (UTC) → значение для <input type="datetime-local"> в локальном времени */
export function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function localInputToIso(value) {
  if (!value) return null
  return new Date(value).toISOString()
}
