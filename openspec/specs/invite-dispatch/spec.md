# invite-dispatch Specification

## Purpose

TBD - created by archiving change 'recruit-list-filtering-agent'. Update Purpose after archive.

## Requirements

### Requirement: Manual invite dispatch trigger

The system SHALL only send invitation emails when the operator explicitly triggers the invite-dispatch command; it SHALL NOT send invitations automatically as a side effect of filtering or Notion sync.

#### Scenario: Operator triggers invite dispatch

- **WHEN** the operator runs the invite-dispatch command
- **THEN** the system SHALL query Notion for every candidate whose status is "pending invitation" and send one invitation email to each

#### Scenario: No candidates pending invitation

- **WHEN** the operator runs the invite-dispatch command and no Notion entries have status "pending invitation"
- **THEN** the system SHALL report that there is nothing to send and SHALL NOT send any email

---
### Requirement: Invite email contains a booking link placeholder

Each invitation email SHALL include a link that uniquely identifies the candidate, built from a configurable base URL, so the link becomes valid once the booking page ships in a later change.

#### Scenario: Invite link built per candidate

- **WHEN** the system sends an invitation email to a candidate
- **THEN** the email body SHALL contain a link in the form `${BOOKING_BASE_URL}/book/{candidateId}` where `candidateId` uniquely identifies that candidate's Notion entry

---
### Requirement: Notion status updated after successful send

The system SHALL update a candidate's Notion status to reflect that the invitation was sent, only after the email send succeeds.

#### Scenario: Status updated on success

- **WHEN** an invitation email is successfully sent to a candidate
- **THEN** the system SHALL update that candidate's Notion status from "pending invitation" to "invited"

#### Scenario: Status unchanged on send failure

- **WHEN** sending the invitation email to a candidate fails
- **THEN** the system SHALL leave that candidate's Notion status as "pending invitation" and SHALL report the failure reason

---
### Requirement: Per-candidate failure isolation during dispatch

A failure sending one candidate's invitation SHALL NOT prevent invitations from being sent to other candidates in the same dispatch run.

#### Scenario: One failure does not block the batch

- **WHEN** sending an invitation to one candidate fails during a dispatch run covering multiple candidates
- **THEN** the system SHALL continue sending to the remaining candidates and SHALL report the failed candidate separately from the successful ones

---
### Requirement: Gmail authorization is established before first send

The system SHALL ensure a valid Gmail OAuth authorization exists before sending any invitation email, prompting a one-time consent flow if none exists.

#### Scenario: No prior authorization

- **WHEN** the operator triggers invite dispatch and no valid Gmail OAuth token is stored locally
- **THEN** the system SHALL initiate the OAuth consent flow and SHALL NOT attempt to send any email until authorization succeeds
