# CaseFlow AI Constitution

## Core Principles

### I. Stable Service Boundaries

CaseFlow is a rental-apartment service-request and case-operations platform built as three
services with fixed responsibilities:

- Product scope is rental apartment operations only: resident reports (app and unit QR codes),
  triage, dispatch, repairs, units and assets. Other domains (education, HR/payroll, billing)
  MUST NOT be reintroduced without an amendment.
- `apps/web` (React + TypeScript + Vite) MUST contain only presentation and client logic; it
  MUST NOT hold secrets or talk to MongoDB or the AI service directly.
- `apps/api` (Express + TypeScript + MongoDB) is the single owner of business data, authorization,
  workflow state, audit and notifications.
- `apps/ai` (FastAPI + scikit-learn) is a private internal service reachable only from the API;
  it MUST NOT be exposed publicly or write business data.
- New features MUST fit these boundaries. Adding a new service, datastore or framework requires a
  documented justification in the feature plan's Complexity Tracking.
- Changes MUST preserve unrelated local work and the approved operational UI unless a redesign is
  explicitly requested.

Rationale: clear boundaries keep authorization in one place and let the AI service fail or be
replaced without affecting core case handling.

### II. Tenant Isolation and Security by Default (NON-NEGOTIABLE)

Every change touching auth, routes, uploads, AI integrations or deployment MUST satisfy:

- Callers are authenticated, with token expiry, revocation and organization membership verified.
- Every resource and action is authorized per organization and role; cross-tenant and cross-role
  access MUST be covered by tests.
- Input shape and bounds are validated; user-provided query operators MUST NOT reach MongoDB.
- Untrusted data stays data: React text escaping, parameterized filters, context-specific encoding.
- Rate limits MUST NOT treat a shared NAT address as a single user identity.
- Unexpected errors return a generic message with a request ID — never stack traces or internal
  URLs.
- Important actions are audited without logging passwords, tokens or full sensitive payloads.
- Idempotency is applied on supported write endpoints and is never a substitute for
  authentication or CSRF controls.

Rationale: CaseFlow is multi-tenant and holds tenant identity documents and residence data; a
single authorization gap exposes other organizations' records.

### III. Human-Decided, AI-Assisted Operations

- AI output (classification, extraction, similar-case and related-report suggestions, knowledge
  retrieval, SLA risk) is advisory. Assignment, status changes, incident linking and case closure
  MUST be performed by an authorized human through business logic, never by a model.
- AI output MUST NOT be rendered as trusted HTML and MUST be treated as untrusted input wherever
  it is stored or displayed.
- The product MUST keep working when the AI service is unavailable, with AI features degrading
  visibly rather than blocking case handling.
- Answers from the knowledge base MUST abstain or flag low support instead of inventing facts;
  out-of-scope topics MUST be declined.

Rationale: models are trained on limited simulated data and cannot be held accountable for
operational decisions.

### IV. Data Privacy and Honest Evidence

- Secrets, `.env` files, personal data and raw tenant documents MUST NOT be committed to Git.
- Attachments are stored private/authenticated (Cloudinary) and are scanned (ClamAV); they MUST
  NOT automatically become training data.
- Retraining MUST go through the approved-data pipeline (`--approved-data`, source lineage,
  source/case-grouped splits, frozen test set, baseline comparison). No default retrain schedule.
- Exports and LLM payloads MUST pass through the shared de-identification step; regex masking
  MUST NOT be described as full anonymization.
- Documentation and UI claims about AI quality MUST reflect actual evidence: the current
  classifier is trained on simulated sentences and MUST NOT be presented as proven on real
  operational data.
- Evaluation integrity: thresholds, rules, topic lists and model settings MUST be chosen on a dev
  set, never on the locked test set. If a change is made after inspecting test-set errors, the
  report MUST say so and that test set MUST NOT be presented as blind afterwards.
- Scores on simulated data are for relative comparison only (e.g. model vs. keyword baseline);
  numbers reported as system quality MUST come from a human-written test set labelled by two
  independent annotators, with agreement (kappa) reported.
