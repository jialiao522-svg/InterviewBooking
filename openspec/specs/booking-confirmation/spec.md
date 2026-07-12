# booking-confirmation Specification

## Purpose

TBD - created by archiving change 'interview-booking-scheduler'. Update Purpose after archive.

## Requirements

### Requirement: Finalized booking creates a Google Calendar event with the candidate as attendee

Once a submitted slot is finalized, the system SHALL create a Google Calendar event for that slot on the interviewer's calendar with the candidate's email added as an attendee.

#### Scenario: Calendar event created on successful booking

- **WHEN** a candidate's slot submission is finalized
- **THEN** the system SHALL create a Google Calendar event spanning the booked slot, with the candidate's email included as an attendee

---
### Requirement: Finalized booking updates Notion status and booked time

Once a submitted slot is finalized, the system SHALL update the candidate's Notion page status to "booked" and SHALL record the booked slot's start and end time on that page.

#### Scenario: Notion updated on successful booking

- **WHEN** a candidate's slot submission is finalized
- **THEN** the system SHALL update that candidate's Notion page status to "booked" and SHALL write the booked slot's start and end time to the page

---
### Requirement: Confirmation email contains interview preparation content

The system SHALL send a custom confirmation email to the candidate containing interview preparation information and the in-person location; when the candidate has indicated a need for a remote option, the email SHALL note that remote arrangements will be coordinated separately.

#### Scenario: Standard in-person confirmation email

- **WHEN** the system sends a confirmation email for a finalized booking
- **THEN** the email SHALL include interview preparation information and the in-person interview location

#### Scenario: Candidate has indicated a remote need

- **WHEN** the system sends a confirmation email for a finalized booking where the candidate has indicated a need for a remote option
- **THEN** the email SHALL additionally state that remote meeting arrangements will be coordinated separately

---
### Requirement: Confirmation email failure does not roll back the booking

If sending the confirmation email fails, the system SHALL still treat the booking as finalized (calendar event created and Notion updated), and SHALL record the email failure separately rather than reverting the booking.

#### Scenario: Email send fails after calendar and Notion succeed

- **WHEN** the Google Calendar event has been created and the Notion status has been updated for a booking, but sending the confirmation email fails
- **THEN** the system SHALL leave the calendar event and Notion status unchanged and SHALL record the email failure for later review, without deleting the calendar event or reverting the Notion status
