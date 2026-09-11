// Point d'entree unique des types de l'application.
//
// Le contenu reel vit dans src/features/<domaine>/types.ts depuis le 2026-09-12 :
// ce fichier ne fait plus que re-exporter, pour que les imports existants
// (`import type { X } from "../types"`) continuent de fonctionner a l'identique.
//
// Pour du code nouveau, preferer l'import direct du domaine concerne :
//   import type { AoStep } from "../features/ao/types";

export type { Model, AppState, RagStatus, AppDefaults, UsageData } from "./shared/app.types";
export type { User } from "./features/auth/types";
export type { CompanyData, GenerationResult, HistorySummary, HistoryEntry } from "./features/generation/types";
export { DEFAULT_COMPANY } from "./features/generation/types";
export type {
  ActeEngagementData, CompanyCase, FillerOutputFile, FillerResult,
  OffreTechniqueOutputFile, SectionScore, QualityReport, OffreTechniqueResult,
} from "./features/tools/types";
export { DEFAULT_ACTE_ENGAGEMENT } from "./features/tools/types";
export type { ChatMessage, ChatApiResponse } from "./features/chat/types";
export type { JobSummary, MarcheSummary, MarcheDetail } from "./features/marches/types";
export type {
  CompanyProfile, CompanyProfileForm, ProfileCheck,
  StaffCv, StaffCvForm, AoTeamMember, CompanyDocument,
} from "./features/company/types";
export type {
  AoDocumentOut, AoSummary, AoResponse, AoStatus,
  AoMode, AoStepKey, AoStepStatut, AoStep, StepAssistResponse,
} from "./features/ao/types";
export type {
  ScrapedAoStatus, ScrapedAo, EligibilityVerdictType, EligibilityVerdict,
  ScrapedAoList, WatcherFilters, ModePassation, AoCategorie, Secteur,
  BdcStatus, ScrapedBdc, ScrapedBdcList, WatcherBdcFilters, NaturePrestation,
} from "./features/veille/types";
export type {
  SubscriptionStatus, PlanCode, PlanLimit, BillingUsage, Subscription,
} from "./features/billing/types";
