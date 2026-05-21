## ADDED Requirements

### Requirement: Add blocker dependency between tickets
The system SHALL allow an authenticated user to declare that one ticket blocks another by sending `POST /tickets/:id/dependencies` with `{ "blockerId": <uuid> }`. The `:id` parameter identifies the blocked ticket; `blockerId` is the ticket that must be resolved first.

#### Scenario: Successful dependency creation
- **WHEN** a valid authenticated request is made to `POST /tickets/:id/dependencies` with a `blockerId` that exists, belongs to the same project as `:id`, and does not create a cycle
- **THEN** the system SHALL persist a `TicketDependency` row with `(blockerId, blockedId = :id)`, return `200 OK` with the created dependency, and append an AuditLog entry with `action = ADD_DEPENDENCY`, `entityType = TICKET`, `entityId = :id`, `actor = USER`

#### Scenario: Blocker ticket does not exist
- **WHEN** `blockerId` references a ticket ID that does not exist
- **THEN** the system SHALL return `404 Not Found`

#### Scenario: Cross-project dependency rejected
- **WHEN** `blockerId` and `:id` belong to different projects
- **THEN** the system SHALL return `400 Bad Request` with an error indicating cross-project dependencies are not allowed

#### Scenario: Self-blocking rejected
- **WHEN** `blockerId` equals `:id`
- **THEN** the system SHALL return `400 Bad Request`

#### Scenario: Duplicate dependency rejected
- **WHEN** a `TicketDependency` row with the same `(blockerId, blockedId)` pair already exists
- **THEN** the system SHALL return `409 Conflict`

---

### Requirement: Circular dependency prevention
The system SHALL reject any new dependency edge that would introduce a cycle in the blocker graph. A cycle exists if following the chain of blockers from `blockerId` eventually reaches `blockedId`.

#### Scenario: Direct cycle rejected
- **WHEN** ticket A already blocks ticket B, and a request is made to add B as a blocker of A
- **THEN** the system SHALL return `400 Bad Request` with an error message indicating a circular dependency was detected

#### Scenario: Transitive cycle rejected
- **WHEN** A blocks B and B blocks C, and a request is made to add C as a blocker of A
- **THEN** the system SHALL return `400 Bad Request` with an error message indicating a circular dependency was detected

#### Scenario: Non-circular dependency accepted
- **WHEN** adding an edge that does not create any cycle in the blocker graph
- **THEN** the system SHALL persist the dependency and return `200 OK`

---

### Requirement: Remove blocker dependency between tickets
The system SHALL allow an authenticated user to remove an existing blocker relationship via `DELETE /tickets/:id/dependencies/:blockerId`. `:id` is the blocked ticket; `:blockerId` is the blocker being removed.

#### Scenario: Successful dependency removal
- **WHEN** a valid authenticated request is made and the `(blockerId, blockedId = :id)` row exists
- **THEN** the system SHALL delete the row, return `200 OK`, and append an AuditLog entry with `action = REMOVE_DEPENDENCY`, `entityType = TICKET`, `entityId = :id`, `actor = USER`

#### Scenario: Non-existent dependency removal
- **WHEN** no `TicketDependency` row matches `(blockerId, blockedId = :id)`
- **THEN** the system SHALL return `404 Not Found`
