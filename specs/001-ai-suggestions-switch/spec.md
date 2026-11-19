# Feature Specification: Per-account AI suggestions switch for the user study

**Feature Branch**: `001-ai-suggestions-switch`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Per-account switch that hides AI suggestions for the manual-vs-assisted user study. An organization admin or manager can turn "AI suggestions hidden" on or off for individual staff accounts (pilot participants p01…p08). When hidden, that account does not see AI classification, AI priority suggestion, AI routing/assignment recommendations, similar/related case suggestions or knowledge drafting on case screens and the new-request form; it still performs triage and assignment manually. The AI still runs in the background and its outputs are stored so researchers can compare later, but they are not shown to that account. Changing the switch is audited. Participants and other staff are unaffected. The study protocol in docs/study/README.md (timing.csv: started_at, confirmed_at, classification_correct, duplicate tasks, wrong incident links) must be supportable. Out of scope: automatic randomisation of conditions, collecting personal data of participants."

## Clarifications

### Session 2026-11-19

- Q: Who may change a participant's AI switch? → A: Organization administrators only; managers can
  view the setting but not change it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Participant works a case without AI help (Priority: P1)

A study facilitator puts a pilot participant's staff account into the "manual" condition. The
participant opens assigned study cases, reads the resident's description and decides the service
category, priority and assignee on their own. Nowhere in the product do they see what the AI
suggested for that case. When the facilitator switches the same account to the "assisted"
condition, the participant sees the AI suggestions again on the next page they open.

**Why this priority**: Without a reliable way to hide every AI suggestion from one account, the
manual-vs-assisted comparison cannot be run at all; this is the core of the study.

**Independent Test**: Put one test staff account in manual mode, open a case that has AI output,
and confirm no AI-derived value is visible anywhere; switch to assisted mode and confirm the
same values reappear.

**Acceptance Scenarios**:

1. **Given** a staff account in manual mode and a case with a stored AI category, priority and
   recommendations, **When** the participant opens the case, **Then** no AI category, AI priority,
   confidence, risk score, assignment recommendation, similar/related case suggestion or drafted
   reply is shown, and the participant can still set category, priority and assignee by hand.
2. **Given** a staff account in manual mode, **When** the participant opens the new-request form
   and types a description, **Then** no AI analysis or suggested service is shown.
3. **Given** a staff account in manual mode, **When** the participant opens the case list,
   overview, unit board or knowledge page, **Then** no AI-derived flags, scores, suggestion lists
   or generated answers are shown on any of them.
4. **Given** a staff account in assisted mode, **When** the participant opens the same screens,
   **Then** all AI suggestions appear exactly as for any other staff member.
5. **Given** a participant in manual mode, **When** they try to retrieve AI output for a case
   directly (for example by revisiting an old link or requesting it again), **Then** the AI
   output is still withheld.

---

### User Story 2 - Facilitator assigns conditions safely (Priority: P1)

An organization administrator opens a participant's account and turns "Hide AI suggestions" on or
off. They can see at a glance which accounts are currently in manual mode. Every change is
recorded with who changed it, when, and the new value. Participants cannot change their own
condition.

**Why this priority**: The study's validity depends on conditions being set deliberately,
traceably and without participants changing them mid-session.

**Independent Test**: As an organization administrator, switch a staff account on and off and
check the audit history; as that staff account, confirm there is no way to change the setting.

**Acceptance Scenarios**:

1. **Given** an authorised administrator, **When** they turn the switch on for a staff account,
   **Then** the account shows as "AI suggestions hidden" in the account list and an audit entry
   records actor, account, old value, new value and time.
2. **Given** the participant's own account, **When** they view their profile or any settings,
   **Then** they cannot change the switch, and an attempt to change it is refused and audited.
3. **Given** an account in another organization, **When** an administrator tries to change its
   switch, **Then** the request is refused as if the account did not exist.
4. **Given** a resident (requester) account, **When** an administrator views it, **Then** the
   switch is not offered, because residents never see staff-side AI suggestions.

---

### User Story 3 - Researcher exports what happened (Priority: P2)

After sessions, the researcher exports a file per study that lists, for each participant code and
case, when the participant first opened the case, when they confirmed category and priority, the
final values they chose, the AI's stored suggestions for the same case, and the condition the
participant was in at that time. The researcher fills in or checks correctness against the agreed
labels and runs the existing analysis script.

**Why this priority**: The study can be run with a stopwatch and manual notes, but an export
removes transcription errors and makes timing objective; it builds on Stories 1 and 2.

**Independent Test**: Run two short sessions with one test account (one manual, one assisted),
export, and confirm each row has timestamps, final choices, the stored AI suggestion and the
correct condition, in a shape the existing analysis script accepts.

**Acceptance Scenarios**:

1. **Given** completed sessions, **When** an administrator exports study data, **Then** the file
   contains one row per participant-case with participant code, condition, case code, scenario
   group, first-opened time, confirmed time (with time zone), final category, final priority, AI
   category, AI priority, duplicate tasks created and incident links later removed as wrong.
2. **Given** the export, **When** it is opened, **Then** it contains no names, phone numbers,
   emails or free-text descriptions from residents or participants.
