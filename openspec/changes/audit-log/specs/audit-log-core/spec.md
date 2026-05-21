## ADDED Requirements

### Requirement: Append-only audit log entity
The system SHALL maintain an `audit_logs` table with columns: `id` (UUID), `action` (string), `entityType` (string), `entityId` (string), `performedBy` (string — userId or "SYSTEM"), `actor` (enum: USER | SYSTEM), `timestamp` (datetime, auto-set on insert). The table SHALL have no update or delete operations exposed.

#### Scenario: Entry is created on a state-changing action
- **WHEN** any service calls `AuditLogService.record()` with valid parameters
- **THEN** a new row is inserted into `audit_logs` with the provided fields and `timestamp` set to the current UTC time

#### Scenario: No modification of existing entries
- **WHEN** any code attempts to update or delete an audit log entry
- **THEN** no such operation exists — the service exposes only `record()` (insert)

### Requirement: AuditLogService.record() contract
`AuditLogService` SHALL expose a single async method `record({ action, entityType, entityId, performedBy, actor })` that inserts one row into `audit_logs`. It MUST NOT throw on success; failures SHALL be logged but not rethrow (fire-and-best-effort to avoid blocking domain operations).

#### Scenario: Successful record
- **WHEN** `record()` is called with all required fields
- **THEN** the entry is persisted and the method resolves without error

#### Scenario: Missing field
- **WHEN** `record()` is called with a missing required field
- **THEN** a TypeORM/validation error is thrown before insert

### Requirement: USER-actor entries for domain mutations
Every state-changing REST operation (create, update, delete, restore) on Users, Projects, Tickets, Comments, Attachments, and Dependencies SHALL produce an audit log entry with `actor = USER` and `performedBy` set to the authenticated user's ID.

#### Scenario: Ticket created by a user
- **WHEN** `POST /tickets` succeeds
- **THEN** an audit log entry is written with `action = "CREATE"`, `entityType = "Ticket"`, `entityId` = new ticket ID, `actor = USER`, `performedBy` = requesting user ID

#### Scenario: Ticket deleted by a user
- **WHEN** `DELETE /tickets/:id` succeeds (soft-delete)
- **THEN** an audit log entry is written with `action = "DELETE"`, `entityType = "Ticket"`, `actor = USER`

### Requirement: SYSTEM-actor entry for auto-assignment
When the auto-assignment logic assigns a ticket to a developer on creation, the system SHALL record an additional audit entry with `actor = SYSTEM`, `performedBy = "SYSTEM"`, `action = "AUTO_ASSIGN"`, `entityType = "Ticket"`, `entityId` = the ticket ID.

#### Scenario: Auto-assignment fires on ticket creation
- **WHEN** a ticket is created without an explicit `assigneeId` and a DEVELOPER is available
- **THEN** an audit log entry with `action = "AUTO_ASSIGN"` and `actor = SYSTEM` is written after the assignment

#### Scenario: No developers available
- **WHEN** a ticket is created without an `assigneeId` and no DEVELOPERs exist in the project
- **THEN** no AUTO_ASSIGN audit entry is written (assigneeId remains null)

### Requirement: SYSTEM-actor entry for auto-escalation
When the scheduled escalation job promotes a ticket's priority or sets `isOverdue = true`, it SHALL record an audit entry with `actor = SYSTEM`, `performedBy = "SYSTEM"`, `action = "ESCALATE"`, `entityType = "Ticket"`, `entityId` = the affected ticket ID.

#### Scenario: Escalation promotes priority
- **WHEN** the scheduler detects an overdue ticket with priority below CRITICAL and promotes it
- **THEN** an audit log entry with `action = "ESCALATE"` and `actor = SYSTEM` is written for that ticket

#### Scenario: Escalation sets isOverdue
- **WHEN** a ticket is already CRITICAL and still overdue
- **THEN** an audit log entry with `action = "ESCALATE"` and `actor = SYSTEM` is written when `isOverdue` is set to true
