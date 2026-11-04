import { describe, expect, it } from 'vitest'
import {
  buildQuickBudgetPrintHtml,
  buildQuickBudgetWhatsAppMessage,
  resolveAccountHolderTitle,
} from './quickBudgetPrint'

describe('quickBudgetPrint', () => {
  const sample = {
    accountHolderName: 'Clínica Dental Sonrisa',
    patientName: 'Ana Pérez',
    patientDocument: 'CC 123',
    items: [
      { concepto: 'Ortodoncia con Brackets Metálicos — Cuota inicial', valor: 500000 },
      { concepto: 'Carilla (Resina) — dientes 11, 21', valor: 350000 },
    ],
    total: 850000,
    professionalName: 'Dr. Mauricio Soto',
  }

  it('usa clinicName como título del titular', () => {
    expect(
      resolveAccountHolderTitle({
        clinicName: 'Clínica Dental Sonrisa',
        firstName: 'Mauricio',
        lastName: 'Soto',
      }),
    ).toBe('Clínica Dental Sonrisa')
  })

  it('genera HTML con titular, paciente, ítems y total', () => {
    const html = buildQuickBudgetPrintHtml(sample)
    expect(html).toContain('Clínica Dental Sonrisa')
    expect(html).toContain('Presupuesto odontológico')
    expect(html).toContain('Ana Pérez')
    expect(html).toContain('CC 123')
    expect(html).toContain('Ortodoncia con Brackets Metálicos')
    expect(html).toContain('Total presupuesto')
    expect(html).toMatch(/\$\s?850\.000|850\.000/)
  })

  it('arma mensaje corto de WhatsApp para acompañar la imagen', () => {
    const message = buildQuickBudgetWhatsAppMessage(sample)
    expect(message).toContain('Hola Ana')
    expect(message).toContain('*Clínica Dental Sonrisa*')
    expect(message).toContain('Total:')
    expect(message).toContain('imagen adjunta')
    expect(message).not.toContain('Carilla (Resina)')
  })
})