3. **Given** a participant switched between conditions, **When** exporting, **Then** each row
   carries the condition that was in force when that case was handled, not the current one.

### Edge Cases

- A participant has a case open when the facilitator flips the switch: the change applies the
  next time any page or panel loads; the currently shown values are not altered mid-page, and the
  export records the condition in force when the case was confirmed.
- AI is unavailable or slow: manual mode behaves the same; assisted mode shows the existing
  "AI unavailable" state; neither blocks manual triage.
- A participant receives notifications or emails that would normally mention AI suggestions:
  these omit AI-derived content in manual mode.
- A manager in manual mode views a case another colleague triaged with AI help: the stored AI
  values are still hidden, while the colleague's human decisions remain visible.
- Shared incidents suggested by AI: in manual mode the participant links incidents by searching
  manually; AI "related report" suggestions and badges are not shown.
- An account in manual mode is deactivated or the study ends: the switch stays off/on as last
  set until an administrator changes it; no automatic expiry.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let organization administrators (and only them) turn "Hide AI suggestions" on or off for an individual
  staff account in the same organization.
- **FR-002**: Staff accounts MUST NOT be able to change their own switch, and residents MUST NOT
  be offered the switch.
- **FR-003**: For an account with the switch on, the system MUST withhold every AI-derived value
  from every screen and response that account can reach, including: suggested category and
  service, confidence, suggested priority, SLA risk scores, assignment and routing
  recommendations, similar and related case suggestions, shared-incident candidate flags, AI
  summaries and extracted fields, knowledge answers and drafted replies, and AI analysis on the
  new-request form.
- **FR-004**: Withholding MUST hold for every way that account can obtain data, not only what
  the screens display, so AI values cannot be obtained by requesting them outside the normal
  screens, revisiting links or reading previously loaded data.
- **FR-005**: The AI MUST continue to analyse cases and store its outputs for accounts in manual
  mode exactly as for other accounts.
- **FR-006**: Manual triage, prioritisation, assignment and incident linking MUST remain fully
  available to an account in manual mode, with no extra steps.
- **FR-007**: The account list for administrators MUST show which staff accounts currently have
  AI suggestions hidden.
- **FR-008**: Every change of the switch, and every refused attempt to change it, MUST be recorded
  in the audit log with actor, target account, previous value, new value and time.
- **FR-009**: An account in manual mode MUST see a neutral notice that AI suggestions are turned
  off for their account, so missing panels are not mistaken for errors.
- **FR-010**: The system MUST record, for each staff account and case, when the account first
  opened the case and when it confirmed category and priority, together with the switch value in
  force at that moment.
- **FR-011**: An organization administrator MUST be able to export study data for selected
  accounts and a date range in the column layout expected by the study analysis tooling, using
  pseudonymous participant codes and no personal data or free text.
- **FR-012**: The switch MUST have no effect on other accounts, on residents, or on AI processing
  for the organization.
- **FR-013**: Changing the switch MUST take effect for the participant no later than their next
  page or panel load, without requiring them to sign out.

### Key Entities *(include if feature involves data)*

- **AI visibility setting**: A per-staff-account flag (hidden / shown) with the time it last
  changed and who changed it.
- **Participant code**: A pseudonymous label (p01…p08) attached to a staff account for the study;
  the mapping to real people is kept outside the system.
- **Case handling record**: For one account and one case: first-opened time, confirmation time,
  final category, final priority, the condition in force, plus counts of duplicate tasks created
  and incident links later removed as wrong.
- **Stored AI suggestion**: The AI's category, priority and recommendations for a case, kept for
  comparison regardless of whether they were shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a check of every staff screen and response reachable by a manual-mode account,
  zero AI-derived values are exposed.
- **SC-002**: A facilitator can switch a participant between conditions in under 30 seconds, and
  the participant sees the new condition on their next page load.
- **SC-003**: 100% of switch changes and refused attempts appear in the audit log with actor,
  target, old and new value.
- **SC-004**: For a study session of 8–10 cases per condition, the export contains one complete
  row per participant-case, and the existing analysis produces median times and a paired test
  without manual re-entry of timestamps.
- **SC-005**: Accounts not in the study see no change in behaviour or in AI suggestions.
- **SC-006**: The export contains zero names, phone numbers, emails or resident descriptions.

## Assumptions

- Participants act as dispatch staff (coordinator role) in a dedicated study organization or the
  demo organization, using demo accounts and sample data only (Constitution IV).
- Only organization administrators change the switch; managers can see which accounts have AI
  suggestions hidden but cannot change it, so a participant holding a manager account cannot alter
  their own or a colleague's condition. Nobody can change their own switch.
- The knowledge page's question answering counts as an AI suggestion and is hidden in manual mode;
  filtering the document library by keyword is not AI output and stays available.
- Condition order (manual-first or assisted-first) is decided by the facilitator following the
  study protocol; the system does not randomise it.
- "Correct classification" is judged by the researcher against the agreed labels after export;
  the system does not decide correctness.
- Notifications sent to a manual-mode account omit AI-derived content but are otherwise unchanged.
- The study team's existing timing sheet and analysis method remain the target format; small
  additions (condition and participant code columns) are acceptable if documented.
