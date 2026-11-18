import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Clock, Download, FileArchive, GripVertical, Layers,
  Pencil, Presentation, RefreshCw, Trash2, Users,
} from 'lucide-react'
import { Alert, Badge, Button, ConfirmModal, EmptyState, PageLoader } from '../../components/ui'
import { api, download } from '../../lib/api'
import { useToast } from '../../lib/context'
import { formatDateTime, formatSize, plural } from '../../lib/format'
import { useStaff } from './StaffApp'
import ParticipantModal from './ParticipantModal'

function Row({ p, index, total, su, onMove, onEdit, onDownload }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id, disabled: !su })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-white px-3 py-3 dark:bg-slate-900 sm:gap-3 sm:px-4 ${
        isDragging ? 'relative z-10 rounded-xl shadow-xl ring-2 ring-primary' : ''
      }`}
    >
      {su && (
        <button
          className="icon-btn hidden h-8 w-8 cursor-grab touch-none active:cursor-grabbing sm:inline-flex"
          aria-label="Перетащить"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-medium">{p.full_name || <span className="italic text-slate-400">ФИО не указано</span>}</span>
          {p.grade && <Badge>{p.grade}</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="truncate">{p.email}</span>
          {p.file ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> {formatSize(p.file.size)} · {formatDateTime(p.file.uploaded_at)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Clock className="h-3.5 w-3.5" /> нет презентации
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {su && (
          <div className="flex flex-col sm:hidden">
            <button className="icon-btn h-7 w-7" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Выше">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button className="icon-btn h-7 w-7" disabled={index === total - 1} onClick={() => onMove(index, 1)} aria-label="Ниже">
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        )}
        <button className="icon-btn" disabled={!p.file} onClick={() => onDownload(p)} title="Скачать презентацию" aria-label="Скачать">
          <Download className="h-4 w-4" />
        </button>
        {su && (
          <button className="icon-btn" onClick={() => onEdit(p)} title="Редактировать" aria-label="Редактировать">
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

function MergedPanel({ section, su, onUpdate }) {
  const toast = useToast()
  const [building, setBuilding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const m = section.merged

  const outdated = !!m?.outdated

  const build = async () => {
    setBuilding(true)
    try {
      const r = await api(`/admin/sections/${section.id}/merge`, { method: 'POST', auth: 'staff' })
      onUpdate(r)
      toast.success('Объединённая презентация готова')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBuilding(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      onUpdate(await api(`/admin/sections/${section.id}/merge`, { method: 'DELETE', auth: 'staff' }))
      setConfirmDelete(false)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(false)
    }
  }

  if (!m && !su) return null

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold">Объединённая презентация</p>
            {m ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                {formatDateTime(m.created_at)} · {m.participants_count}{' '}
                {plural(m.participants_count, 'участник', 'участника', 'участников')} · {m.slides_count}{' '}
                {plural(m.slides_count, 'слайд', 'слайда', 'слайдов')} · {formatSize(m.file_size)}
              </p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                Все презентации по порядку с разделительными слайдами
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {m && (
            <Button
              onClick={() =>
                download(`/staff/sections/${section.id}/merged`, { auth: 'staff' }).catch((e) => toast.error(e.message))
              }
            >
              <Download className="h-4 w-4" /> Скачать
            </Button>
          )}
          {su && (
            <Button variant={m ? 'secondary' : 'primary'} onClick={build} loading={building} disabled={!section.uploaded_count}>
              {!building && (m ? <RefreshCw className="h-4 w-4" /> : <Presentation className="h-4 w-4" />)}
              {m ? 'Пересобрать' : 'Собрать'}
            </Button>
          )}
          {su && m && (
            <button className="icon-btn hover:text-red-600" onClick={() => setConfirmDelete(true)} aria-label="Удалить объединённую">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {m && (outdated || m.warnings.length > 0) && (
        <div className="space-y-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800 sm:px-5">
          {outdated && (
            <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              После сборки изменились файлы, порядок или данные участников{su ? ' — пересоберите презентацию' : ''}.
            </p>
          )}
          {m.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {w}
            </p>
          ))}
        </div>
      )}
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        loading={deleting}
        title="Удалить объединённую презентацию?"
        text="Организаторы секции больше не смогут её скачать, пока вы не соберёте новую."
      />
    </div>
  )
}

export default function SectionView() {
  const { id } = useParams()
  const { su } = useStaff()
  const toast = useToast()
  const [section, setSection] = useState(null)
  const [participants, setParticipants] = useState(null)
  const [editing, setEditing] = useState(null)
  const [zipLoading, setZipLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    try {
      const [secs, parts] = await Promise.all([
        api('/staff/sections', { auth: 'staff' }),
        api(`/staff/sections/${id}/participants`, { auth: 'staff' }),
      ])
      const sec = secs.find((s) => String(s.id) === String(id))
      if (!sec) return setNotFound(true)
      setSection(sec)
      setParticipants(parts)
    } catch (e) {
      if (e.status === 404 || e.status === 403) setNotFound(true)
      else toast.error(e.message)
    }
  }, [id, toast])

  useEffect(() => {
    setSection(null)
    setParticipants(null)
    setNotFound(false)
    load()
  }, [load])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const saveOrder = async (next) => {
    const prev = participants
    setParticipants(next)
    try {
      await api(`/admin/sections/${id}/order`, { method: 'PUT', body: { ids: next.map((p) => p.id) }, auth: 'staff' })
      if (section.merged) {
        const secs = await api('/staff/sections', { auth: 'staff' })
        setSection(secs.find((s) => String(s.id) === String(id)) || section)
      }
    } catch (e) {
      toast.error(e.message)
      setParticipants(prev)
    }
  }

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    const from = participants.findIndex((p) => p.id === active.id)
    const to = participants.findIndex((p) => p.id === over.id)
    saveOrder(arrayMove(participants, from, to))
  }

  const move = (idx, dir) => saveOrder(arrayMove(participants, idx, idx + dir))

  const downloadOne = (p) =>
    download(`/staff/participants/${p.id}/presentation`, { auth: 'staff' }).catch((e) => toast.error(e.message))

  const downloadZip = async () => {
    setZipLoading(true)
    try {
      await download(`/staff/sections/${id}/zip`, { auth: 'staff', fallbackName: 'presentations.zip' })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setZipLoading(false)
    }
  }

  if (notFound)
    return (
      <div className="card">
        <EmptyState icon={Layers} title="Секция не найдена" action={<Link to="/staff" className="btn-secondary">К списку секций</Link>} />
      </div>
    )
  if (!section || !participants) return <PageLoader />

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        {su && (
          <Link to="/staff" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Все секции
          </Link>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Секция</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{section.name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4" />
              {section.participants_count} {plural(section.participants_count, 'участник', 'участника', 'участников')} ·{' '}
              {section.uploaded_count} загрузили презентацию
            </p>
          </div>
          <Button variant="secondary" onClick={downloadZip} loading={zipLoading} disabled={!section.uploaded_count}>
            {!zipLoading && <FileArchive className="h-4 w-4" />} Скачать всё (ZIP)
          </Button>
        </div>
      </div>

      <MergedPanel section={section} su={su} onUpdate={setSection} />

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">Порядок выступлений</h2>
          {su && participants.length > 1 && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              <span className="hidden sm:inline">Перетаскивайте строки, чтобы изменить порядок</span>
              <span className="sm:hidden">Меняйте порядок стрелками</span>
            </span>
          )}
        </div>
        {participants.length === 0 ? (
          <EmptyState icon={Users} title="В секции пока нет участников" text="Участники появятся здесь после регистрации." />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={participants.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                {participants.map((p, i) => (
                  <Row
                    key={p.id}
                    p={p}
                    index={i}
                    total={participants.length}
                    su={su}
                    onMove={move}
                    onEdit={setEditing}
                    onDownload={downloadOne}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {!su && (
        <Alert type="info">
          Файлы в ZIP-архиве пронумерованы в порядке выступлений: «01. Фамилия Имя Отчество (класс).pptx».
        </Alert>
      )}

      <ParticipantModal participant={editing} onClose={() => setEditing(null)} onChanged={() => load()} onDeleted={() => load()} />
    </div>
  )
}
