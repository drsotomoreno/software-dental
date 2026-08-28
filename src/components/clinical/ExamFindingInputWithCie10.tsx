import type { ExamCie10Link } from '@/types/stomatologicalExam'
import { VoiceDictationButton } from '@/components/voice'
import { Cie10FindingSuggestions, SelectedCie10Badge } from './Cie10FindingSuggestions'

interface ExamFindingInputWithCie10Props {
  value: string
  onChange: (value: string) => void
  cie10: ExamCie10Link | null
  onCie10Change: (link: ExamCie10Link | null) => void
  disabled?: boolean
  placeholder?: string
  multiline?: boolean
  rows?: number
  inputId?: string
  className?: string
  showSuggestions?: boolean
  voiceEnabled?: boolean
}

export function ExamFindingInputWithCie10({
  value,
  onChange,
  cie10,
  onCie10Change,
  disabled = false,
  placeholder,
  multiline = false,
  rows = 2,
  inputId,
  className = 'input-field',
  showSuggestions = true,
  voiceEnabled = true,
}: ExamFindingInputWithCie10Props) {
  const handleSelect = (option: { code: string; description: string }) => {
    onCie10Change(option)
    if (!value.trim()) {
      onChange(option.description)
    }
  }

  return (
    <div>
      {cie10 && (
        <SelectedCie10Badge
          value={cie10}
          disabled={disabled}
          onClear={() => onCie10Change(null)}
        />
      )}
      {voiceEnabled && inputId && !disabled && (
        <div className="mb-1 flex justify-end">
          <VoiceDictationButton
            targetInputId={inputId}
            getValue={() => value}
            onValueChange={onChange}
          />
        </div>
      )}
      <div className="relative">
        {multiline ? (
          <textarea
            id={inputId}
            rows={rows}
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={`${className} resize-y`}
          />
        ) : (
          <input
            id={inputId}
            type="text"
            disabled={disabled}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className={className}
          />
        )}
        {showSuggestions && !cie10 && (
          <Cie10FindingSuggestions
            query={value}
            onSelect={handleSelect}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  )
}
