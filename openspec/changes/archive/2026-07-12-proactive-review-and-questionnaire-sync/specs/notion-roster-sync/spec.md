## ADDED Requirements

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
