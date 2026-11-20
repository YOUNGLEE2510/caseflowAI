# Data Model: Per-account AI suggestions switch

## User (existing, extended)

| Field | Type | Rules |
|---|---|---|
| `aiSuggestionsHidden` | boolean, default `false` | Only for staff roles (agent, manager); ignored for requesters |
| `aiVisibilityChangedAt` | Date \| null | Set on every change |
| `aiVisibilityChangedById` | ObjectId \| null | Admin who changed it |
| `studyCode` | string \| null | Optional, pattern `^p\d{2}$`, unique per organization when set |

Transitions: `shown ⇄ hidden`, only by an org admin of the same organization, never self.
Every transition and every refused attempt writes an audit entry
(`user.ai_visibility.change` / `user.ai_visibility.denied`) with `{ from, to }` only.

## CaseHandlingRecord (new)

| Field | Type | Rules |
|---|---|---|
| `organizationId` | ObjectId | required |
| `userId` | ObjectId | staff account with a `studyCode` |
| `caseId` | ObjectId | case in the same organization |
| `firstOpenedAt` | Date | set once (`$setOnInsert`) |
| `firstOpenedAiHidden` | boolean | flag value at first open |
| `confirmedAt` | Date \| null | set once, on first confirmation of category + priority |
| `confirmedAiHidden` | boolean \| null | flag value at confirmation (used as the row's condition) |
| `finalCategory`, `finalPriority` | string \| null | values at confirmation |

Unique index `(organizationId, userId, caseId)`. No free text, no PII.

## Case (existing, read-only for this feature)

- `ai.*` remains stored unchanged (FR-005).
- Optional `study.scenarioGroup` (`g1` \| `g2`) tag set when study cases are seeded.

## Export row (derived)

Matches `docs/study/timing_template.csv` first: `participant` (studyCode), `scenario_group`,
`condition` (`manual` if `confirmedAiHidden` else `assisted`), `started_at`, `confirmed_at`,
`classification_correct` (empty), `duplicate_jobs`, `false_links`; then `case_code`,
`final_category`, `final_priority`, `ai_category`, `ai_priority`. Rows without `confirmedAt` are
excluded (the analysis requires both timestamps).
