import type { AuthUser } from "../middleware/auth.js";
import { CaseHandlingRecord } from "../models.js";

const isParticipant = (auth: AuthUser) => auth.role !== "requester" && /^p\d{2}$/.test(auth.studyCode || "");

/** A unique key and conditional upsert preserve the first event under concurrent requests. */
async function recordOnce(auth: AuthUser, caseId: string, field: "firstOpenedAt" | "confirmedAt", values: Record<string, unknown>) {
  if (!isParticipant(auth)) return;
  try {
    await CaseHandlingRecord.updateOne({ organizationId: auth.organizationId, userId: auth.id, caseId, [field]: null },
      { $set: { [field]: new Date(), ...values } }, { upsert: true, runValidators: true });
  } catch (error) {
    if (!(typeof error === "object" && error && "code" in error && error.code === 11000)) throw error;
    // Another request (or a previous event) already recorded this timestamp.
  }
}

export const recordStudyOpen = (auth: AuthUser, caseId: string) =>
  recordOnce(auth, caseId, "firstOpenedAt", { firstOpenedAiHidden: Boolean(auth.aiHidden) });
export const recordStudyConfirmation = (auth: AuthUser, caseId: string, category: string, priority: string) =>
  recordOnce(auth, caseId, "confirmedAt", { confirmedAiHidden: Boolean(auth.aiHidden), finalCategory: category, finalPriority: priority });
