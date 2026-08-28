/** @deprecated Use clinicalHistoryExport.ts */
export {
  buildClinicalHistoryExportPackage,
  buildClinicalHistoryExportPackage as buildPatientPortabilityPackage,
  downloadPortabilityPackage,
  exportClinicalHistory,
} from './clinicalHistoryExport'

export { PORTABILITY_FORMAT, PORTABILITY_VERSION } from '@/types/portability'
