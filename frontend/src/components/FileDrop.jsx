import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'

export default function FileDrop({ onFile, disabled, accept = '.pptx', title, hint, compact }) {
  const input = useRef(null)
  const [over, setOver] = useState(false)

  const pick = (files) => {
    const f = files?.[0]
    if (f) onFile(f)
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !disabled && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) pick(e.dataTransfer.files)
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition
        ${compact ? 'px-4 py-5' : 'px-6 py-10'}
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        ${
          over
            ? 'border-primary bg-primary/5'
            : 'border-slate-300 hover:border-primary/60 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50'
        }`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <UploadCloud className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-semibold">{title || 'Перетащите файл сюда или нажмите, чтобы выбрать'}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
