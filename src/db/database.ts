import Dexie, { type EntityTable } from 'dexie'
import type { Patient } from '@/types/patient'
import type { OdontogramData } from '@/types/odontogram'
import type { ClinicalRecord } from '@/types/clinicalRecord'
import type { DigitalSignature } from '@/types/signature'
import type { Appointment, ScheduleColumn } from '@/types/appointment'
import type { ScheduleBlock } from '@/types/scheduleBlock'
import type { PriceItem, UserProfile } from '@/types/user'
import type { AuthSession, UserCredentials } from '@/types/auth'
import type { AuditLogEntry } from '@/types/audit'
import type { ClinicalRecordAddendum } from '@/types/addendum'
import type { EvolutionNoteAddendum } from '@/types/evolutionNoteAddendum'
import type { SyncOutboxEntry } from '@/types/syncOutbox'
import type { PatientClinicalDraft } from '@/types/patientClinicalDraft'
import type { CatalogItem, CatalogMeta } from '@/types/catalog'
import type { DiagnosticAid, DiagnosticAidBlobRecord } from '@/types/diagnosticAid'
import type {
  DentalService,
  DentalServiceAuthorizedSpecialty,
  DentalServicePrice,
  Professional,
} from '@/types/dentalServiceCatalog'
import { DEMO_DEFAULT_PASSWORD } from '@/types/auth'
import { seedUserCredentials } from '@/services/authService'
import { seedCatalogsIfEmpty } from '@/services/catalogService'
import { generateId } from '@/utils'
import { dentalServiceSpecialtyId, normalizeOrganizationId } from '@/utils/organizationId'
import type { RehusSpecialtyId } from '@/constants/rehusSpecialties'
import type { ElectronicInvoice } from '@/types/invoice'
import type { ElectronicCreditNote } from '@/types/creditNote'
import type { ClinicBillingSettingsRecord } from '@/types/billingModality'
import { CREDIT_NOTE_IMMUTABILITY_MESSAGE } from '@/types/creditNote'
import { isAutoTestSeedDisabled } from '@/db/autoSeedPreference'
import {
  assertElectronicInvoiceMutableUpdate,
} from '@/services/invoiceImmutabilityService'

export class DentalDatabase extends Dexie {
  patients!: EntityTable<Patient, 'id'>
  odontograms!: EntityTable<OdontogramData, 'id'>
  clinicalRecords!: EntityTable<ClinicalRecord, 'id'>
  signatures!: EntityTable<DigitalSignature, 'id'>
  appointments!: EntityTable<Appointment, 'id'>
  scheduleColumns!: EntityTable<ScheduleColumn, 'id'>
  scheduleBlocks!: EntityTable<ScheduleBlock, 'id'>
  users!: EntityTable<UserProfile, 'id'>
  prices!: EntityTable<PriceItem, 'id'>
  userCredentials!: EntityTable<UserCredentials, 'userId'>
  sessions!: EntityTable<AuthSession, 'id'>
  auditLogs!: EntityTable<AuditLogEntry, 'id'>
  clinicalAddendums!: EntityTable<ClinicalRecordAddendum, 'id'>
  patientClinicalDrafts!: EntityTable<PatientClinicalDraft, 'patientId'>
  catalogMeta!: EntityTable<CatalogMeta, 'id'>
  catalogItems!: EntityTable<CatalogItem, 'id'>
  diagnosticAids!: EntityTable<DiagnosticAid, 'id'>
  diagnosticAidBlobs!: EntityTable<DiagnosticAidBlobRecord, 'id'>
  dentalServices!: EntityTable<DentalService, 'id'>
  dentalServiceSpecialties!: EntityTable<DentalServiceAuthorizedSpecialty, 'id'>
  professionals!: EntityTable<Professional, 'id'>
  dentalServicePrices!: EntityTable<DentalServicePrice, 'id'>
  electronicInvoices!: EntityTable<ElectronicInvoice, 'id'>
  electronicCreditNotes!: EntityTable<ElectronicCreditNote, 'id'>
  evolutionNoteAddendums!: EntityTable<EvolutionNoteAddendum, 'id'>
  syncOutbox!: EntityTable<SyncOutboxEntry, 'id'>
  clinicBillingSettings!: EntityTable<ClinicBillingSettingsRecord, 'id'>

