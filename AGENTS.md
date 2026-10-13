# CaseFlow development rules

Use the existing React/Express/FastAPI/MongoDB boundaries. Preserve unrelated local changes.

## Tools and skills

- Personal skills: `ui-ux` (evondevKit), `impeccable`, `logo-design`, and `ui-ux-pro-max` are authoring aids, not application dependencies. Use one primary design workflow per task; preserve the approved operational UI unless a redesign is requested.
- Chrome DevTools MCP is configured in the user's Codex config with an isolated browser. Never attach it to a personal logged-in Chrome profile or expose remote debugging publicly.
- `claude-automation-recommender` is a reference skill for Claude Code. Its plugin commands/hooks are not Codex configuration.

## Security changes

For auth, routes, uploads, AI integrations, and deployment changes, review these boundaries:
1. Authenticate the caller; verify token expiry, revocation and organization membership.
2. Authorize each resource and action; test cross-tenant and cross-role access.
3. Apply rate limits without treating shared school NAT as one user identity.
4. Validate input shape and bounds; never pass user-provided query operators to MongoDB.
5. Keep untrusted data as data: React text escaping, parameterized filters, context-specific encoding. Never render AI output as trusted HTML.
6. Require HTTPS for pilot/public origins; do not break local HTTP development.
7. Keep secrets server-side and ignored by Git; document rotation dependencies rather than rotating credentials silently.
8. Preserve least-privilege DB/storage accounts and private internal services.
9. Use idempotency on supported write endpoints; it is not a replacement for authentication or CSRF controls.
10. Audit important actions without logging passwords, tokens, or full sensitive payloads.
11. Review dependency advisories and lockfile changes; do not blindly force-upgrade dependencies.
12. Return generic unexpected errors with request IDs, not stack traces or internal URLs.

## Verification

Run focused tests and builds for changed modules. For UI changes verify desktop/mobile screenshots and text/layout bounds. Use isolated test databases, never seed or erase production data. Report limitations honestly; installed skills are not evidence that runtime security is complete.
