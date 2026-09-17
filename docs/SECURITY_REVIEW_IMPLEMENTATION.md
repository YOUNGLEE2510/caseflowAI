# Implementation status

Implemented from the current review plan:

- Global API limit: 100 requests per minute per IP; health probes excluded.
- Login limit: 5 unsuccessful attempts per minute per IP, with standard retry headers.
- Dashboard and case mutation/comment routes extracted, preserving authentication and URLs.
- Nine focused case-policy tests covering transitions, assignment, review, privacy and pagination.
- JSON request logs include request ID, status and duration; request bodies, tokens and query strings are not logged.
- Incoming request IDs are bounded and validated; unexpected errors return a correlation ID.
- Additional submission guards for case updates and comments.
- A bilingual frontend 404 route replaces silent redirection.
- Existing API environment example already contains database, auth, origin, AI and SMTP settings; no secrets were changed.

Remaining review items: further CSS extraction, full accessibility audit, dark theme, report export and expanded system diagnostics. These are not marked complete.

Deployment limitation: rate-limit counters are in process memory. Multiple API instances require a shared store. Configure proxy trust only for known deployment proxies; do not blindly trust arbitrary forwarded IP headers. Shared networks may need a tuned global threshold.

Validation: frontend production build and API TypeScript build passed; 32 API tests passed after router extraction. Browser end-to-end tests have not been rerun for this change set.
