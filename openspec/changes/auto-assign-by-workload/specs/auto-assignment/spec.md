## ADDED Requirements

### Requirement: Auto-assign least-loaded DEVELOPER on ticket creation
When a ticket is created via `POST /tickets` without an `assigneeId`, the system SHALL automatically select from **all DEVELOPER-role users system-wide** the one with the fewest non-DONE tickets assigned to them within that project. A DEVELOPER with no tickets in the project has a workload of `0` and is a valid candidate. Ties SHALL be broken by the user's `createdAt` timestamp (earliest first). The selected user's `id` SHALL be set as the ticket's `assigneeId`. Only users with `role = DEVELOPER` are candidates; ADMIN users MUST be excluded. Auto-assignment MUST NOT be triggered on ticket update (`PATCH /tickets/:id`).

#### Scenario: Single DEVELOPER in project
- **WHEN** a ticket is created in a project with exactly one DEVELOPER who has existing tickets
- **THEN** that DEVELOPER is assigned as `assigneeId`

#### Scenario: Multiple DEVELOPERs, unequal workload
- **WHEN** a ticket is created in a project with multiple DEVELOPER users having different non-DONE ticket counts
- **THEN** the DEVELOPER with the lowest non-DONE ticket count is assigned

#### Scenario: Tie-breaking by createdAt
- **WHEN** two or more DEVELOPERs have the same non-DONE ticket count in the project
- **THEN** the DEVELOPER with the earliest `createdAt` (oldest account) is assigned

#### Scenario: No DEVELOPERs in system
- **WHEN** a ticket is created and there are no DEVELOPER-role users in the system at all
- **THEN** the ticket is created with `assigneeId = null` and no error is raised

#### Scenario: DEVELOPER with zero tickets in project is a valid candidate
- **WHEN** a ticket is created in a project and a DEVELOPER exists system-wide but has no tickets in that project
- **THEN** that DEVELOPER is a candidate with workload `0` and can be auto-assigned

#### Scenario: Explicit assigneeId provided
- **WHEN** a ticket is created with an explicit `assigneeId`
- **THEN** auto-assignment logic is skipped entirely and the provided `assigneeId` is used

#### Scenario: PATCH override
- **WHEN** `PATCH /tickets/:id` is called with an `assigneeId` field
- **THEN** the new `assigneeId` is applied directly and auto-assignment is not triggered

### Requirement: Audit log entry for auto-assignment
Every time the system automatically assigns a ticket to a DEVELOPER, it SHALL record an entry in the Audit Log with `actor = SYSTEM`, `action = AUTO_ASSIGN`, `entityType = ticket`, `entityId = <ticketId>`, and `performedBy = SYSTEM`.

#### Scenario: Auto-assignment audit log created
- **WHEN** a ticket is auto-assigned to a DEVELOPER during creation
- **THEN** an audit log entry with `action = AUTO_ASSIGN`, `actor = SYSTEM`, and the correct `entityId` exists

#### Scenario: No audit log when assigneeId is explicit
- **WHEN** a ticket is created with an explicit `assigneeId`
- **THEN** no `AUTO_ASSIGN` audit log entry is created for that ticket
