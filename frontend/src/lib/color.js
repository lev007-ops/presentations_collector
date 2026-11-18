function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function applyPrimaryColor(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return
  const rgb = hexToRgb(hex)
  const root = document.documentElement.style
  const light = luminance(rgb) > 0.45
  root.setProperty('--primary', rgb.join(' '))
  root.setProperty('--primary-fg', light ? '17 24 39' : '255 255 255')
  root.setProperty('--primary-soft', mix(rgb, [255, 255, 255], 0.9).join(' '))
  root.setProperty('--primary-strong', mix(rgb, [0, 0, 0], 0.18).join(' '))
}