  constructor() {
    super('DentalEMR')

    this.version(1).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt',
      appointments: '++id, patientId, professionalId, unitId, startTime, status',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
    })

    this.version(2).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt',
      appointments: '++id, patientId, professionalId, unitId, startTime, status',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
    })

    this.version(3).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
    })

    this.version(4).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
    })

    this.version(5).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt, authorUserId',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
      clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
    })

    this.version(6).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt, authorUserId',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
      clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
      catalogMeta: 'id',
      catalogItems: 'id, catalogType, code',
    })

    this.version(7).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt, authorUserId',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      scheduleBlocks: '++id, date, type, columnId',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
      clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
      catalogMeta: 'id',
      catalogItems: 'id, catalogType, code',
    })

    this.version(8).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt, authorUserId',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      scheduleBlocks: '++id, date, type, columnId',
      patientClinicalDrafts: 'patientId, updatedAt',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
      clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
      catalogMeta: 'id',
      catalogItems: 'id, catalogType, code',
    })

    this.version(9).stores({
      patients: '++id, documentNumber, lastName, createdAt',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt, authorUserId',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      scheduleBlocks: '++id, date, type, columnId',
      patientClinicalDrafts: 'patientId, updatedAt',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
      clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
      catalogMeta: 'id',
      catalogItems: 'id, catalogType, code',
      diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
    })

    this.version(10)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
      })
      .upgrade(async (tx) => {
        const patients = await tx.table('patients').toArray()
        const now = new Date().toISOString()
        for (const patient of patients) {
          if (!patient.phase) {
            await tx.table('patients').update(patient.id, {
              phase: 'VALORACION_RAPIDA',
              updatedAt: now,
            })
          }
        }
      })

    this.version(11).stores({
      patients: '++id, documentNumber, lastName, createdAt, phase',
      odontograms: '++id, patientId, updatedAt',
      clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
      signatures: '++id, recordId, signedAt, authorUserId',
      appointments: '++id, columnId, startTime, status, procedureType',
      scheduleColumns: 'id, order, name',
      scheduleBlocks: '++id, date, type, columnId',
      patientClinicalDrafts: 'patientId, updatedAt',
      users: '++id, email',
      prices: '++id, userId, cupsCode',
      userCredentials: 'userId',
      sessions: 'id, userId, expiresAt, createdAt',
      auditLogs: 'id, userId, action, timestamp, resourceType',
      clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
      catalogMeta: 'id',
      catalogItems: 'id, catalogType, code',
      diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
    })

    this.version(12)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
        dentalServices:
          'id, organizationId, internalCode, [organizationId+internalCode], cupsCode, isActive',
        dentalServiceSpecialties:
          'id, serviceId, rehusSpecialtyId, [serviceId+rehusSpecialtyId]',
        professionals: 'id, userId, organizationId, rehusSpecialty, isActive',
        dentalServicePrices: 'id, serviceId, userId, [serviceId+userId]',
      })
      .upgrade(async (tx) => {
        const users = await tx.table('users').toArray()
        const now = new Date().toISOString()

        for (const user of users) {
          if (!user?.id) continue
          if (user.role !== 'odontologo' && user.role !== 'admin' && user.role !== 'superadmin') {
            continue
          }

          const existing = await tx.table('professionals').where('userId').equals(user.id).first()
          if (existing) continue

          const organizationId = normalizeOrganizationId(user.providerNit, user.id)
          const rehusSpecialty = (user.thsSpecialty ?? 'odontologia_general') as RehusSpecialtyId

          await tx.table('professionals').add({
            id: generateId(),
            userId: user.id,
            organizationId,
            documentType: user.documentType ?? 'CC',
            documentNumber: user.documentNumber ?? '',
            firstName: user.firstName ?? '',
            lastName: user.lastName ?? '',
            rehusSpecialty,
            repsCode: user.repsCode,
            isActive: true,
            createdAt: now,
            updatedAt: now,
          })
        }

        const prices = await tx.table('prices').toArray()
        for (const price of prices) {
          if (!price?.userId || !price.cupsCode) continue
          const user = users.find((item) => item.id === price.userId)
          if (!user) continue

          const organizationId = normalizeOrganizationId(user.providerNit, user.id)
          const internalCode = String(price.cupsCode).trim().toUpperCase()
          const serviceId = `svc:${organizationId}:${internalCode}`

          const existingService = await tx.table('dentalServices').get(serviceId)
          if (!existingService) {
            const isCustom = internalCode.startsWith('CUSTOM_')
            await tx.table('dentalServices').add({
              id: serviceId,
              organizationId,
              internalCode,
              name: price.procedure ?? internalCode,
              description: '',
              category: isCustom ? 'otro' : 'operatoria',
              cupsCode: isCustom ? null : internalCode.replace(/\D/g, '').padStart(6, '0').slice(0, 6),
              requiereCupsRips: !isCustom,
              cupsHomologo: null,
              defaultPrice: price.price ?? 0,
              currency: 'COP',
              isActive: true,
              createdAt: now,
              updatedAt: now,
            })

            await tx.table('dentalServiceSpecialties').add({
              id: dentalServiceSpecialtyId(serviceId, 'odontologia_general'),
              serviceId,
              rehusSpecialtyId: 'odontologia_general',
              createdAt: now,
            })
          }

          const priceId = `dsp:${serviceId}:${price.userId}`
          const existingPrice = await tx.table('dentalServicePrices').get(priceId)
          if (!existingPrice) {
            await tx.table('dentalServicePrices').add({
              id: priceId,
              serviceId,
              userId: price.userId,
              price: price.price ?? 0,
              currency: 'COP',
              updatedAt: now,
            })
          }
        }
      })

    this.version(13)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
        dentalServices:
          'id, organizationId, internalCode, [organizationId+internalCode], cupsCode, isActive',
        dentalServiceSpecialties:
          'id, serviceId, rehusSpecialtyId, [serviceId+rehusSpecialtyId]',
        professionals: 'id, userId, organizationId, rehusSpecialty, isActive',
        dentalServicePrices: 'id, serviceId, userId, [serviceId+userId]',
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString()
        const services = await tx.table('dentalServices').toArray()
        const generalCategories = new Set([
          'consulta',
          'operatoria',
          'preventivo',
          'exodoncia',
          'otro',
        ])

        for (const service of services) {
          if (!generalCategories.has(String(service.category ?? ''))) continue

          const linkId = dentalServiceSpecialtyId(service.id, 'odontologia_general')
          const existing = await tx.table('dentalServiceSpecialties').get(linkId)
          if (existing) continue

          await tx.table('dentalServiceSpecialties').add({
            id: linkId,
            serviceId: service.id,
            rehusSpecialtyId: 'odontologia_general',
            createdAt: now,
          })
        }
      })

    this.version(14)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
        dentalServices:
          'id, organizationId, internalCode, [organizationId+internalCode], cupsCode, isActive',
        dentalServiceSpecialties:
          'id, serviceId, rehusSpecialtyId, [serviceId+rehusSpecialtyId]',
        professionals: 'id, userId, organizationId, rehusSpecialty, isActive',
        dentalServicePrices: 'id, serviceId, userId, [serviceId+userId]',
        electronicInvoices:
          'id, patientId, invoiceNumber, status, issueDate, professionalId, createdAt',
      })

    this.version(15)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
        dentalServices:
          'id, organizationId, internalCode, [organizationId+internalCode], cupsCode, isActive',
        dentalServiceSpecialties:
          'id, serviceId, rehusSpecialtyId, [serviceId+rehusSpecialtyId]',
        professionals: 'id, userId, organizationId, rehusSpecialty, isActive',
        dentalServicePrices: 'id, serviceId, userId, [serviceId+userId]',
        electronicInvoices:
          'id, patientId, invoiceNumber, status, issueDate, professionalId, createdAt',
        evolutionNoteAddendums:
          'id, patientId, parentRecordId, parentEvolutionNoteId, signedAt, authorUserId',
        syncOutbox: 'id, entityType, action, patientId, evolutionNoteId, createdAt',
      })

    this.version(16)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
        dentalServices:
          'id, organizationId, internalCode, [organizationId+internalCode], cupsCode, isActive',
        dentalServiceSpecialties:
          'id, serviceId, rehusSpecialtyId, [serviceId+rehusSpecialtyId]',
        professionals: 'id, userId, organizationId, rehusSpecialty, isActive',
        dentalServicePrices: 'id, serviceId, userId, [serviceId+userId]',
        electronicInvoices:
          'id, patientId, invoiceNumber, status, issueDate, professionalId, createdAt',
        electronicCreditNotes:
          'id, patientId, creditNoteNumber, originalInvoiceNumber, originalInvoiceId, status, createdAt',
        evolutionNoteAddendums:
          'id, patientId, parentRecordId, parentEvolutionNoteId, signedAt, authorUserId',
        syncOutbox: 'id, entityType, action, patientId, evolutionNoteId, createdAt',
      })

    this.version(17)
      .stores({
        patients: '++id, documentNumber, lastName, createdAt, phase',
        odontograms: '++id, patientId, updatedAt',
        clinicalRecords: '++id, patientId, professionalId, signedAt, isLocked',
        signatures: '++id, recordId, signedAt, authorUserId',
        appointments: '++id, columnId, startTime, status, procedureType',
        scheduleColumns: 'id, order, name',
        scheduleBlocks: '++id, date, type, columnId',
        patientClinicalDrafts: 'patientId, updatedAt',
        users: '++id, email',
        prices: '++id, userId, cupsCode',
        userCredentials: 'userId',
        sessions: 'id, userId, expiresAt, createdAt',
        auditLogs: 'id, userId, action, timestamp, resourceType',
        clinicalAddendums: '++id, parentRecordId, patientId, signedAt, authorUserId',
        catalogMeta: 'id',
        catalogItems: 'id, catalogType, code',
        diagnosticAids: 'id, patientId, encounterId, [patientId+encounterId], fileType, createdAt',
        diagnosticAidBlobs: 'id, aidId, fileName, createdAt',
        dentalServices:
          'id, organizationId, internalCode, [organizationId+internalCode], cupsCode, isActive',
        dentalServiceSpecialties:
          'id, serviceId, rehusSpecialtyId, [serviceId+rehusSpecialtyId]',
        professionals: 'id, userId, organizationId, rehusSpecialty, isActive',
        dentalServicePrices: 'id, serviceId, userId, [serviceId+userId]',
        electronicInvoices:
          'id, patientId, invoiceNumber, status, issueDate, professionalId, createdAt',
        electronicCreditNotes:
          'id, patientId, creditNoteNumber, originalInvoiceNumber, originalInvoiceId, status, createdAt',
        evolutionNoteAddendums:
          'id, patientId, parentRecordId, parentEvolutionNoteId, signedAt, authorUserId',
        syncOutbox: 'id, entityType, action, patientId, evolutionNoteId, createdAt',
      })

    this.version(18).stores({
      clinicBillingSettings: 'id',
    })

    this.version(19).stores({
      patients: '++id, documentNumber, lastName, createdAt, phase, ownerUserId',
    })

    this.version(20).upgrade(async (tx) => {
      const users = await tx.table('users').toArray()
      for (const user of users) {
        if (!user?.id) continue
        const digits = String(user.repsCode ?? '').replace(/\D/g, '')
        const patch: Record<string, unknown> = {}
        if (digits === '500000000001') {
          patch.repsCode = '6800103898-01'
        }
        if (!user.repsStatus && (patch.repsCode || user.repsCode)) {
          patch.repsStatus = 'activo'
        }
        if (user.id === 'user-demo-001' && !user.rethusNumber) {
          patch.rethusNumber = '438265'
          patch.rethusStatus = 'activo'
          patch.repsEnabledSpecialties = user.repsEnabledSpecialties ?? ['odontologia_general']
        }
        if (Object.keys(patch).length > 0) {
          await tx.table('users').update(user.id, patch)
        }
      }
    })

    this.version(21).upgrade(async (tx) => {
      const stripLicense = async (tableName: 'users' | 'professionals') => {
        const rows = await tx.table(tableName).toArray()
        for (const row of rows) {
          if (!row?.id || !('professionalLicense' in row)) continue
          delete row.professionalLicense
          await tx.table(tableName).put(row)
        }
      }
      await stripLicense('users')
      await stripLicense('professionals')
    })

    this.version(22).upgrade(async (tx) => {
      const users = await tx.table('users').toArray()
      for (const user of users) {
        if (!user?.id) continue
        const patch: Record<string, unknown> = {}
        if (!user.providerType) {
          const hasReps = Boolean(String(user.repsCode ?? '').replace(/\D/g, ''))
          const hasNit = Boolean(String(user.providerNit ?? '').replace(/\D/g, ''))
          const hasRethus = Boolean(String(user.rethusNumber ?? '').replace(/\D/g, ''))
          patch.providerType =
            hasReps && hasNit && !hasRethus ? 'institucion' : 'profesional_independiente'
        }
        if (!user.legalName) {
          patch.legalName =
            String(user.clinicName ?? '').trim() ||
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
        }
        if (Object.keys(patch).length > 0) {
          await tx.table('users').update(user.id, patch)
        }
      }
    })

    this.version(23)
      .stores({
        users: '++id, email, documentNumber, clinicId',
      })
      .upgrade(async (tx) => {
        const users = await tx.table('users').toArray()
        for (const user of users) {
          if (!user?.id) continue
          if (!user.clinicId) {
            await tx.table('users').update(user.id, { clinicId: user.id, isClinicOwner: true })
          }
        }
      })
  }
}

