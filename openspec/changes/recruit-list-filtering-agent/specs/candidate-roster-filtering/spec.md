## ADDED Requirements

### Requirement: Read raw candidate data from Google Sheet

The system SHALL read all rows from the configured Google Sheet, including each row's column values and its current tag state, before applying any filter criteria.

#### Scenario: Successful sheet read

- **WHEN** the operator starts a filtering session
- **THEN** the system SHALL retrieve every row from the configured sheet range, including row index, column values, and current tag value (or null if untagged)

#### Scenario: Sheet not shared with the service account

- **WHEN** the configured Google Sheet has not been shared with the service account's email
- **THEN** the system SHALL fail with an error message that names the missing permission and the service account email to share the sheet with

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

### Requirement: Iterative natural-language filtering

The system SHALL let the operator describe filter criteria in natural language and SHALL re-evaluate tagging each time the operator provides new or refined criteria within the same session.

#### Scenario: Initial filter criteria applied

- **WHEN** the operator provides a natural-language filter criteria describing the target candidate profile
- **THEN** the system SHALL evaluate every row against the criteria and produce a tag decision (target / not target) with a reason for each row

#### Scenario: Criteria refined in a later turn

- **WHEN** the operator provides a second natural-language instruction refining the previous criteria (e.g. narrowing or widening the match)
- **THEN** the system SHALL re-evaluate tag decisions using the combined intent of the conversation, without requiring the operator to restate the full original criteria

### Requirement: Tag write-back requires explicit confirmation

The system SHALL NOT write tag changes to the Google Sheet until the operator has reviewed a preview of the pending changes and explicitly confirmed them.

#### Scenario: Preview shown before write

- **WHEN** the operator indicates the current tag decisions are ready to be committed
- **THEN** the system SHALL display a preview listing each row's row index, proposed tag value, and reason, before making any write request to the Google Sheets API

#### Scenario: Operator rejects the preview

- **WHEN** the operator declines the preview
- **THEN** the system SHALL NOT call the Google Sheets write API and SHALL return control to the operator for further criteria adjustment

### Requirement: Confirmed tags are written back to the sheet

Once confirmed, the system SHALL write each row's tag decision to the configured tag column in the Google Sheet.

#### Scenario: Confirmed tags persisted

- **WHEN** the operator confirms the preview
- **THEN** the system SHALL write the tag value for every previewed row to the sheet's tag column

#### Scenario: Partial write failure

- **WHEN** the write request for one row fails while others succeed
- **THEN** the system SHALL report which specific rows failed and why, and SHALL NOT treat the successfully written rows as failed
