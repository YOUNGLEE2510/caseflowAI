# Research: Per-account AI suggestions switch

## R1. Where to enforce withholding

- **Decision**: Resolve `aiHidden` in the auth middleware (the user document is already loaded
  there) and enforce it in two places: (a) `presentCase(record, auth)` strips AI fields from every
  case returned to a hidden viewer; (b) a `requireAiVisible` guard on AI-only endpoints returns an
  empty, well-formed result.
- **Rationale**: Case data reaches the browser through a handful of routes that already call
  `presentCase`; one presenter keeps list, detail, merge and dashboard consistent. Guards on the
  AI-only endpoints cover direct calls (FR-004).
- **Alternatives considered**: Hiding only in React (rejected: FR-004, trivially bypassed in
  DevTools); a separate "study" API (rejected: duplicates authorization).

## R2. What counts as AI-derived on a case

- **Decision**: For hidden viewers, the case `ai` object is reduced to processing state only
  (`processingStatus`); removed: `classification`, `confidence`, `summary`, `extracted`,
  `topCandidates`, `routingMismatch`, `riskScore`, `riskFactors`, `similarCaseIds`,
  `suggestedResponse`, `sharedIncidentCandidate`, `modelVersion`, `reviewStatus`,
  `humanCorrectedLabel`. Timeline events of type `ai_triage` are removed and `ai_reviewed` events
  are relabelled to a neutral "Đã xác nhận phân loại" without mentioning AI or the AI label.
- **Rationale**: The current event label "Đã điều chỉnh phân loại AI thành X" reveals that the AI
  disagreed — enough to bias a participant.
- **Alternatives considered**: Deleting `ai` entirely (rejected: UI uses `processingStatus` to show
  loading states; keeping it avoids special cases).

## R3. Assignment options

- **Decision**: `/cases/:id/assignment-options` stays available (manual assignment needs the list)
  but, for hidden viewers, returns agents sorted by name with workload counts only — no
  `skillMatch`, no ranking, `advisory: false`.
- **Rationale**: The ranking is a rule-based recommendation the UI presents as a suggestion;
  workload counts are operational facts a dispatcher would see anyway.

## R4. Queues and counts based on AI risk

- **Decision**: For hidden viewers the `at_risk` queue falls back to "overdue only" (no AI risk
  score), and dashboard tiles that come from AI (AI review rate, risk distribution) are omitted.
- **Rationale**: Prevents indirect leakage of risk scores through list membership.

## R5. Knowledge page

- **Decision**: `/knowledge/search` (question answering with citations) is withheld; the library
  list and keyword filter remain (spec assumption).

## R6. Who changes the flag and how it propagates

- **Decision**: Admin route `PATCH /users/:id/ai-visibility` (org_admin, platform_admin);
  target must be a staff user in the caller's organization; caller cannot target self. The flag is
  read on every request, so the change applies on the next request (FR-013) with no session
  revocation. The session payload (`/auth/me`, refresh) carries it for the UI.
- **Rationale**: Clarification 2026-11-19 (admins only). Reading per request avoids stale tokens.

## R7. Timing capture

- **Decision**: New `CaseHandlingRecord` keyed by (organizationId, userId, caseId):
  `firstOpenedAt` set once on the first staff `GET /cases/:id`; `confirmedAt` set once on the first
  `PATCH /cases/:id` that sets category/service and priority; each write stores `aiHidden` at that
  moment. Duplicate tasks created and incident links later removed are counted from existing
  audit/maintenance records at export time.
- **Rationale**: Objective timestamps without a stopwatch; idempotent upserts; no change for
  accounts without a `studyCode` (records only written when the user has a study code).
- **Alternatives considered**: Client-side timers (rejected: tab switches and reloads distort
  them); reusing the audit log (rejected: audit retention and payload rules differ).

## R8. Export format

- **Decision**: `GET /study/export.csv?from&to` (org_admin) with columns
  `participant,scenario_group,condition,started_at,confirmed_at,classification_correct,duplicate_jobs,false_links,case_code,final_category,final_priority,ai_category,ai_priority`.
  The first eight columns match `docs/study/timing_template.csv` (`classification_correct` left
  empty for the researcher); extra columns follow. Times are ISO 8601 with +07:00.
  `scenario_group` comes from a study tag on the case (set when seeding study cases).
- **Rationale**: Matches `docs/study/timing_template.csv` plus documented extra columns
  (spec assumption); CSV cells are escaped against formula injection.

## R9. Notifications

- **Decision**: Notification texts produced for AI triage are not generated for hidden viewers'
  inbox listing (filtered on read by type `ai_*`); other notifications unchanged.
