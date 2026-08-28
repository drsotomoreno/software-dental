export { toClinicalTitleCase } from './clinicalLabels'
export {
  findDaneMunicipalityByCode,
  formatDaneMunicipalityLabel,
  normalizeDaneSearchText,
  resolveDaneMunicipality,
  searchDaneMunicipalities,
} from './daneMunicipality'
export type { DaneMunicipality } from './daneMunicipality'
export { computeContentHash, serializeForHash, formatCurrency, formatDate, generateId } from './crypto'
export {
  toDexiePrimaryKey,
  toPatientForeignKey,
  getPatientByRouteId,
  getOdontogramByPatientRouteId,
} from './patientId'
export {
  deriveDiagnosesFromOdontogram,
  formatOdontogramFindings,
  mergeDiagnosesWithOdontogram,
  syncClinicalDataFromOdontogram,
  extractManualFindings,
  mergeFindingsWithOdontogram,
} from './odontogramDiagnosis'
export {
  suggestTreatmentFromOdontogram,
  mergeSuggestedTreatments,
} from './odontogramTreatmentPlan'
export { syncClinicalDataFromOrthodonticsAnnex } from './orthodonticsAnnexSync'
export { syncClinicalDataFromEndodonticsAnnex } from './endodonticsAnnexSync'
export { validateAcceptTreatment } from './patientPhase'
export {
  buildValuationConsentMetadata,
  getOrCreateDeviceId,
  persistValuationConsentOnPatient,
  recordValuationConsentAudit,
} from './valuationConsent'
export {
  calculateEndoBudget,
  createEmptyEndoAnnexData,
  formatEndoAnnexSummary,
  formatEndodonticBudgetSummary,
  formatEndoRadiographicFindingsSummary,
  getLikelyCanals,
  normalizeEndoAnnexData,
} from './endoAnnex'
export {
  calcBudgetSummary,
  buildBudgetFromTreatmentPlan,
  addTreatmentPlanItemToBudget,
  calcClinicalBudgetSummaryWithTax,
  syncPaymentPlanWithBudget,
  migrateLegacyBudget,
  createEmptyOrthodonticsBudget,
  createEmptyDentalImplantsBudget,
  normalizeOrthodonticsBudget,
  normalizeDentalImplantsBudget,
  calcOrthodonticsBudgetTotal,
  calcDentalImplantsBudgetTotal,
  calcSpecialtyBudgetTotal,
  lineSubtotal,
  orthodonticsPaymentPlanItems,
  dentalImplantsPaymentPlanItems,
} from './budget'
export {
  calcTotalPaid,
  calcTotalInvoiced,
  buildPaymentsFromPlan,
} from './paymentControl'
export {
  ORTHODONTICS_PAYMENT_TYPE_LABELS,
  buildOrthodonticsPaymentReason,
  suggestOrthodonticsPaymentAmount,
  getOrthodonticsControlNumbers,
  getPaidControlNumbers,
  hasInitialInstallmentPaid,
  calcOrthodonticsPaymentsTotal,
  calcOrthodonticsInvoicedTotal,
  createEmptyOrthodonticsPayment,
  normalizeOrthodonticsPayment,
  orthodonticsPaymentBalance,
} from './orthodonticsPaymentControl'
export {
  normalizeCie10ForRips,
  normalizeNit,
  normalizeCodPrestador,
  formatRipsDateTime,
  buildRipsFromRecords,
  buildDefaultRipsMetadata,
  downloadRipsJson,
  pickInvoiceNumberForRips,
  suggestRipsFilename,
  compileProcedimientosForRecord,
  compileEvolutionNotesToRipsProcedimientos,
  createCatalogLookupFromServices,
  extractCupsCodeFromText,
  resolveEvolutionNoteRipsCups,
} from './rips'
export {
  validateRipsExport,
  hasRipsBlockingErrors,
  countRipsIssues,
} from './ripsValidation'
export {
  validateRipsJsonStructure,
  validateRipsMetadataStructure,
  buildStructureValidationContext,
  validateRipsIdentificationDocument,
  validateRipsCodPrestador,
  validateRipsFevNumero,
  validateRipsAttentionDateTime,
  RIPS_COD_PRESTADOR_PATTERN,
  RIPS_DATETIME_PATTERN,
  RIPS_FEV_NUMERO_PATTERN,
} from './ripsStructureValidation'
export { validateThsConsultationCupsMatch } from './ripsThsValidation'
export {
  calcBillableLineTotal,
  formatBillableLineSummary,
  getCupsQuantityBillingRule,
  getDefaultQuantityForCups,
  getQuantityFieldLabel,
  isBridgeUnitBilling,
  isCupsQuantityLocked,
  normalizeQuantityForCups,
  validateCupsQuantityForBilling,
  validateProcedureBillingQuantities,
  CUPS_PROTESIS_FIJA_UNIDAD,
  CUPS_RESINA_FOTOCURADO,
} from './cupsBillingRules'
export {
  validateClinicalBudgetForRips,
  getFirstBlockingClinicalBudgetIssue,
} from './clinicalRipsValidation'
export {
  isEvolutionNoteExemptFromRips,
  validateEvolutionNote,
  validateEvolutionNotes,
  getFirstEvolutionNoteIssue,
} from './evolutionNoteValidation'
export { isNonRipsEvolutionNote } from '@/types/evolutionNote'
export {
  isGeneralDentistryService,
  canProfessionalPerformService,
  canProfessionalEvolveService,
  canProfessionalPerformCupsCode,
  canProfessionalEvolveCupsCode,
  ensureGeneralDentistrySpecialtyAuthorized,
} from './dentalServiceCatalogRules'
export {
  getCupsLocationRule,
  requiresFdiTooth,
  requiresFdiQuadrant,
  requiresSessionRepeatInRips,
  validateProcedureLocation,
  validateProcedureLocations,
  expandBillableLinesForRips,
  formatFdiQuadrantLabel,
  isValidFdiToothNumber,
} from './cupsLocationRules'
export type {
  CupsAnatomicalScope,
  CupsLocationRule,
  CupsLocationValidationIssue,
  ExpandedRipsBillableLine,
} from './cupsLocationRules'
export type {
  CupsQuantityBillingMode,
  CupsQuantityBillingRule,
  CupsBillingValidationIssue,
} from './cupsBillingRules'
export type { RipsSourceRecord } from './rips'
export { buildRipsPackageFromEncounter } from './ripsEncounter'
export type { EncounterRipsPackage } from './ripsEncounter'
export {
  buildFhirBundle,
  buildDefaultFhirMetadata,
  downloadFhirJson,
  suggestFhirFilename,
  fhirRef,
  fhirFullUrl,
} from './fhir'
export type { FhirSourceRecord } from './fhir'
export {
  validateFhirExport,
  hasFhirBlockingErrors,
  countFhirIssues,
} from './fhirValidation'
export {
  activarDictadoVoz,
  isVoiceDictationSupported,
} from './voiceDictation'
export type {
  VoiceDictationCallback,
  VoiceDictationController,
  VoiceDictationOptions,
  VoiceDictationState,
} from './voiceDictation'
export {
  parseClinicalVoiceCommand,
  describeClinicalVoiceCommand,
  normalizeVoiceText,
  extractToothNumbers,
  extractFaces,
} from './voiceCommandParser'
export type { ClinicalVoiceCommand } from './voiceCommandParser'
export {
  executeClinicalVoiceCommand,
  processClinicalVoiceTranscript,
} from './clinicalVoiceExecutor'
export type { ClinicalVoiceExecutionResult } from './clinicalVoiceExecutor'
export { activarAsistenteVozClinico } from './clinicalVoiceAssistant'
export {
  applyEdentulismScope,
  applyFaceState,
  applyFaceStates,
  applyGlobalState,
  reconcileEdentulismScope,
} from './odontogramMutations'
