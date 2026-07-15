## ADDED Requirements

### Requirement: Calendar-based date and time selection

The system SHALL present available slots to the candidate through a calendar in which only dates having at least one available slot are selectable. The system SHALL NOT display any time-slot options until the candidate selects a selectable date on the calendar.

#### Scenario: Dates without any available slot are not selectable

- **WHEN** the candidate views the calendar and a given date has zero available slots
- **THEN** the system SHALL render that date as not selectable and SHALL NOT allow the candidate to choose it

#### Scenario: Selecting a date reveals that date's available slots ordered by time

- **WHEN** the candidate selects a selectable date on the calendar
- **THEN** the system SHALL display every available slot for that date, ordered from earliest to latest start time, and SHALL NOT display slots belonging to any other date

##### Example: three dates with mixed availability

| Date | Available Slots            | Calendar State  |
| ---- | --------------------------- | ---------------- |
| 7/16 | 10:00, 14:00, 16:00          | selectable        |
| 7/17 | (none)                       | not selectable    |
| 7/18 | 10:00, 11:00, 13:00, 15:00, 18:00 | selectable   |

- **GIVEN** the availability above
- **WHEN** the candidate selects 7/18 on the calendar
- **THEN** the system displays exactly the five 7/18 slots in the order 10:00, 11:00, 13:00, 15:00, 18:00, and displays no slots from 7/16

#### Scenario: No time slots are shown before a date is selected

- **WHEN** the candidate opens the booking page and has not yet selected any date on the calendar
- **THEN** the system SHALL NOT display any time-slot options

#### Scenario: Selecting a different date clears the previously selected slot

- **WHEN** the candidate has already selected a time slot for one date and then selects a different date on the calendar
- **THEN** the system SHALL clear the previously selected slot so that no slot remains selected until the candidate chooses a slot on the newly selected date

#### Scenario: No dates have any available slot

- **WHEN** the candidate opens the booking page and every date in the availability window has zero available slots
- **THEN** the system SHALL render the entire calendar as not selectable and SHALL display a message directing the candidate to contact the recruiter
