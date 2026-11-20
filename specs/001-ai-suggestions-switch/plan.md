# Implementation Plan: Per-account AI suggestions switch for the user study

**Branch**: `001-ai-suggestions-switch` | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ai-suggestions-switch/spec.md`

## Summary

Add a per-staff-account flag `aiSuggestionsHidden` that organization administrators set. The API
resolves it on every authenticated request and withholds AI-derived data in one presentation
layer (cases, timeline events, lists) plus a guard on the AI-only endpoints (intake analysis,
recommendations, related reports, knowledge question answering, ranked assignment options). AI
processing and storage are unchanged. The web app hides AI panels from the same flag in the
session payload and shows a neutral notice. A small handling log records first-open and
confirmation times per account and case with the condition in force, and an admin-only export
produces the study's timing sheet with pseudonymous participant codes.

## Technical Context

**Language/Version**: TypeScript 5 on Node 20+ (API, web); Python 3.13 (AI service, unchanged)

**Primary Dependencies**: Express 5, Mongoose 8, zod 4 (API); React 19, react-router 7 (web)

**Storage**: MongoDB (Atlas in production) — new fields on `User`, new `CaseHandlingRecord`
collection; no change to AI storage

**Testing**: vitest + mongodb-memory-server (API integration), vitest + jsdom (web), Playwright
E2E (`tests/e2e`)

**Target Platform**: Vercel (web + serverless API), Docker for local; browsers desktop and mobile

**Project Type**: Web application (monorepo: `apps/api`, `apps/web`, `apps/ai`)

**Performance Goals**: No measurable latency added to case reads (flag comes with the user record
already loaded by the auth middleware); handling-log writes are single upserts

**Constraints**: Withholding enforced server-side (spec FR-004); audit without personal payloads;
export contains no names, phones, emails or free text (SC-006)

**Scale/Scope**: 5–8 participants, 16–20 cases each per session; ~10 API surfaces and ~8 UI
components touched

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Stable service boundaries | Logic in `apps/api`; UI only reads a flag; AI service untouched; rental scope | PASS |
| II. Tenant isolation & security | Admin-only route, org-scoped target lookup, denied paths tested (self, other org, manager, requester), audit without payloads | PASS |
| III. Human-decided, AI-assisted | Feature only reduces AI visibility; manual triage stays complete; AI still advisory | PASS |
| IV. Privacy & honest evidence | Pseudonymous `studyCode`, export without PII/free text; condition captured per row so analysis is not misattributed | PASS |
| V. Verified, scoped changes | API integration tests for every withheld surface, web tests for hidden panels, E2E for both conditions, isolated test DB | PASS |
| VI. Consistent, accessible interface | Notice uses tokens and explains the state; admin toggle is a labelled switch; light/dark, 1440/390 checks | PASS |

Post-design re-check (after Phase 1): still PASS — no new service, datastore or framework; one
new collection inside the existing database is within Principle I.

## Project Structure

### Documentation (this feature)

```text
specs/001-ai-suggestions-switch/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── api.md           # Phase 1: HTTP contract changes
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/src/
├── models/user.ts                 # + aiSuggestionsHidden, aiVisibilityChangedAt/By, studyCode
├── models/case-handling.ts        # NEW CaseHandlingRecord
├── middleware/auth.ts             # req.auth.aiHidden from the loaded user
├── services/casePolicy.ts         # presentCase(record, auth): strip AI for hidden viewers
├── services/aiVisibility.ts       # NEW guard + event/notification neutralisers
├── services/publicUser.ts         # session payload exposes aiSuggestionsHidden
├── routes/casesRouter.ts          # list/detail use presenter; /ai/analyze-intake guarded; first-open log
├── routes/caseActionsRouter.ts    # confirmation log; assignment-options unranked when hidden
├── routes/incidentActions.ts      # /cases/:id/related guarded
├── routes/recommendations.ts      # guarded
├── routes/knowledgeRouter.ts      # /knowledge/search guarded
├── routes/dashboardRouter.ts      # AI risk/review figures withheld when hidden
├── routes/admin.ts                # PATCH user AI visibility + study code; GET study export
└── tests/aiVisibility.test.ts     # NEW integration suite

apps/web/src/
├── types.ts                       # User.aiSuggestionsHidden
├── components/AiHiddenNotice.tsx  # NEW neutral notice
├── pages/CaseDetailPage.tsx, NewCasePage.tsx, CasesPage.tsx, OverviewPage.tsx, KnowledgePage.tsx
├── components/RecommendationPanel.tsx, RelatedIncidentPanel.tsx, AssignmentSuggestions.tsx
└── pages/UsersPage.tsx            # admin switch + study code + export button

tests/e2e/ai-visibility.spec.ts    # NEW: manual vs assisted on desktop and phone
```

**Structure Decision**: Existing monorepo layout. Server-side enforcement is centralised in
`services/aiVisibility.ts` and `presentCase` so every route uses one rule; the web app mirrors
the flag only for presentation.

## Complexity Tracking

No constitution violations to justify.
