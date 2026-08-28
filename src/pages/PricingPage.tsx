import { useAuth } from '@/contexts/AuthContext'
import { TariffManagement } from '@/modules/tariff/TariffManagement'
import { useTariffSync } from '@/modules/tariff/useTariffSync'

export function PricingPage() {
  const { user } = useAuth()
  useTariffSync(user?.id)

  return <TariffManagement />
}
