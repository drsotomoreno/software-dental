export { DemoShell } from './DemoShell'
export { DemoStepPlaceholder } from './DemoStepPlaceholder'
export { DemoStepPatientName } from './DemoStepPatientName'
export { DemoStepChiefComplaint } from './DemoStepChiefComplaint'
export { DemoStepOdontogram } from './DemoStepOdontogram'
export { DemoStepDiagnosis } from './DemoStepDiagnosis'
export { DemoStepTreatmentPlan } from './DemoStepTreatmentPlan'
export { DemoStepConsentSignature } from './DemoStepConsentSignature'
export { DemoStepPayments } from './DemoStepPayments'
export { DemoStepEvolution } from './DemoStepEvolution'
export { DemoStepRips } from './DemoStepRips'
export { DemoSignatureCanvas } from './DemoSignatureCanvas'
export { DemoMicButton } from './DemoMicButton'
export { buildDemoRipsJson, stringifyDemoRips, downloadDemoRipsJson } from './buildDemoRipsJson'
export {
  openDemoPaymentDocument,
  type DemoPaymentDocumentKind,
} from './buildDemoPaymentDocuments'
export {
  EMPTY_DEMO_FORM,
  demoTreatmentTotal,
  demoBudgetBalance,
  demoMarkedToothIds,
  createEmptyDemoToothMark,
  type DemoFormData,
  type DemoDiagnosis,
  type DemoTreatmentRow,
  type DemoPayment,
  type DemoOdontogramMarks,
  type DemoToothMark,
} from './demoTypes'
