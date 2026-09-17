# Hybrid AI integration

Implemented: the existing local classifier remains responsible for classification. Knowledge search retrieves only published, active, effective, unexpired documents from the current organization. Staff can optionally request a grounded draft through a Chat Completions-compatible HTTPS API. Drafts do not trigger actions or send replies.

## Configuration

OpenAI configuration example (keep the key private):

```dotenv
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_API_KEY=<your-project-api-key>
LLM_ALLOWED_ORGANIZATIONS=<approved-organization-id>
```

The sample model supports Chat Completions and structured outputs: https://developers.openai.com/api/docs/models/gpt-4.1-mini . It is a starting configuration, not a claim of best accuracy on CaseFlow. Model access and API billing must be enabled on the user's OpenAI API project. A ChatGPT/Codex session is not used as an API credential.

The configured project was checked on 2026-09-11: authentication and model lookup succeeded, but a draft request received `429 insufficient_quota` (`credit_balance_exhausted`). Add API credit before enabling use in the UI. The application falls back to retrieval when that happens. Because an API key was pasted into this conversation, revoke that key in the OpenAI API project and configure a newly created key locally.

Draft requests record actor, source IDs, request ID and generated/fallback mode through the existing audit helper. Prompt and answer text are not added to the audit log. The helper is best-effort, not a durable billing ledger.

Set server-only values in apps/api/.env: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL and LLM_ALLOWED_ORGANIZATIONS (comma-separated organization IDs). No provider or billable model is activated by default. Restart the API after configuration. The knowledge page shows the drafting option only to staff in allowed organizations.

Before enabling a tenant, approve the provider's data handling and confirm that document excerpts and staff queries may leave the organization. The current email/number filter is NOT complete anonymization: names, addresses, secrets and contextual personal data may remain. Never enable this feature for confidential corpora without a suitable data-processing policy and stronger filtering or a trusted private model endpoint.

## Behavior and limitations

- Only query and up to four retrieved excerpts are sent, with surrogate source IDs. No account profile, case timeline, internal comments or database identifiers are sent by this flow.
- Provider timeout: 12 seconds. No automatic billable retries. Output cap: 1,000 completion tokens.
- Unknown citations, malformed JSON, missing evidence, failed/truncated output or provider failure fall back to retrieval.
- Valid source IDs are not proof of factual entailment. Staff must review the draft. The TF-IDF retrieval baseline and short excerpts remain limitations.
- Document prompt injection is mitigated by separating instructions from untrusted excerpts, but not guaranteed eliminated. No tools or automated actions are exposed to the model.
- Calling an API does not train it. Open-data experiments remain isolated from the production classifier.

Reference: https://developers.openai.com/api/reference/resources/chat

Not implemented by this integration: case summarization/drafting, a production retraining/release pipeline, SLA workers/email queues, invitations/reset/MFA or object storage. These remain separate work items; this document does not mark the whole roadmap complete.
