import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  getHomeDisplayTitle,
  HOME_DISPLAY_TITLE_PLACEHOLDER,
  setHomeDisplayTitle,
} from '@/services/homeDisplayTitleService'

interface EditableHomeTitleProps {
  userId: string | undefined
}

export function EditableHomeTitle({ userId }: EditableHomeTitleProps) {
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(getHomeDisplayTitle(userId))
    setIsEditing(false)
  }, [userId])

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isEditing])

  const startEditing = () => {
    if (!userId) return
    setDraft(title)
    setIsEditing(true)
  }

  const saveTitle = () => {
    if (!userId) return
    const saved = setHomeDisplayTitle(userId, draft)
    setTitle(saved)
    setIsEditing(false)
  }

  const cancelEditing = () => {
    setDraft(title)
    setIsEditing(false)
  }

  if (!userId) return null

  if (isEditing) {
    return (
      <div className="mt-4 max-w-2xl">
        <label htmlFor="home-display-title" className="sr-only">
          Título personalizado
        </label>
        <input
          id="home-display-title"
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={saveTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              saveTitle()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelEditing()
            }
          }}
          placeholder={HOME_DISPLAY_TITLE_PLACEHOLDER}
          className="w-full rounded-xl border border-dental-300 bg-white px-4 py-2.5 text-xl font-semibold text-slate-800 shadow-sm outline-none ring-dental-500 focus:border-dental-400 focus:ring-2"
          maxLength={120}
        />
        <p className="mt-1 text-xs text-slate-500">
          Presione Enter para guardar o Escape para cancelar. El título se conserva en este equipo.
        </p>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="group mt-4 flex max-w-2xl items-center gap-2 rounded-xl border border-transparent px-1 py-1 text-left transition hover:border-slate-200 hover:bg-slate-50"
      aria-label={title ? 'Editar título personalizado' : 'Agregar título personalizado'}
    >
      <h2
        className={`text-xl font-semibold sm:text-2xl ${
          title ? 'text-dental-800' : 'italic text-slate-400'
        }`}
      >
        {title || HOME_DISPLAY_TITLE_PLACEHOLDER}
      </h2>
      <Pencil
        className="h-4 w-4 shrink-0 text-slate-400 opacity-0 transition group-hover:opacity-100"
        aria-hidden
      />
    </button>
  )
}