export const db = new DentalDatabase()

/** Permite vaciar tablas inmutables (FEV / NC / outbox) en restauración o limpieza de prueba. */
let backupRestoreUnlock = false

export async function withBackupRestoreUnlock<T>(fn: () => Promise<T>): Promise<T> {
  backupRestoreUnlock = true
  try {
    return await fn()
  } finally {
    backupRestoreUnlock = false
  }
}

db.electronicInvoices.hook('deleting', (_primKey, _obj, transaction) => {
  if (backupRestoreUnlock) return
  transaction.abort()
  throw new Error(CREDIT_NOTE_IMMUTABILITY_MESSAGE)
})

db.electronicInvoices.hook('updating', (mods, _primKey, obj, transaction) => {
  if (backupRestoreUnlock) return
  const previous = obj as ElectronicInvoice
  const next = { ...previous, ...(mods as Partial<ElectronicInvoice>) }
  try {
    assertElectronicInvoiceMutableUpdate(previous, next)
  } catch (error) {
    transaction.abort()
    throw error
  }
})

db.electronicCreditNotes.hook('deleting', (_primKey, _obj, transaction) => {
  if (backupRestoreUnlock) return
  transaction.abort()
  throw new Error(CREDIT_NOTE_IMMUTABILITY_MESSAGE)
})

