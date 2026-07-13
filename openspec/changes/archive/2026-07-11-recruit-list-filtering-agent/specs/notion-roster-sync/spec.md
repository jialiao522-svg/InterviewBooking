## ADDED Requirements

### Requirement: Sync tagged candidates to Notion

The system SHALL create or update a Notion database page for every candidate row tagged as a target after tag write-back is confirmed.

#### Scenario: New candidate synced

- **WHEN** the operator triggers Notion sync after tags have been written to the sheet
- **THEN** the system SHALL create a new Notion page for each target-tagged row that has no existing corresponding page, populated with at least name, email, source row index, tag reason, and status

#### Scenario: Already-synced candidate updated instead of duplicated

- **WHEN** a target-tagged row already has a corresponding Notion page from a previous sync
- **THEN** the system SHALL update the existing page's fields rather than creating a duplicate page

### Requirement: Sync result reporting

The system SHALL report the outcome of a Notion sync operation to the operator.

#### Scenario: Sync summary displayed

- **WHEN** a Notion sync operation completes
- **THEN** the system SHALL display the number of pages created, the number of pages updated, and the number of failures, if any

#### Scenario: Per-candidate sync failure isolation

- **WHEN** syncing one candidate to Notion fails while others succeed
- **THEN** the system SHALL report the specific failed candidate and reason, and SHALL still complete the sync for the remaining candidates
