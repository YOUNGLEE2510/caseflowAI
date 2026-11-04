# Product Contract Audit

Run `npm run test:audit` from the repository root. Requires Node/npm, Python with the AI test dependencies, and Chrome (or `E2E_BROWSER_CHANNEL=chromium` with Playwright Chromium installed). Keep port 5188 free.

The runner executes the normal baseline, the existing E2E suite, API contract checks, AI boundary/retrieval checks, and browser audit checks sequentially. It continues after failures so all available groups can report. A nonzero exit is expected while unresolved contracts fail; failures are not skipped or converted into passing tests.

Outputs are ignored by Git under `artifacts/product-audit/`: `ISSUES.md`, `summary.json`, suite logs, API JSON, AI JUnit XML, and browser JSON/screenshots. Use the report timestamps; old files are not proof of a fresh successful run. Missing reports and setup errors must be checked against the suite exit codes.

For a focused rerun, use `npm run test:audit -- --only=api-contracts` (also `baseline`, `baseline-e2e`, `ai-contracts`, `browser-contracts`). This preserves other groups' previous results with their timestamps; it does not rerun or revalidate those groups. Report files for a group are removed before executing that group to avoid mistaking stale output for a new result.

`npm run test:audit -- --report-only` rebuilds the issue list from existing reports without running tests. Optional Docker results keep their own last-run timestamp and are not silently refreshed by this command or the normal isolated audit.

## Contracts

| Area | Checks |
|---|---|
| Authentication | Anonymous API access denied |
| Tenancy | Case details, attachments and assignment options hidden across organizations |
| Assignment | Requester denied, manager allowed, agent cannot take over a colleague's case |
| SLA | Waiting time respected, historical deadlines stable after catalog changes, KPI matches queue |
| Lifecycle | Reopening does not retain an inactive assignee, cross-tenant writes denied |
| Recommendations | Recent pending suggestions not lost when old suggestions receive feedback |
| Notifications | Filtered totals and finite pagination boundaries |
| Training export | PTIT identifier redaction, spreadsheet-safe CSV, unreviewed samples excluded |
| AI | Body passages rather than title-only citations, empty-source abstention, candidate and finite-number bounds |
| Browser | CSAT empty-state bounds, Vietnamese password labels, recovery from an API outage |

API tests use a fresh MongoMemoryServer database and an ephemeral HTTP port. Browser checks use the existing disposable E2E server. No test is allowed to seed or clear Atlas or the Docker application database. AI is unavailable in the E2E fixture by design; this verifies fallback, not real model serving. Docker stack connectivity and full upload round-trip require a separate isolated deployment test.

These checks do not claim to cover every defect. Real OAuth/SMTP, model evaluation on reviewed data, backup restore, load testing, multi-replica races, WCAG/screen-reader audits, and device testing remain distinct work. The notification `total` contract assumes it represents the filtered result set; if an intentional API contract says otherwise, name/document the separate totals and adjust the assertion explicitly.

`npm run test:audit:docker` is a separate opt-in connectivity check against the configured running Docker stack. It tests AI authentication/classification/retrieval and deployed candidate bounds, ClamAV clean/test-signature handling and S3 HeadBucket. It does not write application data or upload objects, send SMTP email or call a paid LLM. Output goes to `artifacts/product-audit/docker.log`. This is not an API upload end-to-end test or a fresh-install/restore test.

The `Product Contract Audit` GitHub Actions workflow is manual (`workflow_dispatch`) while known contracts are failing. It uploads reports even on failure and does not mark failed contracts as successful. Running the workflow remotely still requires pushing the files and explicitly starting it; local test results are not evidence of a completed GitHub run.
