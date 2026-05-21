## ADDED Requirements

### Requirement: Block DONE transition when unresolved blockers exist
The system SHALL prevent a ticket from transitioning to status `DONE` if it has one or more blocker tickets whose status is not `DONE`.

#### Scenario: Transition to DONE rejected with active blocker
- **WHEN** `PATCH /tickets/:id` is called with `{ "status": "DONE" }` and at least one row in `TicketDependency` has `blockedId = :id` with the corresponding blocker ticket's `status != DONE`
- **THEN** the system SHALL return `400 Bad Request` with an error identifying the unresolved blocker(s), and the ticket's status SHALL remain unchanged

#### Scenario: Transition to DONE allowed when all blockers are DONE
- **WHEN** `PATCH /tickets/:id` is called with `{ "status": "DONE" }` and all rows in `TicketDependency` with `blockedId = :id` have corresponding blocker tickets with `status = DONE`
- **THEN** the system SHALL allow the transition and persist `status = DONE`

#### Scenario: Transition to DONE allowed when no blockers exist
- **WHEN** `PATCH /tickets/:id` is called with `{ "status": "DONE" }` and no `TicketDependency` rows exist with `blockedId = :id`
- **THEN** the system SHALL allow the transition with no blocker-related error

#### Scenario: Blocker guard does not apply to non-DONE transitions
- **WHEN** `PATCH /tickets/:id` is called with a status other than `DONE` (e.g., `IN_PROGRESS`, `IN_REVIEW`)
- **THEN** the system SHALL NOT check for unresolved blockers; only the existing forward-only lifecycle rule applies