- User-study participants and annotators are identified only by pseudonymous codes (p01, p02…);
  names, phone numbers and emails MUST NOT enter the repository, and the mapping is kept outside
  it. Studies use demo accounts and sample data, never real tenant information.

Rationale: the project's credibility and its users' privacy both depend on not overstating
what the data and models support.

### V. Verified, Scoped Changes

- Every change MUST run the focused tests and builds for the modules it touches
  (`npm run test`, workspace builds, `pytest apps/ai/tests`, Playwright e2e where flows change).
- UI changes MUST be checked with desktop and mobile screenshots, including text overflow and
  layout bounds.
- Tests MUST use isolated test databases (e.g. `mongodb-memory-server`); production data MUST NOT
  be seeded, erased or used in tests.
- Results MUST be reported honestly, including failures, skipped steps and known limitations.
  Installed tools or skills are not evidence that runtime security is complete.

Rationale: small, verified increments keep a three-service system releasable at all times.

### VI. Consistent, Accessible Interface

- Colours, spacing, radius, elevation and typography MUST come from the design tokens in
  `apps/web/src/styles/01-design-tokens.css`; new CSS MUST NOT introduce literal colours except for
  third-party brand marks and print/QR surfaces that must stay white.
- Every screen MUST work in light and dark themes and at desktop (1440px) and phone (390px)
  widths without horizontal scrolling.
- Text MUST meet WCAG AA contrast (4.5:1 for body text) in every state, including hover, focus,
  disabled and selected; keyboard focus MUST be visible; interactive targets MUST be at least
  24px (44px for primary mobile controls); `prefers-reduced-motion` MUST be respected.
- Interaction states MUST explain themselves: locked or blocked areas show why and how to proceed,
  filters show what is applied and how to clear it, and unsaved input is not silently lost.
- Layout rules MUST target named classes, not positional selectors such as `nth-child`, so
  role-dependent markup cannot break them.

Rationale: residents, field staff and managers use CaseFlow on shared and mobile devices; an
unreadable or unexplained screen blocks the work as surely as a server error.

## Security and Deployment Constraints

- Pilot and public origins MUST use HTTPS (including OAuth callbacks); local HTTP development
  MUST keep working.
- Secrets stay server-side and Git-ignored. Credential rotation dependencies are documented;
  credentials are never rotated silently.
- Database and storage accounts use least privilege; internal services (AI, ClamAV, MongoDB)
  stay on private networks.
- OAuth sign-in only links pre-provisioned accounts after verifying the provider subject; it MUST
  NOT auto-create accounts or change roles. Session JWTs MUST NOT appear in URLs.
- Dependency advisories and lockfile changes are reviewed; dependencies are not force-upgraded
  blindly.
- Browser automation tooling MUST use an isolated profile and never expose remote debugging
  publicly.

## Development Workflow and Quality Gates

- Feature work follows the Spec Kit flow: specify → (clarify) → plan → tasks → implement. Each
  plan MUST include a Constitution Check against Principles I–VI before design and after it.
- CI MUST pass build and tests for API, web and AI on every push and pull request before merge.
- Security-relevant changes (Principle II scope) MUST include tests for the denied path, not only
  the allowed path.
- Design skills and helper tooling are authoring aids only and MUST NOT become application
  dependencies; one primary design workflow is used per task.
- Commits are made only on request. Work is branched from `main` by default; committing directly
  to `main` (which deploys production) happens only when the project owner explicitly asks.

## Governance

- This constitution supersedes conflicting practices. `AGENTS.md` provides runtime development
  guidance and MUST stay consistent with it; on conflict, amend one so both agree.
- Amendments are made via `/speckit-constitution`, recorded with a Sync Impact Report, reviewed by
  the project owner, and committed with a message describing the version change.
- Versioning follows semantic versioning: MAJOR for removed or redefined principles, MINOR for
  added principles/sections or materially expanded guidance, PATCH for clarifications.
- Every plan and code review MUST verify compliance; any deviation MUST be justified in the
  plan's Complexity Tracking or rejected.

**Version**: 1.1.0 | **Ratified**: 2026-11-19 | **Last Amended**: 2026-11-19
