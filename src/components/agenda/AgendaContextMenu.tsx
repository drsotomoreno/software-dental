import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface AgendaContextMenuItem {
  id: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

interface AgendaContextMenuProps {
  x: number
  y: number
  items: AgendaContextMenuItem[]
  onClose: () => void
}

export function AgendaContextMenu({ x, y, items, onClose }: AgendaContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      onClose()
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', onClose, true)
    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', onClose, true)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const menu = (
    <div
      ref={menuRef}
      className="agenda-context-menu"
      style={{ top: `${y}px`, left: `${x}px` }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!item.disabled) item.onClick()
          }}
          className={`agenda-context-menu__item ${
            item.danger ? 'agenda-context-menu__item--danger' : ''
          }`}
        >
          {item.icon && <span className="agenda-context-menu__icon">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )

  return createPortal(menu, document.body)
}
