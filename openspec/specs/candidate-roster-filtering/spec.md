# candidate-roster-filtering Specification

## Purpose

TBD - created by archiving change 'recruit-list-filtering-agent'. Update Purpose after archive.

## Requirements

### Requirement: Read raw candidate data from Google Sheet

The system SHALL read all rows from the configured Google Sheet, including each row's column values and its current tag state, before applying any filter criteria.

#### Scenario: Successful sheet read

- **WHEN** the operator starts a filtering session
- **THEN** the system SHALL retrieve every row from the configured sheet range, including row index, column values, and current tag value (or null if untagged)

#### Scenario: Sheet not shared with the service account

- **WHEN** the configured Google Sheet has not been shared with the service account's email
- **THEN** the system SHALL fail with an error message that names the missing permission and the service account email to share the sheet with

---
### Requirement: Operator may target a specific sheet tab within the conversation

The system SHALL let the operator specify which sheet tab (worksheet) to read from by naming it in natural language, overriding the configured default for that call; when the operator does not name a tab, the system SHALL fall back to the configured default. When a write-back originates from a conversation that targeted a specific tab, the system SHALL write back to that same tab rather than the configured default.

#### Scenario: Operator names a specific tab

- **WHEN** the operator's instruction names a specific sheet tab (e.g. "讀工作表2")
- **THEN** the system SHALL read from the named tab instead of the configured default tab

#### Scenario: Operator does not name a tab

- **WHEN** the operator's instruction does not name any sheet tab
- **THEN** the system SHALL read from the configured default tab

#### Scenario: Write-back targets the same tab that was read

- **WHEN** the operator confirms a tag write-back for rows that were read from a non-default tab named earlier in the conversation
- **THEN** the system SHALL write the tags back to that same named tab, not the configured default tab

---
### Requirement: Iterative natural-language filtering

The system SHALL let the operator describe filter criteria in natural language and SHALL re-evaluate tagging each time the operator provides new or refined criteria within the same session.

#### Scenario: Initial filter criteria applied

- **WHEN** the operator provides a natural-language filter criteria describing the target candidate profile
- **THEN** the system SHALL evaluate every row against the criteria and produce a tag decision (target / not target) with a reason for each row

#### Scenario: Criteria refined in a later turn

- **WHEN** the operator provides a second natural-language instruction refining the previous criteria (e.g. narrowing or widening the match)
- **THEN** the system SHALL re-evaluate tag decisions using the combined intent of the conversation, without requiring the operator to restate the full original criteria

---
### Requirement: Tag write-back requires explicit confirmation

The system SHALL NOT write tag changes to the Google Sheet until the operator has reviewed a preview of the pending changes and explicitly confirmed them. Before offering that preview, the system SHALL proactively summarize the current tag decisions, ask the operator whether they are satisfied with the result, and identify any rows it judges as uncertain so the operator can resolve them individually.

#### Scenario: Proactive summary and satisfaction check after tagging

- **WHEN** the system completes a full pass of tag decisions for all rows
- **THEN** the system SHALL summarize the counts of target and non-target rows and SHALL ask the operator whether they are satisfied with the result, before offering to write back or displaying the write-back preview

#### Scenario: Ambiguous rows are flagged individually

- **WHEN** the system's tag decisions include one or more rows it judges as uncertain against the stated criteria
- **THEN** the system SHALL list each uncertain row with its row index and the reason for the uncertainty, and SHALL ask the operator to confirm whether each such row should be included, before displaying the write-back preview

#### Scenario: Preview shown before write

- **WHEN** the operator indicates the current tag decisions are ready to be committed
- **THEN** the system SHALL display a preview listing each row's row index, proposed tag value, and reason, before making any write request to the Google Sheets API

#### Scenario: Operator rejects the preview

- **WHEN** the operator declines the preview
- **THEN** the system SHALL NOT call the Google Sheets write API and SHALL return control to the operator for further criteria adjustment


<!-- @trace
source: proactive-review-and-questionnaire-sync
updated: 2026-07-12
code:
  - packages/booking-scheduler/package.json
  - packages/booking-scheduler/src/app/book/[candidateId]/BookingForm.tsx
  - packages/booking-scheduler/tsconfig.json
  - packages/booking-scheduler/src/app/api/book/[candidateId]/route.ts
  - packages/booking-scheduler/src/app/book/[candidateId]/page.tsx
  - packages/recruit-agent/src/agent/systemPrompt.ts
  - packages/recruit-agent/src/agent/tools.ts
  - packages/shared-integrations/src/notion.ts
  - packages/booking-scheduler/vitest.config.ts
  - packages/booking-scheduler/next.config.ts
  - packages/booking-scheduler/src/app/layout.tsx
  - packages/booking-scheduler/src/app/page.tsx
  - packages/booking-scheduler/src/lib/bookingConfirmation.ts
  - packages/booking-scheduler/templates/remote-note.txt
  - packages/booking-scheduler/src/lib/slotAvailability.ts
  - packages/shared-integrations/src/gmail.ts
  - packages/booking-scheduler/README.md
  - packages/shared-integrations/src/index.ts
  - packages/booking-scheduler/src/app/globals.css
  - packages/shared-integrations/src/googleCalendar.ts
  - packages/booking-scheduler/src/app/favicon.ico
  - packages/booking-scheduler/templates/confirmation-email.txt
  - packages/shared-integrations/src/config.ts
tests:
  - packages/booking-scheduler/src/lib/bookingConfirmation.test.ts
  - packages/shared-integrations/src/gmail.test.ts
  - packages/recruit-agent/src/index.test.ts
  - packages/booking-scheduler/src/app/api/book/[candidateId]/route.test.ts
  - packages/recruit-agent/src/agent/tools.test.ts
  - packages/booking-scheduler/src/app/book/[candidateId]/page.test.tsx
  - packages/booking-scheduler/src/lib/slotAvailability.test.ts
  - packages/shared-integrations/src/googleCalendar.test.ts
  - packages/recruit-agent/src/agent/loop.test.ts
  - packages/shared-integrations/src/notion.test.ts
-->

---
### Requirement: Confirmed tags are written back to the sheet

Once confirmed, the system SHALL write each row's tag decision to the configured tag column in the Google Sheet.

#### Scenario: Confirmed tags persisted

- **WHEN** the operator confirms the preview
- **THEN** the system SHALL write the tag value for every previewed row to the sheet's tag column

#### Scenario: Partial write failure

- **WHEN** the write request for one row fails while others succeed
- **THEN** the system SHALL report which specific rows failed and why, and SHALL NOT treat the successfully written rows as failed