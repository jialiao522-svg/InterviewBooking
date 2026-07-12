# notion-roster-sync Specification

## Purpose

TBD - created by archiving change 'recruit-list-filtering-agent'. Update Purpose after archive.

## Requirements

### Requirement: Sync tagged candidates to Notion

The system SHALL create or update a Notion database page for every candidate row tagged as a target after tag write-back is confirmed.

#### Scenario: New candidate synced

- **WHEN** the operator triggers Notion sync after tags have been written to the sheet
- **THEN** the system SHALL create a new Notion page for each target-tagged row that has no existing corresponding page, populated with at least name, email, source row index, tag reason, and status

#### Scenario: Already-synced candidate updated instead of duplicated

- **WHEN** a target-tagged row already has a corresponding Notion page from a previous sync
- **THEN** the system SHALL update the existing page's fields rather than creating a duplicate page

---
### Requirement: Sync result reporting

The system SHALL report the outcome of a Notion sync operation to the operator.

#### Scenario: Sync summary displayed

- **WHEN** a Notion sync operation completes
- **THEN** the system SHALL display the number of pages created, the number of pages updated, and the number of failures, if any

#### Scenario: Per-candidate sync failure isolation

- **WHEN** syncing one candidate to Notion fails while others succeed
- **THEN** the system SHALL report the specific failed candidate and reason, and SHALL still complete the sync for the remaining candidates

---
### Requirement: Questionnaire answers written to Notion page body

When syncing a target-tagged candidate to Notion, the system SHALL write the candidate's questionnaire answers into a dedicated section of the Notion page body, in addition to the existing page properties. The questionnaire answers SHALL consist of every column value from the candidate's source sheet row except the configured tag column and the configured reason column.

#### Scenario: Questionnaire answers included on first sync

- **WHEN** the system creates a new Notion page for a target-tagged candidate
- **THEN** the system SHALL write every sheet column value for that candidate's row, except the configured tag column and reason column, into a dedicated "問卷回答" section in the page body, using each column's header as the question label and the cell value as the answer

##### Example: column exclusion

| Sheet column | Included in questionnaire section? |
| --- | --- |
| Name | Yes |
| Email | Yes |
| Tag | No (configured tag column) |
| Reason | No (configured reason column) |
| 為什麼想參加這次訪談？ | Yes |

#### Scenario: Questionnaire section overwritten, not duplicated, on re-sync

- **WHEN** the system re-syncs a candidate whose Notion page already has a "問卷回答" section from a previous sync
- **THEN** the system SHALL replace the existing contents of that section with the current answers, without duplicating the section or altering any other content on the page

#### Scenario: Questionnaire write failure isolated per candidate

- **WHEN** writing the questionnaire section for one candidate fails while other candidates in the same sync succeed
- **THEN** the system SHALL report that candidate as a sync failure with the reason, and SHALL still complete the questionnaire sync for the remaining candidates

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