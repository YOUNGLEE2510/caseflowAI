---

description: "Task list for the per-account AI suggestions switch"
---

# Tasks: Per-account AI suggestions switch for the user study

**Input**: Design documents from `/specs/001-ai-suggestions-switch/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included. Constitution Principle V requires focused tests, and the Development Workflow
gate requires denied-path tests for security-relevant changes (Principle II scope).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are repository-relative (`apps/api`, `apps/web`, `tests/e2e`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test scaffolding shared by all stories

- [x] T001 Create the integration test suite skeleton with mongodb-memory-server, an organization, an org admin, two staff accounts (one hidden, one shown), a requester, a second organization and one case with full stored AI output in apps/api/tests/aiVisibility.test.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The flag exists, is loaded on every request and reaches the web session

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add `aiSuggestionsHidden`, `aiVisibilityChangedAt`, `aiVisibilityChangedById` and `studyCode` to the user schema per data-model.md `User.aiSuggestionsHidden`, `User.aiVisibilityChangedAt`, `User.aiVisibilityChangedById`, `User.studyCode`, including a partial unique index on (organizationId, studyCode) in apps/api/src/models/user.ts
- [x] T003 Set `req.auth.aiHidden` from the already-loaded user (true only for staff roles with data-model.md `User.aiSuggestionsHidden` set) and add the field to the auth type in apps/api/src/middleware/auth.ts
- [x] T004 [P] Expose `aiSuggestionsHidden` in the session payload returned by `/auth/me`, login, refresh and OAuth exchange in apps/api/src/services/publicUser.ts
- [x] T005 [P] Add `aiSuggestionsHidden?: boolean` and `studyCode?: string | null` to the user type in apps/web/src/types.ts

**Checkpoint**: Flag can be set directly in the test database and is visible to API handlers and the web session

---

## Phase 3: User Story 1 - Participant works a case without AI help (Priority: P1) 🎯 MVP

**Goal**: A hidden account sees no AI-derived value anywhere, can still triage and assign by hand, and AI keeps running in the background

**Independent Test**: Set the flag on a test account in the database, open a case with stored AI output and every AI surface; confirm nothing AI-derived is returned or shown, then clear the flag and confirm everything returns

### Tests for User Story 1 ⚠️

> Write these tests first and confirm they fail before implementation

- [x] T006 [US1] Add tests that a hidden viewer receives `ai = { processingStatus }`, no `ai_triage` events and neutral `ai_reviewed` labels from `GET /cases` and `GET /cases/:id`, while a shown viewer receives the full stored AI output, in apps/api/tests/aiVisibility.test.ts
- [x] T007 [US1] Add tests for every guarded route in contracts/api.md (`/ai/analyze-intake`, `/recommendations`, `/recommendations/overview`, `/cases/:id/related`, `/knowledge/search`, `/cases/:id/assignment-options`, `/dashboard`, `/notifications`, `queue=at_risk`) asserting the hidden-viewer shape and the unchanged shape for shown viewers, in apps/api/tests/aiVisibility.test.ts
- [x] T008 [US1] Add a test that a case created while its handler is hidden still gets AI classification stored, and that `PATCH /cases/:id` manual triage, priority and assignment succeed for a hidden viewer, in apps/api/tests/aiVisibility.test.ts

### Implementation for User Story 1

- [x] T009 [US1] Create the visibility service with `isAiHidden(auth)`, `stripAiFromCase(value)` (keeps only `ai.processingStatus`, removes `ai_triage` events, relabels `ai_reviewed` to "Đã xác nhận phân loại") and `requireAiVisible` returning the empty shapes from contracts/api.md, in apps/api/src/services/aiVisibility.ts
- [x] T010 [US1] Change `presentCase(record, role)` to `presentCase(record, auth)` and apply `stripAiFromCase` for hidden viewers, updating all callers, in apps/api/src/services/casePolicy.ts, apps/api/src/routes/casesRouter.ts, apps/api/src/routes/caseActionsRouter.ts, apps/api/src/routes/caseMerge.ts and apps/api/src/routes/dashboardRouter.ts
- [x] T011 [US1] Return the hidden shape from `POST /ai/analyze-intake` and make `queue=at_risk` use overdue only for hidden viewers in apps/api/src/routes/casesRouter.ts
- [x] T012 [P] [US1] Guard `POST /recommendations` and `POST /recommendations/overview` in apps/api/src/routes/recommendations.ts
- [x] T013 [P] [US1] Guard `GET /cases/:id/related` in apps/api/src/routes/incidentActions.ts
- [x] T014 [P] [US1] Guard `POST /knowledge/search` (library listing stays unchanged) in apps/api/src/routes/knowledgeRouter.ts
- [x] T015 [US1] Return assignment options sorted by name without `skillMatch` and with `advisory: false` for hidden viewers in apps/api/src/routes/caseActionsRouter.ts
- [x] T016 [P] [US1] Omit AI review and risk figures from the dashboard for hidden viewers in apps/api/src/routes/dashboardRouter.ts
- [x] T017 [P] [US1] Omit AI-triage notifications from the inbox listing for hidden viewers in apps/api/src/routes/notifications.ts
- [x] T018 [P] [US1] Create a neutral, token-styled notice "Gợi ý AI đang tắt cho tài khoản này" with role="status" in apps/web/src/components/AiHiddenNotice.tsx
- [x] T019 [US1] Hide AI analysis, AI category/priority badges, recommendation, related-incident and assignment-suggestion panels and show the notice when `user.aiSuggestionsHidden` is set, in apps/web/src/pages/CaseDetailPage.tsx, apps/web/src/components/RecommendationPanel.tsx, apps/web/src/components/RelatedIncidentPanel.tsx and apps/web/src/components/AssignmentSuggestions.tsx
- [x] T020 [P] [US1] Skip the intake analysis panel and show the notice on the new-request form in apps/web/src/pages/NewCasePage.tsx
- [x] T021 [P] [US1] Hide AI flags (related-report badge) and the at-risk wording in the case list in apps/web/src/pages/CasesPage.tsx (no change needed: the flag is withheld by the API, so the badge never renders)
- [x] T022 [P] [US1] Hide the overview recommendations and AI review tiles in apps/web/src/pages/OverviewPage.tsx
- [x] T023 [P] [US1] Hide the "Hỏi kho tri thức" section while keeping the library filter in apps/web/src/pages/KnowledgePage.tsx
- [x] T024 [P] [US1] Add web tests that hidden panels are not rendered and the notice is shown in apps/web/src/components/AiStudySettings.test.tsx (covers the notice and the admin controls; page-level hiding is verified by the manual-condition screenshot run)

**Checkpoint**: Manual mode fully withholds AI on server and screen; assisted mode unchanged

---

## Phase 4: User Story 2 - Facilitator assigns conditions safely (Priority: P1)

**Goal**: Only organization administrators switch the flag, the change is audited, and the account list shows who is hidden

**Independent Test**: As org admin switch a staff account on and off and read the audit log; as the staff account, a manager, a requester target and an admin of another organization, confirm refusal

### Tests for User Story 2 ⚠️

- [x] T025 [US2] Add tests for `PATCH /users/:id/ai-visibility`: org admin succeeds and audit records `{ from, to }`; self-change 403 and audited as denied; manager 403; other organization 404; requester target 422; duplicate `studyCode` 409; change applies on the target's next request without re-login, in apps/api/tests/aiVisibility.test.ts

### Implementation for User Story 2

- [x] T026 [US2] Implement `PATCH /users/:id/ai-visibility` (strict body, org-scoped staff target, no self-target, sets data-model.md `User.aiSuggestionsHidden`, `User.aiVisibilityChangedAt`, `User.aiVisibilityChangedById`, `User.studyCode`; audits `user.ai_visibility.change` and `user.ai_visibility.denied` without payloads) in apps/api/src/routes/admin.ts
- [x] T027 [US2] Include `aiSuggestionsHidden` and `studyCode` in the staff list returned to org admins and managers (managers read-only) in apps/api/src/routes/admin.ts
- [x] T028 [US2] Add an "Ẩn gợi ý AI" labelled switch and a study-code field for staff accounts, shown only to org admins, with confirmation and an "AI ẩn" badge in the list, in apps/web/src/pages/UsersPage.tsx

**Checkpoint**: Facilitator can run the study end to end with manual timing

---

## Phase 5: User Story 3 - Researcher exports what happened (Priority: P2)

**Goal**: Objective timestamps per participant-case with the condition in force, exported in the study's timing format

**Independent Test**: With one study account, confirm two cases (one hidden, one shown), export, and run the existing timing analysis on the file after filling `classification_correct`

### Tests for User Story 3 ⚠️

- [ ] T029 [US3] Add tests that first open and first confirmation are recorded once with the flag value at that moment, that accounts without `studyCode` record nothing, and that the CSV has the contract header, ISO +07:00 times, the condition from `confirmedAiHidden`, formula-escaped cells and no names, phones, emails or descriptions, in apps/api/tests/aiVisibility.test.ts

### Implementation for User Story 3

- [ ] T030 [P] [US3] Create the `CaseHandlingRecord` model per data-model.md `CaseHandlingRecord.organizationId`, `CaseHandlingRecord.userId`, `CaseHandlingRecord.caseId`, `CaseHandlingRecord.firstOpenedAt`, `CaseHandlingRecord.firstOpenedAiHidden`, `CaseHandlingRecord.confirmedAt`, `CaseHandlingRecord.confirmedAiHidden`, `CaseHandlingRecord.finalCategory`, `CaseHandlingRecord.finalPriority` with the unique (organizationId, userId, caseId) index, and export it, in apps/api/src/models/case-handling.ts and apps/api/src/models/index.ts
- [ ] T031 [US3] Upsert `firstOpenedAt` on staff `GET /cases/:id` for accounts with data-model.md `User.studyCode` in apps/api/src/routes/casesRouter.ts
- [ ] T032 [US3] Set `confirmedAt`, `confirmedAiHidden`, `finalCategory` and `finalPriority` once on the first `PATCH /cases/:id` that sets category/service and priority, in apps/api/src/routes/caseActionsRouter.ts
- [ ] T033 [P] [US3] Add the optional case tag per data-model.md `Case.study.scenarioGroup` (`g1` | `g2`) in apps/api/src/models/case.ts
- [ ] T034 [US3] Implement `GET /study/export.csv?from&to` (org admin only, `Cache-Control: no-store`, header and column order from contracts/api.md, `duplicate_jobs` from maintenance tasks created by the participant for the case, `false_links` from incident links the participant made that were later removed) in apps/api/src/routes/admin.ts
- [ ] T035 [US3] Add an "Xuất dữ liệu thử nghiệm" button with a date range for org admins in apps/web/src/pages/UsersPage.tsx
- [ ] T036 [P] [US3] Document the export, the extra columns and the condition rule in docs/study/README.md

**Checkpoint**: All three stories work independently

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T037 Add the E2E suite: the same case viewed in manual and assisted mode at 1440px and 390px, light and dark, no horizontal overflow, notice visible, admin switch flow, in tests/e2e/ai-visibility.spec.ts
- [ ] T038 [P] Run the hover/contrast audit used for the redesign on the users page and the notice in both themes (Constitution VI)
- [ ] T039 Run quickstart.md end to end (API, web, AI tests, `npm run build`, `npm run test:e2e`) and record results in the PR description
- [ ] T040 [P] Update the "Xây công tắc ẩn gợi ý AI" task in the Notion task board with commit and test evidence

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none
- **Foundational (Phase 2)**: after Setup — blocks all stories
- **US1 (Phase 3)** and **US2 (Phase 4)**: after Foundational; independent of each other (US1 is testable by setting the flag directly)
- **US3 (Phase 5)**: after Foundational; uses the flag value but not the US2 UI
- **Polish (Phase 6)**: after the stories in scope

### Within Each User Story

- Tests first and failing → service → routes → web
- T009 before T010–T017; T010 before T011 and T015 (same files touched afterwards)
- T030 before T031, T032, T034

### Parallel Opportunities

- T004, T005 in parallel after T003
- US1: T012, T013, T014, T016, T017 in parallel after T009; web tasks T018, T020–T024 in parallel after T005
- US3: T030 and T033 in parallel; T036 any time
- US1 and US2 can be developed by two people at once (different files except `admin.ts`, used only by US2/US3)

---

## Parallel Example: User Story 1

```text
After T009 (visibility service):
  T012 recommendations guard   (apps/api/src/routes/recommendations.ts)
  T013 related-reports guard   (apps/api/src/routes/incidentActions.ts)
  T014 knowledge guard         (apps/api/src/routes/knowledgeRouter.ts)
  T016 dashboard figures       (apps/api/src/routes/dashboardRouter.ts)
  T017 notifications filter    (apps/api/src/routes/notifications.ts)
```

---

## Implementation Strategy

### MVP First (User Story 1 + minimal switch)

1. Phases 1–2
2. Phase 3 (US1) — validate with the flag set directly in a test database
3. T025–T026 from US2 so a facilitator can set the flag without database access
4. **STOP and validate**: run a dry-run pilot session with manual timing

### Incremental Delivery

1. Add the rest of US2 (list badge, UI switch) → facilitator-friendly
2. Add US3 (handling log + export) → objective timing for the analysis
3. Polish: E2E, contrast audit, quickstart, Notion evidence

---

## Notes

- Never test against Atlas; use mongodb-memory-server (Constitution V)
- Commit after each phase; commit to `main` only when the project owner asks
