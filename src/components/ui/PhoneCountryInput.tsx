import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  PHONE_COUNTRIES,
  COLOMBIA_PHONE_COUNTRY,
  composeInternationalPhone,
  splitInternationalPhone,
  toStoredInternationalPhone,
  type PhoneCountry,
} from '@/utils/phoneInternational'

interface PhoneCountryInputProps {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
  required?: boolean
  placeholder?: string
  className?: string
  /** lg: tableta del kiosco. */
  size?: 'md' | 'lg'
}

export function PhoneCountryInput({
  id,
  name,
  value,
  onChange,
  onBlur,
  disabled = false,
  required = false,
  placeholder = '300 123 4567',
  className = '',
  size = 'md',
}: PhoneCountryInputProps) {
  const listId = useId()
  const searchId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [country, setCountry] = useState<PhoneCountry>(
    () => splitInternationalPhone(value).country,
  )

  useEffect(() => {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) return
    setCountry(splitInternationalPhone(trimmed).country)
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    searchRef.current?.focus()
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const national = splitInternationalPhone(value).national
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase().replace(/^\+/, '')
    if (!term) return PHONE_COUNTRIES
    return PHONE_COUNTRIES.filter((item) => {
      return (
        item.name.toLowerCase().includes(term) ||
        item.iso.toLowerCase().includes(term) ||
        item.dial.includes(term)
      )
    })
  }, [query])

  const large = size === 'lg'
  const selected = country ?? COLOMBIA_PHONE_COUNTRY

  function emitNational(raw: string) {
    const trimmed = raw.trim()
    if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
      onChange(toStoredInternationalPhone(trimmed))
      return
    }
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length > 10) {
      onChange(toStoredInternationalPhone(digits.startsWith('00') ? trimmed : `+${digits}`))
      return
    }
    onChange(composeInternationalPhone(selected, digits))
  }

  function selectCountry(next: PhoneCountry) {
    setCountry(next)
    setOpen(false)
    setQuery('')
    const currentNational = splitInternationalPhone(value).national
    onChange(currentNational ? composeInternationalPhone(next, currentNational) : '')
  }

  return (
    <div ref={rootRef} className={`relative ${open ? 'z-30' : ''} ${className}`}>
      <div
        className={`flex w-full overflow-hidden bg-white shadow-sm focus-within:ring-1 ${
          large
            ? 'min-h-14 rounded-xl border-2 border-slate-300 focus-within:border-teal-600 focus-within:ring-teal-100'
            : 'rounded-lg border border-slate-300 focus-within:border-dental-500 focus-within:ring-dental-500'
        } ${disabled ? 'bg-slate-100' : ''}`}
      >
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
          className={`inline-flex shrink-0 items-center gap-1 border-r border-slate-300 bg-slate-50 font-medium text-slate-800 transition hover:bg-slate-100 disabled:cursor-not-allowed ${
            large ? 'gap-1.5 px-3 py-3 text-lg' : 'px-2.5 text-sm'
          }`}
        >
          <span aria-hidden>{selected.flag}</span>
          <span>+{selected.dial}</span>
          <ChevronDown className={large ? 'h-5 w-5 text-slate-500' : 'h-3.5 w-3.5 text-slate-500'} aria-hidden />
        </button>
        <input
          id={id}
          name={name}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required={required}
          disabled={disabled}
          value={national}
          placeholder={placeholder}
          onBlur={onBlur}
          onChange={(event) => emitNational(event.target.value)}
          aria-label={`Teléfono, indicativo +${selected.dial}`}
          className={`min-w-0 flex-1 bg-transparent text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed ${
            large ? 'px-4 py-3 text-xl' : 'px-3 py-2 text-sm'
          }`}
        />
      </div>

      {open && !disabled ? (
        <div className="absolute left-0 z-40 mt-1 w-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <label className="sr-only" htmlFor={searchId}>
              Buscar país
            </label>
            <input
              ref={searchRef}
              id={searchId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar país o indicativo"
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-dental-500 focus:ring-1 focus:ring-dental-500"
            />
          </div>
          <ul id={listId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">Ningún país coincide.</li>
            ) : (
              filtered.map((item) => {
                const active = item.iso === selected.iso
                return (
                  <li key={item.iso} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => selectCountry(item)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                        active ? 'bg-dental-50 text-dental-900' : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <span aria-hidden>{item.flag}</span>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="font-medium text-slate-500">+{item.dial}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
