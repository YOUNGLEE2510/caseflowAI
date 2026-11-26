# Quickstart: validate the AI suggestions switch

## Prerequisites

- Local stack or the isolated E2E server (`npx tsx tests/e2e/server.mts`), never production data.
- Seed accounts from `npm run seed` (password `Canho123!`): org admin `tran.khoa@canho.local`,
  dispatcher `pham.ha@canho.local`.

## Automated checks

1. `npm run test --workspace=@caseflow/api` — `tests/aiVisibility.test.ts` must cover: admin
   toggles; self/manager/other-org/requester denied and audited; every route in
   [contracts/api.md](contracts/api.md) withholds for hidden viewers and is unchanged otherwise;
   AI still stored; handling record timestamps and condition; CSV columns and no PII.
2. `npx vitest run --environment jsdom` in `apps/web` — hidden panels and the notice.
3. `npm run test:e2e` — `ai-visibility.spec.ts`: the same case viewed in manual and assisted mode
   on 1440px and 390px, light and dark; no horizontal overflow.

## Manual walkthrough

1. Sign in as the org admin → Users → choose the dispatcher → set study code `p01`, turn
   "Ẩn gợi ý AI" on. Expect a confirmation and an audit entry.
2. In another browser profile, sign in as the dispatcher. Expect the neutral notice; open a case:
   no AI category, priority, risk, recommendations, related reports or drafted reply; timeline
   shows no AI wording. Set category, priority and assignee manually.
3. Turn the switch off as admin; the dispatcher reloads the page → AI panels reappear.
4. Admin → export study CSV for today → one row per case handled, `condition` matches the switch
   state at confirmation, no names/phones/emails/descriptions.
5. Run `python -m apps.ai.analyze_study timing <exported file>` after adding the
   `classification_correct` column — it must parse without edits to other columns.
