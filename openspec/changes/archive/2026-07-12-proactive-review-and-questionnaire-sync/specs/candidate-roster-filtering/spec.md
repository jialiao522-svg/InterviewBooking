## MODIFIED Requirements

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