db.electronicCreditNotes.hook('updating', (_mods, _primKey, _obj, transaction) => {
  if (backupRestoreUnlock) return
  transaction.abort()
  throw new Error('Las notas crédito electrónicas son inmutables tras su emisión.')
})

db.syncOutbox.hook('deleting', (_primKey, obj, transaction) => {
  if (backupRestoreUnlock) return
  const entry = obj as SyncOutboxEntry
  if (
    entry.entityType === 'electronic_invoice' ||
    entry.entityType === 'electronic_credit_note'
  ) {
    transaction.abort()
    throw new Error(CREDIT_NOTE_IMMUTABILITY_MESSAGE)
  }
})

db.syncOutbox.hook('updating', (_mods, _primKey, obj, transaction) => {
  if (backupRestoreUnlock) return
  const previous = obj as SyncOutboxEntry
  if (
    previous.entityType === 'electronic_invoice' ||
    previous.entityType === 'electronic_credit_note'
  ) {
    transaction.abort()
    throw new Error('La cola de sincronización solo admite inserciones (CREATE) de facturación.')
  }
})

async function seedDefaultColumns(): Promise<void> {
  const count = await db.scheduleColumns.count()
  if (count > 0) return

  const now = new Date().toISOString()
  const defaults = [
    { name: 'Silla 1', order: 0 },
    { name: 'Silla 2', order: 1 },
    { name: 'Consultorio 3', order: 2 },
  ]

  for (const col of defaults) {
    await db.scheduleColumns.add({ ...col, id: generateId(), createdAt: now, updatedAt: now })
  }
}

