// Point d'entree unique des appels backend.
//
// Le contenu reel vit dans src/features/<domaine>/api.ts depuis le 2026-09-12 :
// ce fichier ne fait plus que re-exporter, pour que les imports existants
// (`import { fetchAo } from "../api"`) continuent de fonctionner a l'identique.
//
// Pour du code nouveau, preferer l'import direct du domaine concerne :
//   import { fetchAoSteps } from "../features/ao/api";
//
// Le socle HTTP partage (jeton, authHeaders, helpers de reponse) vit dans
// src/shared/lib/http.ts : aucun composant n'appelle fetch() directement.

export { getToken, setToken, clearToken } from "./shared/lib/http";

export type { PasswordRules } from "./features/auth/api";
export {
  getPasswordRules, register, verifyOtp, forgotPassword, resetPassword, login,
  googleCallbackUrl, startGoogleLogin, consumeGoogleOAuthState,
  loginWithGoogleCode, getMe,
} from "./features/auth/api";

export type { InvitePreview } from "./features/org/api";
export {
  inviteMember, listOrgMembers, removeOrgMember, previewInvite, acceptInvite,
} from "./features/org/api";

export {
  fetchDefaults, fetchModels, fetchRagStatus, fetchUsage, resetUsage, reindexRag,
} from "./shared/app.api";

export {
  generate, exportDocx, fetchHistory, fetchHistoryEntry, deleteHistoryEntry,
  clearHistory,
} from "./features/generation/api";

export type { PdfExtractResult } from "./features/tools/api";
export {
  extractPdfText, startSign, getSignStatus, cancelSign, extractBordereauExcel,
  fillActeEngagement, startFiller, getFillerStatus, cancelFiller, runFiller,
  downloadFillerFile, runOffreTechnique, downloadOffreTechniqueFile,
} from "./features/tools/api";

export { sendChatMessage } from "./features/chat/api";

export {
  createMarche, fetchMarches, fetchMarche, uploadCps, uploadRc,
  downloadPresignedFile,
} from "./features/marches/api";

export {
  createAo, fetchAos, fetchAo, fetchAoStatus, uploadAoDocuments, startAoPipeline,
  fetchAoSteps, validateAoStep, rerunAoStep, abandonAo, askStepAssistant,
  cancelAoPipeline, getAoDocumentDownloadUrl, deleteAo,
} from "./features/ao/api";

export type { CvExtractResult } from "./features/company/api";
export {
  fetchCompanyProfile, upsertCompanyProfile, checkCompanyProfile, uploadSignature,
  uploadCachet, deleteSignature, deleteCachet, uploadLuEtAccepte, deleteLuEtAccepte,
  fetchCompanyDocuments, uploadCompanyDocument, deleteCompanyDocument, fetchStaffCvs,
  createStaffCv, updateStaffCv, deleteStaffCv, uploadCvPdf, fetchAoTeam,
  extractCvFromPdf, uploadTemplateNoteMetho, deleteTemplateNoteMetho,
} from "./features/company/api";

export {
  fetchScrapedAos, fetchModesPassation, fetchSecteurs, fetchScrapedAo,
  updateScrapedAoStatus, importScrapedAo, downloadScrapedAoZip, analyzeScrapedAo,
  fetchScrapedBdc, fetchNaturesPrestation, fetchScrapedBdcOne, updateBdcStatus,
} from "./features/veille/api";

export { CHECKOUT_INTENT_KEY, getSubscription, startCheckout } from "./features/billing/api";

export type {
  NotificationPreferences, NotificationTestSendResult,
} from "./features/notifications/api";
export {
  fetchNotificationPreferences, updateNotificationPreferences, sendTestNotification,
} from "./features/notifications/api";
