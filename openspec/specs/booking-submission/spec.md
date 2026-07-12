# booking-submission Specification

## Purpose

TBD - created by archiving change 'interview-booking-scheduler'. Update Purpose after archive.

## Requirements

### Requirement: Invalid candidate link is rejected

The system SHALL reject a booking page request whose `candidateId` does not correspond to an existing Notion entry.

#### Scenario: Unknown candidateId

- **WHEN** a request is made to the booking page with a `candidateId` that has no matching Notion page
- **THEN** the system SHALL respond with a not-found result and SHALL NOT attempt to read calendar availability

---
### Requirement: Existing booking is shown as read-only on repeat visits

When a candidate's Notion status is already "booked", the system SHALL display that candidate's existing booked time instead of the slot-selection flow, and SHALL NOT allow a second booking to be created for that candidate.

#### Scenario: Already-booked candidate revisits the link

- **WHEN** a candidate whose Notion status is "booked" opens their booking link again
- **THEN** the system SHALL display the previously booked time as read-only and SHALL NOT present the slot-selection interface or accept a new submission for that candidate

---
### Requirement: Slot submission is re-validated against live calendar data before finalizing

The system SHALL re-check the interviewer's Google Calendar for the submitted slot immediately before creating a booking, and SHALL only finalize the booking if the slot is still free at that moment.

#### Scenario: Slot still available at submission time

- **WHEN** a candidate submits a slot that remains free on the interviewer's Google Calendar at the moment of submission
- **THEN** the system SHALL proceed to finalize the booking for that slot

#### Scenario: Slot conflict detected at submission time

- **WHEN** a candidate submits a slot that has become busy on the interviewer's Google Calendar between page load and submission
- **THEN** the system SHALL reject the submission with a conflict result, SHALL NOT create any calendar event or Notion update for that submission, and SHALL return an updated list of available slots

##### Example: Two candidates racing for the same slot

- **GIVEN** candidate A and candidate B both view the 14:00–15:00 slot as available
- **WHEN** candidate A submits the 14:00–15:00 slot first and it is finalized
- **AND** candidate B then submits the same 14:00–15:00 slot
- **THEN** candidate A's submission SHALL succeed and candidate B's submission SHALL be rejected with a conflict result