async function ensureUserCredentials(userId: string, password: string): Promise<void> {
  const existing = await db.userCredentials.get(userId)
  if (existing) return
  await seedUserCredentials(userId, password)
}

/** Usuarios demo, credenciales y columnas por defecto */
export async function seedDemoData(): Promise<void> {
  const userCount = await db.users.count()
  if (userCount === 0) {
    await db.users.bulkAdd([
      {
        id: 'user-demo-001',
        email: 'odontologo@clinica.co',
        firstName: 'María',
        lastName: 'González',
        documentType: 'CC',
        documentNumber: '1234567890',
        role: 'odontologo',
        clinicName: 'Clínica Dental Sonrisa',
        clinicId: 'user-demo-admin',
        isClinicOwner: false,
        providerNit: '900123456-1',
        repsCode: '6800103898-01',
        repsStatus: 'activo',
        rethusNumber: '438265',
        rethusStatus: 'activo',
        thsSpecialty: 'odontologia_general',
        rehusSpecialty: 'odontologia_general',
        repsEnabledSpecialties: ['odontologia_general'],
      },
      {
        id: 'user-demo-admin',
        email: 'admin@clinica.co',
        firstName: 'Carlos',
        lastName: 'Administrador',
        documentType: 'CC',
        documentNumber: '9876543210',
        role: 'admin',
        clinicName: 'Clínica Dental Sonrisa',
        clinicId: 'user-demo-admin',
        isClinicOwner: true,
        providerNit: '900123456-1',
        repsCode: '6800103898-01',
        repsStatus: 'activo',
        thsSpecialty: 'odontologia_general',
      },
    ])
  }

  const adminExists = await db.users.get('user-demo-admin')
  if (!adminExists) {
    await db.users.add({
      id: 'user-demo-admin',
      email: 'admin@clinica.co',
      firstName: 'Carlos',
      lastName: 'Administrador',
      documentType: 'CC',
      documentNumber: '9876543210',
      role: 'admin',
      clinicName: 'Clínica Dental Sonrisa',
      clinicId: 'user-demo-admin',
      isClinicOwner: true,
      providerNit: '900123456-1',
      repsCode: '6800103898-01',
      repsStatus: 'activo',
    })
  }

  await ensureUserCredentials('user-demo-001', DEMO_DEFAULT_PASSWORD)
  await ensureUserCredentials('user-demo-admin', DEMO_DEFAULT_PASSWORD)

  await seedDefaultColumns()
  await seedCatalogsIfEmpty()
  await seedDemoDentalServices()

  if (!import.meta.env.DEV) return
  // `has_cleared_test_data` en localStorage: nunca reinsertar pacientes ficticios al recargar.
  if (isAutoTestSeedDisabled()) return

  try {
    const patientCount = await db.patients.count()
    if (patientCount > 0) return
    const { seedTestClinicalAndBillingData } = await import('./seed-test-data')
    await seedTestClinicalAndBillingData()
  } catch (error) {
    console.error('No se pudo cargar datos de prueba clínicos/facturación:', error)
  }
}

async function seedDemoDentalServices(): Promise<void> {
  const clinicNit = '900123456'
  const serviceId = `svc:${clinicNit}:TATUAJE_DENTAL`
  const existing = await db.dentalServices.get(serviceId)
  if (existing) return

  const now = new Date().toISOString()
  await db.dentalServices.add({
    id: serviceId,
    organizationId: clinicNit,
    internalCode: 'TATUAJE_DENTAL',
    name: 'Tatuaje Dental',
    description: 'Procedimiento estético sin código CUPS obligatorio para RIPS.',
    category: 'otro',
    cupsCode: null,
    requiereCupsRips: false,
    cupsHomologo: null,
    defaultPrice: 150000,
    currency: 'COP',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  await db.dentalServiceSpecialties.add({
    id: dentalServiceSpecialtyId(serviceId, 'odontologia_general'),
    serviceId,
    rehusSpecialtyId: 'odontologia_general',
    createdAt: now,
  })
}
