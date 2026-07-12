# slot-availability Specification

## Purpose

TBD - created by archiving change 'interview-booking-scheduler'. Update Purpose after archive.

## Requirements

### Requirement: Available slots follow a fixed daily grid

The system SHALL generate candidate slots using a fixed one-hour grid spanning 10:00 to 20:00 every day of the week, before excluding any busy time from the interviewer's Google Calendar.

#### Scenario: Full day generates ten one-hour slots

- **WHEN** the system generates the slot grid for a single day with no existing calendar events
- **THEN** the system SHALL produce exactly ten one-hour slots for that day, starting at 10:00 and ending at 20:00

##### Example: Empty calendar day

| Slot Start | Slot End |
| ---------- | -------- |
| 10:00      | 11:00    |
| 11:00      | 12:00    |
| 12:00      | 13:00    |
| 13:00      | 14:00    |
| 14:00      | 15:00    |
| 15:00      | 16:00    |
| 16:00      | 17:00    |
| 17:00      | 18:00    |
| 18:00      | 19:00    |
| 19:00      | 20:00    |

---
### Requirement: Busy calendar time is excluded from available slots

The system SHALL exclude any grid slot that overlaps with a busy period on the interviewer's Google Calendar from the list of available slots shown to the candidate.

#### Scenario: A busy event removes its overlapping slot

- **WHEN** the interviewer's Google Calendar has an event from 14:00 to 15:00 on a given day
- **THEN** the system SHALL NOT include the 14:00–15:00 slot in the list of available slots for that day, while all other grid slots for that day remain available

##### Example: One busy event on an otherwise open day

- **GIVEN** the fixed grid for the day is the ten slots from 10:00 to 20:00
- **AND** the interviewer's calendar has a busy event from 14:00 to 15:00
- **WHEN** the system computes available slots for that day
- **THEN** the returned list SHALL contain nine slots, omitting only 14:00–15:00

---
### Requirement: Availability is limited to a 14-day lookahead window

The system SHALL only compute and display slots for the 14 days following the moment the candidate opens the booking page; the system SHALL NOT show slots beyond that window.

#### Scenario: Slots beyond the window are not shown

- **WHEN** a candidate opens the booking page today
- **THEN** the system SHALL only return slots dated from today through 14 days from today, and SHALL NOT return any slot dated 15 or more days from today

---
### Requirement: Calendar access failure is surfaced clearly

When the interviewer's Google Calendar has not been shared with the configured service account, the system SHALL fail with an error that distinguishes this authorization failure from other errors.

#### Scenario: Calendar not shared with the service account

- **WHEN** the system attempts to read free/busy data for a Calendar that has not been shared with the service account
- **THEN** the system SHALL return an error indicating the calendar is not accessible, distinct from a generic server error
