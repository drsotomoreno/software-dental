interface ClinicalChipCheckboxProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

interface TodoNormalButtonProps {
  onClick: () => void
  disabled?: boolean
}

function ClinicalChipCheckbox({
  label,
  checked,
  onChange,
  disabled = false,
}: ClinicalChipCheckboxProps) {
  return (
    <label className="clinical-todo-normal-label">
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded border-green-300 text-dental-600 focus:ring-dental-500"
      />
      {label}
    </label>
  )
}

export function TodoNormalButton({ onClick, disabled = false }: TodoNormalButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="clinical-todo-normal"
    >
      Todo Normal
    </button>
  )
}

export function TodoNormalCheckbox({
  checked,
  onChange,
  disabled = false,
}: Omit<ClinicalChipCheckboxProps, 'label'>) {
  return (
    <ClinicalChipCheckbox
      label="Todo Normal"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  )
}

export function NoReportaCheckbox({
  checked,
  onChange,
  disabled = false,
}: Omit<ClinicalChipCheckboxProps, 'label'>) {
  return (
    <ClinicalChipCheckbox
      label="No Reporta"
      checked={checked}
      onChange={onChange}
      disabled={disabled}
    />
  )
}
