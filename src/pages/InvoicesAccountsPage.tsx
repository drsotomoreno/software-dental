import { useEffect, useState } from 'react'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { BillingModalitySettingsPanel } from '@/components/invoices/BillingModalitySettings'
import { ElectronicInvoicePanel } from '@/components/invoices/ElectronicInvoicePanel'
import { InvoiceLedgerPanel } from '@/components/invoices/InvoiceLedgerPanel'
import { useAudit } from '@/hooks/useAudit'

type InvoicesTab = 'ledger' | 'fev'

export function InvoicesAccountsPage() {
  const { audit } = useAudit()
  const [tab, setTab] = useState<InvoicesTab>('ledger')

  useEffect(() => {
    audit({
      action: 'VIEW_INVOICE_LEDGER',
      resourceType: 'invoice_ledger',
      details: tab === 'fev' ? 'Módulo FEV-Salud' : 'Consulta de cuentas y facturas',
    })
  }, [audit, tab])

  return (
    <RequirePermission permission="invoices.read">
      <div className="space-y-6">
        <BillingModalitySettingsPanel />

        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setTab('fev')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'fev' ? 'bg-white text-dental-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            FEV-Salud y RIPS
          </button>
          <button
            type="button"
            onClick={() => setTab('ledger')}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === 'ledger' ? 'bg-white text-dental-700 shadow-sm' : 'text-slate-600'
            }`}
          >
            Registro de facturas
          </button>
        </div>

        {tab === 'fev' ? <ElectronicInvoicePanel /> : <InvoiceLedgerPanel />}
      </div>
    </RequirePermission>
  )
}