# API contract changes: AI suggestions switch

All routes are under `/api`, authenticated, organization-scoped. "Hidden viewer" = authenticated
staff user with `aiSuggestionsHidden = true`.

## New

### `PATCH /users/:id/ai-visibility`

- Roles: `org_admin`, `platform_admin`.
- Body: `{ "aiSuggestionsHidden": boolean, "studyCode"?: string | null }` (strict; `studyCode`
  matches `^p\d{2}$`).
- 200 → `{ "user": { "id", "aiSuggestionsHidden", "studyCode", "aiVisibilityChangedAt" } }`
- 403 → caller targets self, or caller is not an org admin (audited as `user.ai_visibility.denied`).
- 404 → target not in caller's organization.
- 409 → `studyCode` already used in the organization.
- 422 → target is a requester.

### `GET /study/export.csv?from=YYYY-MM-DD&to=YYYY-MM-DD`

- Roles: `org_admin`, `platform_admin`. `Cache-Control: no-store`.
- `text/csv; charset=utf-8`, header row:
  `participant,scenario_group,condition,started_at,confirmed_at,classification_correct,duplicate_jobs,false_links,case_code,final_category,final_priority,ai_category,ai_priority`
- The first eight columns match `docs/study/timing_template.csv` exactly; `classification_correct`
  is left empty for the researcher. Extra columns follow.
- Only accounts with a `studyCode`; cells escaped against spreadsheet formula injection.

## Changed for hidden viewers

| Route | Normal | Hidden viewer |
|---|---|---|
| `GET /auth/me`, `POST /auth/refresh` | user payload | + `aiSuggestionsHidden: true` |
| `GET /cases`, `GET /cases/:id`, merge/dashboard case payloads | full `ai` object; all events | `ai` = `{ processingStatus, reviewStatus: "reviewed" | "pending" }`; `ai_triage` events removed; `ai_reviewed` relabelled neutrally |
| `GET /cases?queue=at_risk` | AI risk ≥ 0.65 or overdue | overdue only |
| `POST /ai/analyze-intake` | analysis | 200 `{ "analysis": null, "hidden": true }` |
| `POST /recommendations`, `POST /recommendations/overview` | recommendations | 200 `{ "recommendation": null, "hidden": true }` |
| `GET /cases/:id/related` | AI matches | 200 `{ "matches": [], "hidden": true }` |
| `POST /knowledge/search` | answer + citations | 200 `{ "answer": "", "citations": [], "hidden": true }` |
| `GET /cases/:id/assignment-options` | ranked, `skillMatch`, `advisory: true` | sorted by name, no `skillMatch`, `advisory: false` |
| `GET /dashboard` | includes AI review / risk figures | at-risk = overdue only, sorted by due date |
| `GET /analytics/ai-accuracy` | AI review coverage | 200 `{ "hidden": true }` |
| `GET /notifications` | all | AI-triage notifications omitted |

Requests that change data (`PATCH /cases/:id`, assignment, incident linking) are unchanged.

## Side effects

- First staff `GET /cases/:id` by an account with `studyCode` upserts `CaseHandlingRecord.firstOpenedAt`.
- First `PATCH /cases/:id` setting category/service and priority by such an account sets `confirmedAt`.
