## MODIFIED Requirements

### Requirement: Ticket status transition to DONE
A ticket's status SHALL only advance forward in the lifecycle: `TODO → IN_PROGRESS → IN_REVIEW → DONE`. Backward transitions are rejected. A `DONE` ticket cannot be updated at all. **Additionally**, a ticket SHALL NOT transition to `DONE` if any of its blocker tickets (referenced in `TicketDependency` where `blockedId = ticketId`) have a status other than `DONE`.

#### Scenario: Forward transition accepted (no blockers)
- **WHEN** `PATCH /tickets/:id` is called with the next valid status in the lifecycle and the ticket has no unresolved blockers
- **THEN** the system SHALL persist the new status and return `200 OK`

#### Scenario: Backward transition rejected
- **WHEN** `PATCH /tickets/:id` is called with a status that is earlier in the lifecycle than the current status
- **THEN** the system SHALL return `400 Bad Request`

#### Scenario: DONE transition blocked by unresolved blocker
- **WHEN** `PATCH /tickets/:id` is called with `{ "status": "DONE" }` and at least one blocker ticket has `status != DONE`
- **THEN** the system SHALL return `400 Bad Request` and leave the ticket status unchanged

#### Scenario: DONE transition accepted when all blockers resolved
- **WHEN** `PATCH /tickets/:id` is called with `{ "status": "DONE" }` and all blocker tickets have `status = DONE` (or there are no blockers)
- **THEN** the system SHALL persist `status = DONE` and return `200 OK`

#### Scenario: Update rejected on already-DONE ticket
- **WHEN** `PATCH /tickets/:id` is called on a ticket with `status = DONE`
- **THEN** the system SHALL return `400 Bad Request` regardless of the requested update
